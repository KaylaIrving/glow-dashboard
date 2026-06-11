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
  const sessionMinutes = Number(booking?.blocked_minutes || booking?.total_blocked_minutes || 0)
  if (sessionMinutes > 0) return sessionMinutes
  const tanningMinutes = Number(booking?.minutes || 0) || 20
  return tanningMinutes + 6
}

function buildWixBlockPayload(booking, action) {
  const start = getBookingStart(booking)
  const duration = getBlockedDurationMinutes(booking)
  return {
    action,
    existingBlockId: booking.wix_block_id || null,
    bookingId: booking.id,
    source: 'glow-dashboard',
    start,
    end: booking.booking_end || addMinutes(start, duration),
    durationMinutes: duration,
    title: booking.booking_type === 'sunbed'
      ? `Glow Sunbed Room ${booking.bed_id}`
      : `Glow ${booking.spraytan_service || booking.booking_type || 'Appointment'}`,
    bookingType: booking.booking_type || 'sunbed',
    room: booking.bed_id || null,
    customerName: booking.customer_name || booking.wix_customer_name || null,
    notes: `Glow booking ${booking.id}`
  }
}

async function callWixAvailability(payload) {
  const endpoint = process.env.WIX_AVAILABILITY_BLOCK_ENDPOINT
  const apiKey = process.env.WIX_API_KEY
  const siteId = process.env.WIX_SITE_ID
  if (!endpoint) {
    return { skipped: true, message: 'WIX_AVAILABILITY_BLOCK_ENDPOINT is not configured yet. Block left pending.' }
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
      'wix-site-id': siteId || ''
    },
    body: JSON.stringify(payload)
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : {}
  if (!response.ok) throw new Error(data.message || data.error || `Wix availability endpoint returned ${response.status}`)
  return data
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })
  const body = getBody(req)
  const bookingId = body.booking_id || body.bookingId
  const action = body.action || 'upsert'
  if (!bookingId) return sendJson(res, 400, { error: 'booking_id is required.' })

  try {
    const supabase = createSupabase()
    const { data: booking, error: loadError } = await supabase.from('Bookings').select('*').eq('id', bookingId).single()
    if (loadError) throw loadError
    if (getBookingSource(booking) === 'wix') {
      return sendJson(res, 200, { ok: true, skipped: true, message: 'Wix-sourced bookings are never pushed back to Wix.' })
    }

    const payload = buildWixBlockPayload(booking, action)
    await supabase.from('Bookings').update({ wix_sync_status: 'pending', wix_sync_error: null, last_wix_sync_at: new Date().toISOString() }).eq('id', booking.id)

    try {
      const result = await callWixAvailability(payload)
      if (result.skipped) {
        await supabase.from('Bookings').update({ synced_to_wix: false, wix_sync_status: 'pending', wix_sync_error: result.message, last_wix_sync_at: new Date().toISOString() }).eq('id', booking.id)
        return sendJson(res, 200, { ok: true, pending: true, message: result.message, payload })
      }
      await supabase.from('Bookings').update({
        synced_to_wix: action === 'delete' ? false : true,
        wix_block_id: result.blockId || result.id || booking.wix_block_id || null,
        wix_sync_status: action === 'delete' ? 'removed' : 'synced',
        wix_sync_error: null,
        last_wix_sync_at: new Date().toISOString()
      }).eq('id', booking.id)
      return sendJson(res, 200, { ok: true, result })
    } catch (syncError) {
      await supabase.from('Bookings').update({ synced_to_wix: false, wix_sync_status: 'failed', wix_sync_error: syncError.message, last_wix_sync_at: new Date().toISOString() }).eq('id', booking.id)
      return sendJson(res, 500, { ok: false, error: syncError.message, payload })
    }
  } catch (error) {
    console.error('Wix availability sync failed:', error)
    return sendJson(res, 500, { ok: false, error: error.message || 'Wix availability sync failed.' })
  }
}
