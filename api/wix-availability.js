import { createClient } from '@supabase/supabase-js'

function sendJson(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function getBody(req) {
  if (!req.body) return {}
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body) } catch { return {} }
  }
  return req.body
}

function createSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Wix availability sync.')
  return createClient(url, key, { auth: { persistSession: false } })
}

function getBookingSource(booking) {
  return String(booking?.booking_source || booking?.source || '').toLowerCase()
}

function getBookingStart(booking) {
  return booking?.booking_start || booking?.appointment_time || null
}

function addMinutes(iso, minutes) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return new Date(date.getTime() + Number(minutes || 0) * 60000).toISOString()
}

function getBlockedDurationMinutes(booking) {
  const type = String(booking?.booking_type || 'sunbed').toLowerCase()
  if (type === 'patch_test') return 10
  if (type === 'spraytan' || type === 'express_tan') return Number(booking?.spraytan_duration_minutes || 30)
  const explicitDuration = Number(booking?.blocked_minutes || booking?.total_blocked_minutes || 0)
  if (explicitDuration > 0) return explicitDuration
  if (booking?.booking_start && booking?.booking_end) {
    const start = new Date(booking.booking_start)
    const end = new Date(booking.booking_end)
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start) {
      return Math.ceil((end - start) / 60000)
    }
  }
  const tanningMinutes = Number(booking?.minutes || 0) || 20
  return tanningMinutes + 6
}

function buildWixBlockPayload(booking, action) {
  const start = getBookingStart(booking)
  const duration = getBlockedDurationMinutes(booking)
  const end = booking.booking_end || addMinutes(start, duration)
  const bookingType = String(booking.booking_type || 'sunbed').toLowerCase()
  const serviceName = booking.spraytan_service || booking.wix_service_name || null
  if (!start || !end) throw new Error('Booking needs a start and end time before it can block Wix availability.')
  return {
    action,
    existingBlockId: booking.wix_block_id || null,
    bookingId: booking.id,
    source: 'glow-dashboard',
    start,
    end,
    durationMinutes: duration,
    title: bookingType === 'sunbed'
      ? `Glow Sunbed Room ${booking.bed_id}`
      : `Glow ${serviceName || bookingType || 'Appointment'}`,
    bookingType,
    serviceName,
    status: booking.status || booking.approval_status || null,
    room: booking.bed_id || null,
    artistId: booking.assigned_artist_id || null,
    artistName: booking.assigned_artist_name || booking.spraytan_artist || null,
    customerName: booking.customer_name || booking.wix_customer_name || null,
    notes: `Glow booking ${booking.id}`
  }
}

async function callWixAvailability(payload) {
  const endpoint = process.env.WIX_AVAILABILITY_BLOCK_ENDPOINT
  const sharedSecret = process.env.GLOW_WIX_BLOCK_SECRET
  const siteId = process.env.WIX_SITE_ID
  if (!endpoint) {
    return { skipped: true, message: 'WIX_AVAILABILITY_BLOCK_ENDPOINT is not configured yet. Block left pending.' }
  }
  if (!sharedSecret) {
    return { skipped: true, message: 'GLOW_WIX_BLOCK_SECRET is not configured yet. Block left pending.' }
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sharedSecret}`,
      'wix-site-id': siteId || ''
    },
    body: JSON.stringify(payload)
  })
  const text = await response.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch (error) {
    data = { raw: text }
  }
  if (!response.ok) {
    const message = data.message || data.error || data.raw || `Wix availability endpoint returned ${response.status}`
    throw new Error(message)
  }
  return data
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })
  const body = getBody(req)
  const bookingId = body.booking_id || body.bookingId
  const action = body.action || 'upsert'
  const bookingSnapshot = body.booking_snapshot && typeof body.booking_snapshot === 'object'
    ? body.booking_snapshot
    : null
  if (!bookingId) return sendJson(res, 400, { error: 'booking_id is required.' })

  try {
    const supabase = createSupabase()
    const { data: storedBooking, error: loadError } = await supabase
      .from('Bookings')
      .select('*')
      .eq('id', bookingId)
      .maybeSingle()
    if (loadError) throw loadError

    // Deleted dashboard bookings are synced from a snapshot so their Wix block can still be removed.
    const booking = storedBooking || bookingSnapshot
    if (!booking) throw new Error('Booking was not found and no booking snapshot was supplied.')
    if (getBookingSource(booking) === 'wix') {
      return sendJson(res, 200, { ok: true, skipped: true, message: 'Wix-sourced bookings are never pushed back to Wix.' })
    }

    const payload = buildWixBlockPayload(booking, action)
    const updateSyncState = async (changes) => {
      if (!storedBooking) return
      const { error } = await supabase.from('Bookings').update(changes).eq('id', booking.id)
      if (error) console.warn('Wix availability status update failed:', { bookingId, changes, error })
    }

    await updateSyncState({
      synced_to_wix: false,
      wix_sync_status: 'pending',
      wix_sync_error: null,
      last_wix_sync_at: new Date().toISOString()
    })

    try {
      const result = await callWixAvailability(payload)
      if (result.skipped) {
        await updateSyncState({
          synced_to_wix: false,
          wix_sync_status: 'pending',
          wix_sync_error: result.message,
          last_wix_sync_at: new Date().toISOString()
        })
        return sendJson(res, 200, { ok: true, pending: true, message: result.message, payload })
      }

      if (result.ok !== true) {
        throw new Error(result.message || result.error || 'Wix availability endpoint did not confirm success.')
      }
      if (action === 'delete') {
        if (result.removed !== true && result.notFound !== true) {
          throw new Error(result.message || 'Wix availability endpoint did not confirm delete/remove success.')
        }
      } else if (!result.blockId && !result.id) {
        throw new Error('Wix availability endpoint did not return a real blockId for the created Wix calendar event.')
      }

      await updateSyncState({
        synced_to_wix: action === 'delete' ? false : true,
        wix_block_id: action === 'delete' ? null : result.blockId || result.id,
        wix_sync_status: action === 'delete' ? 'removed' : 'synced',
        wix_sync_error: null,
        last_wix_sync_at: new Date().toISOString()
      })
      return sendJson(res, 200, { ok: true, action, bookingId, result })
    } catch (syncError) {
      await updateSyncState({
        synced_to_wix: false,
        wix_sync_status: 'failed',
        wix_sync_error: syncError.message,
        last_wix_sync_at: new Date().toISOString()
      })
      return sendJson(res, 500, { ok: false, error: syncError.message, payload })
    }
  } catch (error) {
    console.error('Wix availability sync failed:', error)
    return sendJson(res, 500, { ok: false, error: error.message || 'Wix availability sync failed.' })
  }
}
