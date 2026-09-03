import { ok, badRequest, forbidden, serverError } from 'wix-http-functions'
import { getSecret } from 'wix-secrets-backend'
import { handleGlowAvailabilityBlock, diagnoseGlowBookingResources } from 'backend/availabilityBlocks.js'

function jsonResponse(factory, body) {
  return factory({
    headers: { 'Content-Type': 'application/json' },
    body
  })
}

async function readJsonBody(request) {
  try {
    return await request.body.json()
  } catch (error) {
    return null
  }
}

function getBearerToken(request) {
  const header = request.headers?.authorization || request.headers?.Authorization || ''
  const match = String(header).match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : ''
}

async function verifySharedSecret(request) {
  const expectedSecret = await getSecret('GLOW_WIX_BLOCK_SECRET')
  const receivedSecret = getBearerToken(request)
  return Boolean(expectedSecret && receivedSecret && expectedSecret === receivedSecret)
}

export async function post_glowAvailabilityBlock(request) {
  const body = await readJsonBody(request)
  if (!body) {
    return jsonResponse(badRequest, { ok: false, error: 'Invalid or missing JSON body.' })
  }

  try {
    const authorised = await verifySharedSecret(request)
    if (!authorised) {
      return jsonResponse(forbidden, { ok: false, error: 'Unauthorised Glow availability request.' })
    }

    const result = await handleGlowAvailabilityBlock(body)
    return jsonResponse(ok, result)
  } catch (error) {
    console.error('Glow availability block failed:', {
      action: body?.action,
      bookingId: body?.bookingId,
      room: body?.room,
      start: body?.start,
      end: body?.end,
      error: error?.message || String(error)
    })
    return jsonResponse(serverError, {
      ok: false,
      error: error?.message || 'Glow availability block failed.'
    })
  }
}


export async function get_glowBookingResourcesDiagnostic(request) {
  try {
    const authorised = await verifySharedSecret(request)
    if (!authorised) {
      return jsonResponse(forbidden, { ok: false, error: 'Unauthorised Glow resource diagnostic request.' })
    }

    const result = await diagnoseGlowBookingResources()
    return jsonResponse(ok, result)
  } catch (error) {
    console.error('Glow booking resource diagnostic failed:', {
      error: error?.message || String(error)
    })
    return jsonResponse(serverError, {
      ok: false,
      error: error?.message || 'Glow booking resource diagnostic failed.'
    })
  }
}
