import wixData from 'wix-data'
import { getSecret } from 'wix-secrets-backend'
import { elevate } from 'wix-auth'
import { resources } from '@wix/bookings'
import { events, schedules } from '@wix/calendar'
import { sessions } from 'wix-bookings-backend'

const COLLECTION = 'GlowAvailabilityBlocks'
const TIME_ZONE = 'Europe/London'
const BOOKING_APP_ID = '13d21c63-b5ec-5912-8397-c3a5ddb27a97'

const elevatedCreateEvent = elevate(events.createEvent)
const elevatedCancelEvent = elevate(events.cancelEvent)

function assertRequired(value, message) {
  if (value === undefined || value === null || value === '') throw new Error(message)
}

function normaliseAction(action) {
  const value = String(action || 'upsert').trim().toLowerCase()
  if (value === 'delete' || value === 'remove' || value === 'cancel') return 'delete'
  return 'upsert'
}

function normaliseBookingType(payload) {
  return String(payload.bookingType || payload.booking_type || 'sunbed').trim().toLowerCase()
}

function safeSecretNamePart(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

async function getOptionalSecret(name) {
  try {
    return await getSecret(name)
  } catch (error) {
    return ''
  }
}

function toLondonLocalDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date/time: ${value}`)

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value
    return acc
  }, {})

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.000`
}

async function resolveSunbedResource(payload) {
  const room = Number(payload.room || payload.bed_id || payload.bedId || 0)
  if (![1, 2, 3].includes(room)) {
    throw new Error(`No Wix resource mapping exists for Glow room ${payload.room || payload.bed_id || 'unknown'}.`)
  }

  const scheduleId = await getOptionalSecret(`GLOW_ROOM_${room}_SCHEDULE_ID`)
  const resourceId = await getOptionalSecret(`GLOW_ROOM_${room}_RESOURCE_ID`)
  if (!scheduleId) throw new Error(`Missing Wix secret GLOW_ROOM_${room}_SCHEDULE_ID.`)

  return {
    scheduleId,
    resourceId: resourceId || null,
    resourceLabel: room === 1 ? 'Tone & Tan Stand Up' : room === 2 ? 'Collagen Lay Down' : 'Prestige Lay Down'
  }
}

async function resolveSprayTanResource(payload) {
  const bookingType = normaliseBookingType(payload)
  const artistKey = safeSecretNamePart(payload.artistName || payload.assigned_artist_name || payload.artistId || '')
  const artistScheduleSecret = artistKey ? `WIX_ARTIST_${artistKey}_SCHEDULE_ID` : ''
  const artistResourceSecret = artistKey ? `WIX_ARTIST_${artistKey}_RESOURCE_ID` : ''

  const artistScheduleId = artistScheduleSecret ? await getOptionalSecret(artistScheduleSecret) : ''
  const artistResourceId = artistResourceSecret ? await getOptionalSecret(artistResourceSecret) : ''
  const patchScheduleId = await getOptionalSecret('WIX_PATCH_TEST_SCHEDULE_ID')
  const defaultScheduleId = await getOptionalSecret('WIX_SPRAYTAN_DEFAULT_SCHEDULE_ID')
  const patchResourceId = await getOptionalSecret('WIX_PATCH_TEST_RESOURCE_ID')
  const defaultResourceId = await getOptionalSecret('WIX_SPRAYTAN_DEFAULT_RESOURCE_ID')

  const scheduleId = artistScheduleId || (bookingType === 'patch_test' ? patchScheduleId : defaultScheduleId)
  const resourceId = artistResourceId || (bookingType === 'patch_test' ? patchResourceId : defaultResourceId) || null
  if (!scheduleId) {
    const missing = bookingType === 'patch_test'
      ? 'WIX_PATCH_TEST_SCHEDULE_ID or an artist schedule secret'
      : 'WIX_SPRAYTAN_DEFAULT_SCHEDULE_ID or an artist schedule secret'
    throw new Error(`Missing Wix spray tan resource mapping. Add ${missing}.`)
  }

  return {
    scheduleId,
    resourceId,
    resourceLabel: payload.artistName || payload.serviceName || bookingType
  }
}

async function resolveWixResource(payload) {
  const bookingType = normaliseBookingType(payload)
  if (bookingType === 'sunbed') return resolveSunbedResource(payload)
  if (bookingType === 'spraytan' || bookingType === 'express_tan' || bookingType === 'patch_test') return resolveSprayTanResource(payload)
  throw new Error(`Unsupported Glow booking type for Wix blocking: ${bookingType}`)
}

function buildEventPayload(payload, resolved) {
  const startLocalDate = toLondonLocalDate(payload.start)
  const endLocalDate = toLondonLocalDate(payload.end)
  const resources = resolved.resourceId ? [{ id: resolved.resourceId }] : undefined

  return {
    scheduleId: resolved.scheduleId,
    title: payload.title || `Glow block ${payload.bookingId || ''}`.trim(),
    start: { localDate: startLocalDate },
    end: { localDate: endLocalDate },
    timeZone: TIME_ZONE,
    type: 'DEFAULT',
    transparency: 'OPAQUE',
    resources,
    notes: [
      'Blocked by Glow Dashboard.',
      payload.bookingId ? `Glow booking ID: ${payload.bookingId}` : '',
      payload.customerName ? `Customer: ${payload.customerName}` : '',
      payload.serviceName ? `Service: ${payload.serviceName}` : '',
      payload.notes || ''
    ].filter(Boolean).join('\n'),
    extendedFields: {
      items: {
        glowBookingId: String(payload.bookingId || ''),
        glowSource: 'glow-dashboard',
        glowBookingType: normaliseBookingType(payload)
      }
    }
  }
}

function buildBlockedSessionPayload(payload, resolved) {
  const startDate = new Date(payload.start)
  const endDate = new Date(payload.end)
  if (Number.isNaN(startDate.getTime())) throw new Error(`Invalid start date/time: ${payload.start}`)
  if (Number.isNaN(endDate.getTime())) throw new Error(`Invalid end date/time: ${payload.end}`)

  return {
    scheduleId: resolved.scheduleId,
    start: { timestamp: startDate },
    end: { timestamp: endDate },
    type: 'EVENT',
    tags: ['Blocked'],
    title: payload.title || `Glow block ${payload.bookingId || ''}`.trim(),
    notes: [
      'Blocked by Glow Dashboard.',
      payload.bookingId ? `Glow booking ID: ${payload.bookingId}` : '',
      payload.customerName ? `Customer: ${payload.customerName}` : '',
      payload.serviceName ? `Service: ${payload.serviceName}` : '',
      resolved.resourceId ? `Wix resource ID: ${resolved.resourceId}` : '',
      payload.notes || ''
    ].filter(Boolean).join('\n')
  }
}

function getWixEventId(result) {
  return result?.event?.id || result?.id || result?._id || result?.eventId || ''
}

function isNotFoundError(error) {
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.code || ''}`.toLowerCase()
  return text.includes('not found') || text.includes('404') || text.includes('does not exist')
}

async function findStoredBlock(payload) {
  if (!payload.bookingId) return null
  const result = await wixData.query(COLLECTION)
    .eq('bookingId', String(payload.bookingId))
    .descending('updatedAt')
    .limit(1)
    .find({ suppressAuth: true })
  return result.items?.[0] || null
}

async function saveStoredBlock(payload, resolved, blockId, status) {
  const existing = await findStoredBlock(payload)
  const now = new Date()
  const record = {
    ...(existing || {}),
    bookingId: String(payload.bookingId || ''),
    blockId,
    scheduleId: resolved.scheduleId || existing?.scheduleId || '',
    resourceId: resolved.resourceId || existing?.resourceId || '',
    room: payload.room ? String(payload.room) : existing?.room || '',
    bookingType: normaliseBookingType(payload),
    serviceName: payload.serviceName || existing?.serviceName || '',
    title: payload.title || existing?.title || '',
    status,
    payload: JSON.stringify(payload),
    updatedAt: now,
    createdAt: existing?.createdAt || now
  }

  const startDate = payload.start ? new Date(payload.start) : existing?.start || null
  const endDate = payload.end ? new Date(payload.end) : existing?.end || null
  if (startDate && !Number.isNaN(startDate.getTime())) record.start = startDate
  if (endDate && !Number.isNaN(endDate.getTime())) record.end = endDate

  if (existing?._id) return wixData.update(COLLECTION, record, { suppressAuth: true })
  return wixData.insert(COLLECTION, record, { suppressAuth: true })
}

async function cancelExistingBlock(blockId) {
  if (!blockId) return { cancelled: false }
  try {
    const result = await elevatedCancelEvent(blockId)
    return { cancelled: true, result }
  } catch (error) {
    if (isNotFoundError(error)) return { cancelled: true, notFound: true }
    throw error
  }
}

async function createRealBlockedEvent(payload, resolved) {
  const event = buildEventPayload(payload, resolved)
  try {
    console.log('Glow Calendar V3 blocking event create attempt:', {
      bookingId: payload.bookingId,
      scheduleId: resolved.scheduleId,
      resourceId: resolved.resourceId || null,
      start: payload.start,
      end: payload.end
    })
    const result = await elevatedCreateEvent(event)
    const blockId = getWixEventId(result)
    if (!blockId) throw new Error('Wix Calendar createEvent did not return an event id.')
    console.log('Glow Calendar V3 blocking event create success:', {
      bookingId: payload.bookingId,
      blockId,
      scheduleId: resolved.scheduleId,
      resourceId: resolved.resourceId || null
    })
    return { blockId, result, scheduleId: resolved.scheduleId, method: 'calendar_event' }
  } catch (error) {
    console.warn('Glow Calendar V3 blocking event create failed; trying Wix Bookings blocked session:', {
      bookingId: payload.bookingId,
      scheduleId: resolved.scheduleId,
      resourceId: resolved.resourceId || null,
      event,
      error: error?.message || String(error),
      details: error?.details || error
    })
  }

  const sessionInfo = buildBlockedSessionPayload(payload, resolved)
  try {
    console.log('Glow Bookings blocked session create attempt:', {
      bookingId: payload.bookingId,
      scheduleId: resolved.scheduleId,
      resourceId: resolved.resourceId || null,
      start: payload.start,
      end: payload.end,
      tags: sessionInfo.tags
    })
    const result = await sessions.createSession(sessionInfo, { suppressAuth: true })
    const blockId = result?._id || result?.id || result?.sessionId || ''
    if (!blockId) throw new Error('Wix Bookings createSession did not return a session id.')
    console.log('Glow Bookings blocked session create success:', {
      bookingId: payload.bookingId,
      blockId,
      scheduleId: resolved.scheduleId,
      resourceId: resolved.resourceId || null
    })
    return { blockId, result, scheduleId: resolved.scheduleId, method: 'bookings_blocked_session' }
  } catch (error) {
    console.error('Glow Bookings blocked session create failed:', {
      bookingId: payload.bookingId,
      scheduleId: resolved.scheduleId,
      resourceId: resolved.resourceId || null,
      sessionInfo,
      error: error?.message || String(error),
      details: error?.details || error
    })
    throw error
  }
}

export async function handleGlowAvailabilityBlock(payload) {
  const action = normaliseAction(payload.action)
  assertRequired(payload.bookingId, 'bookingId is required.')

  const resolved = action === 'delete'
    ? { scheduleId: payload.scheduleId || '', resourceId: payload.resourceId || '', resourceLabel: '' }
    : await resolveWixResource(payload)

  console.log('Glow availability request:', {
    action,
    bookingId: payload.bookingId,
    room: payload.room,
    start: payload.start,
    end: payload.end,
    scheduleId: resolved.scheduleId,
    resourceId: resolved.resourceId || null,
    existingBlockId: payload.existingBlockId || null
  })

  if (action === 'delete') {
    const stored = await findStoredBlock(payload)
    const blockId = payload.existingBlockId || stored?.blockId || ''
    if (!blockId) {
      if (stored) await saveStoredBlock(payload, resolved, '', 'removed')
      return { ok: true, action: 'delete', removed: true, notFound: true, blockId: '' }
    }

    const cancelResult = await cancelExistingBlock(blockId)
    await saveStoredBlock(payload, resolved, blockId, 'removed')
    console.log('Glow availability deleted:', { action, bookingId: payload.bookingId, blockId, notFound: Boolean(cancelResult.notFound) })
    return { ok: true, action: 'delete', removed: true, notFound: Boolean(cancelResult.notFound), blockId }
  }

  assertRequired(payload.start, 'start is required.')
  assertRequired(payload.end, 'end is required.')

  const stored = await findStoredBlock(payload)
  const existingBlockId = payload.existingBlockId || stored?.blockId || ''
  if (existingBlockId) await cancelExistingBlock(existingBlockId)

  const created = await createRealBlockedEvent(payload, resolved)
  await saveStoredBlock(payload, { ...resolved, scheduleId: created.scheduleId || resolved.scheduleId }, created.blockId, 'synced')

  console.log('Glow availability upserted:', {
    action,
    bookingId: payload.bookingId,
    room: payload.room,
    start: payload.start,
    end: payload.end,
    scheduleId: resolved.scheduleId,
    resourceId: resolved.resourceId || null,
    existingBlockId: existingBlockId || null,
    blockId: created.blockId,
    method: created.method
  })

  return {
    ok: true,
    action: 'upsert',
    blockId: created.blockId,
    start: payload.start,
    end: payload.end,
    scheduleId: resolved.scheduleId,
    resourceId: resolved.resourceId || null,
    method: created.method
  }
}

export async function listGlowAvailabilityBlocksForDiagnostics() {
  return wixData.query(COLLECTION)
    .descending('updatedAt')
    .limit(100)
    .find({ suppressAuth: true })
    .then((result) => result.items)
}


function getResourceScheduleId(resource) {
  return resource?.eventsSchedule?.scheduleId
    || resource?.eventsSchedule?.id
    || resource?.scheduleId
    || resource?.scheduleIds?.[0]
    || resource?.singleResource?.eventsSchedule?.scheduleId
    || resource?.singleResource?.scheduleIds?.[0]
    || ''
}

function getResourceId(resource) {
  return resource?._id || resource?.id || resource?.resourceId || resource?.singleResource?._id || resource?.singleResource?.id || ''
}

function getResourceName(resource) {
  return resource?.name || resource?.singleResource?.name || resource?.resource?.name || ''
}

function getResourceType(resource) {
  return resource?.typeId
    || resource?.type?.name
    || resource?.resourceType?.name
    || resource?.singleResource?.typeId
    || resource?.singleResource?.type?.name
    || ''
}

function normaliseDiagnosticResource(item, matchingSchedule = null) {
  const resource = item?.resource || item?.singleResource || item
  const scheduleId = getResourceScheduleId(resource) || getResourceScheduleId(item) || matchingSchedule?.id || matchingSchedule?._id || ''
  const resourceId = getResourceId(resource) || getResourceId(item) || matchingSchedule?.externalId || ''
  return {
    resourceName: getResourceName(resource) || getResourceName(item) || matchingSchedule?.name || 'Unnamed resource',
    resourceId,
    scheduleId,
    resourceType: getResourceType(resource) || getResourceType(item) || '',
    category: getResourceType(resource) || getResourceType(item) || '',
    status: resource?.status || item?.status || matchingSchedule?.status || '',
    rawResource: resource,
    rawSchedule: matchingSchedule || null
  }
}

async function queryCurrentBookingResources() {
  const response = await resources.queryResources({
    query: {
      paging: { limit: 100 }
    }
  })
  return response?.items || response?.resources || []
}

async function queryCurrentCalendarSchedules() {
  try {
    const response = await schedules.querySchedules({
      query: {
        filter: { appId: BOOKING_APP_ID, status: 'ACTIVE' },
        cursorPaging: { limit: 100 }
      }
    })
    return response?.schedules || response?.items || []
  } catch (error) {
    console.warn('Glow resource diagnostic could not query calendar schedules:', error?.message || error)
    return []
  }
}

function findScheduleForResource(resource, scheduleList) {
  const scheduleId = getResourceScheduleId(resource)
  const resourceId = getResourceId(resource)
  return (scheduleList || []).find((schedule) => {
    const candidateId = schedule?.id || schedule?._id || ''
    const externalId = schedule?.externalId || ''
    return (scheduleId && candidateId === scheduleId) || (resourceId && externalId === resourceId)
  }) || null
}

export async function diagnoseGlowBookingResources() {
  const resourceItems = await queryCurrentBookingResources()
  const scheduleList = await queryCurrentCalendarSchedules()
  const wantedNames = ['room 1', 'room 2', 'room 3', 'tone', 'collagen', 'prestige']

  const allResources = resourceItems.map((item) => {
    const resource = item?.resource || item?.singleResource || item
    return normaliseDiagnosticResource(item, findScheduleForResource(resource, scheduleList))
  })

  const matchingResources = allResources.filter((resource) => {
    const name = String(resource.resourceName || '').toLowerCase()
    return wantedNames.some((wanted) => name.includes(wanted))
  })

  return {
    ok: true,
    diagnostic: 'Glow Wix Booking Resources',
    count: matchingResources.length,
    totalResourcesFound: allResources.length,
    resources: matchingResources,
    allResources,
    secretNamesToPopulate: [
      'GLOW_ROOM_1_SCHEDULE_ID',
      'GLOW_ROOM_1_RESOURCE_ID',
      'GLOW_ROOM_2_SCHEDULE_ID',
      'GLOW_ROOM_2_RESOURCE_ID',
      'GLOW_ROOM_3_SCHEDULE_ID',
      'GLOW_ROOM_3_RESOURCE_ID'
    ]
  }
}
