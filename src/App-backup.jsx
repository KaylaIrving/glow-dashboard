import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import './App.css'

const UNDRESS_SECONDS = 180
const COOLDOWN_SECONDS = 180
const SLOT_MINUTES = 5

const PURCHASE_OPTIONS = {
  standard_custom: {
    type: 'standard',
    name: 'Custom Standard Minutes',
    label: 'Custom Standard - Bed 1/3 - £1.05 per min',
    pricePerMinute: 1.05,
    minutes: null,
    total: null
  },
  hybrid_custom: {
    type: 'hybrid',
    name: 'Custom Hybrid Minutes',
    label: 'Custom Hybrid - Any Bed - £1.15 per min',
    pricePerMinute: 1.15,
    minutes: null,
    total: null
  },
  standard_50: {
    type: 'standard',
    name: 'Standard 50 mins',
    label: 'Standard Package - 50 mins - £42.50',
    pricePerMinute: 42.5 / 50,
    minutes: 50,
    total: 42.5
  },
  standard_80: {
    type: 'standard',
    name: 'Standard 80 mins',
    label: 'Standard Package - 80 mins - £67.50',
    pricePerMinute: 67.5 / 80,
    minutes: 80,
    total: 67.5
  },
  standard_120: {
    type: 'standard',
    name: 'Standard 120 mins',
    label: 'Standard Package - 120 mins - £87.50',
    pricePerMinute: 87.5 / 120,
    minutes: 120,
    total: 87.5
  },
  hybrid_50: {
    type: 'hybrid',
    name: 'Hybrid 50 mins',
    label: 'Hybrid Package - 50 mins - £45.50',
    pricePerMinute: 45.5 / 50,
    minutes: 50,
    total: 45.5
  },
  hybrid_80: {
    type: 'hybrid',
    name: 'Hybrid 80 mins',
    label: 'Hybrid Package - 80 mins - £72.50',
    pricePerMinute: 72.5 / 80,
    minutes: 80,
    total: 72.5
  },
  hybrid_120: {
    type: 'hybrid',
    name: 'Hybrid 120 mins',
    label: 'Hybrid Package - 120 mins - £92.50',
    pricePerMinute: 92.5 / 120,
    minutes: 120,
    total: 92.5
  }
}

function App() {
  const [beds, setBeds] = useState([])
  const [bookings, setBookings] = useState([])
  const [customers, setCustomers] = useState([])
  const [currentTime, setCurrentTime] = useState(new Date())

  const today = formatLocalDate(new Date())
  const [selectedDate, setSelectedDate] = useState(today)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalBooking, setModalBooking] = useState(null)
  const [modalSlot, setModalSlot] = useState(null)
  const [editMode, setEditMode] = useState(false)

  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [newCustomerBalance, setNewCustomerBalance] = useState(0)

  const [purchaseOption, setPurchaseOption] = useState('standard_custom')
  const [topUpMinutes, setTopUpMinutes] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('card')
  const [paymentNotes, setPaymentNotes] = useState('')

  const [selectedMinutes, setSelectedMinutes] = useState(12)
  const [editTime, setEditTime] = useState('')
  const [editBedId, setEditBedId] = useState('')

  useEffect(() => {
    getBeds()
    getBookings()
    getCustomers()

    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    autoCompleteFinishedSessions()
  }, [currentTime, bookings])

  function formatLocalDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  function formatStatus(text) {
    if (!text) return ''
    return text.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  }

  function formatClock(date) {
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  function jumpToNow() {
    setSelectedDate(formatLocalDate(new Date()))

    setTimeout(() => {
      const nowRow = document.querySelector('[data-current-time-row="true"]')

      if (nowRow) {
        nowRow.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        })
      }
    }, 150)
  }

  function generateTimeSlots(start = '08:30', end = '21:00') {
    const slots = []
    const [startHour, startMinute] = start.split(':').map(Number)
    const [endHour, endMinute] = end.split(':').map(Number)

    const startDate = new Date()
    startDate.setHours(startHour, startMinute, 0, 0)

    const endDate = new Date()
    endDate.setHours(endHour, endMinute, 0, 0)

    let slot = new Date(startDate)

    while (slot <= endDate) {
      slots.push(
        `${String(slot.getHours()).padStart(2, '0')}:${String(slot.getMinutes()).padStart(2, '0')}`
      )
      slot = new Date(slot.getTime() + SLOT_MINUTES * 60000)
    }

    return slots
  }

  async function getBeds() {
    const { data } = await supabase.from('Beds').select('*').order('id')
    if (data) setBeds(data)
  }

  async function getBookings() {
    const { data } = await supabase
      .from('Bookings')
      .select('*')
      .order('appointment_time', { ascending: true })

    if (data) setBookings(data)
  }

  async function getCustomers() {
    const { data } = await supabase
      .from('Customers')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (data) setCustomers(data)
  }

  function getSelectedCustomer() {
    return customers.find((customer) => customer.id === Number(selectedCustomerId))
  }

  function getFilteredCustomers() {
    if (!customerSearch.trim()) return []

    return customers.filter((customer) =>
      customer.name?.toLowerCase().includes(customerSearch.toLowerCase())
    )
  }

  function getUsableMinutesForBed(customer, bedId) {
    const standard = Number(customer?.standard_minutes_balance || 0)
    const hybrid = Number(customer?.hybrid_minutes_balance || 0)

    if (Number(bedId) === 2) return hybrid

    return standard + hybrid
  }

  function customerHasEnoughMinutes(customer, minutes, bedId = null) {
    return getUsableMinutesForBed(customer, bedId) >= Number(minutes || 0)
  }

  function getPurchaseDetails() {
    const selected = PURCHASE_OPTIONS[purchaseOption]
    const isCustom = selected.minutes === null

    const minutes = isCustom ? Number(topUpMinutes || 0) : selected.minutes
    const total = isCustom
      ? Number((minutes * selected.pricePerMinute).toFixed(2))
      : selected.total

    return {
      ...selected,
      minutes,
      total
    }
  }

  function getUpcomingBookingsWithin20Minutes() {
    const now = currentTime
    const soon = new Date(now.getTime() + 20 * 60000)

    return bookings.filter((booking) => {
      if (!booking.appointment_time) return false
      if (['completed', 'no_show', 'force_stopped'].includes(booking.status)) return false

      const appointmentTime = new Date(booking.appointment_time)

      return appointmentTime >= now && appointmentTime <= soon
    })
  }

  function isCurrentTimeSlot(time) {
    if (selectedDate !== formatLocalDate(currentTime)) return false

    const slotStart = getSlotDateTime(time)
    const slotEnd = new Date(slotStart.getTime() + SLOT_MINUTES * 60000)

    return currentTime >= slotStart && currentTime < slotEnd
  }

  async function createNewCustomerFromSearch() {
    if (!customerSearch.trim()) {
      alert('Please type a customer name first.')
      return null
    }

    const { data, error } = await supabase
      .from('Customers')
      .insert({
        name: customerSearch.trim(),
        minutes_balance: 0,
        standard_minutes_balance: Number(newCustomerBalance || 0),
        hybrid_minutes_balance: 0,
        is_active: true
      })
      .select()
      .single()

    if (error) {
      alert('Could not create customer.')
      console.log(error)
      return null
    }

    await getCustomers()
    setSelectedCustomerId(String(data.id))
    setTopUpMinutes(0)

    return data
  }

  async function topUpSelectedCustomer() {
    const customer = getSelectedCustomer()

    if (!customer) {
      alert('Please select a customer first.')
      return
    }

    const purchase = getPurchaseDetails()
    const amount = Number(purchase.minutes || 0)

    if (amount <= 0) {
      alert('Enter the number of minutes to add.')
      return
    }

    const isHybridTopUp = purchase.type === 'hybrid'
    const pricePerMinute = Number(purchase.pricePerMinute)
    const totalAmount = Number(purchase.total.toFixed(2))

    const newStandardBalance = isHybridTopUp
      ? Number(customer.standard_minutes_balance || 0)
      : Number(customer.standard_minutes_balance || 0) + amount

    const newHybridBalance = isHybridTopUp
      ? Number(customer.hybrid_minutes_balance || 0) + amount
      : Number(customer.hybrid_minutes_balance || 0)

    const confirmed = window.confirm(
      `Payment taken?\n\nCustomer: ${customer.name}\nPackage: ${purchase.name}\nMinutes: ${amount}\nTotal: £${totalAmount.toFixed(2)}\nMethod: ${formatStatus(paymentMethod)}`
    )

    if (!confirmed) return

    const { error: paymentError } = await supabase
      .from('Payments')
      .insert({
        customer_id: customer.id,
        customer_name: customer.name,
        bed_type: purchase.type === 'hybrid'
          ? 'Hybrid Minutes - Any Bed'
          : 'Standard Minutes - Bed 1 and Bed 3',
        minutes_added: amount,
        price_per_minute: Number(pricePerMinute.toFixed(4)),
        total_amount: totalAmount,
        payment_method: paymentMethod,
        package_type: purchase.type,
        package_name: purchase.name,
        notes: paymentNotes || null
      })

    if (paymentError) {
      alert('Payment record could not be saved. Minutes were not added.')
      console.log(paymentError)
      return
    }

    const { error: customerError } = await supabase
      .from('Customers')
      .update({
        standard_minutes_balance: newStandardBalance,
        hybrid_minutes_balance: newHybridBalance
      })
      .eq('id', customer.id)

    if (customerError) {
      alert('Could not add minutes to customer.')
      console.log(customerError)
      return
    }

    setCustomers((prevCustomers) =>
      prevCustomers.map((c) =>
        c.id === customer.id
          ? {
              ...c,
              standard_minutes_balance: newStandardBalance,
              hybrid_minutes_balance: newHybridBalance
            }
          : c
      )
    )

    setTopUpMinutes(0)
    setPaymentNotes('')

    alert(
      `Added ${amount} mins to ${customer.name}.\n\nStandard: ${newStandardBalance} mins\nHybrid: ${newHybridBalance} mins`
    )
  }

  function getTotalBlockMinutes(booking) {
    return Number(booking.minutes || 0) + UNDRESS_SECONDS / 60 + COOLDOWN_SECONDS / 60
  }

  function getTotalSlotCount(booking) {
    return Math.ceil(getTotalBlockMinutes(booking) / SLOT_MINUTES)
  }

  function getBookingStartTimeString(booking) {
    const bookingTime = new Date(booking.appointment_time)
    return `${String(bookingTime.getHours()).padStart(2, '0')}:${String(bookingTime.getMinutes()).padStart(2, '0')}`
  }

  function getSlotDateTime(time) {
    return new Date(`${selectedDate}T${time}`)
  }

  function getBookingsForSelectedDate() {
    return bookings.filter((booking) => {
      if (!booking.appointment_time) return false
      return formatLocalDate(new Date(booking.appointment_time)) === selectedDate
    })
  }

  function doesBookingOverlap(bedId, startDateTime, minutes, ignoreBookingId = null) {
    const newStart = new Date(startDateTime)
    const newEnd = new Date(newStart.getTime() + (Number(minutes) + 6) * 60000)

    return getBookingsForSelectedDate().some((booking) => {
      if (booking.id === ignoreBookingId) return false
      if (booking.bed_id !== Number(bedId)) return false

      const existingStart = new Date(booking.appointment_time)
      const existingEnd = new Date(
        existingStart.getTime() + getTotalBlockMinutes(booking) * 60000
      )

      return newStart < existingEnd && newEnd > existingStart
    })
  }

  function hasUsedSunbedWithin24Hours(customerId, ignoreBookingId = null) {
    if (!customerId) return false

    const now = new Date()
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    return bookings.some((booking) => {
      if (booking.id === ignoreBookingId) return false
      if (booking.customer_id !== Number(customerId)) return false
      if (booking.status === 'no_show') return false

      const usageTime = booking.booking_start
        ? new Date(booking.booking_start)
        : booking.appointment_time
          ? new Date(booking.appointment_time)
          : null

      if (!usageTime) return false

      return usageTime >= last24Hours && usageTime <= now
    })
  }

  async function createBookingFromModal() {
    let customer = getSelectedCustomer()

    if (!customer && customerSearch.trim()) {
      const shouldCreate = window.confirm(
        `Create new customer "${customerSearch.trim()}"?`
      )

      if (!shouldCreate) return

      customer = await createNewCustomerFromSearch()
    }

    if (!customer || !modalSlot?.bedId || !modalSlot?.time) {
      alert('Please select or create a customer.')
      return
    }

    if (!customerHasEnoughMinutes(customer, selectedMinutes, modalSlot.bedId)) {
      alert(
        `${customer.name} only has ${getUsableMinutesForBed(customer, modalSlot.bedId)} usable mins for this bed. Please top up before booking ${selectedMinutes} mins.`
      )
      return
    }

    if (hasUsedSunbedWithin24Hours(customer.id)) {
      const override = window.confirm(
        `${customer.name} has used or booked a sunbed within the last 24 hours. Continue anyway?`
      )

      if (!override) return
    }

    const appointmentDateTime = new Date(`${selectedDate}T${modalSlot.time}`)

    if (doesBookingOverlap(modalSlot.bedId, appointmentDateTime, selectedMinutes)) {
      alert('This booking overlaps with another booking on the same bed.')
      return
    }

    const { error } = await supabase.from('Bookings').insert({
      customer_id: customer.id,
      customer_name: customer.name,
      customer_phone: customer.phone || null,
      customer_email: customer.email || null,
      bed_id: Number(modalSlot.bedId),
      minutes: Number(selectedMinutes),
      minutes_deducted: false,
      appointment_time: appointmentDateTime.toISOString(),
      status: 'booked',
      source: 'calendar'
    })

    if (!error) {
      closeModal()
      getBookings()
      getCustomers()
    } else {
      alert('Could not create booking.')
      console.log(error)
    }
  }

  async function saveEditedBooking() {
    let customer = getSelectedCustomer()

    if (!customer && customerSearch.trim()) {
      const shouldCreate = window.confirm(
        `Create new customer "${customerSearch.trim()}"?`
      )

      if (!shouldCreate) return

      customer = await createNewCustomerFromSearch()
    }

    if (!modalBooking || !customer || !editTime || !editBedId) {
      alert('Please complete the booking details.')
      return
    }

    if (
      !modalBooking.minutes_deducted &&
      !customerHasEnoughMinutes(customer, selectedMinutes, editBedId)
    ) {
      alert(
        `${customer.name} only has ${getUsableMinutesForBed(customer, editBedId)} usable mins for this bed. Please top up before booking ${selectedMinutes} mins.`
      )
      return
    }

    if (hasUsedSunbedWithin24Hours(customer.id, modalBooking.id)) {
      const override = window.confirm(
        `${customer.name} has used or booked a sunbed within the last 24 hours. Continue anyway?`
      )

      if (!override) return
    }

    const appointmentDateTime = new Date(`${selectedDate}T${editTime}`)

    if (
      doesBookingOverlap(
        editBedId,
        appointmentDateTime,
        selectedMinutes,
        modalBooking.id
      )
    ) {
      alert('This edited booking overlaps with another booking on the same bed.')
      return
    }

    const { error } = await supabase
      .from('Bookings')
      .update({
        customer_id: customer.id,
        customer_name: customer.name,
        customer_phone: customer.phone || null,
        customer_email: customer.email || null,
        bed_id: Number(editBedId),
        minutes: Number(selectedMinutes),
        appointment_time: appointmentDateTime.toISOString()
      })
      .eq('id', modalBooking.id)

    if (!error) {
      closeModal()
      getBookings()
      getCustomers()
    } else {
      alert('Could not update booking.')
      console.log(error)
    }
  }

  async function deleteBooking(booking) {
    const confirmed = window.confirm(
      `Delete booking for ${booking.customer_name}? This cannot be undone.`
    )

    if (!confirmed) return

    const { error } = await supabase
      .from('Bookings')
      .delete()
      .eq('id', booking.id)

    if (!error) {
      closeModal()
      getBookings()
    } else {
      alert('Could not delete booking.')
      console.log(error)
    }
  }

  async function updateBookingStatus(id, newStatus) {
    await supabase
      .from('Bookings')
      .update({ status: newStatus })
      .eq('id', id)

    closeModal()
    getBookings()
  }

  async function deductCustomerMinutesOnce(booking) {
    if (booking.minutes_deducted) return true

    const customerId = booking.customer_id
    if (!customerId) return true

    const customer = customers.find((c) => c.id === Number(customerId))
    if (!customer) return true

    const sessionMinutes = Number(booking.minutes || 0)
    const standardBalance = Number(customer.standard_minutes_balance || 0)
    const hybridBalance = Number(customer.hybrid_minutes_balance || 0)

    let newStandardBalance = standardBalance
    let newHybridBalance = hybridBalance

    if (Number(booking.bed_id) === 2) {
      if (hybridBalance < sessionMinutes) {
        alert(`${customer.name} only has ${hybridBalance} hybrid mins available. Bed 2 requires hybrid minutes.`)
        return false
      }

      newHybridBalance = hybridBalance - sessionMinutes
    } else {
      if (standardBalance + hybridBalance < sessionMinutes) {
        alert(`${customer.name} only has ${standardBalance + hybridBalance} usable mins available for this bed.`)
        return false
      }

      const standardUsed = Math.min(standardBalance, sessionMinutes)
      const hybridUsed = sessionMinutes - standardUsed

      newStandardBalance = standardBalance - standardUsed
      newHybridBalance = hybridBalance - hybridUsed
    }

    const { error: customerError } = await supabase
      .from('Customers')
      .update({
        standard_minutes_balance: newStandardBalance,
        hybrid_minutes_balance: newHybridBalance
      })
      .eq('id', customerId)

    if (customerError) {
      alert('Could not deduct customer minutes.')
      console.log(customerError)
      return false
    }

    const { error: bookingError } = await supabase
      .from('Bookings')
      .update({ minutes_deducted: true })
      .eq('id', booking.id)

    if (bookingError) {
      alert('Could not mark minutes as deducted.')
      console.log(bookingError)
      return false
    }

    await getCustomers()
    return true
  }

  async function startSession(booking) {
    const deducted = await deductCustomerMinutesOnce(booking)
    if (!deducted) return

    const now = new Date()
    const tanningStart = new Date(now.getTime() + UNDRESS_SECONDS * 1000)
    const tanningEnd = new Date(tanningStart.getTime() + booking.minutes * 60000)
    const cooldownEnd = new Date(tanningEnd.getTime() + COOLDOWN_SECONDS * 1000)

    await supabase
      .from('Bookings')
      .update({
        status: 'undressing',
        booking_start: now.toISOString(),
        booking_end: cooldownEnd.toISOString(),
        minutes_deducted: true
      })
      .eq('id', booking.id)

    closeModal()
    getBookings()
    getCustomers()
  }

  async function forceStop(booking) {
    await supabase
      .from('Bookings')
      .update({
        status: 'force_stopped',
        booking_end: new Date().toISOString()
      })
      .eq('id', booking.id)

    closeModal()
    getBookings()
  }

  async function autoCompleteFinishedSessions() {
    for (const booking of bookings) {
      if (
        booking.booking_end &&
        new Date(booking.booking_end) <= currentTime &&
        !['completed', 'force_stopped', 'no_show'].includes(booking.status)
      ) {
        await supabase
          .from('Bookings')
          .update({ status: 'completed' })
          .eq('id', booking.id)

        getBookings()
      }
    }
  }

  function getBedName(bedId) {
    const bed = beds.find((b) => b.id === bedId)
    return bed ? bed.name : `Bed ${bedId}`
  }

  function getCustomerForBooking(booking) {
    return customers.find((customer) => customer.id === Number(booking.customer_id))
  }

  function getBookingForBed(bedId) {
    const now = currentTime

    return bookings.find((booking) => {
      if (booking.bed_id !== bedId) return false
      if (['completed', 'no_show', 'force_stopped'].includes(booking.status)) return false
      if (!booking.appointment_time) return false

      const appointmentTime = new Date(booking.appointment_time)
      const minutesUntilBooking = (appointmentTime - now) / 60000

      return minutesUntilBooking <= 20 && minutesUntilBooking >= -20
    })
  }

  function getPhase(booking) {
    if (!booking?.booking_start || !booking?.booking_end) {
      return formatStatus(booking?.status || 'booked')
    }

    const start = new Date(booking.booking_start)
    const tanStart = new Date(start.getTime() + UNDRESS_SECONDS * 1000)
    const tanEnd = new Date(tanStart.getTime() + booking.minutes * 60000)
    const end = new Date(booking.booking_end)

    if (currentTime < tanStart) return 'Undressing'
    if (currentTime < tanEnd) return 'Running'
    if (currentTime < end) return 'Cooldown'

    return 'Completed'
  }

  function getRemainingTime(booking) {
    if (!booking?.booking_start || !booking?.booking_end) return null

    const start = new Date(booking.booking_start)
    const phase = getPhase(booking)

    let targetTime

    if (phase === 'Undressing') {
      targetTime = new Date(start.getTime() + UNDRESS_SECONDS * 1000)
    } else if (phase === 'Running') {
      targetTime = new Date(start.getTime() + UNDRESS_SECONDS * 1000 + booking.minutes * 60000)
    } else if (phase === 'Cooldown') {
      targetTime = new Date(booking.booking_end)
    } else {
      return '00:00'
    }

    const diff = targetTime - currentTime
    if (diff <= 0) return '00:00'

    const minutes = Math.floor(diff / 60000)
    const seconds = Math.floor((diff % 60000) / 1000)

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  function getBedColour(bedId) {
    const booking = getBookingForBed(bedId)

    if (!booking) return '#1f8b4c'

    const phase = getPhase(booking)

    if (phase === 'Booked') return '#1890ff'
    if (phase === 'Undressing') return '#fa8c16'
    if (phase === 'Running') return '#722ed1'
    if (phase === 'Cooldown') return '#13c2c2'

    return '#1e1e1e'
  }

  function getCalendarBookingColour(booking) {
    if (!booking) return 'transparent'

    const phase = getPhase(booking)

    if (booking.status === 'force_stopped') return '#cf1322'
    if (booking.status === 'no_show') return '#434343'
    if (phase === 'Booked') return '#1890ff'
    if (phase === 'Undressing') return '#fa8c16'
    if (phase === 'Running') return '#722ed1'
    if (phase === 'Cooldown') return '#13c2c2'
    if (phase === 'Completed') return '#389e0d'

    return '#1e1e1e'
  }

  function getCalendarBookingStartingAt(time, bedId) {
    return getBookingsForSelectedDate().find((booking) => {
      return getBookingStartTimeString(booking) === time && booking.bed_id === bedId
    })
  }

  function isSlotCoveredByEarlierBooking(time, bedId) {
    const slotTime = getSlotDateTime(time)

    return getBookingsForSelectedDate().some((booking) => {
      if (booking.bed_id !== bedId) return false
      if (getBookingStartTimeString(booking) === time) return false

      const start = new Date(booking.appointment_time)
      const end = new Date(start.getTime() + getTotalBlockMinutes(booking) * 60000)

      return slotTime > start && slotTime < end
    })
  }

  function resetPaymentFields(bedId = null) {
    setTopUpMinutes(0)
    setPurchaseOption(Number(bedId) === 2 ? 'hybrid_custom' : 'standard_custom')
    setPaymentMethod('card')
    setPaymentNotes('')
  }

  function openEmptySlot(time, bedId) {
    setModalBooking(null)
    setModalSlot({ time, bedId })
    setEditMode(false)
    setSelectedCustomerId('')
    setCustomerSearch('')
    setNewCustomerBalance(0)
    resetPaymentFields(bedId)
    setSelectedMinutes(12)
    setModalOpen(true)
  }

  function openBooking(booking) {
    const bookingTime = new Date(booking.appointment_time)

    setModalBooking(booking)
    setModalSlot(null)
    setEditMode(false)
    setSelectedCustomerId(booking.customer_id ? String(booking.customer_id) : '')
    setCustomerSearch(booking.customer_name || '')
    setNewCustomerBalance(0)
    resetPaymentFields(booking.bed_id)
    setSelectedMinutes(booking.minutes || 12)
    setEditBedId(String(booking.bed_id))
    setEditTime(`${String(bookingTime.getHours()).padStart(2, '0')}:${String(bookingTime.getMinutes()).padStart(2, '0')}`)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setModalBooking(null)
    setModalSlot(null)
    setEditMode(false)
    setSelectedCustomerId('')
    setCustomerSearch('')
    setNewCustomerBalance(0)
    resetPaymentFields()
    setSelectedMinutes(12)
    setEditTime('')
    setEditBedId('')
  }

  function renderCustomerSearchBox() {
    const selectedCustomer = getSelectedCustomer()
    const filteredCustomers = getFilteredCustomers()
    const activeBedId = modalSlot?.bedId || editBedId || modalBooking?.bed_id

    return (
      <div style={{ marginBottom: '12px' }}>
        <input
          placeholder="Start typing customer name..."
          value={customerSearch}
          onChange={(e) => {
            setCustomerSearch(e.target.value)
            setSelectedCustomerId('')
          }}
          style={{ width: '100%', padding: '12px', marginBottom: '8px' }}
        />

        {customerSearch && !selectedCustomer && filteredCustomers.length > 0 && (
          <div style={{ background: '#111', border: '1px solid #555', borderRadius: '10px', marginBottom: '8px', maxHeight: '160px', overflowY: 'auto' }}>
            {filteredCustomers.map((customer) => (
              <div
                key={customer.id}
                onClick={() => {
                  setSelectedCustomerId(String(customer.id))
                  setCustomerSearch(customer.name)
                }}
                style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid #333' }}
              >
                <strong>{customer.name}</strong> — Standard {customer.standard_minutes_balance || 0} mins / Hybrid {customer.hybrid_minutes_balance || 0} mins
              </div>
            ))}
          </div>
        )}

        {customerSearch && !selectedCustomer && filteredCustomers.length === 0 && (
          <div style={{ background: '#111', padding: '12px', borderRadius: '10px', marginBottom: '8px' }}>
            <p>No customer found.</p>

            <label>Starting standard minutes:</label>

            <input
              type="number"
              value={newCustomerBalance}
              onChange={(e) => setNewCustomerBalance(e.target.value)}
              style={{ width: '100%', padding: '10px', marginTop: '6px', marginBottom: '8px' }}
            />

            <button onClick={createNewCustomerFromSearch}>
              Create New Customer
            </button>
          </div>
        )}

        {selectedCustomer && (
          <div style={{ background: '#111', padding: '12px', borderRadius: '10px' }}>
            <strong>{selectedCustomer.name}</strong>

            <div style={{ background: '#0b0b0b', padding: '15px', borderRadius: '10px', marginTop: '12px', border: '1px solid #333', textAlign: 'center' }}>
              <p style={{ margin: '5px 0' }}>
                Standard balance: <strong>{selectedCustomer.standard_minutes_balance || 0} mins</strong>
              </p>

              <p style={{ margin: '5px 0' }}>
                Hybrid balance: <strong>{selectedCustomer.hybrid_minutes_balance || 0} mins</strong>
              </p>

              <p style={{ marginTop: '12px', fontSize: '18px' }}>
                Usable for this bed: <strong>{getUsableMinutesForBed(selectedCustomer, activeBedId)} mins</strong>
              </p>
            </div>

            {!customerHasEnoughMinutes(selectedCustomer, selectedMinutes, activeBedId) && (
              <p style={{ color: '#ff7875', fontWeight: 'bold' }}>
                Not enough usable minutes for this bed. Please top up first.
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  function renderTopUpSection() {
    const selectedCustomer = getSelectedCustomer()
    const purchase = getPurchaseDetails()
    const isCustom = purchase.minutes === null

    if (!selectedCustomer) return null

    return (
      <div style={{ background: '#111', padding: '16px', borderRadius: '14px', marginTop: '15px', marginBottom: '15px', border: '1px solid #333' }}>
        <h3 style={{ marginTop: 0 }}>Top up minutes</h3>

        <select
          value={purchaseOption}
          onChange={(e) => {
            setPurchaseOption(e.target.value)
            setTopUpMinutes(0)
          }}
          style={{ width: '100%', padding: '10px', marginBottom: '8px' }}
        >
          <option value="standard_custom">Custom Standard - Bed 1/3 - £1.05 per min</option>
          <option value="hybrid_custom">Custom Hybrid - Any Bed - £1.15 per min</option>
          <option value="standard_50">Standard Package - 50 mins - £42.50</option>
          <option value="standard_80">Standard Package - 80 mins - £67.50</option>
          <option value="standard_120">Standard Package - 120 mins - £87.50</option>
          <option value="hybrid_50">Hybrid Package - 50 mins - £45.50</option>
          <option value="hybrid_80">Hybrid Package - 80 mins - £72.50</option>
          <option value="hybrid_120">Hybrid Package - 120 mins - £92.50</option>
        </select>

        {isCustom ? (
          <input
            type="number"
            placeholder="Minutes to add"
            value={topUpMinutes}
            onChange={(e) => setTopUpMinutes(e.target.value)}
            style={{ width: '100%', padding: '10px', marginBottom: '8px' }}
          />
        ) : (
          <p style={{ margin: '8px 0' }}>
            Minutes to add: <strong>{purchase.minutes} mins</strong>
          </p>
        )}

        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          style={{ width: '100%', padding: '10px', marginBottom: '8px' }}
        >
          <option value="card">Card</option>
          <option value="cash">Cash</option>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="other">Other</option>
        </select>

        <input
          placeholder="Payment notes optional"
          value={paymentNotes}
          onChange={(e) => setPaymentNotes(e.target.value)}
          style={{ width: '100%', padding: '10px', marginBottom: '8px' }}
        />

        <p>
          Total to pay: <strong>£{purchase.total.toFixed(2)}</strong>
        </p>

        <button onClick={topUpSelectedCustomer}>
          Payment Taken + Add Minutes
        </button>
      </div>
    )
  }

  const upcomingBookings = getUpcomingBookingsWithin20Minutes()

  return (
    <div style={{ padding: '40px', background: '#050505', minHeight: '100vh', color: 'white' }}>
      <div className="glow-header">
        <img
          src="/logo.png"
          alt="Glow Tanning"
          style={{ height: '120px', objectFit: 'contain', filter: 'drop-shadow(0 0 20px rgba(255,200,50,0.35))' }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', alignItems: 'center', background: '#1e1e1e', padding: '20px', borderRadius: '18px', marginBottom: '30px' }}>
        <div style={{ minWidth: '220px' }}>
          <h2 style={{ margin: 0, marginBottom: '10px' }}>Live Time</h2>
          <h1 style={{ margin: 0, fontSize: '38px', lineHeight: '38px', fontWeight: 'bold' }}>{formatClock(currentTime)}</h1>
          <p style={{ marginTop: '12px', fontSize: '20px', opacity: 0.9 }}>{currentTime.toLocaleDateString('en-GB')}</p>
        </div>

        <div style={{ flex: 1 }}>
          <h2 style={{ marginTop: 0 }}>Upcoming within 20 minutes</h2>

          {upcomingBookings.length === 0 ? (
            <p>No bookings due in the next 20 minutes.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              {upcomingBookings.map((booking) => (
                <div
                  key={booking.id}
                  onClick={() => openBooking(booking)}
                  style={{ background: getCalendarBookingColour(booking), padding: '12px', borderRadius: '12px', cursor: 'pointer' }}
                >
                  <strong>{booking.customer_name}</strong>
                  <br />
                  {new Date(booking.appointment_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} — {getBedName(booking.bed_id)}
                  <br />
                  {booking.minutes} mins
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <h2 style={{ textAlign: 'center' }}>Sunbeds</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '50px' }}>
        {beds.map((bed) => {
          const booking = getBookingForBed(bed.id)
          const phase = getPhase(booking)

          return (
            <div key={bed.id} style={{ background: getBedColour(bed.id), padding: '25px', borderRadius: '20px' }}>
              <h2>{bed.name}</h2>
              <p>T-Max Room: {bed.tmax_room}</p>

              {booking ? (
                <>
                  <p>Customer: <strong>{booking.customer_name}</strong></p>
                  <p>Minutes: <strong>{booking.minutes}</strong></p>
                  <p>Phase: <strong>{phase}</strong></p>
                  {['Undressing', 'Running', 'Cooldown'].includes(phase) && <h1>{getRemainingTime(booking)}</h1>}
                </>
              ) : (
                <p><strong>AVAILABLE</strong></p>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', marginBottom: '20px' }}>
        <h2>Daily Calendar</h2>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button onClick={jumpToNow}>
            Jump to Now
          </button>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>
      </div>

      <div style={{ overflowX: 'auto', background: '#1e1e1e', borderRadius: '16px', padding: '20px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #444', padding: '10px' }}>Time</th>
              {beds.map((bed) => (
                <th key={bed.id} style={{ border: '1px solid #444', padding: '10px' }}>{bed.name}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {generateTimeSlots().map((time) => {
              const currentRow = isCurrentTimeSlot(time)

              return (
                <tr
                  key={time}
                  data-current-time-row={currentRow ? 'true' : undefined}
                  style={{ borderTop: currentRow ? '4px solid #ff4d4f' : 'none', boxShadow: currentRow ? '0 -2px 8px rgba(255,77,79,0.8)' : 'none' }}
                >
                  <td style={{ border: '1px solid #444', padding: '8px', fontWeight: 'bold', width: '90px', background: currentRow ? '#ff4d4f' : 'transparent', color: 'white' }}>
                    {time}
                    {currentRow && (
                      <>
                        <br />
                        <span style={{ fontSize: '12px' }}>NOW</span>
                      </>
                    )}
                  </td>

                  {beds.map((bed) => {
                    if (isSlotCoveredByEarlierBooking(time, bed.id)) return null

                    const booking = getCalendarBookingStartingAt(time, bed.id)

                    return (
                      <td
                        key={bed.id}
                        rowSpan={booking ? getTotalSlotCount(booking) : 1}
                        onClick={() => booking ? openBooking(booking) : openEmptySlot(time, bed.id)}
                        style={{ border: currentRow ? '2px solid #ff4d4f' : '1px solid #444', padding: '8px', minHeight: '40px', background: getCalendarBookingColour(booking), cursor: 'pointer', verticalAlign: 'top' }}
                      >
                        {booking ? (
                          <div>
                            <strong>{booking.customer_name}</strong>
                            <br />
                            {booking.minutes} mins
                            <br />
                            Blocked: {getTotalBlockMinutes(booking)} mins
                            <br />
                            {getPhase(booking)}
                          </div>
                        ) : (
                          <span style={{ color: '#555' }}>+</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: '#1e1e1e', padding: '30px', borderRadius: '20px', width: '460px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
            {!modalBooking ? (
              <>
                <h2>Create Booking</h2>
                <p>{getBedName(modalSlot?.bedId)} at {modalSlot?.time}</p>

                {renderCustomerSearchBox()}

                <select value={selectedMinutes} onChange={(e) => setSelectedMinutes(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '12px' }}>
                  {Array.from({ length: 18 }, (_, i) => i + 3).map((minute) => (
                    <option key={minute} value={minute}>{minute} mins</option>
                  ))}
                </select>

                <p>Total blocked time: <strong>{Number(selectedMinutes) + 6} mins</strong></p>

                {renderTopUpSection()}

                <button onClick={createBookingFromModal}>Create Booking</button>
                <button onClick={closeModal} style={{ marginLeft: '10px' }}>Cancel</button>
              </>
            ) : editMode ? (
              <>
                <h2>Edit Booking</h2>

                {renderCustomerSearchBox()}

                <select value={editTime} onChange={(e) => setEditTime(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '12px' }}>
                  {generateTimeSlots().map((time) => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>

                <select value={editBedId} onChange={(e) => setEditBedId(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '12px' }}>
                  {beds.map((bed) => (
                    <option key={bed.id} value={bed.id}>{bed.name}</option>
                  ))}
                </select>

                <select value={selectedMinutes} onChange={(e) => setSelectedMinutes(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '12px' }}>
                  {Array.from({ length: 18 }, (_, i) => i + 3).map((minute) => (
                    <option key={minute} value={minute}>{minute} mins</option>
                  ))}
                </select>

                <p>Total blocked time: <strong>{Number(selectedMinutes) + 6} mins</strong></p>

                {renderTopUpSection()}

                <button onClick={saveEditedBooking}>Save Changes</button>
                <button onClick={() => setEditMode(false)} style={{ marginLeft: '10px' }}>Cancel</button>
              </>
            ) : (
              <>
                <h2>{modalBooking.customer_name}</h2>
                <p>{getBedName(modalBooking.bed_id)}</p>
                <p>Appointment: {new Date(modalBooking.appointment_time).toLocaleString('en-GB')}</p>
                <p>Minutes: {modalBooking.minutes}</p>

                {getCustomerForBooking(modalBooking) && (
                  <>
                    <p>Standard balance: <strong>{getCustomerForBooking(modalBooking).standard_minutes_balance || 0} mins</strong></p>
                    <p>Hybrid balance: <strong>{getCustomerForBooking(modalBooking).hybrid_minutes_balance || 0} mins</strong></p>
                  </>
                )}

                <p>Total blocked time: {getTotalBlockMinutes(modalBooking)} mins</p>
                <p>Phase: <strong>{getPhase(modalBooking)}</strong></p>

                {['Undressing', 'Running', 'Cooldown'].includes(getPhase(modalBooking)) && (
                  <h2>Remaining: {getRemainingTime(modalBooking)}</h2>
                )}

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '20px' }}>
                  <button onClick={() => startSession(modalBooking)}>Start Session</button>
                  <button onClick={() => updateBookingStatus(modalBooking.id, 'completed')}>Complete</button>
                  <button onClick={() => forceStop(modalBooking)}>Force Stop</button>
                  <button onClick={() => updateBookingStatus(modalBooking.id, 'no_show')}>No Show</button>
                  <button onClick={() => updateBookingStatus(modalBooking.id, 'booked')}>Reset</button>
                  <button onClick={() => setEditMode(true)}>Edit</button>
                  <button onClick={() => deleteBooking(modalBooking)}>Delete</button>
                  <button onClick={closeModal}>Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App