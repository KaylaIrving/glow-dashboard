const WIX_CONTACTS_QUERY_URL = 'https://www.wixapis.com/contacts/v4/contacts/query'
const WIX_BOOKINGS_QUERY_URL = 'https://www.wixapis.com/bookings/v2/bookings/query'
const WIX_REQUIRED_SERVICE_MAPPINGS = {
  'hybrid tanning lay down sunbed': { booking_type: 'sunbed', bed_id: 2, minutes: 15 },
  'prestige tanning lay down sunbed': { booking_type: 'sunbed', bed_id: 3, minutes: 15 },
  "stand up 'tone & tan' sunbed": { booking_type: 'sunbed', bed_id: 1, minutes: 15 },
  'stand up tone & tan sunbed': { booking_type: 'sunbed', bed_id: 1, minutes: 15 },
  'full body spray tan': { booking_type: 'spraytan', spraytan_service: 'Full Body Spray Tan', spraytan_duration_minutes: 30 },
  'express full body spray tan': { booking_type: 'spraytan', spraytan_service: 'EXPRESS Full Body Spray Tan', spraytan_duration_minutes: 30 },
  'spray tan patch test': { booking_type: 'patch_test', spraytan_service: 'Spray Tan patch test', spraytan_duration_minutes: 10 },
  'blue light full body spray tan': { booking_type: 'spraytan', spraytan_service: 'BLUE Light Full Body Spray Tan', spraytan_duration_minutes: 30 },
  'upper body & face spray tan': { booking_type: 'spraytan', spraytan_service: 'Upper Body & Face Spray Tan', spraytan_duration_minutes: 15 },
  'face & neck spray tan': { booking_type: 'spraytan', spraytan_service: 'Face & Neck Spray Tan', spraytan_duration_minutes: 15 },
  'legs only spray tan': { booking_type: 'spraytan', spraytan_service: 'Legs Only Spray Tan', spraytan_duration_minutes: 15 }
}

function inferWixServiceMapping(serviceName) {
  const key = normalizeServiceKey(serviceName)
  if (!key) return null
  if (key.includes('patch')) return { booking_type: 'patch_test', spraytan_service: serviceName || 'Spray Tan patch test', spraytan_duration_minutes: 10 }
  if (key.includes('prestige') || key.includes('excellence')) return { booking_type: 'sunbed', bed_id: 3, minutes: 15 }
  if (key.includes('stand up') || key.includes('tone') || key.includes('tan stand')) return { booking_type: 'sunbed', bed_id: 1, minutes: 15 }
  if (key.includes('hybrid') || key.includes('collagen') || key.includes('pink light') || key.includes('relaxing premium') || key.includes('vitamin d') || key.includes('red light') || key.includes('lay down sunbed') || key === 'lay down sunbed') return { booking_type: 'sunbed', bed_id: 2, minutes: 15 }
  if (key.includes('spray')) {
    const duration = key.includes('patch') ? 10 : key.includes('upper') || key.includes('face') || key.includes('legs') ? 15 : 30
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
  const startTime = normalizeDate(firstValue(booking.startDate, booking.startTime, booking.start, booking.slot?.startDate, booking.schedule?.start))
  const servicePrice = lowerService.includes('express') ? 35 : lowerService.includes('face') ? 8 : lowerService.includes('legs') ? 18 : lowerService.includes('upper') ? 22 : lowerService.includes('patch') ? 0 : 30
  const isSprayLike = bookingType === 'spraytan' || bookingType === 'patch_test'
  const depositRequired = bookingType === 'spraytan' && servicePrice > 0 ? servicePrice * 0.5 : 0
  const durationMinutes = Number(requiredMapping?.minutes || requiredMapping?.spraytan_duration_minutes || booking.durationMinutes || booking.duration || (lowerService.includes('patch') ? 10 : 30))

  return {
    wix_booking_id: booking.id || booking.bookingId || '',
    booking_source: 'wix',
    wix_service_id: serviceId,
    wix_status: booking.status || booking.wixStatus || '',
    booking_type: bookingType,
    bed_id: requiredMapping?.bed_id || null,
    minutes: requiredMapping?.minutes || null,
    service_name: serviceName,
    wix_service_name: serviceName,
    customer_name: firstValue(contact.name, `${firstValue(contact.firstName, contact.first_name)} ${firstValue(contact.lastName, contact.last_name)}`.trim()),
    customer_email: firstValue(contact.email, contact.emailAddress),
    customer_phone: firstValue(contact.phone, contact.mobile, contact.phoneNumber),
    wix_contact_id: firstValue(contact.contactId, contact.id, booking.contactId),
    appointment_time: startTime,
    booking_start: startTime,
    booking_end: addMinutesToIsoDate(startTime, durationMinutes),
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
  let customers = []
  let bookings = []
  let services = []
  let contactsFound = 0
  let bookingsFound = 0

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
    const bookingsData = await wixFetch(WIX_BOOKINGS_QUERY_URL, apiKey, siteId, { query: { paging: { limit: 100 } } })
    const wixBookings = bookingsData.bookings || bookingsData.items || []
    bookingsFound = wixBookings.length
    bookings = wixBookings.map((booking) => {
      try {
        return normalizeBooking(booking)
      } catch (error) {
        failedRecords.push(makeFailedRecord('bookings', booking, error))
        return null
      }
    }).filter((booking) => booking && booking.wix_booking_id)
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
      skipped: { customers: 0, bookings: 0, total: 0 },
      warnings: { customers: 0, bookings: 0, runtime: 0, total: 0, messages: [] },
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
      skippedBookings: 0,
      warnings: { customers: 0, bookings: 0, runtime: 0, total: 0, messages: [] },
      failedCustomers: failedRecords.filter((record) => record.table === 'customers').length,
      failedBookings: failedRecords.filter((record) => record.table === 'bookings').length,
      failedTotal: failedRecords.length,
      failedReasons,
      servicesFound: services.length,
      errors,
      failedRecords,
      syncedAt: new Date().toISOString()
    },
    errors
  })
}
