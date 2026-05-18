import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import './App.css'

const UNDRESS_SECONDS = 180
const COOLDOWN_SECONDS = 180
const SLOT_MINUTES = 5
const MANAGER_PIN = '3090'
const WEEKLY_STAFF_FREE_MINUTES = 18
const LOW_STOCK_THRESHOLD = 5

const DEFAULT_STAFF = [
  { name: 'Charlie', role: 'manager' },
  { name: 'Jazz', role: 'manager' },
  { name: 'Kayla', role: 'staff' },
  { name: 'Nadia', role: 'staff' },
  { name: 'Mia', role: 'staff' },
  { name: 'Tia', role: 'staff' },
  { name: 'Rosie', role: 'staff' }
]

const PURCHASE_OPTIONS = {
  standard_custom: { type: 'standard', name: 'Custom Standard Minutes', label: 'Custom Standard - Bed 1/3 - £1.05 per min', pricePerMinute: 1.05, minutes: null, total: null },
  hybrid_custom: { type: 'hybrid', name: 'Custom Hybrid Minutes', label: 'Custom Hybrid - Any Bed - £1.15 per min', pricePerMinute: 1.15, minutes: null, total: null },
  standard_50: { type: 'standard', name: 'Standard 50 mins', label: 'Standard Package - 50 mins - £42.50', pricePerMinute: 42.5 / 50, minutes: 50, total: 42.5 },
  standard_80: { type: 'standard', name: 'Standard 80 mins', label: 'Standard Package - 80 mins - £67.50', pricePerMinute: 67.5 / 80, minutes: 80, total: 67.5 },
  standard_120: { type: 'standard', name: 'Standard 120 mins', label: 'Standard Package - 120 mins - £87.50', pricePerMinute: 87.5 / 120, minutes: 120, total: 87.5 },
  hybrid_50: { type: 'hybrid', name: 'Hybrid 50 mins', label: 'Hybrid Package - 50 mins - £45.50', pricePerMinute: 45.5 / 50, minutes: 50, total: 45.5 },
  hybrid_80: { type: 'hybrid', name: 'Hybrid 80 mins', label: 'Hybrid Package - 80 mins - £72.50', pricePerMinute: 72.5 / 80, minutes: 80, total: 72.5 },
  hybrid_120: { type: 'hybrid', name: 'Hybrid 120 mins', label: 'Hybrid Package - 120 mins - £92.50', pricePerMinute: 92.5 / 120, minutes: 120, total: 92.5 }
}

function App() {
  const [beds, setBeds] = useState([])
  const [bookings, setBookings] = useState([])
  const [customers, setCustomers] = useState([])
  const [staff, setStaff] = useState([])
  const [products, setProducts] = useState([])
  const [currentTime, setCurrentTime] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(formatLocalDate(new Date()))

  const [modalOpen, setModalOpen] = useState(false)
  const [modalBooking, setModalBooking] = useState(null)
  const [modalSlot, setModalSlot] = useState(null)
  const [editMode, setEditMode] = useState(false)

  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [selectedStaffAsCustomerId, setSelectedStaffAsCustomerId] = useState('')
  const [newCustomerBalance, setNewCustomerBalance] = useState(0)

  const [purchaseOption, setPurchaseOption] = useState('standard_custom')
  const [topUpMinutes, setTopUpMinutes] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('card')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [cashReceived, setCashReceived] = useState('')
  const [selectedMinutes, setSelectedMinutes] = useState(12)
  const [editTime, setEditTime] = useState('')
  const [editBedId, setEditBedId] = useState('')

  const [showCustomerManagement, setShowCustomerManagement] = useState(false)
  const [showManagerView, setShowManagerView] = useState(false)
  const [collapseStaffManagement, setCollapseStaffManagement] = useState(true)
  const [collapseMaintenance, setCollapseMaintenance] = useState(true)
  const [collapseProducts, setCollapseProducts] = useState(true)
  const [collapseCashUp, setCollapseCashUp] = useState(true)
  const [collapseDailyTakings, setCollapseDailyTakings] = useState(true)
  const [selectedProductManagementId, setSelectedProductManagementId] = useState('')
  const [customerManagerSearch, setCustomerManagerSearch] = useState('')
  const [selectedManagerCustomerId, setSelectedManagerCustomerId] = useState('')
  const [managerName, setManagerName] = useState('')
  const [managerPhone, setManagerPhone] = useState('')
  const [managerEmail, setManagerEmail] = useState('')
  const [managerDateOfBirth, setManagerDateOfBirth] = useState('')
  const [managerNotes, setManagerNotes] = useState('')
  const [managerStandardBalance, setManagerStandardBalance] = useState(0)
  const [managerHybridBalance, setManagerHybridBalance] = useState(0)
  const [customerPayments, setCustomerPayments] = useState([])
  const [customerLogs, setCustomerLogs] = useState([])

  const [showMinuteCorrection, setShowMinuteCorrection] = useState(false)
  const [correctionType, setCorrectionType] = useState('move_standard_to_hybrid')
  const [correctionBalance, setCorrectionBalance] = useState('standard')
  const [correctionAmount, setCorrectionAmount] = useState('')
  const [correctionReason, setCorrectionReason] = useState('')

  const [collapseCorrections, setCollapseCorrections] = useState(true)
  const [managerCorrectionCustomerId, setManagerCorrectionCustomerId] = useState('')
  const [managerCorrectionType, setManagerCorrectionType] = useState('reverse_standard_topup')
  const [managerCorrectionAmount, setManagerCorrectionAmount] = useState('')
  const [managerCorrectionMoneyAmount, setManagerCorrectionMoneyAmount] = useState('')
  const [managerCorrectionPaymentMethod, setManagerCorrectionPaymentMethod] = useState('card')
  const [managerCorrectionReason, setManagerCorrectionReason] = useState('')

  const [dailyTakings, setDailyTakings] = useState([])
  const [dailyProductSales, setDailyProductSales] = useState([])
  const [cashUpActualCash, setCashUpActualCash] = useState('')
  const [cashUpVarianceNotes, setCashUpVarianceNotes] = useState('')
  const [cashUpManagerName, setCashUpManagerName] = useState('')
  const [cashUpSaving, setCashUpSaving] = useState(false)

  const [currentStaffUserId, setCurrentStaffUserId] = useState('')
  const [staffSelectorOpen, setStaffSelectorOpen] = useState(false)
  const [staffLoadError, setStaffLoadError] = useState('')
  const [staffName, setStaffName] = useState('')
  const [staffRole, setStaffRole] = useState('staff')
  const [staffEditingId, setStaffEditingId] = useState('')
  const [staffAdjustmentId, setStaffAdjustmentId] = useState('')
  const [staffAdjustmentAmount, setStaffAdjustmentAmount] = useState('')
  const [staffAdjustmentReason, setStaffAdjustmentReason] = useState('')

  const [productLoadError, setProductLoadError] = useState('')
  const [productCart, setProductCart] = useState([])
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [showStandalonePOS, setShowStandalonePOS] = useState(false)
  const [posPaymentMethod, setPosPaymentMethod] = useState('card')
  const [productName, setProductName] = useState('')
  const [productCategory, setProductCategory] = useState('tanning_lotions')
  const [productPrice, setProductPrice] = useState('')
  const [productStockQuantity, setProductStockQuantity] = useState('')
  const [productEditingId, setProductEditingId] = useState('')

  const [showBackToTop, setShowBackToTop] = useState(false)

  useEffect(() => {
    getBeds()
    getBookings()
    getCustomers()
    getStaff()
    getProducts()
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    autoCompleteFinishedSessions()
  }, [currentTime, bookings])

  useEffect(() => {
    getDailyTakings()
  }, [selectedDate])

  useEffect(() => {
    function handleScroll() {
      setShowBackToTop(window.scrollY > 500)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  function formatLocalDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  function formatStatus(text) {
    if (!text) return ''
    return String(text).replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  }

  function formatClock(date) {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  function calculateAge(dateOfBirth) {
    if (!dateOfBirth) return null
    const dob = new Date(dateOfBirth)
    if (Number.isNaN(dob.getTime())) return null
    const todayDate = new Date()
    let age = todayDate.getFullYear() - dob.getFullYear()
    const monthDifference = todayDate.getMonth() - dob.getMonth()
    if (monthDifference < 0 || (monthDifference === 0 && todayDate.getDate() < dob.getDate())) age -= 1
    return age
  }

  function isCustomerUnder18(customer) {
    const age = calculateAge(customer?.date_of_birth)
    return age !== null && age < 18
  }

  function getCustomerAgeText(customer) {
    if (!customer?.date_of_birth) return 'DOB not recorded'
    const age = calculateAge(customer.date_of_birth)
    if (age === null) return 'DOB invalid'
    return `DOB: ${new Date(customer.date_of_birth).toLocaleDateString('en-GB')} — Age ${age}`
  }

  function checkCustomerAgeBeforeSunbed(customer) {
    if (!customer) return false
    if (!customer.date_of_birth) {
      return window.confirm(`${customer.name} does not have a date of birth recorded. Continue anyway?`)
    }
    if (isCustomerUnder18(customer)) {
      alert(`${customer.name} is under 18 and cannot use the sunbed.`)
      return false
    }
    return true
  }

  async function getBeds() {
    const { data } = await supabase.from('Beds').select('*').order('id')
    if (data) setBeds(data)
  }

  async function getBookings() {
    const { data } = await supabase.from('Bookings').select('*').order('appointment_time', { ascending: true })
    if (data) setBookings(data)
  }

  async function getCustomers() {
    const { data } = await supabase.from('Customers').select('*').eq('is_active', true).order('name', { ascending: true })
    if (data) setCustomers(data)
  }

  function getWeekStartDateString(date = new Date()) {
    const weekStart = new Date(date)
    const day = weekStart.getDay()
    const diff = day === 0 ? -6 : 1 - day
    weekStart.setDate(weekStart.getDate() + diff)
    weekStart.setHours(0, 0, 0, 0)
    return formatLocalDate(weekStart)
  }

  async function getStaff() {
    const { data, error } = await supabase.from('Staff').select('*').order('name', { ascending: true })
    if (error) {
      setStaffLoadError(error.message || 'Could not load Staff table.')
      setStaff(DEFAULT_STAFF.map((member, index) => ({
        id: `default-${index}`,
        ...member,
        is_active: true,
        weekly_free_minutes_balance: WEEKLY_STAFF_FREE_MINUTES,
        last_weekly_reset_date: getWeekStartDateString()
      })))
      return
    }

    setStaffLoadError('')

    if (data && data.length === 0) {
      await supabase.from('Staff').insert(DEFAULT_STAFF.map((member) => ({
        ...member,
        is_active: true,
        weekly_free_minutes_balance: WEEKLY_STAFF_FREE_MINUTES,
        last_weekly_reset_date: getWeekStartDateString()
      })))
      getStaff()
      return
    }

    const weekStart = getWeekStartDateString()
    const resetStaff = []

    for (const member of data || []) {
      if (member.is_active && member.last_weekly_reset_date !== weekStart) {
        const updatedMember = { ...member, weekly_free_minutes_balance: WEEKLY_STAFF_FREE_MINUTES, last_weekly_reset_date: weekStart }
        resetStaff.push(updatedMember)
        await supabase.from('Staff').update({
          weekly_free_minutes_balance: WEEKLY_STAFF_FREE_MINUTES,
          last_weekly_reset_date: weekStart
        }).eq('id', member.id)
        await createStaffLog(member, 'Weekly free minutes reset', `Weekly free minutes reset to ${WEEKLY_STAFF_FREE_MINUTES}.`)
      } else {
        resetStaff.push(member)
      }
    }

    setStaff(resetStaff)
  }

  async function createStaffLog(member, action, details) {
    if (!member || String(member.id).startsWith('default-')) return
    await supabase.from('StaffLogs').insert({ staff_id: member.id, staff_name: member.name, action, details })
  }

  async function getProducts() {
    const { data, error } = await supabase.from('Products').select('*').order('name', { ascending: true })
    if (error) {
      setProductLoadError(error.message || 'Could not load Products table.')
      setProducts([])
      return
    }
    setProductLoadError('')
    setProducts(data || [])
  }

  async function getDailyTakings() {
    const dayStart = new Date(`${selectedDate}T00:00:00`)
    const dayEnd = new Date(`${selectedDate}T23:59:59.999`)
    const { data } = await supabase.from('Payments').select('*').gte('created_at', dayStart.toISOString()).lte('created_at', dayEnd.toISOString()).order('created_at', { ascending: false })
    setDailyTakings(data || [])
    const { data: productSalesData } = await supabase.from('ProductSales').select('*').gte('created_at', dayStart.toISOString()).lte('created_at', dayEnd.toISOString()).order('created_at', { ascending: false })
    setDailyProductSales(productSalesData || [])
  }

  function getDailyTakingsSummary() {
    const base = { totalRevenue: 0, cardTotal: 0, cashTotal: 0, bankTransferTotal: 0, otherTotal: 0, totalMinutes: 0, paymentCount: 0, productRevenue: 0, minutesRevenue: 0 }
    for (const payment of dailyTakings) {
      const amount = Number(payment.total_amount || 0)
      const minutes = Number(payment.minutes_added || 0)
      base.totalRevenue += amount
      base.minutesRevenue += amount
      base.totalMinutes += minutes
      base.paymentCount += 1
      if (payment.payment_method === 'card') base.cardTotal += amount
      else if (payment.payment_method === 'cash') base.cashTotal += amount
      else if (payment.payment_method === 'bank_transfer') base.bankTransferTotal += amount
      else base.otherTotal += amount
    }
    for (const sale of dailyProductSales) {
      const amount = Number(sale.total_amount || 0)
      base.totalRevenue += amount
      base.productRevenue += amount
      base.paymentCount += 1
      if (sale.payment_method === 'card') base.cardTotal += amount
      else if (sale.payment_method === 'cash') base.cashTotal += amount
      else if (sale.payment_method === 'bank_transfer') base.bankTransferTotal += amount
      else base.otherTotal += amount
    }
    return base
  }

  function openManagerView() {
    if (!requireStaffSignIn()) return

    const pin = window.prompt('Manager PIN required:')
    if (pin !== MANAGER_PIN) {
      alert('Incorrect manager PIN.')
      return
    }
    setShowManagerView(true)
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function jumpToNow() {
    setSelectedDate(formatLocalDate(new Date()))
    setTimeout(() => {
      const nowRow = document.querySelector('[data-current-time-row="true"]')
      if (nowRow) nowRow.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
  }

  function generateTimeSlots(start = '08:00', end = '21:00') {
    const slots = []
    const [startHour, startMinute] = start.split(':').map(Number)
    const [endHour, endMinute] = end.split(':').map(Number)
    const startDate = new Date()
    startDate.setHours(startHour, startMinute, 0, 0)
    const endDate = new Date()
    endDate.setHours(endHour, endMinute, 0, 0)
    let slot = new Date(startDate)
    while (slot <= endDate) {
      slots.push(`${String(slot.getHours()).padStart(2, '0')}:${String(slot.getMinutes()).padStart(2, '0')}`)
      slot = new Date(slot.getTime() + SLOT_MINUTES * 60000)
    }
    return slots
  }

  function getSelectedCustomer() {
    return customers.find((customer) => customer.id === Number(selectedCustomerId))
  }

  function getSelectedStaffAsCustomer() {
    return staff.find((member) => String(member.id) === String(selectedStaffAsCustomerId))
  }

  function getCurrentStaffUser() {
    return staff.find((member) => String(member.id) === String(currentStaffUserId))
  }

  function requireStaffSignIn() {
    if (getCurrentStaffUser()) return true
    alert('Please sign in as staff first.')
    setStaffSelectorOpen(true)
    return false
  }

  function selectCurrentStaffUser(member) {
    setCurrentStaffUserId(String(member.id))
    setStaffSelectorOpen(false)
  }

  function isStaffFreeBooking(booking) {
    return typeof booking?.source === 'string' && booking.source.startsWith('staff_free:')
  }

  function isShopTestBooking(booking) {
    return booking?.source === 'shop_test'
  }

  function getStaffIdFromBooking(booking) {
    if (!isStaffFreeBooking(booking)) return null
    return booking.source.replace('staff_free:', '')
  }

  function getFilteredCustomerAndStaffOptions() {
    if (!customerSearch.trim()) return []
    const query = customerSearch.toLowerCase()
    const customerOptions = customers
      .filter((customer) => customer.name?.toLowerCase().includes(query))
      .map((customer) => ({ kind: 'customer', id: customer.id, label: customer.name, record: customer }))

    const staffOptions = staff
      .filter((member) => member.is_active !== false && member.name?.toLowerCase().includes(query))
      .map((member) => ({ kind: 'staff', id: member.id, label: `${member.name} - Staff`, record: member }))

    return [...customerOptions, ...staffOptions]
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

  function getStaffUsableMinutes(member) {
    return Number(member?.weekly_free_minutes_balance || 0)
  }

  function staffHasEnoughMinutes(member, minutes) {
    return getStaffUsableMinutes(member) >= Number(minutes || 0)
  }

  function getPurchaseDetails() {
    const selected = PURCHASE_OPTIONS[purchaseOption] || PURCHASE_OPTIONS.standard_custom
    const isCustom = selected.minutes === null
    const minutes = isCustom ? Number(topUpMinutes || 0) : selected.minutes
    const total = isCustom ? Number((minutes * selected.pricePerMinute).toFixed(2)) : selected.total
    return { ...selected, isCustom, minutes, total }
  }

  function getActiveProducts() {
    return products.filter((product) => product.is_active !== false)
  }

  function getProductStockQuantity(product) {
    return Number(product?.stock_quantity || 0)
  }

  function getProductStockStatus(product) {
    const stock = getProductStockQuantity(product)
    if (stock <= 0) return 'Out of stock'
    if (stock <= LOW_STOCK_THRESHOLD) return 'Low stock'
    return 'In stock'
  }

  function getProductStockStatusStyle(product) {
    const status = getProductStockStatus(product)
    if (status === 'Out of stock') return { color: '#ff7875', fontWeight: 'bold' }
    if (status === 'Low stock') return { color: '#ffcc66', fontWeight: 'bold' }
    return { color: '#d4a853', fontWeight: 'bold' }
  }

  function getLowStockProducts() {
    return getActiveProducts().filter((product) => getProductStockQuantity(product) > 0 && getProductStockQuantity(product) <= LOW_STOCK_THRESHOLD)
  }

  function getOutOfStockProducts() {
    return getActiveProducts().filter((product) => getProductStockQuantity(product) <= 0)
  }

  function getProductCartTotal() {
    return productCart.reduce((total, item) => total + Number(item.price || 0) * Number(item.quantity || 0), 0)
  }

  function addProductToCart(product) {
    if (!requireStaffSignIn()) return

    const stock = getProductStockQuantity(product)
    const existing = productCart.find((item) => item.product_id === product.id)
    const nextQuantity = Number(existing?.quantity || 0) + 1

    if (stock <= 0) {
      alert(`${product.name} is out of stock and cannot be sold.`)
      return
    }

    if (nextQuantity > stock) {
      alert(`${product.name} only has ${stock} in stock.`)
      return
    }

    setProductCart((cart) => {
      const existing = cart.find((item) => item.product_id === product.id)
      if (existing) {
        return cart.map((item) => item.product_id === product.id ? { ...item, quantity: Number(item.quantity || 0) + 1 } : item)
      }
      return [...cart, {
        product_id: product.id,
        product_name: product.name,
        category: product.category,
        price: Number(product.price || 0),
        quantity: 1,
        stock_quantity: product.stock_quantity
      }]
    })
  }

  function updateProductCartQuantity(productId, quantity) {
    const nextQuantity = Number(quantity || 0)
    const product = products.find((entry) => entry.id === productId)
    const stock = getProductStockQuantity(product)

    if (nextQuantity > stock) {
      alert(`${product?.name || 'This product'} only has ${stock} in stock.`)
      return
    }

    setProductCart((cart) => nextQuantity <= 0 ? cart.filter((item) => item.product_id !== productId) : cart.map((item) => item.product_id === productId ? { ...item, quantity: nextQuantity } : item))
  }

  function clearProductCart() {
    setProductCart([])
  }

  async function recordProductSales({ paymentMethodForSale, customer = null }) {
    if (productCart.length === 0) return true

    for (const item of productCart) {
      const product = products.find((entry) => entry.id === item.product_id)
      const quantity = Number(item.quantity || 0)
      const stock = getProductStockQuantity(product)
      if (stock <= 0) {
        alert(`${item.product_name} is out of stock and cannot be sold.`)
        return false
      }
      if (quantity > stock) {
        alert(`${item.product_name} only has ${stock} in stock.`)
        return false
      }
    }

    const lowStockAfterSale = productCart
      .map((item) => {
        const product = products.find((entry) => entry.id === item.product_id)
        const stock = getProductStockQuantity(product)
        const remaining = stock - Number(item.quantity || 0)
        return { name: item.product_name, remaining }
      })
      .filter((item) => item.remaining > 0 && item.remaining <= LOW_STOCK_THRESHOLD)

    if (lowStockAfterSale.length > 0) {
      const confirmed = window.confirm(`Stock will be low after this sale:\n\n${lowStockAfterSale.map((item) => `${item.name}: ${item.remaining} left`).join('\n')}\n\nContinue with sale?`)
      if (!confirmed) return false
    }

    const salesRows = productCart.map((item) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      category: item.category,
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.price || 0),
      total_amount: Number((Number(item.price || 0) * Number(item.quantity || 0)).toFixed(2)),
      payment_method: paymentMethodForSale,
      customer_id: customer?.id || null,
      customer_name: customer?.name || null
    }))

    const { error } = await supabase.from('ProductSales').insert(salesRows)
    if (error) {
      alert('Could not record product sale.')
      console.log(error)
      return false
    }

    for (const item of productCart) {
      const product = products.find((entry) => entry.id === item.product_id)
      const stock = getProductStockQuantity(product)
      const quantity = Number(item.quantity || 0)
      await supabase.from('Products').update({ stock_quantity: Math.max(0, stock - quantity) }).eq('id', item.product_id)
    }

    clearProductCart()
    await getProducts()
    await getDailyTakings()
    return true
  }


  async function createCorrectionLog(payload) {
    const staffUser = getCurrentStaffUser()

    const { error } = await supabase.from('CorrectionLogs').insert({
      ...payload,
      staff_name: staffUser?.name || null,
      manager_pin_used: true
    })

    if (error) {
      alert('Correction was applied but could not be written to CorrectionLogs. Check the CorrectionLogs table.')
      console.log(error)
      return false
    }

    return true
  }

  async function applyManagerCorrection() {
    if (!requireStaffSignIn()) return

    const pin = window.prompt('Manager PIN required for correction:')
    if (pin !== MANAGER_PIN) {
      alert('Incorrect manager PIN. Correction was not applied.')
      return
    }

    const customer = customers.find((item) => String(item.id) === String(managerCorrectionCustomerId))
    const minutesAmount = Number(managerCorrectionAmount || 0)
    const moneyAmount = Number(managerCorrectionMoneyAmount || 0)
    const reason = managerCorrectionReason.trim()
    const isMoneyOnlyCorrection = managerCorrectionType === 'refund_note'

    if (!reason) {
      alert('Please enter a reason for the correction.')
      return
    }

    if (!customer) {
      alert('Please select a customer.')
      return
    }

    if (minutesAmount < 0 || moneyAmount < 0) {
      alert('Correction amounts cannot be negative. Use the correction type to choose add, remove, move, or refund.')
      return
    }

    if (isMoneyOnlyCorrection && moneyAmount <= 0) {
      alert('Please enter the refund or money correction amount.')
      return
    }

    if (!isMoneyOnlyCorrection && minutesAmount <= 0) {
      alert('Please enter the number of minutes to correct.')
      return
    }

    const oldStandard = Number(customer.standard_minutes_balance || 0)
    const oldHybrid = Number(customer.hybrid_minutes_balance || 0)

    let standardDelta = 0
    let hybridDelta = 0
    const correctionLabel = managerCorrectionType

    if (managerCorrectionType === 'reverse_standard_topup') standardDelta = -Math.abs(minutesAmount)
    if (managerCorrectionType === 'reverse_hybrid_topup') hybridDelta = -Math.abs(minutesAmount)
    if (managerCorrectionType === 'add_standard_minutes') standardDelta = Math.abs(minutesAmount)
    if (managerCorrectionType === 'add_hybrid_minutes') hybridDelta = Math.abs(minutesAmount)
    if (managerCorrectionType === 'remove_standard_minutes') standardDelta = -Math.abs(minutesAmount)
    if (managerCorrectionType === 'remove_hybrid_minutes') hybridDelta = -Math.abs(minutesAmount)
    if (managerCorrectionType === 'move_standard_to_hybrid') {
      standardDelta = -Math.abs(minutesAmount)
      hybridDelta = Math.abs(minutesAmount)
    }
    if (managerCorrectionType === 'move_hybrid_to_standard') {
      hybridDelta = -Math.abs(minutesAmount)
      standardDelta = Math.abs(minutesAmount)
    }

    const newStandard = oldStandard + standardDelta
    const newHybrid = oldHybrid + hybridDelta

    if (newStandard < 0 || newHybrid < 0) {
      alert('Correction would make the customer balance go below 0. Correction stopped.')
      return
    }

    const confirmed = window.confirm(
      `Apply correction?\n\nCustomer: ${customer.name}\nType: ${formatStatus(correctionLabel)}\nStandard: ${oldStandard} -> ${newStandard}\nHybrid: ${oldHybrid} -> ${newHybrid}\nMoney amount: GBP ${moneyAmount.toFixed(2)}\nReason: ${reason}`
    )

    if (!confirmed) return

    const { error } = await supabase
      .from('Customers')
      .update({
        standard_minutes_balance: newStandard,
        hybrid_minutes_balance: newHybrid
      })
      .eq('id', customer.id)

    if (error) {
      alert('Could not apply correction to customer balance.')
      console.log(error)
      return
    }

    const updatedCustomer = {
      ...customer,
      standard_minutes_balance: newStandard,
      hybrid_minutes_balance: newHybrid
    }

    setCustomers((previousCustomers) => previousCustomers.map((item) => (item.id === customer.id ? updatedCustomer : item)))
    if (String(selectedManagerCustomerId) === String(customer.id)) {
      setManagerStandardBalance(newStandard)
      setManagerHybridBalance(newHybrid)
    }

    await createCustomerLog(customer, 'Manager booking/payment correction', `${formatStatus(correctionLabel)}. Standard ${oldStandard} -> ${newStandard}. Hybrid ${oldHybrid} -> ${newHybrid}. Money GBP ${moneyAmount.toFixed(2)}. Reason: ${reason}`)

    await createCorrectionLog({
      correction_type: correctionLabel,
      related_table: 'Customers',
      related_id: customer.id,
      customer_id: customer.id,
      customer_name: customer.name,
      amount: moneyAmount,
      standard_minutes_delta: standardDelta,
      hybrid_minutes_delta: hybridDelta,
      payment_method: managerCorrectionPaymentMethod,
      reason,
      notes: `Old standard ${oldStandard}, new standard ${newStandard}. Old hybrid ${oldHybrid}, new hybrid ${newHybrid}.`
    })

    if (String(selectedManagerCustomerId) === String(customer.id)) {
      await loadCustomerHistory(customer.id)
    }

    setManagerCorrectionCustomerId('')
    setManagerCorrectionAmount('')
    setManagerCorrectionMoneyAmount('')
    setManagerCorrectionReason('')
    await getCustomers()
    await getDailyTakings()

    alert('Correction saved and logged.')
  }

  async function saveCashUp() {
    if (!requireStaffSignIn()) return

    const summary = getDailyTakingsSummary()
    const actualCash = Number(cashUpActualCash || 0)
    const expectedCash = Number(summary.cashTotal || 0)
    const variance = Number((actualCash - expectedCash).toFixed(2))
    const managerName = cashUpManagerName.trim()

    if (!managerName) {
      alert('Please enter the manager sign-off name.')
      return
    }

    if (cashUpActualCash === '' || actualCash < 0) {
      alert('Please enter the actual cash counted.')
      return
    }

    const confirmed = window.confirm(
      `Save end-of-day cash-up for ${new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-GB')}?\n\nExpected cash: GBP ${expectedCash.toFixed(2)}\nActual cash: GBP ${actualCash.toFixed(2)}\nVariance: GBP ${variance.toFixed(2)}\nManager: ${managerName}`
    )

    if (!confirmed) return

    setCashUpSaving(true)

    const staffUser = getCurrentStaffUser()
    const { error } = await supabase.from('CashUps').insert({
      cash_up_date: selectedDate,
      card_total: Number(summary.cardTotal.toFixed(2)),
      cash_total: Number(summary.cashTotal.toFixed(2)),
      bank_transfer_total: Number(summary.bankTransferTotal.toFixed(2)),
      other_total: Number(summary.otherTotal.toFixed(2)),
      product_sales_total: Number(summary.productRevenue.toFixed(2)),
      minutes_sales_total: Number(summary.minutesRevenue.toFixed(2)),
      total_revenue: Number(summary.totalRevenue.toFixed(2)),
      expected_cash_in_till: Number(expectedCash.toFixed(2)),
      actual_cash_counted: Number(actualCash.toFixed(2)),
      variance: Number(variance.toFixed(2)),
      variance_notes: cashUpVarianceNotes.trim() || null,
      manager_sign_off_name: managerName,
      staff_name: staffUser?.name || null
    })

    setCashUpSaving(false)

    if (error) {
      alert('Could not save cash-up record. Check the CashUps table columns.')
      console.log(error)
      return
    }

    setCashUpActualCash('')
    setCashUpVarianceNotes('')
    setCashUpManagerName('')
    alert('End-of-day cash-up saved.')
  }

  async function sellProductsOnly() {
    if (!requireStaffSignIn()) return

    if (productCart.length === 0) {
      alert('Add at least one product to sell.')
      return
    }
    const saleTotal = getProductCartTotal()
    const saved = await recordProductSales({ paymentMethodForSale: posPaymentMethod })
    if (saved) alert(`Product sale recorded. Total £${saleTotal.toFixed(2)}.`)
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

    const { data, error } = await supabase.from('Customers').insert({
      name: customerSearch.trim(),
      minutes_balance: 0,
      standard_minutes_balance: Number(newCustomerBalance || 0),
      hybrid_minutes_balance: 0,
      is_active: true
    }).select().single()

    if (error) {
      alert('Could not create customer.')
      console.log(error)
      return null
    }

    await getCustomers()
    setSelectedCustomerId(String(data.id))
    setSelectedStaffAsCustomerId('')
    setTopUpMinutes(0)
    return data
  }

  async function topUpSelectedCustomer() {
    if (!requireStaffSignIn()) return

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
    const productTotal = Number(getProductCartTotal().toFixed(2))
    const combinedTotal = Number((totalAmount + productTotal).toFixed(2))

    const newStandardBalance = isHybridTopUp ? Number(customer.standard_minutes_balance || 0) : Number(customer.standard_minutes_balance || 0) + amount
    const newHybridBalance = isHybridTopUp ? Number(customer.hybrid_minutes_balance || 0) + amount : Number(customer.hybrid_minutes_balance || 0)

    const cashMessage = paymentMethod === 'cash'
      ? `\nCash received: £${Number(cashReceived || 0).toFixed(2)}\nChange due: £${Math.max(0, Number(cashReceived || 0) - combinedTotal).toFixed(2)}`
      : ''

    if (paymentMethod === 'cash' && Number(cashReceived || 0) < combinedTotal) {
      alert('Cash received is less than the total amount.')
      return
    }

    const confirmed = window.confirm(
      `Payment taken?\n\nCustomer: ${customer.name}\nPackage: ${purchase.name}\nMinutes: ${amount}\nMinutes total: £${totalAmount.toFixed(2)}\nProducts total: £${productTotal.toFixed(2)}\nTotal: £${combinedTotal.toFixed(2)}\nMethod: ${formatStatus(paymentMethod)}${cashMessage}`
    )
    if (!confirmed) return

    if (productCart.length > 0) {
      const productSalesReady = await recordProductSales({ paymentMethodForSale: paymentMethod, customer })
      if (!productSalesReady) return
    }

    const { error: paymentError } = await supabase.from('Payments').insert({
      customer_id: customer.id,
      customer_name: customer.name,
      bed_type: purchase.type === 'hybrid' ? 'Hybrid Minutes - Any Bed' : 'Standard Minutes - Bed 1 and Bed 3',
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

    const { error: customerError } = await supabase.from('Customers').update({
      standard_minutes_balance: newStandardBalance,
      hybrid_minutes_balance: newHybridBalance
    }).eq('id', customer.id)

    if (customerError) {
      alert('Could not add minutes to customer.')
      console.log(customerError)
      return
    }

    await createCustomerLog(customer, 'Top up added', `${purchase.name}: ${amount} mins added. Standard ${customer.standard_minutes_balance || 0} → ${newStandardBalance}. Hybrid ${customer.hybrid_minutes_balance || 0} → ${newHybridBalance}. Total paid £${totalAmount.toFixed(2)}.`)

    setCustomers((prevCustomers) => prevCustomers.map((c) => c.id === customer.id ? { ...c, standard_minutes_balance: newStandardBalance, hybrid_minutes_balance: newHybridBalance } : c))
    if (selectedManagerCustomerId && Number(selectedManagerCustomerId) === Number(customer.id)) {
      setManagerStandardBalance(newStandardBalance)
      setManagerHybridBalance(newHybridBalance)
      await loadCustomerHistory(customer.id)
    }

    await getDailyTakings()
    setTopUpMinutes(0)
    setPaymentNotes('')
    alert(`Added ${amount} mins to ${customer.name}.\n\nStandard: ${newStandardBalance} mins\nHybrid: ${newHybridBalance} mins`)
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
    return bookings.filter((booking) => booking.appointment_time && formatLocalDate(new Date(booking.appointment_time)) === selectedDate)
  }

  function doesBookingOverlap(bedId, startDateTime, minutes, ignoreBookingId = null) {
    const newStart = new Date(startDateTime)
    const newEnd = new Date(newStart.getTime() + (Number(minutes) + 6) * 60000)
    return getBookingsForSelectedDate().some((booking) => {
      if (booking.id === ignoreBookingId) return false
      if (Number(booking.bed_id) !== Number(bedId)) return false
      const existingStart = new Date(booking.appointment_time)
      const existingEnd = new Date(existingStart.getTime() + getTotalBlockMinutes(booking) * 60000)
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
      const usageTime = booking.booking_start ? new Date(booking.booking_start) : booking.appointment_time ? new Date(booking.appointment_time) : null
      return usageTime && usageTime >= last24Hours && usageTime <= now
    })
  }

  async function createShopTestBookingFromModal() {
    if (!requireStaffSignIn()) return

    if (!modalSlot?.bedId || !modalSlot?.time) {
      alert('Please select a calendar slot first.')
      return
    }

    if (isBedOutOfService(modalSlot.bedId)) {
      alert(`${getBedName(modalSlot.bedId)} is out of service and cannot be tested.`)
      return
    }

    const appointmentDateTime = new Date(`${selectedDate}T${modalSlot.time}`)

    if (doesBookingOverlap(modalSlot.bedId, appointmentDateTime, 2)) {
      alert('This test overlaps with another booking on the same bed.')
      return
    }

    const confirmed = window.confirm(
      `Create 2 minute shop test for ${getBedName(modalSlot.bedId)} at ${modalSlot.time}?`
    )

    if (!confirmed) return

    const { error } = await supabase.from('Bookings').insert({
      customer_id: null,
      customer_name: 'Shop Test',
      customer_phone: null,
      customer_email: null,
      bed_id: Number(modalSlot.bedId),
      minutes: 2,
      minutes_deducted: true,
      appointment_time: appointmentDateTime.toISOString(),
      status: 'booked',
      source: 'shop_test'
    })

    if (error) {
      alert('Could not create shop test booking.')
      console.log(error)
      return
    }

    closeModal()
    getBookings()
  }

  async function createBookingFromModal() {
    if (!requireStaffSignIn()) return

    let customer = getSelectedCustomer()
    const selectedStaff = getSelectedStaffAsCustomer()

    if (selectedStaff) {
      await createStaffFreeBookingFromModal(selectedStaff)
      return
    }

    if (!customer && customerSearch.trim()) {
      const shouldCreate = window.confirm(`Create new customer "${customerSearch.trim()}"?`)
      if (!shouldCreate) return
      customer = await createNewCustomerFromSearch()
    }

    if (!customer || !modalSlot?.bedId || !modalSlot?.time) {
      alert('Please select or create a customer.')
      return
    }

    if (!checkCustomerAgeBeforeSunbed(customer)) return

    if (!customerHasEnoughMinutes(customer, selectedMinutes, modalSlot.bedId)) {
      alert(`${customer.name} only has ${getUsableMinutesForBed(customer, modalSlot.bedId)} usable mins for this bed. Please top up before booking ${selectedMinutes} mins.`)
      return
    }

    if (hasUsedSunbedWithin24Hours(customer.id)) {
      const override = window.confirm(`${customer.name} has used or booked a sunbed within the last 24 hours. Continue anyway?`)
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

  async function createStaffFreeBookingFromModal(member) {
    if (!requireStaffSignIn()) return

    if (!member || !modalSlot?.bedId || !modalSlot?.time) {
      alert('Please select a staff member.')
      return
    }

    if (!member.is_active) {
      alert('This staff member is inactive.')
      return
    }

    const sessionMinutes = Number(selectedMinutes || 0)
    if (Number(member.weekly_free_minutes_balance || 0) < sessionMinutes) {
      alert(`${member.name} only has ${member.weekly_free_minutes_balance || 0} staff free mins available this week.`)
      return
    }

    const appointmentDateTime = new Date(`${selectedDate}T${modalSlot.time}`)
    if (doesBookingOverlap(modalSlot.bedId, appointmentDateTime, selectedMinutes)) {
      alert('This staff booking overlaps with another booking on the same bed.')
      return
    }

    const { error } = await supabase.from('Bookings').insert({
      customer_id: null,
      customer_name: `${member.name} - Staff`,
      customer_phone: null,
      customer_email: null,
      bed_id: Number(modalSlot.bedId),
      minutes: sessionMinutes,
      minutes_deducted: false,
      appointment_time: appointmentDateTime.toISOString(),
      status: 'booked',
      source: `staff_free:${member.id}`
    })

    if (error) {
      alert('Could not create staff booking.')
      console.log(error)
      return
    }

    await createStaffLog(member, 'Staff free booking created', `${sessionMinutes} free mins booked on ${getBedName(modalSlot.bedId)} for ${appointmentDateTime.toLocaleString('en-GB')}.`)
    closeModal()
    getBookings()
  }

  async function saveEditedBooking() {
    if (!requireStaffSignIn()) return


    let customer = getSelectedCustomer()
    const selectedStaff = getSelectedStaffAsCustomer()

    if (selectedStaff) {
      alert('Please delete and recreate staff bookings if the staff member needs changing.')
      return
    }

    if (!customer && customerSearch.trim()) {
      const shouldCreate = window.confirm(`Create new customer "${customerSearch.trim()}"?`)
      if (!shouldCreate) return
      customer = await createNewCustomerFromSearch()
    }

    if (!modalBooking || !customer || !editTime || !editBedId) {
      alert('Please complete the booking details.')
      return
    }

    if (!checkCustomerAgeBeforeSunbed(customer)) return

    if (!modalBooking.minutes_deducted && !customerHasEnoughMinutes(customer, selectedMinutes, editBedId)) {
      alert(`${customer.name} only has ${getUsableMinutesForBed(customer, editBedId)} usable mins for this bed. Please top up before booking ${selectedMinutes} mins.`)
      return
    }

    if (hasUsedSunbedWithin24Hours(customer.id, modalBooking.id)) {
      const override = window.confirm(`${customer.name} has used or booked a sunbed within the last 24 hours. Continue anyway?`)
      if (!override) return
    }

    const appointmentDateTime = new Date(`${selectedDate}T${editTime}`)
    if (doesBookingOverlap(editBedId, appointmentDateTime, selectedMinutes, modalBooking.id)) {
      alert('This edited booking overlaps with another booking on the same bed.')
      return
    }

    const { error } = await supabase.from('Bookings').update({
      customer_id: customer.id,
      customer_name: customer.name,
      customer_phone: customer.phone || null,
      customer_email: customer.email || null,
      bed_id: Number(editBedId),
      minutes: Number(selectedMinutes),
      appointment_time: appointmentDateTime.toISOString()
    }).eq('id', modalBooking.id)

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
    if (!requireStaffSignIn()) return

    const confirmed = window.confirm(`Delete booking for ${booking.customer_name}? This cannot be undone.`)
    if (!confirmed) return
    const { error } = await supabase.from('Bookings').delete().eq('id', booking.id)
    if (!error) {
      closeModal()
      getBookings()
    } else {
      alert('Could not delete booking.')
      console.log(error)
    }
  }

  async function updateBookingStatus(id, newStatus) {
    if (!requireStaffSignIn()) return

    await supabase.from('Bookings').update({ status: newStatus }).eq('id', id)
    closeModal()
    getBookings()
  }

  function getBedById(bedId) {
    return beds.find((bed) => Number(bed.id) === Number(bedId))
  }

  function isBedOutOfService(bedId) {
    return Boolean(getBedById(bedId)?.is_out_of_service)
  }

  function getBedRuntimeHours(bed) {
    return Number((Number(bed?.total_runtime_minutes || 0) / 60).toFixed(2))
  }

  function getBedTargetHours(bed) {
    return Number(bed?.next_tube_change_hours || 800)
  }

  function getBedHoursRemaining(bed) {
    return Math.max(0, getBedTargetHours(bed) - getBedRuntimeHours(bed))
  }

  async function updateBedMaintenance(bedId, updates) {
    if (!requireStaffSignIn()) return false

    const { error } = await supabase.from('Beds').update(updates).eq('id', bedId)
    if (error) {
      alert('Could not update bed maintenance. Check your Beds table maintenance columns.')
      console.log(error)
      return false
    }
    await getBeds()
    return true
  }

  async function resetBedRuntime(bed) {
    if (!requireStaffSignIn()) return

    const confirmed = window.confirm(`Reset runtime for ${bed.name}? Use this after a tube change.`)
    if (!confirmed) return
    const pin = window.prompt('Manager PIN required:')
    if (pin !== MANAGER_PIN) {
      alert('Incorrect manager PIN.')
      return
    }
    await updateBedMaintenance(bed.id, {
      total_runtime_minutes: 0,
      last_tube_change_date: formatLocalDate(new Date())
    })
  }

  async function addRuntimeHoursForBooking(booking) {
    if (!booking?.bed_id || booking.status === 'completed') return true

    const bed = getBedById(booking.bed_id)
    if (!bed) return true

    const currentRuntimeMinutes = Number(bed.total_runtime_minutes || 0)
    const minutesToAdd = Number(booking.minutes || 0)
    const newRuntimeMinutes = currentRuntimeMinutes + minutesToAdd

    const { error } = await supabase
      .from('Beds')
      .update({ total_runtime_minutes: newRuntimeMinutes })
      .eq('id', booking.bed_id)

    if (error) {
      console.log('Could not update tube runtime minutes:', error)
      alert('Could not update tube runtime minutes. Please check the Beds table has total_runtime_minutes.')
      return false
    }

    await getBeds()
    return true
  }

  async function completeBooking(booking) {
    const runtimeUpdated = await addRuntimeHoursForBooking(booking)
    if (!runtimeUpdated) return
    await supabase.from('Bookings').update({ status: 'completed', tmax_status: 'completed' }).eq('id', booking.id)
    closeModal()
    getBookings()
  }

  async function managerResetBooking(booking) {
    if (!requireStaffSignIn()) return

    if (!['completed', 'no_show', 'force_stopped'].includes(booking.status)) {
      alert('Manager Reset is only available for completed, no show, or force stopped bookings.')
      return
    }

    const confirmed = window.confirm(`Manager Reset this booking for ${booking.customer_name}? This returns it to Booked. Deducted minutes will NOT change.`)
    if (!confirmed) return
    const pin = window.prompt('Manager PIN required to reset booking:')
    if (pin !== MANAGER_PIN) {
      alert('Incorrect manager PIN. Booking was not reset.')
      return
    }

    const previousStatus = booking.status
    const { error } = await supabase.from('Bookings').update({ status: 'booked' }).eq('id', booking.id)
    if (error) {
      alert('Could not reset booking.')
      console.log(error)
      return
    }

    const customer = getCustomerForBooking(booking)
    if (customer) {
      await createCustomerLog(customer, 'Manager booking reset', `Booking ${booking.id || ''} reset from ${formatStatus(previousStatus)} to Booked. Deducted minutes unchanged: ${booking.minutes_deducted ? 'yes' : 'no'}.`)
    }

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

    const { error: customerError } = await supabase.from('Customers').update({
      standard_minutes_balance: newStandardBalance,
      hybrid_minutes_balance: newHybridBalance
    }).eq('id', customerId)

    if (customerError) {
      alert('Could not deduct customer minutes.')
      console.log(customerError)
      return false
    }

    const { error: bookingError } = await supabase.from('Bookings').update({ minutes_deducted: true }).eq('id', booking.id)
    if (bookingError) {
      alert('Could not mark minutes as deducted.')
      console.log(bookingError)
      return false
    }

    await createCustomerLog(customer, 'Minutes deducted', `Booking ${booking.id || ''}: ${sessionMinutes} mins deducted for ${getBedName(booking.bed_id)}. Standard ${standardBalance} → ${newStandardBalance}. Hybrid ${hybridBalance} → ${newHybridBalance}.`)
    await getCustomers()
    return true
  }

  async function deductStaffFreeMinutesOnce(booking) {
    if (booking.minutes_deducted) return true
    const staffId = getStaffIdFromBooking(booking)
    const member = staff.find((item) => String(item.id) === String(staffId))
    if (!member) {
      alert('Could not find staff account for this booking.')
      return false
    }

    const sessionMinutes = Number(booking.minutes || 0)
    const oldBalance = Number(member.weekly_free_minutes_balance || 0)
    const newBalance = oldBalance - sessionMinutes
    if (newBalance < 0) {
      alert(`${member.name} only has ${oldBalance} staff free mins available this week.`)
      return false
    }

    const { error: staffError } = await supabase.from('Staff').update({ weekly_free_minutes_balance: newBalance }).eq('id', staffId)
    if (staffError) {
      alert('Could not deduct staff free minutes.')
      console.log(staffError)
      return false
    }

    const { error: bookingError } = await supabase.from('Bookings').update({ minutes_deducted: true }).eq('id', booking.id)
    if (bookingError) {
      alert('Could not mark staff minutes as deducted.')
      console.log(bookingError)
      return false
    }

    await createStaffLog(member, 'Staff free minutes used', `Booking ${booking.id || ''}: ${sessionMinutes} free mins deducted for ${getBedName(booking.bed_id)}. Balance ${oldBalance} -> ${newBalance}.`)
    await getStaff()
    return true
  }

  async function startSession(booking) {
    if (!requireStaffSignIn()) return

    if (!booking || booking.booking_start || ['undressing', 'running', 'cooldown'].includes(String(booking.status || '').toLowerCase())) {
      alert('This session has already been started.')
      return
    }

    if (['completed', 'no_show', 'force_stopped'].includes(String(booking.status || '').toLowerCase())) {
      alert('This booking cannot be started because it is already finished or stopped.')
      return
    }

    const customer = customers.find((c) => c.id === Number(booking.customer_id))
    if (customer && !checkCustomerAgeBeforeSunbed(customer)) return

    const deducted = isShopTestBooking(booking)
      ? true
      : isStaffFreeBooking(booking)
        ? await deductStaffFreeMinutesOnce(booking)
        : await deductCustomerMinutesOnce(booking)
    if (!deducted) return

    const now = new Date()
    const tanningStart = new Date(now.getTime() + UNDRESS_SECONDS * 1000)
    const tanningEnd = new Date(tanningStart.getTime() + booking.minutes * 60000)
    const cooldownEnd = new Date(tanningEnd.getTime() + COOLDOWN_SECONDS * 1000)

    await supabase.from('Bookings').update({
      status: 'undressing',
      booking_start: now.toISOString(),
      booking_end: cooldownEnd.toISOString(),
      tmax_sent_at: now.toISOString(),
      tmax_status: 'undressing',
      minutes_deducted: true
    }).eq('id', booking.id)

    closeModal()
    getBookings()
    getCustomers()
    getStaff()
  }

  async function customerStartedBed(booking) {
    if (!booking?.id) return

    if (!requireStaffSignIn()) return

    if (!booking.booking_start && !booking.tmax_sent_at) {
      alert('Start the session/send time to the bed first.')
      return
    }

    if (booking.customer_started_at) {
      alert('Customer start has already been recorded for this booking.')
      return
    }

    if (['completed', 'no_show', 'force_stopped'].includes(String(booking.status || '').toLowerCase())) {
      alert('This booking is already finished or stopped.')
      return
    }

    const actualStart = new Date()
    const tanningEnd = new Date(actualStart.getTime() + Number(booking.minutes || 0) * 60000)
    const cooldownEnd = new Date(tanningEnd.getTime() + COOLDOWN_SECONDS * 1000)

    const { error } = await supabase
      .from('Bookings')
      .update({
        status: 'running',
        customer_started_at: actualStart.toISOString(),
        actual_tanning_end: cooldownEnd.toISOString(),
        booking_end: cooldownEnd.toISOString(),
        tmax_status: 'running'
      })
      .eq('id', booking.id)

    if (error) {
      alert('Could not record customer start.')
      console.log(error)
      return
    }

    closeModal()
    getBookings()
  }

  async function forceStop(booking) {
    if (!requireStaffSignIn()) return

    await supabase.from('Bookings').update({ status: 'force_stopped', booking_end: new Date().toISOString(), tmax_status: 'force_stopped' }).eq('id', booking.id)
    closeModal()
    getBookings()
  }

  async function autoCompleteFinishedSessions() {
    for (const booking of bookings) {
      if (booking.booking_end && new Date(booking.booking_end) <= currentTime && !['completed', 'force_stopped', 'no_show'].includes(booking.status)) {
        const runtimeUpdated = await addRuntimeHoursForBooking(booking)
        if (!runtimeUpdated) return
        await supabase.from('Bookings').update({ status: 'completed', tmax_status: 'completed' }).eq('id', booking.id)
        getBookings()
      }
    }
  }

  function getBedName(bedId) {
    const bed = beds.find((b) => Number(b.id) === Number(bedId))
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

      if (booking.booking_start && booking.booking_end) {
        const start = new Date(booking.booking_start)
        const end = new Date(booking.booking_end)
        return now >= start && now <= end
      }

      if (!booking.appointment_time) return false

      const appointmentTime = new Date(booking.appointment_time)
      const minutesUntilBooking = (appointmentTime - now) / 60000

      return minutesUntilBooking <= 20 && minutesUntilBooking >= 0
    })
  }

  function getPhase(booking) {
    if (isShopTestBooking(booking) && !booking?.booking_start) return 'Shop Test'

    if (!booking?.booking_start && !booking?.customer_started_at) {
      return formatStatus(booking?.status || 'booked')
    }

    const actualStartAt = booking.customer_started_at

    if (actualStartAt) {
      const tanStart = new Date(actualStartAt)
      const tanEnd = new Date(tanStart.getTime() + Number(booking.minutes || 0) * 60000)
      const cooldownEnd = booking.actual_tanning_end
        ? new Date(booking.actual_tanning_end)
        : new Date(tanEnd.getTime() + COOLDOWN_SECONDS * 1000)

      if (currentTime < tanEnd) return 'Running'
      if (currentTime < cooldownEnd) return 'Cooldown'
      return 'Completed'
    }

    if (!booking?.booking_start || !booking?.booking_end) return formatStatus(booking?.status || 'booked')

    const start = new Date(booking.tmax_sent_at || booking.booking_start)
    const tanStart = new Date(start.getTime() + UNDRESS_SECONDS * 1000)
    const tanEnd = new Date(tanStart.getTime() + Number(booking.minutes || 0) * 60000)
    const end = new Date(booking.booking_end)

    if (currentTime < tanStart) return 'Undressing'
    if (currentTime < tanEnd) return 'Running'
    if (currentTime < end) return 'Cooldown'
    return 'Completed'
  }

  function getRemainingTime(booking) {
    if (!booking?.booking_start && !booking?.customer_started_at) return null

    const phase = getPhase(booking)
    let targetTime

    if (booking.customer_started_at) {
      const actualStart = new Date(booking.customer_started_at)
      const tanEnd = new Date(actualStart.getTime() + Number(booking.minutes || 0) * 60000)
      const cooldownEnd = booking.actual_tanning_end
        ? new Date(booking.actual_tanning_end)
        : new Date(tanEnd.getTime() + COOLDOWN_SECONDS * 1000)

      if (phase === 'Running') targetTime = tanEnd
      else if (phase === 'Cooldown') targetTime = cooldownEnd
      else return '00:00'
    } else {
      if (!booking.booking_end) return null
      const start = new Date(booking.tmax_sent_at || booking.booking_start)

      if (phase === 'Undressing') targetTime = new Date(start.getTime() + UNDRESS_SECONDS * 1000)
      else if (phase === 'Running') targetTime = new Date(start.getTime() + UNDRESS_SECONDS * 1000 + Number(booking.minutes || 0) * 60000)
      else if (phase === 'Cooldown') targetTime = new Date(booking.booking_end)
      else return '00:00'
    }

    const diff = targetTime - currentTime
    if (diff <= 0) return '00:00'
    const minutes = Math.floor(diff / 60000)
    const seconds = Math.floor((diff % 60000) / 1000)
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  function getBedColour(bedId) {
    if (isBedOutOfService(bedId)) return '#5c1f1f'
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

  function getCalendarCellBackground(booking, bedId) {
    if (booking) return getCalendarBookingColour(booking)
    return isBedOutOfService(bedId) ? '#3a1f1f' : 'transparent'
  }

  function getCalendarBookingStartingAt(time, bedId) {
    return getBookingsForSelectedDate().find((booking) => getBookingStartTimeString(booking) === time && Number(booking.bed_id) === Number(bedId))
  }

  function isSlotCoveredByEarlierBooking(time, bedId) {
    const slotTime = getSlotDateTime(time)
    return getBookingsForSelectedDate().some((booking) => {
      if (Number(booking.bed_id) !== Number(bedId)) return false
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
    setCashReceived('')
  }

  function openEmptySlot(time, bedId) {
    if (isBedOutOfService(bedId)) {
      alert(`${getBedName(bedId)} is out of service and cannot be booked.`)
      return
    }
    setModalBooking(null)
    setModalSlot({ time, bedId })
    setEditMode(false)
    setSelectedCustomerId('')
    setSelectedStaffAsCustomerId('')
    setCustomerSearch('')
    setNewCustomerBalance(0)
    resetPaymentFields(bedId)
    setSelectedMinutes(12)
    clearProductCart()
    setShowProductPicker(false)
    setModalOpen(true)
  }

  function openBooking(booking) {
    const bookingTime = new Date(booking.appointment_time)
    setModalBooking(booking)
    setModalSlot(null)
    setEditMode(false)
    setSelectedCustomerId(booking.customer_id ? String(booking.customer_id) : '')
    setSelectedStaffAsCustomerId(isStaffFreeBooking(booking) ? String(getStaffIdFromBooking(booking)) : '')
    setCustomerSearch(booking.customer_name || '')
    setNewCustomerBalance(0)
    resetPaymentFields(booking.bed_id)
    setSelectedMinutes(booking.minutes || 12)
    setEditBedId(String(booking.bed_id))
    setEditTime(`${String(bookingTime.getHours()).padStart(2, '0')}:${String(bookingTime.getMinutes()).padStart(2, '0')}`)
    clearProductCart()
    setShowProductPicker(false)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setModalBooking(null)
    setModalSlot(null)
    setEditMode(false)
    setSelectedCustomerId('')
    setSelectedStaffAsCustomerId('')
    setCustomerSearch('')
    setNewCustomerBalance(0)
    resetPaymentFields()
    setSelectedMinutes(12)
    setEditTime('')
    setEditBedId('')
    clearProductCart()
    setShowProductPicker(false)
  }

  function getSelectedManagerCustomer() {
    return customers.find((customer) => customer.id === Number(selectedManagerCustomerId))
  }

  function getFilteredManagerCustomers() {
    if (!customerManagerSearch.trim()) return []
    const query = customerManagerSearch.toLowerCase()
    return customers.filter((customer) => customer.name?.toLowerCase().includes(query) || customer.phone?.toLowerCase().includes(query) || customer.email?.toLowerCase().includes(query))
  }

  async function createCustomerLog(customer, action, details) {
    if (!customer) return
    await supabase.from('CustomerLogs').insert({ customer_id: customer.id, customer_name: customer.name, action, details })
  }

  async function loadCustomerHistory(customerId) {
    if (!customerId) {
      setCustomerPayments([])
      setCustomerLogs([])
      return
    }
    const { data: paymentsData } = await supabase.from('Payments').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(10)
    setCustomerPayments(paymentsData || [])
    const { data: logsData } = await supabase.from('CustomerLogs').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(10)
    setCustomerLogs(logsData || [])
  }

  function selectManagerCustomer(customer) {
    setSelectedManagerCustomerId(String(customer.id))
    setCustomerManagerSearch(customer.name || '')
    setManagerName(customer.name || '')
    setManagerPhone(customer.phone || '')
    setManagerEmail(customer.email || '')
    setManagerDateOfBirth(customer.date_of_birth || '')
    setManagerNotes(customer.notes || '')
    setManagerStandardBalance(Number(customer.standard_minutes_balance || 0))
    setManagerHybridBalance(Number(customer.hybrid_minutes_balance || 0))
    clearMinuteCorrection()
    loadCustomerHistory(customer.id)
  }

  function clearCustomerManager() {
    setSelectedManagerCustomerId('')
    setCustomerManagerSearch('')
    setManagerName('')
    setManagerPhone('')
    setManagerEmail('')
    setManagerDateOfBirth('')
    setManagerNotes('')
    setManagerStandardBalance(0)
    setManagerHybridBalance(0)
    clearMinuteCorrection()
    setCustomerPayments([])
    setCustomerLogs([])
  }

  function clearMinuteCorrection() {
    setShowMinuteCorrection(false)
    setCorrectionType('move_standard_to_hybrid')
    setCorrectionBalance('standard')
    setCorrectionAmount('')
    setCorrectionReason('')
  }

  function openMinuteCorrection() {
    if (!requireStaffSignIn()) return

    const pin = window.prompt('Manager PIN required to correct customer minutes:')
    if (pin !== MANAGER_PIN) {
      alert('Incorrect manager PIN. Minute correction was not opened.')
      return
    }
    setShowMinuteCorrection(true)
  }

  function getCorrectionTypeLabel(type) {
    if (type === 'move_standard_to_hybrid') return 'Move Standard minutes to Hybrid'
    if (type === 'move_hybrid_to_standard') return 'Move Hybrid minutes to Standard'
    if (type === 'add_manual') return 'Add manual correction'
    if (type === 'remove_manual') return 'Remove manual correction'
    return type
  }

  async function applyMinuteCorrection() {
    if (!requireStaffSignIn()) return

    const customer = getSelectedManagerCustomer()
    if (!customer) {
      alert('Please select a customer first.')
      return
    }
    const amount = Number(correctionAmount || 0)
    const reason = correctionReason.trim()
    if (amount <= 0) {
      alert('Enter the number of minutes to correct.')
      return
    }
    if (!reason) {
      alert('Please enter a reason for the correction.')
      return
    }

    const oldStandard = Number(customer.standard_minutes_balance || 0)
    const oldHybrid = Number(customer.hybrid_minutes_balance || 0)
    let newStandard = oldStandard
    let newHybrid = oldHybrid

    if (correctionType === 'move_standard_to_hybrid') {
      newStandard = oldStandard - amount
      newHybrid = oldHybrid + amount
    } else if (correctionType === 'move_hybrid_to_standard') {
      newStandard = oldStandard + amount
      newHybrid = oldHybrid - amount
    } else if (correctionType === 'add_manual') {
      if (correctionBalance === 'standard') newStandard = oldStandard + amount
      else newHybrid = oldHybrid + amount
    } else if (correctionType === 'remove_manual') {
      if (correctionBalance === 'standard') newStandard = oldStandard - amount
      else newHybrid = oldHybrid - amount
    }

    if (newStandard < 0 || newHybrid < 0) {
      alert('Correction would make a balance go below 0. No changes were made.')
      return
    }

    const pin = window.prompt('Manager PIN required to apply correction:')
    if (pin !== MANAGER_PIN) {
      alert('Incorrect manager PIN. Minute correction was not applied.')
      return
    }

    const { error } = await supabase.from('Customers').update({
      standard_minutes_balance: newStandard,
      hybrid_minutes_balance: newHybrid
    }).eq('id', customer.id)

    if (error) {
      alert('Could not apply minute correction.')
      console.log(error)
      return
    }

    await createCustomerLog(customer, 'Manager minute correction', `${getCorrectionTypeLabel(correctionType)}. Amount: ${amount} mins. Old balances: Standard ${oldStandard}, Hybrid ${oldHybrid}. New balances: Standard ${newStandard}, Hybrid ${newHybrid}. Reason: ${reason}`)
    await getCustomers()
    await loadCustomerHistory(customer.id)
    setManagerStandardBalance(newStandard)
    setManagerHybridBalance(newHybrid)
    setCorrectionAmount('')
    setCorrectionReason('')
    alert('Minute correction applied.')
  }

  async function saveManagedCustomer() {
    if (!requireStaffSignIn()) return

    const customer = getSelectedManagerCustomer()
    if (!customer) {
      alert('Please select a customer first.')
      return
    }
    if (!managerName.trim()) {
      alert('Customer name cannot be blank.')
      return
    }

    const oldStandard = Number(customer.standard_minutes_balance || 0)
    const oldHybrid = Number(customer.hybrid_minutes_balance || 0)
    const newStandard = Number(managerStandardBalance || 0)
    const newHybrid = Number(managerHybridBalance || 0)

    if (oldStandard !== newStandard || oldHybrid !== newHybrid) {
      const pin = window.prompt('Manager PIN required to change customer minutes:')
      if (pin !== MANAGER_PIN) {
        alert('Incorrect manager PIN. Customer minutes were not changed.')
        return
      }
    }

    const { error } = await supabase.from('Customers').update({
      name: managerName.trim(),
      phone: managerPhone || null,
      email: managerEmail || null,
      date_of_birth: managerDateOfBirth || null,
      notes: managerNotes || null,
      standard_minutes_balance: newStandard,
      hybrid_minutes_balance: newHybrid
    }).eq('id', customer.id)

    if (error) {
      alert('Could not update customer.')
      console.log(error)
      return
    }

    await createCustomerLog(customer, 'Customer updated', `Details saved. DOB: ${managerDateOfBirth || 'not recorded'}. Standard ${oldStandard} → ${newStandard}. Hybrid ${oldHybrid} → ${newHybrid}.`)
    await getCustomers()
    await loadCustomerHistory(customer.id)
    alert('Customer updated.')
  }

  async function deactivateManagedCustomer() {
    if (!requireStaffSignIn()) return

    const customer = getSelectedManagerCustomer()
    if (!customer) {
      alert('Please select a customer first.')
      return
    }
    const confirmed = window.confirm(`Deactivate ${customer.name}? They will no longer appear in active customer search. History and payments remain saved.`)
    if (!confirmed) return
    const pin = window.prompt('Manager PIN required to deactivate customer:')
    if (pin !== MANAGER_PIN) {
      alert('Incorrect manager PIN. Customer was not deactivated.')
      return
    }
    const { error } = await supabase.from('Customers').update({ is_active: false }).eq('id', customer.id)
    if (error) {
      alert('Could not deactivate customer.')
      console.log(error)
      return
    }
    await createCustomerLog(customer, 'Customer deactivated', 'Customer was marked inactive.')
    await getCustomers()
    clearCustomerManager()
  }

  async function saveStaffMember() {
    if (!requireStaffSignIn()) return

    if (!staffName.trim()) {
      alert('Staff name is required.')
      return
    }

    const payload = {
      name: staffName.trim(),
      role: staffRole,
      is_active: true,
      weekly_free_minutes_balance: WEEKLY_STAFF_FREE_MINUTES,
      last_weekly_reset_date: getWeekStartDateString()
    }

    const request = staffEditingId
      ? supabase.from('Staff').update({ name: payload.name, role: payload.role }).eq('id', staffEditingId)
      : supabase.from('Staff').insert(payload)

    const { error } = await request
    if (error) {
      alert('Could not save staff member.')
      console.log(error)
      return
    }

    setStaffName('')
    setStaffRole('staff')
    setStaffEditingId('')
    getStaff()
  }

  function editStaffMember(member) {
    setStaffEditingId(String(member.id))
    setStaffName(member.name || '')
    setStaffRole(member.role || 'staff')
  }

  async function deactivateStaffMember(member) {
    if (!requireStaffSignIn()) return

    const confirmed = window.confirm(`Deactivate staff member ${member.name}?`)
    if (!confirmed) return
    const pin = window.prompt('Manager PIN required:')
    if (pin !== MANAGER_PIN) {
      alert('Incorrect manager PIN.')
      return
    }
    const { error } = await supabase.from('Staff').update({ is_active: false }).eq('id', member.id)
    if (error) {
      alert('Could not deactivate staff member.')
      console.log(error)
      return
    }
    await createStaffLog(member, 'Staff deactivated', 'Staff member was marked inactive.')
    getStaff()
  }

  async function adjustStaffMinutes() {
    if (!requireStaffSignIn()) return

    const member = staff.find((item) => String(item.id) === String(staffAdjustmentId))
    if (!member) {
      alert('Select a staff member to adjust.')
      return
    }
    const amount = Number(staffAdjustmentAmount || 0)
    if (Number.isNaN(amount)) {
      alert('Enter a valid adjustment amount.')
      return
    }
    if (!staffAdjustmentReason.trim()) {
      alert('Enter a reason for the adjustment.')
      return
    }
    const pin = window.prompt('Manager PIN required:')
    if (pin !== MANAGER_PIN) {
      alert('Incorrect manager PIN.')
      return
    }

    const oldBalance = Number(member.weekly_free_minutes_balance || 0)
    const newBalance = Math.max(0, oldBalance + amount)

    const { error } = await supabase.from('Staff').update({ weekly_free_minutes_balance: newBalance }).eq('id', member.id)
    if (error) {
      alert('Could not adjust staff minutes.')
      console.log(error)
      return
    }

    await createStaffLog(member, 'Staff minutes adjusted', `Balance ${oldBalance} → ${newBalance}. Adjustment: ${amount}. Reason: ${staffAdjustmentReason.trim()}`)
    setStaffAdjustmentId('')
    setStaffAdjustmentAmount('')
    setStaffAdjustmentReason('')
    getStaff()
  }

  async function saveProduct() {
    if (!requireStaffSignIn()) return

    if (!productName.trim()) {
      alert('Product name is required.')
      return
    }

    const payload = {
      name: productName.trim(),
      category: productCategory,
      price: Number(productPrice || 0),
      stock_quantity: productStockQuantity === '' ? 0 : Number(productStockQuantity || 0),
      is_active: true
    }

    const request = productEditingId
      ? supabase.from('Products').update(payload).eq('id', productEditingId)
      : supabase.from('Products').insert(payload)

    const { error } = await request
    if (error) {
      alert('Could not save product.')
      console.log(error)
      return
    }

    clearProductForm()
    getProducts()
  }

  function editProduct(product) {
    setProductEditingId(String(product.id))
    setProductName(product.name || '')
    setProductCategory(product.category || 'other')
    setProductPrice(product.price || '')
    setProductStockQuantity(product.stock_quantity ?? '')
  }

  function clearProductForm() {
    setProductEditingId('')
    setProductName('')
    setProductCategory('tanning_lotions')
    setProductPrice('')
    setProductStockQuantity('')
  }

  async function deactivateProduct(product) {
    if (!requireStaffSignIn()) return

    const confirmed = window.confirm(`Deactivate ${product.name}?`)
    if (!confirmed) return
    const { error } = await supabase.from('Products').update({ is_active: false }).eq('id', product.id)
    if (error) {
      alert('Could not deactivate product.')
      console.log(error)
      return
    }
    getProducts()
  }

  function renderCustomerSearchBox() {
    const selectedCustomer = getSelectedCustomer()
    const selectedStaff = getSelectedStaffAsCustomer()
    const filteredOptions = getFilteredCustomerAndStaffOptions()
    const activeBedId = modalSlot?.bedId || editBedId || modalBooking?.bed_id

    return (
      <div style={{ marginBottom: '12px' }}>
        <input
          placeholder="Start typing customer or staff name..."
          value={customerSearch}
          onChange={(e) => {
            setCustomerSearch(e.target.value)
            setSelectedCustomerId('')
            setSelectedStaffAsCustomerId('')
          }}
          style={{ width: '100%', padding: '12px', marginBottom: '8px', boxSizing: 'border-box' }}
        />

        {customerSearch && !selectedCustomer && !selectedStaff && filteredOptions.length > 0 && (
          <div style={{ background: '#111', border: '1px solid #555', borderRadius: '10px', marginBottom: '8px', maxHeight: '180px', overflowY: 'auto' }}>
            {filteredOptions.map((option) => (
              <div
                key={`${option.kind}-${option.id}`}
                onClick={() => {
                  if (option.kind === 'customer') {
                    setSelectedCustomerId(String(option.id))
                    setSelectedStaffAsCustomerId('')
                    setCustomerSearch(option.record.name)
                  } else {
                    setSelectedStaffAsCustomerId(String(option.id))
                    setSelectedCustomerId('')
                    setCustomerSearch(`${option.record.name} - Staff`)
                  }
                }}
                style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid #333' }}
              >
                {option.kind === 'customer' ? (
                  <>
                    <strong>{option.record.name}</strong> — Standard {option.record.standard_minutes_balance || 0} mins / Hybrid {option.record.hybrid_minutes_balance || 0} mins
                  </>
                ) : (
                  <>
                    <strong>{option.record.name} - Staff</strong> — {option.record.weekly_free_minutes_balance || 0} free mins
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {customerSearch && !selectedCustomer && !selectedStaff && filteredOptions.length === 0 && (
          <div style={{ background: '#111', padding: '12px', borderRadius: '10px', marginBottom: '8px' }}>
            <p>No customer found.</p>
            <label>Starting standard minutes:</label>
            <input type="number" value={newCustomerBalance} onChange={(e) => setNewCustomerBalance(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '6px', marginBottom: '8px' }} />
            <button onClick={createNewCustomerFromSearch}>Create New Customer</button>
          </div>
        )}

        {selectedCustomer && (
          <div style={{ background: '#111', padding: '12px', borderRadius: '10px' }}>
            <strong>{selectedCustomer.name}</strong>
            <p style={{ color: selectedCustomer.date_of_birth && isCustomerUnder18(selectedCustomer) ? '#ff7875' : '#aaa', fontWeight: selectedCustomer.date_of_birth && isCustomerUnder18(selectedCustomer) ? 'bold' : 'normal', marginBottom: '8px' }}>
              {getCustomerAgeText(selectedCustomer)}
            </p>
            {selectedCustomer.date_of_birth && isCustomerUnder18(selectedCustomer) && <p style={{ color: '#ff7875', fontWeight: 'bold' }}>Under 18 — do not book.</p>}
            {!selectedCustomer.date_of_birth && <p style={{ color: '#faad14', fontWeight: 'bold' }}>DOB not recorded — check ID before use.</p>}
            <div style={{ background: '#0b0b0b', padding: '15px', borderRadius: '10px', marginTop: '12px', border: '1px solid #333', textAlign: 'center' }}>
              <p style={{ margin: '5px 0' }}>Standard balance: <strong>{selectedCustomer.standard_minutes_balance || 0} mins</strong></p>
              <p style={{ margin: '5px 0' }}>Hybrid balance: <strong>{selectedCustomer.hybrid_minutes_balance || 0} mins</strong></p>
              <p style={{ marginTop: '12px', fontSize: '18px' }}>Usable for this bed: <strong>{getUsableMinutesForBed(selectedCustomer, activeBedId)} mins</strong></p>
            </div>
            {!customerHasEnoughMinutes(selectedCustomer, selectedMinutes, activeBedId) && <p style={{ color: '#ff7875', fontWeight: 'bold' }}>Not enough usable minutes for this bed. Please top up first.</p>}
          </div>
        )}

        {selectedStaff && (
          <div style={{ background: '#111', padding: '12px', borderRadius: '10px' }}>
            <strong>{selectedStaff.name} - Staff</strong>
            <div style={{ background: '#0b0b0b', padding: '15px', borderRadius: '10px', marginTop: '12px', border: '1px solid #333', textAlign: 'center' }}>
              <p style={{ margin: '5px 0' }}>Weekly free balance: <strong>{selectedStaff.weekly_free_minutes_balance || 0} mins</strong></p>
              <p style={{ marginTop: '12px', fontSize: '18px' }}>Usable on any bed: <strong>{getStaffUsableMinutes(selectedStaff)} mins</strong></p>
            </div>
            {!staffHasEnoughMinutes(selectedStaff, selectedMinutes) && <p style={{ color: '#ff7875', fontWeight: 'bold' }}>Not enough staff free minutes for this booking.</p>}
          </div>
        )}
      </div>
    )
  }

  function renderProductCart() {
    return (
      <div style={{ background: '#0b0b0b', padding: '12px', borderRadius: '12px', border: '1px solid #333', marginTop: '10px' }}>
        {productCart.length === 0 ? (
          <p style={{ color: '#aaa' }}>No products added.</p>
        ) : (
          productCart.map((item) => (
            <div key={item.product_id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: '8px', alignItems: 'center', borderBottom: '1px solid #333', padding: '8px 0' }}>
                    <span>{item.product_name}<br /><small>£{Number(item.price || 0).toFixed(2)} — Stock {item.stock_quantity || 0}</small></span>
              <input type="number" value={item.quantity} min="0" onChange={(e) => updateProductCartQuantity(item.product_id, e.target.value)} style={{ padding: '8px' }} />
              <strong>£{(Number(item.price || 0) * Number(item.quantity || 0)).toFixed(2)}</strong>
            </div>
          ))
        )}
        <p>Total products: <strong>£{getProductCartTotal().toFixed(2)}</strong></p>
      </div>
    )
  }

  function renderProductPicker() {
    return (
      <div style={{ marginTop: '12px' }}>
        <button type="button" onClick={() => { if (requireStaffSignIn()) setShowProductPicker(true) }}>+ Add Products</button>
        {productCart.length > 0 && (
          <>
            {renderProductCart()}
            <button type="button" onClick={clearProductCart} style={{ marginTop: '8px' }}>Clear Products</button>
          </>
        )}

        {showProductPicker && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#1e1e1e', padding: '24px', borderRadius: '18px', width: '520px', maxWidth: '92%', maxHeight: '85vh', overflowY: 'auto' }}>
              <h2>Add Products</h2>
              {productLoadError && <p style={{ color: '#ff7875' }}>{productLoadError}</p>}
              {getActiveProducts().length === 0 ? <p>No active products found.</p> : (
                getActiveProducts().map((product) => (
                  <div key={product.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', background: '#111', padding: '10px', borderRadius: '12px', marginBottom: '8px' }}>
                  <div>
                    <strong>{product.name}</strong><br />
                      <small>{formatStatus(product.category)} — £{Number(product.price || 0).toFixed(2)} — Stock {getProductStockQuantity(product)} — <span style={getProductStockStatusStyle(product)}>{getProductStockStatus(product)}</span></small>
                  </div>
                    <button type="button" onClick={() => addProductToCart(product)}>Add</button>
                  </div>
                ))
              )}
              {renderProductCart()}
              <button type="button" onClick={() => setShowProductPicker(false)}>Done</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  function renderTopUpSection() {
    const selectedCustomer = getSelectedCustomer()
    const selectedStaff = getSelectedStaffAsCustomer()
    const purchase = getPurchaseDetails()
    const isCustom = purchase.isCustom

    if (!selectedCustomer || selectedStaff) return null

    return (
      <div style={{ background: '#111', padding: '16px', borderRadius: '14px', marginTop: '15px', marginBottom: '15px', border: '1px solid #333' }}>
        <h3 style={{ marginTop: 0 }}>Top up minutes</h3>
        <select value={purchaseOption} onChange={(e) => { setPurchaseOption(e.target.value); setTopUpMinutes(0) }} style={{ width: '100%', padding: '10px', marginBottom: '8px', boxSizing: 'border-box' }}>
          {Object.entries(PURCHASE_OPTIONS).map(([key, option]) => <option key={key} value={key}>{option.label}</option>)}
        </select>
        {isCustom ? (
          <>
            <input
              type="number"
              min="0"
              step="1"
              placeholder="Enter custom minutes to add"
              value={topUpMinutes}
              onChange={(e) => setTopUpMinutes(e.target.value)}
              style={{ width: '100%', padding: '10px', marginBottom: '8px', boxSizing: 'border-box' }}
            />          </>
        ) : (
          <p style={{ margin: '8px 0' }}>Minutes to add: <strong>{purchase.minutes} mins</strong></p>
        )}
        <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '8px', boxSizing: 'border-box' }}>
          <option value="card">Card</option>
          <option value="cash">Cash</option>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="other">Other</option>
        </select>
        <input placeholder="Payment notes optional" value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '8px', boxSizing: 'border-box' }} />

        {paymentMethod === 'cash' && (
          <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '12px', padding: '12px', marginBottom: '10px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>Cash received</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Enter cash given"
              value={cashReceived}
              onChange={(e) => setCashReceived(e.target.value)}
              style={{ width: '100%', padding: '10px', marginBottom: '8px', boxSizing: 'border-box' }}
            />
            <p style={{ margin: 0 }}>
              Change to give:
              <strong style={{ marginLeft: '6px', color: '#d4a853' }}>
                £{Math.max(0, Number(cashReceived || 0) - Number((purchase.total + getProductCartTotal()).toFixed(2))).toFixed(2)}
              </strong>
            </p>
            {Number(cashReceived || 0) > 0 && Number(cashReceived || 0) < Number((purchase.total + getProductCartTotal()).toFixed(2)) && (
              <p style={{ margin: '6px 0 0', color: '#ff7875', fontWeight: 'bold' }}>
                Cash given is less than the total.
              </p>
            )}
          </div>
        )}

        {renderProductPicker()}
        <p>Total to pay: <strong>£{(purchase.total + getProductCartTotal()).toFixed(2)}</strong></p>
        <button onClick={topUpSelectedCustomer}>Payment Taken + Add Minutes</button>
      </div>
    )
  }

  function renderCustomerManagementPanel() {
    const selectedCustomer = getSelectedManagerCustomer()
    const filteredCustomers = getFilteredManagerCustomers()

    return (
      <div className="customer-management-panel" style={{ background: '#1e1e1e', padding: '22px', borderRadius: '18px', marginBottom: '30px', border: '1px solid rgba(212,168,83,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
          <h2 style={{ margin: 0 }}>Customer Management</h2>
          {selectedCustomer && <button onClick={clearCustomerManager}>Clear</button>}
        </div>

        <input placeholder="Search customer by name, phone or email..." value={customerManagerSearch} onChange={(e) => { setCustomerManagerSearch(e.target.value); setSelectedManagerCustomerId('') }} style={{ width: '100%', padding: '12px', marginBottom: '10px' }} />

        {customerManagerSearch && !selectedCustomer && filteredCustomers.length > 0 && (
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: '12px', marginBottom: '15px', maxHeight: '180px', overflowY: 'auto' }}>
            {filteredCustomers.map((customer) => (
              <div key={customer.id} onClick={() => selectManagerCustomer(customer)} style={{ padding: '12px', borderBottom: '1px solid #333', cursor: 'pointer' }}>
                <strong>{customer.name}</strong><br />
                <span style={{ color: '#aaa' }}>Standard {customer.standard_minutes_balance || 0} mins / Hybrid {customer.hybrid_minutes_balance || 0} mins {customer.phone ? ` / ${customer.phone}` : ''} {customer.email ? ` / ${customer.email}` : ''}</span>
              </div>
            ))}
          </div>
        )}

        {selectedCustomer && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '15px' }}>
              <div><label>Name</label><input value={managerName} onChange={(e) => setManagerName(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }} /></div>
              <div><label>Phone</label><input value={managerPhone} onChange={(e) => setManagerPhone(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }} /></div>
              <div><label>Email</label><input value={managerEmail} onChange={(e) => setManagerEmail(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }} /></div>
              <div><label>Date of birth</label><input type="date" value={managerDateOfBirth} onChange={(e) => setManagerDateOfBirth(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }} /></div>
            </div>

            <p style={{ color: managerDateOfBirth && calculateAge(managerDateOfBirth) < 18 ? '#ff7875' : '#aaa', fontWeight: managerDateOfBirth && calculateAge(managerDateOfBirth) < 18 ? 'bold' : 'normal' }}>
              {managerDateOfBirth ? `Age ${calculateAge(managerDateOfBirth)}` : 'DOB not recorded'}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '15px' }}>
              <div><label>Standard minutes</label><input type="number" value={managerStandardBalance} onChange={(e) => setManagerStandardBalance(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }} /><p style={{ color: '#aaa', marginTop: '6px' }}>For Bed 1 and Bed 3.</p></div>
              <div><label>Hybrid minutes</label><input type="number" value={managerHybridBalance} onChange={(e) => setManagerHybridBalance(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }} /><p style={{ color: '#aaa', marginTop: '6px' }}>Can be used on any bed.</p></div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label>Notes</label>
              <textarea value={managerNotes} onChange={(e) => setManagerNotes(e.target.value)} style={{ width: '100%', minHeight: '80px', padding: '10px', marginTop: '5px', background: '#111', color: 'white', border: '1px solid #333', borderRadius: '12px', fontFamily: 'inherit' }} />
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
              <button onClick={saveManagedCustomer}>Save Customer</button>
              <button onClick={deactivateManagedCustomer}>Deactivate Customer</button>
              <button onClick={openMinuteCorrection}>Correct Minutes</button>
            </div>

            {showMinuteCorrection && (
              <div style={{ background: '#111', border: '1px solid #333', borderRadius: '14px', padding: '15px', marginBottom: '20px' }}>
                <h3>Manager Minute Correction</h3>
                <select value={correctionType} onChange={(e) => setCorrectionType(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '8px', boxSizing: 'border-box' }}>
                  <option value="move_standard_to_hybrid">Move Standard minutes to Hybrid</option>
                  <option value="move_hybrid_to_standard">Move Hybrid minutes to Standard</option>
                  <option value="add_manual">Add manual correction</option>
                  <option value="remove_manual">Remove manual correction</option>
                </select>
                {['add_manual', 'remove_manual'].includes(correctionType) && (
                  <select value={correctionBalance} onChange={(e) => setCorrectionBalance(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '8px', boxSizing: 'border-box' }}>
                    <option value="standard">Standard</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                )}
                <input type="number" placeholder="Amount of minutes" value={correctionAmount} onChange={(e) => setCorrectionAmount(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '8px', boxSizing: 'border-box' }} />
                <input placeholder="Reason required" value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '8px', boxSizing: 'border-box' }} />
                <button onClick={applyMinuteCorrection}>Apply Correction</button>
                <button onClick={clearMinuteCorrection} style={{ marginLeft: '10px' }}>Cancel</button>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div style={{ background: '#111', padding: '15px', borderRadius: '14px', border: '1px solid #333', maxHeight: '420px', overflowY: 'auto' }}>
                <h3 style={{ marginTop: 0 }}>Recent Payments</h3>
                {customerPayments.length === 0 ? <p style={{ color: '#aaa' }}>No payments found.</p> : customerPayments.map((payment) => (
                  <div key={payment.id} style={{ borderBottom: '1px solid #333', padding: '8px 0' }}>
                    <strong>{payment.package_name || payment.bed_type || 'Payment'}</strong><br />
                    {payment.minutes_added || 0} mins — £{Number(payment.total_amount || 0).toFixed(2)}<br />
                    <span style={{ color: '#aaa' }}>{payment.created_at ? new Date(payment.created_at).toLocaleString('en-GB') : ''}</span>
                  </div>
                ))}
              </div>
              <div style={{ background: '#111', padding: '15px', borderRadius: '14px', border: '1px solid #333', maxHeight: '420px', overflowY: 'auto' }}>
                <h3 style={{ marginTop: 0 }}>Customer Logs</h3>
                {customerLogs.length === 0 ? <p style={{ color: '#aaa' }}>No logs found.</p> : customerLogs.map((log) => (
                  <div key={log.id} style={{ borderBottom: '1px solid #333', padding: '8px 0' }}>
                    <strong>{log.action}</strong><br />
                    <span>{log.details}</span><br />
                    <span style={{ color: '#aaa' }}>{log.created_at ? new Date(log.created_at).toLocaleString('en-GB') : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }


  function renderCorrectionsPanel() {
    if (!showManagerView) return null

    return renderCollapsibleSection(
      'Booking / Payment Corrections',
      collapseCorrections,
      setCollapseCorrections,
      <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '14px', padding: '14px' }}>
        <p style={{ color: '#aaa', marginTop: 0 }}>
          Use this when staff sell the wrong minutes, need to reverse a top-up, move minutes, or record a refund/correction. Original payment records are not deleted.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          <select value={managerCorrectionCustomerId} onChange={(e) => setManagerCorrectionCustomerId(e.target.value)} style={{ padding: '10px' }}>
            <option value="">Select customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} — Standard {customer.standard_minutes_balance || 0} / Hybrid {customer.hybrid_minutes_balance || 0}
              </option>
            ))}
          </select>

          <select value={managerCorrectionType} onChange={(e) => setManagerCorrectionType(e.target.value)} style={{ padding: '10px' }}>
            <option value="reverse_standard_topup">Reverse wrong Standard top-up</option>
            <option value="reverse_hybrid_topup">Reverse wrong Hybrid top-up</option>
            <option value="move_standard_to_hybrid">Move Standard minutes to Hybrid</option>
            <option value="move_hybrid_to_standard">Move Hybrid minutes to Standard</option>
            <option value="add_standard_minutes">Add manual Standard minutes</option>
            <option value="add_hybrid_minutes">Add manual Hybrid minutes</option>
            <option value="remove_standard_minutes">Remove Standard minutes</option>
            <option value="remove_hybrid_minutes">Remove Hybrid minutes</option>
            <option value="refund_note">Refund / money-only correction note</option>
          </select>

          <input type="number" placeholder="Minutes" value={managerCorrectionAmount} onChange={(e) => setManagerCorrectionAmount(e.target.value)} style={{ padding: '10px' }} />
          <input type="number" step="0.01" placeholder="£ amount/refund value" value={managerCorrectionMoneyAmount} onChange={(e) => setManagerCorrectionMoneyAmount(e.target.value)} style={{ padding: '10px' }} />

          <select value={managerCorrectionPaymentMethod} onChange={(e) => setManagerCorrectionPaymentMethod(e.target.value)} style={{ padding: '10px' }}>
            <option value="card">Card</option>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="other">Other</option>
          </select>
        </div>

        <textarea
          placeholder="Reason required, e.g. Staff selected Hybrid instead of Standard"
          value={managerCorrectionReason}
          onChange={(e) => setManagerCorrectionReason(e.target.value)}
          style={{ width: '100%', minHeight: '80px', padding: '10px', marginTop: '10px', background: '#111', color: 'white', border: '1px solid #333', borderRadius: '10px', boxSizing: 'border-box' }}
        />

        <button onClick={applyManagerCorrection} style={{ marginTop: '10px' }}>
          Apply Manager Correction
        </button>
      </div>
    )
  }

  function renderDailyTakingsPanel() {
    const summary = getDailyTakingsSummary()
    const itemStyle = { background: '#0b0b0b', border: '1px solid #333', borderRadius: '14px', padding: '14px' }

    return renderCollapsibleSection(
      'Daily Takings / Manager View',
      collapseDailyTakings,
      setCollapseDailyTakings,
      <>
        <h3>Daily Takings — {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-GB')}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
          <div style={itemStyle}><span>Total revenue</span><h2>£{summary.totalRevenue.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Card</span><h2>£{summary.cardTotal.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Cash</span><h2>£{summary.cashTotal.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Bank transfer</span><h2>£{summary.bankTransferTotal.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Other</span><h2>£{summary.otherTotal.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Minutes sold</span><h2>{summary.totalMinutes}</h2></div>
          <div style={itemStyle}><span>Product sales</span><h2>£{summary.productRevenue.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Payment count</span><h2>{summary.paymentCount}</h2></div>
        </div>
      </>
    )
  }

  function renderCashUpPanel() {
    if (!showManagerView) return null

    const summary = getDailyTakingsSummary()
    const actualCash = cashUpActualCash === '' ? 0 : Number(cashUpActualCash || 0)
    const expectedCash = Number(summary.cashTotal || 0)
    const variance = actualCash - expectedCash
    const itemStyle = { background: '#0b0b0b', border: '1px solid #333', borderRadius: '14px', padding: '12px' }

    return renderCollapsibleSection(
      'End-of-Day Cash-Up',
      collapseCashUp,
      setCollapseCashUp,
      <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '14px', padding: '14px' }}>
        <h3 style={{ marginTop: 0 }}>Cash-Up — {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-GB')}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '12px' }}>
          <div style={itemStyle}><span>Card total</span><h2>£{summary.cardTotal.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Cash total</span><h2>£{summary.cashTotal.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Bank transfer</span><h2>£{summary.bankTransferTotal.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Other total</span><h2>£{summary.otherTotal.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Product sales</span><h2>£{summary.productRevenue.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Minutes sales</span><h2>£{summary.minutesRevenue.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Total revenue</span><h2>£{summary.totalRevenue.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Expected cash in till</span><h2>£{expectedCash.toFixed(2)}</h2></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          <input
            type="number"
            step="0.01"
            placeholder="Actual cash counted"
            value={cashUpActualCash}
            onChange={(e) => setCashUpActualCash(e.target.value)}
            style={{ padding: '10px' }}
          />
          <input
            placeholder="Manager sign-off name"
            value={cashUpManagerName}
            onChange={(e) => setCashUpManagerName(e.target.value)}
            style={{ padding: '10px' }}
          />
          <div style={{ ...itemStyle, padding: '10px' }}>
            <span>Variance</span>
            <h2 style={{ margin: '4px 0 0', color: variance === 0 ? '#d4a853' : '#ffcc66' }}>£{variance.toFixed(2)}</h2>
          </div>
        </div>

        <textarea
          placeholder="Variance notes"
          value={cashUpVarianceNotes}
          onChange={(e) => setCashUpVarianceNotes(e.target.value)}
          style={{ width: '100%', minHeight: '76px', padding: '10px', marginTop: '10px', background: '#111', color: 'white', border: '1px solid #333', borderRadius: '10px', boxSizing: 'border-box' }}
        />

        <button onClick={saveCashUp} disabled={cashUpSaving} style={{ marginTop: '10px' }}>
          {cashUpSaving ? 'Saving Cash-Up...' : 'Save Cash-Up'}
        </button>
      </div>
    )
  }

  function renderStaffSelectorModal() {
    if (!staffSelectorOpen) return null
    const activeStaff = staff.filter((member) => member.is_active !== false)

    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#1e1e1e', padding: '24px', borderRadius: '18px', width: '420px', maxWidth: '92%' }}>
          <h2>Select Staff User</h2>
          {activeStaff.map((member) => (
            <button key={member.id} onClick={() => selectCurrentStaffUser(member)} style={{ width: '100%', marginBottom: '8px', textAlign: 'left' }}>
              {member.name} — {formatStatus(member.role)}
            </button>
          ))}
          <button onClick={() => setStaffSelectorOpen(false)}>Cancel</button>
        </div>
      </div>
    )
  }

  function renderCollapsibleSection(title, isCollapsed, setIsCollapsed, children) {
    return (
      <div style={{ marginBottom: '18px', border: '1px solid rgba(212,168,83,0.25)', borderRadius: '18px', overflow: 'hidden', background: '#111' }}>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{
            width: '100%',
            borderRadius: 0,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 18px',
            fontSize: '16px'
          }}
        >
          <span>{title}</span>
          <span>{isCollapsed ? 'Open +' : 'Hide −'}</span>
        </button>

        {!isCollapsed && (
          <div style={{ padding: '16px' }}>
            {children}
          </div>
        )}
      </div>
    )
  }

  function renderStaffManagementPanel() {
    if (!showManagerView) return null

    return renderCollapsibleSection(
      'Staff Management',
      collapseStaffManagement,
      setCollapseStaffManagement,
      <>
        {staffLoadError && <p style={{ color: '#ff7875' }}>{staffLoadError}</p>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '15px' }}>
          <input placeholder="Staff name" value={staffName} onChange={(e) => setStaffName(e.target.value)} style={{ padding: '10px' }} />
          <select value={staffRole} onChange={(e) => setStaffRole(e.target.value)} style={{ padding: '10px' }}>
            <option value="staff">Staff</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
          <button onClick={saveStaffMember}>{staffEditingId ? 'Save Staff' : 'Add Staff'}</button>
          {staffEditingId && <button onClick={() => { setStaffEditingId(''); setStaffName(''); setStaffRole('staff') }}>Cancel Edit</button>}
        </div>

        <select
          value=""
          onChange={(e) => {
            const member = staff.find((item) => String(item.id) === e.target.value)
            if (member) editStaffMember(member)
          }}
          style={{ width: '100%', padding: '10px', marginBottom: '12px', boxSizing: 'border-box' }}
        >
          <option value="">Select staff to edit...</option>
          {staff.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name} — {formatStatus(member.role)} — {member.weekly_free_minutes_balance || 0} mins — {member.is_active === false ? 'Inactive' : 'Active'}
            </option>
          ))}
        </select>

        <div style={{ maxHeight: '170px', overflowY: 'auto', border: '1px solid #333', borderRadius: '12px', marginBottom: '15px' }}>
          {staff.map((member) => (
            <div key={member.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px', alignItems: 'center', padding: '10px', borderBottom: '1px solid #222' }}>
              <span><strong>{member.name}</strong> — {formatStatus(member.role)} — {member.weekly_free_minutes_balance || 0} mins — {member.is_active === false ? 'Inactive' : 'Active'}</span>
              <button onClick={() => editStaffMember(member)}>Edit</button>
              <button onClick={() => deactivateStaffMember(member)}>Deactivate</button>
            </div>
          ))}
        </div>

        <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '14px', padding: '14px' }}>
          <h3 style={{ marginTop: 0 }}>Adjust Staff Free Minutes</h3>
          <select value={staffAdjustmentId} onChange={(e) => setStaffAdjustmentId(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '8px', boxSizing: 'border-box' }}>
            <option value="">Select staff</option>
            {staff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
          <input type="number" placeholder="+/- minutes" value={staffAdjustmentAmount} onChange={(e) => setStaffAdjustmentAmount(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '8px', boxSizing: 'border-box' }} />
          <input placeholder="Reason" value={staffAdjustmentReason} onChange={(e) => setStaffAdjustmentReason(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '8px', boxSizing: 'border-box' }} />
          <button onClick={adjustStaffMinutes}>Apply Staff Adjustment</button>
        </div>
      </>
    )
  }

  function renderMaintenancePanel() {
    if (!showManagerView) return null

    return renderCollapsibleSection(
      'Maintenance',
      collapseMaintenance,
      setCollapseMaintenance,
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
        {beds.map((bed) => (
          <div key={bed.id} style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '14px', padding: '14px' }}>
            <h3>{bed.name}</h3>
            {bed.is_out_of_service && <p style={{ color: '#ff7875', fontWeight: 'bold' }}>OUT OF SERVICE</p>}
            <p>Runtime: <strong>{getBedRuntimeHours(bed).toFixed(2)} hours</strong></p>
            <p>Tube target: <strong>{getBedTargetHours(bed)} hours</strong></p>
            <p>Hours remaining: <strong>{getBedHoursRemaining(bed).toFixed(2)}</strong></p>
            <p>Last tube change: {bed.last_tube_change_date ? new Date(bed.last_tube_change_date).toLocaleDateString('en-GB') : 'Not recorded'}</p>
            <textarea defaultValue={bed.maintenance_notes || ''} placeholder="Maintenance notes" onBlur={(e) => updateBedMaintenance(bed.id, { maintenance_notes: e.target.value })} style={{ width: '100%', minHeight: '70px', padding: '10px', background: '#0b0b0b', color: 'white', border: '1px solid #333', borderRadius: '10px', boxSizing: 'border-box' }} />
            <input type="number" defaultValue={getBedTargetHours(bed)} onBlur={(e) => updateBedMaintenance(bed.id, { next_tube_change_hours: Number(e.target.value) })} style={{ width: '100%', padding: '10px', marginTop: '8px', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
              <button onClick={() => resetBedRuntime(bed)}>Reset Tube Hours</button>
              <button onClick={() => updateBedMaintenance(bed.id, { is_out_of_service: !bed.is_out_of_service })}>{bed.is_out_of_service ? 'Back In Service' : 'Out Of Service'}</button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  function renderProductsManagementPanel() {
    if (!showManagerView) return null

    const selectedProduct = products.find((product) => String(product.id) === String(selectedProductManagementId))
    const lowStockProducts = getLowStockProducts()
    const outOfStockProducts = getOutOfStockProducts()

    return renderCollapsibleSection(
      'Products',
      collapseProducts,
      setCollapseProducts,
      <>
        {productLoadError && <p style={{ color: '#ff7875' }}>{productLoadError}</p>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '15px' }}>
          <input placeholder="Product name" value={productName} onChange={(e) => setProductName(e.target.value)} style={{ padding: '10px' }} />
          <select value={productCategory} onChange={(e) => setProductCategory(e.target.value)} style={{ padding: '10px' }}>
            <option value="tanning_lotions">Tanning lotions</option>
            <option value="drinks">Drinks</option>
            <option value="accessories">Accessories</option>
            <option value="other">Other</option>
          </select>
          <input type="number" step="0.01" placeholder="Price" value={productPrice} onChange={(e) => setProductPrice(e.target.value)} style={{ padding: '10px' }} />
          <input type="number" placeholder="Stock quantity" value={productStockQuantity} onChange={(e) => setProductStockQuantity(e.target.value)} style={{ padding: '10px' }} />
          <button onClick={saveProduct}>{productEditingId ? 'Save Product' : 'Add Product'}</button>
          {productEditingId && <button onClick={clearProductForm}>Cancel Edit</button>}
        </div>

        <button onClick={() => { if (requireStaffSignIn()) setShowStandalonePOS(true) }} style={{ marginBottom: '15px' }}>Products / POS</button>

        <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '14px', padding: '14px', marginBottom: '15px' }}>
          <h3 style={{ marginTop: 0 }}>Stock Warnings</h3>
          {lowStockProducts.length === 0 && outOfStockProducts.length === 0 ? (
            <p style={{ color: '#aaa', marginBottom: 0 }}>No low or out of stock products.</p>
          ) : (
            <>
              {outOfStockProducts.length > 0 && (
                <div style={{ marginBottom: '10px' }}>
                  <strong style={{ color: '#ff7875' }}>Out of stock</strong>
                  {outOfStockProducts.map((product) => (
                    <div key={product.id} style={{ padding: '6px 0', borderBottom: '1px solid #222' }}>{product.name} — Stock {getProductStockQuantity(product)}</div>
                  ))}
                </div>
              )}
              {lowStockProducts.length > 0 && (
                <div>
                  <strong style={{ color: '#ffcc66' }}>Low stock</strong>
                  {lowStockProducts.map((product) => (
                    <div key={product.id} style={{ padding: '6px 0', borderBottom: '1px solid #222' }}>{product.name} — Stock {getProductStockQuantity(product)}</div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '14px', padding: '14px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Manage existing product</label>
          <select
            value={selectedProductManagementId}
            onChange={(e) => setSelectedProductManagementId(e.target.value)}
            style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }}
          >
            <option value="">Select product...</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} — {formatStatus(product.category)} — £{Number(product.price || 0).toFixed(2)} — Stock {getProductStockQuantity(product)} — {getProductStockStatus(product)} — {product.is_active === false ? 'Inactive' : 'Active'}
              </option>
            ))}
          </select>

          {selectedProduct && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '10px', alignItems: 'center', marginTop: '12px', padding: '12px', background: '#111', borderRadius: '12px' }}>
              <div>
                <strong>{selectedProduct.name}</strong><br />
                <span>{formatStatus(selectedProduct.category)} — £{Number(selectedProduct.price || 0).toFixed(2)} — Stock {getProductStockQuantity(selectedProduct)}</span><br />
                <span style={getProductStockStatusStyle(selectedProduct)}>{getProductStockStatus(selectedProduct)}</span><br />
                <span>Status: {selectedProduct.is_active === false ? 'Inactive' : 'Active'}</span>
              </div>
              <button onClick={() => editProduct(selectedProduct)}>Edit</button>
              <button onClick={() => deactivateProduct(selectedProduct)}>Deactivate</button>
            </div>
          )}
        </div>

        {showStandalonePOS && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#1e1e1e', padding: '24px', borderRadius: '18px', width: '560px', maxWidth: '92%', maxHeight: '85vh', overflowY: 'auto' }}>
              <h2>Products / POS</h2>
              {getActiveProducts().map((product) => (
                <div key={product.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', background: '#111', padding: '10px', borderRadius: '12px', marginBottom: '8px' }}>
                  <div><strong>{product.name}</strong><br /><small>£{Number(product.price || 0).toFixed(2)} — Stock {getProductStockQuantity(product)} — <span style={getProductStockStatusStyle(product)}>{getProductStockStatus(product)}</span></small></div>
                  <button onClick={() => addProductToCart(product)}>Add</button>
                </div>
              ))}
              {renderProductCart()}
              <select value={posPaymentMethod} onChange={(e) => setPosPaymentMethod(e.target.value)} style={{ width: '100%', padding: '10px', margin: '8px 0' }}>
                <option value="card">Card</option>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="other">Other</option>
              </select>
              <button onClick={sellProductsOnly}>Record Product Sale</button>
              <button onClick={() => { setShowStandalonePOS(false); clearProductCart() }} style={{ marginLeft: '10px' }}>Close</button>
            </div>
          </div>
        )}
      </>
    )
  }

  const upcomingBookings = getUpcomingBookingsWithin20Minutes()
  const currentStaffUser = getCurrentStaffUser()

  return (
    <div style={{ padding: '24px', background: '#050505', minHeight: '100vh', color: 'white' }}>
      <div className="top-dashboard-header" style={{ display: 'grid', gridTemplateColumns: '180px 1fr auto auto', gap: '16px', alignItems: 'center', marginBottom: '24px' }}>
        <div className="glow-header" style={{ margin: 0, justifyContent: 'flex-start' }}>
          <img src="/logo.png" alt="Glow Tanning" style={{ height: '90px', objectFit: 'contain', filter: 'drop-shadow(0 0 20px rgba(255,200,50,0.35))' }} />
        </div>

        <div style={{ background: '#1e1e1e', border: '1px solid rgba(212,168,83,0.25)', borderRadius: '18px', padding: '14px' }}>
          <strong>Upcoming within 20 minutes</strong>
          {upcomingBookings.length === 0 ? <p style={{ color: '#aaa', margin: '8px 0 0' }}>No bookings due.</p> : (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
              {upcomingBookings.map((booking) => (
                <button key={booking.id} onClick={() => openBooking(booking)} style={{ background: getCalendarBookingColour(booking), color: 'white' }}>
                  {new Date(booking.appointment_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} {booking.customer_name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button onClick={() => setShowCustomerManagement(!showCustomerManagement)}>{showCustomerManagement ? 'Hide Customers' : 'Customer Management'}</button>
          {showManagerView ? <button onClick={() => setShowManagerView(false)}>Hide Manager View</button> : <button onClick={openManagerView}>Manager View</button>}
          {currentStaffUser ? (
            <div style={{ background: '#111', border: '1px solid #333', borderRadius: '12px', padding: '10px' }}>
              Signed in: <strong>{currentStaffUser.name}</strong><br />
              <button onClick={() => setStaffSelectorOpen(true)} style={{ marginTop: '6px' }}>Switch User</button>
            </div>
          ) : (
            <button onClick={() => setStaffSelectorOpen(true)}>Staff Sign In</button>
          )}
        </div>

        <div style={{ textAlign: 'right', background: '#1e1e1e', border: '1px solid rgba(212,168,83,0.25)', borderRadius: '18px', padding: '14px', minWidth: '180px' }}>
          <div style={{ fontSize: '30px', fontWeight: 'bold' }}>{formatClock(currentTime)}</div>
          <div style={{ color: '#aaa' }}>{currentTime.toLocaleDateString('en-GB')}</div>
        </div>
      </div>

      {!currentStaffUser && (
        <div style={{ background: '#1e1e1e', border: '1px solid rgba(212,168,83,0.55)', borderRadius: '14px', padding: '12px 16px', color: '#ffcc66', fontWeight: 'bold', marginBottom: '18px' }}>
          Please sign in before creating bookings or using the till.
        </div>
      )}

      {showCustomerManagement && renderCustomerManagementPanel()}
      {showManagerView && renderStaffManagementPanel()}
      {showManagerView && renderMaintenancePanel()}
      {showManagerView && renderProductsManagementPanel()}
      {showManagerView && renderCorrectionsPanel()}
      {showManagerView && renderCashUpPanel()}
      {showManagerView && renderDailyTakingsPanel()}

      <h2 style={{ textAlign: 'center' }}>Sunbeds</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '40px' }}>
        {beds.map((bed) => {
          const booking = getBookingForBed(bed.id)
          const phase = getPhase(booking)

          return (
            <div key={bed.id} style={{ background: getBedColour(bed.id), padding: '25px', borderRadius: '20px' }}>
              <h2>{bed.name}</h2>
              <p>T-Max Room: {bed.tmax_room}</p>
              {bed.is_out_of_service && <h2>OUT OF SERVICE</h2>}
              {booking ? (
                <>
                  <p>Customer: <strong>{booking.customer_name}</strong></p>
                  <p>Minutes: <strong>{booking.minutes}</strong></p>
                  <p>Phase: <strong>{phase}</strong></p>
                  {['Undressing', 'Running', 'Cooldown'].includes(phase) && <h1>{getRemainingTime(booking)}</h1>}
                </>
              ) : (
                <p><strong>{bed.is_out_of_service ? 'UNAVAILABLE' : 'AVAILABLE'}</strong></p>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', marginBottom: '20px' }}>
        <h2>Daily Calendar</h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button onClick={jumpToNow}>Jump to Now</button>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
        </div>
      </div>

      <div style={{ overflowX: 'auto', background: '#1e1e1e', borderRadius: '16px', padding: '20px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #444', padding: '10px' }}>Time</th>
              {beds.map((bed) => <th key={bed.id} style={{ border: '1px solid #444', padding: '10px' }}>{bed.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {generateTimeSlots().map((time) => {
              const currentRow = isCurrentTimeSlot(time)
              const isShopPrepTime = time >= '08:00' && time < '08:30'

              return (
                <tr
                  key={time}
                  data-current-time-row={currentRow ? 'true' : undefined}
                  style={{
                    borderTop: currentRow ? '4px solid #ff4d4f' : 'none',
                    boxShadow: currentRow ? '0 -2px 8px rgba(255,77,79,0.8)' : 'none',
                    background: isShopPrepTime ? 'rgba(212,168,83,0.08)' : 'transparent'
                  }}
                >
                  <td style={{ border: '1px solid #444', padding: '8px', fontWeight: 'bold', width: '90px', background: currentRow ? '#ff4d4f' : isShopPrepTime ? 'rgba(212,168,83,0.18)' : 'transparent', color: 'white' }}>
                    {time}
                    {isShopPrepTime && <><br /><span style={{ fontSize: '11px', color: '#d4a853' }}>SHOP PREP</span></>}
                    {currentRow && <><br /><span style={{ fontSize: '12px' }}>NOW</span></>}
                  </td>
                  {beds.map((bed) => {
                    if (isSlotCoveredByEarlierBooking(time, bed.id)) return null
                    const booking = getCalendarBookingStartingAt(time, bed.id)
                    return (
                      <td key={bed.id} rowSpan={booking ? getTotalSlotCount(booking) : 1} onClick={() => booking ? openBooking(booking) : openEmptySlot(time, bed.id)} style={{ border: currentRow ? '2px solid #ff4d4f' : '1px solid #444', padding: '8px', minHeight: '40px', background: getCalendarCellBackground(booking, bed.id), cursor: 'pointer', verticalAlign: 'top' }}>
                        {booking ? (
                          <div>
                            <strong>{booking.customer_name}</strong><br />
                            {booking.minutes} mins<br />
                            Blocked: {getTotalBlockMinutes(booking)} mins<br />
                            {getPhase(booking)}
                            {booking.customer_started_at && (
                              <>
                                <br />
                                Started: {new Date(booking.customer_started_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                              </>
                            )}
                          </div>
                        ) : isBedOutOfService(bed.id) ? (
                          <span style={{ color: '#ff7875', fontWeight: 'bold' }}>OUT OF SERVICE</span>
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
          <div style={{ background: '#1e1e1e', padding: '30px', borderRadius: '20px', width: '500px', maxWidth: '92%', maxHeight: '90vh', overflowY: 'auto' }}>
            {!modalBooking ? (
              <>
                <h2>Create Booking</h2>
                <p>{getBedName(modalSlot?.bedId)} at {modalSlot?.time}</p>
                {renderCustomerSearchBox()}
                <select value={selectedMinutes} onChange={(e) => setSelectedMinutes(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '12px', boxSizing: 'border-box' }}>
                  {Array.from({ length: 18 }, (_, i) => i + 3).map((minute) => <option key={minute} value={minute}>{minute} mins</option>)}
                </select>
                <p>Total blocked time: <strong>{Number(selectedMinutes) + 6} mins</strong></p>
                {renderTopUpSection()}

                <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '12px', padding: '12px', marginBottom: '12px', textAlign: 'center' }}>
                  <h3 style={{ marginTop: 0, marginBottom: '8px', color: '#d4a853' }}>Shop-only test</h3>
                  <p style={{ margin: '0 0 10px', color: '#aaa', fontSize: '14px' }}>
                    Use this for a 2 min wake-up/test, mainly for Bed 2 before opening.
                  </p>
                  <button
                    onClick={createShopTestBookingFromModal}
                  >
                    Create 2 Min Shop Test
                  </button>
                </div>

                <button
                  onClick={createBookingFromModal}
                >
                  Create Booking
                </button>
                <button onClick={closeModal} style={{ marginLeft: '10px' }}>Cancel</button>
              </>
            ) : editMode ? (
              <>
                <h2>Edit Booking</h2>
                {renderCustomerSearchBox()}
                <select value={editTime} onChange={(e) => setEditTime(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '12px', boxSizing: 'border-box' }}>
                  {generateTimeSlots().map((time) => <option key={time} value={time}>{time}</option>)}
                </select>
                <select value={editBedId} onChange={(e) => setEditBedId(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '12px', boxSizing: 'border-box' }}>
                  {beds.map((bed) => <option key={bed.id} value={bed.id}>{bed.name}</option>)}
                </select>
                <select value={selectedMinutes} onChange={(e) => setSelectedMinutes(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '12px', boxSizing: 'border-box' }}>
                  {Array.from({ length: 18 }, (_, i) => i + 3).map((minute) => <option key={minute} value={minute}>{minute} mins</option>)}
                </select>
                <p>Total blocked time: <strong>{Number(selectedMinutes) + 6} mins</strong></p>
                {renderTopUpSection()}
                <button
                  onClick={saveEditedBooking}
                >
                  Save Changes
                </button>
                <button onClick={() => setEditMode(false)} style={{ marginLeft: '10px' }}>Cancel</button>
              </>
            ) : (
              <>
                <h2>{modalBooking.customer_name}</h2>
                <p>{getBedName(modalBooking.bed_id)}</p>
                <p>Appointment: {new Date(modalBooking.appointment_time).toLocaleString('en-GB')}</p>
                <p>Minutes: {modalBooking.minutes}</p>
                {isStaffFreeBooking(modalBooking) ? (
                  <p>Staff free booking</p>
                ) : getCustomerForBooking(modalBooking) && (
                  <>
                    <p>Standard balance: <strong>{getCustomerForBooking(modalBooking).standard_minutes_balance || 0} mins</strong></p>
                    <p>Hybrid balance: <strong>{getCustomerForBooking(modalBooking).hybrid_minutes_balance || 0} mins</strong></p>
                  </>
                )}
                <p>Total blocked time: {getTotalBlockMinutes(modalBooking)} mins</p>
                <p>Phase: <strong>{getPhase(modalBooking)}</strong></p>
                {modalBooking.tmax_sent_at && <p>Time sent: {new Date(modalBooking.tmax_sent_at).toLocaleTimeString('en-GB')}</p>}
                {modalBooking.customer_started_at && <p>Customer started: {new Date(modalBooking.customer_started_at).toLocaleTimeString('en-GB')}</p>}
                {['Undressing', 'Running', 'Cooldown'].includes(getPhase(modalBooking)) && <h2>Remaining: {getRemainingTime(modalBooking)}</h2>}
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '20px' }}>
                  {!modalBooking.booking_start && !['completed', 'no_show', 'force_stopped'].includes(String(modalBooking.status || '').toLowerCase()) && (
                    <button
                      onClick={() => startSession(modalBooking)}
                    >
                      Send Time / Start Undress
                    </button>
                  )}

                  {modalBooking.booking_start && !modalBooking.customer_started_at && !['completed', 'no_show', 'force_stopped'].includes(String(modalBooking.status || '').toLowerCase()) && (
                    <button onClick={() => customerStartedBed(modalBooking)}>
                      Customer Started Bed
                    </button>
                  )}

                  {['booked'].includes(String(modalBooking.status || '').toLowerCase()) && !modalBooking.booking_start && !isStaffFreeBooking(modalBooking) && !isShopTestBooking(modalBooking) && (
                    <button onClick={() => setEditMode(true)}>Edit</button>
                  )}

                  {['undressing', 'running', 'cooldown'].includes(String(modalBooking.status || '').toLowerCase()) && (
                    <button onClick={() => forceStop(modalBooking)}>Force Stop</button>
                  )}

                  {['booked'].includes(String(modalBooking.status || '').toLowerCase()) && !modalBooking.booking_start && (
                    <button onClick={() => updateBookingStatus(modalBooking.id, 'no_show')}>No Show</button>
                  )}

                  {['completed', 'no_show', 'force_stopped'].includes(String(modalBooking.status || '').toLowerCase()) && (
                    <button onClick={() => managerResetBooking(modalBooking)}>Manager Reset</button>
                  )}

                  {!modalBooking.booking_start && (
                    <button onClick={() => deleteBooking(modalBooking)}>Delete</button>
                  )}

                  <button onClick={closeModal}>Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {renderStaffSelectorModal()}

      {showBackToTop && (
        <button onClick={scrollToTop} title="Back to top" style={{ position: 'fixed', right: '24px', bottom: '24px', width: '58px', height: '58px', borderRadius: '50%', fontSize: '26px', zIndex: 1001 }}>
          ↑
        </button>
      )}
    </div>
  )
}

export default App
