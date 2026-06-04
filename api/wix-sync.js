const WIX_CONTACTS_QUERY_URL = 'https://www.wixapis.com/contacts/v4/contacts/query'
const WIX_BOOKINGS_QUERY_URL = 'https://www.wixapis.com/bookings/v2/bookings/query'

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
  const bookingType = lowerService.includes('spray') || lowerService.includes('patch') ? 'spraytan' : 'sunbed'
  const contact = booking.contactDetails || booking.customer || booking.contact || {}
  const startTime = normalizeDate(firstValue(booking.startDate, booking.startTime, booking.start, booking.slot?.startDate, booking.schedule?.start))
  const servicePrice = lowerService.includes('express') ? 35 : lowerService.includes('face') ? 8 : lowerService.includes('legs') ? 18 : lowerService.includes('upper') ? 22 : lowerService.includes('patch') ? 0 : 30
  const depositRequired = bookingType === 'spraytan' && servicePrice > 0 ? servicePrice * 0.5 : 0

  return {
    wix_booking_id: booking.id || booking.bookingId || '',
    booking_source: 'wix',
    wix_service_id: serviceId,
    wix_status: booking.status || booking.wixStatus || '',
    booking_type: bookingType,
    service_name: serviceName,
    wix_service_name: serviceName,
    customer_name: firstValue(contact.name, `${firstValue(contact.firstName, contact.first_name)} ${firstValue(contact.lastName, contact.last_name)}`.trim()),
    customer_email: firstValue(contact.email, contact.emailAddress),
    customer_phone: firstValue(contact.phone, contact.mobile, contact.phoneNumber),
    wix_contact_id: firstValue(contact.contactId, contact.id, booking.contactId),
    appointment_time: startTime,
    spraytan_column: lowerService.includes('patch') ? 'patch_test' : lowerService.includes('express') ? 'express_tan' : 'spray_tan',
    spraytan_service: lowerService.includes('patch') ? 'Patch Test' : serviceName,
    spraytan_artist: firstValue(booking.staffMemberName, booking.staffName, booking.resourceName, 'Unassigned'),
    spraytan_duration_minutes: Number(booking.durationMinutes || booking.duration || (lowerService.includes('patch') ? 10 : 30)),
    deposit_required: depositRequired,
    deposit_paid: Number(booking.depositPaid || 0),
    deposit_status: Number(booking.depositPaid || 0) >= depositRequired && depositRequired > 0 ? 'paid' : 'pending',
    patch_test_required: bookingType === 'spraytan' && !lowerService.includes('patch'),
    patch_test_completed: false,
    patch_test_date: null,
    approval_status: bookingType === 'spraytan' ? 'pending' : 'approved',
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
  let customers = []
  let bookings = []
  let services = []

  try {
    const contactsData = await wixFetch(WIX_CONTACTS_QUERY_URL, apiKey, siteId, { query: { paging: { limit: 100 } } })
    const contacts = contactsData.contacts || contactsData.items || []
    customers = contacts.map(normalizeContact).filter((customer) => customer.wix_contact_id || customer.email || customer.mobile)
  } catch (error) {
    errors.push(`Customers: ${error.message}`)
  }

  try {
    const bookingsData = await wixFetch(WIX_BOOKINGS_QUERY_URL, apiKey, siteId, { query: { paging: { limit: 100 } } })
    const wixBookings = bookingsData.bookings || bookingsData.items || []
    bookings = wixBookings.map(normalizeBooking).filter((booking) => booking.wix_booking_id)
    services = uniqueServices(bookings.map((booking) => ({
      wix_service_id: booking.wix_service_id,
      wix_service_name: booking.wix_service_name || booking.service_name
    })))
  } catch (error) {
    errors.push(`Bookings: ${error.message}`)
  }

  res.status(errors.length ? 207 : 200).json({
    customers,
    bookings,
    services,
    syncLog: {
      status: errors.length ? 'partial' : 'success',
      importedCustomers: customers.length,
      importedBookings: bookings.length,
      servicesFound: services.length,
      errors,
      syncedAt: new Date().toISOString()
    },
    errors
  })
}
