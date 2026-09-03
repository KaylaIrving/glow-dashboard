const WIX_CONTACTS_QUERY_URL = 'https://www.wixapis.com/contacts/v4/contacts/query'
const WIX_BOOKINGS_QUERY_URL = 'https://www.wixapis.com/bookings/v2/bookings/query'
const WIX_REQUIRED_SERVICE_MAPPINGS = {
  'hybrid tanning lay down sunbed': { booking_type: 'sunbed', bed_id: 2, minutes: 20 },
  'prestige tanning lay down sunbed': { booking_type: 'sunbed', bed_id: 3, minutes: 20 },
  "stand up 'tone & tan' sunbed": { booking_type: 'sunbed', bed_id: 1, minutes: 20 },
  'stand up tone & tan sunbed': { booking_type: 'sunbed', bed_id: 1, minutes: 20 },
  'full body spray tan': { booking_type: 'spraytan', spraytan_service: 'Full Body Spray Tan', spraytan_duration_minutes: 30 },
  'express full body spray tan': { booking_type: 'spraytan', spraytan_service: 'EXPRESS Full Body Spray Tan', spraytan_duration_minutes: 30 },
  'spray tan patch test': { booking_type: 'patch_test', spraytan_service: 'Spray Tan patch test', spraytan_duration_minutes: 10 },
  'blue light full body spray tan': { booking_type: 'spraytan', spraytan_service: 'BLUE Light Full Body Spray Tan', spraytan_duration_minutes: 30 },
  'upper body & face spray tan': { booking_type: 'spraytan', spraytan_service: 'Upper Body & Face Spray Tan', spraytan_duration_minutes: 30 },
  'face & neck spray tan': { booking_type: 'spraytan', spraytan_service: 'Face & Neck Spray Tan', spraytan_duration_minutes: 30 },
  'legs only spray tan': { booking_type: 'spraytan', spraytan_service: 'Legs Only Spray Tan', spraytan_duration_minutes: 30 }
}

function inferWixServiceMapping(serviceName) {
  const key = normalizeServiceKey(serviceName)
  if (!key) return null
  if (key.includes('patch')) return { booking_type: 'patch_test', spraytan_service: serviceName || 'Spray Tan patch test', spraytan_duration_minutes: 10 }
  if (key.includes('prestige') || key.includes('excellence')) return { booking_type: 'sunbed', bed_id: 3, minutes: 20 }
  if (key.includes('stand up') || key.includes('tone') || key.includes('tan stand')) return { booking_type: 'sunbed', bed_id: 1, minutes: 20 }
  if (key.includes('hybrid') || key.includes('collagen') || key.includes('pink light') || key.includes('relaxing premium') || key.includes('vitamin d') || key.includes('red light') || key.includes('lay down sunbed') || key === 'lay down sunbed') return { booking_type: 'sunbed', bed_id: 2, minutes: 20 }
  if (key.includes('spray')) {
    const duration = key.includes('patch') ? 10 : 30
    return { booking_type: 'spraytan', spraytan_service: serviceName, spraytan_duration_minutes: duration }
  }
  return null
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '') || ''
}

function normalizeServiceKey(serviceName) {
  return String(serviceName || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function getLondonDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date)
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return lookup.year + '-' + lookup.month + '-' + lookup.day
}

function getRequestBody(req) {
  if (!req?.body) return {}
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body) } catch { return {} }
  }
  return req.body
}

function getSyncFromDate(req) {
  const body = getRequestBody(req)
  const requested = String(body.sync_from_date || body.fromDate || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : getLondonDateKey(new Date())
}

function isBookingOnOrAfterDate(booking, fromDate) {
  const bookingDate = getLondonDateKey(booking?.appointment_time || booking?.booking_start || booking?.start_time)
  return Boolean(bookingDate && bookingDate >= fromDate)
}

function uniqueServices(serviceRows) {
  const services = new Map()
  serviceRows.filter(Boolean).forEach((service) => {
    const serviceId = String(service.wix_service_id || '').trim()
    const serviceName = String(service.wix_service_name || '').trim().replace(/\s+/g, ' ')
    const key = serviceId || normalizeServiceKey(serviceName)
    if (key && !services.has(key)) {
      services.set(key, {
        wix_service_id: serviceId || null,
        wix_service_name: serviceName,
        is_active: true
      })
    }
  })
  return [...services.values()].sort((a, b) => a.wix_service_name.localeCompare(b.wix_service_name))
}

function normalizeDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function addMinutesToIsoDate(startIso, minutes) {
  if (!startIso) return null
  const startDate = new Date(startIso)
  const durationMinutes = Number(minutes || 0)
  if (Number.isNaN(startDate.getTime()) || durationMinutes <= 0) return null
  return new Date(startDate.getTime() + durationMinutes * 60000).toISOString()
}

function getBookingStartDate(booking) {
  return normalizeDate(firstValue(
    booking.startDate,
    booking.startTime,
    booking.start,
    booking.slot?.startDate,
    booking.bookedEntity?.slot?.startDate,
    booking.schedule?.start
  ))
}

function getBookingEndDate(booking) {
  return normalizeDate(firstValue(
    booking.endDate,
    booking.endTime,
    booking.end,
    booking.slot?.endDate,
    booking.bookedEntity?.slot?.endDate,
    booking.schedule?.end
  ))
}

function getDurationFromStartEnd(startIso, endIso) {
  if (!startIso || !endIso) return null
  const startDate = new Date(startIso)
  const endDate = new Date(endIso)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null
  const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000)
  return durationMinutes > 0 ? durationMinutes : null
}

function getWixProvidedDurationMinutes(booking, startIso, endIso) {
  const durationFromDates = getDurationFromStartEnd(startIso, endIso)
  if (durationFromDates) return durationFromDates
  const explicitDuration = Number(firstValue(booking.durationMinutes, booking.duration))
  return explicitDuration > 0 ? explicitDuration : null
}

function shouldLogKaylaIrvingDurationDiagnostic(booking, serviceName, startTime) {
  const contact = booking?.contactDetails || booking?.customer || booking?.contact || {}
  const firstName = String(firstValue(contact.firstName, contact.first_name, contact.name?.first, contact.name?.firstName)).trim().toLowerCase()
  const lastName = String(firstValue(contact.lastName, contact.last_name, contact.name?.last, contact.name?.lastName)).trim().toLowerCase()
  const displayName = typeof contact.name === 'string' ? contact.name.toLowerCase() : ''
  const serviceKey = normalizeServiceKey(serviceName)
  const startDate = startTime ? new Date(startTime) : null
  const londonTime = startDate && !Number.isNaN(startDate.getTime())
    ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).format(startDate)
    : ''
  const londonDate = startDate && !Number.isNaN(startDate.getTime()) ? getLondonDateKey(startDate) : ''
  const isKaylaIrving = (firstName === 'kayla' && lastName === 'irving') || displayName.includes('kayla irving')
  const isToneSunbed = serviceKey.includes('tone') || serviceKey.includes('stand up')
  const isTargetTime = londonDate === '2026-09-03' && londonTime === '20:29'
  return isKaylaIrving && isToneSunbed && isTargetTime
}

function getLondonDateTimeParts(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return { date: '', time: '' }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date)
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    date: lookup.year + '-' + lookup.month + '-' + lookup.day,
    time: lookup.hour + ':' + lookup.minute
  }
}

function shouldTraceOrder18887(booking, serviceName, startTime) {
  const contact = booking?.contactDetails || booking?.customer || booking?.contact || {}
  const firstName = String(firstValue(contact.firstName, contact.first_name, contact.name?.first, contact.name?.firstName)).trim().toLowerCase()
  const lastName = String(firstValue(contact.lastName, contact.last_name, contact.name?.last, contact.name?.lastName)).trim().toLowerCase()
  const displayName = typeof contact.name === 'string' ? contact.name.toLowerCase() : ''
  const serviceKey = normalizeServiceKey(serviceName)
  const london = getLondonDateTimeParts(startTime)
  const orderValue = String(firstValue(booking.orderNumber, booking.order_number, booking.order?.number, booking.orderId, booking.order?.id)).trim()
  const isKaylaIrving = (firstName === 'kayla' && lastName === 'irving') || displayName.includes('kayla irving')
  const isPrestige = serviceKey.includes('prestige') || serviceKey.includes('excellence')
  const isTargetTime = london.date === '2026-09-03' && london.time === '19:14'
  return orderValue === '18887' || (isKaylaIrving && isPrestige && isTargetTime)
}

function logTraceOrder18887(stage, data) {
  console.log('WIX_TRACE_ORDER_18887', { stage, ...data })
}

function logKaylaIrvingDurationDiagnostic(booking, calculated) {
  console.log('WIX_DURATION_DIAGNOSTIC_KAYLA_IRVING_2026_09_03_2029', {
    rawTimingFields: {
      bookingId: booking?.id || booking?.bookingId || '',
      serviceName: calculated.serviceName,
      startDate: booking?.startDate,
      endDate: booking?.endDate,
      startTime: booking?.startTime,
      start: booking?.start,
      durationMinutes: booking?.durationMinutes,
      duration: booking?.duration,
      bookedEntitySlotStartDate: booking?.bookedEntity?.slot?.startDate,
      bookedEntitySlotEndDate: booking?.bookedEntity?.slot?.endDate,
      slotStartDate: booking?.slot?.startDate,
      slotEndDate: booking?.slot?.endDate,
      scheduleStart: booking?.schedule?.start,
      scheduleEnd: booking?.schedule?.end
    },
    normalizedTiming: {
      startTime: calculated.startTime,
      detectedEndTime: calculated.endTime,
      calculatedActualDuration: calculated.calculatedActualDuration,
      wixProvidedDuration: calculated.wixDurationMinutes,
      fallbackMappingDuration: calculated.fallbackMappingDuration,
      finalDurationMinutes: calculated.durationMinutes,
      finalMinutes: calculated.finalMinutes,
      finalBookingStart: calculated.startTime,
      finalBookingEnd: calculated.bookingEnd
    }
  })
}

function describeShape(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 2) return typeof value
  if (Array.isArray(value)) return value.length ? [describeShape(value[0], depth + 1)] : []
  return Object.fromEntries(
    Object.entries(value).slice(0, 40).map(([key, child]) => [
      key,
      child && typeof child === 'object' ? describeShape(child, depth + 1) : typeof child
    ])
  )
}

function makeFailedRecord(table, record, error, attemptedPayload = null) {
  const payload = attemptedPayload || record || {}
  const contact = record?.contactDetails || record?.customer || record?.contact || {}
  return {
    table,
    recordId: record?.id || record?.bookingId || record?.contactId || record?.email || 'unknown',
    wixBookingId: record?.id || record?.bookingId || payload?.wix_booking_id || '',
    wixContactId: record?.contactId || contact?.contactId || contact?.id || payload?.wix_contact_id || '',
    customerName: payload?.customer_name || record?.name || contact?.name || [contact?.firstName, contact?.lastName].filter(Boolean).join(' '),
    email: payload?.customer_email || record?.email || contact?.email || contact?.emailAddress || '',
    wixServiceName: payload?.wix_service_name || getBookingServiceName(record),
    bookingType: payload?.booking_type || '',
    message: error?.message || String(error),
    code: error?.code || '',
    details: error?.details || '',
    hint: error?.hint || '',
    attemptedPayload: payload,
    rawShape: describeShape(record)
  }
}

function groupFailedReasons(records = [], endpointErrors = []) {
  const grouped = {}
  endpointErrors.forEach((message) => {
    const reason = String(message || 'Endpoint error')
    grouped[reason] = (grouped[reason] || 0) + 1
  })
  records.forEach((record) => {
    const reason = record?.missingColumn
      ? `Missing column: ${record.missingColumn}`
      : record?.message || 'Unknown failure'
    grouped[reason] = (grouped[reason] || 0) + 1
  })
  return grouped
}

function normalizeContact(contact) {
  const info = contact.info || {}
  const primary = contact.primaryInfo || info.primaryInfo || {}
  const name = info.name || contact.name || {}
  const email = firstValue(primary.email, info.emails?.[0]?.email, contact.email)
  const phone = firstValue(primary.phone, info.phones?.[0]?.phone, contact.phone)
  const address = info.addresses?.[0]
  const addressText = address
    ? [address.addressLine1, address.addressLine2, address.city, address.postalCode].filter(Boolean).join(', ')
    : firstValue(contact.address)
  const extendedFields = contact.extendedFields || info.extendedFields || {}

  return {
    wix_contact_id: contact.id || contact.contactId || '',
    first_name: firstValue(contact.firstName, name.first, name.firstName),
    last_name: firstValue(contact.lastName, name.last, name.lastName),
    customer_name: firstValue(contact.name, `${firstValue(name.first, name.firstName)} ${firstValue(name.last, name.lastName)}`.trim()),
    email,
    mobile: phone,
    address: addressText,
    date_of_birth: firstValue(contact.dateOfBirth, info.birthdate, extendedFields.dateOfBirth),
    registration_answers: JSON.stringify(extendedFields.registration || extendedFields.registrationAnswers || {}),
    medical_questionnaire_answers: JSON.stringify(extendedFields.medical || extendedFields.medicalQuestionnaire || {}),
    consultation_answers: JSON.stringify(extendedFields.consultation || extendedFields.consultationAnswers || {}),
    customer_notes: firstValue(contact.notes, info.notes),
    customer_source: 'wix',
    wix_raw_shape: describeShape(contact)
  }
}

function getBookingServiceName(booking) {
  return firstValue(
    booking.wix_service_name,
    booking.serviceName,
    booking.bookedEntity?.title,
    booking.bookedEntity?.name,
    booking.service?.name,
    booking.service?.title
  )
}

function normalizeBooking(booking) {
  const serviceName = getBookingServiceName(booking)
  const serviceId = firstValue(
    booking.wix_service_id,
    booking.serviceId,
    booking.bookedEntity?.id,
    booking.bookedEntity?.serviceId,
    booking.service?.id
  )
  const lowerService = serviceName.toLowerCase()
  const requiredMapping = WIX_REQUIRED_SERVICE_MAPPINGS[normalizeServiceKey(serviceName)] || inferWixServiceMapping(serviceName)
  const bookingType = requiredMapping?.booking_type || (lowerService.includes('spray') || lowerService.includes('patch') ? 'spraytan' : 'sunbed')
  const contact = booking.contactDetails || booking.customer || booking.contact || {}
  const contactFirstName = firstValue(contact.firstName, contact.first_name, contact.name?.first, contact.name?.firstName)
  const contactLastName = firstValue(contact.lastName, contact.last_name, contact.name?.last, contact.name?.lastName)
  const contactDisplayName = typeof contact.name === 'string' ? contact.name : ''
  const startTime = getBookingStartDate(booking)
  const endTime = getBookingEndDate(booking)
  const servicePrice = lowerService.includes('express') ? 35 : lowerService.includes('face') ? 8 : lowerService.includes('legs') ? 18 : lowerService.includes('upper') ? 22 : lowerService.includes('patch') ? 0 : 30
  const isSprayLike = bookingType === 'spraytan' || bookingType === 'patch_test'
  const depositRequired = bookingType === 'spraytan' && servicePrice > 0 ? servicePrice * 0.5 : 0
  const wixDurationMinutes = getWixProvidedDurationMinutes(booking, startTime, endTime)
  const durationMinutes = isSprayLike
    ? Number(wixDurationMinutes || requiredMapping?.spraytan_duration_minutes || (lowerService.includes('patch') ? 10 : 30))
    : Number(wixDurationMinutes || requiredMapping?.minutes || 20)
  const bookingEnd = addMinutesToIsoDate(startTime, durationMinutes)
  const finalMinutes = bookingType === 'sunbed' ? durationMinutes : null
  const shouldTrace18887 = shouldTraceOrder18887(booking, serviceName, startTime)

  if (shouldTrace18887) {
    logTraceOrder18887('api.raw_wix_booking', {
      bookingId: booking?.id || booking?.bookingId || '',
      orderNumber: firstValue(booking.orderNumber, booking.order_number, booking.order?.number, booking.orderId, booking.order?.id),
      serviceName,
      serviceId,
      customerName: firstValue(contactDisplayName, `${contactFirstName} ${contactLastName}`.trim()),
      rawTimingFields: {
        startDate: booking?.startDate,
        endDate: booking?.endDate,
        startTime: booking?.startTime,
        start: booking?.start,
        durationMinutes: booking?.durationMinutes,
        duration: booking?.duration,
        bookedEntitySlotStartDate: booking?.bookedEntity?.slot?.startDate,
        bookedEntitySlotEndDate: booking?.bookedEntity?.slot?.endDate,
        slotStartDate: booking?.slot?.startDate,
        slotEndDate: booking?.slot?.endDate,
        scheduleStart: booking?.schedule?.start,
        scheduleEnd: booking?.schedule?.end
      },
      resourceFields: {
        staffMemberName: booking?.staffMemberName,
        staffName: booking?.staffName,
        resourceName: booking?.resourceName,
        bookedEntityTitle: booking?.bookedEntity?.title,
        bookedEntityName: booking?.bookedEntity?.name
      },
      rawShape: describeShape(booking)
    })
  }

  if (shouldLogKaylaIrvingDurationDiagnostic(booking, serviceName, startTime)) {
    logKaylaIrvingDurationDiagnostic(booking, {
      serviceName,
      startTime,
      endTime,
      calculatedActualDuration: getDurationFromStartEnd(startTime, endTime),
      wixDurationMinutes,
      fallbackMappingDuration: isSprayLike ? requiredMapping?.spraytan_duration_minutes : requiredMapping?.minutes,
      durationMinutes,
      finalMinutes,
      bookingEnd
    })
  }

  const normalizedBooking = {
    wix_booking_id: booking.id || booking.bookingId || '',
    booking_source: 'wix',
    wix_service_id: serviceId,
    wix_status: booking.status || booking.wixStatus || '',
    booking_type: bookingType,
    bed_id: requiredMapping?.bed_id || null,
    minutes: finalMinutes,
    service_name: serviceName,
    wix_service_name: serviceName,
    customer_name: firstValue(contactDisplayName, `${contactFirstName} ${contactLastName}`.trim()),
    first_name: contactFirstName,
    last_name: contactLastName,
    wix_customer_first_name: contactFirstName,
    wix_customer_last_name: contactLastName,
    customer_email: firstValue(contact.email, contact.emailAddress),
    customer_phone: firstValue(contact.phone, contact.mobile, contact.phoneNumber),
    wix_contact_id: firstValue(contact.contactId, contact.id, booking.contactId),
    appointment_time: startTime,
    booking_start: startTime,
    booking_end: bookingEnd,
    spraytan_column: bookingType === 'patch_test' ? 'patch_test' : lowerService.includes('express') ? 'express_tan' : 'spray_tan',
    spraytan_service: requiredMapping?.spraytan_service || (lowerService.includes('patch') ? 'Spray Tan patch test' : serviceName),
    spraytan_artist: firstValue(booking.staffMemberName, booking.staffName, booking.resourceName, 'Unassigned'),
    spraytan_duration_minutes: durationMinutes,
    deposit_required: depositRequired,
    deposit_paid: Number(booking.depositPaid || 0),
    deposit_status: Number(booking.depositPaid || 0) >= depositRequired && depositRequired > 0 ? 'paid' : 'pending',
    patch_test_required: bookingType === 'spraytan' && !lowerService.includes('patch'),
    patch_test_completed: false,
    patch_test_date: null,
    approval_status: isSprayLike ? 'pending' : 'approved',
    wix_raw_shape: describeShape(booking)
  }

  if (shouldTrace18887) {
    logTraceOrder18887('api.normalizeBooking.result', {
      normalizedBooking: {
        wix_booking_id: normalizedBooking.wix_booking_id,
        booking_source: normalizedBooking.booking_source,
        wix_service_id: normalizedBooking.wix_service_id,
        wix_service_name: normalizedBooking.wix_service_name,
        booking_type: normalizedBooking.booking_type,
        bed_id: normalizedBooking.bed_id,
        minutes: normalizedBooking.minutes,
        appointment_time: normalizedBooking.appointment_time,
        booking_start: normalizedBooking.booking_start,
        booking_end: normalizedBooking.booking_end,
        status: normalizedBooking.status,
        approval_status: normalizedBooking.approval_status
      },
      detectedEndTime: endTime,
      calculatedActualDuration: getDurationFromStartEnd(startTime, endTime),
      wixProvidedDuration: wixDurationMinutes,
      fallbackMappingDuration: isSprayLike ? requiredMapping?.spraytan_duration_minutes : requiredMapping?.minutes,
      finalDurationMinutes: durationMinutes
    })
  }

  return normalizedBooking
}

async function wixFetch(url, apiKey, siteId, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Wix-Site-Id': siteId,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : {}
  if (!response.ok) {
    throw new Error(data.message || data.error || `Wix API returned ${response.status}`)
  }
  return data
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const apiKey = process.env.WIX_API_KEY
  const siteId = process.env.WIX_SITE_ID
  if (!apiKey || !siteId) {
    res.status(500).json({ error: 'WIX_API_KEY and WIX_SITE_ID must be configured in Vercel.' })
    return
  }

  const errors = []
  const failedRecords = []
  const syncFromDate = getSyncFromDate(req)
  let customers = []
  let bookings = []
  let services = []
  let contactsFound = 0
  let bookingsFound = 0
  let skippedOldBookings = 0
  const warningMessages = []

  try {
    const contactsData = await wixFetch(WIX_CONTACTS_QUERY_URL, apiKey, siteId, { query: { paging: { limit: 100 } } })
    const contacts = contactsData.contacts || contactsData.items || []
    contactsFound = contacts.length
    customers = contacts.map((contact) => {
      try {
        return normalizeContact(contact)
      } catch (error) {
        failedRecords.push(makeFailedRecord('customers', contact, error))
        return null
      }
    }).filter((customer) => customer && (customer.wix_contact_id || customer.email || customer.mobile))
  } catch (error) {
    errors.push(`Customers: ${error.message}`)
  }

  try {
    const syncFromIso = `${syncFromDate}T00:00:00.000Z`
    const bookingQuery = {
      query: {
        filter: { startDate: { $gte: syncFromIso } },
        paging: { limit: 100 }
      }
    }
    let bookingsData
    try {
      bookingsData = await wixFetch(WIX_BOOKINGS_QUERY_URL, apiKey, siteId, bookingQuery)
    } catch (filteredError) {
      warningMessages.push(`Bookings date-filter fallback: ${filteredError.message}`)
      bookingsData = await wixFetch(WIX_BOOKINGS_QUERY_URL, apiKey, siteId, { query: { paging: { limit: 100 } } })
    }
    const wixBookings = bookingsData.bookings || bookingsData.items || []
    bookingsFound = wixBookings.length
    const normalizedBookings = wixBookings.map((booking) => {
      try {
        return normalizeBooking(booking)
      } catch (error) {
        failedRecords.push(makeFailedRecord('bookings', booking, error))
        return null
      }
    }).filter((booking) => booking && booking.wix_booking_id)
    bookings = normalizedBookings.filter((booking) => isBookingOnOrAfterDate(booking, syncFromDate))
    skippedOldBookings = normalizedBookings.length - bookings.length
    services = uniqueServices(bookings.map((booking) => ({
      wix_service_id: booking.wix_service_id,
      wix_service_name: booking.wix_service_name || booking.service_name
    })))
  } catch (error) {
    errors.push(`Bookings: ${error.message}`)
  }

  const failedReasons = groupFailedReasons(failedRecords, errors)

  res.status(errors.length ? 207 : 200).json({
    customers,
    bookings,
    services,
    failedRecords,
    debugSummary: {
      found: { customers: contactsFound, bookings: bookingsFound, total: contactsFound + bookingsFound },
      returned: { customers: customers.length, bookings: bookings.length, total: customers.length + bookings.length },
      updated: { customers: 0, bookings: 0, total: 0 },
      skipped: { customers: 0, bookings: skippedOldBookings, total: skippedOldBookings },
      warnings: { customers: 0, bookings: warningMessages.length, runtime: 0, total: warningMessages.length, messages: warningMessages },
      failed: {
        customers: failedRecords.filter((record) => record.table === 'customers').length,
        bookings: failedRecords.filter((record) => record.table === 'bookings').length,
        total: failedRecords.length
      },
      failedReasons
    },
    syncLog: {
      status: errors.length ? 'partial' : 'success',
      foundCustomers: contactsFound,
      foundBookings: bookingsFound,
      foundTotal: contactsFound + bookingsFound,
      importedCustomers: customers.length,
      importedBookings: bookings.length,
      updatedCustomers: 0,
      updatedBookings: 0,
      skippedCustomers: 0,
      skippedBookings: skippedOldBookings,
      warnings: { customers: 0, bookings: warningMessages.length, runtime: 0, total: warningMessages.length, messages: warningMessages },
      failedCustomers: failedRecords.filter((record) => record.table === 'customers').length,
      failedBookings: failedRecords.filter((record) => record.table === 'bookings').length,
      failedTotal: failedRecords.length,
      failedReasons,
      servicesFound: services.length,
      errors,
      failedRecords,
      syncedAt: new Date().toISOString(),
      syncFromDate
    },
    errors
  })
}
