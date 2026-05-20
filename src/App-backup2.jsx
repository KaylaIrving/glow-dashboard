import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabase'
import './App.css'

const UNDRESS_SECONDS = 180
const COOLDOWN_SECONDS = 180
const SLOT_MINUTES = 5
const MANAGER_PIN = '3090'
const WEEKLY_STAFF_FREE_MINUTES = 18
const LOW_STOCK_THRESHOLD = 5

// TODO Wix integration: fill this once the final Wix service names and bed rules are confirmed.
// Example shape:
// '10 minute sunbed bed 1': { bedId: 1, minutes: 10 }
// Keep empty for now so Wix cannot silently guess the wrong bed/minutes.
const WIX_SERVICE_BOOKING_MAP = {}

const SPRAY_TAN_SERVICES = [
  { name: 'Full Body', price: 30 },
  { name: 'Express Tan', price: 35 },
  { name: 'Face & Neck', price: 8 },
  { name: 'Legs Only', price: 18 },
  { name: 'Upper Body & Face', price: 22 },
  { name: 'Patch Test', price: 0 }
]

const SPRAY_TAN_COLUMNS = [
  { value: 'spray_tan', label: 'Spray Tan' },
  { value: 'express_tan', label: 'Express Tan' },
  { value: 'patch_test', label: 'Patch Test' }
]

const SPRAY_TAN_STATUSES = [
  'Pending Approval',
  'Approved',
  'Deposit Pending',
  'Deposit Paid',
  'Completed',
  'Cancelled'
]

const STAFF_SCHEDULE_TYPES = [
  { value: 'shift', label: 'Shift' },
  { value: 'spray_tan_available', label: 'Spray Tan Available' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'time_off', label: 'Time Off' },
  { value: 'shop_closed', label: 'Shop Closed' },
  { value: 'training', label: 'Training' },
  { value: 'other', label: 'Other' }
]

const STAFF_SERVICE_TYPES = [
  { value: 'general', label: 'General' },
  { value: 'sunbeds', label: 'Sunbeds' },
  { value: 'spraytan', label: 'Spray Tan' }
]

const PRODUCT_CATEGORIES = [
  { value: 'tanning_lotions', label: 'Tanning Lotions' },
  { value: 'sachets', label: 'Sachets' },
  { value: 'bottles', label: 'Bottles' },
  { value: 'drinks', label: 'Drinks' },
  { value: 'other', label: 'Other' }
]

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
  const [dashboardView, setDashboardView] = useState('sunbeds')

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
  const [shopTestFreeUse, setShopTestFreeUse] = useState(true)
  const [editTime, setEditTime] = useState('')
  const [editBedId, setEditBedId] = useState('')
  const [showBookingTopUp, setShowBookingTopUp] = useState(false)
  const [showBookingProducts, setShowBookingProducts] = useState(false)
  const [bookingSaving, setBookingSaving] = useState(false)
  const [sprayTanModalOpen, setSprayTanModalOpen] = useState(false)
  const [sprayTanEditingBooking, setSprayTanEditingBooking] = useState(null)
  const [sprayTanSlot, setSprayTanSlot] = useState(null)
  const [sprayTanCustomerName, setSprayTanCustomerName] = useState('')
  const [sprayTanColumn, setSprayTanColumn] = useState('spray_tan')
  const [sprayTanService, setSprayTanService] = useState('Full Body')
  const [sprayTanDate, setSprayTanDate] = useState(formatLocalDate(new Date()))
  const [sprayTanTime, setSprayTanTime] = useState('09:00')
  const [sprayTanDuration, setSprayTanDuration] = useState(30)
  const [sprayTanArtist, setSprayTanArtist] = useState('')
  const [sprayTanNotes, setSprayTanNotes] = useState('')
  const [sprayTanDepositRequired, setSprayTanDepositRequired] = useState(15)
  const [sprayTanDepositPaid, setSprayTanDepositPaid] = useState('')
  const [sprayTanDepositStatus, setSprayTanDepositStatus] = useState('pending')
  const [sprayTanPatchCompleted, setSprayTanPatchCompleted] = useState(false)
  const [sprayTanPatchTestDate, setSprayTanPatchTestDate] = useState('')
  const [sprayTanApprovalStatus, setSprayTanApprovalStatus] = useState('pending')
  const [sprayTanStatusControl, setSprayTanStatusControl] = useState('Pending Approval')
  const [sprayTanSaving, setSprayTanSaving] = useState(false)

  const [showCustomerManagement, setShowCustomerManagement] = useState(false)
  const [showManagerView, setShowManagerView] = useState(false)
  const [managerUnlocked, setManagerUnlocked] = useState(false)
  const [collapseStaffManagement, setCollapseStaffManagement] = useState(true)
  const [collapseStaffCalendar, setCollapseStaffCalendar] = useState(true)
  const [collapseMaintenance, setCollapseMaintenance] = useState(true)
  const [collapseProducts, setCollapseProducts] = useState(true)
  const [collapseExports, setCollapseExports] = useState(true)
  const [collapseWixSync, setCollapseWixSync] = useState(true)
  const [collapseReceipts, setCollapseReceipts] = useState(true)
  const [collapseCashUp, setCollapseCashUp] = useState(true)
  const [collapseDailyTakings, setCollapseDailyTakings] = useState(true)
  const [selectedProductManagementId, setSelectedProductManagementId] = useState('')
  const [customerManagerSearch, setCustomerManagerSearch] = useState('')
  const [showAllCustomersList, setShowAllCustomersList] = useState(false)
  const [allCustomersSearch, setAllCustomersSearch] = useState('')
  const [selectedManagerCustomerId, setSelectedManagerCustomerId] = useState('')
  const [managerName, setManagerName] = useState('')
  const [managerFirstName, setManagerFirstName] = useState('')
  const [managerLastName, setManagerLastName] = useState('')
  const [managerPhone, setManagerPhone] = useState('')
  const [managerEmail, setManagerEmail] = useState('')
  const [managerDateOfBirth, setManagerDateOfBirth] = useState('')
  const [managerAddress, setManagerAddress] = useState('')
  const [managerPostcode, setManagerPostcode] = useState('')
  const [managerGender, setManagerGender] = useState('')
  const [managerSprayTanNotes, setManagerSprayTanNotes] = useState('')
  const [managerLastPatchTestDate, setManagerLastPatchTestDate] = useState('')
  const [managerNotes, setManagerNotes] = useState('')
  const [managerStandardBalance, setManagerStandardBalance] = useState(0)
  const [managerHybridBalance, setManagerHybridBalance] = useState(0)
  const [managerTermsAccepted, setManagerTermsAccepted] = useState(false)
  const [managerIdChecked, setManagerIdChecked] = useState(false)
  const [managerActive, setManagerActive] = useState(true)
  const [managerWarningFlag, setManagerWarningFlag] = useState(false)
  const [managerWarningLevel, setManagerWarningLevel] = useState('none')
  const [managerWarningNote, setManagerWarningNote] = useState('')
  const [showAddCustomerForm, setShowAddCustomerForm] = useState(false)
  const [addCustomerFirstName, setAddCustomerFirstName] = useState('')
  const [addCustomerLastName, setAddCustomerLastName] = useState('')
  const [addCustomerPhone, setAddCustomerPhone] = useState('')
  const [addCustomerEmail, setAddCustomerEmail] = useState('')
  const [addCustomerDateOfBirth, setAddCustomerDateOfBirth] = useState('')
  const [addCustomerAddress, setAddCustomerAddress] = useState('')
  const [addCustomerPostcode, setAddCustomerPostcode] = useState('')
  const [addCustomerGender, setAddCustomerGender] = useState('')
  const [addCustomerNotes, setAddCustomerNotes] = useState('')
  const [addCustomerStandardMinutes, setAddCustomerStandardMinutes] = useState('')
  const [addCustomerHybridMinutes, setAddCustomerHybridMinutes] = useState('')
  const [addCustomerActive, setAddCustomerActive] = useState(true)
  const [addCustomerWarningFlag, setAddCustomerWarningFlag] = useState(false)
  const [addCustomerWarningLevel, setAddCustomerWarningLevel] = useState('none')
  const [addCustomerWarningNote, setAddCustomerWarningNote] = useState('')
  const [addCustomerSaving, setAddCustomerSaving] = useState(false)
  const [addCustomerSuccess, setAddCustomerSuccess] = useState('')
  const [showCustomerImport, setShowCustomerImport] = useState(false)
  const [customerImportRows, setCustomerImportRows] = useState([])
  const [customerImportSummary, setCustomerImportSummary] = useState(null)
  const [customerImportLoading, setCustomerImportLoading] = useState(false)
  const [customerImportSaving, setCustomerImportSaving] = useState(false)
  const [customerImportProgress, setCustomerImportProgress] = useState('')
  const [customerImportError, setCustomerImportError] = useState('')
  const [customerPayments, setCustomerPayments] = useState([])
  const [customerLogs, setCustomerLogs] = useState([])
  const [customerMinuteTransactions, setCustomerMinuteTransactions] = useState([])
  const [customerReceipts, setCustomerReceipts] = useState([])

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
  const [cashFloatSaving, setCashFloatSaving] = useState(false)
  const [cashUpCompleting, setCashUpCompleting] = useState(false)
  const [cashUpStartFloat, setCashUpStartFloat] = useState('')
  const [cashUpExistingRecord, setCashUpExistingRecord] = useState(null)
  const [cashUpLoadError, setCashUpLoadError] = useState('')
  const [floatMovements, setFloatMovements] = useState([])
  const [floatMovementLoadError, setFloatMovementLoadError] = useState('')
  const [floatMovementType, setFloatMovementType] = useState('added')
  const [floatMovementAmount, setFloatMovementAmount] = useState('')
  const [floatMovementNote, setFloatMovementNote] = useState('')
  const [floatMovementEditingId, setFloatMovementEditingId] = useState('')
  const [floatMovementSaving, setFloatMovementSaving] = useState(false)
  const [showCashUpLockConfirm, setShowCashUpLockConfirm] = useState(false)

  const [currentStaffUserId, setCurrentStaffUserId] = useState('')
  const [staffSelectorOpen, setStaffSelectorOpen] = useState(false)
  const [staffLoadError, setStaffLoadError] = useState('')
  const [staffName, setStaffName] = useState('')
  const [staffRole, setStaffRole] = useState('staff')
  const [staffEditingId, setStaffEditingId] = useState('')
  const [staffAdjustmentId, setStaffAdjustmentId] = useState('')
  const [staffAdjustmentAmount, setStaffAdjustmentAmount] = useState('')
  const [staffAdjustmentReason, setStaffAdjustmentReason] = useState('')
  const [staffSchedule, setStaffSchedule] = useState([])
  const [staffScheduleLoadError, setStaffScheduleLoadError] = useState('')
  const [staffScheduleSaving, setStaffScheduleSaving] = useState(false)
  const [staffScheduleEditingId, setStaffScheduleEditingId] = useState('')
  const [staffScheduleStaffId, setStaffScheduleStaffId] = useState('')
  const [staffScheduleDate, setStaffScheduleDate] = useState(formatLocalDate(new Date()))
  const [staffScheduleStartTime, setStaffScheduleStartTime] = useState('09:00')
  const [staffScheduleEndTime, setStaffScheduleEndTime] = useState('17:00')
  const [staffScheduleType, setStaffScheduleType] = useState('shift')
  const [staffScheduleServiceType, setStaffScheduleServiceType] = useState('general')
  const [staffScheduleNotes, setStaffScheduleNotes] = useState('')
  const [staffScheduleAvailable, setStaffScheduleAvailable] = useState(true)
  const [staffScheduleFilterStaffId, setStaffScheduleFilterStaffId] = useState('')
  const [staffScheduleFilterType, setStaffScheduleFilterType] = useState('')
  const [staffScheduleFilterServiceType, setStaffScheduleFilterServiceType] = useState('')

  const [productLoadError, setProductLoadError] = useState('')
  const [productCart, setProductCart] = useState([])
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [bookingProductId, setBookingProductId] = useState('')
  const [bookingProductQuantity, setBookingProductQuantity] = useState(1)
  const [bookingProductCategoryFilter, setBookingProductCategoryFilter] = useState('')
  const [showStandalonePOS, setShowStandalonePOS] = useState(false)
  const [posPaymentMethod, setPosPaymentMethod] = useState('card')
  const [posCashReceived, setPosCashReceived] = useState('')
  const [productName, setProductName] = useState('')
  const [productCategory, setProductCategory] = useState('sachets')
  const [productPrice, setProductPrice] = useState('')
  const [productStockQuantity, setProductStockQuantity] = useState('')
  const [productIsActive, setProductIsActive] = useState(true)
  const [productEditingId, setProductEditingId] = useState('')

  const [saleReceipt, setSaleReceipt] = useState(null)
  const [newCustomerTermsAccepted, setNewCustomerTermsAccepted] = useState(false)
  const [newCustomerIdChecked, setNewCustomerIdChecked] = useState(false)

  const [dataLoadWarning, setDataLoadWarning] = useState('')
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false)
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [wixSyncStatus, setWixSyncStatus] = useState('Not run yet')
  const [wixImportedCount, setWixImportedCount] = useState(0)
  const [wixFailedCount, setWixFailedCount] = useState(0)
  const [wixSyncRunning, setWixSyncRunning] = useState(false)
  const [managerReceipts, setManagerReceipts] = useState([])
  const [receiptSearchDate, setReceiptSearchDate] = useState(formatLocalDate(new Date()))
  const [receiptSearchCustomer, setReceiptSearchCustomer] = useState('')
  const [receiptSearchType, setReceiptSearchType] = useState('')
  const [receiptSearchPaymentMethod, setReceiptSearchPaymentMethod] = useState('')
  const [receiptSearchLoading, setReceiptSearchLoading] = useState(false)
  const [receiptSearchError, setReceiptSearchError] = useState('')

  useEffect(() => {
    getBeds()
    getBookings()
    getCustomers()
    getStaff()
    getProducts()
    getStaffSchedule()
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    autoCompleteFinishedSessions()
  }, [currentTime, bookings])

  useEffect(() => {
    getDailyTakings()
    getCashUpForSelectedDate()
    getFloatMovements()
    getStaffSchedule()
  }, [selectedDate])

  const dailyTakingsSummary = useMemo(() => {
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
  }, [dailyTakings, dailyProductSales])

  const floatMovementTotals = useMemo(() => {
    return floatMovements.reduce((totals, movement) => {
      const amount = Number(movement.amount || 0)
      if (movement.type === 'added') totals.added += amount
      if (movement.type === 'removed') totals.removed += amount
      return totals
    }, { added: 0, removed: 0 })
  }, [floatMovements])

  useEffect(() => {
    function handleScroll() {
      setShowBackToTop(window.scrollY > 500)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    function handleOffline() {
      setIsOffline(true)
    }

    function handleOnline() {
      setIsOffline(false)
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  function formatLocalDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  function getWeekDates(dateString = selectedDate) {
    const start = new Date(`${dateString}T00:00:00`)
    const day = start.getDay()
    const diff = day === 0 ? -6 : 1 - day
    start.setDate(start.getDate() + diff)
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      return formatLocalDate(date)
    })
  }

  function getStaffScheduleTypeLabel(type) {
    return STAFF_SCHEDULE_TYPES.find((item) => item.value === type)?.label || formatStatus(type)
  }

  function getStaffServiceTypeLabel(type) {
    return STAFF_SERVICE_TYPES.find((item) => item.value === type)?.label || formatStatus(type)
  }

  function getCustomerWarningLevel(customer) {
    if (!customer?.warning_flag) return 'none'
    return customer.warning_level || 'caution'
  }

  function getCustomerWarningStyle(level) {
    const colours = {
      caution: { border: 'rgba(212,168,83,0.7)', color: '#ffcc66', background: '#1f1a10' },
      important: { border: 'rgba(181,106,34,0.8)', color: '#f0a34a', background: '#21150b' },
      banned: { border: 'rgba(255,120,117,0.75)', color: '#ff7875', background: '#211010' },
      none: { border: 'rgba(212,168,83,0.25)', color: '#aaa', background: '#111' }
    }
    return colours[level] || colours.caution
  }

  function renderCustomerWarning(customer) {
    if (!customer?.warning_flag || getCustomerWarningLevel(customer) === 'none') return null
    const level = getCustomerWarningLevel(customer)
    const style = getCustomerWarningStyle(level)
    return (
      <div style={{ background: style.background, border: `1px solid ${style.border}`, color: style.color, borderRadius: '10px', padding: '10px 12px', marginTop: '10px', fontWeight: 'bold' }}>
        Customer warning: {formatStatus(level)}
        {customer.warning_note && <div style={{ marginTop: '5px', fontWeight: 'normal', color: style.color }}>{customer.warning_note}</div>}
      </div>
    )
  }

  function isCustomerBanned(customer) {
    return Boolean(customer?.warning_flag && getCustomerWarningLevel(customer) === 'banned')
  }

  function blockIfCustomerBanned(customer) {
    if (!isCustomerBanned(customer)) return false
    alert(`Booking blocked. ${customer.name || 'This customer'} is marked as banned.${customer.warning_note ? `\n\n${customer.warning_note}` : ''}`)
    return true
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

  function showDataLoadWarning(message, error = null) {
    setDataLoadWarning(message)
    if (error) console.log(error)
  }

  function clearDataLoadWarning() {
    setDataLoadWarning('')
  }

  async function getBeds() {
    const { data, error } = await supabase.from('Beds').select('*').order('id')
    if (error) {
      showDataLoadWarning('Some salon data could not be loaded. Please check the connection and refresh.', error)
      return
    }
    clearDataLoadWarning()
    setBeds(data || [])
  }

  async function getBookings() {
    const { data, error } = await supabase.from('Bookings').select('*').order('appointment_time', { ascending: true })
    if (error) {
      showDataLoadWarning('Bookings could not be loaded. Please check the connection before making changes.', error)
      return
    }
    clearDataLoadWarning()
    setBookings(data || [])
  }

  async function getCustomers() {
    const { data, error } = await supabase.from('Customers').select('*').eq('is_active', true).order('name', { ascending: true })
    if (error) {
      showDataLoadWarning('Customers could not be loaded. Search and booking may be incomplete.', error)
      return
    }

    const shopTestCustomer = (data || []).find((customer) => isShopTestCustomer(customer))
    if (!shopTestCustomer) {
      const ensuredShopTestCustomer = await ensureShopTestCustomer()
      if (ensuredShopTestCustomer) {
        const customersWithShopTest = [...(data || []), ensuredShopTestCustomer].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
        clearDataLoadWarning()
        setCustomers(customersWithShopTest)
        return
      }
    }

    clearDataLoadWarning()
    setCustomers(data || [])
  }

  async function ensureShopTestCustomer() {
    const { data: existing, error: loadError } = await supabase
      .from('Customers')
      .select('*')
      .ilike('name', 'Shop Test')
      .limit(1)

    if (loadError) {
      showDataLoadWarning('Shop Test customer could not be checked. Please check the connection.', loadError)
      console.log(loadError)
      return null
    }

    if (existing && existing.length > 0) {
      const customer = existing[0]
      if (customer.is_active === false) {
        const { data: updatedCustomer, error: updateError } = await supabase
          .from('Customers')
          .update({ is_active: true })
          .eq('id', customer.id)
          .select()
          .single()

        if (updateError) {
          showDataLoadWarning('Shop Test customer exists but could not be activated.', updateError)
          console.log(updateError)
          return customer
        }
        return updatedCustomer
      }
      return customer
    }

    const { data: createdCustomer, error: createError } = await supabase
      .from('Customers')
      .insert({
        name: 'Shop Test',
        phone: null,
        email: null,
        date_of_birth: null,
        notes: 'Internal shop test customer. Free/internal use only.',
        minutes_balance: 0,
        standard_minutes_balance: 0,
      hybrid_minutes_balance: 0,
      terms_accepted: true,
      id_checked: true,
      is_active: true,
      customer_source: 'dashboard'
    })
      .select()
      .single()

    if (createError) {
      showDataLoadWarning('Shop Test customer could not be created automatically.', createError)
      console.log(createError)
      return null
    }

    return createdCustomer
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
      showDataLoadWarning('Staff accounts could not be loaded. Staff sign-in may be limited.', error)
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
    clearDataLoadWarning()

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

  async function getStaffSchedule() {
    const weekDates = getWeekDates(selectedDate)
    const { data, error } = await supabase
      .from('StaffSchedule')
      .select('*')
      .gte('schedule_date', weekDates[0])
      .lte('schedule_date', weekDates[6])
      .order('schedule_date', { ascending: true })
      .order('start_time', { ascending: true })

    if (error) {
      setStaffScheduleLoadError(error.message || 'Could not load StaffSchedule table.')
      setStaffSchedule([])
      showDataLoadWarning('Staff Calendar could not be loaded. Check the StaffSchedule table.', error)
      return
    }

    setStaffScheduleLoadError('')
    setStaffSchedule(data || [])
  }

  async function createStaffLog(member, action, details) {
    if (!member || String(member.id).startsWith('default-')) return
    await supabase.from('StaffLogs').insert({ staff_id: member.id, staff_name: member.name, action, details })
  }

  function clearStaffScheduleForm() {
    setStaffScheduleEditingId('')
    setStaffScheduleStaffId('')
    setStaffScheduleDate(selectedDate)
    setStaffScheduleStartTime('09:00')
    setStaffScheduleEndTime('17:00')
    setStaffScheduleType('shift')
    setStaffScheduleServiceType('general')
    setStaffScheduleNotes('')
    setStaffScheduleAvailable(true)
  }

  function editStaffScheduleEntry(entry) {
    setStaffScheduleEditingId(String(entry.id))
    setStaffScheduleStaffId(entry.staff_id ? String(entry.staff_id) : '')
    setStaffScheduleDate(entry.schedule_date || selectedDate)
    setStaffScheduleStartTime(entry.start_time || '09:00')
    setStaffScheduleEndTime(entry.end_time || '17:00')
    setStaffScheduleType(entry.schedule_type || 'shift')
    setStaffScheduleServiceType(entry.service_type || 'general')
    setStaffScheduleNotes(entry.notes || '')
    setStaffScheduleAvailable(entry.is_available !== false)
  }

  function getFilteredStaffSchedule() {
    return staffSchedule.filter((entry) => {
      if (staffScheduleFilterStaffId && String(entry.staff_id) !== String(staffScheduleFilterStaffId)) return false
      if (staffScheduleFilterType && entry.schedule_type !== staffScheduleFilterType) return false
      if (staffScheduleFilterServiceType && entry.service_type !== staffScheduleFilterServiceType) return false
      return true
    })
  }

  function getShopClosuresForSelectedDate() {
    return staffSchedule.filter((entry) => entry.schedule_date === selectedDate && entry.schedule_type === 'shop_closed')
  }

  function getCurrentStaffScheduleForSelectedDate() {
    const currentStaff = getCurrentStaffUser()
    if (!currentStaff) return []
    return staffSchedule.filter((entry) => String(entry.staff_id) === String(currentStaff.id) && entry.schedule_date === selectedDate)
  }

  function getAvailableSprayTanArtists(date, time) {
    // TODO Spray tan approvals: use this helper when assigning/approving spray tan bookings.
    return staffSchedule.filter((entry) => {
      if (entry.schedule_date !== date) return false
      if (entry.service_type !== 'spraytan') return false
      if (!['spray_tan_available', 'shift'].includes(entry.schedule_type)) return false
      if (entry.is_available === false) return false
      if (time && entry.start_time && entry.end_time) return entry.start_time <= time && entry.end_time >= time
      return true
    })
  }

  async function saveStaffScheduleEntry() {
    if (!requireStaffSignIn()) return
    if (!showManagerView && !requireManagerAccess('Manager PIN required to edit Staff Calendar:')) return

    if (!staffScheduleDate) {
      alert('Choose a schedule date.')
      return
    }

    if (staffScheduleType !== 'shop_closed' && !staffScheduleStaffId) {
      alert('Choose a staff member for this schedule entry.')
      return
    }

    const selectedMember = staff.find((member) => String(member.id) === String(staffScheduleStaffId))
    const payload = {
      staff_id: staffScheduleType === 'shop_closed' ? null : Number(staffScheduleStaffId),
      staff_name: staffScheduleType === 'shop_closed' ? 'Shop Closed' : selectedMember?.name || '',
      schedule_date: staffScheduleDate,
      start_time: staffScheduleStartTime || null,
      end_time: staffScheduleEndTime || null,
      schedule_type: staffScheduleType,
      service_type: staffScheduleServiceType,
      notes: staffScheduleNotes || null,
      is_available: staffScheduleAvailable
    }

    setStaffScheduleSaving(true)
    const query = staffScheduleEditingId
      ? supabase.from('StaffSchedule').update(payload).eq('id', staffScheduleEditingId)
      : supabase.from('StaffSchedule').insert(payload)
    const { error } = await query
    setStaffScheduleSaving(false)

    if (error) {
      alert('Staff Calendar entry was not saved. Please check the connection and StaffSchedule table.')
      showDataLoadWarning('Staff Calendar entry failed to save.', error)
      console.log(error)
      return
    }

    clearStaffScheduleForm()
    await getStaffSchedule()
  }

  async function deleteStaffScheduleEntry(entry) {
    if (!requireStaffSignIn()) return
    if (!showManagerView && !requireManagerAccess('Manager PIN required to delete Staff Calendar entries:')) return
    const confirmed = window.confirm(`Delete schedule entry for ${entry.staff_name || 'the shop'} on ${entry.schedule_date}?`)
    if (!confirmed) return

    const { error } = await supabase.from('StaffSchedule').delete().eq('id', entry.id)
    if (error) {
      alert('Staff Calendar entry was not deleted. Please check the connection.')
      showDataLoadWarning('Staff Calendar delete failed.', error)
      console.log(error)
      return
    }

    if (String(staffScheduleEditingId) === String(entry.id)) clearStaffScheduleForm()
    await getStaffSchedule()
  }

  async function getProducts() {
    const { data, error } = await supabase.from('Products').select('*').order('name', { ascending: true })
    if (error) {
      setProductLoadError(error.message || 'Could not load Products table.')
      showDataLoadWarning('Products could not be loaded. Till/product sales may be incomplete.', error)
      setProducts([])
      return
    }
    setProductLoadError('')
    clearDataLoadWarning()
    setProducts(data || [])
  }

  async function getDailyTakings() {
    const dayStart = new Date(`${selectedDate}T00:00:00`)
    const dayEnd = new Date(`${selectedDate}T23:59:59.999`)
    const { data, error } = await supabase.from('Payments').select('*').gte('created_at', dayStart.toISOString()).lte('created_at', dayEnd.toISOString()).order('created_at', { ascending: false })
    if (error) {
      showDataLoadWarning('Daily payment totals could not be loaded. Manager totals may be out of date.', error)
      return
    }
    setDailyTakings(data || [])
    const { data: productSalesData, error: productSalesError } = await supabase.from('ProductSales').select('*').gte('created_at', dayStart.toISOString()).lte('created_at', dayEnd.toISOString()).order('created_at', { ascending: false })
    if (productSalesError) {
      showDataLoadWarning('Daily product sales could not be loaded. Manager totals may be out of date.', productSalesError)
      return
    }
    clearDataLoadWarning()
    setDailyProductSales(productSalesData || [])
  }

  async function getCashUpForSelectedDate() {
    const { data, error } = await supabase
      .from('CashUps')
      .select('*')
      .eq('cashup_date', selectedDate)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) {
      setCashUpLoadError(error.message || 'Could not load CashUps table.')
      showDataLoadWarning('Cash-up record could not be loaded. Please check the connection.', error)
      setCashUpExistingRecord(null)
      return
    }

    const record = data?.[0] || null
    setCashUpLoadError('')
    setCashUpExistingRecord(record)
    setCashUpStartFloat(record?.starting_cash_float ?? '')
    setCashUpActualCash(record?.actual_cash ?? '')
    setCashUpVarianceNotes(record?.variance_notes || '')
    setCashUpManagerName(record?.cash_up_completed_by_staff || '')
  }

  async function getFloatMovements() {
    const { data, error } = await supabase
      .from('FloatMovements')
      .select('*')
      .eq('date', selectedDate)
      .order('created_at', { ascending: false })

    if (error) {
      setFloatMovementLoadError(error.message || 'Could not load FloatMovements table.')
      setFloatMovements([])
      return
    }

    setFloatMovementLoadError('')
    setFloatMovements(data || [])
  }

  function getDailyTakingsSummary() {
    return dailyTakingsSummary
  }

  function openManagerView() {
    if (!requireStaffSignIn()) return

    if (!requireManagerAccess('Manager PIN required:')) return
    setShowManagerView(true)
  }

  function lockManagerView() {
    setManagerUnlocked(false)
    setShowManagerView(false)
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function openCashUpPanel() {
    setCollapseCashUp(false)
    setTimeout(() => {
      const cashUpPanel = document.getElementById('cash-up-panel')
      if (cashUpPanel) cashUpPanel.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 120)
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

  function requireManagerPin(promptText = 'Manager PIN required:') {
    const pin = window.prompt(promptText)
    if (pin !== MANAGER_PIN) {
      alert('Incorrect manager PIN.')
      return false
    }
    return true
  }

  function requireManagerAccess(promptText = 'Manager PIN required:') {
    if (managerUnlocked) return true
    if (!requireManagerPin(promptText)) return false
    setManagerUnlocked(true)
    return true
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

  function getBookingSource(booking) {
    if (!booking) return 'dashboard'
    if (booking.booking_source) return booking.booking_source
    if (booking.wix_booking_id) return 'wix'
    if (booking.source === 'wix') return 'wix'
    return 'dashboard'
  }

  function isWixBooking(booking) {
    return getBookingSource(booking) === 'wix'
  }

  function isShopTestCustomer(customer) {
    return Boolean(customer?.is_internal) || String(customer?.name || '').trim().toLowerCase() === 'shop test'
  }

  function isInternalFreeUseSelected() {
    return shopTestFreeUse && isShopTestCustomer(getSelectedCustomer())
  }

  function getMinuteOptionsForBooking() {
    const customer = getSelectedCustomer()
    const includeShopTestMinutes = isShopTestCustomer(customer) || isShopTestBooking(modalBooking)
    const start = includeShopTestMinutes ? 1 : 3
    const end = includeShopTestMinutes ? 60 : 20
    return Array.from({ length: end - start + 1 }, (_, index) => index + start)
  }

  function getStaffIdFromBooking(booking) {
    if (!isStaffFreeBooking(booking)) return null
    return booking.source.replace('staff_free:', '')
  }

  function getFilteredCustomerAndStaffOptions() {
    if (!customerSearch.trim()) return []
    const query = customerSearch.toLowerCase()
    const customerOptions = customers
      .filter((customer) => {
        const searchable = [customer.name, customer.first_name, customer.last_name, customer.phone, customer.email]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return searchable.includes(query)
      })
      .map((customer) => ({ kind: 'customer', id: customer.id, label: isShopTestCustomer(customer) ? 'Shop Test — Internal' : customer.name, record: customer }))

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
    if (isShopTestCustomer(customer)) return true
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

  function getProductCategoryLabel(category) {
    return PRODUCT_CATEGORIES.find((item) => item.value === category)?.label || formatStatus(category || 'other')
  }

  function normalizeProductCategory(category) {
    const value = category || 'other'
    if (PRODUCT_CATEGORIES.some((item) => item.value === value)) return value
    if (['lip_balm', 'shots', 'other_accessories'].includes(value)) return 'other'
    if (value === 'tanning_lotion') return 'tanning_lotions'
    return 'other'
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

  function getProductReceiptItems(cart = productCart) {
    return cart.map((item) => ({
      product_name: item.product_name,
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.price || 0),
      total_amount: Number((Number(item.price || 0) * Number(item.quantity || 0)).toFixed(2))
    }))
  }

  function showSaleReceipt({ customerName, packageName = '', minutes = 0, products = [], method, totalPaid, cashAmount = 0 }) {
    const paid = Number(totalPaid || 0)
    const cash = method === 'cash' ? Number(cashAmount || 0) : 0
    setSaleReceipt({
      customerName,
      packageName,
      minutes: Number(minutes || 0),
      products,
      paymentMethod: method,
      totalPaid: paid,
      cashReceived: cash,
      changeGiven: method === 'cash' ? Math.max(0, cash - paid) : 0,
      dateTime: new Date().toISOString(),
      staffName: getCurrentStaffUser()?.name || 'Not signed in'
    })
  }

  function buildReceiptText(receipt) {
    const items = Array.isArray(receipt.items) ? receipt.items : []
    return [
      'Glow Tanning Receipt',
      `Date: ${receipt.created_at ? new Date(receipt.created_at).toLocaleString('en-GB') : ''}`,
      `Customer: ${receipt.customer_name || 'Walk-in'}`,
      `Type: ${formatStatus(receipt.receipt_type)}`,
      `Payment: ${formatStatus(receipt.payment_method)}`,
      ...items.map((item) => `${item.name || item.product_name || item.description || 'Item'} x ${item.quantity || 1} - £${Number(item.total || item.total_amount || 0).toFixed(2)}`),
      `Subtotal: £${Number(receipt.subtotal || 0).toFixed(2)}`,
      `Discount: £${Number(receipt.discount || 0).toFixed(2)}`,
      `Total: £${Number(receipt.total || 0).toFixed(2)}`,
      `Staff: ${receipt.staff_name || ''}`,
      receipt.notes ? `Notes: ${receipt.notes}` : ''
    ].filter(Boolean).join('\n')
  }

  async function copyReceipt(receipt) {
    const text = buildReceiptText(receipt)
    try {
      await navigator.clipboard.writeText(text)
      alert('Receipt copied.')
    } catch (error) {
      window.prompt('Copy receipt text:', text)
    }
  }

  async function createReceipt({ customer = null, customerName = '', receiptType, items = [], subtotal = 0, discount = 0, total = 0, paymentMethod = '', notes = '' }) {
    const staffUser = getCurrentStaffUser()
    const { error } = await supabase.from('Receipts').insert({
      customer_id: customer?.id || null,
      customer_name: customer?.name || customerName || null,
      receipt_type: receiptType,
      items,
      subtotal: Number(subtotal || 0),
      discount: Number(discount || 0),
      total: Number(total || 0),
      payment_method: paymentMethod || null,
      staff_name: staffUser?.name || null,
      notes: notes || null
    })
    if (error) {
      showDataLoadWarning('Receipt could not be saved. Check the Receipts table.', error)
      console.log(error)
      return false
    }
    return true
  }

  function printReceipt() {
    window.print()
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

  function addSelectedBookingProduct() {
    if (!requireStaffSignIn()) return

    const product = products.find((entry) => String(entry.id) === String(bookingProductId))
    if (!product) {
      alert('Please select a product first.')
      return
    }

    const quantity = Number(bookingProductQuantity || 0)
    if (quantity <= 0) {
      alert('Please enter a valid product quantity.')
      return
    }

    const stock = getProductStockQuantity(product)
    const existing = productCart.find((item) => item.product_id === product.id)
    const nextQuantity = Number(existing?.quantity || 0) + quantity

    if (stock <= 0) {
      alert(`${product.name} is out of stock and cannot be sold.`)
      return
    }

    if (nextQuantity > stock) {
      alert(`${product.name} only has ${stock} in stock.`)
      return
    }

    setProductCart((cart) => {
      const existingItem = cart.find((item) => item.product_id === product.id)
      if (existingItem) {
        return cart.map((item) => item.product_id === product.id ? { ...item, quantity: Number(item.quantity || 0) + quantity } : item)
      }
      return [...cart, {
        product_id: product.id,
        product_name: product.name,
        category: product.category,
        price: Number(product.price || 0),
        quantity,
        stock_quantity: product.stock_quantity
      }]
    })

    setBookingProductQuantity(1)
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
      alert('Product sale was not saved. Please check the connection and try again before taking another payment.')
      showDataLoadWarning('A product sale failed to save. Please check the connection.', error)
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
    if (!requireManagerAccess('Manager PIN required for correction:')) return

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
      showDataLoadWarning('A customer correction failed to save. Please check the connection.', error)
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
    await logCustomerMinuteChanges(
      customer,
      oldStandard,
      newStandard,
      oldHybrid,
      newHybrid,
      managerCorrectionType.includes('reverse') ? 'refunded' : 'adjusted',
      `${formatStatus(correctionLabel)}. Reason: ${reason}`
    )

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

    if (moneyAmount > 0) {
      await createReceipt({
        customer,
        receiptType: 'correction',
        items: [{ name: formatStatus(correctionLabel), quantity: 1, total: moneyAmount }],
        subtotal: moneyAmount,
        total: moneyAmount,
        paymentMethod: managerCorrectionPaymentMethod,
        notes: reason
      })
    }

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

  function getCashUpStartFloatAmount() {
    return cashUpStartFloat === '' ? 0 : Number(cashUpStartFloat || 0)
  }

  function isCashUpLocked() {
    return Boolean(cashUpExistingRecord?.cash_up_locked)
  }

  function isSelectedDateToday() {
    return selectedDate === formatLocalDate(new Date())
  }

  function canEditSelectedCashUp() {
    if (isCashUpLocked()) return false
    if (showManagerView) return true
    return isSelectedDateToday() && !isCashUpLocked()
  }

  function explainCashUpEditBlock() {
    if (isCashUpLocked()) return 'Cash-up is locked for this date. Manager access is required to make changes.'
    if (!isSelectedDateToday()) return 'Staff can only edit today\'s cash-up. Please select today or ask a manager.'
    return 'This cash-up cannot be edited.'
  }

  function getFloatMovementTotals() {
    return floatMovementTotals
  }

  function buildCashUpTotalsPayload(summary, startFloat) {
    const movementTotals = getFloatMovementTotals()
    const expectedCash = Number(startFloat || 0) + Number(summary.cashTotal || 0) + Number(movementTotals.added || 0) - Number(movementTotals.removed || 0)
    return {
      card_total: Number(summary.cardTotal.toFixed(2)),
      cash_total: Number(summary.cashTotal.toFixed(2)),
      bank_transfer_total: Number(summary.bankTransferTotal.toFixed(2)),
      other_total: Number(summary.otherTotal.toFixed(2)),
      product_sales_total: Number(summary.productRevenue.toFixed(2)),
      minutes_sales_total: Number(summary.minutesRevenue.toFixed(2)),
      total_revenue: Number(summary.totalRevenue.toFixed(2)),
      starting_cash_float: Number(startFloat.toFixed(2)),
      expected_cash: Number(expectedCash.toFixed(2))
    }
  }

  function clearFloatMovementForm() {
    setFloatMovementType('added')
    setFloatMovementAmount('')
    setFloatMovementNote('')
    setFloatMovementEditingId('')
  }

  function editFloatMovement(movement) {
    setFloatMovementEditingId(String(movement.id))
    setFloatMovementType(movement.type || 'added')
    setFloatMovementAmount(movement.amount ?? '')
    setFloatMovementNote(movement.note || '')
  }

  async function saveFloatMovement() {
    if (floatMovementSaving) return
    if (!requireStaffSignIn()) return

    if (!canEditSelectedCashUp()) {
      alert(explainCashUpEditBlock())
      return
    }

    if (floatMovementEditingId && !showManagerView) {
      alert('Only managers can edit float movements. Please ask a manager or add a new movement.')
      return
    }

    const amount = Number(floatMovementAmount || 0)
    if (floatMovementAmount === '' || Number.isNaN(amount) || amount <= 0) {
      alert('Please enter a valid float movement amount.')
      return
    }

    if (!floatMovementNote.trim()) {
      alert('Please enter a reason or note for the float movement.')
      return
    }

    const staffUser = getCurrentStaffUser()
    const payload = {
      date: selectedDate,
      type: floatMovementType,
      amount: Number(amount.toFixed(2)),
      note: floatMovementNote.trim(),
      staff_id: staffUser?.id || null,
      staff_name: staffUser?.name || null
    }

    setFloatMovementSaving(true)
    const request = floatMovementEditingId
      ? supabase.from('FloatMovements').update(payload).eq('id', floatMovementEditingId)
      : supabase.from('FloatMovements').insert(payload)

    const { error } = await request
    setFloatMovementSaving(false)

    if (error) {
      alert('Float movement was not saved. Please check the FloatMovements table and connection.')
      setFloatMovementLoadError(error.message || 'Float movement save failed.')
      console.log(error)
      return
    }

    clearFloatMovementForm()
    await getFloatMovements()
    alert('Float movement saved.')
  }

  async function deleteFloatMovement(movement) {
    if (!requireStaffSignIn()) return
    if (!requireManagerAccess('Manager PIN required to delete float movements:')) return

    const confirmed = window.confirm(`Delete this float movement of GBP ${Number(movement.amount || 0).toFixed(2)}?`)
    if (!confirmed) return

    const { error } = await supabase.from('FloatMovements').delete().eq('id', movement.id)
    if (error) {
      alert('Float movement was not deleted. Please check the connection.')
      setFloatMovementLoadError(error.message || 'Float movement delete failed.')
      console.log(error)
      return
    }

    await getFloatMovements()
  }

  async function saveStartDayFloat() {
    if (cashFloatSaving) return
    if (!requireStaffSignIn()) return

    if (!canEditSelectedCashUp()) {
      alert(explainCashUpEditBlock())
      return
    }

    const startFloat = getCashUpStartFloatAmount()
    if (cashUpStartFloat === '' || Number.isNaN(startFloat) || startFloat < 0) {
      alert('Please enter a valid start-of-day cash float.')
      return
    }

    setCashFloatSaving(true)

    const staffUser = getCurrentStaffUser()
    const existingActualCash = Number(cashUpExistingRecord?.actual_cash || 0)
    const summary = getDailyTakingsSummary()
    const movementTotals = getFloatMovementTotals()
    const existingExpectedCash = Number(startFloat || 0) + Number(summary.cashTotal || 0) + Number(movementTotals.added || 0) - Number(movementTotals.removed || 0)
    const payload = {
      cashup_date: selectedDate,
      ...buildCashUpTotalsPayload(summary, startFloat),
      actual_cash: existingActualCash,
      variance: Number((existingActualCash - existingExpectedCash).toFixed(2)),
      variance_notes: cashUpExistingRecord?.variance_notes || null,
      float_entered_by_staff: staffUser?.name || null,
      float_entered_at: new Date().toISOString(),
      cash_up_locked: Boolean(cashUpExistingRecord?.cash_up_locked)
    }

    const request = cashUpExistingRecord?.id
      ? supabase.from('CashUps').update(payload).eq('id', cashUpExistingRecord.id)
      : supabase.from('CashUps').insert(payload)

    const { error } = await request
    setCashFloatSaving(false)

    if (error) {
      alert('Start-of-day cash float was not saved. Please check the connection and try again.')
      showDataLoadWarning('Start-of-day cash float failed to save. Please check the connection.', error)
      console.log(error)
      return
    }

    await getCashUpForSelectedDate()
    alert('Start-of-day cash float saved.')
  }

  function getCashUpCompletionValues() {
    if (!requireStaffSignIn()) return

    if (!canEditSelectedCashUp()) {
      alert(explainCashUpEditBlock())
      return
    }

    const summary = getDailyTakingsSummary()
    const startFloat = getCashUpStartFloatAmount()
    const movementTotals = getFloatMovementTotals()
    const actualCash = Number(cashUpActualCash || 0)
    const expectedCash = Number(startFloat || 0) + Number(summary.cashTotal || 0) + Number(movementTotals.added || 0) - Number(movementTotals.removed || 0)
    const variance = Number((actualCash - expectedCash).toFixed(2))
    const staffUser = getCurrentStaffUser()
    const signOffName = cashUpManagerName.trim() || staffUser?.name || ''

    if (cashUpStartFloat === '' || Number.isNaN(startFloat) || startFloat < 0) {
      alert('Please enter the start-of-day cash float first.')
      return
    }

    if (cashUpActualCash === '' || actualCash < 0) {
      alert('Please enter the actual cash counted.')
      return
    }

    if (!signOffName) {
      alert('Please enter the staff member completing cash-up.')
      return
    }

    return { summary, startFloat, movementTotals, actualCash, expectedCash, variance, signOffName }
  }

  async function saveCashUp() {
    if (cashUpCompleting) return
    const values = getCashUpCompletionValues()
    if (!values) return

    setShowCashUpLockConfirm(true)
  }

  async function completeAndLockCashUp() {
    if (cashUpCompleting) return
    const values = getCashUpCompletionValues()
    if (!values) return

    const { summary, startFloat, actualCash, variance, signOffName } = values

    setCashUpCompleting(true)

    const now = new Date().toISOString()
    const payload = {
      cashup_date: selectedDate,
      ...buildCashUpTotalsPayload(summary, startFloat),
      actual_cash: Number(actualCash.toFixed(2)),
      variance: Number(variance.toFixed(2)),
      variance_notes: cashUpVarianceNotes.trim() || null,
      cash_up_completed_by_staff: signOffName,
      cash_up_completed_at: now,
      cash_up_locked: true,
      cash_up_locked_by_staff: signOffName,
      cash_up_locked_at: now
    }

    const request = cashUpExistingRecord?.id
      ? supabase.from('CashUps').update(payload).eq('id', cashUpExistingRecord.id)
      : supabase.from('CashUps').insert(payload)

    const { error } = await request

    setCashUpCompleting(false)

    if (error) {
      alert('Cash-up was not saved. Please check the connection and try again.')
      showDataLoadWarning('Cash-up failed to save. Please check the connection.', error)
      console.log(error)
      return
    }

    setShowCashUpLockConfirm(false)
    await getCashUpForSelectedDate()
    alert('End-of-day cash-up completed and locked.')
  }

  async function setCashUpLock(locked) {
    if (!requireStaffSignIn()) return
    if (!requireManagerAccess(locked ? 'Manager PIN required to lock cash-up:' : 'Manager PIN required to reopen cash-up:')) return

    if (!cashUpExistingRecord?.id) {
      alert('Please save the cash-up before locking it.')
      return
    }

    const staffUser = getCurrentStaffUser()
    const payload = locked
      ? {
          cash_up_locked: true,
          cash_up_locked_by_staff: staffUser?.name || null,
          cash_up_locked_at: new Date().toISOString()
        }
      : {
          cash_up_locked: false,
          cash_up_reopened_by_staff: staffUser?.name || null,
          cash_up_reopened_at: new Date().toISOString()
        }

    const { error } = await supabase.from('CashUps').update(payload).eq('id', cashUpExistingRecord.id)
    if (error) {
      alert('Cash-up lock status was not saved. Please check the connection and try again.')
      showDataLoadWarning('Cash-up lock status failed to save. Please check the connection.', error)
      console.log(error)
      return
    }

    await getCashUpForSelectedDate()
    alert(locked ? 'Cash-up locked.' : 'Cash-up reopened.')
  }

  function buildCsv(rows) {
    if (!rows || rows.length === 0) return ''
    const headers = Array.from(rows.reduce((set, row) => {
      Object.keys(row || {}).forEach((key) => set.add(key))
      return set
    }, new Set()))

    const escapeValue = (value) => {
      if (value === null || value === undefined) return ''
      const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
      return `"${text.replaceAll('"', '""')}"`
    }

    return [
      headers.map(escapeValue).join(','),
      ...rows.map((row) => headers.map((header) => escapeValue(row?.[header])).join(','))
    ].join('\n')
  }

  function downloadCsv(filename, rows) {
    const csv = buildCsv(rows)
    if (!csv) {
      alert('No rows found to export.')
      return
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  async function exportTableRows({ tableName, filename, queryBuilder }) {
    if (!requireStaffSignIn()) return
    if (!requireManagerAccess('Manager PIN required for export:')) return

    const { data, error } = await queryBuilder(supabase.from(tableName))
    if (error) {
      alert(`Could not export ${tableName}.`)
      console.log(error)
      return
    }

    downloadCsv(filename, data || [])
  }

  function exportSelectedDateTable(tableName) {
    const dayStart = new Date(`${selectedDate}T00:00:00`)
    const dayEnd = new Date(`${selectedDate}T23:59:59.999`)

    exportTableRows({
      tableName,
      filename: `glow_${tableName}_${selectedDate}.csv`,
      queryBuilder: (query) => {
        if (tableName === 'Bookings') {
          return query.select('*').gte('appointment_time', dayStart.toISOString()).lte('appointment_time', dayEnd.toISOString()).order('appointment_time', { ascending: true })
        }
        if (tableName === 'CashUps') {
          return query.select('*').eq('cashup_date', selectedDate)
        }
        return query.select('*').gte('created_at', dayStart.toISOString()).lte('created_at', dayEnd.toISOString()).order('created_at', { ascending: false })
      }
    })
  }

  function exportCustomersCsv() {
    exportTableRows({
      tableName: 'Customers',
      filename: `glow_Customers_balances_terms_${formatLocalDate(new Date())}.csv`,
      queryBuilder: (query) => query
        .select('id,name,phone,email,date_of_birth,standard_minutes_balance,hybrid_minutes_balance,is_active,terms_accepted,terms_accepted_at,terms_accepted_by_staff,id_checked,id_checked_at,id_checked_by_staff')
        .order('name', { ascending: true })
    })
  }

  async function sellProductsOnly() {
    if (!requireStaffSignIn()) return

    if (productCart.length === 0) {
      alert('Add at least one product to sell.')
      return
    }
    const saleTotal = getProductCartTotal()
    const receiptProducts = getProductReceiptItems()
    const cashAmount = Number(posCashReceived || 0)

    if (posPaymentMethod === 'cash' && cashAmount < saleTotal) {
      alert('Cash received is less than the total amount.')
      return
    }

    const saved = await recordProductSales({ paymentMethodForSale: posPaymentMethod })
    if (saved) {
      await createReceipt({
        customerName: 'Product sale',
        receiptType: 'product_sale',
        items: receiptProducts.map((item) => ({ name: item.product_name, quantity: item.quantity, unit_price: item.unit_price, total: item.total_amount })),
        subtotal: saleTotal,
        total: saleTotal,
        paymentMethod: posPaymentMethod,
        notes: 'Standalone product sale.'
      })
      showSaleReceipt({
        customerName: 'Product sale',
        products: receiptProducts,
        method: posPaymentMethod,
        totalPaid: saleTotal,
        cashAmount
      })
      setPosCashReceived('')
    }
  }

  function getUpcomingBookingsWithin20Minutes() {
    const now = currentTime
    const soon = new Date(now.getTime() + 20 * 60000)
    return bookings.filter((booking) => {
      if (!isSunbedBooking(booking)) return false
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

    if ((newCustomerTermsAccepted || newCustomerIdChecked) && !requireStaffSignIn()) return null

    const staffUser = getCurrentStaffUser()
    const now = new Date().toISOString()

    const { data, error } = await supabase.from('Customers').insert({
      name: customerSearch.trim(),
      minutes_balance: 0,
      standard_minutes_balance: Number(newCustomerBalance || 0),
      hybrid_minutes_balance: 0,
      terms_accepted: newCustomerTermsAccepted,
      terms_accepted_at: newCustomerTermsAccepted ? now : null,
      terms_accepted_by_staff: newCustomerTermsAccepted ? staffUser?.name || null : null,
      id_checked: newCustomerIdChecked,
      id_checked_at: newCustomerIdChecked ? now : null,
      id_checked_by_staff: newCustomerIdChecked ? staffUser?.name || null : null,
      is_active: true,
      warning_flag: false,
      warning_level: 'none',
      warning_note: null,
      customer_source: 'dashboard'
    }).select().single()

    if (error) {
      alert('Customer was not created. Please check the connection and try again.')
      showDataLoadWarning('A customer save failed. Please check the connection.', error)
      console.log(error)
      return null
    }

    await getCustomers()
    await logCustomerMinuteChanges(
      data,
      0,
      Number(newCustomerBalance || 0),
      0,
      0,
      'added',
      'Initial minutes when customer was created from booking search.'
    )
    if (newCustomerTermsAccepted) await createCustomerLog(data, 'Salon terms accepted', `Terms accepted by ${staffUser?.name || 'staff'} when customer was created.`)
    if (newCustomerIdChecked) await createCustomerLog(data, 'ID checked', `ID checked by ${staffUser?.name || 'staff'} when customer was created.`)
    setSelectedCustomerId(String(data.id))
    setSelectedStaffAsCustomerId('')
    setTopUpMinutes(0)
    setNewCustomerTermsAccepted(false)
    setNewCustomerIdChecked(false)
    return data
  }

  async function ensureCustomerTermsAccepted(customer) {
    if (!customer || customer.terms_accepted) return customer
    if (!requireStaffSignIn()) return null

    const confirmed = window.confirm(`${customer.name} has not accepted the salon terms yet.\n\nConfirm they have now accepted the salon terms before booking?`)
    if (!confirmed) return null

    const staffUser = getCurrentStaffUser()
    const now = new Date().toISOString()
    const { error } = await supabase.from('Customers').update({
      terms_accepted: true,
      terms_accepted_at: now,
      terms_accepted_by_staff: staffUser?.name || null
    }).eq('id', customer.id)

    if (error) {
      alert('Could not record salon terms acceptance. Booking was not created.')
      showDataLoadWarning('Salon terms acceptance failed to save. Please check the connection.', error)
      console.log(error)
      return null
    }

    const updatedCustomer = {
      ...customer,
      terms_accepted: true,
      terms_accepted_at: now,
      terms_accepted_by_staff: staffUser?.name || null
    }

    await createCustomerLog(updatedCustomer, 'Salon terms accepted', `Terms accepted before booking by ${staffUser?.name || 'staff'}.`)
    setCustomers((prevCustomers) => prevCustomers.map((item) => (item.id === customer.id ? updatedCustomer : item)))
    if (String(selectedManagerCustomerId) === String(customer.id)) {
      setManagerTermsAccepted(true)
      await loadCustomerHistory(customer.id)
    }

    return updatedCustomer
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
    const receiptProducts = getProductReceiptItems()
    const receiptCashReceived = Number(cashReceived || 0)

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
      alert('Payment was not saved, so customer minutes were not added. Please check the connection and try again.')
      showDataLoadWarning('A payment failed to save. Please check the connection before continuing.', paymentError)
      console.log(paymentError)
      return
    }

    const { error: customerError } = await supabase.from('Customers').update({
      standard_minutes_balance: newStandardBalance,
      hybrid_minutes_balance: newHybridBalance
    }).eq('id', customer.id)

    if (customerError) {
      alert('Customer balance was not updated. Please check the connection before retrying.')
      showDataLoadWarning('A customer balance update failed. Please check the connection.', customerError)
      console.log(customerError)
      return
    }

    await createCustomerLog(customer, 'Top up added', `${purchase.name}: ${amount} mins added. Standard ${customer.standard_minutes_balance || 0} → ${newStandardBalance}. Hybrid ${customer.hybrid_minutes_balance || 0} → ${newHybridBalance}. Total paid £${totalAmount.toFixed(2)}.`)

    await logCustomerMinuteChanges(
      customer,
      Number(customer.standard_minutes_balance || 0),
      newStandardBalance,
      Number(customer.hybrid_minutes_balance || 0),
      newHybridBalance,
      'added',
      `${purchase.name}. Payment ${formatStatus(paymentMethod)}. Total paid £${totalAmount.toFixed(2)}.`
    )

    await createReceipt({
      customer,
      receiptType: receiptProducts.length > 0 ? 'minutes_topup_with_products' : 'minutes_topup',
      items: [
        { name: purchase.name, quantity: 1, minutes: amount, total: totalAmount },
        ...receiptProducts.map((item) => ({ name: item.product_name, quantity: item.quantity, unit_price: item.unit_price, total: item.total_amount }))
      ],
      subtotal: combinedTotal,
      total: combinedTotal,
      paymentMethod,
      notes: paymentNotes || null
    })

    setCustomers((prevCustomers) => prevCustomers.map((c) => c.id === customer.id ? { ...c, standard_minutes_balance: newStandardBalance, hybrid_minutes_balance: newHybridBalance } : c))
    if (selectedManagerCustomerId && Number(selectedManagerCustomerId) === Number(customer.id)) {
      setManagerStandardBalance(newStandardBalance)
      setManagerHybridBalance(newHybridBalance)
      await loadCustomerHistory(customer.id)
    }

    await getDailyTakings()
    showSaleReceipt({
      customerName: customer.name,
      packageName: purchase.name,
      minutes: amount,
      products: receiptProducts,
      method: paymentMethod,
      totalPaid: combinedTotal,
      cashAmount: receiptCashReceived
    })
    setTopUpMinutes(0)
    setPaymentNotes('')
    setCashReceived('')
  }

  function getSunbedCheckoutSummary(customerOverride = null) {
    const customer = customerOverride || getSelectedCustomer()
    const purchase = getPurchaseDetails()
    const canTopUpCustomer = customer && !getSelectedStaffAsCustomer() && !isShopTestCustomer(customer)
    const topUpMinutesToAdd = showBookingTopUp && canTopUpCustomer ? Number(purchase.minutes || 0) : 0
    const topUpTotal = topUpMinutesToAdd > 0 ? Number(purchase.total.toFixed(2)) : 0
    const productsTotal = Number(getProductCartTotal().toFixed(2))
    const grandTotal = Number((topUpTotal + productsTotal).toFixed(2))

    return {
      purchase,
      topUpMinutesToAdd,
      topUpTotal,
      productsTotal,
      grandTotal,
      hasTopUp: topUpMinutesToAdd > 0,
      hasProducts: productCart.length > 0
    }
  }

  function getProjectedUsableMinutesForCheckout(customer, bedId) {
    const summary = getSunbedCheckoutSummary(customer)
    const standardBalance = Number(customer?.standard_minutes_balance || 0)
    const hybridBalance = Number(customer?.hybrid_minutes_balance || 0)
    const addedStandard = summary.hasTopUp && summary.purchase.type !== 'hybrid' ? summary.topUpMinutesToAdd : 0
    const addedHybrid = summary.hasTopUp && summary.purchase.type === 'hybrid' ? summary.topUpMinutesToAdd : 0

    if (Number(bedId) === 2) return hybridBalance + addedHybrid
    return standardBalance + hybridBalance + addedStandard + addedHybrid
  }

  function validateSunbedCheckoutBeforeSave(customer) {
    const summary = getSunbedCheckoutSummary(customer)

    if (showBookingTopUp && summary.topUpMinutesToAdd <= 0 && summary.productsTotal <= 0) {
      alert('Enter minutes to top up or hide the top-up section before continuing.')
      return false
    }

    if (paymentMethod === 'cash' && summary.grandTotal > 0 && Number(cashReceived || 0) < summary.grandTotal) {
      alert('Cash received is less than the total amount.')
      return false
    }

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

    if (summary.grandTotal <= 0) return true

    const cashMessage = paymentMethod === 'cash'
      ? `\nCash received: £${Number(cashReceived || 0).toFixed(2)}\nChange due: £${Math.max(0, Number(cashReceived || 0) - summary.grandTotal).toFixed(2)}`
      : ''

    return window.confirm(
      `Complete booking checkout?\n\nCustomer: ${customer?.name || 'Walk-in'}\nSession: ${selectedMinutes || 0} tanning mins\nTop-up total: £${summary.topUpTotal.toFixed(2)}\nProducts total: £${summary.productsTotal.toFixed(2)}\nTotal to pay: £${summary.grandTotal.toFixed(2)}\nMethod: ${formatStatus(paymentMethod)}${cashMessage}`
    )
  }

  async function applySunbedCheckout(customer) {
    const summary = getSunbedCheckoutSummary(customer)
    if (summary.grandTotal <= 0) return true

    const receiptProducts = getProductReceiptItems()
    const receiptCashReceived = Number(cashReceived || 0)
    let receiptItems = []
    let receiptType = 'sunbed_checkout'
    let nextCustomer = customer

    if (summary.hasProducts) {
      const productSalesReady = await recordProductSales({ paymentMethodForSale: paymentMethod, customer })
      if (!productSalesReady) return false
      receiptItems = [
        ...receiptItems,
        ...receiptProducts.map((item) => ({
          name: item.product_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.total_amount
        }))
      ]
    }

    if (summary.hasTopUp) {
      const isHybridTopUp = summary.purchase.type === 'hybrid'
      const pricePerMinute = Number(summary.purchase.pricePerMinute)
      const newStandardBalance = isHybridTopUp
        ? Number(customer.standard_minutes_balance || 0)
        : Number(customer.standard_minutes_balance || 0) + summary.topUpMinutesToAdd
      const newHybridBalance = isHybridTopUp
        ? Number(customer.hybrid_minutes_balance || 0) + summary.topUpMinutesToAdd
        : Number(customer.hybrid_minutes_balance || 0)

      const { error: paymentError } = await supabase.from('Payments').insert({
        customer_id: customer.id,
        customer_name: customer.name,
        bed_type: summary.purchase.type === 'hybrid' ? 'Hybrid Minutes - Any Bed' : 'Standard Minutes - Bed 1 and Bed 3',
        minutes_added: summary.topUpMinutesToAdd,
        price_per_minute: Number(pricePerMinute.toFixed(4)),
        total_amount: summary.topUpTotal,
        payment_method: paymentMethod,
        package_type: summary.purchase.type,
        package_name: summary.purchase.name,
        notes: paymentNotes || null
      })

      if (paymentError) {
        alert('Payment was not saved, so customer minutes were not added. Please check the connection and try again.')
        showDataLoadWarning('A payment failed to save. Please check the connection before continuing.', paymentError)
        console.log(paymentError)
        return false
      }

      const { error: customerError } = await supabase.from('Customers').update({
        standard_minutes_balance: newStandardBalance,
        hybrid_minutes_balance: newHybridBalance
      }).eq('id', customer.id)

      if (customerError) {
        alert('Customer balance was not updated. Please check the connection before retrying.')
        showDataLoadWarning('A customer balance update failed. Please check the connection.', customerError)
        console.log(customerError)
        return false
      }

      await createCustomerLog(customer, 'Top up added', `${summary.purchase.name}: ${summary.topUpMinutesToAdd} mins added during booking checkout. Standard ${customer.standard_minutes_balance || 0} → ${newStandardBalance}. Hybrid ${customer.hybrid_minutes_balance || 0} → ${newHybridBalance}. Total paid £${summary.topUpTotal.toFixed(2)}.`)
      await logCustomerMinuteChanges(
        customer,
        Number(customer.standard_minutes_balance || 0),
        newStandardBalance,
        Number(customer.hybrid_minutes_balance || 0),
        newHybridBalance,
        'added',
        `${summary.purchase.name}. Booking checkout payment ${formatStatus(paymentMethod)}. Total paid £${summary.topUpTotal.toFixed(2)}.`
      )

      nextCustomer = {
        ...customer,
        standard_minutes_balance: newStandardBalance,
        hybrid_minutes_balance: newHybridBalance
      }
      setCustomers((prevCustomers) => prevCustomers.map((c) => c.id === customer.id ? nextCustomer : c))
      if (selectedManagerCustomerId && Number(selectedManagerCustomerId) === Number(customer.id)) {
        setManagerStandardBalance(newStandardBalance)
        setManagerHybridBalance(newHybridBalance)
        await loadCustomerHistory(customer.id)
      }

      receiptItems = [
        { name: summary.purchase.name, quantity: 1, minutes: summary.topUpMinutesToAdd, total: summary.topUpTotal },
        ...receiptItems
      ]
      receiptType = summary.hasProducts ? 'sunbed_checkout_with_products' : 'minutes_topup'
    } else if (summary.hasProducts) {
      receiptType = 'product_sale'
    }

    await createReceipt({
      customer: nextCustomer,
      receiptType,
      items: receiptItems,
      subtotal: summary.grandTotal,
      total: summary.grandTotal,
      paymentMethod,
      notes: paymentNotes || null
    })

    await getDailyTakings()
    showSaleReceipt({
      customerName: nextCustomer?.name || customer?.name || 'Walk-in',
      packageName: summary.hasTopUp ? summary.purchase.name : '',
      minutes: summary.hasTopUp ? summary.topUpMinutesToAdd : 0,
      products: receiptProducts,
      method: paymentMethod,
      totalPaid: summary.grandTotal,
      cashAmount: receiptCashReceived
    })
    setTopUpMinutes(0)
    setPaymentNotes('')
    setCashReceived('')
    return true
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

  function isSprayTanBooking(booking) {
    return String(booking?.booking_type || 'sunbed').toLowerCase() === 'spraytan'
  }

  function isSunbedBooking(booking) {
    return !isSprayTanBooking(booking)
  }

  function getBookingsForSelectedDate() {
    return bookings.filter((booking) => isSunbedBooking(booking) && booking.appointment_time && formatLocalDate(new Date(booking.appointment_time)) === selectedDate)
  }

  function getSprayTanBookingsForSelectedDate() {
    return bookings.filter((booking) => isSprayTanBooking(booking) && booking.appointment_time && formatLocalDate(new Date(booking.appointment_time)) === selectedDate)
  }

  function getSprayTanServicePrice(serviceName) {
    return SPRAY_TAN_SERVICES.find((service) => service.name === serviceName)?.price || 0
  }

  function getSprayTanColumnLabel(column) {
    return SPRAY_TAN_COLUMNS.find((item) => item.value === column)?.label || 'Spray Tan'
  }

  function getDefaultSprayTanDeposit(serviceName) {
    const price = getSprayTanServicePrice(serviceName)
    return serviceName === 'Patch Test' ? 0 : Number((price * 0.5).toFixed(2))
  }

  function getSprayTanDepositStatus(serviceName, required, paid) {
    if (serviceName === 'Patch Test' || Number(required || 0) <= 0) return 'not_required'
    return Number(paid || 0) >= Number(required || 0) ? 'paid' : 'pending'
  }

  function getLatestCustomerPatchTestDate(customerId) {
    const customer = customers.find((item) => Number(item.id) === Number(customerId))
    const dates = []
    if (customer?.last_patch_test_date) dates.push(new Date(customer.last_patch_test_date))
    bookings.forEach((booking) => {
      if (!isSprayTanBooking(booking)) return
      if (Number(booking.customer_id) !== Number(customerId)) return
      if (getBookingStatusKey(booking) === 'cancelled' || getBookingStatusKey(booking) === 'canceled') return
      if (booking.spraytan_service === 'Patch Test' || booking.spraytan_column === 'patch_test' || booking.patch_test_completed) {
        const dateSource = booking.patch_test_date || booking.appointment_time
        if (dateSource) dates.push(new Date(dateSource))
      }
    })

    return dates
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => b - a)[0] || null
  }

  function getPatchTestWarning(customer, appointmentDateTime, serviceName) {
    if (!customer || serviceName === 'Patch Test') return ''
    const latestPatchTestDate = getLatestCustomerPatchTestDate(customer.id)
    if (!latestPatchTestDate) return 'No patch test recorded for this customer.'
    const hoursBeforeAppointment = (appointmentDateTime - latestPatchTestDate) / (60 * 60 * 1000)
    if (hoursBeforeAppointment < 24) return 'Patch test should be at least 24 hours before a paid spray tan where possible.'
    return ''
  }

  function getSprayTanStatusLabel(booking) {
    const status = getBookingStatusKey(booking)
    if (status === 'completed') return 'Completed'
    if (status === 'cancelled' || status === 'canceled') return 'Cancelled'
    if (String(booking?.approval_status || '').toLowerCase() === 'pending') return 'Pending Approval'
    if (String(booking?.deposit_status || '').toLowerCase() === 'paid') return 'Deposit Paid'
    if (Number(booking?.deposit_required || 0) > Number(booking?.deposit_paid || 0)) return 'Deposit Pending'
    return 'Approved'
  }

  function getSprayTanStatusStyle(label) {
    const colours = {
      'Pending Approval': '#8a6420',
      Approved: '#3d5368',
      'Deposit Pending': '#b56a22',
      'Deposit Paid': '#2f7a4b',
      Completed: '#2f7a4b',
      Cancelled: '#2f2f2f'
    }
    return {
      display: 'inline-block',
      background: colours[label] || '#2f2f2f',
      color: 'white',
      border: '1px solid rgba(255,255,255,0.16)',
      borderRadius: '8px',
      padding: '4px 9px',
      fontWeight: 'bold',
      fontSize: '12px'
    }
  }

  function getSprayTanStatusFields(statusLabel, depositStatus = sprayTanDepositStatus) {
    if (statusLabel === 'Pending Approval') return { status: 'booked', approval_status: 'pending', deposit_status: depositStatus || 'pending' }
    if (statusLabel === 'Approved') return { status: 'booked', approval_status: 'approved', deposit_status: 'not_required' }
    if (statusLabel === 'Deposit Pending') return { status: 'booked', approval_status: 'approved', deposit_status: 'pending' }
    if (statusLabel === 'Deposit Paid') return { status: 'booked', approval_status: 'approved', deposit_status: 'paid' }
    if (statusLabel === 'Completed') return { status: 'completed', approval_status: 'approved', deposit_status: depositStatus || 'paid' }
    if (statusLabel === 'Cancelled') return { status: 'cancelled', approval_status: 'cancelled', deposit_status: depositStatus || 'pending' }
    return { status: 'booked', approval_status: 'pending', deposit_status: depositStatus || 'pending' }
  }

  function getBookingStatusKey(booking) {
    return String(booking?.status || '').toLowerCase()
  }

  function isFinishedBookingStatus(booking) {
    return ['completed', 'deleted', 'cancelled', 'canceled', 'no_show', 'force_stopped'].includes(getBookingStatusKey(booking))
  }

  function getLiveBedSession(bedId, excludeBookingId = null) {
    return getLiveBedSessionFromRows(bookings, bedId, excludeBookingId)
  }

  function getLiveBedSessionFromRows(rows, bedId, excludeBookingId = null) {
    const liveStatuses = ['undressing', 'running', 'cooldown', 'time_sent', 'sent', 'active', 'customer_started', 'waiting_to_start', 'in_use']

    return (rows || []).find((booking) => {
      if (!isSunbedBooking(booking)) return false
      if (booking.id === excludeBookingId) return false
      if (Number(booking.bed_id) !== Number(bedId)) return false
      if (isFinishedBookingStatus(booking)) return false

      const status = getBookingStatusKey(booking)
      if (liveStatuses.includes(status)) return true

      const phase = getBookingLivePhaseKey(booking)
      return liveStatuses.includes(phase)
    }) || null
  }

  function getBookingLivePhaseKey(booking) {
    const now = new Date()
    const status = getBookingStatusKey(booking)
    if (status === 'cooldown') return 'cooldown'

    const actualStartAt = booking?.customer_started_at
    if (actualStartAt) {
      const tanStart = new Date(actualStartAt)
      const tanEnd = new Date(tanStart.getTime() + Number(booking.minutes || 0) * 60000)
      const cooldownEnd = booking.actual_tanning_end
        ? new Date(booking.actual_tanning_end)
        : new Date(tanEnd.getTime() + COOLDOWN_SECONDS * 1000)

      if (now < tanEnd) return 'running'
      if (now < cooldownEnd) return 'cooldown'
      return 'completed'
    }

    const startSource = booking?.tmax_sent_at || booking?.booking_start
    if (!startSource) return status

    const start = new Date(startSource)
    const tanStart = new Date(start.getTime() + UNDRESS_SECONDS * 1000)
    const tanEnd = new Date(tanStart.getTime() + Number(booking.minutes || 0) * 60000)
    const cooldownEnd = booking?.booking_end ? new Date(booking.booking_end) : new Date(tanEnd.getTime() + COOLDOWN_SECONDS * 1000)

    if (now < tanStart) return 'undressing'
    if (now < tanEnd) return 'running'
    if (now < cooldownEnd) return 'cooldown'
    return 'completed'
  }

  async function getActiveBedSession(bedId, excludeBookingId = null) {
    const { data, error } = await supabase
      .from('Bookings')
      .select('*')
      .eq('bed_id', bedId)

    if (error) {
      showDataLoadWarning('Could not check whether this bed is free. Please check the connection.', error)
      console.log('LOCK CHECK', { bedId, activeBooking: { lock_check_failed: true, error } })
      return { lock_check_failed: true }
    }

    const activeBooking = getLiveBedSessionFromRows(data || [], bedId, excludeBookingId)
    console.log('LOCK CHECK', { bedId, activeBooking })
    return activeBooking
  }

  function isBedLocked(bookingOrBedId, excludeBookingId = null) {
    if (typeof bookingOrBedId === 'object' && bookingOrBedId !== null) {
      const booking = bookingOrBedId
      return Boolean(getLiveBedSession(booking.bed_id, excludeBookingId)?.id === booking.id)
    }

    return Boolean(getLiveBedSession(bookingOrBedId, excludeBookingId))
  }

  function isBlockingBookingStatus(booking) {
    if (isFinishedBookingStatus(booking)) return false
    return getBookingStatusKey(booking) === 'booked' || isBedLocked(booking)
  }

  function getBookingBlockedInterval(booking) {
    if (!booking) return null
    const startSource = booking.customer_started_at || booking.tmax_sent_at || booking.booking_start || booking.appointment_time
    if (!startSource) return null

    const start = new Date(startSource)
    if (Number.isNaN(start.getTime())) return null

    const explicitEndSource = booking.actual_tanning_end || booking.booking_end
    const end = explicitEndSource
      ? new Date(explicitEndSource)
      : new Date(start.getTime() + getTotalBlockMinutes(booking) * 60000)

    if (Number.isNaN(end.getTime())) return null
    return { start, end }
  }

  function doesIntervalOverlap(startA, endA, startB, endB) {
    return startA < endB && endA > startB
  }

  function doesBedOverlapBlockedTime(bedId, newStart, newEnd, ignoreBookingId = null, activeOnly = false) {
    return bookings.some((booking) => {
      if (!isSunbedBooking(booking)) return false
      if (booking.id === ignoreBookingId) return false
      if (Number(booking.bed_id) !== Number(bedId)) return false
      if (activeOnly ? !isBedLocked(booking) : !isBlockingBookingStatus(booking)) return false

      const existing = getBookingBlockedInterval(booking)
      if (!existing) return false

      return doesIntervalOverlap(newStart, newEnd, existing.start, existing.end)
    })
  }

  function doesBookingOverlap(bedId, startDateTime, minutes, ignoreBookingId = null) {
    const newStart = new Date(startDateTime)
    const newEnd = new Date(newStart.getTime() + (Number(minutes) + 6) * 60000)
    return doesBedOverlapBlockedTime(bedId, newStart, newEnd, ignoreBookingId, false)
  }

  function doesLockedBedOverlapInterval(bedId, startDateTime, minutes, ignoreBookingId = null) {
    const newStart = new Date(startDateTime)
    const newEnd = new Date(newStart.getTime() + (Number(minutes) + 6) * 60000)
    return isBedLocked(bedId, ignoreBookingId) && doesBedOverlapBlockedTime(bedId, newStart, newEnd, ignoreBookingId, true)
  }

  function showBedOverlapAlert() {
    alert('This bed is already in use during that time. Please choose another time or bed.')
  }

  function showBedLockedAlert() {
    alert('This bed is currently in use or cooling down. Please wait until it is available before starting another session.')
  }

  function hasUsedSunbedWithin24Hours(customerId, ignoreBookingId = null) {
    if (!customerId) return false
    const now = new Date()
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    return bookings.some((booking) => {
      if (!isSunbedBooking(booking)) return false
      if (booking.id === ignoreBookingId) return false
      if (booking.customer_id !== Number(customerId)) return false
      if (booking.status === 'no_show') return false
      const usageTime = booking.booking_start ? new Date(booking.booking_start) : booking.appointment_time ? new Date(booking.appointment_time) : null
      return usageTime && usageTime >= last24Hours && usageTime <= now
    })
  }

  function getWixServiceBookingMapping(serviceName) {
    const key = String(serviceName || '').trim().toLowerCase()
    return WIX_SERVICE_BOOKING_MAP[key] || null
  }

  function getSampleWixSprayTanPayload() {
    const sampleTime = new Date(`${selectedDate}T10:00:00`)
    return {
      wix_booking_id: `glow-test-spraytan-${selectedDate}`,
      wix_status: 'CREATED',
      booking_type: 'spraytan',
      service_name: 'Full Body',
      wix_service_name: 'Full Body',
      customer_name: 'Wix Test Customer',
      customer_email: 'wix.test.customer@example.com',
      customer_phone: '07000000000',
      appointment_time: sampleTime.toISOString(),
      spraytan_column: 'spray_tan',
      spraytan_service: 'Full Body',
      spraytan_artist: 'Unassigned',
      spraytan_duration_minutes: 30,
      deposit_required: 15,
      deposit_paid: 0,
      deposit_status: 'pending',
      patch_test_required: true,
      patch_test_completed: false,
      patch_test_date: null,
      approval_status: 'pending'
    }
  }

  async function findOrCreateWixCustomer(wixBookingPayload) {
    const wixCustomerName = wixBookingPayload.customer_name || wixBookingPayload.wix_customer_name || wixBookingPayload.name || 'Wix Customer'
    const wixCustomerEmail = wixBookingPayload.customer_email || wixBookingPayload.wix_customer_email || wixBookingPayload.email || null
    const wixCustomerPhone = wixBookingPayload.customer_phone || wixBookingPayload.wix_customer_phone || wixBookingPayload.phone || null
    const wixContactId = wixBookingPayload.wix_contact_id || wixBookingPayload.contact_id || null
    const duplicateFilters = []

    if (wixContactId) duplicateFilters.push(`wix_contact_id.eq.${wixContactId}`)
    if (wixCustomerPhone) duplicateFilters.push(`phone.eq.${wixCustomerPhone}`)
    if (wixCustomerEmail) duplicateFilters.push(`email.eq.${wixCustomerEmail}`)

    if (duplicateFilters.length > 0) {
      const { data: existingCustomers, error } = await supabase
        .from('Customers')
        .select('*')
        .or(duplicateFilters.join(','))
        .limit(1)

      if (error) throw error
      if (existingCustomers && existingCustomers.length > 0) return existingCustomers[0]
    }

    const { data: newCustomer, error: createError } = await supabase
      .from('Customers')
      .insert({
        name: wixCustomerName,
        phone: wixCustomerPhone,
        email: wixCustomerEmail,
        wix_contact_id: wixContactId,
        customer_source: 'wix',
        minutes_balance: 0,
        standard_minutes_balance: 0,
        hybrid_minutes_balance: 0,
        is_active: true
      })
      .select()
      .single()

    if (createError) throw createError
    return newCustomer
  }

  async function checkWixBookingExists(wixBookingId) {
    if (!wixBookingId) return null
    const { data, error } = await supabase
      .from('Bookings')
      .select('*')
      .eq('wix_booking_id', wixBookingId)
      .maybeSingle()
    if (error) throw error
    return data || null
  }

  function buildWixBookingPayload(wixBookingPayload, customer) {
    // Future Wix webhook/API data should be normalized into this shape before insert/update.
    // The Vercel route can call these same field names after verifying the Wix request signature.
    const serviceName = wixBookingPayload.spraytan_service || wixBookingPayload.service_name || wixBookingPayload.wix_service_name || ''
    const bookingType = wixBookingPayload.booking_type || 'spraytan'
    const appointmentTime = wixBookingPayload.appointment_time || wixBookingPayload.start_time || wixBookingPayload.startDate
    const isSprayTan = bookingType === 'spraytan'
    const servicePrice = isSprayTan ? getSprayTanServicePrice(serviceName) : 0
    const depositRequired = Number(wixBookingPayload.deposit_required ?? (isSprayTan && serviceName !== 'Patch Test' ? servicePrice * 0.5 : 0))
    const depositPaid = Number(wixBookingPayload.deposit_paid || 0)

    return {
      customer_id: customer?.id || null,
      customer_name: customer?.name || wixBookingPayload.wix_customer_name || wixBookingPayload.customer_name || 'Wix Customer',
      customer_phone: customer?.phone || wixBookingPayload.wix_customer_phone || wixBookingPayload.customer_phone || null,
      customer_email: customer?.email || wixBookingPayload.wix_customer_email || wixBookingPayload.customer_email || null,
      appointment_time: new Date(appointmentTime).toISOString(),
      status: wixBookingPayload.status || 'booked',
      source: 'wix',
      booking_source: 'wix',
      wix_booking_id: wixBookingPayload.wix_booking_id,
      wix_status: wixBookingPayload.wix_status || wixBookingPayload.status || null,
      wix_service_name: wixBookingPayload.wix_service_name || serviceName || null,
      wix_customer_name: wixBookingPayload.wix_customer_name || wixBookingPayload.customer_name || customer?.name || null,
      wix_customer_email: wixBookingPayload.wix_customer_email || wixBookingPayload.customer_email || customer?.email || null,
      wix_customer_phone: wixBookingPayload.wix_customer_phone || wixBookingPayload.customer_phone || customer?.phone || null,
      last_wix_sync_at: new Date().toISOString(),
      approval_status: wixBookingPayload.approval_status || (isSprayTan ? 'pending' : 'approved'),
      booking_type: bookingType,
      spraytan_service: isSprayTan ? serviceName || null : null,
      spraytan_artist: isSprayTan ? wixBookingPayload.spraytan_artist || null : null,
      deposit_required: isSprayTan ? depositRequired : null,
      deposit_paid: isSprayTan ? depositPaid : null,
      deposit_status: isSprayTan ? wixBookingPayload.deposit_status || getSprayTanDepositStatus(serviceName, depositRequired, depositPaid) : null,
      patch_test_required: isSprayTan ? Boolean(wixBookingPayload.patch_test_required) : false,
      patch_test_completed: isSprayTan ? Boolean(wixBookingPayload.patch_test_completed) : false,
      patch_test_date: isSprayTan ? wixBookingPayload.patch_test_date || null : null,
      spraytan_column: isSprayTan ? wixBookingPayload.spraytan_column || 'spray_tan' : null,
      spraytan_duration_minutes: isSprayTan ? Number(wixBookingPayload.spraytan_duration_minutes || 30) : null,
      spraytan_balance_due: isSprayTan ? Number(wixBookingPayload.spraytan_balance_due ?? Math.max(0, servicePrice - depositPaid)) : null
    }
  }

  async function insertWixBooking(wixBookingPayload) {
    if (!wixBookingPayload?.wix_booking_id) throw new Error('Wix booking payload must include wix_booking_id.')
    if (!wixBookingPayload.appointment_time && !wixBookingPayload.start_time && !wixBookingPayload.startDate) {
      throw new Error('Wix booking payload must include an appointment/start time.')
    }

    const existingBooking = await checkWixBookingExists(wixBookingPayload.wix_booking_id)
    if (existingBooking) return upsertWixBooking(wixBookingPayload)

    const customer = await findOrCreateWixCustomer(wixBookingPayload)
    const bookingPayload = buildWixBookingPayload(wixBookingPayload, customer)

    const { data, error } = await supabase
      .from('Bookings')
      .insert(bookingPayload)
      .select()
      .single()

    if (error) throw error
    return data
  }

  async function updateWixBookingStatus(wixBookingId, wixStatus, approvalStatus = null) {
    const existingBooking = await checkWixBookingExists(wixBookingId)
    if (!existingBooking) throw new Error('Wix booking was not found.')
    if (existingBooking.booking_source && existingBooking.booking_source !== 'wix') {
      throw new Error('Matched booking is not a Wix booking. Refusing to update dashboard-created booking.')
    }

    const { data, error } = await supabase
      .from('Bookings')
      .update({
        wix_status: wixStatus,
        approval_status: approvalStatus || existingBooking.approval_status || 'pending',
        last_wix_sync_at: new Date().toISOString()
      })
      .eq('id', existingBooking.id)
      .select()
      .single()

    if (error) throw error
    return data
  }

  async function runWixTestImport() {
    if (!requireStaffSignIn()) return
    if (!requireManagerAccess('Manager PIN required for Wix test import:')) return

    setWixSyncRunning(true)
    setWixSyncStatus('Running test import...')
    setWixImportedCount(0)
    setWixFailedCount(0)

    try {
      // TODO Wix webhook/API: replace this sample payload with verified Wix booking data
      // from a Vercel serverless route, then call insertWixBooking/upsertWixBooking there.
      const samplePayload = getSampleWixSprayTanPayload()
      const importedBooking = await insertWixBooking(samplePayload)
      setWixImportedCount(1)
      setWixFailedCount(0)
      setWixSyncStatus(`Test import OK: ${importedBooking.customer_name || 'Wix booking'} is pending approval.`)
      await getBookings()
      await getCustomers()
      setDashboardView('spraytan')
    } catch (error) {
      setWixImportedCount(0)
      setWixFailedCount(1)
      setWixSyncStatus(error.message || 'Test import failed.')
      showDataLoadWarning('Wix test import failed. Check booking fields and Supabase connection.', error)
      console.log(error)
    } finally {
      setWixSyncRunning(false)
    }
  }

  async function upsertWixBooking(wixBookingPayload) {
    // Future Vercel webhook/API route should call this helper after verifying the Wix request.
    // Keep this helper dormant in the client until the server route is added.
    if (!wixBookingPayload?.wix_booking_id) {
      throw new Error('Wix booking payload must include wix_booking_id.')
    }

    if (wixBookingPayload.booking_type === 'spraytan') {
      const existingBooking = await checkWixBookingExists(wixBookingPayload.wix_booking_id)
      if (!existingBooking) return insertWixBooking(wixBookingPayload)
      if (existingBooking.booking_source && existingBooking.booking_source !== 'wix') {
        throw new Error('Matched booking is not a Wix booking. Refusing to update dashboard-created booking.')
      }
      const customer = await findOrCreateWixCustomer(wixBookingPayload)
      const bookingPayload = buildWixBookingPayload(wixBookingPayload, customer)
      const { data, error } = await supabase
        .from('Bookings')
        .update(bookingPayload)
        .eq('id', existingBooking.id)
        .select()
        .single()
      if (error) throw error
      return data
    }

    const serviceName = wixBookingPayload.service_name || wixBookingPayload.wix_service_name || ''
    const serviceMapping = getWixServiceBookingMapping(serviceName)
    const appointmentTime = wixBookingPayload.appointment_time || wixBookingPayload.start_time || wixBookingPayload.startDate
    const bedId = wixBookingPayload.bed_id || serviceMapping?.bedId
    const minutes = Number(wixBookingPayload.minutes || serviceMapping?.minutes || 0)

    if (!appointmentTime || !bedId || minutes <= 0) {
      throw new Error('Wix booking could not be mapped yet. Add the service to WIX_SERVICE_BOOKING_MAP with bedId and minutes.')
    }

    const customer = await findOrCreateWixCustomer(wixBookingPayload)
    const bookingPayload = {
      customer_id: customer?.id || null,
      customer_name: customer?.name || wixBookingPayload.wix_customer_name || wixBookingPayload.customer_name || 'Wix Customer',
      customer_phone: customer?.phone || wixBookingPayload.wix_customer_phone || wixBookingPayload.customer_phone || null,
      customer_email: customer?.email || wixBookingPayload.wix_customer_email || wixBookingPayload.customer_email || null,
      bed_id: Number(bedId),
      minutes,
      appointment_time: new Date(appointmentTime).toISOString(),
      status: wixBookingPayload.status || 'booked',
      source: 'wix',
      booking_source: 'wix',
      wix_booking_id: wixBookingPayload.wix_booking_id,
      wix_status: wixBookingPayload.wix_status || wixBookingPayload.status || null,
      wix_service_name: serviceName || null,
      wix_customer_name: wixBookingPayload.wix_customer_name || wixBookingPayload.customer_name || customer?.name || null,
      wix_customer_email: wixBookingPayload.wix_customer_email || wixBookingPayload.customer_email || customer?.email || null,
      wix_customer_phone: wixBookingPayload.wix_customer_phone || wixBookingPayload.customer_phone || customer?.phone || null,
      last_wix_sync_at: new Date().toISOString()
    }

    const { data: existingBooking, error: lookupError } = await supabase
      .from('Bookings')
      .select('id,booking_source')
      .eq('wix_booking_id', wixBookingPayload.wix_booking_id)
      .maybeSingle()

    if (lookupError) throw lookupError

    if (existingBooking) {
      if (existingBooking.booking_source && existingBooking.booking_source !== 'wix') {
        throw new Error('Matched booking is not a Wix booking. Refusing to update dashboard-created booking.')
      }
      const { data, error } = await supabase
        .from('Bookings')
        .update(bookingPayload)
        .eq('id', existingBooking.id)
        .select()
        .single()
      if (error) throw error
      return data
    }

    const { data, error } = await supabase
      .from('Bookings')
      .insert(bookingPayload)
      .select()
      .single()

    if (error) throw error
    return data
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

    const shopTestCustomer = customers.find((customer) => isShopTestCustomer(customer)) || await ensureShopTestCustomer()
    const testMinutes = Number(selectedMinutes || 2)

    if (doesLockedBedOverlapInterval(modalSlot.bedId, appointmentDateTime, testMinutes)) {
      showBedLockedAlert()
      return
    }

    if (doesBookingOverlap(modalSlot.bedId, appointmentDateTime, testMinutes)) {
      showBedOverlapAlert()
      return
    }

    const confirmed = window.confirm(
      `Create ${testMinutes} minute shop test for ${getBedName(modalSlot.bedId)} at ${modalSlot.time}?`
    )

    if (!confirmed) return

    const { error } = await supabase.from('Bookings').insert({
      customer_id: shopTestCustomer?.id || null,
      customer_name: 'Shop Test',
      customer_phone: null,
      customer_email: null,
      bed_id: Number(modalSlot.bedId),
      minutes: testMinutes,
      minutes_deducted: true,
      appointment_time: appointmentDateTime.toISOString(),
      status: 'booked',
      source: 'shop_test',
      booking_source: 'dashboard'
    })

    if (error) {
      alert('Shop test booking was not saved. Please check the connection and try again.')
      showDataLoadWarning('A booking save failed. Please check the connection.', error)
      console.log(error)
      return
    }

    closeModal()
    getBookings()
  }

  async function createBookingFromModal() {
    if (bookingSaving) return
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

    if (Number(selectedMinutes || 0) <= 0) {
      alert('Please enter a valid number of minutes.')
      return
    }

    const isInternalShopTest = isShopTestCustomer(customer)

    if (isInternalShopTest && !shopTestFreeUse) {
      alert('Select Free / Internal Use for Shop Test bookings.')
      return
    }

    if (!isInternalShopTest && !checkCustomerAgeBeforeSunbed(customer)) return
    if (!isInternalShopTest && blockIfCustomerBanned(customer)) return
    if (!isInternalShopTest) {
      customer = await ensureCustomerTermsAccepted(customer)
      if (!customer) return
    }

    if (!isInternalShopTest && getProjectedUsableMinutesForCheckout(customer, modalSlot.bedId) < Number(selectedMinutes || 0)) {
      alert(`${customer.name} only has ${getUsableMinutesForBed(customer, modalSlot.bedId)} usable mins for this bed. Please top up before booking ${selectedMinutes} mins.`)
      return
    }

    if (!isInternalShopTest && !validateSunbedCheckoutBeforeSave(customer)) return

    if (!isInternalShopTest && hasUsedSunbedWithin24Hours(customer.id)) {
      const override = window.confirm(`${customer.name} has used or booked a sunbed within the last 24 hours. Continue anyway?`)
      if (!override) return
    }

    const appointmentDateTime = new Date(`${selectedDate}T${modalSlot.time}`)
    if (doesLockedBedOverlapInterval(modalSlot.bedId, appointmentDateTime, selectedMinutes)) {
      showBedLockedAlert()
      return
    }

    if (doesBookingOverlap(modalSlot.bedId, appointmentDateTime, selectedMinutes)) {
      showBedOverlapAlert()
      return
    }

    setBookingSaving(true)
    const { error } = await supabase.from('Bookings').insert({
      customer_id: customer.id,
      customer_name: customer.name,
      customer_phone: customer.phone || null,
      customer_email: customer.email || null,
      bed_id: Number(modalSlot.bedId),
      minutes: Number(selectedMinutes),
      minutes_deducted: isInternalShopTest,
      appointment_time: appointmentDateTime.toISOString(),
      status: 'booked',
      source: isInternalShopTest ? 'shop_test' : 'calendar',
      booking_source: 'dashboard'
    })
    if (!error) {
      if (!isInternalShopTest) {
        const checkoutSaved = await applySunbedCheckout(customer)
        if (!checkoutSaved) {
          setBookingSaving(false)
          return
        }
      }
      closeModal()
      getBookings()
      getCustomers()
    } else {
      alert('Booking was not saved. Please check the connection and try again.')
      showDataLoadWarning('A booking save failed. Please check the connection.', error)
      console.log(error)
    }
    setBookingSaving(false)
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
    if (doesLockedBedOverlapInterval(modalSlot.bedId, appointmentDateTime, selectedMinutes)) {
      showBedLockedAlert()
      return
    }

    if (doesBookingOverlap(modalSlot.bedId, appointmentDateTime, selectedMinutes)) {
      showBedOverlapAlert()
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
      source: `staff_free:${member.id}`,
      booking_source: 'dashboard'
    })

    if (error) {
      alert('Staff booking was not saved. Please check the connection and try again.')
      showDataLoadWarning('A booking save failed. Please check the connection.', error)
      console.log(error)
      return
    }

    await createStaffLog(member, 'Staff free booking created', `${sessionMinutes} free mins booked on ${getBedName(modalSlot.bedId)} for ${appointmentDateTime.toLocaleString('en-GB')}.`)
    closeModal()
    getBookings()
  }

  async function saveEditedBooking() {
    if (bookingSaving) return
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

    if (Number(selectedMinutes || 0) <= 0) {
      alert('Please enter a valid number of minutes.')
      return
    }

    const isInternalShopTest = isShopTestCustomer(customer)

    if (isInternalShopTest && !shopTestFreeUse) {
      alert('Select Free / Internal Use for Shop Test bookings.')
      return
    }

    if (!isInternalShopTest && !checkCustomerAgeBeforeSunbed(customer)) return
    if (!isInternalShopTest && blockIfCustomerBanned(customer)) return
    if (!isInternalShopTest) {
      customer = await ensureCustomerTermsAccepted(customer)
      if (!customer) return
    }

    if (!isInternalShopTest && !modalBooking.minutes_deducted && getProjectedUsableMinutesForCheckout(customer, editBedId) < Number(selectedMinutes || 0)) {
      alert(`${customer.name} only has ${getUsableMinutesForBed(customer, editBedId)} usable mins for this bed. Please top up before booking ${selectedMinutes} mins.`)
      return
    }

    if (!isInternalShopTest && !validateSunbedCheckoutBeforeSave(customer)) return

    if (!isInternalShopTest && hasUsedSunbedWithin24Hours(customer.id, modalBooking.id)) {
      const override = window.confirm(`${customer.name} has used or booked a sunbed within the last 24 hours. Continue anyway?`)
      if (!override) return
    }

    const appointmentDateTime = new Date(`${selectedDate}T${editTime}`)
    if (doesLockedBedOverlapInterval(editBedId, appointmentDateTime, selectedMinutes, modalBooking.id)) {
      showBedLockedAlert()
      return
    }

    if (doesBookingOverlap(editBedId, appointmentDateTime, selectedMinutes, modalBooking.id)) {
      showBedOverlapAlert()
      return
    }

    setBookingSaving(true)
    const { error } = await supabase.from('Bookings').update({
      customer_id: customer.id,
      customer_name: customer.name,
      customer_phone: customer.phone || null,
      customer_email: customer.email || null,
      bed_id: Number(editBedId),
      minutes: Number(selectedMinutes),
      appointment_time: appointmentDateTime.toISOString(),
      source: isInternalShopTest ? 'shop_test' : modalBooking.source || 'calendar',
      booking_source: modalBooking.booking_source || 'dashboard',
      minutes_deducted: isInternalShopTest ? true : modalBooking.minutes_deducted
    }).eq('id', modalBooking.id)
    if (!error) {
      if (!isInternalShopTest) {
        const checkoutSaved = await applySunbedCheckout(customer)
        if (!checkoutSaved) {
          setBookingSaving(false)
          return
        }
      }
      closeModal()
      getBookings()
      getCustomers()
    } else {
      alert('Booking changes were not saved. Please check the connection and try again.')
      showDataLoadWarning('A booking update failed. Please check the connection.', error)
      console.log(error)
    }
    setBookingSaving(false)
  }

  async function deleteBooking(booking) {
    if (!requireStaffSignIn()) return
    if (!requireManagerAccess('Manager PIN required to delete bookings:')) return

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

    const activeStatuses = ['undressing', 'running', 'cooldown', 'active', 'time_sent', 'sent', 'customer_started', 'waiting_to_start', 'in_use']
    if (activeStatuses.includes(String(newStatus || '').toLowerCase())) {
      const { data: bookingToUpdate, error: loadError } = await supabase.from('Bookings').select('*').eq('id', id).single()
      if (loadError) {
        alert('Could not check whether this bed is free. Please try again.')
        showDataLoadWarning('Could not check whether this bed is free. Please check the connection.', loadError)
        console.log(loadError)
        return
      }

      const activeBooking = await getActiveBedSession(bookingToUpdate.bed_id, id)
      if (activeBooking) {
        showBedLockedAlert()
        return
      }
    }

    const { error } = await supabase.from('Bookings').update({ status: newStatus }).eq('id', id)
    if (error) {
      alert('Booking status was not saved. Please check the connection and try again.')
      showDataLoadWarning('A booking update failed. Please check the connection.', error)
      console.log(error)
      return
    }
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
    if (!requireManagerAccess('Manager PIN required to update maintenance:')) return false

    const { error } = await supabase.from('Beds').update(updates).eq('id', bedId)
    if (error) {
      alert('Could not update bed maintenance. Check your Beds table maintenance columns.')
      showDataLoadWarning('Maintenance changes failed to save. Please check the connection.', error)
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
    if (!requireManagerAccess('Manager PIN required:')) return
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
      showDataLoadWarning('Tube runtime failed to save. Please check the connection.', error)
      return false
    }

    await getBeds()
    return true
  }

  async function managerResetBooking(booking) {
    if (!requireStaffSignIn()) return

    if (!['completed', 'no_show', 'force_stopped'].includes(booking.status)) {
      alert('Manager Reset is only available for completed, no show, or force stopped bookings.')
      return
    }

    const confirmed = window.confirm(`Manager Reset this booking for ${booking.customer_name}? This returns it to Booked. Deducted minutes will NOT change.`)
    if (!confirmed) return
    if (!requireManagerAccess('Manager PIN required to reset booking:')) return

    const previousStatus = booking.status
    const { error } = await supabase.from('Bookings').update({
      status: 'booked',
      booking_start: null,
      booking_end: null,
      tmax_sent_at: null,
      tmax_status: null,
      customer_started_at: null,
      actual_tanning_end: null
    }).eq('id', booking.id)
    if (error) {
      alert('Booking reset was not saved. Please check the connection and try again.')
      showDataLoadWarning('A booking update failed. Please check the connection.', error)
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
    let newStandardBalance
    let newHybridBalance

    if (Number(booking.bed_id) === 2) {
      if (hybridBalance < sessionMinutes) {
        alert(`${customer.name} only has ${hybridBalance} hybrid mins available. Bed 2 requires hybrid minutes.`)
        return false
      }
      newStandardBalance = standardBalance
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
      alert('Customer minutes were not deducted. Please check the connection before starting the session.')
      showDataLoadWarning('A customer balance update failed. Please check the connection.', customerError)
      console.log(customerError)
      return false
    }

    const { error: bookingError } = await supabase.from('Bookings').update({ minutes_deducted: true }).eq('id', booking.id)
    if (bookingError) {
      alert('Booking was not marked as deducted. Please check the connection before continuing.')
      showDataLoadWarning('A booking update failed. Please check the connection.', bookingError)
      console.log(bookingError)
      return false
    }

    await createCustomerLog(customer, 'Minutes deducted', `Booking ${booking.id || ''}: ${sessionMinutes} mins deducted for ${getBedName(booking.bed_id)}. Standard ${standardBalance} → ${newStandardBalance}. Hybrid ${hybridBalance} → ${newHybridBalance}.`)
    await logCustomerMinuteChanges(
      customer,
      standardBalance,
      newStandardBalance,
      hybridBalance,
      newHybridBalance,
      'used',
      `Booking ${booking.id || ''}: ${sessionMinutes} mins used on ${getBedName(booking.bed_id)}.`
    )
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
      alert('Staff free minutes were not deducted. Please check the connection before starting the session.')
      showDataLoadWarning('A staff action failed. Please check the connection.', staffError)
      console.log(staffError)
      return false
    }

    const { error: bookingError } = await supabase.from('Bookings').update({ minutes_deducted: true }).eq('id', booking.id)
    if (bookingError) {
      alert('Booking was not marked as deducted. Please check the connection before continuing.')
      showDataLoadWarning('A booking update failed. Please check the connection.', bookingError)
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

    const activeBooking = await getActiveBedSession(booking.bed_id, booking.id)
    if (activeBooking) {
      showBedLockedAlert()
      return
    }

    const customer = customers.find((c) => c.id === Number(booking.customer_id))
    if (!isShopTestBooking(booking) && customer && !checkCustomerAgeBeforeSunbed(customer)) return

    const now = new Date()
    const tanningStart = new Date(now.getTime() + UNDRESS_SECONDS * 1000)
    const tanningEnd = new Date(tanningStart.getTime() + Number(booking.minutes || 0) * 60000)
    const cooldownEnd = new Date(tanningEnd.getTime() + COOLDOWN_SECONDS * 1000)

    const deducted = isShopTestBooking(booking)
      ? true
      : isStaffFreeBooking(booking)
        ? await deductStaffFreeMinutesOnce(booking)
        : await deductCustomerMinutesOnce(booking)
    if (!deducted) return

    const { error } = await supabase.from('Bookings').update({
      status: 'undressing',
      booking_start: now.toISOString(),
      booking_end: cooldownEnd.toISOString(),
      tmax_sent_at: now.toISOString(),
      tmax_status: 'undressing',
      minutes_deducted: true
    }).eq('id', booking.id)

    if (error) {
      alert('Session start was not saved. Please check the connection and try again.')
      showDataLoadWarning('A booking update failed. Please check the connection.', error)
      console.log(error)
      return
    }

    closeModal()
    getBookings()
    getCustomers()
    getStaff()
  }

  async function forceStop(booking) {
    if (!requireStaffSignIn()) return
    if (!requireManagerAccess('Manager PIN required to force stop a session:')) return

    const { error } = await supabase.from('Bookings').update({ status: 'force_stopped', booking_end: new Date().toISOString(), tmax_status: 'force_stopped' }).eq('id', booking.id)
    if (error) {
      alert('Force stop was not saved. Please check the connection and try again.')
      showDataLoadWarning('A booking update failed. Please check the connection.', error)
      console.log(error)
      return
    }
    closeModal()
    getBookings()
  }

  async function autoCompleteFinishedSessions() {
    for (const booking of bookings) {
      if (!isSunbedBooking(booking)) continue
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
    const lockedBooking = bookings.find((booking) => isSunbedBooking(booking) && Number(booking.bed_id) === Number(bedId) && isBedLocked(booking))
    if (lockedBooking) return lockedBooking

    return bookings.find((booking) => {
      if (!isSunbedBooking(booking)) return false
      if (booking.bed_id !== bedId) return false
      if (isFinishedBookingStatus(booking)) return false

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
    if (isBedOutOfService(bedId)) return '#581f25'
    const booking = getLiveBedSession(bedId) || getBookingForBed(bedId)
    if (!booking) return '#0f5b3c'
    const phase = getPhase(booking)
    if (phase === 'Booked' || phase === 'Waiting' || phase === 'Shop Test') return '#2f2f2f'
    if (phase === 'Undressing') return '#b56a22'
    if (phase === 'Running' || phase === 'Customer Started') return '#5a2f7d'
    if (phase === 'Cooldown') return '#5aa8d6'
    if (phase === 'Completed') return '#2f7a4b'
    return '#151515'
  }

  function getCalendarBookingColour(booking) {
    if (!booking) return 'transparent'
    const phase = getPhase(booking)
    if (booking.status === 'force_stopped') return '#7a1f2a'
    if (booking.status === 'no_show') return '#3a3632'
    if (phase === 'Booked' || phase === 'Waiting' || phase === 'Shop Test') return '#2f2f2f'
    if (phase === 'Undressing') return '#b56a22'
    if (phase === 'Running' || phase === 'Customer Started') return '#5a2f7d'
    if (phase === 'Cooldown') return '#5aa8d6'
    if (phase === 'Completed') return '#2f7a4b'
    return '#151515'
  }

  function getStatusChipStyle(phase) {
    const background = phase === 'Undressing'
      ? '#b56a22'
      : ['Running', 'Customer Started'].includes(phase)
        ? '#5a2f7d'
        : phase === 'Cooldown'
          ? '#5aa8d6'
          : phase === 'Completed'
            ? '#2f7a4b'
            : '#2f2f2f'
    return {
      display: 'inline-block',
      background,
      color: 'white',
      border: '1px solid rgba(255,255,255,0.16)',
      borderRadius: '8px',
      padding: '4px 9px',
      fontWeight: 'bold'
    }
  }

  function getCalendarCellBackground(booking, bedId) {
    if (booking) return getCalendarBookingColour(booking)
    return isBedOutOfService(bedId) ? '#32191d' : 'transparent'
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

    if (doesLockedBedOverlapInterval(bedId, getSlotDateTime(time), 12)) {
      showBedLockedAlert()
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
    setShopTestFreeUse(true)
    setShowBookingTopUp(false)
    setShowBookingProducts(false)
    setBookingSaving(false)
    setBookingProductId('')
    setBookingProductQuantity(1)
    setBookingProductCategoryFilter('')
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
    setShopTestFreeUse(isShopTestBooking(booking))
    setShowBookingTopUp(false)
    setShowBookingProducts(false)
    setBookingSaving(false)
    setBookingProductId('')
    setBookingProductQuantity(1)
    setBookingProductCategoryFilter('')
    setEditBedId(String(booking.bed_id))
    setEditTime(`${String(bookingTime.getHours()).padStart(2, '0')}:${String(bookingTime.getMinutes()).padStart(2, '0')}`)
    clearProductCart()
    setShowProductPicker(false)
    setModalOpen(true)
  }

  function isStartBlockedByLiveSession(booking) {
    if (!booking?.bed_id) return false
    return Boolean(getLiveBedSession(booking.bed_id, booking.id))
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
    setShopTestFreeUse(true)
    setShowBookingTopUp(false)
    setShowBookingProducts(false)
    setBookingSaving(false)
    setBookingProductId('')
    setBookingProductQuantity(1)
    setBookingProductCategoryFilter('')
    setEditTime('')
    setEditBedId('')
    clearProductCart()
    setShowProductPicker(false)
  }

  function setSprayTanServiceWithDefaults(serviceName) {
    setSprayTanService(serviceName)
    const defaultDeposit = getDefaultSprayTanDeposit(serviceName)
    setSprayTanDepositRequired(defaultDeposit)
    setSprayTanDepositStatus(defaultDeposit > 0 ? 'pending' : 'not_required')
    if (serviceName === 'Patch Test') {
      setSprayTanColumn('patch_test')
      setSprayTanDuration(10)
      setSprayTanDepositPaid(0)
      setSprayTanPatchCompleted(true)
    }
  }

  function openSprayTanSlot(time, column) {
    if (!requireStaffSignIn()) return
    const defaultService = column === 'patch_test'
      ? 'Patch Test'
      : column === 'express_tan'
        ? 'Express Tan'
        : 'Full Body'
    setSprayTanSlot({ time, column })
    setSprayTanEditingBooking(null)
    setSprayTanCustomerName('')
    setSprayTanColumn(column)
    setSprayTanService(defaultService)
    setSprayTanDate(selectedDate)
    setSprayTanTime(time)
    setSprayTanDuration(column === 'patch_test' ? 10 : 30)
    setSprayTanArtist('')
    setSprayTanNotes('')
    setSprayTanDepositRequired(getDefaultSprayTanDeposit(defaultService))
    setSprayTanDepositPaid(column === 'patch_test' ? 0 : '')
    setSprayTanDepositStatus(column === 'patch_test' ? 'not_required' : 'pending')
    setSprayTanPatchCompleted(column === 'patch_test')
    setSprayTanPatchTestDate('')
    setSprayTanApprovalStatus('pending')
    setSprayTanStatusControl('Pending Approval')
    setSelectedCustomerId('')
    setSelectedStaffAsCustomerId('')
    setCustomerSearch('')
    setNewCustomerBalance(0)
    setBookingSaving(false)
    setSprayTanSaving(false)
    setSprayTanModalOpen(true)
  }

  function openSprayTanBookingForEdit(booking) {
    if (!requireStaffSignIn()) return
    const bookingTime = new Date(booking.appointment_time)
    setSprayTanEditingBooking(booking)
    setSprayTanSlot(null)
    setSprayTanCustomerName(booking.customer_name || '')
    setSprayTanColumn(booking.spraytan_column || 'spray_tan')
    setSprayTanService(booking.spraytan_service || 'Full Body')
    setSprayTanDate(formatLocalDate(bookingTime))
    setSprayTanTime(`${String(bookingTime.getHours()).padStart(2, '0')}:${String(bookingTime.getMinutes()).padStart(2, '0')}`)
    setSprayTanDuration(Number(booking.spraytan_duration_minutes || 30))
    setSprayTanArtist(booking.spraytan_artist || '')
    setSprayTanNotes(booking.notes || '')
    setSprayTanDepositRequired(Number(booking.deposit_required || 0))
    setSprayTanDepositPaid(Number(booking.deposit_paid || 0))
    setSprayTanDepositStatus(booking.deposit_status || getSprayTanDepositStatus(booking.spraytan_service, booking.deposit_required, booking.deposit_paid))
    setSprayTanPatchCompleted(Boolean(booking.patch_test_completed))
    setSprayTanPatchTestDate(booking.patch_test_date ? formatLocalDate(new Date(booking.patch_test_date)) : '')
    setSprayTanApprovalStatus(booking.approval_status || 'approved')
    setSprayTanStatusControl(getSprayTanStatusLabel(booking))
    setSelectedCustomerId(booking.customer_id ? String(booking.customer_id) : '')
    setSelectedStaffAsCustomerId('')
    setCustomerSearch(booking.customer_name || '')
    setSprayTanSaving(false)
    setSprayTanModalOpen(true)
  }

  function closeSprayTanModal() {
    setSprayTanModalOpen(false)
    setSprayTanEditingBooking(null)
    setSprayTanSlot(null)
    setSprayTanCustomerName('')
    setSprayTanColumn('spray_tan')
    setSprayTanService('Full Body')
    setSprayTanDate(selectedDate)
    setSprayTanTime('09:00')
    setSprayTanDuration(30)
    setSprayTanArtist('')
    setSprayTanNotes('')
    setSprayTanDepositRequired(15)
    setSprayTanDepositPaid('')
    setSprayTanDepositStatus('pending')
    setSprayTanPatchCompleted(false)
    setSprayTanPatchTestDate('')
    setSprayTanApprovalStatus('pending')
    setSprayTanStatusControl('Pending Approval')
    setSprayTanSaving(false)
    setSelectedCustomerId('')
    setSelectedStaffAsCustomerId('')
    setCustomerSearch('')
  }

  async function createSprayTanBookingFromModal() {
    if (sprayTanSaving) return
    if (!requireStaffSignIn()) return

    let customer = getSelectedCustomer()
    const selectedStaff = getSelectedStaffAsCustomer()
    if (selectedStaff) {
      alert('Please select a customer for spray tan bookings, not a staff free-minutes account.')
      return
    }

    if (!customer && customerSearch.trim()) {
      const shouldCreate = window.confirm(`Create new customer "${customerSearch.trim()}"?`)
      if (!shouldCreate) return
      customer = await createNewCustomerFromSearch()
    }

    if (!customer) {
      alert('Please select or create a customer.')
      return
    }

    if (blockIfCustomerBanned(customer)) return

    const appointmentDateTime = new Date(`${sprayTanDate}T${sprayTanTime}`)
    if (Number.isNaN(appointmentDateTime.getTime())) {
      alert('Please choose a valid date and time.')
      return
    }

    const servicePrice = getSprayTanServicePrice(sprayTanService)
    const depositRequired = sprayTanService === 'Patch Test' ? 0 : Number(sprayTanDepositRequired || getDefaultSprayTanDeposit(sprayTanService))
    const depositPaid = sprayTanService === 'Patch Test' ? 0 : Number(sprayTanDepositPaid || 0)
    const balanceDue = Math.max(0, servicePrice - depositPaid)
    const statusFields = getSprayTanStatusFields(sprayTanStatusControl, sprayTanDepositStatus || getSprayTanDepositStatus(sprayTanService, depositRequired, depositPaid))
    const patchWarning = getPatchTestWarning(customer, appointmentDateTime, sprayTanService)

    if (depositPaid > servicePrice) {
      alert('Deposit paid cannot be more than the service price.')
      return
    }

    if (patchWarning && !sprayTanPatchCompleted) {
      const proceed = window.confirm(`${patchWarning}\n\nContinue creating this spray tan booking?`)
      if (!proceed) return
    }

    setSprayTanSaving(true)
    const { error, data } = await supabase.from('Bookings').insert({
      customer_id: customer.id,
      customer_name: customer.name,
      customer_phone: customer.phone || null,
      customer_email: customer.email || null,
      appointment_time: appointmentDateTime.toISOString(),
      status: statusFields.status,
      booking_source: 'dashboard',
      booking_type: 'spraytan',
      spraytan_column: sprayTanColumn,
      spraytan_service: sprayTanService,
      spraytan_artist: sprayTanArtist || null,
      deposit_required: depositRequired,
      deposit_paid: depositPaid,
      deposit_status: statusFields.deposit_status,
      patch_test_required: sprayTanService !== 'Patch Test',
      patch_test_completed: sprayTanService === 'Patch Test' ? true : sprayTanPatchCompleted,
      patch_test_date: sprayTanService === 'Patch Test' ? appointmentDateTime.toISOString() : sprayTanPatchTestDate ? new Date(`${sprayTanPatchTestDate}T00:00:00`).toISOString() : getLatestCustomerPatchTestDate(customer.id)?.toISOString() || null,
      approval_status: statusFields.approval_status,
      approved_by: statusFields.approval_status === 'approved' ? getCurrentStaffUser()?.name || null : null,
      approved_at: statusFields.approval_status === 'approved' ? new Date().toISOString() : null,
      spraytan_duration_minutes: Number(sprayTanDuration || 0),
      spraytan_balance_due: balanceDue,
      notes: sprayTanNotes || null
    }).select().single()
    setSprayTanSaving(false)

    if (error) {
      alert('Spray tan booking was not saved. Please check the connection and Spray Tan booking columns.')
      showDataLoadWarning('Spray tan booking failed to save.', error)
      console.log(error)
      return
    }

    if (sprayTanService === 'Patch Test' || sprayTanPatchCompleted) {
      const patchDate = sprayTanService === 'Patch Test'
        ? appointmentDateTime.toISOString()
        : getLatestCustomerPatchTestDate(customer.id)?.toISOString() || new Date().toISOString()
      await supabase.from('Customers').update({ last_patch_test_date: patchDate }).eq('id', customer.id)
      await createCustomerLog(customer, 'Patch test recorded', `Patch test recorded from spray tan booking. Date: ${new Date(patchDate).toLocaleString('en-GB')}.`)
    }

    await createCustomerLog(customer, 'Spray tan booking created', `${sprayTanService} booked for ${appointmentDateTime.toLocaleString('en-GB')}. Deposit required £${depositRequired.toFixed(2)}, paid £${depositPaid.toFixed(2)}.`)
    if (depositPaid > 0) {
      await createReceipt({
        customer,
        receiptType: 'spray_tan_deposit',
        items: [{ name: sprayTanService, quantity: 1, total: depositPaid }],
        subtotal: depositPaid,
        total: depositPaid,
        paymentMethod: 'not_recorded',
        notes: `Deposit recorded for spray tan booking ${data?.id || ''}.`
      })
    }
    closeSprayTanModal()
    await getBookings()
    await getCustomers()
    if (data) setDashboardView('spraytan')
  }

  async function saveSprayTanBookingEdits() {
    if (sprayTanSaving) return
    if (!requireStaffSignIn()) return
    if (!sprayTanEditingBooking?.id) {
      alert('No spray tan booking selected to edit.')
      return
    }

    const appointmentDateTime = new Date(`${sprayTanDate}T${sprayTanTime}`)
    if (Number.isNaN(appointmentDateTime.getTime())) {
      alert('Please choose a valid date and time.')
      return
    }

    const servicePrice = getSprayTanServicePrice(sprayTanService)
    const depositPaid = sprayTanService === 'Patch Test' ? 0 : Number(sprayTanDepositPaid || 0)
    const depositRequired = sprayTanService === 'Patch Test' ? 0 : Number(sprayTanDepositRequired || getDefaultSprayTanDeposit(sprayTanService))
    if (depositPaid > servicePrice) {
      alert('Deposit paid cannot be more than the service price.')
      return
    }

    const statusFields = getSprayTanStatusFields(sprayTanStatusControl, sprayTanDepositStatus)
    const balanceDue = Math.max(0, servicePrice - depositPaid)
    const patchDate = sprayTanPatchTestDate ? new Date(`${sprayTanPatchTestDate}T00:00:00`).toISOString() : null
    const customerName = sprayTanCustomerName.trim() || customerSearch.trim() || sprayTanEditingBooking.customer_name || 'Spray tan customer'

    setSprayTanSaving(true)
    const { error } = await supabase.from('Bookings').update({
      customer_name: customerName,
      appointment_time: appointmentDateTime.toISOString(),
      spraytan_column: sprayTanColumn,
      spraytan_service: sprayTanService,
      spraytan_artist: sprayTanArtist || null,
      spraytan_duration_minutes: Number(sprayTanDuration || 0),
      deposit_required: depositRequired,
      deposit_paid: depositPaid,
      deposit_status: statusFields.deposit_status,
      approval_status: statusFields.approval_status,
      approved_by: statusFields.approval_status === 'approved' && sprayTanEditingBooking.approval_status !== 'approved' ? getCurrentStaffUser()?.name || null : sprayTanEditingBooking.approved_by || null,
      approved_at: statusFields.approval_status === 'approved' && sprayTanEditingBooking.approval_status !== 'approved' ? new Date().toISOString() : sprayTanEditingBooking.approved_at || null,
      status: statusFields.status,
      patch_test_required: sprayTanService !== 'Patch Test',
      patch_test_completed: sprayTanService === 'Patch Test' ? true : sprayTanPatchCompleted,
      patch_test_date: sprayTanService === 'Patch Test' ? appointmentDateTime.toISOString() : patchDate,
      spraytan_balance_due: balanceDue,
      notes: sprayTanNotes || null
    }).eq('id', sprayTanEditingBooking.id)
    setSprayTanSaving(false)

    if (error) {
      alert('Spray tan booking changes were not saved. Please check the connection.')
      showDataLoadWarning('Spray tan booking update failed.', error)
      console.log(error)
      return
    }

    if ((sprayTanService === 'Patch Test' || sprayTanPatchCompleted) && sprayTanEditingBooking.customer_id) {
      const customerPatchDate = sprayTanService === 'Patch Test' ? appointmentDateTime.toISOString() : patchDate
      if (customerPatchDate) {
        await supabase.from('Customers').update({ last_patch_test_date: customerPatchDate }).eq('id', sprayTanEditingBooking.customer_id)
      }
    }

    const previousDepositPaid = Number(sprayTanEditingBooking.deposit_paid || 0)
    const depositIncrease = depositPaid - previousDepositPaid
    if (depositIncrease > 0) {
      await createReceipt({
        customer: sprayTanEditingBooking.customer_id ? { id: sprayTanEditingBooking.customer_id, name: customerName } : null,
        customerName,
        receiptType: previousDepositPaid >= depositRequired ? 'spray_tan_balance_payment' : 'spray_tan_deposit',
        items: [{ name: sprayTanService, quantity: 1, total: depositIncrease }],
        subtotal: depositIncrease,
        total: depositIncrease,
        paymentMethod: 'not_recorded',
        notes: `Additional payment recorded for spray tan booking ${sprayTanEditingBooking.id}.`
      })
    }

    closeSprayTanModal()
    await getBookings()
    await getCustomers()
  }

  async function cancelSprayTanBooking() {
    if (!sprayTanEditingBooking?.id) return
    const confirmed = window.confirm('Cancel this spray tan booking? This will keep the record and mark it as Cancelled.')
    if (!confirmed) return
    setSprayTanStatusControl('Cancelled')
    setSprayTanSaving(true)
    const { error } = await supabase.from('Bookings').update({
      status: 'cancelled',
      approval_status: 'cancelled',
      last_wix_sync_at: sprayTanEditingBooking.booking_source === 'wix' ? new Date().toISOString() : sprayTanEditingBooking.last_wix_sync_at || null
    }).eq('id', sprayTanEditingBooking.id)
    setSprayTanSaving(false)

    if (error) {
      alert('Spray tan booking was not cancelled. Please check the connection.')
      showDataLoadWarning('Spray tan booking cancel failed.', error)
      console.log(error)
      return
    }

    closeSprayTanModal()
    await getBookings()
  }

  async function openCustomerManagementFromBooking(booking) {
    if (!requireStaffSignIn()) return

    if (!booking?.customer_id || isShopTestBooking(booking) || isStaffFreeBooking(booking)) {
      alert('This booking is not linked to a customer record.')
      return
    }

    let customer = customers.find((item) => Number(item.id) === Number(booking.customer_id))
    if (!customer) {
      const { data, error } = await supabase.from('Customers').select('*').eq('id', booking.customer_id).single()
      if (error) {
        alert('Customer details could not be loaded. Please check the connection.')
        showDataLoadWarning('Customer details failed to load. Please check the connection.', error)
        console.log(error)
        return
      }
      customer = data
    }

    selectManagerCustomer(customer)
    setShowCustomerManagement(true)
    closeModal()
    setTimeout(() => {
      const panel = document.querySelector('.customer-management-panel')
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 120)
  }

  function getSelectedManagerCustomer() {
    return customers.find((customer) => customer.id === Number(selectedManagerCustomerId))
  }

  function splitCustomerName(customer) {
    const nameParts = String(customer?.name || '').trim().split(/\s+/).filter(Boolean)
    const fallbackFirst = nameParts[0] || ''
    const fallbackLast = nameParts.length > 1 ? nameParts.slice(1).join(' ') : ''
    return {
      firstName: customer?.first_name || fallbackFirst,
      lastName: customer?.last_name || fallbackLast
    }
  }

  function getFilteredManagerCustomers() {
    if (!customerManagerSearch.trim()) return []
    const query = customerManagerSearch.toLowerCase()
    return customers.filter((customer) => {
      const searchable = [customer.name, customer.first_name, customer.last_name, customer.phone, customer.email, customer.postcode]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return searchable.includes(query)
    })
  }

  function getFilteredAllCustomers() {
    const query = allCustomersSearch.trim().toLowerCase()
    const sortedCustomers = customers.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    if (!query) return sortedCustomers
    return sortedCustomers.filter((customer) => {
      const searchable = [customer.name, customer.first_name, customer.last_name, customer.phone, customer.email, customer.postcode]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return searchable.includes(query)
    })
  }

  async function createCustomerLog(customer, action, details) {
    if (!customer) return
    await supabase.from('CustomerLogs').insert({ customer_id: customer.id, customer_name: customer.name, action, details })
  }

  async function createCustomerMinuteTransaction({ customer, minuteType, transactionType, minutesChanged, balanceBefore, balanceAfter, notes }) {
    if (!customer || !minuteType || Number(minutesChanged || 0) === 0) return
    const staffUser = getCurrentStaffUser()
    const { error } = await supabase.from('CustomerMinuteTransactions').insert({
      customer_id: customer.id,
      customer_name: customer.name,
      minute_type: minuteType,
      transaction_type: transactionType,
      minutes_changed: Number(minutesChanged || 0),
      balance_before: Number(balanceBefore || 0),
      balance_after: Number(balanceAfter || 0),
      staff_name: staffUser?.name || null,
      notes: notes || null
    })
    if (error) {
      showDataLoadWarning('Customer minute transaction could not be logged. Check the CustomerMinuteTransactions table.', error)
      console.log(error)
    }
  }

  async function logCustomerMinuteChanges(customer, oldStandard, newStandard, oldHybrid, newHybrid, transactionType, notes) {
    const standardDelta = Number(newStandard || 0) - Number(oldStandard || 0)
    const hybridDelta = Number(newHybrid || 0) - Number(oldHybrid || 0)
    if (standardDelta !== 0) {
      await createCustomerMinuteTransaction({
        customer,
        minuteType: 'standard',
        transactionType,
        minutesChanged: standardDelta,
        balanceBefore: oldStandard,
        balanceAfter: newStandard,
        notes
      })
    }
    if (hybridDelta !== 0) {
      await createCustomerMinuteTransaction({
        customer,
        minuteType: 'hybrid',
        transactionType,
        minutesChanged: hybridDelta,
        balanceBefore: oldHybrid,
        balanceAfter: newHybrid,
        notes
      })
    }
  }

  async function loadCustomerHistory(customerId) {
    if (!customerId) {
      setCustomerPayments([])
      setCustomerLogs([])
      setCustomerMinuteTransactions([])
      setCustomerReceipts([])
      return
    }
    const { data: paymentsData } = await supabase.from('Payments').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(10)
    setCustomerPayments(paymentsData || [])
    const { data: logsData } = await supabase.from('CustomerLogs').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(10)
    setCustomerLogs(logsData || [])
    const { data: minuteTransactionsData, error: minuteTransactionsError } = await supabase
      .from('CustomerMinuteTransactions')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (minuteTransactionsError) {
      setCustomerMinuteTransactions([])
      showDataLoadWarning('Customer minute transaction history could not be loaded.', minuteTransactionsError)
    } else {
      setCustomerMinuteTransactions(minuteTransactionsData || [])
    }
    const { data: receiptData, error: receiptError } = await supabase
      .from('Receipts')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(30)
    if (receiptError) {
      setCustomerReceipts([])
      showDataLoadWarning('Customer receipt history could not be loaded.', receiptError)
    } else {
      setCustomerReceipts(receiptData || [])
    }
  }

  async function searchReceipts() {
    if (!requireStaffSignIn()) return
    if (!requireManagerAccess('Manager PIN required for receipt history:')) return

    setReceiptSearchLoading(true)
    setReceiptSearchError('')
    const dayStart = receiptSearchDate ? new Date(`${receiptSearchDate}T00:00:00`) : null
    const dayEnd = receiptSearchDate ? new Date(`${receiptSearchDate}T23:59:59.999`) : null
    let query = supabase.from('Receipts').select('*').order('created_at', { ascending: false }).limit(200)
    if (dayStart && dayEnd) query = query.gte('created_at', dayStart.toISOString()).lte('created_at', dayEnd.toISOString())
    if (receiptSearchType) query = query.eq('receipt_type', receiptSearchType)
    if (receiptSearchPaymentMethod) query = query.eq('payment_method', receiptSearchPaymentMethod)

    const { data, error } = await query
    setReceiptSearchLoading(false)
    if (error) {
      setManagerReceipts([])
      setReceiptSearchError(error.message || 'Receipt search failed.')
      showDataLoadWarning('Receipt history could not be loaded.', error)
      return
    }

    const customerQuery = receiptSearchCustomer.trim().toLowerCase()
    const filtered = customerQuery
      ? (data || []).filter((receipt) => String(receipt.customer_name || '').toLowerCase().includes(customerQuery))
      : data || []
    setManagerReceipts(filtered)
  }

  function selectManagerCustomer(customer) {
    const splitName = splitCustomerName(customer)
    setSelectedManagerCustomerId(String(customer.id))
    setCustomerManagerSearch(customer.name || '')
    setManagerName(customer.name || '')
    setManagerFirstName(splitName.firstName)
    setManagerLastName(splitName.lastName)
    setManagerPhone(customer.phone || '')
    setManagerEmail(customer.email || '')
    setManagerDateOfBirth(customer.date_of_birth || '')
    setManagerAddress(customer.address || '')
    setManagerPostcode(customer.postcode || '')
    setManagerGender(customer.gender || '')
    setManagerSprayTanNotes(customer.spraytan_notes || '')
    setManagerLastPatchTestDate(customer.last_patch_test_date ? formatLocalDate(new Date(customer.last_patch_test_date)) : '')
    setManagerNotes(customer.notes || '')
    setManagerStandardBalance(Number(customer.standard_minutes_balance || 0))
    setManagerHybridBalance(Number(customer.hybrid_minutes_balance || 0))
    setManagerTermsAccepted(Boolean(customer.terms_accepted))
    setManagerIdChecked(Boolean(customer.id_checked))
    setManagerActive(customer.is_active !== false)
    setManagerWarningFlag(Boolean(customer.warning_flag))
    setManagerWarningLevel(customer.warning_level || 'none')
    setManagerWarningNote(customer.warning_note || '')
    clearMinuteCorrection()
    loadCustomerHistory(customer.id)
  }

  function clearCustomerManager() {
    setSelectedManagerCustomerId('')
    setCustomerManagerSearch('')
    setManagerName('')
    setManagerFirstName('')
    setManagerLastName('')
    setManagerPhone('')
    setManagerEmail('')
    setManagerDateOfBirth('')
    setManagerAddress('')
    setManagerPostcode('')
    setManagerGender('')
    setManagerSprayTanNotes('')
    setManagerLastPatchTestDate('')
    setManagerNotes('')
    setManagerStandardBalance(0)
    setManagerHybridBalance(0)
    setManagerTermsAccepted(false)
    setManagerIdChecked(false)
    setManagerActive(true)
    setManagerWarningFlag(false)
    setManagerWarningLevel('none')
    setManagerWarningNote('')
    clearMinuteCorrection()
    setCustomerPayments([])
    setCustomerLogs([])
    setCustomerMinuteTransactions([])
    setCustomerReceipts([])
  }

  function clearAddCustomerForm() {
    setAddCustomerFirstName('')
    setAddCustomerLastName('')
    setAddCustomerPhone('')
    setAddCustomerEmail('')
    setAddCustomerDateOfBirth('')
    setAddCustomerAddress('')
    setAddCustomerPostcode('')
    setAddCustomerGender('')
    setAddCustomerNotes('')
    setAddCustomerStandardMinutes('')
    setAddCustomerHybridMinutes('')
    setAddCustomerActive(true)
    setAddCustomerWarningFlag(false)
    setAddCustomerWarningLevel('none')
    setAddCustomerWarningNote('')
  }

  function resetCustomerImport() {
    setCustomerImportRows([])
    setCustomerImportSummary(null)
    setCustomerImportError('')
    setCustomerImportProgress('')
  }

  function normalizeImportHeader(header) {
    return String(header || '')
      .trim()
      .toLowerCase()
      .replaceAll('_', ' ')
      .replaceAll('-', ' ')
      .replace(/\s+/g, ' ')
  }

  function getImportCell(row, aliases) {
    const normalizedAliases = aliases.map(normalizeImportHeader)
    const key = Object.keys(row || {}).find((header) => normalizedAliases.includes(normalizeImportHeader(header)))
    return key ? row[key] : ''
  }

  function parseImportBoolean(value, defaultValue = false) {
    if (typeof value === 'boolean') return value
    const text = String(value ?? '').trim().toLowerCase()
    if (!text) return defaultValue
    if (['yes', 'y', 'true', '1', 'accepted', 'checked', 'active'].includes(text)) return true
    if (['no', 'n', 'false', '0', 'not accepted', 'unchecked', 'inactive'].includes(text)) return false
    return defaultValue
  }

  function parseImportDate(value) {
    if (!value) return null
    if (value instanceof Date && !Number.isNaN(value.getTime())) return formatLocalDate(value)
    if (typeof value === 'number') {
      const parsed = XLSX.SSF.parse_date_code(value)
      if (!parsed) return null
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
    }

    const text = String(value).trim()
    if (!text) return null
    const slashDate = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/)
    if (slashDate) {
      const day = slashDate[1].padStart(2, '0')
      const month = slashDate[2].padStart(2, '0')
      const year = slashDate[3].length === 2 ? `20${slashDate[3]}` : slashDate[3]
      return `${year}-${month}-${day}`
    }
    const parsed = new Date(text)
    if (Number.isNaN(parsed.getTime())) return null
    return formatLocalDate(parsed)
  }

  function parseImportNumber(value) {
    if (value === '' || value === null || value === undefined) return 0
    const parsed = Number(String(value).replace(/[^\d.-]/g, ''))
    return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed
  }

  function parseCsvText(text) {
    const rows = []
    let row = []
    let cell = ''
    let quoted = false

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index]
      const nextChar = text[index + 1]
      if (char === '"' && quoted && nextChar === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        quoted = !quoted
      } else if (char === ',' && !quoted) {
        row.push(cell)
        cell = ''
      } else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && nextChar === '\n') index += 1
        row.push(cell)
        if (row.some((value) => String(value).trim() !== '')) rows.push(row)
        row = []
        cell = ''
      } else {
        cell += char
      }
    }

    row.push(cell)
    if (row.some((value) => String(value).trim() !== '')) rows.push(row)
    const [headers = [], ...dataRows] = rows
    return dataRows.map((dataRow) => headers.reduce((record, header, index) => {
      record[header] = dataRow[index] ?? ''
      return record
    }, {}))
  }

  function mapCustomerImportRow(row, rowNumber) {
    const firstName = String(getImportCell(row, ['First name', 'first_name', 'firstname', 'Forename']) || '').trim()
    const lastName = String(getImportCell(row, ['Last name', 'last_name', 'lastname', 'Surname']) || '').trim()
    const address = String(getImportCell(row, ['Address', 'address']) || '').trim()
    const postcode = String(getImportCell(row, ['Postcode', 'postcode', 'post code']) || '').trim()
    const gender = String(getImportCell(row, ['Gender', 'gender']) || '').trim()
    const phone = String(getImportCell(row, ['Phone', 'phone number', 'mobile', 'MobileTel']) || '').trim()
    const email = String(getImportCell(row, ['Email', 'email address', 'EmailAddress']) || '').trim().toLowerCase()
    const dob = parseImportDate(getImportCell(row, ['DOB', 'Date of birth', 'date_of_birth', 'dob', 'DateOfBirth']))
    const standardBalance = parseImportNumber(getImportCell(row, ['Standard minutes balance', 'standard_minutes_balance', 'standard minutes']))
    const hybridBalance = parseImportNumber(getImportCell(row, ['Hybrid minutes balance', 'hybrid_minutes_balance', 'hybrid minutes']))
    const termsAccepted = parseImportBoolean(getImportCell(row, ['Salon terms accepted', 'terms_accepted', 'salon_terms_accepted']), false)
    const idChecked = parseImportBoolean(getImportCell(row, ['ID checked', 'id_checked', 'id check']), false)
    const notes = String(getImportCell(row, ['Notes', 'note']) || '').trim()
    const active = parseImportBoolean(getImportCell(row, ['Active/inactive', 'active', 'is_active']), true)
    const name = `${firstName} ${lastName}`.trim()
    const invalidReasons = []

    if (!firstName && !phone) invalidReasons.push('First name or phone is required')
    if (standardBalance < 0 || hybridBalance < 0) invalidReasons.push('Minute balances cannot be negative')

    return {
      rowNumber,
      firstName,
      lastName,
      duplicate: null,
      duplicateReasons: [],
      invalidReasons,
      action: invalidReasons.length > 0 ? 'skip' : 'insert',
      payload: {
        name: name || phone,
        first_name: firstName || null,
        last_name: lastName || null,
        phone: phone || null,
        email: email || null,
        date_of_birth: dob,
        address: address || null,
        postcode: postcode || null,
        gender: gender || null,
        notes: notes || null,
        minutes_balance: 0,
        standard_minutes_balance: standardBalance,
        hybrid_minutes_balance: hybridBalance,
        terms_accepted: termsAccepted,
        id_checked: idChecked,
        is_active: active,
        warning_flag: false,
        warning_level: 'none',
        warning_note: null,
        customer_source: 'dashboard'
      }
    }
  }

  async function handleCustomerImportFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!requireStaffSignIn()) return

    setCustomerImportLoading(true)
    resetCustomerImport()
    setCustomerImportProgress('Reading spreadsheet...')

    try {
      const extension = file.name.split('.').pop()?.toLowerCase()
      let rawRows = []

      if (extension === 'csv') {
        rawRows = parseCsvText(await file.text())
      } else if (['xlsx', 'xls'].includes(extension)) {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        rawRows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' })
      } else {
        throw new Error('Please upload a CSV or XLSX file.')
      }

      setCustomerImportProgress('Checking duplicates...')
      const { data: existingCustomers, error } = await supabase
        .from('Customers')
        .select('id,name,phone,email,standard_minutes_balance,hybrid_minutes_balance,is_active')

      if (error) throw error

      const existingByPhone = new Map()
      const existingByEmail = new Map()
      ;(existingCustomers || []).forEach((customer) => {
        if (customer.phone) existingByPhone.set(String(customer.phone).trim(), customer)
        if (customer.email) existingByEmail.set(String(customer.email).trim().toLowerCase(), customer)
      })

      const mappedRows = rawRows.map((row, index) => mapCustomerImportRow(row, index + 2)).map((row) => {
        const duplicateReasons = []
        const phoneDuplicate = row.payload.phone ? existingByPhone.get(row.payload.phone) : null
        const emailDuplicate = row.payload.email ? existingByEmail.get(row.payload.email) : null
        const duplicate = phoneDuplicate || emailDuplicate || null
        if (phoneDuplicate) duplicateReasons.push('phone')
        if (emailDuplicate && emailDuplicate.id !== phoneDuplicate?.id) duplicateReasons.push('email')
        if (duplicate) {
          return {
            ...row,
            duplicate,
            duplicateReasons,
            action: row.invalidReasons.length > 0 ? 'skip' : 'skip'
          }
        }
        return row
      })

      const summary = {
        total: mappedRows.length,
        newCount: mappedRows.filter((row) => !row.duplicate && row.invalidReasons.length === 0).length,
        duplicateCount: mappedRows.filter((row) => row.duplicate).length,
        invalidCount: mappedRows.filter((row) => row.invalidReasons.length > 0).length
      }

      setCustomerImportRows(mappedRows)
      setCustomerImportSummary(summary)
      setCustomerImportProgress('')
    } catch (error) {
      setCustomerImportError(error.message || 'Customer import failed to read the file.')
      console.log(error)
    } finally {
      setCustomerImportLoading(false)
    }
  }

  function updateCustomerImportAction(rowNumber, action) {
    setCustomerImportRows((rows) => rows.map((row) => row.rowNumber === rowNumber ? { ...row, action } : row))
  }

  async function saveCustomerImport() {
    if (!requireStaffSignIn()) return
    if (customerImportSaving) return

    const rowsToSave = customerImportRows.filter((row) => row.invalidReasons.length === 0 && row.action !== 'skip')
    if (rowsToSave.length === 0) {
      alert('No import rows selected to save.')
      return
    }

    const confirmed = window.confirm(`Import ${rowsToSave.length} customer row(s)? Existing customers will only be changed where you selected "Update existing customer".`)
    if (!confirmed) return

    setCustomerImportSaving(true)
    setCustomerImportProgress('Saving customers...')

    try {
      const newRows = rowsToSave.filter((row) => row.action === 'insert' || row.action === 'new').map((row) => row.payload)
      const updateRows = rowsToSave.filter((row) => row.action === 'update' && row.duplicate?.id)
      const batchSize = 100

      for (let index = 0; index < newRows.length; index += batchSize) {
        const batch = newRows.slice(index, index + batchSize)
        setCustomerImportProgress(`Inserting ${Math.min(index + batch.length, newRows.length)} of ${newRows.length} new customers...`)
        const { error } = await supabase.from('Customers').insert(batch)
        if (error) throw error
      }

      for (let index = 0; index < updateRows.length; index += batchSize) {
        const batch = updateRows.slice(index, index + batchSize)
        setCustomerImportProgress(`Updating ${Math.min(index + batch.length, updateRows.length)} of ${updateRows.length} existing customers...`)
        const results = await Promise.all(batch.map((row) => {
          const { minutes_balance: _minutesBalance, ...updatePayload } = row.payload
          return supabase.from('Customers').update(updatePayload).eq('id', row.duplicate.id)
        }))
        const failed = results.find((result) => result.error)
        if (failed?.error) throw failed.error
      }

      await getCustomers()
      setCustomerImportProgress('')
      setCustomerImportSummary((summary) => summary ? { ...summary, savedCount: rowsToSave.length } : null)
      alert('Customer import complete.')
    } catch (error) {
      setCustomerImportError(error.message || 'Customer import failed to save.')
      showDataLoadWarning('Customer import failed to save. Please check the connection.', error)
      console.log(error)
    } finally {
      setCustomerImportSaving(false)
    }
  }

  async function saveNewManagedCustomer() {
    if (!requireStaffSignIn()) return

    const firstName = addCustomerFirstName.trim()
    const lastName = addCustomerLastName.trim()
    const address = addCustomerAddress.trim()
    const postcode = addCustomerPostcode.trim()
    const gender = addCustomerGender.trim()
    const phone = addCustomerPhone.trim()
    const email = addCustomerEmail.trim()
    const fullName = `${firstName} ${lastName}`.trim()
    const standardMinutes = addCustomerStandardMinutes === '' ? 0 : Number(addCustomerStandardMinutes || 0)
    const hybridMinutes = addCustomerHybridMinutes === '' ? 0 : Number(addCustomerHybridMinutes || 0)

    if (!firstName && !phone) {
      alert('First name or phone number is required.')
      return
    }

    if ((addCustomerStandardMinutes !== '' && (Number.isNaN(standardMinutes) || standardMinutes < 0)) || (addCustomerHybridMinutes !== '' && (Number.isNaN(hybridMinutes) || hybridMinutes < 0))) {
      alert('Standard and Hybrid minutes must be 0 or more.')
      return
    }

    if (phone || email) {
      const duplicateFilters = []
      if (phone) duplicateFilters.push(`phone.eq.${phone}`)
      if (email) duplicateFilters.push(`email.eq.${email}`)
      const { data: duplicates, error: duplicateError } = await supabase
        .from('Customers')
        .select('id,name,phone,email')
        .or(duplicateFilters.join(','))
        .limit(1)

      if (duplicateError) {
        alert('Could not check for duplicate customers. Please check the connection and try again.')
        showDataLoadWarning('Duplicate customer check failed. Please check the connection.', duplicateError)
        console.log(duplicateError)
        return
      }

      if (duplicates && duplicates.length > 0) {
        alert('This customer may already exist.')
        return
      }
    }

    const staffUser = getCurrentStaffUser()
    const notes = addCustomerNotes.trim()

    setAddCustomerSaving(true)
    const { data, error } = await supabase.from('Customers').insert({
      name: fullName || phone,
      first_name: firstName || null,
      last_name: lastName || null,
      phone: phone || null,
      email: email || null,
      date_of_birth: addCustomerDateOfBirth || null,
      address: address || null,
      postcode: postcode || null,
      gender: gender || null,
      notes: notes || null,
      minutes_balance: 0,
      standard_minutes_balance: standardMinutes,
      hybrid_minutes_balance: hybridMinutes,
      is_active: addCustomerActive,
      warning_flag: addCustomerWarningFlag && addCustomerWarningLevel !== 'none',
      warning_level: addCustomerWarningFlag ? addCustomerWarningLevel : 'none',
      warning_note: addCustomerWarningFlag ? addCustomerWarningNote.trim() || null : null,
      customer_source: 'dashboard'
    }).select().single()
    setAddCustomerSaving(false)

    if (error) {
      alert('Customer was not added. Please check the connection and try again.')
      showDataLoadWarning('A customer save failed. Please check the connection.', error)
      console.log(error)
      return
    }

    await createCustomerLog(data, 'Customer added', `Customer added by ${staffUser?.name || 'staff'}. Initial balances: Standard ${standardMinutes}, Hybrid ${hybridMinutes}.`)
    await logCustomerMinuteChanges(
      data,
      0,
      standardMinutes,
      0,
      hybridMinutes,
      'added',
      'Initial balance when customer was added.'
    )
    await getCustomers()
    clearAddCustomerForm()
    setShowAddCustomerForm(false)
    clearCustomerManager()
    setAddCustomerSuccess('Customer added successfully')
    setTimeout(() => setAddCustomerSuccess(''), 3500)
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

    if (!requireManagerAccess('Manager PIN required to correct customer minutes:')) return
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

    if (!requireManagerAccess('Manager PIN required to apply correction:')) return

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
    await logCustomerMinuteChanges(
      customer,
      oldStandard,
      newStandard,
      oldHybrid,
      newHybrid,
      'adjusted',
      `${getCorrectionTypeLabel(correctionType)}. Reason: ${reason}`
    )
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
    const firstName = managerFirstName.trim()
    const lastName = managerLastName.trim()
    const fullName = `${firstName} ${lastName}`.trim() || managerName.trim()
    if (!fullName) {
      alert('Customer name cannot be blank.')
      return
    }

    const oldStandard = Number(customer.standard_minutes_balance || 0)
    const oldHybrid = Number(customer.hybrid_minutes_balance || 0)
    const newStandard = Number(managerStandardBalance || 0)
    const newHybrid = Number(managerHybridBalance || 0)
    const oldTermsAccepted = Boolean(customer.terms_accepted)
    const oldIdChecked = Boolean(customer.id_checked)
    const staffUser = getCurrentStaffUser()
    const now = new Date().toISOString()

    if (oldStandard !== newStandard || oldHybrid !== newHybrid) {
      if (!requireManagerAccess('Manager PIN required to change customer minutes:')) return
    }

    const { error } = await supabase.from('Customers').update({
      name: fullName,
      first_name: firstName || null,
      last_name: lastName || null,
      phone: managerPhone || null,
      email: managerEmail || null,
      date_of_birth: managerDateOfBirth || null,
      address: managerAddress || null,
      postcode: managerPostcode || null,
      gender: managerGender || null,
      spraytan_notes: managerSprayTanNotes || null,
      last_patch_test_date: managerLastPatchTestDate || null,
      notes: managerNotes || null,
      standard_minutes_balance: newStandard,
      hybrid_minutes_balance: newHybrid,
      terms_accepted: managerTermsAccepted,
      terms_accepted_at: managerTermsAccepted && !oldTermsAccepted ? now : customer.terms_accepted_at || null,
      terms_accepted_by_staff: managerTermsAccepted && !oldTermsAccepted ? staffUser?.name || null : customer.terms_accepted_by_staff || null,
      id_checked: managerIdChecked,
      id_checked_at: managerIdChecked && !oldIdChecked ? now : customer.id_checked_at || null,
      id_checked_by_staff: managerIdChecked && !oldIdChecked ? staffUser?.name || null : customer.id_checked_by_staff || null,
      is_active: managerActive,
      warning_flag: managerWarningFlag && managerWarningLevel !== 'none',
      warning_level: managerWarningFlag ? managerWarningLevel : 'none',
      warning_note: managerWarningFlag ? managerWarningNote || null : null
    }).eq('id', customer.id)

    if (error) {
      alert('Customer changes were not saved. Please check the connection and try again.')
      showDataLoadWarning('A customer update failed. Please check the connection.', error)
      console.log(error)
      return
    }

    await createCustomerLog(customer, 'Customer updated', `Details saved. DOB: ${managerDateOfBirth || 'not recorded'}. Standard ${oldStandard} → ${newStandard}. Hybrid ${oldHybrid} → ${newHybrid}.`)
    await logCustomerMinuteChanges(
      customer,
      oldStandard,
      newStandard,
      oldHybrid,
      newHybrid,
      'adjusted',
      'Manual balance edit from Customer Management.'
    )
    if (managerTermsAccepted && !oldTermsAccepted) await createCustomerLog(customer, 'Salon terms accepted', `Terms accepted by ${staffUser?.name || 'staff'} in Customer Management.`)
    if (managerIdChecked && !oldIdChecked) await createCustomerLog(customer, 'ID checked', `ID checked by ${staffUser?.name || 'staff'} in Customer Management.`)
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
    if (!requireManagerAccess('Manager PIN required to deactivate customer:')) return
    const { error } = await supabase.from('Customers').update({ is_active: false }).eq('id', customer.id)
    if (error) {
      alert('Customer was not deactivated. Please check the connection and try again.')
      showDataLoadWarning('A customer update failed. Please check the connection.', error)
      console.log(error)
      return
    }
    await createCustomerLog(customer, 'Customer deactivated', 'Customer was marked inactive.')
    await getCustomers()
    clearCustomerManager()
  }

  async function saveStaffMember() {
    if (!requireStaffSignIn()) return
    if (!requireManagerAccess('Manager PIN required to edit staff accounts:')) return

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
      alert('Staff account was not saved. Please check the connection and try again.')
      showDataLoadWarning('A staff action failed. Please check the connection.', error)
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
    if (!requireManagerAccess('Manager PIN required:')) return
    const { error } = await supabase.from('Staff').update({ is_active: false }).eq('id', member.id)
    if (error) {
      alert('Staff account was not deactivated. Please check the connection and try again.')
      showDataLoadWarning('A staff action failed. Please check the connection.', error)
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
    if (!requireManagerAccess('Manager PIN required:')) return

    const oldBalance = Number(member.weekly_free_minutes_balance || 0)
    const newBalance = Math.max(0, oldBalance + amount)

    const { error } = await supabase.from('Staff').update({ weekly_free_minutes_balance: newBalance }).eq('id', member.id)
    if (error) {
      alert('Staff minutes were not adjusted. Please check the connection and try again.')
      showDataLoadWarning('A staff action failed. Please check the connection.', error)
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
    if (!requireManagerAccess('Manager PIN required to edit products/prices:')) return

    if (!productName.trim()) {
      alert('Product name is required.')
      return
    }

    const payload = {
      name: productName.trim(),
      category: normalizeProductCategory(productCategory),
      price: Number(productPrice || 0),
      stock_quantity: productStockQuantity === '' ? 0 : Number(productStockQuantity || 0),
      is_active: productIsActive
    }

    const request = productEditingId
      ? supabase.from('Products').update(payload).eq('id', productEditingId)
      : supabase.from('Products').insert(payload)

    const { error } = await request
    if (error) {
      alert('Product was not saved. Please check the connection and try again.')
      showDataLoadWarning('A product update failed. Please check the connection.', error)
      console.log(error)
      return
    }

    await getProducts()
    if (!productEditingId) clearProductForm()
  }

  function editProduct(product) {
    setProductEditingId(String(product.id))
    setSelectedProductManagementId(String(product.id))
    setProductName(product.name || '')
    setProductCategory(normalizeProductCategory(product.category))
    setProductPrice(product.price || '')
    setProductStockQuantity(product.stock_quantity ?? '')
    setProductIsActive(product.is_active !== false)
  }

  function clearProductForm() {
    setProductEditingId('')
    setProductName('')
    setProductCategory('sachets')
    setProductPrice('')
    setProductStockQuantity('')
    setProductIsActive(true)
  }

  function selectProductForManagement(productId) {
    setSelectedProductManagementId(productId)
    const product = products.find((item) => String(item.id) === String(productId))
    if (product) {
      editProduct(product)
    } else {
      clearProductForm()
    }
  }

  async function deactivateProduct(product) {
    if (!requireStaffSignIn()) return
    if (!requireManagerAccess('Manager PIN required to deactivate products:')) return

    const confirmed = window.confirm(`Deactivate ${product.name}?`)
    if (!confirmed) return
    const { error } = await supabase.from('Products').update({ is_active: false }).eq('id', product.id)
    if (error) {
      alert('Product was not deactivated. Please check the connection and try again.')
      showDataLoadWarning('A product update failed. Please check the connection.', error)
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
                    {isShopTestCustomer(option.record) ? (
                      <><strong>Shop Test</strong> — Internal</>
                    ) : (
                      <><strong>{option.record.name}</strong> — Standard {option.record.standard_minutes_balance || 0} mins / Hybrid {option.record.hybrid_minutes_balance || 0} mins</>
                    )}
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
            {!newCustomerTermsAccepted && <p style={{ color: '#ffcc66', fontWeight: 'bold' }}>Salon terms not accepted yet.</p>}
            <label style={{ display: 'block', marginBottom: '8px' }}>
              <input type="checkbox" checked={newCustomerTermsAccepted} onChange={(e) => setNewCustomerTermsAccepted(e.target.checked)} style={{ marginRight: '8px' }} />
              Salon Terms accepted
            </label>
            <label style={{ display: 'block', marginBottom: '8px' }}>
              <input type="checkbox" checked={newCustomerIdChecked} onChange={(e) => setNewCustomerIdChecked(e.target.checked)} style={{ marginRight: '8px' }} />
              ID checked
            </label>
            <button onClick={createNewCustomerFromSearch}>Create New Customer</button>
          </div>
        )}

        {selectedCustomer && (
          <div style={{ background: '#111', padding: '12px', borderRadius: '10px' }}>
            <strong>{isShopTestCustomer(selectedCustomer) ? 'Shop Test — Internal' : selectedCustomer.name}</strong>
            {isShopTestCustomer(selectedCustomer) ? (
              <>
                <div style={{ background: '#0b0b0b', padding: '15px', borderRadius: '10px', marginTop: '12px', border: '1px solid #333', textAlign: 'center' }}>
                  <p style={{ margin: '5px 0', color: '#d4a853', fontWeight: 'bold' }}>Internal / Free Use</p>
                  <p style={{ margin: '5px 0' }}>Unlimited minutes. No payment or balance deduction required.</p>
                  <label style={{ display: 'inline-flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
                    <input type="checkbox" checked={shopTestFreeUse} onChange={(event) => setShopTestFreeUse(event.target.checked)} />
                    Free / Internal Use
                  </label>
                </div>
                {!shopTestFreeUse && <p style={{ color: '#ffcc66', fontWeight: 'bold' }}>Shop Test bookings are intended for free/internal use.</p>}
              </>
            ) : (
              <>
                <p style={{ color: selectedCustomer.date_of_birth && isCustomerUnder18(selectedCustomer) ? '#ff7875' : '#aaa', fontWeight: selectedCustomer.date_of_birth && isCustomerUnder18(selectedCustomer) ? 'bold' : 'normal', marginBottom: '8px' }}>
                  {getCustomerAgeText(selectedCustomer)}
                </p>
                {selectedCustomer.date_of_birth && isCustomerUnder18(selectedCustomer) && <p style={{ color: '#ff7875', fontWeight: 'bold' }}>Under 18 — do not book.</p>}
                {!selectedCustomer.date_of_birth && <p style={{ color: '#faad14', fontWeight: 'bold' }}>DOB not recorded — check ID before use.</p>}
                {!selectedCustomer.terms_accepted && <p style={{ color: '#ffcc66', fontWeight: 'bold' }}>Salon terms not accepted yet.</p>}
                {!selectedCustomer.id_checked && <p style={{ color: '#ffcc66', fontWeight: 'bold' }}>ID check not recorded.</p>}
                {renderCustomerWarning(selectedCustomer)}
                <div style={{ background: '#0b0b0b', padding: '15px', borderRadius: '10px', marginTop: '12px', border: '1px solid #333', textAlign: 'center' }}>
                  <p style={{ margin: '5px 0' }}>Standard balance: <strong>{selectedCustomer.standard_minutes_balance || 0} mins</strong></p>
                  <p style={{ margin: '5px 0' }}>Hybrid balance: <strong>{selectedCustomer.hybrid_minutes_balance || 0} mins</strong></p>
                  <p style={{ marginTop: '12px', fontSize: '18px' }}>Usable for this bed: <strong>{getUsableMinutesForBed(selectedCustomer, activeBedId)} mins</strong></p>
                </div>
                {!customerHasEnoughMinutes(selectedCustomer, selectedMinutes, activeBedId) && <p style={{ color: '#ff7875', fontWeight: 'bold' }}>Not enough usable minutes for this bed. Please top up first.</p>}
              </>
            )}
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

  function renderBookingMinutesControl() {
    const selectedCustomer = getSelectedCustomer()
    const shopTestSelected = isShopTestCustomer(selectedCustomer) || isShopTestBooking(modalBooking)

    if (shopTestSelected) {
      return (
        <input
          type="number"
          min="1"
          step="1"
          value={selectedMinutes}
          onChange={(event) => setSelectedMinutes(event.target.value)}
          style={{ width: '100%', padding: '12px', marginBottom: '12px', boxSizing: 'border-box' }}
        />
      )
    }

    return (
      <select value={selectedMinutes} onChange={(e) => setSelectedMinutes(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '12px', boxSizing: 'border-box' }}>
        {getMinuteOptionsForBooking().map((minute) => <option key={minute} value={minute}>{minute} mins</option>)}
      </select>
    )
  }

  function renderProductCart() {
    return (
      <div style={{ background: '#0b0b0b', padding: '12px', borderRadius: '12px', border: '1px solid #333', marginTop: '10px' }}>
        {productCart.length === 0 ? (
          <p style={{ color: '#aaa' }}>No products added.</p>
        ) : (
          productCart.map((item) => (
            <div key={item.product_id} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #333', padding: '8px 0' }}>
              <span style={{ flex: '1 1 180px', minWidth: 0 }}>{item.product_name}<br /><small>£{Number(item.price || 0).toFixed(2)} — Stock {item.stock_quantity || 0}</small></span>
              <input type="number" value={item.quantity} min="0" onChange={(e) => updateProductCartQuantity(item.product_id, e.target.value)} style={{ flex: '0 1 80px', width: '80px', padding: '8px', boxSizing: 'border-box' }} />
              <strong style={{ flex: '0 0 auto' }}>£{(Number(item.price || 0) * Number(item.quantity || 0)).toFixed(2)}</strong>
              <button type="button" onClick={() => updateProductCartQuantity(item.product_id, 0)} style={{ flex: '0 1 auto', padding: '8px 10px' }}>Remove</button>
            </div>
          ))
        )}
        <p>Total products: <strong>£{getProductCartTotal().toFixed(2)}</strong></p>
      </div>
    )
  }

  function renderProductPicker() {
    const activeProducts = getActiveProducts()
    const filteredProducts = bookingProductCategoryFilter
      ? activeProducts.filter((product) => product.category === bookingProductCategoryFilter)
      : activeProducts

    return (
      <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '12px', padding: '12px', marginTop: '12px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '10px' }}>Add Products</h3>
        {productLoadError && <p style={{ color: '#ff7875', fontWeight: 'bold' }}>{productLoadError}</p>}
        {activeProducts.length === 0 ? (
          <p style={{ color: '#aaa', marginBottom: 0 }}>No products available. Check Products table.</p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', alignItems: 'center' }}>
              <select
                value={bookingProductCategoryFilter}
                onChange={(e) => {
                  setBookingProductCategoryFilter(e.target.value)
                  setBookingProductId('')
                }}
                style={{ width: '100%', minWidth: 0, padding: '10px', boxSizing: 'border-box' }}
              >
                <option value="">All categories</option>
                {PRODUCT_CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>{category.label}</option>
                ))}
              </select>
              <select value={bookingProductId} onChange={(e) => setBookingProductId(e.target.value)} style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }}>
                <option value="">Select product...</option>
                {filteredProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} - £{Number(product.price || 0).toFixed(2)}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                step="1"
                value={bookingProductQuantity}
                onChange={(e) => setBookingProductQuantity(e.target.value)}
                style={{ width: '100%', minWidth: 0, padding: '10px', boxSizing: 'border-box' }}
              />
              <button type="button" onClick={addSelectedBookingProduct} style={{ width: '100%', minWidth: 0 }}>Add Product</button>
            </div>
            {filteredProducts.length === 0 && (
              <p style={{ color: '#aaa', margin: '8px 0 0' }}>No products in this category.</p>
            )}
            {bookingProductId && (
              <p style={{ color: '#aaa', margin: '8px 0 0', fontSize: '13px' }}>
                {(() => {
                  const selectedProduct = products.find((entry) => String(entry.id) === String(bookingProductId))
                  if (!selectedProduct) return ''
                  return `${getProductCategoryLabel(selectedProduct.category)} - Stock ${getProductStockQuantity(selectedProduct)} - ${getProductStockStatus(selectedProduct)}`
                })()}
              </p>
            )}
            {renderProductCart()}
            {productCart.length > 0 && <button type="button" onClick={clearProductCart} style={{ marginTop: '8px' }}>Clear Products</button>}
          </>
        )}
      </div>
    )
  }

  function renderBookingCheckoutActionRow() {
    const selectedCustomer = getSelectedCustomer()
    const selectedStaff = getSelectedStaffAsCustomer()

    if (!selectedCustomer || selectedStaff || isShopTestCustomer(selectedCustomer)) return null

    return (
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '15px', marginBottom: '12px' }}>
        <button
          type="button"
          onClick={() => setShowBookingTopUp(!showBookingTopUp)}
          style={{ flex: '1 1 170px' }}
        >
          {showBookingTopUp ? 'Hide Top Up Minutes' : 'Add / Top Up Minutes'}
        </button>

        <button
          type="button"
          onClick={() => { if (requireStaffSignIn()) setShowBookingProducts(!showBookingProducts) }}
          style={{ flex: '1 1 170px' }}
        >
          {showBookingProducts ? 'Hide Products' : 'Add Products'}
        </button>
      </div>
    )
  }

  function renderTopUpSection() {
    const selectedCustomer = getSelectedCustomer()
    const selectedStaff = getSelectedStaffAsCustomer()
    const purchase = getPurchaseDetails()
    const isCustom = purchase.isCustom

    if (!selectedCustomer || selectedStaff || isShopTestCustomer(selectedCustomer)) return null
    if (!showBookingTopUp) return null

    return (
      <div style={{ background: '#111', padding: '16px', borderRadius: '14px', marginTop: '0', marginBottom: '15px', border: '1px solid #333' }}>
        <h3 style={{ marginTop: 0 }}>Top up minutes</h3>
        <select value={purchaseOption} onChange={(e) => { setPurchaseOption(e.target.value); setTopUpMinutes(0) }} style={{ width: '100%', padding: '10px', marginBottom: '8px', boxSizing: 'border-box' }}>
          {Object.entries(PURCHASE_OPTIONS).map(([key, option]) => <option key={key} value={key}>{option.label}</option>)}
        </select>
        {isCustom ? (
          <input
            type="number"
            min="0"
            step="1"
            placeholder="Enter custom minutes to add"
            value={topUpMinutes}
            onChange={(e) => setTopUpMinutes(e.target.value)}
            style={{ width: '100%', padding: '10px', marginBottom: '8px', boxSizing: 'border-box' }}
          />
        ) : (
          <p style={{ margin: '8px 0' }}>Minutes to add: <strong>{purchase.minutes} mins</strong></p>
        )}
        <p style={{ margin: '8px 0 0' }}>Top-up cost: <strong>£{Number((Number(purchase.minutes || 0) > 0 ? purchase.total : 0) || 0).toFixed(2)}</strong></p>
      </div>
    )
  }

  function renderBookingProductsSection() {
    const selectedCustomer = getSelectedCustomer()
    const selectedStaff = getSelectedStaffAsCustomer()

    if (!selectedCustomer || selectedStaff || isShopTestCustomer(selectedCustomer)) return null
    if (!showBookingProducts) return null

    return renderProductPicker()
  }

  function renderSunbedCheckoutSummary() {
    const selectedCustomer = getSelectedCustomer()
    const selectedStaff = getSelectedStaffAsCustomer()
    if (!selectedCustomer || selectedStaff || isShopTestCustomer(selectedCustomer)) return null

    const summary = getSunbedCheckoutSummary(selectedCustomer)
    const changeDue = Math.max(0, Number(cashReceived || 0) - summary.grandTotal)

    return (
      <div style={{ background: '#0b0b0b', padding: '16px', borderRadius: '14px', marginTop: '0', marginBottom: '15px', border: '1px solid rgba(212,168,83,0.45)' }}>
        <h3 style={{ marginTop: 0 }}>Payment Summary</h3>
        <div style={{ display: 'grid', gap: '8px', marginBottom: '12px' }}>
          <p style={{ margin: 0 }}>Selected tanning session: <strong>{Number(selectedMinutes || 0)} mins</strong></p>
          <p style={{ margin: 0 }}>Top-up minutes cost: <strong>£{summary.topUpTotal.toFixed(2)}</strong></p>
          <p style={{ margin: 0 }}>Products total: <strong>£{summary.productsTotal.toFixed(2)}</strong></p>
          <p style={{ margin: 0, color: '#d4a853', fontWeight: 'bold' }}>Grand total to pay: £{summary.grandTotal.toFixed(2)}</p>
        </div>
        <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '8px', boxSizing: 'border-box' }}>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="other">Other</option>
        </select>
        <input placeholder="Payment notes optional" value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '8px', boxSizing: 'border-box' }} />
        {paymentMethod === 'cash' && summary.grandTotal > 0 && (
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: '12px', padding: '12px', marginTop: '4px' }}>
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
            <p style={{ margin: 0 }}>Change to give: <strong style={{ color: '#d4a853' }}>£{changeDue.toFixed(2)}</strong></p>
            {Number(cashReceived || 0) > 0 && Number(cashReceived || 0) < summary.grandTotal && (
              <p style={{ margin: '6px 0 0', color: '#ff7875', fontWeight: 'bold' }}>Cash given is less than the total.</p>
            )}
          </div>
        )}
        {summary.grandTotal <= 0 && <p style={{ margin: '8px 0 0', color: '#aaa' }}>No payment due for this checkout.</p>}
      </div>
    )
  }

  function renderCustomerImportPanel() {
    if (!showCustomerImport) return null

    return (
      <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '12px', padding: '14px', marginBottom: '15px' }}>
        <h3 style={{ marginTop: 0 }}>Import Customers</h3>
        <p style={{ color: '#aaa', marginTop: 0 }}>
          Upload CSV or XLSX with First name, Last name, Phone, Email, DOB, Standard minutes balance, Hybrid minutes balance, Salon terms accepted, ID checked, Notes, and Active/inactive.
        </p>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleCustomerImportFile}
            disabled={customerImportLoading || customerImportSaving}
            style={{ color: '#ddd' }}
          />
          <button type="button" onClick={resetCustomerImport} disabled={customerImportLoading || customerImportSaving}>Clear Import</button>
        </div>

        {customerImportLoading && <p style={{ color: '#d4a853', fontWeight: 'bold' }}>Reading import...</p>}
        {customerImportProgress && <p style={{ color: '#d4a853', fontWeight: 'bold' }}>{customerImportProgress}</p>}
        {customerImportError && <p style={{ color: '#ff7875', fontWeight: 'bold' }}>{customerImportError}</p>}

        {customerImportSummary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '12px' }}>
            <div style={{ background: '#111', border: '1px solid #333', borderRadius: '10px', padding: '10px' }}><span>Total customers found</span><h3>{customerImportSummary.total}</h3></div>
            <div style={{ background: '#111', border: '1px solid #333', borderRadius: '10px', padding: '10px' }}><span>New customers</span><h3>{customerImportSummary.newCount}</h3></div>
            <div style={{ background: '#111', border: '1px solid #333', borderRadius: '10px', padding: '10px' }}><span>Duplicate customers</span><h3>{customerImportSummary.duplicateCount}</h3></div>
            <div style={{ background: '#111', border: '1px solid #333', borderRadius: '10px', padding: '10px' }}><span>Invalid rows</span><h3>{customerImportSummary.invalidCount}</h3></div>
          </div>
        )}

        {customerImportRows.length > 0 && (
          <>
            <div style={{ maxHeight: '360px', overflowY: 'auto', border: '1px solid #333', borderRadius: '10px', marginBottom: '12px' }}>
              {customerImportRows.map((row) => (
                <div key={row.rowNumber} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(160px, 240px)', gap: '10px', alignItems: 'center', padding: '10px', borderBottom: '1px solid #222', background: row.invalidReasons.length ? '#1f1010' : row.duplicate ? '#1f1a10' : '#111' }}>
                  <div>
                    <strong>{row.payload.name || 'Unnamed customer'}</strong>
                    <br />
                    <span style={{ color: '#aaa' }}>
                      Row {row.rowNumber} — {row.payload.phone || 'No phone'} — {row.payload.email || 'No email'} — Standard {row.payload.standard_minutes_balance} / Hybrid {row.payload.hybrid_minutes_balance}
                    </span>
                    {row.duplicate && (
                      <p style={{ color: '#ffcc66', margin: '6px 0 0', fontWeight: 'bold' }}>
                        Customer already exists: {row.duplicate.name} ({row.duplicateReasons.join(', ')})
                      </p>
                    )}
                    {row.invalidReasons.length > 0 && (
                      <p style={{ color: '#ff7875', margin: '6px 0 0', fontWeight: 'bold' }}>
                        Invalid: {row.invalidReasons.join(', ')}
                      </p>
                    )}
                  </div>
                  <select
                    value={row.action}
                    disabled={row.invalidReasons.length > 0 || customerImportSaving}
                    onChange={(event) => updateCustomerImportAction(row.rowNumber, event.target.value)}
                    style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }}
                  >
                    {row.duplicate ? (
                      <>
                        <option value="skip">Skip</option>
                        <option value="update">Update existing customer</option>
                        <option value="new">Import as new</option>
                      </>
                    ) : (
                      <>
                        <option value="insert">Import as new</option>
                        <option value="skip">Skip</option>
                      </>
                    )}
                  </select>
                </div>
              ))}
            </div>

            <button type="button" onClick={saveCustomerImport} disabled={customerImportSaving || customerImportLoading}>
              {customerImportSaving ? 'Saving Import...' : 'Confirm Import'}
            </button>
          </>
        )}
      </div>
    )
  }

  function renderReceiptSummary(receipt) {
    const items = Array.isArray(receipt.items) ? receipt.items : []
    return (
      <div key={receipt.id} style={{ borderBottom: '1px solid #333', padding: '8px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <strong>{formatStatus(receipt.receipt_type)}</strong>
          <strong style={{ color: '#d4a853' }}>£{Number(receipt.total || 0).toFixed(2)}</strong>
        </div>
        <span style={{ color: '#aaa' }}>
          {receipt.created_at ? new Date(receipt.created_at).toLocaleString('en-GB') : ''} / {formatStatus(receipt.payment_method)} / {receipt.staff_name || 'No staff'}
        </span>
        <br />
        <span>{receipt.customer_name || 'Walk-in'}</span>
        {items.length > 0 && (
          <div style={{ color: '#aaa', marginTop: '4px' }}>
            {items.slice(0, 3).map((item, index) => (
              <div key={`${receipt.id}-item-${index}`}>{item.name || item.product_name || item.description || 'Item'} x {item.quantity || 1}</div>
            ))}
            {items.length > 3 && <div>+ {items.length - 3} more item(s)</div>}
          </div>
        )}
        <button onClick={() => copyReceipt(receipt)} style={{ marginTop: '6px' }}>Copy Receipt</button>
      </div>
    )
  }

  function renderAllCustomersList() {
    if (!showAllCustomersList) return null
    const allCustomers = getFilteredAllCustomers()

    return (
      <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '12px', padding: '14px', marginBottom: '15px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
          <h3 style={{ margin: 0 }}>All Customers</h3>
          <span style={{ color: '#aaa' }}>{allCustomers.length} shown / {customers.length} total</span>
        </div>
        <input
          placeholder="Filter by name, phone, email or postcode..."
          value={allCustomersSearch}
          onChange={(e) => setAllCustomersSearch(e.target.value)}
          style={{ width: '100%', padding: '12px', marginBottom: '10px', boxSizing: 'border-box' }}
        />
        <div style={{ maxHeight: '420px', overflowY: 'auto', overflowX: 'auto', border: '1px solid #333', borderRadius: '10px' }}>
          <div style={{ minWidth: '860px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1.4fr 0.7fr 0.7fr 0.8fr 0.9fr', gap: '8px', padding: '10px', background: '#111', color: '#d4a853', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 1 }}>
              <span>Customer</span>
              <span>Phone</span>
              <span>Email</span>
              <span>Standard</span>
              <span>Hybrid</span>
              <span>Postcode</span>
              <span>Warning</span>
            </div>
            {allCustomers.length === 0 ? (
              <div style={{ padding: '14px', color: '#aaa' }}>No customers found.</div>
            ) : allCustomers.map((customer) => {
              const warningLevel = getCustomerWarningLevel(customer)
              const warningStyle = getCustomerWarningStyle(warningLevel)
              return (
                <div
                  key={customer.id}
                  onClick={() => selectManagerCustomer(customer)}
                  style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1.4fr 0.7fr 0.7fr 0.8fr 0.9fr', gap: '8px', padding: '10px', borderTop: '1px solid #222', cursor: 'pointer', alignItems: 'center', background: String(selectedManagerCustomerId) === String(customer.id) ? '#17130b' : '#0b0b0b' }}
                >
                  <strong>{customer.name || 'Unnamed customer'}</strong>
                  <span style={{ color: '#ddd' }}>{customer.phone || '-'}</span>
                  <span style={{ color: '#ddd', overflowWrap: 'anywhere' }}>{customer.email || '-'}</span>
                  <span>{customer.standard_minutes_balance || 0}</span>
                  <span>{customer.hybrid_minutes_balance || 0}</span>
                  <span>{customer.postcode || '-'}</span>
                  <span style={{ color: customer.warning_flag ? warningStyle.color : '#777', fontWeight: customer.warning_flag ? 'bold' : 'normal' }}>
                    {customer.warning_flag ? formatStatus(warningLevel) : 'None'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
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
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={() => { setAddCustomerSuccess(''); setShowAddCustomerForm(!showAddCustomerForm) }}>{showAddCustomerForm ? 'Hide Add Customer' : 'Add New Customer'}</button>
            <button onClick={() => setShowAllCustomersList(!showAllCustomersList)}>{showAllCustomersList ? 'Hide All Customers' : 'All Customers'}</button>
            <button onClick={() => setShowCustomerImport(!showCustomerImport)}>{showCustomerImport ? 'Hide Import' : 'Import Customers'}</button>
            {selectedCustomer && <button onClick={clearCustomerManager}>Clear</button>}
          </div>
        </div>

        {addCustomerSuccess && (
          <div style={{ background: '#0b0b0b', border: '1px solid rgba(212,168,83,0.35)', borderRadius: '10px', padding: '10px 12px', color: '#d4a853', fontWeight: 'bold', marginBottom: '12px' }}>
            {addCustomerSuccess}
          </div>
        )}

        {showAddCustomerForm && (
          <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '12px', padding: '14px', marginBottom: '15px' }}>
            <h3 style={{ marginTop: 0 }}>Add New Customer</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '10px' }}>
              <input placeholder="First name" value={addCustomerFirstName} onChange={(e) => setAddCustomerFirstName(e.target.value)} style={{ padding: '10px' }} />
              <input placeholder="Last name" value={addCustomerLastName} onChange={(e) => setAddCustomerLastName(e.target.value)} style={{ padding: '10px' }} />
              <input placeholder="Phone number" value={addCustomerPhone} onChange={(e) => setAddCustomerPhone(e.target.value)} style={{ padding: '10px' }} />
              <input placeholder="Email" value={addCustomerEmail} onChange={(e) => setAddCustomerEmail(e.target.value)} style={{ padding: '10px' }} />
              <input type="date" value={addCustomerDateOfBirth} onChange={(e) => setAddCustomerDateOfBirth(e.target.value)} style={{ padding: '10px' }} />
              <input placeholder="Address" value={addCustomerAddress} onChange={(e) => setAddCustomerAddress(e.target.value)} style={{ padding: '10px' }} />
              <input placeholder="Postcode" value={addCustomerPostcode} onChange={(e) => setAddCustomerPostcode(e.target.value)} style={{ padding: '10px' }} />
              <input placeholder="Gender" value={addCustomerGender} onChange={(e) => setAddCustomerGender(e.target.value)} style={{ padding: '10px' }} />
              <input type="number" min="0" placeholder="Standard minutes balance" value={addCustomerStandardMinutes} onChange={(e) => setAddCustomerStandardMinutes(e.target.value)} style={{ padding: '10px' }} />
              <input type="number" min="0" placeholder="Hybrid minutes balance" value={addCustomerHybridMinutes} onChange={(e) => setAddCustomerHybridMinutes(e.target.value)} style={{ padding: '10px' }} />
            </div>
            <textarea placeholder="Notes" value={addCustomerNotes} onChange={(e) => setAddCustomerNotes(e.target.value)} style={{ width: '100%', minHeight: '70px', padding: '10px', marginBottom: '10px', background: '#111', color: 'white', border: '1px solid #333', borderRadius: '12px', fontFamily: 'inherit' }} />
            <div style={{ background: '#111', border: '1px solid #333', borderRadius: '12px', padding: '12px', marginBottom: '10px' }}>
              <label style={{ display: 'block', marginBottom: '8px' }}>
                <input type="checkbox" checked={addCustomerWarningFlag} onChange={(e) => setAddCustomerWarningFlag(e.target.checked)} style={{ marginRight: '8px' }} />
                Customer warning flag
              </label>
              <select value={addCustomerWarningLevel} onChange={(e) => setAddCustomerWarningLevel(e.target.value)} disabled={!addCustomerWarningFlag} style={{ width: '100%', padding: '10px', marginBottom: '8px' }}>
                <option value="none">None</option>
                <option value="caution">Caution</option>
                <option value="important">Important</option>
                <option value="banned">Banned</option>
              </select>
              <textarea placeholder="Warning note" value={addCustomerWarningNote} disabled={!addCustomerWarningFlag} onChange={(e) => setAddCustomerWarningNote(e.target.value)} style={{ width: '100%', minHeight: '60px', padding: '10px', background: '#0b0b0b', color: 'white', border: '1px solid #333', borderRadius: '10px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '10px' }}>
              <label><input type="checkbox" checked={addCustomerActive} onChange={(e) => setAddCustomerActive(e.target.checked)} style={{ marginRight: '8px' }} />Active</label>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button onClick={saveNewManagedCustomer} disabled={addCustomerSaving}>{addCustomerSaving ? 'Saving...' : 'Save New Customer'}</button>
              <button onClick={() => { clearAddCustomerForm(); setShowAddCustomerForm(false) }}>Cancel</button>
            </div>
          </div>
        )}

        {renderCustomerImportPanel()}
        {renderAllCustomersList()}

        <input placeholder="Search customer by name, phone or email..." value={customerManagerSearch} onChange={(e) => { setCustomerManagerSearch(e.target.value); setSelectedManagerCustomerId('') }} style={{ width: '100%', padding: '12px', marginBottom: '10px' }} />

        {customerManagerSearch && !selectedCustomer && filteredCustomers.length > 0 && (
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: '12px', marginBottom: '15px', maxHeight: '180px', overflowY: 'auto' }}>
            {filteredCustomers.map((customer) => (
              <div key={customer.id} onClick={() => selectManagerCustomer(customer)} style={{ padding: '12px', borderBottom: '1px solid #333', cursor: 'pointer' }}>
                <strong>{customer.name}</strong><br />
                <span style={{ color: '#aaa' }}>Standard {customer.standard_minutes_balance || 0} mins / Hybrid {customer.hybrid_minutes_balance || 0} mins {customer.phone ? ` / ${customer.phone}` : ''} {customer.email ? ` / ${customer.email}` : ''}</span>
                {customer.warning_flag && <span style={{ color: getCustomerWarningStyle(getCustomerWarningLevel(customer)).color, fontWeight: 'bold' }}> / {formatStatus(getCustomerWarningLevel(customer))}</span>}
              </div>
            ))}
          </div>
        )}

        {selectedCustomer && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '15px' }}>
              <div><label>First name</label><input value={managerFirstName} onChange={(e) => setManagerFirstName(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }} /></div>
              <div><label>Last name</label><input value={managerLastName} onChange={(e) => setManagerLastName(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }} /></div>
              <div><label>Phone</label><input value={managerPhone} onChange={(e) => setManagerPhone(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }} /></div>
              <div><label>Email</label><input value={managerEmail} onChange={(e) => setManagerEmail(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }} /></div>
              <div><label>Date of birth</label><input type="date" value={managerDateOfBirth} onChange={(e) => setManagerDateOfBirth(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }} /></div>
              <div><label>Gender</label><input value={managerGender} onChange={(e) => setManagerGender(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }} /></div>
              <div><label>Address</label><input value={managerAddress} onChange={(e) => setManagerAddress(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }} /></div>
              <div><label>Postcode</label><input value={managerPostcode} onChange={(e) => setManagerPostcode(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }} /></div>
              <div><label>Last patch test date</label><input type="date" value={managerLastPatchTestDate} onChange={(e) => setManagerLastPatchTestDate(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }} /></div>
            </div>

            <p style={{ color: managerDateOfBirth && calculateAge(managerDateOfBirth) < 18 ? '#ff7875' : '#aaa', fontWeight: managerDateOfBirth && calculateAge(managerDateOfBirth) < 18 ? 'bold' : 'normal' }}>
              {managerDateOfBirth ? `Age ${calculateAge(managerDateOfBirth)}` : 'DOB not recorded'}
            </p>
            {renderCustomerWarning(selectedCustomer)}

            <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '12px', padding: '12px', marginBottom: '15px' }}>
              {!managerTermsAccepted && <p style={{ color: '#ffcc66', fontWeight: 'bold', marginTop: 0 }}>Salon terms not accepted yet.</p>}
              {!managerIdChecked && <p style={{ color: '#ffcc66', fontWeight: 'bold' }}>ID check not recorded.</p>}
              <label style={{ display: 'block', marginBottom: '8px' }}>
                <input type="checkbox" checked={managerTermsAccepted} onChange={(e) => setManagerTermsAccepted(e.target.checked)} style={{ marginRight: '8px' }} />
                Salon Terms accepted
              </label>
              <label style={{ display: 'block' }}>
                <input type="checkbox" checked={managerIdChecked} onChange={(e) => setManagerIdChecked(e.target.checked)} style={{ marginRight: '8px' }} />
                ID checked
              </label>
              <label style={{ display: 'block', marginTop: '8px' }}>
                <input type="checkbox" checked={managerActive} onChange={(e) => setManagerActive(e.target.checked)} style={{ marginRight: '8px' }} />
                Active customer
              </label>
            </div>

            <div style={{ background: '#0b0b0b', border: `1px solid ${getCustomerWarningStyle(managerWarningLevel).border}`, borderRadius: '12px', padding: '12px', marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '8px' }}>
                <input type="checkbox" checked={managerWarningFlag} onChange={(e) => setManagerWarningFlag(e.target.checked)} style={{ marginRight: '8px' }} />
                Customer warning flag
              </label>
              <select value={managerWarningLevel} onChange={(e) => setManagerWarningLevel(e.target.value)} disabled={!managerWarningFlag} style={{ width: '100%', padding: '10px', marginBottom: '8px' }}>
                <option value="none">None</option>
                <option value="caution">Caution</option>
                <option value="important">Important</option>
                <option value="banned">Banned</option>
              </select>
              <textarea value={managerWarningNote} placeholder="Warning note" disabled={!managerWarningFlag} onChange={(e) => setManagerWarningNote(e.target.value)} style={{ width: '100%', minHeight: '70px', padding: '10px', background: '#111', color: 'white', border: '1px solid #333', borderRadius: '10px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              {managerWarningFlag && managerWarningLevel === 'banned' && <p style={{ color: '#ff7875', fontWeight: 'bold', marginBottom: 0 }}>Banned customers cannot be booked.</p>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '15px' }}>
              <div><label>Standard minutes</label><input type="number" value={managerStandardBalance} onChange={(e) => setManagerStandardBalance(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }} /><p style={{ color: '#aaa', marginTop: '6px' }}>For Bed 1 and Bed 3.</p></div>
              <div><label>Hybrid minutes</label><input type="number" value={managerHybridBalance} onChange={(e) => setManagerHybridBalance(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }} /><p style={{ color: '#aaa', marginTop: '6px' }}>Can be used on any bed.</p></div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label>Notes</label>
              <textarea value={managerNotes} onChange={(e) => setManagerNotes(e.target.value)} style={{ width: '100%', minHeight: '80px', padding: '10px', marginTop: '5px', background: '#111', color: 'white', border: '1px solid #333', borderRadius: '12px', fontFamily: 'inherit' }} />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label>Spray tan notes</label>
              <textarea value={managerSprayTanNotes} onChange={(e) => setManagerSprayTanNotes(e.target.value)} style={{ width: '100%', minHeight: '80px', padding: '10px', marginTop: '5px', background: '#111', color: 'white', border: '1px solid #333', borderRadius: '12px', fontFamily: 'inherit' }} />
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

            <div style={{ background: '#111', padding: '15px', borderRadius: '14px', border: '1px solid #333', maxHeight: '320px', overflowY: 'auto', marginBottom: '15px' }}>
              <h3 style={{ marginTop: 0 }}>Minute Transaction History</h3>
              {customerMinuteTransactions.length === 0 ? <p style={{ color: '#aaa' }}>No minute transactions found.</p> : customerMinuteTransactions.map((transaction) => (
                <div key={transaction.id} style={{ display: 'grid', gridTemplateColumns: '120px 110px 1fr', gap: '10px', borderBottom: '1px solid #333', padding: '8px 0', alignItems: 'start' }}>
                  <strong style={{ color: Number(transaction.minutes_changed || 0) < 0 ? '#ffcc66' : '#d4a853' }}>
                    {Number(transaction.minutes_changed || 0) > 0 ? '+' : ''}{Number(transaction.minutes_changed || 0)} mins
                  </strong>
                  <span>{formatStatus(transaction.minute_type)}<br />{formatStatus(transaction.transaction_type)}</span>
                  <span>
                    {Number(transaction.balance_before || 0)} → {Number(transaction.balance_after || 0)}
                    {transaction.staff_name ? ` / ${transaction.staff_name}` : ''}
                    <br />
                    <span style={{ color: '#aaa' }}>{transaction.created_at ? new Date(transaction.created_at).toLocaleString('en-GB') : ''}</span>
                    {transaction.notes && <><br /><span style={{ color: '#aaa' }}>{transaction.notes}</span></>}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ background: '#111', padding: '15px', borderRadius: '14px', border: '1px solid #333', maxHeight: '320px', overflowY: 'auto', marginBottom: '15px' }}>
              <h3 style={{ marginTop: 0 }}>Receipt History</h3>
              {customerReceipts.length === 0 ? <p style={{ color: '#aaa' }}>No receipts found.</p> : customerReceipts.map((receipt) => renderReceiptSummary(receipt))}
            </div>

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
    const summary = getDailyTakingsSummary()
    const startFloat = getCashUpStartFloatAmount()
    const movementTotals = getFloatMovementTotals()
    const actualCash = cashUpActualCash === '' ? 0 : Number(cashUpActualCash || 0)
    const expectedCash = Number(startFloat || 0) + Number(summary.cashTotal || 0) + Number(movementTotals.added || 0) - Number(movementTotals.removed || 0)
    const variance = actualCash - expectedCash
    const itemStyle = { background: '#0b0b0b', border: '1px solid #333', borderRadius: '14px', padding: '12px' }
    const locked = isCashUpLocked()
    const signedIn = Boolean(getCurrentStaffUser())
    const canEditCashUp = canEditSelectedCashUp()
    const cashUpBlockMessage = signedIn && !canEditCashUp ? explainCashUpEditBlock() : ''

    return renderCollapsibleSection(
      'Cash-Up',
      collapseCashUp,
      setCollapseCashUp,
      <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '14px', padding: '14px' }}>
        <h3 style={{ marginTop: 0 }}>Cash-Up — {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-GB')}</h3>
        {!signedIn && (
          <p style={{ color: '#ffcc66', fontWeight: 'bold', marginTop: 0 }}>
            Please sign in before entering float or completing cash up.
          </p>
        )}
        {cashUpLoadError && <p style={{ color: '#ffcc66' }}>Cash-up data could not be loaded: {cashUpLoadError}</p>}
        {floatMovementLoadError && <p style={{ color: '#ffcc66' }}>Float movements could not be loaded: {floatMovementLoadError}</p>}
        {locked && <p style={{ color: '#ffcc66', fontWeight: 'bold' }}>Cash-up is locked for this date. Manager access is required to make changes.</p>}
        {cashUpBlockMessage && <p style={{ color: '#ffcc66', fontWeight: 'bold' }}>{cashUpBlockMessage}</p>}

        <div style={{ border: '1px solid #333', borderRadius: '12px', padding: '12px', marginBottom: '12px' }}>
          <h3 style={{ marginTop: 0 }}>Start Day Float</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 260px) auto', gap: '10px', alignItems: 'center' }}>
            <input
              type="number"
              step="0.01"
              placeholder="Start of Day Cash Float"
              value={cashUpStartFloat}
              disabled={!canEditCashUp}
              onChange={(e) => setCashUpStartFloat(e.target.value)}
              style={{ padding: '10px' }}
            />
            <button onClick={saveStartDayFloat} disabled={cashFloatSaving || !canEditCashUp}>
              {cashFloatSaving ? 'Saving Float...' : 'Save Start Day Float'}
            </button>
          </div>
          {cashUpExistingRecord?.float_entered_by_staff && (
            <p style={{ color: '#aaa', marginBottom: 0 }}>
              Entered by {cashUpExistingRecord.float_entered_by_staff}
              {cashUpExistingRecord.float_entered_at ? ` on ${new Date(cashUpExistingRecord.float_entered_at).toLocaleString('en-GB')}` : ''}
            </p>
          )}
        </div>

        <div style={{ border: '1px solid #333', borderRadius: '12px', padding: '12px', marginBottom: '12px' }}>
          <h3 style={{ marginTop: 0 }}>Cash Float Movement</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', alignItems: 'center' }}>
            <select value={floatMovementType} disabled={!canEditCashUp || (floatMovementEditingId && !showManagerView)} onChange={(e) => setFloatMovementType(e.target.value)} style={{ padding: '10px' }}>
              <option value="added">Added</option>
              <option value="removed">Removed</option>
            </select>
            <input
              type="number"
              step="0.01"
              placeholder="Amount"
              value={floatMovementAmount}
              disabled={!canEditCashUp || (floatMovementEditingId && !showManagerView)}
              onChange={(e) => setFloatMovementAmount(e.target.value)}
              style={{ padding: '10px' }}
            />
            <input
              placeholder="Reason / notes"
              value={floatMovementNote}
              disabled={!canEditCashUp || (floatMovementEditingId && !showManagerView)}
              onChange={(e) => setFloatMovementNote(e.target.value)}
              style={{ padding: '10px' }}
            />
            <button onClick={saveFloatMovement} disabled={floatMovementSaving || !canEditCashUp || (floatMovementEditingId && !showManagerView)}>
              {floatMovementSaving ? 'Saving...' : floatMovementEditingId ? 'Save Movement' : 'Add Float Movement'}
            </button>
            {floatMovementEditingId && <button onClick={clearFloatMovementForm}>Cancel Edit</button>}
          </div>
          <p style={{ color: '#aaa', marginBottom: '8px' }}>
            Staff: <strong>{getCurrentStaffUser()?.name || 'Not signed in'}</strong>
          </p>
          <div style={{ maxHeight: '190px', overflowY: 'auto', border: '1px solid #333', borderRadius: '10px' }}>
            {floatMovements.length === 0 ? (
              <p style={{ color: '#aaa', margin: 0, padding: '10px' }}>No float movements recorded for this date.</p>
            ) : floatMovements.map((movement) => (
              <div key={movement.id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr auto auto', gap: '10px', alignItems: 'center', padding: '10px', borderBottom: '1px solid #222' }}>
                <span style={{ color: '#aaa' }}>{movement.created_at ? new Date(movement.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                <span>
                  <strong>{movement.staff_name || 'Staff'}</strong> - {formatStatus(movement.type)} GBP {Number(movement.amount || 0).toFixed(2)}<br />
                  <span style={{ color: '#aaa' }}>{movement.note}</span>
                </span>
                {showManagerView && <button onClick={() => editFloatMovement(movement)}>Edit</button>}
                {showManagerView && <button onClick={() => deleteFloatMovement(movement)}>Delete</button>}
              </div>
            ))}
          </div>
        </div>

        <h3>End of Day Cash Up</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '12px' }}>
          <div style={itemStyle}><span>Starting float</span><h2>£{startFloat.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Float added</span><h2>£{movementTotals.added.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Float removed</span><h2>£{movementTotals.removed.toFixed(2)}</h2></div>
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
            disabled={!canEditCashUp}
            onChange={(e) => setCashUpActualCash(e.target.value)}
            style={{ padding: '10px' }}
          />
          <input
            placeholder="Staff completing cash-up"
            value={cashUpManagerName}
            disabled={!canEditCashUp}
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
          disabled={!canEditCashUp}
          onChange={(e) => setCashUpVarianceNotes(e.target.value)}
          style={{ width: '100%', minHeight: '76px', padding: '10px', marginTop: '10px', background: '#111', color: 'white', border: '1px solid #333', borderRadius: '10px', boxSizing: 'border-box' }}
        />

        <button onClick={saveCashUp} disabled={cashUpCompleting || !canEditCashUp} style={{ marginTop: '10px' }}>
          {cashUpCompleting ? 'Completing Cash-Up...' : 'Complete Cash-Up'}
        </button>
        {showManagerView && cashUpExistingRecord?.id && (
          <button onClick={() => setCashUpLock(!locked)} style={{ marginTop: '10px', marginLeft: '10px' }}>
            {locked ? 'Manager Reopen Cash-Up' : 'Lock Cash-Up'}
          </button>
        )}
      </div>
    )
  }

  function renderCashUpLockConfirmModal() {
    if (!showCashUpLockConfirm) return null

    const summary = getDailyTakingsSummary()
    const startFloat = getCashUpStartFloatAmount()
    const movementTotals = getFloatMovementTotals()
    const expectedCash = Number(startFloat || 0) + Number(summary.cashTotal || 0) + Number(movementTotals.added || 0) - Number(movementTotals.removed || 0)
    const actualCash = Number(cashUpActualCash || 0)
    const variance = actualCash - expectedCash

    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px' }}>
        <div style={{ background: '#111', border: '1px solid rgba(212,168,83,0.4)', borderRadius: '12px', padding: '22px', width: '520px', maxWidth: '100%', boxShadow: '0 24px 70px rgba(0,0,0,0.68)' }}>
          <h2 style={{ marginTop: 0, color: '#d4a853' }}>Complete & Lock Cash-Up</h2>
          <p style={{ color: '#ffcc66', fontWeight: 'bold' }}>
            Are you sure you want to complete and lock today’s cash-up? Once locked, staff will not be able to edit today’s cash-up, float, or float movements. A manager will be required to reopen it.
          </p>
          <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '10px', padding: '12px', marginBottom: '14px' }}>
            <p style={{ margin: '0 0 6px' }}>Expected cash in till: <strong>£{expectedCash.toFixed(2)}</strong></p>
            <p style={{ margin: '0 0 6px' }}>Actual cash counted: <strong>£{actualCash.toFixed(2)}</strong></p>
            <p style={{ margin: 0 }}>Variance: <strong>£{variance.toFixed(2)}</strong></p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowCashUpLockConfirm(false)} disabled={cashUpCompleting}>Cancel</button>
            <button onClick={completeAndLockCashUp} disabled={cashUpCompleting}>
              {cashUpCompleting ? 'Completing...' : 'Yes, Complete & Lock Cash-Up'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  function renderExportsPanel() {
    if (!showManagerView) return null

    const dateLabel = new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-GB')
    const exportButtonStyle = { textAlign: 'left', padding: '12px' }

    return renderCollapsibleSection(
      'Exports / Backups',
      collapseExports,
      setCollapseExports,
      <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '14px', padding: '14px' }}>
        <p style={{ color: '#aaa', marginTop: 0 }}>
          Export CSV backups without changing salon data. Manager View access is required.
        </p>

        <h3 style={{ marginTop: 0 }}>Selected Date — {dateLabel}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '14px' }}>
          <button style={exportButtonStyle} onClick={() => exportSelectedDateTable('Bookings')}>Export Bookings CSV</button>
          <button style={exportButtonStyle} onClick={() => exportSelectedDateTable('Payments')}>Export Payments CSV</button>
          <button style={exportButtonStyle} onClick={() => exportSelectedDateTable('ProductSales')}>Export ProductSales CSV</button>
          <button style={exportButtonStyle} onClick={() => exportSelectedDateTable('CorrectionLogs')}>Export CorrectionLogs CSV</button>
          <button style={exportButtonStyle} onClick={() => exportSelectedDateTable('CashUps')}>Export CashUps CSV</button>
        </div>

        <h3>Customers</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
          <button style={exportButtonStyle} onClick={exportCustomersCsv}>
            Export Customers with Balances / Terms / ID Status
          </button>
        </div>
      </div>
    )
  }

  function renderWixBookingSyncPanel() {
    if (!showManagerView) return null

    return renderCollapsibleSection(
      'Wix Booking Sync',
      collapseWixSync,
      setCollapseWixSync,
      <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '14px', padding: '14px' }}>
        <p style={{ color: '#aaa', marginTop: 0 }}>
          Foundation only. Real Wix webhook data should be verified in a Vercel API route before calling the Wix booking helpers.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '14px' }}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: '10px', padding: '12px' }}>
            <span>Last sync status</span>
            <h3 style={{ marginBottom: 0 }}>{wixSyncStatus}</h3>
          </div>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: '10px', padding: '12px' }}>
            <span>Imported bookings</span>
            <h3 style={{ marginBottom: 0 }}>{wixImportedCount}</h3>
          </div>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: '10px', padding: '12px' }}>
            <span>Failed bookings</span>
            <h3 style={{ marginBottom: 0 }}>{wixFailedCount}</h3>
          </div>
        </div>
        <button onClick={runWixTestImport} disabled={wixSyncRunning}>
          {wixSyncRunning ? 'Testing Import...' : 'Test Import'}
        </button>
        <p style={{ color: '#aaa', marginBottom: 0 }}>
          Test Import creates or updates one sample pending spray tan booking for the selected date using a fixed Wix booking ID.
        </p>
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

  function renderReceiptHistoryPanel() {
    if (!showManagerView) return null

    return renderCollapsibleSection(
      'Receipt History',
      collapseReceipts,
      setCollapseReceipts,
      <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '14px', padding: '14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '12px' }}>
          <input type="date" value={receiptSearchDate} onChange={(e) => setReceiptSearchDate(e.target.value)} style={{ padding: '10px' }} />
          <input placeholder="Customer name" value={receiptSearchCustomer} onChange={(e) => setReceiptSearchCustomer(e.target.value)} style={{ padding: '10px' }} />
          <select value={receiptSearchType} onChange={(e) => setReceiptSearchType(e.target.value)} style={{ padding: '10px' }}>
            <option value="">All receipt types</option>
            <option value="minutes_topup">Minutes Top-Up</option>
            <option value="minutes_topup_with_products">Minutes + Products</option>
            <option value="product_sale">Product Sale</option>
            <option value="spray_tan_deposit">Spray Tan Deposit</option>
            <option value="spray_tan_balance_payment">Spray Tan Balance</option>
            <option value="correction">Correction</option>
          </select>
          <select value={receiptSearchPaymentMethod} onChange={(e) => setReceiptSearchPaymentMethod(e.target.value)} style={{ padding: '10px' }}>
            <option value="">All payment methods</option>
            <option value="card">Card</option>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="other">Other</option>
            <option value="not_recorded">Not Recorded</option>
          </select>
          <button onClick={searchReceipts} disabled={receiptSearchLoading}>{receiptSearchLoading ? 'Searching...' : 'Search Receipts'}</button>
        </div>
        {receiptSearchError && <p style={{ color: '#ff7875', fontWeight: 'bold' }}>{receiptSearchError}</p>}
        <div style={{ maxHeight: '420px', overflowY: 'auto', border: '1px solid #333', borderRadius: '12px', padding: '10px', background: '#111' }}>
          {managerReceipts.length === 0 ? <p style={{ color: '#aaa' }}>No receipts loaded.</p> : managerReceipts.map((receipt) => renderReceiptSummary(receipt))}
        </div>
      </div>
    )
  }

  function renderSaleReceiptModal() {
    if (!saleReceipt) return null

    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#1e1e1e', padding: '24px', borderRadius: '18px', width: '460px', maxWidth: '92%', maxHeight: '85vh', overflowY: 'auto', border: '1px solid rgba(212,168,83,0.35)' }}>
          <div style={{ textAlign: 'center', borderBottom: '1px solid #333', paddingBottom: '12px', marginBottom: '14px' }}>
            <h2 style={{ margin: 0, color: '#d4a853' }}>Glow Tanning</h2>
            <p style={{ margin: '6px 0 0', color: '#aaa' }}>Sale Summary</p>
          </div>

          <p><strong>Date/time:</strong> {new Date(saleReceipt.dateTime).toLocaleString('en-GB')}</p>
          <p><strong>Staff:</strong> {saleReceipt.staffName}</p>
          <p><strong>Customer:</strong> {saleReceipt.customerName}</p>

          {(saleReceipt.packageName || saleReceipt.minutes > 0) && (
            <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '12px', padding: '12px', marginBottom: '10px' }}>
              <strong>Minutes / Package</strong>
              <p style={{ margin: '8px 0 0' }}>{saleReceipt.packageName || 'Minutes sale'}</p>
              <p style={{ margin: '4px 0 0' }}>{saleReceipt.minutes || 0} mins</p>
            </div>
          )}

          <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '12px', padding: '12px', marginBottom: '10px' }}>
            <strong>Products</strong>
            {saleReceipt.products.length === 0 ? (
              <p style={{ margin: '8px 0 0', color: '#aaa' }}>No products purchased.</p>
            ) : (
              saleReceipt.products.map((item, index) => (
                <div key={`${item.product_name}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', borderBottom: '1px solid #222', padding: '8px 0' }}>
                  <span>{item.product_name} x {item.quantity}</span>
                  <strong>£{Number(item.total_amount || 0).toFixed(2)}</strong>
                </div>
              ))
            )}
          </div>

          <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '12px', padding: '12px' }}>
            <p><strong>Payment method:</strong> {formatStatus(saleReceipt.paymentMethod)}</p>
            <p><strong>Total paid:</strong> £{Number(saleReceipt.totalPaid || 0).toFixed(2)}</p>
            <p><strong>Cash received:</strong> £{Number(saleReceipt.cashReceived || 0).toFixed(2)}</p>
            <p><strong>Change given:</strong> £{Number(saleReceipt.changeGiven || 0).toFixed(2)}</p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '14px' }}>
            <button onClick={printReceipt}>Print Receipt</button>
            <button onClick={() => setSaleReceipt(null)}>Close</button>
          </div>
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

  function renderStaffScheduleEntry(entry, showActions = false) {
    return (
      <div key={entry.id} style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '10px', padding: '10px', marginBottom: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <strong>{entry.staff_name || 'Shop'}</strong>
          <span style={{ color: entry.is_available === false ? '#ff7875' : '#d4a853', fontWeight: 'bold' }}>
            {entry.is_available === false ? 'Unavailable' : 'Available'}
          </span>
        </div>
        <p style={{ margin: '6px 0', color: '#ddd' }}>
          {entry.start_time || '--:--'} - {entry.end_time || '--:--'} · {getStaffScheduleTypeLabel(entry.schedule_type)} · {getStaffServiceTypeLabel(entry.service_type)}
        </p>
        {entry.notes && <p style={{ margin: '6px 0 0', color: '#aaa' }}>{entry.notes}</p>}
        {showActions && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
            <button onClick={() => editStaffScheduleEntry(entry)}>Edit</button>
            <button onClick={() => deleteStaffScheduleEntry(entry)}>Delete</button>
          </div>
        )}
      </div>
    )
  }

  function renderStaffOwnSchedulePanel() {
    const currentStaff = getCurrentStaffUser()
    if (!currentStaff || showManagerView) return null
    const entries = getCurrentStaffScheduleForSelectedDate()
    if (entries.length === 0 && !staffScheduleLoadError) return null

    return (
      <div style={{ background: '#111', border: '1px solid rgba(212,168,83,0.25)', borderRadius: '14px', padding: '14px', marginBottom: '18px' }}>
        <h3 style={{ marginTop: 0 }}>My Schedule Today</h3>
        {staffScheduleLoadError ? (
          <p style={{ color: '#ffcc66', marginBottom: 0 }}>Staff Calendar is not available yet.</p>
        ) : entries.map((entry) => renderStaffScheduleEntry(entry, false))}
      </div>
    )
  }

  function renderStaffCalendarPanel() {
    if (!showManagerView) return null

    const weekDates = getWeekDates(selectedDate)
    const filteredEntries = getFilteredStaffSchedule()
    const sprayTanArtistCount = getAvailableSprayTanArtists(selectedDate).length

    return renderCollapsibleSection(
      'Staff Calendar',
      collapseStaffCalendar,
      setCollapseStaffCalendar,
      <div>
        {staffScheduleLoadError && <p style={{ color: '#ff7875' }}>{staffScheduleLoadError}</p>}

        <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '14px', padding: '14px', marginBottom: '14px' }}>
          <h3 style={{ marginTop: 0 }}>{staffScheduleEditingId ? 'Edit Schedule Entry' : 'Add Schedule Entry'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
            <select value={staffScheduleStaffId} onChange={(e) => setStaffScheduleStaffId(e.target.value)} disabled={staffScheduleType === 'shop_closed'} style={{ padding: '10px' }}>
              <option value="">Staff member</option>
              {staff.filter((member) => member.is_active !== false).map((member) => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </select>
            <input type="date" value={staffScheduleDate} onChange={(e) => setStaffScheduleDate(e.target.value)} style={{ padding: '10px' }} />
            <input type="time" value={staffScheduleStartTime} onChange={(e) => setStaffScheduleStartTime(e.target.value)} style={{ padding: '10px' }} />
            <input type="time" value={staffScheduleEndTime} onChange={(e) => setStaffScheduleEndTime(e.target.value)} style={{ padding: '10px' }} />
            <select value={staffScheduleType} onChange={(e) => setStaffScheduleType(e.target.value)} style={{ padding: '10px' }}>
              {STAFF_SCHEDULE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
            <select value={staffScheduleServiceType} onChange={(e) => setStaffScheduleServiceType(e.target.value)} style={{ padding: '10px' }}>
              {STAFF_SERVICE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </div>
          <textarea
            placeholder="Notes for this staff member/day"
            value={staffScheduleNotes}
            onChange={(e) => setStaffScheduleNotes(e.target.value)}
            style={{ width: '100%', minHeight: '70px', padding: '10px', marginTop: '10px', background: '#111', color: 'white', border: '1px solid #333', borderRadius: '10px', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />
          <label style={{ display: 'block', marginTop: '10px' }}>
            <input type="checkbox" checked={staffScheduleAvailable} onChange={(e) => setStaffScheduleAvailable(e.target.checked)} style={{ marginRight: '8px' }} />
            Available for this entry
          </label>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
            <button onClick={saveStaffScheduleEntry} disabled={staffScheduleSaving}>{staffScheduleSaving ? 'Saving...' : staffScheduleEditingId ? 'Save Entry' : 'Add Entry'}</button>
            {staffScheduleEditingId && <button onClick={clearStaffScheduleForm}>Cancel Edit</button>}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '14px' }}>
          <select value={staffScheduleFilterStaffId} onChange={(e) => setStaffScheduleFilterStaffId(e.target.value)} style={{ padding: '10px' }}>
            <option value="">All staff</option>
            {staff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
          <select value={staffScheduleFilterType} onChange={(e) => setStaffScheduleFilterType(e.target.value)} style={{ padding: '10px' }}>
            <option value="">All schedule types</option>
            {STAFF_SCHEDULE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
          <select value={staffScheduleFilterServiceType} onChange={(e) => setStaffScheduleFilterServiceType(e.target.value)} style={{ padding: '10px' }}>
            <option value="">All service types</option>
            {STAFF_SERVICE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </div>

        <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '12px', padding: '12px', marginBottom: '14px', color: '#aaa' }}>
          Spray tan artists available on selected date: <strong style={{ color: '#d4a853' }}>{sprayTanArtistCount}</strong>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <h3>Daily View</h3>
          {filteredEntries.filter((entry) => entry.schedule_date === selectedDate).length === 0 ? (
            <p style={{ color: '#aaa' }}>No schedule entries for this date.</p>
          ) : filteredEntries.filter((entry) => entry.schedule_date === selectedDate).map((entry) => renderStaffScheduleEntry(entry, true))}
        </div>

        <h3>Weekly View</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' }}>
          {weekDates.map((date) => {
            const dayEntries = filteredEntries.filter((entry) => entry.schedule_date === date)
            return (
              <div key={date} style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '12px', padding: '12px' }}>
                <strong>{new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}</strong>
                <div style={{ marginTop: '10px' }}>
                  {dayEntries.length === 0 ? <p style={{ color: '#666', margin: 0 }}>No entries</p> : dayEntries.map((entry) => renderStaffScheduleEntry(entry, true))}
                </div>
              </div>
            )
          })}
        </div>
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
            {PRODUCT_CATEGORIES.map((category) => (
              <option key={category.value} value={category.value}>{category.label}</option>
            ))}
          </select>
          <input type="number" step="0.01" placeholder="Price" value={productPrice} onChange={(e) => setProductPrice(e.target.value)} style={{ padding: '10px' }} />
          <input type="number" placeholder="Stock quantity" value={productStockQuantity} onChange={(e) => setProductStockQuantity(e.target.value)} style={{ padding: '10px' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ddd' }}>
            <input type="checkbox" checked={productIsActive} onChange={(e) => setProductIsActive(e.target.checked)} />
            Active
          </label>
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
            onChange={(e) => selectProductForManagement(e.target.value)}
            style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }}
          >
            <option value="">Select product...</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} — {getProductCategoryLabel(product.category)} — £{Number(product.price || 0).toFixed(2)} — Stock {getProductStockQuantity(product)} — {getProductStockStatus(product)} — {product.is_active === false ? 'Inactive' : 'Active'}
              </option>
            ))}
          </select>

          {selectedProduct && (
            <div style={{ marginTop: '12px', padding: '12px', background: '#111', borderRadius: '12px', border: '1px solid #333' }}>
              <div>
                <strong>{selectedProduct.name}</strong><br />
                <span>{getProductCategoryLabel(selectedProduct.category)} — £{Number(selectedProduct.price || 0).toFixed(2)} — Stock {getProductStockQuantity(selectedProduct)}</span><br />
                <span style={getProductStockStatusStyle(selectedProduct)}>{getProductStockStatus(selectedProduct)}</span><br />
                <span>Status: {selectedProduct.is_active === false ? 'Inactive' : 'Active'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', alignItems: 'center', marginTop: '12px' }}>
                <input placeholder="Product name" value={productName} onChange={(e) => setProductName(e.target.value)} style={{ padding: '10px' }} />
                <select value={productCategory} onChange={(e) => setProductCategory(e.target.value)} style={{ padding: '10px' }}>
                  {PRODUCT_CATEGORIES.map((category) => (
                    <option key={category.value} value={category.value}>{category.label}</option>
                  ))}
                </select>
                <input type="number" step="0.01" placeholder="Price" value={productPrice} onChange={(e) => setProductPrice(e.target.value)} style={{ padding: '10px' }} />
                <input type="number" placeholder="Stock quantity" value={productStockQuantity} onChange={(e) => setProductStockQuantity(e.target.value)} style={{ padding: '10px' }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ddd' }}>
                  <input type="checkbox" checked={productIsActive} onChange={(e) => setProductIsActive(e.target.checked)} />
                  Active
                </label>
                <button onClick={saveProduct}>Save Product Changes</button>
                <button onClick={() => deactivateProduct(selectedProduct)}>Deactivate</button>
              </div>
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
              {posPaymentMethod === 'cash' && (
                <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '12px', padding: '12px', marginBottom: '10px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>Cash received</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Enter cash given"
                    value={posCashReceived}
                    onChange={(e) => setPosCashReceived(e.target.value)}
                    style={{ width: '100%', padding: '10px', marginBottom: '8px', boxSizing: 'border-box' }}
                  />
                  <p style={{ margin: 0 }}>
                    Change to give:
                    <strong style={{ marginLeft: '6px', color: '#d4a853' }}>
                      £{Math.max(0, Number(posCashReceived || 0) - getProductCartTotal()).toFixed(2)}
                    </strong>
                  </p>
                </div>
              )}
              <button onClick={sellProductsOnly}>Record Product Sale</button>
              <button onClick={() => { setShowStandalonePOS(false); clearProductCart(); setPosCashReceived('') }} style={{ marginLeft: '10px' }}>Close</button>
            </div>
          </div>
        )}
      </>
    )
  }

  function renderSprayTanCalendarView() {
    const sprayTanBookings = getSprayTanBookingsForSelectedDate()
      .slice()
      .sort((a, b) => new Date(a.appointment_time) - new Date(b.appointment_time))

    const timelineSlots = generateTimeSlots('09:00', '20:00').filter((_, index) => index % 3 === 0)

    return (
      <div className="spraytan-view">
        <div className="calendar-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ marginBottom: '6px' }}>Spray Tans</h2>
            <p style={{ color: '#aaa', margin: 0 }}>Phase 1 calendar foundation. Wix sync, automation and artist availability will be connected later.</p>
          </div>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', marginBottom: '18px' }}>
          {SPRAY_TAN_SERVICES.map((service) => (
            <div key={service.name} style={{ background: '#111', border: '1px solid rgba(212,168,83,0.25)', borderRadius: '10px', padding: '12px' }}>
              <strong>{service.name}</strong>
              <p style={{ color: '#d4a853', margin: '6px 0 0', fontWeight: 'bold' }}>£{service.price.toFixed(2)}</p>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
          {SPRAY_TAN_STATUSES.map((status) => (
            <span key={status} style={getSprayTanStatusStyle(status)}>{status}</span>
          ))}
        </div>

        <div style={{ background: '#1e1e1e', border: '1px solid rgba(212,168,83,0.25)', borderRadius: '16px', padding: '16px', overflowX: 'auto' }}>
          <div style={{ minWidth: '760px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '12px', padding: '0 0 10px', color: '#d4a853', fontWeight: 'bold' }}>
              <span>Time</span>
              <span>Appointments</span>
            </div>

            {timelineSlots.map((time) => {
              const slotAppointments = sprayTanBookings.filter((booking) => getBookingStartTimeString(booking) === time)
              return (
                <div key={time} style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '12px', borderTop: '1px solid #333', padding: '10px 0', minHeight: '58px' }}>
                  <strong>{time}</strong>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {slotAppointments.length === 0 ? (
                      <span style={{ color: '#666' }}>No spray tan appointment</span>
                    ) : slotAppointments.map((booking) => {
                      const customer = getCustomerForBooking(booking)
                      const serviceName = booking.spraytan_service || 'Spray tan service'
                      const servicePrice = getSprayTanServicePrice(serviceName)
                      const depositRequired = Number(booking.deposit_required || 0)
                      const depositPaid = Number(booking.deposit_paid || 0)
                      const remainingBalance = Math.max(0, depositRequired - depositPaid)
                      const statusLabel = getSprayTanStatusLabel(booking)
                      const lastPatchTestDate = customer?.last_patch_test_date || booking.patch_test_date

                      return (
                        <div key={booking.id} style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '10px', padding: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                            <div>
                              <strong>{booking.customer_name || customer?.name || 'Spray tan customer'}</strong>
                              <p style={{ margin: '6px 0', color: '#aaa' }}>
                                {serviceName}{servicePrice ? ` - £${servicePrice.toFixed(2)}` : ''} · Artist: {booking.spraytan_artist || 'To assign'}
                              </p>
                            </div>
                            <span style={getSprayTanStatusStyle(statusLabel)}>{statusLabel}</span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginTop: '8px', color: '#ddd' }}>
                            <span>Deposit required: <strong>£{depositRequired.toFixed(2)}</strong></span>
                            <span>Deposit paid: <strong>£{depositPaid.toFixed(2)}</strong></span>
                            <span>Remaining: <strong>£{remainingBalance.toFixed(2)}</strong></span>
                          </div>
                          <label style={{ display: 'block', marginTop: '10px', color: booking.patch_test_completed ? '#9ccfae' : '#ffcc66' }}>
                            <input type="checkbox" checked={Boolean(booking.patch_test_completed)} readOnly style={{ marginRight: '8px' }} />
                            Patch test completed
                          </label>
                          {!booking.patch_test_completed && <p style={{ color: '#ffcc66', margin: '6px 0 0', fontWeight: 'bold' }}>Patch test not completed.</p>}
                          <p style={{ color: '#aaa', margin: '6px 0 0' }}>
                            Last patch test: {lastPatchTestDate ? new Date(lastPatchTestDate).toLocaleDateString('en-GB') : 'Not recorded'}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ background: '#111', border: '1px solid rgba(212,168,83,0.25)', borderRadius: '12px', padding: '12px', marginTop: '14px', color: '#aaa' }}>
          Artist availability support placeholder. This phase only prepares the structure and display fields.
        </div>
      </div>
    )
  }

  function renderManualSprayTanCalendarView() {
    const sprayTanBookings = getSprayTanBookingsForSelectedDate()
      .slice()
      .sort((a, b) => new Date(a.appointment_time) - new Date(b.appointment_time))
    const timelineSlots = generateTimeSlots('09:00', '20:00').filter((_, index) => index % 3 === 0)

    return (
      <div className="spraytan-view">
        <div className="calendar-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ marginBottom: '6px' }}>Spray Tans</h2>
            <p style={{ color: '#aaa', margin: 0 }}>Manual spray tan appointments are separate from the sunbed calendar.</p>
          </div>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', marginBottom: '18px' }}>
          {SPRAY_TAN_SERVICES.map((service) => (
            <div key={service.name} style={{ background: '#111', border: '1px solid rgba(212,168,83,0.25)', borderRadius: '10px', padding: '12px' }}>
              <strong>{service.name}</strong>
              <p style={{ color: '#d4a853', margin: '6px 0 0', fontWeight: 'bold' }}>£{service.price.toFixed(2)}</p>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
          {SPRAY_TAN_STATUSES.map((status) => (
            <span key={status} style={getSprayTanStatusStyle(status)}>{status}</span>
          ))}
        </div>

        <div style={{ background: '#1e1e1e', border: '1px solid rgba(212,168,83,0.25)', borderRadius: '16px', padding: '16px', overflowX: 'auto' }}>
          <div style={{ minWidth: '980px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '90px repeat(3, minmax(250px, 1fr))', gap: '10px', padding: '0 0 10px', color: '#d4a853', fontWeight: 'bold' }}>
              <span>Time</span>
              {SPRAY_TAN_COLUMNS.map((column) => <span key={column.value}>{column.label}</span>)}
            </div>

            {timelineSlots.map((time) => (
              <div key={time} style={{ display: 'grid', gridTemplateColumns: '90px repeat(3, minmax(250px, 1fr))', gap: '10px', borderTop: '1px solid #333', padding: '10px 0', minHeight: '82px' }}>
                <strong>{time}</strong>
                {SPRAY_TAN_COLUMNS.map((column) => {
                  const slotAppointments = sprayTanBookings.filter((booking) => getBookingStartTimeString(booking) === time && (booking.spraytan_column || 'spray_tan') === column.value)
                  return (
                    <div key={`${time}-${column.value}`} onClick={() => slotAppointments.length === 0 && openSprayTanSlot(time, column.value)} style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '10px', padding: '8px', cursor: slotAppointments.length === 0 ? 'pointer' : 'default', minHeight: '64px' }}>
                      {slotAppointments.length === 0 ? (
                        <span style={{ color: '#666' }}>+ Add {column.label}</span>
                      ) : slotAppointments.map((booking) => {
                        const customer = getCustomerForBooking(booking)
                        const serviceName = booking.spraytan_service || 'Spray tan service'
                        const servicePrice = getSprayTanServicePrice(serviceName)
                        const depositRequired = Number(booking.deposit_required || 0)
                        const depositPaid = Number(booking.deposit_paid || 0)
                        const balanceDue = Number(booking.spraytan_balance_due ?? Math.max(0, servicePrice - depositPaid))
                        const statusLabel = getSprayTanStatusLabel(booking)
                        const lastPatchTestDate = customer?.last_patch_test_date || booking.patch_test_date

                        return (
                          <div
                            key={booking.id}
                            onClick={(event) => {
                              event.stopPropagation()
                              openSprayTanBookingForEdit(booking)
                            }}
                            style={{ background: '#111', border: '1px solid rgba(212,168,83,0.22)', borderRadius: '8px', padding: '10px', marginBottom: '8px', cursor: 'pointer' }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                              <strong>{booking.customer_name || customer?.name || 'Spray tan customer'}</strong>
                              <span style={getSprayTanStatusStyle(statusLabel)}>{statusLabel}</span>
                            </div>
                            <p style={{ margin: '6px 0', color: '#aaa' }}>
                              {serviceName} · £{servicePrice.toFixed(2)} · {Number(booking.spraytan_duration_minutes || 0)} mins
                            </p>
                            <p style={{ margin: '4px 0', color: '#ddd' }}>
                              Deposit: £{depositPaid.toFixed(2)} / £{depositRequired.toFixed(2)} · Balance £{balanceDue.toFixed(2)}
                            </p>
                            <p style={{ margin: '4px 0', color: '#aaa' }}>Artist: {booking.spraytan_artist || 'To assign'}</p>
                            {serviceName !== 'Patch Test' && !booking.patch_test_completed && (
                              <p style={{ color: '#ffcc66', margin: '6px 0 0', fontWeight: 'bold' }}>
                                Patch test warning{lastPatchTestDate ? ` · Last ${new Date(lastPatchTestDate).toLocaleDateString('en-GB')}` : ''}
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  function renderSprayTanBookingModal() {
    if (!sprayTanModalOpen) return null

    const customer = getSelectedCustomer()
    const selectedStaff = getSelectedStaffAsCustomer()
    const servicePrice = getSprayTanServicePrice(sprayTanService)
    const depositRequired = sprayTanService === 'Patch Test' ? 0 : Number(sprayTanDepositRequired || getDefaultSprayTanDeposit(sprayTanService))
    const depositPaid = sprayTanService === 'Patch Test' ? 0 : Number(sprayTanDepositPaid || 0)
    const balanceDue = Math.max(0, servicePrice - depositPaid)
    const appointmentDateTime = new Date(`${sprayTanDate}T${sprayTanTime}`)
    const patchWarning = customer ? getPatchTestWarning(customer, appointmentDateTime, sprayTanService) : ''
    const latestPatchTestDate = customer ? getLatestCustomerPatchTestDate(customer.id) : null

    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px' }}>
        <div style={{ background: '#1e1e1e', padding: '24px', borderRadius: '16px', width: '620px', maxWidth: '94%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid rgba(212,168,83,0.35)' }}>
          <h2 style={{ marginTop: 0 }}>{sprayTanEditingBooking ? 'Edit Spray Tan Booking' : 'Create Spray Tan Booking'}</h2>
          <p style={{ color: '#aaa' }}>{getSprayTanColumnLabel(sprayTanSlot?.column || sprayTanColumn)} at {sprayTanSlot?.time || sprayTanTime}</p>

          {sprayTanEditingBooking ? (
            <div style={{ marginBottom: '12px' }}>
              <label>Customer name</label>
              <input
                value={sprayTanCustomerName}
                onChange={(e) => setSprayTanCustomerName(e.target.value)}
                style={{ width: '100%', padding: '12px', marginTop: '5px', boxSizing: 'border-box' }}
              />
            </div>
          ) : renderCustomerSearchBox()}
          {selectedStaff && <p style={{ color: '#ff7875', fontWeight: 'bold' }}>Spray tan bookings must be linked to a customer, not a staff free-minutes account.</p>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', marginBottom: '12px' }}>
            <div>
              <label>Service column</label>
              <select
                value={sprayTanColumn}
                onChange={(e) => {
                  const column = e.target.value
                  setSprayTanColumn(column)
                  if (column === 'patch_test') setSprayTanServiceWithDefaults('Patch Test')
                  if (column === 'express_tan') setSprayTanServiceWithDefaults('Express Tan')
                }}
                style={{ width: '100%', padding: '10px', marginTop: '5px' }}
              >
                {SPRAY_TAN_COLUMNS.map((column) => <option key={column.value} value={column.value}>{column.label}</option>)}
              </select>
            </div>
            <div>
              <label>Specific service / price</label>
              <select value={sprayTanService} onChange={(e) => setSprayTanServiceWithDefaults(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }}>
                {SPRAY_TAN_SERVICES.map((service) => <option key={service.name} value={service.name}>{service.name} - £{service.price.toFixed(2)}</option>)}
              </select>
            </div>
            <div><label>Date</label><input type="date" value={sprayTanDate} onChange={(e) => setSprayTanDate(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }} /></div>
            <div><label>Time</label><input type="time" value={sprayTanTime} onChange={(e) => setSprayTanTime(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }} /></div>
            <div><label>Duration</label><input type="number" min="5" value={sprayTanDuration} onChange={(e) => setSprayTanDuration(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }} /></div>
            <div><label>Artist</label><input value={sprayTanArtist} onChange={(e) => setSprayTanArtist(e.target.value)} placeholder="Artist name" style={{ width: '100%', padding: '10px', marginTop: '5px' }} /></div>
            <div><label>Deposit required</label><input type="number" step="0.01" value={depositRequired} disabled={sprayTanService === 'Patch Test'} onChange={(e) => setSprayTanDepositRequired(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }} /></div>
            <div><label>Deposit paid</label><input type="number" step="0.01" value={depositPaid} disabled={sprayTanService === 'Patch Test'} onChange={(e) => setSprayTanDepositPaid(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }} /></div>
            <div><label>Deposit status</label>
              <select value={sprayTanDepositStatus} onChange={(e) => setSprayTanDepositStatus(e.target.value)} disabled={sprayTanService === 'Patch Test'} style={{ width: '100%', padding: '10px', marginTop: '5px' }}>
                <option value="pending">Deposit Pending</option>
                <option value="paid">Deposit Paid</option>
                <option value="not_required">Not Required</option>
              </select>
            </div>
            <div><label>Booking status</label>
              <select
                value={sprayTanStatusControl}
                onChange={(e) => {
                  const nextStatus = e.target.value
                  setSprayTanStatusControl(nextStatus)
                  const fields = getSprayTanStatusFields(nextStatus, sprayTanDepositStatus)
                  setSprayTanApprovalStatus(fields.approval_status)
                  setSprayTanDepositStatus(fields.deposit_status)
                }}
                style={{ width: '100%', padding: '10px', marginTop: '5px' }}
              >
                {SPRAY_TAN_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
            <div><label>Patch test date</label><input type="date" value={sprayTanPatchTestDate} onChange={(e) => setSprayTanPatchTestDate(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }} /></div>
          </div>

          <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
            <p style={{ margin: '0 0 6px' }}>Service price: <strong>£{servicePrice.toFixed(2)}</strong></p>
            <p style={{ margin: '0 0 6px' }}>Balance due: <strong>£{balanceDue.toFixed(2)}</strong></p>
            <p style={{ margin: 0 }}>Deposit status: <strong>{formatStatus(sprayTanDepositStatus || getSprayTanDepositStatus(sprayTanService, depositRequired, depositPaid))}</strong></p>
          </div>

          <label style={{ display: 'block', marginBottom: '8px', color: sprayTanPatchCompleted ? '#9ccfae' : '#ffcc66' }}>
            <input type="checkbox" checked={sprayTanPatchCompleted} disabled={sprayTanService === 'Patch Test'} onChange={(e) => setSprayTanPatchCompleted(e.target.checked)} style={{ marginRight: '8px' }} />
            Patch test completed
          </label>
          {latestPatchTestDate && <p style={{ color: '#aaa', marginTop: 0 }}>Last patch test: {latestPatchTestDate.toLocaleDateString('en-GB')}</p>}
          {patchWarning && <p style={{ color: '#ffcc66', fontWeight: 'bold' }}>{patchWarning}</p>}

          <textarea
            placeholder="Spray tan notes"
            value={sprayTanNotes}
            onChange={(e) => setSprayTanNotes(e.target.value)}
            style={{ width: '100%', minHeight: '80px', padding: '10px', background: '#111', color: 'white', border: '1px solid #333', borderRadius: '10px', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '14px' }}>
            <button onClick={sprayTanEditingBooking ? saveSprayTanBookingEdits : createSprayTanBookingFromModal} disabled={sprayTanSaving}>
              {sprayTanSaving ? 'Saving...' : sprayTanEditingBooking ? 'Save Spray Tan Booking' : 'Create Spray Tan Booking'}
            </button>
            {sprayTanEditingBooking && <button onClick={cancelSprayTanBooking} disabled={sprayTanSaving}>Cancel Booking</button>}
            <button onClick={closeSprayTanModal} disabled={sprayTanSaving}>Cancel</button>
          </div>
        </div>
      </div>
    )
  }

  const upcomingBookings = getUpcomingBookingsWithin20Minutes()
  const currentStaffUser = getCurrentStaffUser()
  const modalCustomer = modalBooking ? getCustomerForBooking(modalBooking) : null
  const modalPhase = modalBooking ? getPhase(modalBooking) : ''
  const modalStartBlocked = modalBooking ? isStartBlockedByLiveSession(modalBooking) : false
  const selectedDateShopClosures = getShopClosuresForSelectedDate()

  return (
    <div className="glow-app-shell" style={{ padding: '24px', background: '#050505', minHeight: '100vh', color: 'white' }}>
      <div className="top-dashboard-header" style={{ display: 'grid', gridTemplateColumns: '180px 1fr auto auto', gap: '16px', alignItems: 'center', marginBottom: '24px' }}>
        <div className="glow-header" style={{ margin: 0, justifyContent: 'flex-start' }}>
          <img src="/logo.png" alt="Glow Tanning" style={{ height: '90px', objectFit: 'contain', filter: 'drop-shadow(0 0 20px rgba(255,200,50,0.35))' }} />
        </div>

        <div className="top-upcoming-panel" style={{ background: '#1e1e1e', border: '1px solid rgba(212,168,83,0.25)', borderRadius: '18px', padding: '14px' }}>
          <strong>Upcoming within 20 minutes</strong>
          {upcomingBookings.length === 0 ? <p style={{ color: '#aaa', margin: '8px 0 0' }}>No bookings due.</p> : (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
              {upcomingBookings.map((booking) => (
                <button key={booking.id} onClick={() => openBooking(booking)} style={{ background: getCalendarBookingColour(booking), color: 'white' }}>
                  {isWixBooking(booking) ? 'Wix ' : ''}{new Date(booking.appointment_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} {booking.customer_name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="top-action-panel" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div className="top-action-buttons">
            <button onClick={() => setShowCustomerManagement(!showCustomerManagement)}>{showCustomerManagement ? 'Hide Customers' : 'Customers'}</button>
            <button onClick={collapseCashUp ? openCashUpPanel : () => setCollapseCashUp(true)}>{collapseCashUp ? 'Cash Up' : 'Hide Cash Up'}</button>
            {showManagerView ? (
              <>
                <button onClick={() => setShowManagerView(false)}>Hide Manager View</button>
                <button onClick={lockManagerView}>Lock Manager View</button>
              </>
            ) : (
              <button onClick={openManagerView}>Manager View</button>
            )}
          </div>
          {currentStaffUser ? (
            <div className="top-staff-chip" style={{ background: '#111', border: '1px solid #333', borderRadius: '12px', padding: '10px' }}>
              <span>Signed in: <strong>{currentStaffUser.name}</strong></span>
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

      {(isOffline || dataLoadWarning) && (
        <div style={{ background: '#1e1e1e', border: '1px solid rgba(255,120,117,0.65)', borderRadius: '14px', padding: '12px 16px', color: '#ffcc66', fontWeight: 'bold', marginBottom: '18px' }}>
          {isOffline ? 'Connection lost — changes may not save' : dataLoadWarning}
        </div>
      )}

      {!currentStaffUser && (
        <div style={{ background: '#1e1e1e', border: '1px solid rgba(212,168,83,0.55)', borderRadius: '14px', padding: '12px 16px', color: '#ffcc66', fontWeight: 'bold', marginBottom: '18px' }}>
          Please sign in before creating bookings or using the till.
        </div>
      )}

      {selectedDateShopClosures.length > 0 && (
        <div style={{ background: '#1e1e1e', border: '1px solid rgba(255,204,102,0.65)', borderRadius: '14px', padding: '12px 16px', color: '#ffcc66', fontWeight: 'bold', marginBottom: '18px' }}>
          Shop closure note for {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-GB')}: {selectedDateShopClosures.map((entry) => entry.notes || 'Shop closed').join(' | ')}
        </div>
      )}

      {renderStaffOwnSchedulePanel()}
      {showCustomerManagement && renderCustomerManagementPanel()}
      {!collapseCashUp && <div id="cash-up-panel">{renderCashUpPanel()}</div>}
      {showManagerView && renderStaffCalendarPanel()}
      {showManagerView && renderStaffManagementPanel()}
      {showManagerView && renderMaintenancePanel()}
      {showManagerView && renderProductsManagementPanel()}
      {showManagerView && renderCorrectionsPanel()}
      {showManagerView && renderWixBookingSyncPanel()}
      {showManagerView && renderReceiptHistoryPanel()}
      {showManagerView && renderExportsPanel()}
      {showManagerView && renderDailyTakingsPanel()}

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <button onClick={() => setDashboardView('sunbeds')} style={{ background: dashboardView === 'sunbeds' ? '#d4a853' : '#111', color: dashboardView === 'sunbeds' ? '#050505' : 'white' }}>Sunbeds</button>
        <button onClick={() => setDashboardView('spraytan')} style={{ background: dashboardView === 'spraytan' ? '#d4a853' : '#111', color: dashboardView === 'spraytan' ? '#050505' : 'white' }}>Spray Tans</button>
      </div>

      {dashboardView === 'sunbeds' && (
        <>
      <h2 style={{ textAlign: 'center' }}>Sunbeds</h2>

      <div className="sunbeds-grid premium-sunbeds-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '40px' }}>
        {beds.map((bed) => {
          const liveSession = getLiveBedSession(bed.id)
          const booking = liveSession || getBookingForBed(bed.id)
          const phase = getPhase(booking)
          const liveBedLabel = liveSession ? (phase === 'Cooldown' ? 'COOLDOWN' : 'IN USE') : null

          return (
            <div key={bed.id} className="bed-card premium-bed-card" style={{ background: getBedColour(bed.id), padding: '25px', borderRadius: '20px' }}>
              <h2>{bed.name}</h2>
              <p>T-Max Room: {bed.tmax_room}</p>
              {bed.is_out_of_service && <h2>OUT OF SERVICE</h2>}
              {booking ? (
                <>
                  <p>Customer: <strong>{booking.customer_name}</strong></p>
                  <p>Minutes: <strong>{booking.minutes}</strong></p>
                  <p>Status: <strong>{liveBedLabel || phase}</strong></p>
                  {['Undressing', 'Running', 'Cooldown'].includes(phase) && <h1>{getRemainingTime(booking)}</h1>}
                </>
              ) : (
                <p><strong>{bed.is_out_of_service ? 'UNAVAILABLE' : liveBedLabel || 'AVAILABLE'}</strong></p>
              )}
            </div>
          )
        })}
      </div>

      <div className="calendar-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', marginBottom: '20px' }}>
        <h2>Daily Calendar</h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button onClick={jumpToNow}>Jump to Now</button>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
        </div>
      </div>

      <div className="calendar-shell" style={{ overflowX: 'auto', background: '#1e1e1e', borderRadius: '16px', padding: '20px' }}>
        <table className="calendar-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
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
                      <td key={bed.id} className={booking ? 'calendar-booking-cell' : 'calendar-empty-cell'} rowSpan={booking ? getTotalSlotCount(booking) : 1} onClick={() => booking ? openBooking(booking) : openEmptySlot(time, bed.id)} style={{ border: currentRow ? '2px solid #ff4d4f' : '1px solid #444', padding: '8px', minHeight: '40px', background: getCalendarCellBackground(booking, bed.id), cursor: 'pointer', verticalAlign: 'top' }}>
                        {booking ? (
                          <div>
                            <strong>{booking.customer_name}</strong><br />
                            {isWixBooking(booking) && <><span style={{ display: 'inline-block', color: '#050505', background: '#d4a853', borderRadius: '6px', padding: '2px 6px', fontSize: '11px', fontWeight: 'bold', margin: '3px 0' }}>Wix</span><br /></>}
                            {booking.minutes} mins<br />
                            Blocked: {getTotalBlockMinutes(booking)} mins<br />
                            <span style={getStatusChipStyle(getPhase(booking))}>{getPhase(booking)}</span>
                            {booking.customer_started_at && (
                              <>
                                <br />
                                Customer Started<br />
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
        </>
      )}

      {dashboardView === 'spraytan' && renderManualSprayTanCalendarView()}
      {renderSprayTanBookingModal()}

      {modalOpen && (
        <div className="booking-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div className="booking-modal-panel" style={{ background: '#1e1e1e', padding: '30px', borderRadius: '20px', width: '500px', maxWidth: '92%', maxHeight: '90vh', overflowY: 'auto' }}>
            {!modalBooking ? (
              <>
                <h2>Create Booking</h2>
                <p>{getBedName(modalSlot?.bedId)} at {modalSlot?.time}</p>
                {renderCustomerSearchBox()}
                {renderBookingMinutesControl()}
                <p>Total blocked time: <strong>{Number(selectedMinutes) + 6} mins</strong></p>
                {renderBookingCheckoutActionRow()}
                {renderTopUpSection()}
                {renderBookingProductsSection()}
                {renderSunbedCheckoutSummary()}

                <button
                  onClick={createBookingFromModal}
                  disabled={bookingSaving}
                >
                  {bookingSaving ? 'Saving...' : 'Complete Booking & Payment'}
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
                {renderBookingMinutesControl()}
                <p>Total blocked time: <strong>{Number(selectedMinutes) + 6} mins</strong></p>
                {renderBookingCheckoutActionRow()}
                {renderTopUpSection()}
                {renderBookingProductsSection()}
                {renderSunbedCheckoutSummary()}
                <button
                  onClick={saveEditedBooking}
                  disabled={bookingSaving}
                >
                  {bookingSaving ? 'Saving...' : 'Complete Booking & Payment'}
                </button>
                <button onClick={() => setEditMode(false)} style={{ marginLeft: '10px' }}>Cancel</button>
              </>
            ) : (
              <>
                <h2>{modalBooking.customer_name}</h2>
                <p>{getBedName(modalBooking.bed_id)}</p>
                <p>Appointment: {new Date(modalBooking.appointment_time).toLocaleString('en-GB')}</p>
                <p>Minutes: {modalBooking.minutes}</p>
                <p>Booking source: <strong>{isWixBooking(modalBooking) ? 'Wix' : 'Dashboard'}</strong></p>
                {modalBooking.wix_booking_id && <p>Wix booking ID: <strong>{modalBooking.wix_booking_id}</strong></p>}
                {modalBooking.wix_status && <p>Wix status: <strong>{formatStatus(modalBooking.wix_status)}</strong></p>}
                {modalBooking.wix_service_name && <p>Wix service: <strong>{modalBooking.wix_service_name}</strong></p>}
                {isStaffFreeBooking(modalBooking) ? (
                  <p>Staff free booking</p>
                ) : isShopTestBooking(modalBooking) ? (
                  <p style={{ color: '#d4a853', fontWeight: 'bold' }}>Internal / Free Use</p>
                ) : modalCustomer && (
                  <>
                    <p>Standard balance: <strong>{modalCustomer.standard_minutes_balance || 0} mins</strong></p>
                    <p>Hybrid balance: <strong>{modalCustomer.hybrid_minutes_balance || 0} mins</strong></p>
                  </>
                )}
                <p>Total blocked time: {getTotalBlockMinutes(modalBooking)} mins</p>
                <p>Status: <span style={getStatusChipStyle(modalPhase)}>{modalPhase}</span></p>
                {modalBooking.tmax_sent_at && <p>Time sent: {new Date(modalBooking.tmax_sent_at).toLocaleTimeString('en-GB')}</p>}
                {modalBooking.customer_started_at && <p><strong>Customer Started</strong></p>}
                {modalBooking.customer_started_at && <p>Customer started: {new Date(modalBooking.customer_started_at).toLocaleTimeString('en-GB')}</p>}
                {['Undressing', 'Running', 'Cooldown'].includes(modalPhase) && <h2>Remaining: {getRemainingTime(modalBooking)}</h2>}
                {modalStartBlocked && !modalBooking.booking_start && !['completed', 'no_show', 'force_stopped'].includes(String(modalBooking.status || '').toLowerCase()) && (
                  <p style={{ background: '#0b0b0b', border: '1px solid rgba(255,120,117,0.65)', borderRadius: '12px', padding: '10px', color: '#ffcc66', fontWeight: 'bold' }}>
                    This bed is currently in use or cooling down. Please wait until it is available before starting another session.
                  </p>
                )}
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '20px' }}>
                  {modalBooking.customer_id && !isStaffFreeBooking(modalBooking) && !isShopTestBooking(modalBooking) && (
                    <button onClick={() => openCustomerManagementFromBooking(modalBooking)}>View/Edit Customer</button>
                  )}

                  {!modalBooking.booking_start && !['completed', 'no_show', 'force_stopped'].includes(String(modalBooking.status || '').toLowerCase()) && (
                    <button
                      onClick={() => startSession(modalBooking)}
                      disabled={modalStartBlocked}
                    >
                      Send Time / Start Undress
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
      {renderSaleReceiptModal()}
      {renderCashUpLockConfirmModal()}

      {showBackToTop && (
        <button onClick={scrollToTop} title="Back to top" style={{ position: 'fixed', right: '24px', bottom: '24px', width: '58px', height: '58px', borderRadius: '50%', fontSize: '26px', zIndex: 1001 }}>
          ↑
        </button>
      )}
    </div>
  )
}

export default App
