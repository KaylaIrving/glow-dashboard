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
  if (!url || !key) throw new Error('SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function confirmWixBooking(wixBookingId) {
  const apiKey = process.env.WIX_API_KEY
  const siteId = process.env.WIX_SITE_ID
  if (!apiKey || !siteId) throw new Error('WIX_API_KEY and WIX_SITE_ID must be configured in Vercel.')

  const response = await fetch(`https://www.wixapis.com/_api/bookings-service/v2/bookings/${encodeURIComponent(wixBookingId)}/confirm`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Wix-Site-Id': siteId,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  })
  const text = await response.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { raw: text }
  }
  if (!response.ok) {
    throw new Error(data.message || data.error || data.raw || `Wix booking confirm returned ${response.status}`)
  }
  return data
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })

  const body = getBody(req)
  const bookingId = body.booking_id || body.bookingId
  if (!bookingId) return sendJson(res, 400, { error: 'booking_id is required.' })

  try {
    const supabase = createSupabase()
    const { data: booking, error: loadError } = await supabase
      .from('Bookings')
      .select('id,booking_source,source,wix_booking_id,approval_status,booking_type')
      .eq('id', bookingId)
      .maybeSingle()
    if (loadError) throw loadError
    if (!booking) throw new Error('Booking was not found.')
    if (!booking.wix_booking_id || !['wix'].includes(String(booking.booking_source || booking.source || '').toLowerCase())) {
      return sendJson(res, 200, { ok: true, skipped: true, message: 'Only Wix-sourced bookings need Wix status updates.' })
    }
    if (!['spraytan', 'patch_test'].includes(String(booking.booking_type || '').toLowerCase())) {
      return sendJson(res, 200, { ok: true, skipped: true, message: 'Only Wix spray tan bookings use Glow approval sync.' })
    }
    if (String(booking.approval_status || '').toLowerCase() !== 'approved') {
      return sendJson(res, 200, { ok: true, skipped: true, message: 'Booking is not approved in Glow.' })
    }

    await supabase.from('Bookings').update({
      wix_sync_status: 'pending',
      wix_sync_error: null,
      last_wix_sync_at: new Date().toISOString()
    }).eq('id', booking.id)

    const result = await confirmWixBooking(booking.wix_booking_id)

    await supabase.from('Bookings').update({
      wix_status: 'CONFIRMED',
      wix_sync_status: 'synced',
      wix_sync_error: null,
      last_wix_sync_at: new Date().toISOString()
    }).eq('id', booking.id)

    return sendJson(res, 200, { ok: true, bookingId: booking.id, wixBookingId: booking.wix_booking_id, result })
  } catch (error) {
    console.error('Wix booking status sync failed:', error)
    return sendJson(res, 500, { ok: false, error: error.message || 'Wix booking status sync failed.' })
  }
}
