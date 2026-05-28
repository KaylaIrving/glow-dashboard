import { Fragment, useEffect, useMemo, useState } from 'react'
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
  'Deposit Not Paid',
  'Deposit Pending',
  'Deposit Paid',
  'Completed',
  'Cancelled'
]

const STAFF_SCHEDULE_TYPES = [
  { value: 'shift', label: 'Shift' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'spray_tan_available', label: 'Spray Tan Available' }
]

const CASH_DENOMINATIONS = [
  { key: 'note50', label: '£50 notes', value: 50 },
  { key: 'note20', label: '£20 notes', value: 20 },
  { key: 'note10', label: '£10 notes', value: 10 },
  { key: 'note5', label: '£5 notes', value: 5 },
  { key: 'coin2', label: '£2 coins', value: 2 },
  { key: 'coin1', label: '£1 coins', value: 1 },
  { key: 'coin50p', label: '50p', value: 0.5 },
  { key: 'coin20p', label: '20p', value: 0.2 },
  { key: 'coin10p', label: '10p', value: 0.1 },
  { key: 'coin5p', label: '5p', value: 0.05 },
  { key: 'coin2p', label: '2p', value: 0.02 },
  { key: 'coin1p', label: '1p', value: 0.01 }
]

const EMPTY_CASH_DENOMINATIONS = CASH_DENOMINATIONS.reduce((totals, denomination) => {
  totals[denomination.key] = ''
  return totals
}, {})

const PRODUCT_CATEGORIES = [
  { value: 'tanning_lotions', label: 'Tanning Lotions' },
  { value: 'sachets', label: 'Sachets' },
  { value: 'bottles', label: 'Bottles' },
  { value: 'drinks', label: 'Drinks' },
  { value: 'other', label: 'Other' }
]

const PRODUCT_SUBCATEGORIES = ['Accelerator', 'Intensifier', 'Bronzer', 'Tingle']

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
  const [commissionStaffId, setCommissionStaffId] = useState('')
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
  const [sprayTanDepositPaymentMethod, setSprayTanDepositPaymentMethod] = useState('card')
  const [sprayTanDepositStatus, setSprayTanDepositStatus] = useState('not_paid')
  const [sprayTanBalancePaymentAmount, setSprayTanBalancePaymentAmount] = useState('')
  const [sprayTanBalancePaymentMethod, setSprayTanBalancePaymentMethod] = useState('card')
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
  const [collapseReports, setCollapseReports] = useState(true)
  const [collapsePromos, setCollapsePromos] = useState(true)
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
  const [managerMarketingConsent, setManagerMarketingConsent] = useState(false)
  const [managerHealthNotes, setManagerHealthNotes] = useState('')
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
  const [customerBookingsHistory, setCustomerBookingsHistory] = useState([])
  const [customerProductSalesHistory, setCustomerProductSalesHistory] = useState([])
  const [customerMinuteExpiries, setCustomerMinuteExpiries] = useState([])

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
  const [managerCorrectionCustomerSearch, setManagerCorrectionCustomerSearch] = useState('')

  const [dailyTakings, setDailyTakings] = useState([])
  const [dailyProductSales, setDailyProductSales] = useState([])
  const [dailyReportDate, setDailyReportDate] = useState(formatLocalDate(new Date()))
  const [dailyReportReceipts, setDailyReportReceipts] = useState([])
  const [dailyReportLoading, setDailyReportLoading] = useState(false)
  const [cashUpActualCash, setCashUpActualCash] = useState('')
  const [cashUpVarianceNotes, setCashUpVarianceNotes] = useState('')
  const [cashUpManagerName, setCashUpManagerName] = useState('')
  const [cashFloatSaving, setCashFloatSaving] = useState(false)
  const [cashUpCompleting, setCashUpCompleting] = useState(false)
  const [cashUpStartFloat, setCashUpStartFloat] = useState('')
  const [cashUpExistingRecord, setCashUpExistingRecord] = useState(null)
  const [cashUpLoadError, setCashUpLoadError] = useState('')
  const [cashDenominations, setCashDenominations] = useState(EMPTY_CASH_DENOMINATIONS)
  const [floatMovements, setFloatMovements] = useState([])
  const [floatMovementLoadError, setFloatMovementLoadError] = useState('')
  const [floatMovementType, setFloatMovementType] = useState('added')
  const [floatMovementAmount, setFloatMovementAmount] = useState('')
  const [floatMovementNote, setFloatMovementNote] = useState('')
  const [floatMovementStaffId, setFloatMovementStaffId] = useState('')
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
  const [staffScheduleModalOpen, setStaffScheduleModalOpen] = useState(false)
  const [staffScheduleEditingId, setStaffScheduleEditingId] = useState('')
  const [staffScheduleStaffId, setStaffScheduleStaffId] = useState('')
  const [staffScheduleDate, setStaffScheduleDate] = useState(formatLocalDate(new Date()))
  const [staffScheduleStartTime, setStaffScheduleStartTime] = useState('09:00')
  const [staffScheduleEndTime, setStaffScheduleEndTime] = useState('17:00')
  const [staffScheduleAllDay, setStaffScheduleAllDay] = useState(false)
  const [staffScheduleType, setStaffScheduleType] = useState('shift')
  const [staffScheduleNotes, setStaffScheduleNotes] = useState('')
  const [staffScheduleAvailable, setStaffScheduleAvailable] = useState(true)
  const [staffScheduleApprovalStatus, setStaffScheduleApprovalStatus] = useState('approved')
  const [staffScheduleFilterStaffId, setStaffScheduleFilterStaffId] = useState('')
  const [staffScheduleFilterType, setStaffScheduleFilterType] = useState('')

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
  const [productSubcategories, setProductSubcategories] = useState([])
  const [productCategories, setProductCategories] = useState(() => {
    try {
      const savedCategories = localStorage.getItem('glow_product_categories')
      const parsedCategories = savedCategories ? JSON.parse(savedCategories) : null
      if (Array.isArray(parsedCategories) && parsedCategories.length > 0) return parsedCategories
    } catch {
      // Keep default categories if browser storage is unavailable.
    }
    return PRODUCT_CATEGORIES
  })
  const [newProductCategoryName, setNewProductCategoryName] = useState('')
  const [productPrice, setProductPrice] = useState('')
  const [productStockQuantity, setProductStockQuantity] = useState('')
  const [productIsActive, setProductIsActive] = useState(true)
  const [productEditingId, setProductEditingId] = useState('')
  const [editProductName, setEditProductName] = useState('')
  const [editProductCategory, setEditProductCategory] = useState('sachets')
  const [editProductSubcategories, setEditProductSubcategories] = useState([])
  const [editProductPrice, setEditProductPrice] = useState('')
  const [editProductStockQuantity, setEditProductStockQuantity] = useState('')
  const [editProductIsActive, setEditProductIsActive] = useState(true)
  const [stockMovementType, setStockMovementType] = useState('restock')
  const [stockMovementQuantity, setStockMovementQuantity] = useState('')
  const [stockMovementNote, setStockMovementNote] = useState('')
  const [promos, setPromos] = useState([])
  const [promoLoadError, setPromoLoadError] = useState('')
  const [promoEditingId, setPromoEditingId] = useState('')
  const [promoName, setPromoName] = useState('')
  const [promoDescription, setPromoDescription] = useState('')
  const [promoPrice, setPromoPrice] = useState('')
  const [promoActive, setPromoActive] = useState(true)
  const [promoValidFrom, setPromoValidFrom] = useState('')
  const [promoValidTo, setPromoValidTo] = useState('')
  const [promoIncludedMinutes, setPromoIncludedMinutes] = useState('')
  const [promoBedType, setPromoBedType] = useState('any')
  const [promoChoiceGroups, setPromoChoiceGroups] = useState([])
  const [promoStaffNotes, setPromoStaffNotes] = useState('')
  const [promoMinutesExpiryDays, setPromoMinutesExpiryDays] = useState('')
  const [selectedPromoId, setSelectedPromoId] = useState('')
  const [promoProductChoices, setPromoProductChoices] = useState({})
  const [promoMinuteExpiryDisabled, setPromoMinuteExpiryDisabled] = useState(false)

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
  const [reportsStartDate, setReportsStartDate] = useState(formatLocalDate(new Date()))
  const [reportsEndDate, setReportsEndDate] = useState(formatLocalDate(new Date()))
  const [reportsCommissionPercent, setReportsCommissionPercent] = useState('10')
  const [reportsStaffFilter, setReportsStaffFilter] = useState('')
  const [reportsProductCommissionPercent, setReportsProductCommissionPercent] = useState('10')
  const [reportsSprayTanCommissionPercent, setReportsSprayTanCommissionPercent] = useState('10')
  const [reportsPromoCommissionPercent, setReportsPromoCommissionPercent] = useState('10')
  const [reportsFlatServiceCommission, setReportsFlatServiceCommission] = useState('0')
  const [managerReportsData, setManagerReportsData] = useState(null)
  const [managerReportsLoading, setManagerReportsLoading] = useState(false)
  const [managerReportsError, setManagerReportsError] = useState('')
  const [exportFromDate, setExportFromDate] = useState(formatLocalDate(new Date()))
  const [exportToDate, setExportToDate] = useState(formatLocalDate(new Date()))

  useEffect(() => {
    getBeds()
    getBookings()
    getCustomers()
    getStaff()
    getProducts()
    getPromos()
    getStaffSchedule()
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    autoCompleteFinishedSessions()
  }, [currentTime, bookings])

  useEffect(() => {
    const selectedCustomer = customers.find((customer) => customer.id === Number(selectedCustomerId || selectedManagerCustomerId))
    if (selectedCustomer) removeExpiredPromoMinutesForCustomers([selectedCustomer])
  }, [selectedCustomerId, selectedManagerCustomerId])

  useEffect(() => {
    try {
      localStorage.setItem('glow_product_categories', JSON.stringify(productCategories))
    } catch {
      // Category persistence is a browser convenience; product rows remain saved in Supabase.
    }
  }, [productCategories])

  useEffect(() => {
    const discoveredCategories = products
      .map((product) => product.category)
      .filter(Boolean)
      .map((category) => ({ value: String(category), label: formatStatus(category) }))

    setProductCategories((current) => {
      const mergedCategories = dedupeProductCategories([...current, ...discoveredCategories])
      if (JSON.stringify(mergedCategories) === JSON.stringify(current)) return current
      return mergedCategories
    })
  }, [products])

  useEffect(() => {
    getDailyTakings()
    getCashUpForSelectedDate()
    getFloatMovements()
    getStaffSchedule()
  }, [selectedDate])

  const dailyTakingsSummary = useMemo(() => {
    const base = {
      totalRevenue: 0,
      cardTotal: 0,
      cashTotal: 0,
      bankTransferTotal: 0,
      otherTotal: 0,
      totalMinutes: 0,
      paymentCount: 0,
      productRevenue: 0,
      minutesRevenue: 0,
      promoRevenue: 0,
      sprayTanRevenue: 0,
      sprayTanDepositRevenue: 0,
      sprayTanBalanceRevenue: 0,
      sunbedPackageRevenue: 0
    }
    for (const payment of dailyTakings) {
      const amount = Number(payment.total_amount || 0)
      const minutes = Number(payment.minutes_added || 0)
      const packageType = String(payment.package_type || '').toLowerCase()
      const packageName = String(payment.package_name || payment.bed_type || '').toLowerCase()
      base.totalRevenue += amount
      base.totalMinutes += minutes
      base.paymentCount += 1
      if (packageType === 'promo' || packageName.includes('promo')) {
        base.promoRevenue += amount
      } else if (packageType.includes('spray_tan') || packageName.includes('spray tan')) {
        base.sprayTanRevenue += amount
        if (packageType.includes('deposit')) base.sprayTanDepositRevenue += amount
        else if (packageType.includes('balance')) base.sprayTanBalanceRevenue += amount
      } else {
        base.minutesRevenue += amount
        base.sunbedPackageRevenue += amount
      }
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

  const cashDenominationTotal = useMemo(() => {
    return CASH_DENOMINATIONS.reduce((total, denomination) => {
      return total + (Number(cashDenominations[denomination.key] || 0) * denomination.value)
    }, 0)
  }, [cashDenominations])

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

  function moveSelectedWeek(direction) {
    const date = new Date(`${selectedDate}T00:00:00`)
    date.setDate(date.getDate() + direction * 7)
    setSelectedDate(formatLocalDate(date))
  }

  function getStaffScheduleTypeLabel(type) {
    return STAFF_SCHEDULE_TYPES.find((item) => item.value === type)?.label || formatStatus(type)
  }

  function formatStaffScheduleTime(time) {
    if (!time) return '--:--'
    return String(time).slice(0, 5)
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

    let customerRows = data || []
    const shopTestCustomer = customerRows.find((customer) => isShopTestCustomer(customer))
    if (!shopTestCustomer) {
      const ensuredShopTestCustomer = await ensureShopTestCustomer()
      if (ensuredShopTestCustomer) {
        customerRows = [...customerRows, ensuredShopTestCustomer].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      }
    }

    customerRows = await removeExpiredPromoMinutesForCustomers(customerRows)
    clearDataLoadWarning()
    setCustomers(customerRows)
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

  function normalizeStaffName(name) {
    return String(name || '').trim().toLowerCase()
  }

  function dedupeStaffByName(rows = []) {
    const byName = new Map()

    for (const member of rows) {
      const key = normalizeStaffName(member.name)
      if (!key) continue

      const existing = byName.get(key)
      if (!existing) {
        byName.set(key, member)
        continue
      }

      const memberActive = member.is_active !== false
      const existingActive = existing.is_active !== false
      if (memberActive && !existingActive) {
        byName.set(key, member)
        continue
      }

      if (memberActive === existingActive && Number(member.id || 0) < Number(existing.id || 0)) {
        byName.set(key, member)
      }
    }

    return Array.from(byName.values()).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  }

  async function getStaff() {
    const { data, error } = await supabase.from('Staff').select('*').order('name', { ascending: true })
    if (error) {
      setStaffLoadError(error.message || 'Could not load Staff table.')
      showDataLoadWarning('Staff accounts could not be loaded. Staff sign-in may be limited.', error)
      setStaff(dedupeStaffByName(DEFAULT_STAFF.map((member, index) => ({
        id: `default-${index}`,
        ...member,
        is_active: true,
        weekly_free_minutes_balance: WEEKLY_STAFF_FREE_MINUTES,
        last_weekly_reset_date: getWeekStartDateString()
      }))))
      return
    }

    setStaffLoadError('')
    clearDataLoadWarning()

    const loadedStaff = data || []
    const existingStaffNames = new Set(loadedStaff.map((member) => normalizeStaffName(member.name)).filter(Boolean))

    if (loadedStaff.length === 0) {
      const defaultStaffToInsert = DEFAULT_STAFF.filter((member) => !existingStaffNames.has(normalizeStaffName(member.name)))
      if (defaultStaffToInsert.length === 0) {
        setStaff([])
        return
      }
      await supabase.from('Staff').insert(defaultStaffToInsert.map((member) => ({
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
    const dedupedStaff = dedupeStaffByName(loadedStaff)

    for (const member of dedupedStaff) {
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
    setStaffScheduleModalOpen(false)
    setStaffScheduleEditingId('')
    setStaffScheduleStaffId('')
    setStaffScheduleDate(selectedDate)
    setStaffScheduleStartTime('09:00')
    setStaffScheduleEndTime('17:00')
    setStaffScheduleAllDay(false)
    setStaffScheduleType('shift')
    setStaffScheduleNotes('')
    setStaffScheduleAvailable(true)
    setStaffScheduleApprovalStatus(showManagerView ? 'approved' : 'pending')
  }

  function getStaffScheduleApprovalStatus(entry) {
    return String(entry?.approval_status || 'approved').toLowerCase()
  }

  function isApprovedStaffSchedule(entry) {
    return getStaffScheduleApprovalStatus(entry) === 'approved'
  }

  function canCurrentStaffEditScheduleEntry(entry) {
    if (!entry) return false
    if (showManagerView) return true
    const currentStaff = getCurrentStaffUser()
    if (!currentStaff) return false
    if (getStaffScheduleApprovalStatus(entry) !== 'pending') return false
    const createdBy = String(entry?.request_created_by || '').trim().toLowerCase()
    const currentName = String(currentStaff.name || '').trim().toLowerCase()
    return String(entry.staff_id) === String(currentStaff.id) || (createdBy && createdBy === currentName)
  }

  function editStaffScheduleEntry(entry) {
    if (!canCurrentStaffEditScheduleEntry(entry)) {
      alert('Only managers can edit this Staff Calendar entry.')
      return
    }
    setStaffScheduleEditingId(String(entry.id))
    setStaffScheduleStaffId(entry.staff_id ? String(entry.staff_id) : '')
    setStaffScheduleDate(entry.schedule_date || selectedDate)
    setStaffScheduleStartTime(formatStaffScheduleTime(entry.start_time) === '--:--' ? '09:00' : formatStaffScheduleTime(entry.start_time))
    setStaffScheduleEndTime(formatStaffScheduleTime(entry.end_time) === '--:--' ? '17:00' : formatStaffScheduleTime(entry.end_time))
    setStaffScheduleAllDay(String(entry.start_time || '').slice(0, 5) === '00:00' && String(entry.end_time || '').slice(0, 5) === '23:59')
    setStaffScheduleType(entry.schedule_type || 'shift')
    setStaffScheduleNotes(entry.notes || '')
    setStaffScheduleAvailable(entry.is_available !== false)
    setStaffScheduleApprovalStatus(getStaffScheduleApprovalStatus(entry))
    setStaffScheduleModalOpen(true)
  }

  function startStaffScheduleEntryForCell(member, date) {
    if (!requireStaffSignIn()) return

    setStaffScheduleEditingId('')
    setStaffScheduleStaffId(String(member.id))
    setStaffScheduleDate(date)
    setStaffScheduleStartTime('09:00')
    setStaffScheduleEndTime('17:00')
    setStaffScheduleAllDay(false)
    setStaffScheduleType('shift')
    setStaffScheduleServiceType('general')
    setStaffScheduleNotes('')
    setStaffScheduleAvailable(true)
    setStaffScheduleApprovalStatus(showManagerView ? 'approved' : 'pending')
    setCollapseStaffCalendar(false)
    setStaffScheduleModalOpen(true)
  }

  function getFilteredStaffSchedule() {
    return staffSchedule.filter((entry) => {
      if (staffScheduleFilterStaffId && String(entry.staff_id) !== String(staffScheduleFilterStaffId)) return false
      if (staffScheduleFilterType && entry.schedule_type !== staffScheduleFilterType) return false
      return true
    })
  }

  function getShopClosuresForSelectedDate() {
    return staffSchedule.filter((entry) => entry.schedule_date === selectedDate && entry.schedule_type === 'shop_closed' && isApprovedStaffSchedule(entry))
  }

  function getCurrentStaffScheduleForSelectedDate() {
    const currentStaff = getCurrentStaffUser()
    if (!currentStaff) return []
    return staffSchedule.filter((entry) => String(entry.staff_id) === String(currentStaff.id) && entry.schedule_date === selectedDate)
  }

  function getPendingStaffScheduleCount() {
    const currentStaff = getCurrentStaffUser()
    return staffSchedule.filter((entry) => {
      if (getStaffScheduleApprovalStatus(entry) !== 'pending') return false
      if (showManagerView) return true
      if (!currentStaff) return false
      return String(entry.staff_id) === String(currentStaff.id) || entry.request_created_by === currentStaff.name
    }).length
  }

  function getAvailableSprayTanArtists(date, time) {
    // TODO Spray tan approvals: use this helper when assigning/approving spray tan bookings.
    return staffSchedule.filter((entry) => {
      if (entry.schedule_date !== date) return false
      if (!isApprovedStaffSchedule(entry)) return false
      if (!['spray_tan_available', 'shift'].includes(entry.schedule_type)) return false
      if (entry.is_available === false) return false
      if (time && entry.start_time && entry.end_time) return entry.start_time <= time && entry.end_time >= time
      return true
    })
  }

  async function saveStaffScheduleEntry() {
    if (!requireStaffSignIn()) return
    const currentStaff = getCurrentStaffUser()
    const isManager = showManagerView

    const existingEntry = staffSchedule.find((entry) => String(entry.id) === String(staffScheduleEditingId))
    if (staffScheduleEditingId && !isManager && !canCurrentStaffEditScheduleEntry(existingEntry)) {
      alert('Only managers can edit this Staff Calendar entry.')
      return
    }

    if (!staffScheduleDate) {
      alert('Choose a schedule date.')
      return
    }

    if (!staffScheduleStaffId) {
      alert('Choose a staff member for this schedule entry.')
      return
    }

    const selectedMember = staff.find((member) => String(member.id) === String(staffScheduleStaffId)) || currentStaff
    const approvalStatus = isManager ? staffScheduleApprovalStatus || 'approved' : 'pending'
    const payload = {
      staff_id: Number(selectedMember?.id),
      staff_name: selectedMember?.name || '',
      schedule_date: staffScheduleDate,
      start_time: staffScheduleAllDay ? '00:00' : staffScheduleStartTime || null,
      end_time: staffScheduleAllDay ? '23:59' : staffScheduleEndTime || null,
      schedule_type: staffScheduleType,
      notes: staffScheduleNotes || null,
      is_available: isManager ? staffScheduleAvailable : false,
      approval_status: approvalStatus,
      approved_by: isManager && approvalStatus === 'approved' ? existingEntry?.approved_by || currentStaff?.name || null : null,
      approved_at: isManager && approvalStatus === 'approved' ? existingEntry?.approved_at || new Date().toISOString() : null,
      request_created_by: existingEntry?.request_created_by || currentStaff?.name || null
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
    const confirmed = window.confirm(`Delete schedule entry for ${entry.staff_name || 'the shop'} on ${entry.schedule_date}?`)
    if (!confirmed) return
    if (!canCurrentStaffEditScheduleEntry(entry)) {
      if (!requireManagerAccess('Manager PIN required to delete this Staff Calendar request:')) return
    }

    const { error } = await supabase.from('StaffSchedule').delete().eq('id', entry.id)
    if (error) {
      alert('Staff Calendar entry was not deleted. Please check the connection.')
      showDataLoadWarning('Staff Calendar delete failed.', error)
      console.log(error)
      return
    }

    setStaffSchedule((current) => current.filter((scheduleEntry) => String(scheduleEntry.id) !== String(entry.id)))
    if (String(staffScheduleEditingId) === String(entry.id)) clearStaffScheduleForm()
    await getStaffSchedule()
  }

  async function updateStaffScheduleApproval(entry, approvalStatus) {
    if (!requireStaffSignIn()) return
    if (!requireManagerAccess('Manager PIN required to approve or deny Staff Calendar requests:')) return

    const manager = getCurrentStaffUser()
    const updates = {
      approval_status: approvalStatus,
      approved_by: approvalStatus === 'approved' ? manager?.name || null : null,
      approved_at: approvalStatus === 'approved' ? new Date().toISOString() : null,
      is_available: approvalStatus === 'approved' ? entry.schedule_type !== 'holiday' : false
    }

    const { error } = await supabase.from('StaffSchedule').update(updates).eq('id', entry.id)
    if (error) {
      alert('Staff Calendar approval was not saved. Please check the connection.')
      showDataLoadWarning('Staff Calendar approval failed.', error)
      console.log(error)
      return
    }
    setStaffSchedule((current) => current.map((scheduleEntry) => (
      String(scheduleEntry.id) === String(entry.id) ? { ...scheduleEntry, ...updates } : scheduleEntry
    )))
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

  async function getPromos() {
    const { data, error } = await supabase.from('Promos').select('*').order('created_at', { ascending: false })
    if (error) {
      setPromoLoadError(error.message || 'Could not load Promos table.')
      setPromos([])
      return
    }
    setPromoLoadError('')
    setPromos(data || [])
  }

  async function getDailyTakings(dateOverride = selectedDate) {
    const dayStart = new Date(`${dateOverride}T00:00:00`)
    const dayEnd = new Date(`${dateOverride}T23:59:59.999`)
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

  async function getCashUpForSelectedDate(dateOverride = selectedDate) {
    const { data, error } = await supabase
      .from('CashUps')
      .select('*')
      .eq('cashup_date', dateOverride)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) {
      setCashUpLoadError(error.message || 'Could not load CashUps table.')
      showDataLoadWarning('Cash-up record could not be loaded. Please check the connection.', error)
      console.error('Cash-up load failed:', { table: 'CashUps', date: dateOverride, error })
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

  async function getFloatMovements(dateOverride = selectedDate) {
    const { data, error } = await supabase
      .from('FloatMovements')
      .select('*')
      .eq('date', dateOverride)
      .order('created_at', { ascending: false })

    if (error) {
      setFloatMovementLoadError(error.message || 'Could not load FloatMovements table.')
      showDataLoadWarning('Float movements could not be loaded. Please check the connection.', error)
      console.error('Float movements load failed:', { table: 'FloatMovements', date: dateOverride, error })
      setFloatMovements([])
      return
    }

    setFloatMovementLoadError('')
    setFloatMovements(data || [])
  }

  function getDailyTakingsSummary() {
    return dailyTakingsSummary
  }

  async function generateDailyTakingsReport() {
    setDailyReportLoading(true)
    setSelectedDate(dailyReportDate)
    await getDailyTakings(dailyReportDate)
    await getCashUpForSelectedDate(dailyReportDate)
    await getFloatMovements(dailyReportDate)

    const dayStart = new Date(`${dailyReportDate}T00:00:00`)
    const dayEnd = new Date(`${dailyReportDate}T23:59:59.999`)
    const { data, error } = await supabase
      .from('Receipts')
      .select('*')
      .gte('created_at', dayStart.toISOString())
      .lte('created_at', dayEnd.toISOString())
      .order('created_at', { ascending: false })
    setDailyReportLoading(false)

    if (error) {
      setDailyReportReceipts([])
      showDataLoadWarning('Daily receipt report data could not be loaded.', error)
      return
    }
    setDailyReportReceipts(data || [])
  }

  function getDailySprayTanReceiptTotal() {
    return dailyReportReceipts.reduce((total, receipt) => {
      const type = String(receipt.receipt_type || '').toLowerCase()
      if (!type.includes('spray')) return total
      return total + Number(receipt.total || 0)
    }, 0)
  }

  function copyDailyTakingsReport() {
    const summary = getDailyTakingsSummary()
    const lines = [
      `Glow Daily Takings - ${dailyReportDate}`,
      `Total revenue: GBP ${summary.totalRevenue.toFixed(2)}`,
      `Cash: GBP ${summary.cashTotal.toFixed(2)}`,
      `Card: GBP ${summary.cardTotal.toFixed(2)}`,
      `Bank transfer: GBP ${summary.bankTransferTotal.toFixed(2)}`,
      `Other: GBP ${summary.otherTotal.toFixed(2)}`,
      `Product sales: GBP ${summary.productRevenue.toFixed(2)}`,
      `Minutes sales: GBP ${summary.minutesRevenue.toFixed(2)}`,
      `Spray tan receipts: GBP ${getDailySprayTanReceiptTotal().toFixed(2)}`,
      `Payments/transactions: ${summary.paymentCount}`,
      `Cash-up completed by: ${cashUpExistingRecord?.cash_up_completed_by_staff || cashUpExistingRecord?.manager_name || 'Not recorded'}`
    ]
    navigator.clipboard?.writeText(lines.join('\n'))
    alert('Daily takings report copied.')
  }

  function exportDailyTakingsReport() {
    const summary = getDailyTakingsSummary()
    downloadCsv(`glow_daily_takings_${dailyReportDate}.csv`, [{
      date: dailyReportDate,
      total_revenue: summary.totalRevenue.toFixed(2),
      cash_total: summary.cashTotal.toFixed(2),
      card_total: summary.cardTotal.toFixed(2),
      bank_transfer_total: summary.bankTransferTotal.toFixed(2),
      other_total: summary.otherTotal.toFixed(2),
      product_sales_total: summary.productRevenue.toFixed(2),
      minutes_sales_total: summary.minutesRevenue.toFixed(2),
      spray_tan_receipts_total: getDailySprayTanReceiptTotal().toFixed(2),
      transactions: summary.paymentCount,
      cash_up_completed_by: cashUpExistingRecord?.cash_up_completed_by_staff || cashUpExistingRecord?.manager_name || ''
    }])
  }

  function getDateRangeBounds(startDate, endDate) {
    return {
      start: new Date(`${startDate}T00:00:00`).toISOString(),
      end: new Date(`${endDate}T23:59:59.999`).toISOString()
    }
  }

  function addGroupedAmount(map, key, amount, extra = {}) {
    if (!map.has(key)) map.set(key, { ...extra, quantity: 0, total: 0, count: 0 })
    const row = map.get(key)
    row.quantity += Number(extra.quantity || 0)
    row.total += Number(amount || 0)
    row.count += 1
    map.set(key, row)
  }

  async function generateManagerReports() {
    if (!requireStaffSignIn()) return
    if (!showManagerView && !requireManagerAccess('Manager PIN required for reports:')) return
    const { start, end } = getDateRangeBounds(reportsStartDate, reportsEndDate)
    setManagerReportsLoading(true)
    setManagerReportsError('')

    const [productSalesResult, paymentsResult, receiptsResult, cashUpsResult, bookingsResult, correctionsResult] = await Promise.all([
      supabase.from('ProductSales').select('*').gte('created_at', start).lte('created_at', end),
      supabase.from('Payments').select('*').gte('created_at', start).lte('created_at', end),
      supabase.from('Receipts').select('*').gte('created_at', start).lte('created_at', end),
      supabase.from('CashUps').select('*').gte('created_at', start).lte('created_at', end),
      supabase.from('Bookings').select('*').gte('appointment_time', start).lte('appointment_time', end),
      supabase.from('CorrectionLogs').select('*').gte('created_at', start).lte('created_at', end)
    ])

    setManagerReportsLoading(false)
    const requiredError = productSalesResult.error || paymentsResult.error || receiptsResult.error || cashUpsResult.error || bookingsResult.error
    if (requiredError) {
      setManagerReportsError(requiredError.message || 'Could not load one or more reports.')
      showDataLoadWarning('Manager reports could not be loaded.', requiredError)
      return
    }

    const productSales = productSalesResult.data || []
    const payments = paymentsResult.data || []
    const receipts = receiptsResult.data || []
    const cashUps = cashUpsResult.data || []
    const reportBookings = bookingsResult.data || []
    const corrections = correctionsResult.error ? [] : correctionsResult.data || []

    const productSalesByStaffMap = new Map()
    const productSummaryMap = new Map()
    for (const sale of productSales) {
      const staffName = sale.commission_staff_name || sale.sold_by_staff_name || sale.staff_name || sale.staff || sale.created_by || 'Unknown staff'
      const productName = sale.product_name || 'Unknown product'
      const category = sale.category || 'Uncategorised'
      const quantity = Number(sale.quantity || 0)
      const amount = Number(sale.total_amount || 0)
      addGroupedAmount(productSalesByStaffMap, `${staffName}__${productName}__${category}`, amount, { staff_name: staffName, product_name: productName, category, quantity })
      addGroupedAmount(productSummaryMap, `${productName}__${category}`, amount, { product_name: productName, category, quantity })
    }

    const productCommissionRate = Number(reportsProductCommissionPercent || reportsCommissionPercent || 0)
    const sprayTanCommissionRate = Number(reportsSprayTanCommissionPercent || reportsCommissionPercent || 0)
    const promoCommissionRate = Number(reportsPromoCommissionPercent || reportsCommissionPercent || 0)
    const flatServiceCommission = Number(reportsFlatServiceCommission || 0)
    const staffFilter = reportsStaffFilter.trim().toLowerCase()
    const staffCommissionMap = new Map()
    const getCommissionRow = (staffName) => {
      const name = staffName || 'Unknown staff'
      if (!staffCommissionMap.has(name)) {
        staffCommissionMap.set(name, {
          staff_name: name,
          sunbed_minutes_sold: 0,
          sunbed_packages_total: 0,
          product_sales_total: 0,
          promo_sales_total: 0,
          spray_tan_sales_total: 0,
          deposits_taken: 0,
          balances_taken: 0,
          total_revenue: 0,
          estimated_commission: 0
        })
      }
      return staffCommissionMap.get(name)
    }

    for (const sale of productSales) {
      const staffName = sale.commission_staff_name || sale.sold_by_staff_name || sale.staff_name || sale.staff || sale.created_by || 'Unknown staff'
      const amount = Number(sale.total_amount || 0)
      const row = getCommissionRow(staffName)
      row.product_sales_total += amount
      row.total_revenue += amount
      row.estimated_commission += amount * productCommissionRate / 100
    }

    const customerSpendMap = new Map()
    for (const payment of payments) {
      const customerName = payment.customer_name || 'Walk-in'
      if (!customerSpendMap.has(customerName)) customerSpendMap.set(customerName, { customer_name: customerName, minutes_topups: 0, product_purchases: 0, spray_tan_payments: 0, total: 0 })
      const row = customerSpendMap.get(customerName)
      row.minutes_topups += Number(payment.total_amount || 0)
      row.total += Number(payment.total_amount || 0)
    }
    for (const receipt of receipts) {
      const customerName = receipt.customer_name || 'Walk-in'
      if (!customerSpendMap.has(customerName)) customerSpendMap.set(customerName, { customer_name: customerName, minutes_topups: 0, product_purchases: 0, spray_tan_payments: 0, total: 0 })
      const row = customerSpendMap.get(customerName)
      const type = String(receipt.receipt_type || '').toLowerCase()
      if (type.includes('product')) row.product_purchases += Number(receipt.total || 0)
      if (type.includes('spray')) row.spray_tan_payments += Number(receipt.total || 0)
      row.total += Number(receipt.total || 0)
    }

    const minutesSales = payments.reduce((totals, payment) => {
      const minutes = Number(payment.minutes_added || 0)
      const amount = Number(payment.total_amount || 0)
      const label = String(payment.package_name || payment.bed_type || '').toLowerCase().includes('hybrid') ? 'hybrid' : 'standard'
      totals[label].minutes += minutes
      totals[label].revenue += amount
      return totals
    }, { standard: { minutes: 0, revenue: 0 }, hybrid: { minutes: 0, revenue: 0 } })

    const promoSalesMap = new Map()
    for (const payment of payments.filter((payment) => payment.package_type === 'promo' || String(payment.package_name || '').toLowerCase().includes('promo'))) {
      const promoName = payment.package_name || 'Promo'
      if (!promoSalesMap.has(promoName)) promoSalesMap.set(promoName, { promo_name: promoName, count: 0, minutes: 0, revenue: 0 })
      const row = promoSalesMap.get(promoName)
      row.count += 1
      row.minutes += Number(payment.minutes_added || 0)
      row.revenue += Number(payment.total_amount || 0)
    }

    for (const payment of payments) {
      const staffName = payment.commission_staff_name || payment.taken_by_staff_name || payment.staff_name || payment.created_by || 'Unknown staff'
      const row = getCommissionRow(staffName)
      const amount = Number(payment.total_amount || 0)
      const packageType = String(payment.package_type || '').toLowerCase()
      const packageName = String(payment.package_name || '').toLowerCase()
      if (packageType === 'promo' || packageName.includes('promo')) {
        row.promo_sales_total += amount
        row.total_revenue += amount
        row.estimated_commission += amount * promoCommissionRate / 100
      } else if (packageType.includes('spray_tan') || packageName.includes('spray tan')) {
        row.spray_tan_sales_total += amount
        if (packageType.includes('deposit')) row.deposits_taken += amount
        if (packageType.includes('balance')) row.balances_taken += amount
        row.total_revenue += amount
        row.estimated_commission += amount * sprayTanCommissionRate / 100 + flatServiceCommission
      } else {
        row.sunbed_minutes_sold += Number(payment.minutes_added || 0)
        row.sunbed_packages_total += amount
        row.total_revenue += amount
      }
    }

    const sprayTanMap = new Map()
    for (const booking of reportBookings.filter((booking) => booking.booking_type === 'spraytan')) {
      const service = booking.spraytan_service || 'Unknown service'
      if (!sprayTanMap.has(service)) sprayTanMap.set(service, { service, count: 0, pending: 0, completed: 0, cancelled: 0, deposits_paid: 0, balances_due: 0, artists: new Set() })
      const row = sprayTanMap.get(service)
      row.count += 1
      if (String(booking.approval_status || '').toLowerCase() === 'pending') row.pending += 1
      if (String(booking.approval_status || booking.status || '').toLowerCase() === 'completed') row.completed += 1
      if (String(booking.approval_status || booking.status || '').toLowerCase() === 'cancelled') row.cancelled += 1
      row.deposits_paid += Number(booking.deposit_paid || 0)
      row.balances_due += Number(booking.spraytan_balance_due || 0)
      if (booking.spraytan_artist) row.artists.add(booking.spraytan_artist)
    }

    const staffActivityMap = new Map()
    for (const booking of reportBookings) {
      const staffName = booking.created_by_staff_name || booking.staff_name || booking.created_by || 'Unknown staff'
      if (!staffActivityMap.has(staffName)) staffActivityMap.set(staffName, { staff_name: staffName, bookings: 0, product_sales: 0, cash_ups: 0, corrections: 0 })
      staffActivityMap.get(staffName).bookings += 1
    }
    for (const sale of productSales) {
      const staffName = sale.sold_by_staff_name || sale.staff_name || sale.staff || sale.created_by || 'Unknown staff'
      if (!staffActivityMap.has(staffName)) staffActivityMap.set(staffName, { staff_name: staffName, bookings: 0, product_sales: 0, cash_ups: 0, corrections: 0 })
      staffActivityMap.get(staffName).product_sales += Number(sale.total_amount || 0)
    }
    for (const cashUp of cashUps) {
      const staffName = cashUp.cash_up_completed_by_staff || cashUp.float_entered_by_staff || cashUp.manager_name || 'Unknown staff'
      if (!staffActivityMap.has(staffName)) staffActivityMap.set(staffName, { staff_name: staffName, bookings: 0, product_sales: 0, cash_ups: 0, corrections: 0 })
      staffActivityMap.get(staffName).cash_ups += 1
    }
    for (const correction of corrections) {
      const staffName = correction.staff_name || correction.created_by || 'Unknown staff'
      if (!staffActivityMap.has(staffName)) staffActivityMap.set(staffName, { staff_name: staffName, bookings: 0, product_sales: 0, cash_ups: 0, corrections: 0 })
      staffActivityMap.get(staffName).corrections += 1
    }

    setManagerReportsData({
      productSalesByStaff: Array.from(productSalesByStaffMap.values()).sort((a, b) => b.total - a.total),
      staffCommission: Array.from(staffCommissionMap.values())
        .filter((row) => !staffFilter || row.staff_name.toLowerCase().includes(staffFilter))
        .map((row) => ({ ...row, estimated_commission: Number(row.estimated_commission.toFixed(2)), total_revenue: Number(row.total_revenue.toFixed(2)) }))
        .sort((a, b) => b.total_revenue - a.total_revenue),
      productSummary: Array.from(productSummaryMap.values()).sort((a, b) => b.quantity - a.quantity),
      customerSpend: Array.from(customerSpendMap.values()).sort((a, b) => b.total - a.total).slice(0, 20),
      minutesSales,
      promoSales: Array.from(promoSalesMap.values()).sort((a, b) => b.revenue - a.revenue),
      sprayTan: Array.from(sprayTanMap.values()).map((row) => ({ ...row, artists: Array.from(row.artists).join(', ') || 'Unassigned' })),
      staffActivity: Array.from(staffActivityMap.values()).sort((a, b) => (b.bookings + b.cash_ups) - (a.bookings + a.cash_ups)),
      stockMovement: products.map((product) => ({ name: product.name, category: product.category || 'Uncategorised', current_stock: getProductStockQuantity(product), status: getProductStockStatus(product) }))
    })
  }

  function exportManagerReports() {
    if (!managerReportsData) {
      alert('Generate reports first.')
      return
    }
    downloadCsv(`glow_manager_reports_${reportsStartDate}_to_${reportsEndDate}.csv`, [
      ...managerReportsData.productSalesByStaff.map((row) => ({ report: 'Product Sales by Staff', ...row })),
      ...managerReportsData.staffCommission.map((row) => ({ report: 'Staff Commission', ...row })),
      ...managerReportsData.productSummary.map((row) => ({ report: 'Product Sales Summary', ...row })),
      ...managerReportsData.promoSales.map((row) => ({ report: 'Promo Sales', ...row })),
      ...managerReportsData.customerSpend.map((row) => ({ report: 'Customer Spend', ...row })),
      ...managerReportsData.sprayTan.map((row) => ({ report: 'Spray Tan', ...row })),
      ...managerReportsData.staffActivity.map((row) => ({ report: 'Staff Activity', ...row })),
      ...managerReportsData.stockMovement.map((row) => ({ report: 'Stock Movement', ...row }))
    ])
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

  function closeAllManagerSections() {
    setCollapseStaffManagement(true)
    setCollapseMaintenance(true)
    setCollapseProducts(true)
    setCollapseCorrections(true)
    setCollapseWixSync(true)
    setCollapseReceipts(true)
    setCollapseExports(true)
    setCollapseDailyTakings(true)
    setCollapseReports(true)
    setCollapsePromos(true)
  }

  function openManagerSection(sectionName, currentlyOpen) {
    closeAllManagerSections()
    if (currentlyOpen) return
    if (sectionName === 'staff') setCollapseStaffManagement(false)
    if (sectionName === 'maintenance') setCollapseMaintenance(false)
    if (sectionName === 'products') setCollapseProducts(false)
    if (sectionName === 'corrections') setCollapseCorrections(false)
    if (sectionName === 'wix') setCollapseWixSync(false)
    if (sectionName === 'receipts') setCollapseReceipts(false)
    if (sectionName === 'exports') setCollapseExports(false)
    if (sectionName === 'daily') setCollapseDailyTakings(false)
    if (sectionName === 'reports') setCollapseReports(false)
    if (sectionName === 'promos') setCollapsePromos(false)
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

  function jumpToSprayTanNow() {
    setSelectedDate(formatLocalDate(new Date()))
    setTimeout(() => {
      const nowRow = document.querySelector('[data-spraytan-current-time-row="true"]')
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

  function getCurrentStaffAttribution() {
    const staffUser = getCurrentStaffUser()
    return {
      staffId: staffUser?.id || null,
      staffName: staffUser?.name || null
    }
  }

  function getCreatedByStaffFields() {
    const { staffId, staffName } = getCurrentStaffAttribution()
    return {
      created_by_staff_id: staffId,
      created_by_staff_name: staffName
    }
  }

  function getPaymentStaffFields() {
    const { staffId, staffName } = getCurrentStaffAttribution()
    const commissionStaff = commissionStaffId ? staff.find((member) => String(member.id) === String(commissionStaffId)) : null
    return {
      taken_by_staff_id: staffId,
      taken_by_staff_name: staffName,
      commission_staff_id: commissionStaff?.id || staffId,
      commission_staff_name: commissionStaff?.name || staffName
    }
  }

  function getProductSaleStaffFields() {
    const { staffId, staffName } = getCurrentStaffAttribution()
    const commissionStaff = commissionStaffId ? staff.find((member) => String(member.id) === String(commissionStaffId)) : null
    return {
      sold_by_staff_id: staffId,
      sold_by_staff_name: staffName,
      commission_staff_id: commissionStaff?.id || staffId,
      commission_staff_name: commissionStaff?.name || staffName
    }
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
    return products.filter((product) => (product.is_active ?? product.active) !== false)
  }

  function isProductActive(product) {
    return (product?.is_active ?? product?.active) !== false
  }

  function getProductCategoryLabel(category) {
    return productCategories.find((item) => item.value === category)?.label || formatStatus(category || 'other')
  }

  function getProductCategoryKey(category) {
    return String(category?.label || category?.value || category || '').trim().toLowerCase()
  }

  function dedupeProductCategories(categories) {
    const byName = new Map()
    for (const category of categories || []) {
      const label = String(category?.label || formatStatus(category?.value || category || 'other')).trim()
      if (!label) continue
      const value = category?.value || makeProductCategoryValue(label)
      const key = label.toLowerCase()
      if (!byName.has(key)) byName.set(key, { value, label: formatStatus(label) })
    }
    return Array.from(byName.values()).sort((a, b) => a.label.localeCompare(b.label))
  }

  function normalizeProductCategory(category) {
    const value = String(category || 'other').trim()
    const key = getProductCategoryKey(value)
    const existing = productCategories.find((item) => getProductCategoryKey(item) === key || String(item.value).trim().toLowerCase() === key)
    if (existing) return existing.value
    if (['lip_balm', 'shots', 'other_accessories'].includes(value)) return 'other'
    if (value === 'tanning_lotion') return 'tanning_lotions'
    return value || 'other'
  }

  function makeProductCategoryValue(label) {
    return String(label || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'other'
  }

  function addProductCategory() {
    const label = newProductCategoryName.trim()
    if (!label) {
      alert('Enter a category name.')
      return
    }

    const value = makeProductCategoryValue(label)
    if (productCategories.some((category) => getProductCategoryKey(category) === label.toLowerCase())) {
      alert('That category already exists.')
      return
    }

    setProductCategories((current) => dedupeProductCategories([...current, { value, label }]))
    setNewProductCategoryName('')
  }

  function deleteProductCategory(category) {
    const categoryKey = getProductCategoryKey(category)
    const assignedProducts = products.filter((product) => getProductCategoryKey(product.category) === categoryKey || normalizeProductCategory(product.category) === category.value)
    if (assignedProducts.length > 0) {
      alert('This category is assigned to products. Reassign those products before deleting it.')
      return
    }

    const confirmed = window.confirm(`Delete product category "${category.label}"?`)
    if (!confirmed) return

    setProductCategories((current) => {
      const nextCategories = current.filter((item) => getProductCategoryKey(item) !== categoryKey)
      if (productCategory === category.value) setProductCategory(nextCategories[0]?.value || 'other')
      if (bookingProductCategoryFilter === category.value) setBookingProductCategoryFilter('')
      return nextCategories.length > 0 ? nextCategories : PRODUCT_CATEGORIES
    })
  }

  function getProductStockQuantity(product) {
    return Number(product?.stock_quantity || 0)
  }

  function getPromoChoiceGroups(promo) {
    const groups = promo?.product_choice_groups
    if (Array.isArray(groups)) return groups
    if (typeof groups === 'string' && groups.trim()) {
      try {
        const parsed = JSON.parse(groups)
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    }
    return []
  }

  function normalizePromoChoiceGroup(group = {}) {
    const allowedIds = Array.isArray(group.allowed_product_ids) ? group.allowed_product_ids : []
    return {
      group_name: group.group_name || '',
      required_quantity: Number(group.required_quantity || 1),
      allowed_product_ids: allowedIds.map((id) => Number(id)).filter((id) => !Number.isNaN(id)),
      selected_product_id: ''
    }
  }

  function getPromoChoiceGroupsForSave() {
    return promoChoiceGroups
      .map((group) => normalizePromoChoiceGroup(group))
      .filter((group) => group.group_name.trim() || group.allowed_product_ids.length > 0)
      .map(({ selected_product_id, ...group }) => ({
        group_name: group.group_name.trim() || 'Product choice',
        required_quantity: Math.max(1, Number(group.required_quantity || 1)),
        allowed_product_ids: group.allowed_product_ids
      }))
  }

  function addPromoChoiceGroup() {
    setPromoChoiceGroups((groups) => [...groups, { group_name: '', required_quantity: 1, allowed_product_ids: [], selected_product_id: '' }])
  }

  function updatePromoChoiceGroup(index, updates) {
    setPromoChoiceGroups((groups) => groups.map((group, groupIndex) => groupIndex === index ? { ...group, ...updates } : group))
  }

  function addProductToPromoChoiceGroup(index) {
    setPromoChoiceGroups((groups) => groups.map((group, groupIndex) => {
      if (groupIndex !== index) return group
      const productId = Number(group.selected_product_id || 0)
      if (!productId || group.allowed_product_ids.map(Number).includes(productId)) return group
      return {
        ...group,
        allowed_product_ids: [...group.allowed_product_ids, productId],
        selected_product_id: ''
      }
    }))
  }

  function removeProductFromPromoChoiceGroup(index, productId) {
    setPromoChoiceGroups((groups) => groups.map((group, groupIndex) => (
      groupIndex === index
        ? { ...group, allowed_product_ids: group.allowed_product_ids.filter((id) => Number(id) !== Number(productId)) }
        : group
    )))
  }

  function deletePromoChoiceGroup(index) {
    setPromoChoiceGroups((groups) => groups.filter((_, groupIndex) => groupIndex !== index))
  }

  function getSelectedPromo() {
    return promos.find((promo) => String(promo.id) === String(selectedPromoId))
  }

  function getActivePromos() {
    const today = formatLocalDate(new Date())
    return promos.filter((promo) => {
      if (promo.active === false) return false
      if (promo.valid_from && promo.valid_from > today) return false
      if (promo.valid_to && promo.valid_to < today) return false
      return true
    })
  }

  function getPromoSelectedCartItems() {
    const promo = getSelectedPromo()
    if (!promo) return []
    return getPromoChoiceGroups(promo).flatMap((group, groupIndex) => {
      const productIds = promoProductChoices[groupIndex] || []
      return productIds.map((productId) => {
        const product = products.find((entry) => String(entry.id) === String(productId))
        return product ? {
          product_id: product.id,
          product_name: product.name,
          category: product.category,
          price: 0,
          quantity: 1,
          stock_quantity: product.stock_quantity,
          promo_name: promo.promo_name,
          promo_group: group.group_name || `Group ${groupIndex + 1}`
        } : null
      }).filter(Boolean)
    })
  }

  function getPromoProductChoiceErrors() {
    const promo = getSelectedPromo()
    if (!promo) return []
    const errors = getPromoChoiceGroups(promo).flatMap((group, groupIndex) => {
      const selectedIds = promoProductChoices[groupIndex] || []
      const requiredQuantity = Number(group.required_quantity || 1)
      if (selectedIds.length < requiredQuantity) return [`Choose ${requiredQuantity} item(s) for ${group.group_name || `Group ${groupIndex + 1}`}.`]
      return selectedIds.flatMap((productId) => {
        const product = products.find((entry) => String(entry.id) === String(productId))
        if (!product) return ['Selected promo product could not be found.']
        if (getProductStockQuantity(product) <= 0) return [`${product.name} is out of stock.`]
        return []
      })
    })
    const selectedCounts = Object.values(promoProductChoices).flat().reduce((totals, productId) => {
      totals.set(String(productId), Number(totals.get(String(productId)) || 0) + 1)
      return totals
    }, new Map())
    for (const [productId, quantity] of selectedCounts.entries()) {
      const product = products.find((entry) => String(entry.id) === String(productId))
      if (product && quantity > getProductStockQuantity(product)) errors.push(`${product.name} only has ${getProductStockQuantity(product)} in stock.`)
    }
    return errors
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

  function getProductSubcategories(product) {
    if (Array.isArray(product?.subcategories)) return product.subcategories
    if (typeof product?.subcategories === 'string' && product.subcategories.trim()) {
      try {
        const parsed = JSON.parse(product.subcategories)
        if (Array.isArray(parsed)) return parsed
      } catch {
        return product.subcategories.split(',').map((item) => item.trim()).filter(Boolean)
      }
    }
    return []
  }

  function shouldShowProductSubcategories(category) {
    const normalized = normalizeProductCategory(category)
    return ['sachets', 'bottles'].includes(normalized)
  }

  function toggleProductSubcategory(currentSubcategories, subcategory) {
    return currentSubcategories.includes(subcategory)
      ? currentSubcategories.filter((item) => item !== subcategory)
      : [...currentSubcategories, subcategory]
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

  function showSaleReceipt({ customerName, customerEmail = '', packageName = '', minutes = 0, products = [], method, totalPaid, cashAmount = 0 }) {
    const paid = Number(totalPaid || 0)
    const cash = method === 'cash' ? Number(cashAmount || 0) : 0
    const savedCustomer = customers.find((customer) => String(customer.name || '').trim().toLowerCase() === String(customerName || '').trim().toLowerCase())
    setSaleReceipt({
      customerName,
      customerEmail: customerEmail || savedCustomer?.email || '',
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

  function emailSaleReceipt() {
    if (!saleReceipt) return

    const savedCustomer = customers.find((customer) => String(customer.name || '').trim().toLowerCase() === String(saleReceipt.customerName || '').trim().toLowerCase())
    const customerEmail = saleReceipt.customerEmail || savedCustomer?.email || ''

    if (!customerEmail) {
      alert('Customer does not have an email address saved.')
      return
    }

    const productsText = saleReceipt.products.length === 0
      ? 'No products purchased.'
      : saleReceipt.products.map((item) => `${item.product_name || item.name || 'Product'} x ${item.quantity || 1} - GBP ${Number(item.total_amount || item.total || 0).toFixed(2)}`).join('\n')

    const body = [
      'Glow Tanning',
      'Receipt',
      '',
      `Date/time: ${new Date(saleReceipt.dateTime).toLocaleString('en-GB')}`,
      `Staff: ${saleReceipt.staffName || ''}`,
      `Customer: ${saleReceipt.customerName || ''}`,
      '',
      `Minutes/Package: ${saleReceipt.packageName || 'Minutes sale'}${saleReceipt.minutes ? ` - ${saleReceipt.minutes} mins` : ''}`,
      `Products:\n${productsText}`,
      `Payment method: ${formatStatus(saleReceipt.paymentMethod)}`,
      `Total paid: GBP ${Number(saleReceipt.totalPaid || 0).toFixed(2)}`,
      `Cash received: GBP ${Number(saleReceipt.cashReceived || 0).toFixed(2)}`,
      `Change given: GBP ${Number(saleReceipt.changeGiven || 0).toFixed(2)}`,
      '',
      'Thank you for visiting Glow Tanning.'
    ].join('\n')

    window.location.href = `mailto:${encodeURIComponent(customerEmail)}?subject=${encodeURIComponent('Glow Tanning Receipt')}&body=${encodeURIComponent(body)}`
  }

  async function emailBookingReceipt(booking) {
    if (!booking) return
    let customer = getCustomerForBooking(booking)

    if (!customer && booking.customer_id) {
      const { data, error } = await supabase.from('Customers').select('*').eq('id', booking.customer_id).single()
      if (!error) customer = data
    }

    const customerEmail = customer?.email || booking.customer_email || ''
    if (!customerEmail) {
      alert('Customer does not have an email address saved.')
      return
    }

    const appointment = booking.appointment_time ? new Date(booking.appointment_time) : new Date()
    const dayStart = new Date(appointment)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(appointment)
    dayEnd.setHours(23, 59, 59, 999)

    const [{ data: paymentRows }, { data: productRows }] = await Promise.all([
      booking.customer_id
        ? supabase.from('Payments').select('*').eq('customer_id', booking.customer_id).gte('created_at', dayStart.toISOString()).lte('created_at', dayEnd.toISOString()).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      booking.customer_id
        ? supabase.from('ProductSales').select('*').eq('customer_id', booking.customer_id).gte('created_at', dayStart.toISOString()).lte('created_at', dayEnd.toISOString()).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] })
    ])

    const payments = paymentRows || []
    const productSales = productRows || []
    const totalPaid = payments.reduce((total, payment) => total + Number(payment.total_amount || 0), 0) + productSales.reduce((total, sale) => total + Number(sale.total_amount || 0), 0)
    const paymentMethods = Array.from(new Set([...payments.map((payment) => payment.payment_method), ...productSales.map((sale) => sale.payment_method)].filter(Boolean)))
    const packages = payments.map((payment) => payment.package_name || payment.package_type).filter(Boolean)
    const productsText = productSales.length === 0
      ? 'No products recorded.'
      : productSales.map((sale) => `${sale.product_name || 'Product'} x ${sale.quantity || 1} - GBP ${Number(sale.total_amount || 0).toFixed(2)}`).join('\n')

    const body = [
      'Glow Tanning',
      'Receipt',
      '',
      `Date/time: ${appointment.toLocaleString('en-GB')}`,
      `Customer name: ${booking.customer_name || customer?.name || ''}`,
      `Staff name: ${booking.staff_name || getCurrentStaffUser()?.name || ''}`,
      `Bed: ${getBedName(booking.bed_id)}`,
      `Minutes: ${booking.minutes || 0}`,
      `Booking source: ${isWixBooking(booking) ? 'Wix' : formatStatus(booking.booking_source || booking.source || 'dashboard')}`,
      `Payment method: ${paymentMethods.length > 0 ? paymentMethods.map(formatStatus).join(', ') : 'Not recorded'}`,
      `Products/promo:\n${[...packages, productsText].filter(Boolean).join('\n')}`,
      `Total paid: GBP ${Number(totalPaid || 0).toFixed(2)}`,
      '',
      'Thank you for visiting Glow Tanning.'
    ].join('\n')

    window.location.href = `mailto:${encodeURIComponent(customerEmail)}?subject=${encodeURIComponent('Glow Tanning Receipt')}&body=${encodeURIComponent(body)}`
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

  async function createStockMovement({ product, movementType, quantityChange, stockBefore, stockAfter, notes = '', sourceType = '', sourceId = null }) {
    if (!product) return
    const { error } = await supabase.from('StockMovements').insert({
      product_id: product.id,
      product_name: product.name,
      movement_type: movementType,
      quantity_change: quantityChange,
      stock_before: stockBefore,
      stock_after: stockAfter,
      staff_name: getCurrentStaffUser()?.name || null,
      notes: notes || null,
      source_type: sourceType || null,
      source_id: sourceId
    })
    if (error) console.log('Stock movement log skipped:', error)
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

  async function recordProductSales({ paymentMethodForSale, customer = null, cartItems = productCart, sourceType = 'product_sale' }) {
    if (cartItems.length === 0) return true

    const quantityByProductId = cartItems.reduce((totals, item) => {
      const key = String(item.product_id)
      totals.set(key, Number(totals.get(key) || 0) + Number(item.quantity || 0))
      return totals
    }, new Map())

    for (const [productId, quantity] of quantityByProductId.entries()) {
      const product = products.find((entry) => String(entry.id) === String(productId))
      const stock = getProductStockQuantity(product)
      if (stock <= 0) {
        alert(`${product?.name || 'This product'} is out of stock and cannot be sold.`)
        return false
      }
      if (quantity > stock) {
        alert(`${product?.name || 'This product'} only has ${stock} in stock.`)
        return false
      }
    }

    const lowStockAfterSale = cartItems
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

    const saleStaffFields = getProductSaleStaffFields()
    const salesRows = cartItems.map((item) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      category: item.category,
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.price || 0),
      total_amount: Number((Number(item.price || 0) * Number(item.quantity || 0)).toFixed(2)),
      payment_method: paymentMethodForSale,
      customer_id: customer?.id || null,
      customer_name: customer?.name || null,
      ...saleStaffFields
    }))

    const { error } = await supabase.from('ProductSales').insert(salesRows)
    if (error) {
      alert('Product sale was not saved. Please check the connection and try again before taking another payment.')
      showDataLoadWarning('A product sale failed to save. Please check the connection.', error)
      console.log(error)
      return false
    }

    const remainingStockByProductId = new Map(products.map((product) => [String(product.id), getProductStockQuantity(product)]))
    for (const item of cartItems) {
      const product = products.find((entry) => String(entry.id) === String(item.product_id))
      const stock = Number(remainingStockByProductId.get(String(item.product_id)) || 0)
      const quantity = Number(item.quantity || 0)
      const nextStock = Math.max(0, stock - quantity)
      remainingStockByProductId.set(String(item.product_id), nextStock)
      await supabase.from('Products').update({ stock_quantity: nextStock }).eq('id', item.product_id)
      await createStockMovement({
        product,
        movementType: sourceType === 'promo' ? 'promo_sale' : 'sale',
        quantityChange: -quantity,
        stockBefore: stock,
        stockAfter: nextStock,
        notes: item.promo_name ? `Promo: ${item.promo_name}${item.promo_group ? ` / ${item.promo_group}` : ''}` : 'Product sale.',
        sourceType
      })
    }

    if (cartItems === productCart) clearProductCart()
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
    setManagerCorrectionCustomerSearch('')
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

  function updateCashDenomination(key, value) {
    setCashDenominations((current) => {
      const next = { ...current, [key]: value }
      const calculated = CASH_DENOMINATIONS.reduce((total, denomination) => {
        return total + (Number(next[denomination.key] || 0) * denomination.value)
      }, 0)
      setCashUpActualCash(calculated > 0 ? calculated.toFixed(2) : '')
      return next
    })
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
    setFloatMovementStaffId('')
    setFloatMovementEditingId('')
  }

  function editFloatMovement(movement) {
    setFloatMovementEditingId(String(movement.id))
    setFloatMovementType(movement.type || 'added')
    setFloatMovementAmount(movement.amount ?? '')
    setFloatMovementNote(movement.note || '')
    const movementStaff = staff.find((member) => String(member.id) === String(movement.staff_id)) || staff.find((member) => String(member.name || '').trim().toLowerCase() === String(movement.staff_name || '').trim().toLowerCase())
    setFloatMovementStaffId(movementStaff?.id ? String(movementStaff.id) : '')
  }

  function getSelectedFloatMovementStaff() {
    if (floatMovementStaffId) return staff.find((member) => String(member.id) === String(floatMovementStaffId)) || null
    return getCurrentStaffUser()
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

    const staffUser = getSelectedFloatMovementStaff()
    const payload = {
      date: selectedDate,
      type: floatMovementType,
      amount: Number(amount.toFixed(2)),
      note: floatMovementNote.trim(),
      staff_id: staffUser?.id || null,
      staff_name: staffUser?.name || null
    }

    try {
      setFloatMovementSaving(true)
      const request = floatMovementEditingId
        ? supabase.from('FloatMovements').update(payload).eq('id', floatMovementEditingId)
        : supabase.from('FloatMovements').insert(payload)

      const { error } = await request

      if (error) {
        alert('Float movement was not saved. Please check the FloatMovements table and connection.')
        setFloatMovementLoadError(error.message || 'Float movement save failed.')
        showDataLoadWarning('Float movement failed to save. Please check the connection.', error)
        console.error('Float movement save failed:', { table: 'FloatMovements', payload, error })
        return
      }

      clearFloatMovementForm()
      await getFloatMovements()
      alert('Float movement saved.')
    } catch (error) {
      alert('Float movement was not saved. Please check the connection.')
      setFloatMovementLoadError(error.message || 'Float movement save failed.')
      console.error('Float movement save threw:', error)
    } finally {
      setFloatMovementSaving(false)
    }
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

    try {
      setCashFloatSaving(true)
      const request = cashUpExistingRecord?.id
        ? supabase.from('CashUps').update(payload).eq('id', cashUpExistingRecord.id)
        : supabase.from('CashUps').insert(payload)

      const { error } = await request

      if (error) {
        alert('Start-of-day cash float was not saved. Please check the connection and try again.')
        showDataLoadWarning('Start-of-day cash float failed to save. Please check the connection.', error)
        console.error('Start day float save failed:', { table: 'CashUps', payload, existingId: cashUpExistingRecord?.id, error })
        return
      }

      await getCashUpForSelectedDate()
      alert('Start-of-day cash float saved.')
    } catch (error) {
      alert('Start-of-day cash float was not saved. Please check the connection and try again.')
      console.error('Start day float save threw:', error)
    } finally {
      setCashFloatSaving(false)
    }
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

    try {
      setCashUpCompleting(true)
      const request = cashUpExistingRecord?.id
        ? supabase.from('CashUps').update(payload).eq('id', cashUpExistingRecord.id)
        : supabase.from('CashUps').insert(payload)

      const { error } = await request

      if (error) {
        alert('Cash-up was not saved. Please check the connection and try again.')
        showDataLoadWarning('Cash-up failed to save. Please check the connection.', error)
        console.error('Cash-up save failed:', { table: 'CashUps', payload, existingId: cashUpExistingRecord?.id, error })
        return
      }

      setShowCashUpLockConfirm(false)
      await getCashUpForSelectedDate()
      alert('End-of-day cash-up completed and locked.')
    } catch (error) {
      alert('Cash-up was not saved. Please check the connection and try again.')
      console.error('Cash-up save threw:', error)
    } finally {
      setCashUpCompleting(false)
    }
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
    const fromDate = exportFromDate || selectedDate
    const toDate = exportToDate || fromDate
    const dayStart = new Date(`${fromDate}T00:00:00`)
    const dayEnd = new Date(`${toDate}T23:59:59.999`)

    exportTableRows({
      tableName,
      filename: `glow_${tableName}_${fromDate}_to_${toDate}.csv`,
      queryBuilder: (query) => {
        if (tableName === 'Bookings') {
          return query.select('*').gte('appointment_time', dayStart.toISOString()).lte('appointment_time', dayEnd.toISOString()).order('appointment_time', { ascending: true })
        }
        if (tableName === 'CashUps') {
          return query.select('*').gte('cashup_date', fromDate).lte('cashup_date', toDate).order('cashup_date', { ascending: false })
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
      setCommissionStaffId('')
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

  function isCurrentTimelineSlot(time, slotMinutes = 15) {
    if (selectedDate !== formatLocalDate(currentTime)) return false
    const slotStart = getSlotDateTime(time)
    const slotEnd = new Date(slotStart.getTime() + slotMinutes * 60000)
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
      notes: paymentNotes || null,
      ...getPaymentStaffFields()
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
    const promo = getSelectedPromo()
    const promoTotal = promo ? Number(promo.promo_price || 0) : 0
    const grandTotal = Number((topUpTotal + productsTotal + promoTotal).toFixed(2))

    return {
      purchase,
      promo,
      topUpMinutesToAdd,
      topUpTotal,
      promoTotal,
      productsTotal,
      grandTotal,
      hasTopUp: topUpMinutesToAdd > 0,
      hasPromo: Boolean(promo),
      hasProducts: productCart.length > 0
    }
  }

  function getProjectedUsableMinutesForCheckout(customer, bedId) {
    const summary = getSunbedCheckoutSummary(customer)
    const standardBalance = Number(customer?.standard_minutes_balance || 0)
    const hybridBalance = Number(customer?.hybrid_minutes_balance || 0)
    const addedStandard = summary.hasTopUp && summary.purchase.type !== 'hybrid' ? summary.topUpMinutesToAdd : 0
    const addedHybrid = summary.hasTopUp && summary.purchase.type === 'hybrid' ? summary.topUpMinutesToAdd : 0
    const promoMinutes = summary.hasPromo ? Number(summary.promo?.included_minutes || 0) : 0
    const promoMinuteType = summary.hasPromo ? getPromoMinuteType(summary.promo) : ''
    const promoStandard = promoMinuteType === 'standard' ? promoMinutes : 0
    const promoHybrid = promoMinuteType === 'hybrid' ? promoMinutes : 0

    if (Number(bedId) === 2) return hybridBalance + addedHybrid + promoHybrid
    return standardBalance + hybridBalance + addedStandard + addedHybrid + promoStandard + promoHybrid
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

    const promoErrors = getPromoProductChoiceErrors()
    if (promoErrors.length > 0) {
      alert(promoErrors.join('\n'))
      return false
    }

    if (summary.grandTotal <= 0) return true

    const cashMessage = paymentMethod === 'cash'
      ? `\nCash received: £${Number(cashReceived || 0).toFixed(2)}\nChange due: £${Math.max(0, Number(cashReceived || 0) - summary.grandTotal).toFixed(2)}`
      : ''

    return window.confirm(
      `Complete booking checkout?\n\nCustomer: ${customer?.name || 'Walk-in'}\nSession: ${selectedMinutes || 0} tanning mins\nPromo: ${summary.promo?.promo_name || 'None'}\nTop-up total: £${summary.topUpTotal.toFixed(2)}\nPromo total: £${summary.promoTotal.toFixed(2)}\nProducts total: £${summary.productsTotal.toFixed(2)}\nTotal to pay: £${summary.grandTotal.toFixed(2)}\nMethod: ${formatStatus(paymentMethod)}${cashMessage}`
    )
  }

  async function applySunbedCheckout(customer) {
    const summary = getSunbedCheckoutSummary(customer)
    if (summary.grandTotal <= 0 && !summary.hasPromo && !summary.hasProducts && !summary.hasTopUp) return true

    const receiptProducts = getProductReceiptItems()
    const receiptCashReceived = Number(cashReceived || 0)
    let receiptItems = []
    let receiptType = 'sunbed_checkout'
    let nextCustomer = customer
    const promoItems = getPromoSelectedCartItems()

    if (summary.hasPromo) {
      if (promoItems.length > 0) {
        const promoProductsSaved = await recordProductSales({ paymentMethodForSale: paymentMethod, customer, cartItems: promoItems, sourceType: 'promo' })
        if (!promoProductsSaved) return false
      }

      const promoMinutes = Number(summary.promo.included_minutes || 0)
      const promoMinuteType = getPromoMinuteType(summary.promo)
      const oldStandardBalance = Number(customer.standard_minutes_balance || 0)
      const oldHybridBalance = Number(customer.hybrid_minutes_balance || 0)
      const newStandardBalance = promoMinuteType === 'standard' ? oldStandardBalance + promoMinutes : oldStandardBalance
      const newHybridBalance = promoMinuteType === 'hybrid' ? oldHybridBalance + promoMinutes : oldHybridBalance

      const { data: promoPayment, error: promoPaymentError } = await supabase.from('Payments').insert({
        customer_id: customer.id,
        customer_name: customer.name,
        bed_type: `Promo - ${summary.promo.bed_type || 'any'} bed`,
        minutes_added: promoMinutes,
        price_per_minute: 0,
        total_amount: summary.promoTotal,
        payment_method: paymentMethod,
        package_type: 'promo',
        package_name: summary.promo.promo_name,
        notes: paymentNotes || summary.promo.staff_notes || null,
        ...getPaymentStaffFields()
      }).select().single()

      if (promoPaymentError) {
        alert('Promo payment was not saved. Please check the connection and try again.')
        showDataLoadWarning('A promo payment failed to save. Please check the connection.', promoPaymentError)
        console.log(promoPaymentError)
        return false
      }

      if (promoMinutes > 0) {
        const { error: promoBalanceError } = await supabase.from('Customers').update({
          standard_minutes_balance: newStandardBalance,
          hybrid_minutes_balance: newHybridBalance
        }).eq('id', customer.id)

        if (promoBalanceError) {
          alert('Promo payment saved, but promo minutes were not added. Please check the connection before continuing.')
          showDataLoadWarning('A promo minute balance update failed. Please check the connection.', promoBalanceError)
          console.log(promoBalanceError)
          return false
        }

        await createCustomerLog(customer, 'Promo minutes added', `${summary.promo.promo_name}: ${promoMinutes} ${promoMinuteType} mins added. Standard ${oldStandardBalance} -> ${newStandardBalance}. Hybrid ${oldHybridBalance} -> ${newHybridBalance}.`)
        await logCustomerMinuteChanges(
          customer,
          oldStandardBalance,
          newStandardBalance,
          oldHybridBalance,
          newHybridBalance,
          'added',
          `${summary.promo.promo_name}. Promo checkout payment ${formatStatus(paymentMethod)}. Total paid £${summary.promoTotal.toFixed(2)}.`
        )
        await recordPromoMinuteExpiry({
          customer,
          promo: summary.promo,
          minutesAmount: promoMinutes,
          minuteType: promoMinuteType,
          sourceId: promoPayment?.id || null
        })

        nextCustomer = {
          ...nextCustomer,
          standard_minutes_balance: newStandardBalance,
          hybrid_minutes_balance: newHybridBalance
        }
        setCustomers((prevCustomers) => prevCustomers.map((c) => c.id === customer.id ? nextCustomer : c))
      }

      receiptItems = [
        ...receiptItems,
        { name: summary.promo.promo_name, quantity: 1, minutes: promoMinutes, total: summary.promoTotal },
        ...promoItems.map((item) => ({ name: `${item.promo_group}: ${item.product_name}`, quantity: item.quantity, unit_price: 0, total: 0 }))
      ]
      receiptType = 'promo_sale'
    }

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
      const balanceCustomer = nextCustomer || customer
      const newStandardBalance = isHybridTopUp
        ? Number(balanceCustomer.standard_minutes_balance || 0)
        : Number(balanceCustomer.standard_minutes_balance || 0) + summary.topUpMinutesToAdd
      const newHybridBalance = isHybridTopUp
        ? Number(balanceCustomer.hybrid_minutes_balance || 0) + summary.topUpMinutesToAdd
        : Number(balanceCustomer.hybrid_minutes_balance || 0)

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
        notes: paymentNotes || null,
        ...getPaymentStaffFields()
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
        Number(balanceCustomer.standard_minutes_balance || 0),
        newStandardBalance,
        Number(balanceCustomer.hybrid_minutes_balance || 0),
        newHybridBalance,
        'added',
        `${summary.purchase.name}. Booking checkout payment ${formatStatus(paymentMethod)}. Total paid £${summary.topUpTotal.toFixed(2)}.`
      )

      nextCustomer = {
        ...balanceCustomer,
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
      receiptType = summary.hasPromo ? 'promo_sale_with_topup' : summary.hasProducts ? 'sunbed_checkout_with_products' : 'minutes_topup'
    } else if (summary.hasProducts) {
      receiptType = summary.hasPromo ? 'promo_sale_with_products' : 'product_sale'
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
      minutes: summary.hasPromo ? Number(summary.promo?.included_minutes || 0) : summary.hasTopUp ? summary.topUpMinutesToAdd : 0,
      products: [...promoItems, ...receiptProducts],
      method: paymentMethod,
      totalPaid: summary.grandTotal,
      cashAmount: receiptCashReceived
    })
    setTopUpMinutes(0)
    setSelectedPromoId('')
    setPromoProductChoices({})
    setPaymentNotes('')
    setCashReceived('')
    setCommissionStaffId('')
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

  function getBookingCalendarDisplayInterval(booking) {
    if (!booking?.appointment_time) return null
    const appointmentStart = new Date(booking.appointment_time)
    if (Number.isNaN(appointmentStart.getTime())) return null
    const liveEnd = booking.booking_end ? new Date(booking.booking_end) : null
    const plannedEnd = new Date(appointmentStart.getTime() + getTotalBlockMinutes(booking) * 60000)
    const end = liveEnd && !Number.isNaN(liveEnd.getTime()) && liveEnd > plannedEnd ? liveEnd : plannedEnd
    return { start: appointmentStart, end }
  }

  function getCalendarDisplayStartTimeString(booking) {
    const interval = getBookingCalendarDisplayInterval(booking)
    if (!interval) return ''
    return `${String(interval.start.getHours()).padStart(2, '0')}:${String(interval.start.getMinutes()).padStart(2, '0')}`
  }

  function getCalendarDisplaySlotCount(booking) {
    const interval = getBookingCalendarDisplayInterval(booking)
    if (!interval) return getTotalSlotCount(booking)
    return Math.max(1, Math.ceil((interval.end - interval.start) / (SLOT_MINUTES * 60000)))
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
    if (Number(paid || 0) <= 0) return 'not_paid'
    return Number(paid || 0) >= Number(required || 0) ? 'paid' : 'pending'
  }

  function addMonthsToDate(dateValue, months) {
    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return null
    date.setMonth(date.getMonth() + months)
    return date
  }

  function getPatchExpiryWarning(customer) {
    if (!customer?.patch_test_expiry_date) return ''
    const expiry = new Date(`${customer.patch_test_expiry_date}T00:00:00`)
    if (Number.isNaN(expiry.getTime())) return ''
    const today = new Date()
    const oneMonthFromNow = new Date()
    oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1)
    if (expiry < today) return `Patch test expired on ${expiry.toLocaleDateString('en-GB')}.`
    if (expiry <= oneMonthFromNow) return `Patch test expires soon on ${expiry.toLocaleDateString('en-GB')}.`
    return ''
  }

  async function recordSprayTanPayment({ bookingId = null, customer = null, customerName = '', amount = 0, paymentMethod = 'card', paymentType = 'spray_tan_payment', notes = '' }) {
    const totalAmount = Number(amount || 0)
    if (totalAmount <= 0) return true
    const { error } = await supabase.from('Payments').insert({
      customer_id: customer?.id || null,
      customer_name: customer?.name || customerName || 'Spray tan customer',
      bed_type: 'Spray Tan',
      minutes_added: 0,
      price_per_minute: 0,
      total_amount: Number(totalAmount.toFixed(2)),
      payment_method: paymentMethod,
      package_type: paymentType,
      package_name: formatStatus(paymentType),
      notes,
      ...getPaymentStaffFields()
    })
    if (error) {
      alert('Spray tan payment was not saved. Please check the Payments table and connection.')
      showDataLoadWarning('Spray tan payment failed to save.', error)
      console.error('Spray tan payment save failed:', { table: 'Payments', bookingId, customer, amount: totalAmount, paymentMethod, paymentType, notes, error })
      return false
    }
    return true
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
    const expiryWarning = getPatchExpiryWarning(customer)
    if (expiryWarning) return expiryWarning
    const latestPatchTestDate = getLatestCustomerPatchTestDate(customer.id)
    if (!latestPatchTestDate) return 'No patch test recorded for this customer.'
    const twelveMonthsAfterPatch = addMonthsToDate(latestPatchTestDate, 12)
    if (twelveMonthsAfterPatch && twelveMonthsAfterPatch < new Date()) return `Patch test expired on ${twelveMonthsAfterPatch.toLocaleDateString('en-GB')}.`
    const oneMonthFromNow = new Date()
    oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1)
    if (twelveMonthsAfterPatch && twelveMonthsAfterPatch <= oneMonthFromNow) return `Patch test expires soon on ${twelveMonthsAfterPatch.toLocaleDateString('en-GB')}.`
    const hoursBeforeAppointment = (appointmentDateTime - latestPatchTestDate) / (60 * 60 * 1000)
    if (hoursBeforeAppointment < 24) return 'Patch test should be at least 24 hours before a paid spray tan where possible.'
    return ''
  }

  function getSprayTanStatusLabel(booking) {
    const status = getBookingStatusKey(booking)
    if (status === 'completed') return 'Completed'
    if (status === 'cancelled' || status === 'canceled') return 'Cancelled'
    if (String(booking?.approval_status || '').toLowerCase() === 'pending') return 'Pending Approval'
    if (String(booking?.deposit_status || '').toLowerCase() === 'not_paid') return 'Deposit Not Paid'
    if (String(booking?.deposit_status || '').toLowerCase() === 'paid') return 'Deposit Paid'
    if (Number(booking?.deposit_required || 0) > Number(booking?.deposit_paid || 0)) return 'Deposit Pending'
    return 'Approved'
  }

  function getSprayTanStatusStyle(label) {
    const colours = {
      'Pending Approval': '#8a6420',
      Approved: '#3d5368',
      'Deposit Not Paid': '#7a3f2b',
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
    if (statusLabel === 'Approved') return { status: 'booked', approval_status: 'approved', deposit_status: depositStatus || 'not_paid' }
    if (statusLabel === 'Deposit Not Paid') return { status: 'booked', approval_status: 'approved', deposit_status: 'not_paid' }
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
    const status = getBookingStatusKey(booking)
    if (status === 'force_stopped') {
      return !(booking?.booking_end && new Date(booking.booking_end) > new Date())
    }
    return ['completed', 'deleted', 'cancelled', 'canceled', 'no_show'].includes(status)
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
    if (status === 'force_stopped') {
      if (booking?.booking_end && now < new Date(booking.booking_end)) return 'cooldown'
      return 'force_stopped'
    }
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
      booking_source: 'dashboard',
      ...getCreatedByStaffFields()
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
      booking_source: 'dashboard',
      ...getCreatedByStaffFields()
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
      booking_source: 'dashboard',
      ...getCreatedByStaffFields()
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

    const confirmed = window.confirm(`Reset runtime for ${getBedName(bed.id)}? Use this after a tube change.`)
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
    await consumePromoMinuteExpiries(customer, 'standard', standardBalance - newStandardBalance)
    await consumePromoMinuteExpiries(customer, 'hybrid', hybridBalance - newHybridBalance)
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

    const now = new Date()
    const cooldownEnd = new Date(now.getTime() + COOLDOWN_SECONDS * 1000)
    const { error } = await supabase.from('Bookings').update({
      status: 'force_stopped',
      actual_tanning_end: now.toISOString(),
      booking_end: cooldownEnd.toISOString(),
      tmax_status: 'force_stopped'
    }).eq('id', booking.id)
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
    if (Number(bedId) === 2) return 'Collagen Lay Down'
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

    if (String(booking?.status || '').toLowerCase() === 'force_stopped') {
      if (booking?.booking_end && currentTime < new Date(booking.booking_end)) return 'Cooldown'
      return 'Force Stopped'
    }

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
    if (phase === 'Force Stopped') return '#7a1f2a'
    if (phase === 'No Show') return '#3a3632'
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
    if (phase === 'Force Stopped') return '#7a1f2a'
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
            : phase === 'Force Stopped'
              ? '#7a1f2a'
              : phase === 'No Show'
                ? '#3a3632'
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
    return getBookingsForSelectedDate().find((booking) => getCalendarDisplayStartTimeString(booking) === time && Number(booking.bed_id) === Number(bedId))
  }

  function isSlotCoveredByEarlierBooking(time, bedId) {
    const slotTime = getSlotDateTime(time)
    return getBookingsForSelectedDate().some((booking) => {
      if (Number(booking.bed_id) !== Number(bedId)) return false
      if (getCalendarDisplayStartTimeString(booking) === time) return false
      const interval = getBookingCalendarDisplayInterval(booking)
      if (!interval) return false
      return slotTime > interval.start && slotTime < interval.end
    })
  }

  function resetPaymentFields(bedId = null) {
    setTopUpMinutes(0)
    setPurchaseOption(Number(bedId) === 2 ? 'hybrid_custom' : 'standard_custom')
    setPaymentMethod('card')
    setPaymentNotes('')
    setCashReceived('')
    setSelectedPromoId('')
    setPromoProductChoices({})
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
    setSprayTanDepositStatus(defaultDeposit > 0 ? 'not_paid' : 'not_required')
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
    setSprayTanDepositPaymentMethod('card')
    setSprayTanDepositStatus(column === 'patch_test' ? 'not_required' : 'not_paid')
    setSprayTanBalancePaymentAmount('')
    setSprayTanBalancePaymentMethod('card')
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
    setSprayTanDepositPaymentMethod(booking.spraytan_deposit_payment_method || 'card')
    setSprayTanDepositStatus(booking.deposit_status || getSprayTanDepositStatus(booking.spraytan_service, booking.deposit_required, booking.deposit_paid))
    setSprayTanBalancePaymentAmount('')
    setSprayTanBalancePaymentMethod(booking.spraytan_balance_payment_method || 'card')
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
    setSprayTanDepositPaymentMethod('card')
    setSprayTanDepositStatus('not_paid')
    setSprayTanBalancePaymentAmount('')
    setSprayTanBalancePaymentMethod('card')
    setSprayTanPatchCompleted(false)
    setSprayTanPatchTestDate('')
    setSprayTanApprovalStatus('pending')
    setSprayTanStatusControl('Pending Approval')
    setSprayTanSaving(false)
    setCommissionStaffId('')
    setSelectedCustomerId('')
    setSelectedStaffAsCustomerId('')
    setCustomerSearch('')
  }

  async function createSprayTanBookingFromModal() {
    if (sprayTanSaving) return
    if (!requireStaffSignIn()) return

    let customer = getSelectedCustomer()
    const selectedStaff = getSelectedStaffAsCustomer()
    const sprayTanStaffCustomer = selectedStaff ? { id: null, name: `${selectedStaff.name} - Staff`, phone: null, email: null } : null
    if (sprayTanStaffCustomer) customer = sprayTanStaffCustomer

    if (!customer && customerSearch.trim()) {
      const shouldCreate = window.confirm(`Create new customer "${customerSearch.trim()}"?`)
      if (!shouldCreate) return
      customer = await createNewCustomerFromSearch()
    }

    if (!customer) {
      alert('Please select or create a customer.')
      return
    }

    if (!sprayTanStaffCustomer && blockIfCustomerBanned(customer)) return

    const appointmentDateTime = new Date(`${sprayTanDate}T${sprayTanTime}`)
    if (Number.isNaN(appointmentDateTime.getTime())) {
      alert('Please choose a valid date and time.')
      return
    }

    const servicePrice = getSprayTanServicePrice(sprayTanService)
    const depositRequired = getDefaultSprayTanDeposit(sprayTanService)
    const depositPaid = sprayTanService === 'Patch Test' ? 0 : Number(sprayTanDepositPaid || 0)
    const balanceDue = Math.max(0, servicePrice - depositPaid)
    const calculatedDepositStatus = getSprayTanDepositStatus(sprayTanService, depositRequired, depositPaid)
    const statusFields = getSprayTanStatusFields(sprayTanStatusControl, calculatedDepositStatus)
    const patchWarning = sprayTanStaffCustomer ? '' : getPatchTestWarning(customer, appointmentDateTime, sprayTanService)
    const assignedArtist = staff.find((member) => String(member.name || '').trim().toLowerCase() === String(sprayTanArtist || '').trim().toLowerCase())

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
      customer_id: sprayTanStaffCustomer ? null : customer.id,
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
      assigned_artist_id: assignedArtist?.id || null,
      assigned_artist_name: sprayTanArtist || null,
      deposit_required: depositRequired,
      deposit_paid: depositPaid,
      deposit_status: statusFields.deposit_status,
      spraytan_deposit_payment_method: depositPaid > 0 ? sprayTanDepositPaymentMethod : null,
      spraytan_balance_paid: 0,
      spraytan_balance_payment_method: null,
      spraytan_balance_paid_at: null,
      patch_test_required: sprayTanService !== 'Patch Test',
      patch_test_completed: sprayTanService === 'Patch Test' ? true : sprayTanPatchCompleted,
      patch_test_date: sprayTanService === 'Patch Test' ? appointmentDateTime.toISOString() : sprayTanPatchTestDate ? new Date(`${sprayTanPatchTestDate}T00:00:00`).toISOString() : sprayTanStaffCustomer ? null : getLatestCustomerPatchTestDate(customer.id)?.toISOString() || null,
      approval_status: statusFields.approval_status,
      approved_by: statusFields.approval_status === 'approved' ? getCurrentStaffUser()?.name || null : null,
      approved_at: statusFields.approval_status === 'approved' ? new Date().toISOString() : null,
      spraytan_duration_minutes: Number(sprayTanDuration || 0),
      spraytan_balance_due: balanceDue,
      notes: sprayTanNotes || null,
      ...getCreatedByStaffFields()
    }).select().single()
    setSprayTanSaving(false)

    if (error) {
      alert('Spray tan booking was not saved. Please check the connection and Spray Tan booking columns.')
      showDataLoadWarning('Spray tan booking failed to save.', error)
      console.log(error)
      return
    }

    if (!sprayTanStaffCustomer && (sprayTanService === 'Patch Test' || sprayTanPatchCompleted)) {
      const patchDate = sprayTanService === 'Patch Test'
        ? appointmentDateTime.toISOString()
        : sprayTanPatchTestDate ? new Date(`${sprayTanPatchTestDate}T00:00:00`).toISOString() : getLatestCustomerPatchTestDate(customer.id)?.toISOString() || new Date().toISOString()
      const patchExpiry = addMonthsToDate(patchDate, 12)
      await supabase.from('Customers').update({
        last_patch_test_date: patchDate,
        patch_test_expiry_date: patchExpiry ? formatLocalDate(patchExpiry) : null
      }).eq('id', customer.id)
      await createCustomerLog(customer, 'Patch test recorded', `Patch test recorded from spray tan booking. Date: ${new Date(patchDate).toLocaleString('en-GB')}.`)
    }

    await createCustomerLog(customer, 'Spray tan booking created', `${sprayTanService} booked for ${appointmentDateTime.toLocaleString('en-GB')}. Deposit required £${depositRequired.toFixed(2)}, paid £${depositPaid.toFixed(2)}.`)
    if (depositPaid > 0) {
      const paymentSaved = await recordSprayTanPayment({
        bookingId: data?.id,
        customer,
        amount: depositPaid,
        paymentMethod: sprayTanDepositPaymentMethod,
        paymentType: 'spray_tan_deposit',
        notes: `Deposit recorded for spray tan booking ${data?.id || ''}.`
      })
      if (!paymentSaved) return
      await createReceipt({
        customer,
        receiptType: 'spray_tan_deposit',
        items: [{ name: sprayTanService, quantity: 1, total: depositPaid }],
        subtotal: depositPaid,
        total: depositPaid,
        paymentMethod: sprayTanDepositPaymentMethod,
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
    const depositRequired = getDefaultSprayTanDeposit(sprayTanService)
    const previousBalancePaid = Number(sprayTanEditingBooking.spraytan_balance_paid || 0)
    const balancePaymentAmount = Number(sprayTanBalancePaymentAmount || 0)
    const newBalancePaid = previousBalancePaid + balancePaymentAmount
    if (depositPaid > servicePrice) {
      alert('Deposit paid cannot be more than the service price.')
      return
    }
    if (balancePaymentAmount < 0 || depositPaid + newBalancePaid > servicePrice) {
      alert('Balance payment cannot be negative or more than the balance due.')
      return
    }

    const statusFields = getSprayTanStatusFields(sprayTanStatusControl, sprayTanDepositStatus)
    const balanceDue = Math.max(0, servicePrice - depositPaid - newBalancePaid)
    const nextDepositStatus = balanceDue <= 0 && servicePrice > 0 ? 'paid' : statusFields.deposit_status
    const patchDate = sprayTanPatchTestDate ? new Date(`${sprayTanPatchTestDate}T00:00:00`).toISOString() : null
    const customerName = sprayTanCustomerName.trim() || customerSearch.trim() || sprayTanEditingBooking.customer_name || 'Spray tan customer'
    const assignedArtist = staff.find((member) => String(member.name || '').trim().toLowerCase() === String(sprayTanArtist || '').trim().toLowerCase())

    setSprayTanSaving(true)
    const { error } = await supabase.from('Bookings').update({
      customer_name: customerName,
      appointment_time: appointmentDateTime.toISOString(),
      spraytan_column: sprayTanColumn,
      spraytan_service: sprayTanService,
      spraytan_artist: sprayTanArtist || null,
      assigned_artist_id: assignedArtist?.id || sprayTanEditingBooking.assigned_artist_id || null,
      assigned_artist_name: sprayTanArtist || null,
      spraytan_duration_minutes: Number(sprayTanDuration || 0),
      deposit_required: depositRequired,
      deposit_paid: depositPaid,
      deposit_status: nextDepositStatus,
      spraytan_deposit_payment_method: depositPaid > 0 ? sprayTanDepositPaymentMethod : null,
      spraytan_balance_paid: Number(newBalancePaid.toFixed(2)),
      spraytan_balance_payment_method: balancePaymentAmount > 0 ? sprayTanBalancePaymentMethod : sprayTanEditingBooking.spraytan_balance_payment_method || null,
      spraytan_balance_paid_at: balancePaymentAmount > 0 ? new Date().toISOString() : sprayTanEditingBooking.spraytan_balance_paid_at || null,
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
        const patchExpiry = addMonthsToDate(customerPatchDate, 12)
        await supabase.from('Customers').update({
          last_patch_test_date: customerPatchDate,
          patch_test_expiry_date: patchExpiry ? formatLocalDate(patchExpiry) : null
        }).eq('id', sprayTanEditingBooking.customer_id)
      }
    }

    const previousDepositPaid = Number(sprayTanEditingBooking.deposit_paid || 0)
    const depositIncrease = depositPaid - previousDepositPaid
    if (depositIncrease > 0) {
      const paymentMethodForIncrease = previousDepositPaid >= depositRequired ? sprayTanBalancePaymentMethod : sprayTanDepositPaymentMethod
      const paymentSaved = await recordSprayTanPayment({
        bookingId: sprayTanEditingBooking.id,
        customer: sprayTanEditingBooking.customer_id ? { id: sprayTanEditingBooking.customer_id, name: customerName } : null,
        customerName,
        amount: depositIncrease,
        paymentMethod: paymentMethodForIncrease,
        paymentType: previousDepositPaid >= depositRequired ? 'spray_tan_balance_payment' : 'spray_tan_deposit',
        notes: `Additional payment recorded for spray tan booking ${sprayTanEditingBooking.id}.`
      })
      if (!paymentSaved) return
      await createReceipt({
        customer: sprayTanEditingBooking.customer_id ? { id: sprayTanEditingBooking.customer_id, name: customerName } : null,
        customerName,
        receiptType: previousDepositPaid >= depositRequired ? 'spray_tan_balance_payment' : 'spray_tan_deposit',
        items: [{ name: sprayTanService, quantity: 1, total: depositIncrease }],
        subtotal: depositIncrease,
        total: depositIncrease,
        paymentMethod: paymentMethodForIncrease,
        notes: `Additional payment recorded for spray tan booking ${sprayTanEditingBooking.id}.`
      })
    }

    if (balancePaymentAmount > 0) {
      const paymentSaved = await recordSprayTanPayment({
        bookingId: sprayTanEditingBooking.id,
        customer: sprayTanEditingBooking.customer_id ? { id: sprayTanEditingBooking.customer_id, name: customerName } : null,
        customerName,
        amount: balancePaymentAmount,
        paymentMethod: sprayTanBalancePaymentMethod,
        paymentType: 'spray_tan_balance_payment',
        notes: `Balance payment recorded for spray tan booking ${sprayTanEditingBooking.id}.`
      })
      if (!paymentSaved) return
      await createReceipt({
        customer: sprayTanEditingBooking.customer_id ? { id: sprayTanEditingBooking.customer_id, name: customerName } : null,
        customerName,
        receiptType: 'spray_tan_balance_payment',
        items: [{ name: `${sprayTanService} balance`, quantity: 1, total: balancePaymentAmount }],
        subtotal: balancePaymentAmount,
        total: balancePaymentAmount,
        paymentMethod: sprayTanBalancePaymentMethod,
        notes: `Balance payment recorded for spray tan booking ${sprayTanEditingBooking.id}.`
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

  function getPromoMinuteType(promoOrBedType) {
    const bedType = typeof promoOrBedType === 'string' ? promoOrBedType : promoOrBedType?.bed_type
    return bedType === 'standard' ? 'standard' : 'hybrid'
  }

  function getPromoExpiryDate(days) {
    const expiryDays = Number(days || 0)
    if (expiryDays <= 0) return null
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + expiryDays)
    return formatLocalDate(expiryDate)
  }

  async function recordPromoMinuteExpiry({ customer, promo, minutesAmount, minuteType, sourceId = null }) {
    const expiryDate = getPromoExpiryDate(promo?.minutes_expiry_days)
    const minutes = Number(minutesAmount || 0)
    if (!customer || !promo || minutes <= 0 || !expiryDate || promoMinuteExpiryDisabled) return

    const { error } = await supabase.from('CustomerMinuteExpiries').insert({
      customer_id: customer.id,
      customer_name: customer.name,
      minute_type: minuteType,
      minutes_amount: minutes,
      minutes_remaining: minutes,
      source_type: 'promo',
      source_id: sourceId,
      expiry_date: expiryDate,
      expired: false,
      notes: `${promo.promo_name || 'Promo'} minutes expire ${expiryDate}.`
    })

    if (error) {
      setPromoMinuteExpiryDisabled(true)
      console.log('Promo minute expiry allocation skipped:', error)
    }
  }

  async function consumePromoMinuteExpiries(customer, minuteType, minutesUsed) {
    const amountToUse = Number(minutesUsed || 0)
    if (!customer || amountToUse <= 0 || promoMinuteExpiryDisabled) return

    const { data, error } = await supabase
      .from('CustomerMinuteExpiries')
      .select('*')
      .eq('customer_id', customer.id)
      .eq('minute_type', minuteType)
      .eq('expired', false)
      .gt('minutes_remaining', 0)
      .order('expiry_date', { ascending: true })

    if (error) {
      setPromoMinuteExpiryDisabled(true)
      console.log('Promo minute expiry consume skipped:', error)
      return
    }

    let remainingToUse = amountToUse
    for (const allocation of data || []) {
      if (remainingToUse <= 0) break
      const currentRemaining = Number(allocation.minutes_remaining || 0)
      const usedFromAllocation = Math.min(currentRemaining, remainingToUse)
      remainingToUse -= usedFromAllocation
      await supabase.from('CustomerMinuteExpiries').update({
        minutes_remaining: Number((currentRemaining - usedFromAllocation).toFixed(2))
      }).eq('id', allocation.id)
    }
  }

  async function removeExpiredPromoMinutesForCustomers(customerRows = customers) {
    if (promoMinuteExpiryDisabled) return customerRows
    const today = formatLocalDate(new Date())
    const { data, error } = await supabase
      .from('CustomerMinuteExpiries')
      .select('*')
      .eq('expired', false)
      .lte('expiry_date', today)
      .gt('minutes_remaining', 0)

    if (error) {
      setPromoMinuteExpiryDisabled(true)
      console.log('Promo minute expiry check skipped:', error)
      return customerRows
    }

    if (!data || data.length === 0) return customerRows

    const customersById = new Map(customerRows.map((customer) => [Number(customer.id), { ...customer }]))

    for (const allocation of data) {
      const customer = customersById.get(Number(allocation.customer_id))
      if (!customer) continue

      const minuteType = allocation.minute_type === 'standard' ? 'standard' : 'hybrid'
      const balanceField = minuteType === 'standard' ? 'standard_minutes_balance' : 'hybrid_minutes_balance'
      const balanceBefore = Number(customer[balanceField] || 0)
      const minutesToRemove = Math.min(balanceBefore, Number(allocation.minutes_remaining || 0))
      const balanceAfter = Number((balanceBefore - minutesToRemove).toFixed(2))

      const { error: customerError } = await supabase.from('Customers').update({ [balanceField]: balanceAfter }).eq('id', customer.id)
      if (customerError) {
        console.log('Expired promo minute removal skipped:', customerError)
        continue
      }

      await supabase.from('CustomerMinuteExpiries').update({
        minutes_remaining: 0,
        expired: true,
        expired_at: new Date().toISOString()
      }).eq('id', allocation.id)

      if (minutesToRemove > 0) {
        await createCustomerMinuteTransaction({
          customer,
          minuteType,
          transactionType: 'adjusted',
          minutesChanged: -minutesToRemove,
          balanceBefore,
          balanceAfter,
          notes: `Expired promo minutes removed. Expiry date ${allocation.expiry_date}.`
        })
        await createCustomerLog(customer, 'Promo minutes expired', `${minutesToRemove} ${minuteType} mins expired on ${allocation.expiry_date}. Balance ${balanceBefore} -> ${balanceAfter}.`)
      }

      customersById.set(Number(customer.id), { ...customer, [balanceField]: balanceAfter })
    }

    return customerRows.map((customer) => customersById.get(Number(customer.id)) || customer)
  }

  async function createCustomerLog(customer, action, details) {
    if (!customer?.id) return
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
      setCustomerBookingsHistory([])
      setCustomerProductSalesHistory([])
      setCustomerMinuteExpiries([])
      return
    }
    const { data: paymentsData } = await supabase.from('Payments').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(100)
    setCustomerPayments(paymentsData || [])
    const { data: logsData } = await supabase.from('CustomerLogs').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(100)
    setCustomerLogs(logsData || [])
    const { data: bookingsData, error: bookingsError } = await supabase
      .from('Bookings')
      .select('*')
      .eq('customer_id', customerId)
      .order('appointment_time', { ascending: false })
      .limit(150)
    if (bookingsError) {
      setCustomerBookingsHistory([])
      showDataLoadWarning('Customer booking history could not be loaded.', bookingsError)
    } else {
      setCustomerBookingsHistory(bookingsData || [])
    }
    const { data: productSalesData, error: productSalesError } = await supabase
      .from('ProductSales')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (productSalesError) {
      setCustomerProductSalesHistory([])
      showDataLoadWarning('Customer product purchase history could not be loaded.', productSalesError)
    } else {
      setCustomerProductSalesHistory(productSalesData || [])
    }
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
    const { data: expiryData, error: expiryError } = await supabase
      .from('CustomerMinuteExpiries')
      .select('*')
      .eq('customer_id', customerId)
      .order('expiry_date', { ascending: true })
      .limit(100)
    if (expiryError) {
      setCustomerMinuteExpiries([])
    } else {
      setCustomerMinuteExpiries(expiryData || [])
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
    setManagerMarketingConsent(Boolean(customer.marketing_consent))
    setManagerHealthNotes(customer.health_notes || customer.medical_notes || '')
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
    setManagerMarketingConsent(false)
    setManagerHealthNotes('')
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
    setCustomerBookingsHistory([])
    setCustomerProductSalesHistory([])
    setCustomerMinuteExpiries([])
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
      marketing_consent: managerMarketingConsent,
      health_notes: managerHealthNotes || null,
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
    if ((customer.notes || '') !== (managerNotes || '')) await createCustomerLog(customer, 'Notes changed', `Customer notes changed by ${staffUser?.name || 'staff'}.`)
    if ((customer.health_notes || customer.medical_notes || '') !== (managerHealthNotes || '')) await createCustomerLog(customer, 'Health notes changed', `Health/allergy/medication notes changed by ${staffUser?.name || 'staff'}.`)
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

  function buildProductPayload({ name, category, price, stockQuantity, isActive, subcategories }) {
    return {
      name: name.trim(),
      category: category || 'other',
      price: Number(price || 0),
      stock_quantity: stockQuantity === '' ? 0 : Number(stockQuantity || 0),
      is_active: isActive,
      low_stock_threshold: LOW_STOCK_THRESHOLD,
      subcategories: shouldShowProductSubcategories(category) ? subcategories : []
    }
  }

  async function saveProduct() {
    if (!requireStaffSignIn()) return
    if (!requireManagerAccess('Manager PIN required to edit products/prices:')) return

    if (!productName.trim()) {
      alert('Product name is required.')
      return
    }

    const payload = buildProductPayload({
      name: productName,
      category: productCategory,
      price: productPrice,
      stockQuantity: productStockQuantity,
      isActive: productIsActive,
      subcategories: productSubcategories
    })

    const request = supabase.from('Products').insert(payload)

    const { error } = await request
    if (error) {
      alert('Product was not saved. Please check the connection and try again.')
      showDataLoadWarning('A product update failed. Please check the connection.', error)
      console.error('Product save failed:', {
        table: 'Products',
        payload,
        error
      })
      return
    }

    await getProducts()
    clearProductForm()
  }

  async function saveProductChanges() {
    if (!requireStaffSignIn()) return
    if (!requireManagerAccess('Manager PIN required to edit products/prices:')) return
    if (!productEditingId) {
      alert('Select a product to edit.')
      return
    }
    if (!editProductName.trim()) {
      alert('Product name is required.')
      return
    }

    const payload = buildProductPayload({
      name: editProductName,
      category: editProductCategory,
      price: editProductPrice,
      stockQuantity: editProductStockQuantity,
      isActive: editProductIsActive,
      subcategories: editProductSubcategories
    })

    const { error } = await supabase.from('Products').update(payload).eq('id', productEditingId)
    if (error) {
      alert('Product was not saved. Please check the connection and try again.')
      showDataLoadWarning('A product update failed. Please check the connection.', error)
      console.error('Product edit failed:', { table: 'Products', payload, productId: productEditingId, error })
      return
    }

    const currentProduct = products.find((product) => String(product.id) === String(productEditingId))
    const updatedProduct = { ...currentProduct, ...payload, id: productEditingId }
    setProducts((current) => current.map((product) => String(product.id) === String(productEditingId) ? { ...product, ...payload } : product))
    editProduct(updatedProduct)
    await getProducts()
  }

  function editProduct(product) {
    setProductEditingId(String(product.id))
    setSelectedProductManagementId(String(product.id))
    setEditProductName(product.name || '')
    setEditProductCategory(normalizeProductCategory(product.category))
    setEditProductSubcategories(getProductSubcategories(product))
    setEditProductPrice(product.price || '')
    setEditProductStockQuantity(product.stock_quantity ?? '')
    setEditProductIsActive(isProductActive(product))
  }

  function clearProductForm() {
    setProductName('')
    setProductCategory('sachets')
    setProductSubcategories([])
    setProductPrice('')
    setProductStockQuantity('')
    setProductIsActive(true)
  }

  function clearProductEditForm() {
    setProductEditingId('')
    setSelectedProductManagementId('')
    setEditProductName('')
    setEditProductCategory('sachets')
    setEditProductSubcategories([])
    setEditProductPrice('')
    setEditProductStockQuantity('')
    setEditProductIsActive(true)
  }

  function selectProductForManagement(productId) {
    setSelectedProductManagementId(productId)
    const product = products.find((item) => String(item.id) === String(productId))
    if (product) {
      editProduct(product)
    } else {
      clearProductEditForm()
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
      console.error('Product deactivate failed:', { table: 'Products', productId: product.id, error })
      return
    }
    getProducts()
  }

  async function deleteProduct(product) {
    if (!requireStaffSignIn()) return
    if (!requireManagerAccess('Manager PIN required to delete products:')) return

    const confirmed = window.confirm(`Delete product "${product.name}"? Products with sales history will be deactivated instead.`)
    if (!confirmed) return

    const { data: salesHistory, error: salesHistoryError } = await supabase
      .from('ProductSales')
      .select('id')
      .eq('product_id', product.id)
      .limit(1)

    if (salesHistoryError) {
      alert('Could not check product sales history. Product was not deleted.')
      showDataLoadWarning('Product sales history check failed.', salesHistoryError)
      console.error('Product sales history check failed:', { productId: product.id, error: salesHistoryError })
      return
    }

    if ((salesHistory || []).length > 0) {
      alert('This product has sales history, so it will be deactivated instead of deleted.')
      const { error } = await supabase.from('Products').update({ is_active: false }).eq('id', product.id)
      if (error) {
        alert('Product was not deactivated. Please check the connection and try again.')
        showDataLoadWarning('A product update failed. Please check the connection.', error)
        console.error('Product soft delete failed:', { productId: product.id, error })
        return
      }
    } else {
      const { error } = await supabase.from('Products').delete().eq('id', product.id)
      if (error) {
        alert('Product was not deleted. Please check the connection and try again.')
        showDataLoadWarning('A product delete failed. Please check the connection.', error)
        console.error('Product hard delete failed:', { productId: product.id, error })
        return
      }
    }

    if (String(selectedProductManagementId) === String(product.id)) {
      clearProductEditForm()
    }
    await getProducts()
  }

  function clearPromoForm() {
    setPromoEditingId('')
    setPromoName('')
    setPromoDescription('')
    setPromoPrice('')
    setPromoActive(true)
    setPromoValidFrom('')
    setPromoValidTo('')
    setPromoIncludedMinutes('')
    setPromoBedType('any')
    setPromoChoiceGroups([])
    setPromoStaffNotes('')
    setPromoMinutesExpiryDays('')
  }

  function editPromo(promo) {
    setPromoEditingId(String(promo.id))
    setPromoName(promo.promo_name || '')
    setPromoDescription(promo.promo_description || '')
    setPromoPrice(promo.promo_price ?? '')
    setPromoActive(promo.active !== false)
    setPromoValidFrom(promo.valid_from || '')
    setPromoValidTo(promo.valid_to || '')
    setPromoIncludedMinutes(promo.included_minutes ?? '')
    setPromoBedType(promo.bed_type || 'any')
    setPromoChoiceGroups(getPromoChoiceGroups(promo).map(normalizePromoChoiceGroup))
    setPromoStaffNotes(promo.staff_notes || '')
    setPromoMinutesExpiryDays(promo.minutes_expiry_days ?? '')
  }

  async function savePromo() {
    if (!requireStaffSignIn()) return
    if (!requireManagerAccess('Manager PIN required to save promos:')) return
    if (!promoName.trim()) {
      alert('Enter a promo name.')
      return
    }
    const groups = getPromoChoiceGroupsForSave()
    const incompleteGroup = groups.find((group) => group.allowed_product_ids.length < Number(group.required_quantity || 1))
    if (incompleteGroup) {
      alert(`${incompleteGroup.group_name} needs at least ${incompleteGroup.required_quantity} allowed product(s).`)
      return
    }
    const payload = {
      promo_name: promoName.trim(),
      promo_description: promoDescription || null,
      promo_price: Number(promoPrice || 0),
      active: promoActive,
      valid_from: promoValidFrom || null,
      valid_to: promoValidTo || null,
      included_minutes: Number(promoIncludedMinutes || 0),
      minute_type: getPromoMinuteType(promoBedType),
      bed_type: promoBedType,
      product_choice_groups: groups,
      staff_notes: promoStaffNotes || null,
      minutes_expiry_days: promoMinutesExpiryDays === '' ? null : Number(promoMinutesExpiryDays || 0)
    }
    const request = promoEditingId ? supabase.from('Promos').update(payload).eq('id', promoEditingId) : supabase.from('Promos').insert(payload)
    const { error } = await request
    if (error) {
      alert('Promo was not saved. Check the Promos table.')
      showDataLoadWarning('Promo save failed. Check the Promos table.', error)
      console.log(error)
      return
    }
    clearPromoForm()
    await getPromos()
  }

  async function deletePromo(promo) {
    if (!requireStaffSignIn()) return
    if (!requireManagerAccess('Manager PIN required to delete promos:')) return
    if (!window.confirm(`Delete promo "${promo.promo_name}"?`)) return
    const { error } = await supabase.from('Promos').delete().eq('id', promo.id)
    if (error) {
      alert('Promo was not deleted.')
      console.log(error)
      return
    }
    await getPromos()
  }

  async function adjustSelectedProductStock() {
    if (!requireStaffSignIn()) return
    if (!requireManagerAccess('Manager PIN required to adjust stock:')) return
    const product = products.find((entry) => String(entry.id) === String(selectedProductManagementId))
    const quantity = Number(stockMovementQuantity || 0)
    if (!product || quantity <= 0) {
      alert('Select a product and enter a quantity.')
      return
    }
    const stockBefore = getProductStockQuantity(product)
    const signedQuantity = stockMovementType === 'restock' ? quantity : -quantity
    const stockAfter = Math.max(0, stockBefore + signedQuantity)
    const { error } = await supabase.from('Products').update({ stock_quantity: stockAfter }).eq('id', product.id)
    if (error) {
      alert('Stock was not updated.')
      console.log(error)
      return
    }
    await createStockMovement({ product, movementType: stockMovementType, quantityChange: stockAfter - stockBefore, stockBefore, stockAfter, notes: stockMovementNote, sourceType: 'manual' })
    setStockMovementQuantity('')
    setStockMovementNote('')
    await getProducts()
  }

  function renderCustomerSearchBox(options = {}) {
    const isSprayTanContext = options.context === 'spraytan'
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
              {isSprayTanContext ? (
                <>
                  <p style={{ margin: '5px 0', color: '#d4a853', fontWeight: 'bold' }}>Staff spray tan booking</p>
                  <p style={{ margin: '5px 0' }}>Manager/staff can record this as free or paid with the deposit/payment fields.</p>
                </>
              ) : (
                <>
                  <p style={{ margin: '5px 0' }}>Weekly free balance: <strong>{selectedStaff.weekly_free_minutes_balance || 0} mins</strong></p>
                  <p style={{ marginTop: '12px', fontSize: '18px' }}>Usable on any bed: <strong>{getStaffUsableMinutes(selectedStaff)} mins</strong></p>
                </>
              )}
            </div>
            {!isSprayTanContext && !staffHasEnoughMinutes(selectedStaff, selectedMinutes) && <p style={{ color: '#ff7875', fontWeight: 'bold' }}>Not enough staff free minutes for this booking.</p>}
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
                {productCategories.map((category) => (
                  <option key={getProductCategoryKey(category)} value={category.value}>{category.label}</option>
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

  function renderBookingPromoSection() {
    const selectedCustomer = getSelectedCustomer()
    const selectedStaff = getSelectedStaffAsCustomer()
    if (!selectedCustomer || selectedStaff || isShopTestCustomer(selectedCustomer)) return null
    const activePromos = getActivePromos()
    const promo = getSelectedPromo()

    return (
      <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '12px', padding: '12px', marginTop: '12px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Apply Offer / Promo</label>
        <p style={{ color: '#aaa', marginTop: 0, fontSize: '13px' }}>Promo minutes are added to the customer balance. The session minutes chosen above are the minutes used today.</p>
        {promoLoadError && <p style={{ color: '#ffcc66' }}>Promos unavailable: {promoLoadError}</p>}
        <select
          value={selectedPromoId}
          onChange={(event) => {
            const nextId = event.target.value
            setSelectedPromoId(nextId)
            setPromoProductChoices({})
          }}
          style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }}
        >
          <option value="">No offer / promo</option>
          {activePromos.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.promo_name} - £{Number(entry.promo_price || 0).toFixed(2)}
            </option>
          ))}
        </select>
        {promo && (
          <div style={{ marginTop: '10px' }}>
            {promo.promo_description && <p style={{ color: '#aaa', marginTop: 0 }}>{promo.promo_description}</p>}
            <p style={{ margin: '6px 0' }}>
              Adds <strong>{Number(promo.included_minutes || 0)} mins</strong> to balance / {formatStatus(promo.bed_type || 'any')} bed{promo.minutes_expiry_days ? ` / expires after ${promo.minutes_expiry_days} days` : ''}.
            </p>
            {getPromoChoiceGroups(promo).map((group, groupIndex) => {
              const allowedIds = group.allowed_product_ids || []
              const allowedProducts = products.filter((product) => allowedIds.map(String).includes(String(product.id)))
              const selectedIds = promoProductChoices[groupIndex] || []
              const requiredQuantity = Number(group.required_quantity || 1)
              return (
                <div key={`${promo.id}-${groupIndex}`} style={{ borderTop: '1px solid #333', paddingTop: '10px', marginTop: '10px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', color: '#d4a853' }}>
                    {group.group_name || `Choice group ${groupIndex + 1}`} - choose {requiredQuantity}
                  </label>
                  {Array.from({ length: requiredQuantity }, (_, choiceIndex) => (
                    <select
                      key={`${groupIndex}-${choiceIndex}`}
                      value={selectedIds[choiceIndex] || ''}
                      onChange={(event) => {
                        const nextChoices = [...selectedIds]
                        nextChoices[choiceIndex] = event.target.value
                        setPromoProductChoices((current) => ({ ...current, [groupIndex]: nextChoices.filter(Boolean) }))
                      }}
                      style={{ width: '100%', padding: '10px', marginBottom: '8px', boxSizing: 'border-box' }}
                    >
                      <option value="">Select product...</option>
                      {allowedProducts.map((product) => (
                        <option key={product.id} value={product.id} disabled={getProductStockQuantity(product) <= 0}>
                          {product.name} - Stock {getProductStockQuantity(product)} - {getProductStockStatus(product)}
                        </option>
                      ))}
                    </select>
                  ))}
                  {allowedProducts.length === 0 && <p style={{ color: '#ffcc66' }}>No allowed products configured for this group.</p>}
                </div>
              )
            })}
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
    const promoItems = getPromoSelectedCartItems()

    return (
      <div style={{ background: '#0b0b0b', padding: '16px', borderRadius: '14px', marginTop: '0', marginBottom: '15px', border: '1px solid rgba(212,168,83,0.45)' }}>
        <h3 style={{ marginTop: 0 }}>Payment Summary</h3>
        <div style={{ display: 'grid', gap: '8px', marginBottom: '12px' }}>
          <p style={{ margin: 0 }}>Selected tanning session: <strong>{Number(selectedMinutes || 0)} mins</strong></p>
          {summary.hasPromo && <p style={{ margin: 0 }}>Promo minutes added to account: <strong>{Number(summary.promo.included_minutes || 0)} mins</strong></p>}
          {summary.hasPromo && <p style={{ margin: 0, color: '#aaa' }}>Today uses the selected session minutes; remaining promo/account balance stays on the customer account.</p>}
          {promoItems.length > 0 && <p style={{ margin: 0 }}>Included promo products: <strong>{promoItems.map((item) => `${item.product_name} x${item.quantity}`).join(', ')}</strong></p>}
          {summary.hasPromo && <p style={{ margin: 0 }}>Offer / Promo: <strong>{summary.promo.promo_name}</strong> - £{summary.promoTotal.toFixed(2)}</p>}
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
        {showManagerView && (
          <select value={commissionStaffId} onChange={(e) => setCommissionStaffId(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '8px', boxSizing: 'border-box' }}>
            <option value="">Commission staff: signed-in staff</option>
            {staff.filter((member) => member.is_active !== false).map((member) => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </select>
        )}
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

  function getCustomerProfileStats(customer) {
    const allHistory = customerBookingsHistory || []
    const sunbedHistory = allHistory.filter(isSunbedBooking)
    const completedVisits = allHistory.filter((booking) => ['completed', 'force_stopped'].includes(String(booking.status || '').toLowerCase()))
    const noShows = allHistory.filter((booking) => String(booking.status || '').toLowerCase() === 'no_show')
    const activeExpiries = (customerMinuteExpiries || []).filter((entry) => !entry.expired && Number(entry.minutes_remaining || 0) > 0)
    const soon = new Date()
    soon.setDate(soon.getDate() + 30)
    const minutesExpiringSoon = activeExpiries.filter((entry) => {
      if (!entry.expiry_date) return false
      const expiry = new Date(`${entry.expiry_date}T00:00:00`)
      return !Number.isNaN(expiry.getTime()) && expiry <= soon
    })

    return {
      lastTanDate: customer?.last_tan_date || sunbedHistory[0]?.appointment_time || null,
      lastVisitDate: customer?.last_visit_date || completedVisits[0]?.appointment_time || allHistory[0]?.appointment_time || null,
      totalVisits: Number(customer?.total_visits || 0) || completedVisits.length,
      noShowCount: Number(customer?.no_show_count || 0) || noShows.length,
      minutesExpiringSoon
    }
  }

  function renderProfileBadge(label, tone = 'warning') {
    const colours = {
      warning: { background: '#241b0c', border: '#9b6a20', color: '#ffd27a' },
      danger: { background: '#2a0f12', border: '#8f2b35', color: '#ff9a9a' },
      good: { background: '#0f2418', border: '#2f7d4c', color: '#9be2b5' },
      info: { background: '#111c28', border: '#365f8a', color: '#a8d4ff' },
      muted: { background: '#171717', border: '#444', color: '#bbb' }
    }
    const style = colours[tone] || colours.warning
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', border: `1px solid ${style.border}`, background: style.background, color: style.color, padding: '5px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' }}>
        {label}
      </span>
    )
  }

  function renderCustomerProfilePanel(customer) {
    if (!customer) return null
    const stats = getCustomerProfileStats(customer)
    const age = customer.date_of_birth ? calculateAge(customer.date_of_birth) : null
    const patchWarning = getPatchExpiryWarning(customer)
    const medicalNotes = customer.health_notes || customer.medical_notes || managerHealthNotes || ''
    const noShowWarning = stats.noShowCount >= 2
    const activeSunbedHistory = (customerBookingsHistory || []).filter(isSunbedBooking).slice(0, 30)
    const sprayTanHistory = (customerBookingsHistory || []).filter(isSprayTanBooking).slice(0, 30)
    const emailCustomerReceipt = (receipt) => {
      if (!customer.email) {
        alert('Customer does not have an email address saved.')
        return
      }
      const subject = encodeURIComponent('Glow Tanning Receipt')
      const body = encodeURIComponent(buildReceiptText(receipt))
      window.location.href = `mailto:${encodeURIComponent(customer.email)}?subject=${subject}&body=${body}`
    }
    const quickActionStyle = { padding: '9px 10px', fontSize: '13px' }
    const sectionStyle = { background: '#0b0b0b', border: '1px solid #2f2a20', borderRadius: '10px', padding: '12px', minHeight: '220px' }
    const statStyle = { background: '#0b0b0b', border: '1px solid #2f2a20', borderRadius: '10px', padding: '10px' }
    const rowStyle = { borderBottom: '1px solid #28231b', padding: '8px 0', color: '#ddd' }

    return (
      <div style={{ background: '#111', border: '1px solid rgba(212,168,83,0.35)', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: '12px' }}>
          <div>
            <h3 style={{ margin: '0 0 4px', color: '#d4a853' }}>{customer.name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Customer Profile'}</h3>
            <div style={{ color: '#ccc', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              <span>{customer.phone || 'No phone'}</span>
              <span>{customer.email || 'No email'}</span>
              <span>DOB: {customer.date_of_birth || 'Not recorded'}{age !== null ? ` / Age ${age}` : ''}</span>
            </div>
            <div style={{ color: '#aaa', marginTop: '4px' }}>{[customer.address, customer.postcode].filter(Boolean).join(', ') || 'No address recorded'}</div>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {!customer.terms_accepted && renderProfileBadge('Terms not accepted', 'warning')}
            {!customer.id_checked && renderProfileBadge('ID not checked', 'warning')}
            {patchWarning && renderProfileBadge(patchWarning, patchWarning.includes('expired') ? 'danger' : 'warning')}
            {medicalNotes && renderProfileBadge('Medical warning', 'danger')}
            {noShowWarning && renderProfileBadge('No-show warning', 'warning')}
            {stats.minutesExpiringSoon.length > 0 && renderProfileBadge('Minutes expiring soon', 'warning')}
            {customer.warning_flag && renderProfileBadge(formatStatus(getCustomerWarningLevel(customer)), getCustomerWarningLevel(customer) === 'banned' ? 'danger' : 'warning')}
            {customer.is_active === false && renderProfileBadge('Inactive', 'muted')}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '8px', marginBottom: '12px' }}>
          <div style={statStyle}><strong>ID checked</strong><br /><span style={{ color: customer.id_checked ? '#9be2b5' : '#ffd27a' }}>{customer.id_checked ? 'Yes' : 'No'}</span></div>
          <div style={statStyle}><strong>Terms accepted</strong><br /><span style={{ color: customer.terms_accepted ? '#9be2b5' : '#ffd27a' }}>{customer.terms_accepted ? 'Yes' : 'No'}</span></div>
          <div style={statStyle}><strong>Marketing consent</strong><br /><span>{customer.marketing_consent ? 'Yes' : 'No'}</span></div>
          <div style={statStyle}><strong>Last tan date</strong><br /><span>{stats.lastTanDate ? new Date(stats.lastTanDate).toLocaleString('en-GB') : 'None recorded'}</span></div>
          <div style={statStyle}><strong>Last visit</strong><br /><span>{stats.lastVisitDate ? new Date(stats.lastVisitDate).toLocaleString('en-GB') : 'None recorded'}</span></div>
          <div style={statStyle}><strong>Total visits</strong><br /><span>{stats.totalVisits}</span></div>
          <div style={statStyle}><strong>No-shows</strong><br /><span>{stats.noShowCount}</span></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '12px' }}>
          <div style={sectionStyle}>
            <h4 style={{ marginTop: 0 }}>Notes / Warnings</h4>
            {customer.warning_flag && <p style={{ color: getCustomerWarningStyle(getCustomerWarningLevel(customer)).color, fontWeight: 'bold' }}>{customer.warning_note || formatStatus(getCustomerWarningLevel(customer))}</p>}
            <p style={{ whiteSpace: 'pre-wrap', color: '#ccc' }}>{customer.notes || 'No customer notes.'}</p>
            <p style={{ whiteSpace: 'pre-wrap', color: medicalNotes ? '#ffb3b3' : '#aaa' }}><strong>Allergies / medication / health:</strong><br />{medicalNotes || 'None recorded.'}</p>
          </div>
          <div style={sectionStyle}>
            <h4 style={{ marginTop: 0 }}>Quick Actions</h4>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" style={quickActionStyle} onClick={() => { setSelectedCustomerId(String(customer.id)); setCustomerSearch(customer.name || ''); setDashboardView('sunbeds'); setShowCustomerManagement(false); scrollToTop() }}>Create sunbed booking</button>
              <button type="button" style={quickActionStyle} onClick={() => { setSelectedCustomerId(String(customer.id)); setCustomerSearch(customer.name || ''); setSprayTanCustomerName(customer.name || ''); setDashboardView('spraytan'); setShowCustomerManagement(false); scrollToTop() }}>Create spray tan booking</button>
              <button type="button" style={quickActionStyle} onClick={() => { setSelectedCustomerId(String(customer.id)); setCustomerSearch(customer.name || ''); setShowBookingTopUp(true); setDashboardView('sunbeds'); scrollToTop() }}>Add / top up minutes</button>
              <button type="button" style={quickActionStyle} onClick={() => { if (requireStaffSignIn()) setShowStandalonePOS(true) }}>Add product sale</button>
              <button type="button" style={quickActionStyle} onClick={() => customerReceipts[0] ? emailCustomerReceipt(customerReceipts[0]) : alert('No receipt found for this customer.')}>Email receipt</button>
              <button type="button" style={quickActionStyle} onClick={() => setManagerNotes(`${managerNotes ? `${managerNotes}\n` : ''}${new Date().toLocaleString('en-GB')} - `)}>Add note</button>
              <button type="button" style={quickActionStyle} onClick={() => setManagerIdChecked(true)}>Mark ID checked</button>
              <button type="button" style={quickActionStyle} onClick={() => setManagerTermsAccepted(true)}>Mark terms accepted</button>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
          <div style={{ ...sectionStyle, maxHeight: '330px', overflowY: 'auto' }}>
            <h4 style={{ marginTop: 0 }}>Sunbed History</h4>
            {activeSunbedHistory.length === 0 ? <p style={{ color: '#aaa' }}>No sunbed history.</p> : activeSunbedHistory.map((booking) => (
              <div key={`sunbed-profile-${booking.id}`} style={rowStyle}>
                <strong>{booking.appointment_time ? new Date(booking.appointment_time).toLocaleString('en-GB') : 'No date'}</strong><br />
                {getBedName(booking.bed_id)} / Room {booking.bed_id || '-'} / {booking.minutes || 0} mins booked / {booking.minutes_used || booking.runtime_minutes || booking.minutes || 0} used<br />
                <span style={{ color: '#aaa' }}>{formatStatus(booking.status)} / Booked by {booking.created_by_staff_name || booking.staff_name || 'Unknown'} / Started by {booking.started_by_staff_name || 'Unknown'} / {formatStatus(booking.payment_method)}</span>
              </div>
            ))}
          </div>

          <div style={{ ...sectionStyle, maxHeight: '330px', overflowY: 'auto' }}>
            <h4 style={{ marginTop: 0 }}>Minutes / Packages</h4>
            <p>Standard balance: <strong>{customer.standard_minutes_balance || 0}</strong></p>
            <p>Collagen/hybrid balance: <strong>{customer.hybrid_minutes_balance || 0}</strong></p>
            {(customerMinuteExpiries || []).length === 0 ? <p style={{ color: '#aaa' }}>No promo minute expiry allocations found.</p> : customerMinuteExpiries.map((entry) => (
              <div key={`expiry-profile-${entry.id}`} style={rowStyle}>
                <strong>{formatStatus(entry.source_type || 'Package / promo')}</strong><br />
                {formatStatus(entry.minute_type)} / Bought {Number(entry.minutes_amount || 0)} / Remaining {Number(entry.minutes_remaining || 0)}<br />
                <span style={{ color: entry.expired ? '#ff9a9a' : '#aaa' }}>Expiry: {entry.expiry_date || 'No expiry'} {entry.expired ? '/ Expired' : ''}</span>
              </div>
            ))}
          </div>

          <div style={{ ...sectionStyle, maxHeight: '330px', overflowY: 'auto' }}>
            <h4 style={{ marginTop: 0 }}>Product Purchases</h4>
            {(customerProductSalesHistory || []).length === 0 ? <p style={{ color: '#aaa' }}>No product purchases.</p> : customerProductSalesHistory.slice(0, 40).map((sale) => (
              <div key={`product-profile-${sale.id}`} style={rowStyle}>
                <strong>{sale.created_at ? new Date(sale.created_at).toLocaleString('en-GB') : 'No date'}</strong><br />
                {sale.product_name || 'Product'} x {sale.quantity || 1} / GBP {Number(sale.total_amount || sale.total || 0).toFixed(2)}<br />
                <span style={{ color: '#aaa' }}>{sale.sold_by_staff_name || sale.staff_name || 'Unknown staff'}{sale.is_promo_item || sale.promo_name ? ' / Promo or free product' : ''}</span>
              </div>
            ))}
          </div>

          <div style={{ ...sectionStyle, maxHeight: '330px', overflowY: 'auto' }}>
            <h4 style={{ marginTop: 0 }}>Spray Tan History</h4>
            {sprayTanHistory.length === 0 ? <p style={{ color: '#aaa' }}>No spray tan history.</p> : sprayTanHistory.map((booking) => (
              <div key={`spray-profile-${booking.id}`} style={rowStyle}>
                <strong>{booking.spraytan_service || 'Spray tan'} / {booking.appointment_time ? new Date(booking.appointment_time).toLocaleString('en-GB') : 'No date'}</strong><br />
                Artist: {booking.assigned_artist_name || booking.spraytan_artist || 'Unassigned'} / Deposit {Number(booking.deposit_paid || 0).toFixed(2)} / Balance {Number(booking.spraytan_balance_paid || 0).toFixed(2)}<br />
                <span style={{ color: '#aaa' }}>Patch test: {booking.patch_test_completed ? 'Completed' : 'Not recorded'} / {getSprayTanStatusLabel(booking)}</span>
              </div>
            ))}
          </div>

          <div style={{ ...sectionStyle, maxHeight: '330px', overflowY: 'auto' }}>
            <h4 style={{ marginTop: 0 }}>Payments / Receipts</h4>
            {customerReceipts.length === 0 && customerPayments.length === 0 ? <p style={{ color: '#aaa' }}>No payments or receipts.</p> : null}
            {customerReceipts.slice(0, 30).map((receipt) => (
              <div key={`profile-receipt-${receipt.id}`} style={rowStyle}>
                <strong>{receipt.created_at ? new Date(receipt.created_at).toLocaleString('en-GB') : 'No date'} / GBP {Number(receipt.total || 0).toFixed(2)}</strong><br />
                {formatStatus(receipt.receipt_type)} / {formatStatus(receipt.payment_method)} / {receipt.staff_name || 'Unknown staff'}<br />
                <button type="button" onClick={() => alert(buildReceiptText(receipt))} style={{ marginTop: '6px', marginRight: '6px', padding: '6px 8px' }}>View Receipt</button>
                {customer.email && <button type="button" onClick={() => emailCustomerReceipt(receipt)} style={{ marginTop: '6px', padding: '6px 8px' }}>Email Receipt</button>}
              </div>
            ))}
            {customerPayments.slice(0, 20).map((payment) => (
              <div key={`profile-payment-${payment.id}`} style={rowStyle}>
                <strong>{payment.created_at ? new Date(payment.created_at).toLocaleString('en-GB') : 'No date'} / GBP {Number(payment.total_amount || payment.amount || 0).toFixed(2)}</strong><br />
                {payment.package_name || payment.payment_for || payment.bed_type || 'Payment'} / {formatStatus(payment.payment_method)} / {payment.taken_by_staff_name || payment.staff_name || 'Unknown staff'}
              </div>
            ))}
          </div>

          <div style={{ ...sectionStyle, maxHeight: '330px', overflowY: 'auto' }}>
            <h4 style={{ marginTop: 0 }}>Logs / Audit Trail</h4>
            {customerLogs.length === 0 ? <p style={{ color: '#aaa' }}>No logs found.</p> : customerLogs.slice(0, 60).map((log) => (
              <div key={`profile-log-${log.id}`} style={rowStyle}>
                <strong>{log.action || 'Log'}</strong><br />
                <span>{log.details || log.notes || ''}</span><br />
                <span style={{ color: '#aaa' }}>{log.created_at ? new Date(log.created_at).toLocaleString('en-GB') : ''}</span>
              </div>
            ))}
          </div>
        </div>
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
            {renderCustomerProfilePanel(selectedCustomer)}

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
              <label style={{ display: 'block', marginTop: '8px' }}>
                <input type="checkbox" checked={managerMarketingConsent} onChange={(e) => setManagerMarketingConsent(e.target.checked)} style={{ marginRight: '8px' }} />
                Marketing consent
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
              <label>Allergies / medication / health notes</label>
              <textarea value={managerHealthNotes} onChange={(e) => setManagerHealthNotes(e.target.value)} style={{ width: '100%', minHeight: '80px', padding: '10px', marginTop: '5px', background: '#111', color: 'white', border: '1px solid #333', borderRadius: '12px', fontFamily: 'inherit' }} />
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
    const correctionCustomerMatches = managerCorrectionCustomerSearch.trim()
      ? customers.filter((customer) => String(customer.name || '').toLowerCase().includes(managerCorrectionCustomerSearch.trim().toLowerCase())).slice(0, 20)
      : []
    const selectedCorrectionCustomer = customers.find((customer) => String(customer.id) === String(managerCorrectionCustomerId))

    return renderCollapsibleSection(
      'Booking / Payment Corrections',
      collapseCorrections,
      setCollapseCorrections,
      <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '14px', padding: '14px' }}>
        <p style={{ color: '#aaa', marginTop: 0 }}>
          Use this when staff sell the wrong minutes, need to reverse a top-up, move minutes, or record a refund/correction. Original payment records are not deleted.
        </p>

        <div style={{ display: 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
            <h3 style={{ margin: 0 }}>Correction Details</h3>
            <strong style={{ color: '#d4a853' }}>Use the fields below to choose the correction customer and action.</strong>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(105px, 1fr))', gap: '8px' }}>
            {false && CASH_DENOMINATIONS.map((denomination) => (
              <label key={denomination.key} style={{ display: 'grid', gap: '4px', color: '#ddd', fontSize: '13px' }}>
                {denomination.label}
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={cashDenominations[denomination.key]}
                  disabled={!canEditCashUp}
                  onChange={(e) => updateCashDenomination(denomination.key, e.target.value)}
                  style={{ padding: '9px' }}
                />
              </label>
            ))}
          </div>
          <p style={{ color: '#aaa', marginBottom: 0 }}>The counted total fills Actual cash counted automatically. Managers can still override the actual cash field if needed.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          <div style={{ display: 'grid', gap: '8px' }}>
            <input
              placeholder="Search customer name..."
              value={managerCorrectionCustomerSearch}
              onChange={(e) => setManagerCorrectionCustomerSearch(e.target.value)}
              style={{ padding: '10px' }}
            />
            {selectedCorrectionCustomer && <span style={{ color: '#d4a853' }}>Selected: {selectedCorrectionCustomer.name}</span>}
            {correctionCustomerMatches.length > 0 && (
              <div style={{ background: '#111', border: '1px solid #333', borderRadius: '10px', maxHeight: '170px', overflowY: 'auto' }}>
                {correctionCustomerMatches.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => {
                      setManagerCorrectionCustomerId(String(customer.id))
                      setManagerCorrectionCustomerSearch(customer.name || '')
                    }}
                    style={{ width: '100%', textAlign: 'left', borderRadius: 0, border: 'none', borderBottom: '1px solid #222', background: '#111', color: '#fff', boxShadow: 'none' }}
                  >
                    {customer.name} - Standard {customer.standard_minutes_balance || 0} / Hybrid {customer.hybrid_minutes_balance || 0}
                  </button>
                ))}
              </div>
            )}
          </div>
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

  function renderReportTable(title, rows, columns) {
    return (
      <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '14px', padding: '12px', maxHeight: '320px', overflow: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        {rows.length === 0 ? <p style={{ color: '#aaa' }}>No data found for this range.</p> : (
          <div style={{ minWidth: '680px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns.length}, minmax(120px, 1fr))`, gap: '8px', color: '#d4a853', fontWeight: 'bold', borderBottom: '1px solid #333', paddingBottom: '8px' }}>
              {columns.map((column) => <span key={column.key}>{column.label}</span>)}
            </div>
            {rows.map((row, index) => (
              <div key={`${title}-${index}`} style={{ display: 'grid', gridTemplateColumns: `repeat(${columns.length}, minmax(120px, 1fr))`, gap: '8px', borderBottom: '1px solid #222', padding: '8px 0' }}>
                {columns.map((column) => <span key={column.key}>{column.format ? column.format(row[column.key], row) : row[column.key] ?? '-'}</span>)}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  function renderManagerReportsPanel() {
    if (!showManagerView) return null
    const money = (value) => `GBP ${Number(value || 0).toFixed(2)}`

    return renderCollapsibleSection(
      'Reports',
      collapseReports,
      setCollapseReports,
      <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '14px', padding: '14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '12px' }}>
          <input type="date" value={reportsStartDate} onChange={(e) => setReportsStartDate(e.target.value)} style={{ padding: '10px' }} />
          <input type="date" value={reportsEndDate} onChange={(e) => setReportsEndDate(e.target.value)} style={{ padding: '10px' }} />
          <select value={reportsStaffFilter} onChange={(e) => setReportsStaffFilter(e.target.value)} style={{ padding: '10px' }}>
            <option value="">All staff</option>
            {staff.map((member) => <option key={member.id} value={member.name}>{member.name}</option>)}
          </select>
          <input type="number" step="0.1" placeholder="Fallback commission %" value={reportsCommissionPercent} onChange={(e) => setReportsCommissionPercent(e.target.value)} style={{ padding: '10px' }} />
          <input type="number" step="0.1" placeholder="Product commission %" value={reportsProductCommissionPercent} onChange={(e) => setReportsProductCommissionPercent(e.target.value)} style={{ padding: '10px' }} />
          <input type="number" step="0.1" placeholder="Spray tan commission %" value={reportsSprayTanCommissionPercent} onChange={(e) => setReportsSprayTanCommissionPercent(e.target.value)} style={{ padding: '10px' }} />
          <input type="number" step="0.1" placeholder="Promo commission %" value={reportsPromoCommissionPercent} onChange={(e) => setReportsPromoCommissionPercent(e.target.value)} style={{ padding: '10px' }} />
          <input type="number" step="0.01" placeholder="Flat commission/service" value={reportsFlatServiceCommission} onChange={(e) => setReportsFlatServiceCommission(e.target.value)} style={{ padding: '10px' }} />
          <button onClick={generateManagerReports} disabled={managerReportsLoading}>{managerReportsLoading ? 'Generating...' : 'Generate Reports'}</button>
          <button onClick={exportManagerReports}>Export Reports CSV</button>
        </div>
        {managerReportsError && <p style={{ color: '#ff7875', fontWeight: 'bold' }}>{managerReportsError}</p>}
        {!managerReportsData ? (
          <p style={{ color: '#aaa' }}>Choose a date range and generate reports. Older rows with missing staff fields will show as Unknown staff.</p>
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            {renderReportTable('Product Sales by Staff', managerReportsData.productSalesByStaff, [
              { key: 'staff_name', label: 'Staff' },
              { key: 'product_name', label: 'Product' },
              { key: 'category', label: 'Category' },
              { key: 'quantity', label: 'Qty' },
              { key: 'total', label: 'Sales', format: money }
            ])}
            {renderReportTable('Staff Commission Report', managerReportsData.staffCommission, [
              { key: 'staff_name', label: 'Staff' },
              { key: 'sunbed_minutes_sold', label: 'Sunbed mins' },
              { key: 'sunbed_packages_total', label: 'Sunbed/packages', format: money },
              { key: 'product_sales_total', label: 'Product sales', format: money },
              { key: 'promo_sales_total', label: 'Promo sales', format: money },
              { key: 'spray_tan_sales_total', label: 'Spray tans', format: money },
              { key: 'deposits_taken', label: 'Deposits', format: money },
              { key: 'balances_taken', label: 'Balances', format: money },
              { key: 'total_revenue', label: 'Attributed revenue', format: money },
              { key: 'estimated_commission', label: 'Est. commission', format: money }
            ])}
            {renderReportTable('Product Sales Summary', managerReportsData.productSummary, [
              { key: 'product_name', label: 'Product' },
              { key: 'category', label: 'Category' },
              { key: 'quantity', label: 'Qty sold' },
              { key: 'total', label: 'Revenue', format: money }
            ])}
            {renderReportTable('Promo Sales Report', managerReportsData.promoSales, [
              { key: 'promo_name', label: 'Promo' },
              { key: 'count', label: 'Sales' },
              { key: 'minutes', label: 'Minutes' },
              { key: 'revenue', label: 'Revenue', format: money }
            ])}
            {renderReportTable('Customer Spend Report', managerReportsData.customerSpend, [
              { key: 'customer_name', label: 'Customer' },
              { key: 'minutes_topups', label: 'Minutes', format: money },
              { key: 'product_purchases', label: 'Products', format: money },
              { key: 'spray_tan_payments', label: 'Spray tans', format: money },
              { key: 'total', label: 'Total', format: money }
            ])}
            {renderReportTable('Minutes Sales Report', [
              { minute_type: 'Standard', ...managerReportsData.minutesSales.standard, average_value: managerReportsData.minutesSales.standard.minutes ? managerReportsData.minutesSales.standard.revenue / managerReportsData.minutesSales.standard.minutes : 0 },
              { minute_type: 'Hybrid', ...managerReportsData.minutesSales.hybrid, average_value: managerReportsData.minutesSales.hybrid.minutes ? managerReportsData.minutesSales.hybrid.revenue / managerReportsData.minutesSales.hybrid.minutes : 0 }
            ], [
              { key: 'minute_type', label: 'Type' },
              { key: 'minutes', label: 'Minutes sold' },
              { key: 'revenue', label: 'Revenue', format: money },
              { key: 'average_value', label: 'Avg value/min', format: money }
            ])}
            {renderReportTable('Spray Tan Report', managerReportsData.sprayTan, [
              { key: 'service', label: 'Service' },
              { key: 'count', label: 'Bookings' },
              { key: 'pending', label: 'Pending' },
              { key: 'deposits_paid', label: 'Deposits', format: money },
              { key: 'balances_due', label: 'Balances due', format: money },
              { key: 'completed', label: 'Completed' },
              { key: 'cancelled', label: 'Cancelled' },
              { key: 'artists', label: 'Artists' }
            ])}
            {renderReportTable('Staff Activity Report', managerReportsData.staffActivity, [
              { key: 'staff_name', label: 'Staff' },
              { key: 'bookings', label: 'Bookings' },
              { key: 'product_sales', label: 'Product sales', format: money },
              { key: 'cash_ups', label: 'Cash-ups' },
              { key: 'corrections', label: 'Corrections/voids' }
            ])}
            {renderReportTable('Stock Movement Report', managerReportsData.stockMovement, [
              { key: 'name', label: 'Product' },
              { key: 'category', label: 'Category' },
              { key: 'current_stock', label: 'Current stock' },
              { key: 'status', label: 'Status' }
            ])}
          </div>
        )}
      </div>
    )
  }

  function renderDailyTakingsPanel() {
    const summary = getDailyTakingsSummary()
    const sprayTanReceiptsTotal = getDailySprayTanReceiptTotal()
    const cashUpStaff = cashUpExistingRecord?.cash_up_completed_by_staff || cashUpExistingRecord?.manager_name || 'Not recorded'
    const itemStyle = { background: '#0b0b0b', border: '1px solid #333', borderRadius: '14px', padding: '14px' }

    return renderCollapsibleSection(
      'Daily Takings / Manager View',
      collapseDailyTakings,
      setCollapseDailyTakings,
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0 }}>Daily Takings Report - {new Date(`${dailyReportDate}T00:00:00`).toLocaleDateString('en-GB')}</h3>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input type="date" value={dailyReportDate} onChange={(e) => setDailyReportDate(e.target.value)} style={{ padding: '10px' }} />
            <button onClick={generateDailyTakingsReport} disabled={dailyReportLoading}>{dailyReportLoading ? 'Generating...' : 'Generate Daily Takings Report'}</button>
            <button onClick={() => window.print()}>Print</button>
            <button onClick={copyDailyTakingsReport}>Copy</button>
            <button onClick={exportDailyTakingsReport}>Export CSV</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
          <div style={itemStyle}><span>Total revenue</span><h2>£{summary.totalRevenue.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Card</span><h2>£{summary.cardTotal.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Cash</span><h2>£{summary.cashTotal.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Bank transfer</span><h2>£{summary.bankTransferTotal.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Other</span><h2>£{summary.otherTotal.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Minutes sold</span><h2>{summary.totalMinutes}</h2></div>
          <div style={itemStyle}><span>Product sales</span><h2>£{summary.productRevenue.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Minutes sales</span><h2>GBP {summary.minutesRevenue.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Spray tan receipts</span><h2>GBP {sprayTanReceiptsTotal.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Payment count</span><h2>{summary.paymentCount}</h2></div>
          <div style={itemStyle}><span>Cash-up completed by</span><h2 style={{ fontSize: '20px' }}>{cashUpStaff}</h2></div>
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
            <select
              value={floatMovementStaffId || getCurrentStaffUser()?.id || ''}
              disabled={!canEditCashUp || (floatMovementEditingId && !showManagerView)}
              onChange={(e) => setFloatMovementStaffId(e.target.value)}
              style={{ padding: '10px' }}
            >
              <option value="">Select staff member</option>
              {staff.filter((member) => member.is_active !== false).map((member) => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </select>
            <button onClick={saveFloatMovement} disabled={floatMovementSaving || !canEditCashUp || (floatMovementEditingId && !showManagerView)}>
              {floatMovementSaving ? 'Saving...' : floatMovementEditingId ? 'Save Movement' : 'Add Float Movement'}
            </button>
            {floatMovementEditingId && <button onClick={clearFloatMovementForm}>Cancel Edit</button>}
          </div>
          <p style={{ color: '#aaa', marginBottom: '8px' }}>
            Float movement staff: <strong>{getSelectedFloatMovementStaff()?.name || 'Not signed in'}</strong>
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
          <div style={itemStyle}><span>Other payment total / manual adjustments</span><h2>£{summary.otherTotal.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Product sales</span><h2>£{summary.productRevenue.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Sunbed minutes/package sales</span><h2>£{summary.sunbedPackageRevenue.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Promo sales</span><h2>£{summary.promoRevenue.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Spray tan sales</span><h2>£{summary.sprayTanRevenue.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Deposits</span><h2>£{summary.sprayTanDepositRevenue.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Balances</span><h2>£{summary.sprayTanBalanceRevenue.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Total revenue</span><h2>£{summary.totalRevenue.toFixed(2)}</h2></div>
          <div style={itemStyle}><span>Expected cash in till</span><h2>£{expectedCash.toFixed(2)}</h2></div>
        </div>

        <div style={{ border: '1px solid #333', borderRadius: '12px', padding: '12px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
            <h3 style={{ margin: 0 }}>Cash Denomination Counter</h3>
            <strong style={{ color: '#d4a853' }}>Counted total: £{cashDenominationTotal.toFixed(2)}</strong>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(105px, 1fr))', gap: '8px' }}>
            {CASH_DENOMINATIONS.map((denomination) => (
              <label key={denomination.key} style={{ display: 'grid', gap: '4px', color: '#ddd', fontSize: '13px' }}>
                {denomination.label}
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={cashDenominations[denomination.key]}
                  disabled={!canEditCashUp}
                  onChange={(e) => updateCashDenomination(denomination.key, e.target.value)}
                  style={{ padding: '9px' }}
                />
              </label>
            ))}
          </div>
          <p style={{ color: '#aaa', marginBottom: 0 }}>The counted total fills Actual cash counted automatically. Managers can still override the actual cash field if needed.</p>
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

    const dateLabel = `${new Date(`${exportFromDate}T00:00:00`).toLocaleDateString('en-GB')} to ${new Date(`${exportToDate || exportFromDate}T00:00:00`).toLocaleDateString('en-GB')}`
    const exportButtonStyle = { textAlign: 'left', padding: '12px' }

    return renderCollapsibleSection(
      'Exports / Backups',
      collapseExports,
      setCollapseExports,
      <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '14px', padding: '14px' }}>
        <p style={{ color: '#aaa', marginTop: 0 }}>
          Export CSV backups without changing salon data. Manager View access is required.
        </p>

        <h3 style={{ marginTop: 0 }}>Selected Date Range - {dateLabel}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '14px' }}>
          <label style={{ display: 'grid', gap: '5px', color: '#ddd' }}>
            Export from date
            <input type="date" value={exportFromDate} onChange={(e) => setExportFromDate(e.target.value)} style={{ padding: '10px' }} />
          </label>
          <label style={{ display: 'grid', gap: '5px', color: '#ddd' }}>
            Export to date
            <input type="date" value={exportToDate} onChange={(e) => setExportToDate(e.target.value)} style={{ padding: '10px' }} />
          </label>
        </div>

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
    const activeStaff = dedupeStaffByName(staff).filter((member) => member.is_active !== false)

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

  function renderManagerSectionNav() {
    if (!showManagerView) return null

    const sectionButtons = [
      { key: 'staff', label: 'Staff Management', isOpen: !collapseStaffManagement },
      { key: 'maintenance', label: 'Maintenance', isOpen: !collapseMaintenance },
      { key: 'products', label: 'Products', isOpen: !collapseProducts },
      { key: 'promos', label: 'Offers / Promos', isOpen: !collapsePromos },
      { key: 'corrections', label: 'Booking / Payment Corrections', isOpen: !collapseCorrections },
      { key: 'wix', label: 'Wix Booking Sync', isOpen: !collapseWixSync },
      { key: 'receipts', label: 'Receipt History', isOpen: !collapseReceipts },
      { key: 'exports', label: 'Exports / Backups', isOpen: !collapseExports },
      { key: 'daily', label: 'Daily Takings', isOpen: !collapseDailyTakings },
      { key: 'reports', label: 'Reports', isOpen: !collapseReports }
    ]

    return (
      <div style={{ background: '#111', border: '1px solid rgba(212,168,83,0.25)', borderRadius: '16px', padding: '12px', marginBottom: '18px' }}>
        <strong style={{ display: 'block', marginBottom: '10px', color: '#d4a853' }}>Manager View</strong>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {sectionButtons.map((item) => (
            <button
              key={item.label}
              onClick={() => openManagerSection(item.key, item.isOpen)}
              style={{
                background: item.isOpen ? '#d4a853' : '#1e1e1e',
                color: item.isOpen ? '#050505' : '#fff',
                border: item.isOpen ? '1px solid #d4a853' : '1px solid rgba(212,168,83,0.35)'
              }}
            >
              {item.label}
            </button>
          ))}
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
            <button onClick={emailSaleReceipt}>Email Receipt</button>
            <button onClick={() => setSaleReceipt(null)}>Close</button>
          </div>
        </div>
      </div>
    )
  }

  function renderCollapsibleSection(title, isCollapsed, setIsCollapsed, children) {
    if (isCollapsed) return null

    return (
      <div style={{ marginBottom: '18px', border: '1px solid rgba(212,168,83,0.25)', borderRadius: '18px', overflow: 'hidden', background: '#111' }}>
        <div
          style={{
            width: '100%',
            borderRadius: 0,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 18px',
            fontSize: '16px',
            background: '#0b0b0b',
            borderBottom: '1px solid rgba(212,168,83,0.2)'
          }}
        >
          <span>{title}</span>
          <button onClick={() => setIsCollapsed(true)}>Hide</button>
        </div>

        <div style={{ padding: '16px' }}>
          {children}
        </div>
      </div>
    )
  }
  function getStaffScheduleEntryStyle(entry) {
    const approval = getStaffScheduleApprovalStatus(entry)
    const type = entry.schedule_type
    const style = (() => {
      if (type === 'holiday') return { border: '1px solid rgba(54, 120, 73, 0.55)', background: 'linear-gradient(180deg, #2f7146, #1f4d31)', color: '#f7fff8' }
      if (type === 'shift') return { border: '1px solid rgba(66, 115, 166, 0.58)', background: 'linear-gradient(180deg, #315f91, #203f63)', color: '#f5faff' }
      if (type === 'spray_tan_available') return { border: '1px solid rgba(117, 82, 154, 0.6)', background: 'linear-gradient(180deg, #67448a, #442d5f)', color: '#fbf6ff' }
      if (type === 'time_off') return { border: '1px solid rgba(184, 119, 37, 0.6)', background: 'linear-gradient(180deg, #a86f24, #704715)', color: '#fff8eb' }
      if (type === 'shop_closed') return { border: '1px solid rgba(116, 112, 105, 0.58)', background: 'linear-gradient(180deg, #67625a, #45413c)', color: '#fbf7ef' }
      if (type === 'training') return { border: '1px solid rgba(45, 133, 126, 0.6)', background: 'linear-gradient(180deg, #2b7c76, #1d5451)', color: '#f1fffd' }
      return { border: '1px solid rgba(140, 101, 54, 0.56)', background: 'linear-gradient(180deg, #8a6336, #5f4224)', color: '#fff8ee' }
    })()

    if (approval === 'pending') return { ...style, boxShadow: 'inset 0 0 0 2px rgba(255, 204, 102, 0.55)' }
    if (approval === 'rejected') return { ...style, boxShadow: 'inset 0 0 0 2px rgba(122, 31, 42, 0.65)' }
    return style
  }

  function renderStaffScheduleEntry(entry, showActions = false) {
    const approval = getStaffScheduleApprovalStatus(entry)
    const entryStyle = getStaffScheduleEntryStyle(entry)
    const canEditEntry = showActions || canCurrentStaffEditScheduleEntry(entry)
    const approvalStyle = approval === 'approved'
      ? { background: '#2f7a4b', color: '#fff' }
      : approval === 'pending'
        ? { background: '#b56a22', color: '#050505' }
        : { background: '#7a1f2a', color: '#fff' }

    return (
      <div key={entry.id} style={{ ...entryStyle, borderRadius: '7px', padding: '7px 26px 7px 7px', marginBottom: '6px', position: 'relative' }}>
        <button
          onClick={() => deleteStaffScheduleEntry(entry)}
          title="Delete request"
          aria-label="Delete staff calendar request"
          style={{
            position: 'absolute',
            top: '5px',
            right: '5px',
            width: '16px',
            height: '16px',
            minWidth: '16px',
            padding: 0,
            border: '1px solid rgba(212,168,83,0.22)',
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.28)',
            color: '#d4a853',
            boxShadow: 'none',
            fontSize: '11px',
            lineHeight: '13px'
          }}
        >
          ×
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
          <strong style={{ fontSize: '13px' }}>{entry.staff_name || 'Shop'}</strong>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ ...approvalStyle, borderRadius: '7px', padding: '2px 6px', fontWeight: 'bold', fontSize: '11px' }}>
              {formatStatus(approval)}
            </span>
            <span style={{ color: entry.is_available === false ? '#ffe1df' : '#fff3c4', fontWeight: 'bold', fontSize: '11px' }}>
              {entry.is_available === false ? 'Unavailable' : 'Available'}
            </span>
          </div>
        </div>
        <p style={{ margin: '4px 0', color: 'rgba(255,255,255,0.9)', fontSize: '12px' }}>
          {formatStaffScheduleTime(entry.start_time)} - {formatStaffScheduleTime(entry.end_time)} - {getStaffScheduleTypeLabel(entry.schedule_type)}
        </p>
        {entry.notes && <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.76)', fontSize: '11px' }}>{entry.notes}</p>}
        {(approval === 'pending' || canEditEntry) && (
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '7px' }}>
            {approval === 'pending' && <button onClick={() => updateStaffScheduleApproval(entry, 'approved')} style={{ padding: '5px 7px', fontSize: '11px' }}>Approve</button>}
            {approval === 'pending' && <button onClick={() => updateStaffScheduleApproval(entry, 'rejected')} style={{ padding: '5px 7px', fontSize: '11px' }}>Deny</button>}
            {canEditEntry && <button onClick={() => editStaffScheduleEntry(entry)} style={{ padding: '5px 7px', fontSize: '11px' }}>Edit</button>}
          </div>
        )}
      </div>
    )
  }

  function renderStaffOwnSchedulePanel() {
    return null
  }

  function renderStaffScheduleModal() {
    if (!staffScheduleModalOpen) return null

    const isManager = showManagerView

    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#1e1e1e', border: '1px solid rgba(212,168,83,0.35)', borderRadius: '18px', padding: '22px', width: '620px', maxWidth: '94%', maxHeight: '88vh', overflowY: 'auto' }}>
          <h2 style={{ marginTop: 0 }}>{staffScheduleEditingId ? 'Move/Edit Staff Calendar Entry' : isManager ? 'Add Staff Calendar Entry' : 'Submit Staff Calendar Request'}</h2>
          {!isManager && <p style={{ color: '#ffcc66', marginTop: 0 }}>Staff requests save as pending until a manager approves them.</p>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
            <select value={staffScheduleStaffId} onChange={(e) => setStaffScheduleStaffId(e.target.value)} style={{ padding: '10px' }}>
              <option value="">Staff member</option>
              {staff.filter((member) => member.is_active !== false).map((member) => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </select>
            <input type="date" value={staffScheduleDate} onChange={(e) => setStaffScheduleDate(e.target.value)} style={{ padding: '10px' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#111', border: '1px solid #333', borderRadius: '8px', padding: '10px' }}>
              <input
                type="checkbox"
                checked={staffScheduleAllDay}
                onChange={(e) => setStaffScheduleAllDay(e.target.checked)}
              />
              All day
            </label>
            {!staffScheduleAllDay && (
              <>
                <input type="time" value={staffScheduleStartTime} onChange={(e) => setStaffScheduleStartTime(e.target.value)} style={{ padding: '10px' }} />
                <input type="time" value={staffScheduleEndTime} onChange={(e) => setStaffScheduleEndTime(e.target.value)} style={{ padding: '10px' }} />
              </>
            )}
            <select value={staffScheduleType} onChange={(e) => setStaffScheduleType(e.target.value)} style={{ padding: '10px' }}>
              {STAFF_SCHEDULE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
            {isManager && (
              <select value={staffScheduleApprovalStatus} onChange={(e) => setStaffScheduleApprovalStatus(e.target.value)} style={{ padding: '10px' }}>
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
              </select>
            )}
          </div>

          <textarea
            placeholder="Notes"
            value={staffScheduleNotes}
            onChange={(e) => setStaffScheduleNotes(e.target.value)}
            style={{ width: '100%', minHeight: '80px', padding: '10px', marginTop: '10px', background: '#111', color: 'white', border: '1px solid #333', borderRadius: '10px', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />

          <label style={{ display: 'block', marginTop: '10px' }}>
            <input type="checkbox" checked={staffScheduleAvailable} onChange={(e) => setStaffScheduleAvailable(e.target.checked)} style={{ marginRight: '8px' }} />
            Available for this entry
          </label>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '14px' }}>
            <button onClick={saveStaffScheduleEntry} disabled={staffScheduleSaving}>{staffScheduleSaving ? 'Saving...' : staffScheduleEditingId ? 'Save Changes' : isManager ? 'Save Entry' : 'Submit Request'}</button>
            <button onClick={clearStaffScheduleForm}>Cancel</button>
          </div>
        </div>
      </div>
    )
  }

  function renderStaffCalendarPanel() {
    const currentStaff = getCurrentStaffUser()
    if (!currentStaff) return null

    const weekDates = getWeekDates(selectedDate)
    const filteredEntries = getFilteredStaffSchedule()
    const isManager = showManagerView
    const visibleStaff = staff
      .filter((member) => member.is_active !== false)
      .filter((member) => !staffScheduleFilterStaffId || String(member.id) === String(staffScheduleFilterStaffId))

    return renderCollapsibleSection(
      'Staff Calendar',
      collapseStaffCalendar,
      setCollapseStaffCalendar,
      <div style={{ background: 'linear-gradient(180deg, #fff9ed, #f2eadb)', border: '1px solid rgba(122, 94, 45, 0.22)', borderRadius: '12px', padding: '12px', color: '#1c1710' }}>
        {staffScheduleLoadError && <p style={{ color: '#ff7875' }}>{staffScheduleLoadError}</p>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '14px' }}>
          <select value={staffScheduleFilterStaffId} onChange={(e) => setStaffScheduleFilterStaffId(e.target.value)} style={{ padding: '10px' }}>
            <option value="">All staff</option>
            {staff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
          <select value={staffScheduleFilterType} onChange={(e) => setStaffScheduleFilterType(e.target.value)} style={{ padding: '10px' }}>
            <option value="">All schedule types</option>
            {STAFF_SCHEDULE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <h3 style={{ color: '#1c1710', margin: 0 }}>Weekly View</h3>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" onClick={() => moveSelectedWeek(-1)}>Previous Week</button>
            <strong style={{ color: '#6b4b17' }}>{new Date(`${weekDates[0]}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - {new Date(`${weekDates[6]}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
            <button type="button" onClick={() => setSelectedDate(formatLocalDate(new Date()))}>Current Week</button>
            <button type="button" onClick={() => moveSelectedWeek(1)}>Next Week</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: '980px', display: 'grid', gridTemplateColumns: '160px repeat(7, minmax(120px, 1fr))', gap: '8px' }}>
            <div style={{ color: '#6b4b17', fontWeight: 'bold' }}>Staff</div>
            {weekDates.map((date) => (
              <div key={date} style={{ color: '#6b4b17', fontWeight: 'bold' }}>
                {new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}
              </div>
            ))}
            {visibleStaff.map((member) => (
              <Fragment key={member.id}>
                <div style={{ background: '#fffdf7', border: '1px solid rgba(122, 94, 45, 0.2)', borderRadius: '10px', padding: '10px', fontWeight: 'bold', color: '#1c1710' }}>{member.name}</div>
                {weekDates.map((date) => {
                  const dayEntries = filteredEntries.filter((entry) => String(entry.staff_id) === String(member.id) && entry.schedule_date === date)
                  return (
                    <div key={`${member.id}-${date}`} style={{ background: '#fffdf8', border: '1px solid rgba(122, 94, 45, 0.16)', borderRadius: '10px', padding: '8px', minHeight: '74px', display: 'flex', flexDirection: 'column', justifyContent: dayEntries.length === 0 ? 'center' : 'flex-start' }}>
                      {dayEntries.map((entry) => renderStaffScheduleEntry(entry, isManager))}
                      <button
                        onClick={() => startStaffScheduleEntryForCell(member, date)}
                        title={`Add entry for ${member.name}`}
                        style={{ alignSelf: 'center', width: '18px', height: '18px', minWidth: '18px', padding: 0, marginTop: dayEntries.length === 0 ? 0 : '4px', border: 'none', background: 'transparent', boxShadow: 'none', color: '#d4a853', fontSize: '18px', lineHeight: '18px' }}
                      >
                        +
                      </button>
                    </div>
                  )
                })}
              </Fragment>
            ))}
          </div>
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
            <h3>{getBedName(bed.id)}</h3>
            {bed.is_out_of_service && <p style={{ color: '#ff7875', fontWeight: 'bold' }}>OUT OF SERVICE</p>}
            <p>Runtime: <strong>{getBedRuntimeHours(bed).toFixed(2)} hours</strong></p>
            <p>Tube target: <strong>{getBedTargetHours(bed)} hours</strong></p>
            <p>Hours remaining: <strong>{getBedHoursRemaining(bed).toFixed(2)}</strong></p>
            <p>Last tube change: {bed.last_tube_change_date ? new Date(bed.last_tube_change_date).toLocaleDateString('en-GB') : 'Not recorded'}</p>
            <label style={{ display: 'grid', gap: '5px', color: '#ddd', marginBottom: '8px' }}>
              Last tube change date
              <input
                type="date"
                defaultValue={bed.last_tube_change_date || ''}
                onBlur={(e) => updateBedMaintenance(bed.id, { last_tube_change_date: e.target.value || null })}
                style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }}
              />
            </label>
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
    const renderSubcategoryControls = ({ category, selected, setSelected }) => {
      if (!shouldShowProductSubcategories(category)) return null
      return (
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', background: '#111', border: '1px solid #333', borderRadius: '10px', padding: '10px' }}>
          <strong style={{ color: '#d4a853' }}>Subcategories</strong>
          {PRODUCT_SUBCATEGORIES.map((subcategory) => (
            <label key={subcategory} style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', color: '#ddd' }}>
              <input
                type="checkbox"
                checked={selected.includes(subcategory)}
                onChange={() => setSelected(toggleProductSubcategory(selected, subcategory))}
              />
              {subcategory}
            </label>
          ))}
        </div>
      )
    }

    return renderCollapsibleSection(
      'Products',
      collapseProducts,
      setCollapseProducts,
      <>
        {productLoadError && <p style={{ color: '#ff7875' }}>{productLoadError}</p>}

        <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '14px', padding: '14px', marginBottom: '15px' }}>
          <h3 style={{ marginTop: 0 }}>Product Categories</h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
            <input
              placeholder="New category"
              value={newProductCategoryName}
              onChange={(e) => setNewProductCategoryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addProductCategory()
              }}
              style={{ flex: '1 1 220px', padding: '10px' }}
            />
            <button type="button" onClick={addProductCategory}>Add Category</button>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {productCategories.map((category) => {
              const categoryKey = getProductCategoryKey(category)
              const assignedCount = products.filter((product) => getProductCategoryKey(product.category) === categoryKey || normalizeProductCategory(product.category) === category.value).length
              return (
                <span key={getProductCategoryKey(category)} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', border: '1px solid rgba(212,168,83,0.35)', background: '#111', color: '#f3e6c3', padding: '7px 9px', borderRadius: '8px' }}>
                  {category.label}
                  {assignedCount > 0 && <small style={{ color: '#aaa' }}>{assignedCount}</small>}
                  <button
                    type="button"
                    onClick={() => deleteProductCategory(category)}
                    title={assignedCount > 0 ? 'Reassign products before deleting' : 'Delete category'}
                    style={{ width: '18px', height: '18px', minWidth: '18px', padding: 0, borderRadius: '50%', border: '1px solid rgba(212,168,83,0.3)', background: '#080808', color: assignedCount > 0 ? '#777' : '#d4a853', boxShadow: 'none', lineHeight: '14px' }}
                  >
                    x
                  </button>
                </span>
              )
            })}
          </div>
          <p style={{ color: '#aaa', margin: '10px 0 0', fontSize: '13px' }}>Categories in use cannot be deleted until those products are reassigned.</p>
        </div>

        <div style={{ background: '#10100f', border: '1px solid rgba(212,168,83,0.45)', borderRadius: '14px', padding: '14px', marginBottom: '15px' }}>
          <h3 style={{ marginTop: 0, color: '#d4a853' }}>Add New Product</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
            <input placeholder="Product name" value={productName} onChange={(e) => setProductName(e.target.value)} style={{ padding: '10px' }} />
            <select value={productCategory} onChange={(e) => { setProductCategory(e.target.value); if (!shouldShowProductSubcategories(e.target.value)) setProductSubcategories([]) }} style={{ padding: '10px' }}>
              {productCategories.map((category) => (
                <option key={getProductCategoryKey(category)} value={category.value}>{category.label}</option>
              ))}
            </select>
            {renderSubcategoryControls({ category: productCategory, selected: productSubcategories, setSelected: setProductSubcategories })}
            <input type="number" step="0.01" placeholder="Price" value={productPrice} onChange={(e) => setProductPrice(e.target.value)} style={{ padding: '10px' }} />
            <input type="number" placeholder="Stock quantity" value={productStockQuantity} onChange={(e) => setProductStockQuantity(e.target.value)} style={{ padding: '10px' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ddd' }}>
              <input type="checkbox" checked={productIsActive} onChange={(e) => setProductIsActive(e.target.checked)} />
              Active
            </label>
            <button onClick={saveProduct}>Add Product</button>
          </div>
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

        <div style={{ background: '#14120f', border: '1px solid rgba(212,168,83,0.25)', borderRadius: '14px', padding: '14px' }}>
          <h3 style={{ marginTop: 0, color: '#f0d28a' }}>Manage Existing Product</h3>
          <select
            value={selectedProductManagementId}
            onChange={(e) => selectProductForManagement(e.target.value)}
            style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }}
          >
            <option value="">Select product...</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} — {getProductCategoryLabel(product.category)} — £{Number(product.price || 0).toFixed(2)} — Stock {getProductStockQuantity(product)} — {getProductStockStatus(product)} — {isProductActive(product) ? 'Active' : 'Inactive'}
              </option>
            ))}
          </select>

          {selectedProduct && (
            <div style={{ marginTop: '12px', padding: '12px', background: '#111', borderRadius: '12px', border: '1px solid #333' }}>
              <div>
                <strong>{selectedProduct.name}</strong><br />
                <span>{getProductCategoryLabel(selectedProduct.category)} — £{Number(selectedProduct.price || 0).toFixed(2)} — Stock {getProductStockQuantity(selectedProduct)}</span><br />
                <span style={getProductStockStatusStyle(selectedProduct)}>{getProductStockStatus(selectedProduct)}</span><br />
                <span>Status: {isProductActive(selectedProduct) ? 'Active' : 'Inactive'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', alignItems: 'center', marginTop: '12px' }}>
                <input placeholder="Product name" value={editProductName} onChange={(e) => setEditProductName(e.target.value)} style={{ padding: '10px' }} />
                <select value={editProductCategory} onChange={(e) => { setEditProductCategory(e.target.value); if (!shouldShowProductSubcategories(e.target.value)) setEditProductSubcategories([]) }} style={{ padding: '10px' }}>
                  {productCategories.map((category) => (
                    <option key={getProductCategoryKey(category)} value={category.value}>{category.label}</option>
                  ))}
                </select>
                {renderSubcategoryControls({ category: editProductCategory, selected: editProductSubcategories, setSelected: setEditProductSubcategories })}
                <input type="number" step="0.01" placeholder="Price" value={editProductPrice} onChange={(e) => setEditProductPrice(e.target.value)} style={{ padding: '10px' }} />
                <input type="number" placeholder="Stock quantity" value={editProductStockQuantity} onChange={(e) => setEditProductStockQuantity(e.target.value)} style={{ padding: '10px' }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ddd' }}>
                  <input type="checkbox" checked={editProductIsActive} onChange={(e) => setEditProductIsActive(e.target.checked)} />
                  Active
                </label>
                <button onClick={saveProductChanges} style={{ minWidth: '190px', fontSize: '13px', whiteSpace: 'normal' }}>Save Product Changes</button>
                <button onClick={() => deactivateProduct(selectedProduct)}>Deactivate</button>
                <button onClick={() => deleteProduct(selectedProduct)} style={{ borderColor: 'rgba(255,120,117,0.5)', color: '#ffaaa6' }}>Delete Product</button>
              </div>
              <div style={{ marginTop: '12px', padding: '12px', background: '#0b0b0b', border: '1px solid #333', borderRadius: '10px' }}>
                <strong>Stock adjustment</strong>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginTop: '10px' }}>
                  <select value={stockMovementType} onChange={(e) => setStockMovementType(e.target.value)} style={{ padding: '10px' }}>
                    <option value="restock">Add stock / delivery</option>
                    <option value="damaged">Damaged</option>
                    <option value="lost">Lost</option>
                    <option value="manual_remove">Manual remove</option>
                  </select>
                  <input type="number" placeholder="Quantity" value={stockMovementQuantity} onChange={(e) => setStockMovementQuantity(e.target.value)} style={{ padding: '10px' }} />
                  <input placeholder="Restock/damage/loss note" value={stockMovementNote} onChange={(e) => setStockMovementNote(e.target.value)} style={{ padding: '10px' }} />
                  <button onClick={adjustSelectedProductStock}>Save Stock Movement</button>
                </div>
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
              {showManagerView && (
                <select value={commissionStaffId} onChange={(e) => setCommissionStaffId(e.target.value)} style={{ width: '100%', padding: '10px', margin: '8px 0' }}>
                  <option value="">Commission staff: signed-in staff</option>
                  {staff.filter((member) => member.is_active !== false).map((member) => (
                    <option key={member.id} value={member.id}>{member.name}</option>
                  ))}
                </select>
              )}
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
              <button onClick={() => { setShowStandalonePOS(false); clearProductCart(); setPosCashReceived(''); setCommissionStaffId('') }} style={{ marginLeft: '10px' }}>Close</button>
            </div>
          </div>
        )}
      </>
    )
  }

  function renderPromosPanel() {
    if (!showManagerView) return null

    return renderCollapsibleSection(
      'Offers / Promos',
      collapsePromos,
      setCollapsePromos,
      <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '14px', padding: '14px' }}>
        {promoLoadError && <p style={{ color: '#ffcc66' }}>Promos table not loaded: {promoLoadError}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '10px' }}>
          <input placeholder="Promo name" value={promoName} onChange={(e) => setPromoName(e.target.value)} style={{ padding: '10px' }} />
          <input type="number" step="0.01" placeholder="Promo price" value={promoPrice} onChange={(e) => setPromoPrice(e.target.value)} style={{ padding: '10px' }} />
          <label style={{ display: 'grid', gap: '5px', color: '#ddd' }}>
            Offer starting
            <input type="date" value={promoValidFrom} onChange={(e) => setPromoValidFrom(e.target.value)} style={{ padding: '10px' }} />
          </label>
          <label style={{ display: 'grid', gap: '5px', color: '#ddd' }}>
            Offer finishing
            <input type="date" value={promoValidTo} onChange={(e) => setPromoValidTo(e.target.value)} style={{ padding: '10px' }} />
          </label>
          <input type="number" placeholder="Included minutes" value={promoIncludedMinutes} onChange={(e) => setPromoIncludedMinutes(e.target.value)} style={{ padding: '10px' }} />
          <select value={promoBedType} onChange={(e) => setPromoBedType(e.target.value)} style={{ padding: '10px' }}>
            <option value="any">Any bed</option>
            <option value="standard">Standard bed</option>
            <option value="hybrid">Hybrid bed</option>
          </select>
          <input type="number" min="0" step="1" placeholder="Minutes expiry days" value={promoMinutesExpiryDays} onChange={(e) => setPromoMinutesExpiryDays(e.target.value)} style={{ padding: '10px' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="checkbox" checked={promoActive} onChange={(e) => setPromoActive(e.target.checked)} />
            Active
          </label>
        </div>
        <textarea placeholder="Promo description" value={promoDescription} onChange={(e) => setPromoDescription(e.target.value)} style={{ width: '100%', minHeight: '60px', padding: '10px', marginBottom: '10px', boxSizing: 'border-box' }} />
        <div style={{ background: '#111', border: '1px solid #333', borderRadius: '12px', padding: '12px', marginBottom: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
            <strong>Included Product Choices</strong>
            <button type="button" onClick={addPromoChoiceGroup}>Add Product Choice Group</button>
          </div>
          {promoChoiceGroups.length === 0 ? (
            <p style={{ color: '#aaa', margin: 0 }}>No included product choices added.</p>
          ) : promoChoiceGroups.map((group, groupIndex) => {
            const allowedIds = group.allowed_product_ids || []
            const availableProducts = products.filter((product) => !allowedIds.map(Number).includes(Number(product.id)))
            return (
              <div key={groupIndex} style={{ background: '#0b0b0b', border: '1px solid rgba(212,168,83,0.22)', borderRadius: '10px', padding: '12px', marginBottom: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                  <input
                    placeholder="Group name, e.g. Bronzer sachet"
                    value={group.group_name || ''}
                    onChange={(e) => updatePromoChoiceGroup(groupIndex, { group_name: e.target.value })}
                    style={{ padding: '10px' }}
                  />
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Required quantity"
                    value={group.required_quantity || 1}
                    onChange={(e) => updatePromoChoiceGroup(groupIndex, { required_quantity: Number(e.target.value || 1) })}
                    style={{ padding: '10px' }}
                  />
                  <button type="button" onClick={() => deletePromoChoiceGroup(groupIndex)}>Delete Group</button>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <select
                    value={group.selected_product_id || ''}
                    onChange={(e) => updatePromoChoiceGroup(groupIndex, { selected_product_id: e.target.value })}
                    style={{ flex: '1 1 220px', padding: '10px' }}
                  >
                    <option value="">Choose allowed product...</option>
                    {availableProducts.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} - {getProductCategoryLabel(product.category)} - Stock {getProductStockQuantity(product)}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => addProductToPromoChoiceGroup(groupIndex)}>Add Product</button>
                </div>
                <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
                  {allowedIds.length === 0 ? (
                    <span style={{ color: '#aaa' }}>No products allowed yet.</span>
                  ) : allowedIds.map((productId) => {
                    const product = products.find((item) => Number(item.id) === Number(productId))
                    return (
                      <span key={productId} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', border: '1px solid rgba(212,168,83,0.35)', background: '#151515', padding: '6px 8px', borderRadius: '8px' }}>
                        {product?.name || `Product ${productId}`}
                        <button type="button" onClick={() => removeProductFromPromoChoiceGroup(groupIndex, productId)} style={{ width: '18px', height: '18px', minWidth: '18px', padding: 0, borderRadius: '50%', lineHeight: '14px' }}>x</button>
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <textarea placeholder="Staff notes" value={promoStaffNotes} onChange={(e) => setPromoStaffNotes(e.target.value)} style={{ width: '100%', minHeight: '60px', padding: '10px', marginBottom: '10px', boxSizing: 'border-box' }} />
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <button onClick={savePromo}>{promoEditingId ? 'Save Promo' : 'Create Promo'}</button>
          {promoEditingId && <button onClick={clearPromoForm}>Cancel Edit</button>}
        </div>
        <div style={{ display: 'grid', gap: '10px' }}>
          {promos.length === 0 ? <p style={{ color: '#aaa' }}>No promos found.</p> : promos.map((promo) => (
            <div key={promo.id} style={{ background: '#111', border: '1px solid #333', borderRadius: '12px', padding: '12px' }}>
              <strong>{promo.promo_name}</strong> - £{Number(promo.promo_price || 0).toFixed(2)} - {promo.active === false ? 'Inactive' : 'Active'}
              <p style={{ color: '#aaa', margin: '6px 0' }}>{promo.promo_description || 'No description'}</p>
              <p style={{ margin: '6px 0' }}>{Number(promo.included_minutes || 0)} mins / {formatStatus(promo.bed_type || 'any')} bed / expires {promo.minutes_expiry_days ? `${promo.minutes_expiry_days} days` : 'never'}</p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={() => editPromo(promo)}>Edit</button>
                <button onClick={async () => {
                  await supabase.from('Promos').update({ active: promo.active === false }).eq('id', promo.id)
                  await getPromos()
                }}>{promo.active === false ? 'Activate' : 'Deactivate'}</button>
                <button onClick={() => deletePromo(promo)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>
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
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
            <button onClick={jumpToSprayTanNow}>Jump to Now</button>
          </div>
        </div>

        <div style={{ display: 'none', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', marginBottom: '18px' }}>
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

        <div style={{ background: 'linear-gradient(180deg, rgba(205, 154, 143, 0.085), rgba(20, 16, 15, 0.96))', border: '1px solid rgba(212,168,83,0.25)', borderRadius: '16px', padding: '16px', overflowX: 'auto' }}>
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
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
            <button onClick={jumpToSprayTanNow}>Jump to Now</button>
          </div>
        </div>

        <div style={{ display: 'none', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', marginBottom: '18px' }}>
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

        <div style={{ background: 'linear-gradient(180deg, rgba(205, 154, 143, 0.085), rgba(20, 16, 15, 0.96))', border: '1px solid rgba(212,168,83,0.25)', borderRadius: '16px', padding: '16px', overflowX: 'auto' }}>
          <div style={{ minWidth: '980px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '90px repeat(3, minmax(250px, 1fr))', gap: '10px', padding: '0 0 10px', color: '#d4a853', fontWeight: 'bold' }}>
              <span>Time</span>
              {SPRAY_TAN_COLUMNS.map((column) => <span key={column.value}>{column.label}</span>)}
            </div>

            {timelineSlots.map((time) => {
              const currentRow = isCurrentTimelineSlot(time, 15)
              return (
              <div key={time} data-spraytan-current-time-row={currentRow ? 'true' : undefined} style={{ display: 'grid', gridTemplateColumns: '90px repeat(3, minmax(250px, 1fr))', gap: '10px', borderTop: currentRow ? '3px solid #ffcc66' : '1px solid #333', padding: '10px 0', minHeight: '82px' }}>
                <strong>{time}{currentRow && <><br /><span style={{ fontSize: '12px', color: '#ffcc66' }}>NOW</span></>}</strong>
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
              )
            })}
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
    const depositRequired = getDefaultSprayTanDeposit(sprayTanService)
    const depositPaid = sprayTanService === 'Patch Test' ? 0 : Number(sprayTanDepositPaid || 0)
    const existingBalancePaid = Number(sprayTanEditingBooking?.spraytan_balance_paid || 0)
    const balancePaymentAmount = Number(sprayTanBalancePaymentAmount || 0)
    const balanceDue = Math.max(0, servicePrice - depositPaid - existingBalancePaid - balancePaymentAmount)
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
          ) : renderCustomerSearchBox({ context: 'spraytan' })}
          {selectedStaff && <p style={{ color: '#d4a853', fontWeight: 'bold' }}>Staff selected for spray tan booking. Use deposit/payment fields if this visit is paid, or leave payment at 0 if free.</p>}

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
            <div><label>Deposit due</label><input type="number" step="0.01" value={depositRequired} disabled style={{ width: '100%', padding: '10px', marginTop: '5px' }} /></div>
            <div><label>Deposit paid</label><input type="number" step="0.01" value={depositPaid} disabled={sprayTanService === 'Patch Test'} onChange={(e) => {
              setSprayTanDepositPaid(e.target.value)
              setSprayTanDepositStatus(getSprayTanDepositStatus(sprayTanService, depositRequired, Number(e.target.value || 0)))
            }} style={{ width: '100%', padding: '10px', marginTop: '5px' }} /></div>
            <div><label>Deposit payment method</label>
              <select value={sprayTanDepositPaymentMethod} onChange={(e) => setSprayTanDepositPaymentMethod(e.target.value)} disabled={sprayTanService === 'Patch Test' || depositPaid <= 0} style={{ width: '100%', padding: '10px', marginTop: '5px' }}>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="bank_transfer">BACS / Bank Transfer</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div><label>Deposit status</label>
              <select value={sprayTanDepositStatus} onChange={(e) => setSprayTanDepositStatus(e.target.value)} disabled={sprayTanService === 'Patch Test'} style={{ width: '100%', padding: '10px', marginTop: '5px' }}>
                <option value="not_paid">Deposit Not Paid</option>
                <option value="pending">Deposit Pending</option>
                <option value="paid">Deposit Paid</option>
                <option value="not_required">Not Required</option>
              </select>
            </div>
            {sprayTanEditingBooking && (
              <>
                <div><label>Take Balance Payment</label><input type="number" min="0" step="0.01" value={sprayTanBalancePaymentAmount} onChange={(e) => setSprayTanBalancePaymentAmount(e.target.value)} placeholder="Amount paid now" style={{ width: '100%', padding: '10px', marginTop: '5px' }} /></div>
                <div><label>Balance payment method</label>
                  <select value={sprayTanBalancePaymentMethod} onChange={(e) => setSprayTanBalancePaymentMethod(e.target.value)} disabled={Number(sprayTanBalancePaymentAmount || 0) <= 0} style={{ width: '100%', padding: '10px', marginTop: '5px' }}>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">BACS / Bank Transfer</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </>
            )}
            {showManagerView && (
              <div><label>Commission staff</label>
                <select value={commissionStaffId} onChange={(e) => setCommissionStaffId(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }}>
                  <option value="">Signed-in staff</option>
                  {staff.filter((member) => member.is_active !== false).map((member) => (
                    <option key={member.id} value={member.id}>{member.name}</option>
                  ))}
                </select>
              </div>
            )}
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
            <div><label>Patch test date due / completed</label><input type="date" value={sprayTanPatchTestDate} onChange={(e) => setSprayTanPatchTestDate(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }} /></div>
          </div>

          <div style={{ background: '#0b0b0b', border: '1px solid #333', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
            <p style={{ margin: '0 0 6px' }}>Service price: <strong>£{servicePrice.toFixed(2)}</strong></p>
            <p style={{ margin: '0 0 6px' }}>Balance already paid: <strong>£{existingBalancePaid.toFixed(2)}</strong></p>
            <p style={{ margin: '0 0 6px' }}>Balance due: <strong>£{balanceDue.toFixed(2)}</strong></p>
            <p style={{ margin: 0 }}>Deposit status: <strong>{formatStatus(sprayTanDepositStatus || getSprayTanDepositStatus(sprayTanService, depositRequired, depositPaid))}</strong></p>
          </div>

          <label style={{ display: 'block', marginBottom: '8px', color: sprayTanPatchCompleted ? '#9ccfae' : '#ffcc66' }}>
            <input type="checkbox" checked={sprayTanPatchCompleted} disabled={sprayTanService === 'Patch Test'} onChange={(e) => setSprayTanPatchCompleted(e.target.checked)} style={{ marginRight: '8px' }} />
            Patch test completed
          </label>
          {latestPatchTestDate && <p style={{ color: patchWarning ? '#ffcc66' : '#9ccfae', marginTop: 0 }}>Existing patch test: {latestPatchTestDate.toLocaleDateString('en-GB')}{!patchWarning ? ' (valid)' : ''}</p>}
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
  const pendingStaffScheduleCount = getPendingStaffScheduleCount()

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
            {currentStaffUser && (
              <button onClick={() => setCollapseStaffCalendar(!collapseStaffCalendar)}>
                {collapseStaffCalendar ? 'Staff Calendar' : 'Hide Staff Calendar'}{pendingStaffScheduleCount > 0 ? ` • ${pendingStaffScheduleCount}` : ''}
              </button>
            )}
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
      {renderStaffCalendarPanel()}
      {renderStaffScheduleModal()}
      {renderManagerSectionNav()}
      {showManagerView && renderStaffManagementPanel()}
      {showManagerView && renderMaintenancePanel()}
      {showManagerView && renderProductsManagementPanel()}
      {showManagerView && renderPromosPanel()}
      {showManagerView && renderCorrectionsPanel()}
      {showManagerView && renderWixBookingSyncPanel()}
      {showManagerView && renderReceiptHistoryPanel()}
      {showManagerView && renderExportsPanel()}
      {showManagerView && renderDailyTakingsPanel()}
      {showManagerView && renderManagerReportsPanel()}

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
              <h2>{getBedName(bed.id)}</h2>
              <p>Room: {bed.tmax_room}</p>
              {bed.is_out_of_service && <h2>OUT OF SERVICE</h2>}
              {booking ? (
                <>
                  <p>Customer: <strong>{booking.customer_name}</strong></p>
                  <p>Minutes: <strong>{booking.minutes}</strong></p>
                  {String(booking.status || '').toLowerCase() === 'force_stopped' && <p><strong>Force Stopped</strong></p>}
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
              {beds.map((bed) => <th key={bed.id} style={{ border: '1px solid #444', padding: '10px' }}>{getBedName(bed.id)}</th>)}
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
                  <td style={{ border: '1px solid #444', padding: '8px', fontWeight: 'bold', width: '90px', background: currentRow ? '#ff4d4f' : isShopPrepTime ? 'rgba(212,168,83,0.18)' : 'transparent', color: currentRow ? 'white' : '#1f1710' }}>
                    {time}
                    {isShopPrepTime && <><br /><span style={{ fontSize: '11px', color: '#d4a853' }}>SHOP PREP</span></>}
                    {currentRow && <><br /><span style={{ fontSize: '12px' }}>NOW</span></>}
                  </td>
                  {beds.map((bed) => {
                    if (isSlotCoveredByEarlierBooking(time, bed.id)) return null
                    const booking = getCalendarBookingStartingAt(time, bed.id)
                    return (
                      <td key={bed.id} className={booking ? 'calendar-booking-cell' : 'calendar-empty-cell'} rowSpan={booking ? getCalendarDisplaySlotCount(booking) : 1} onClick={() => booking ? openBooking(booking) : openEmptySlot(time, bed.id)} style={{ border: currentRow ? '2px solid #ff4d4f' : '1px solid #444', padding: '8px', minHeight: '40px', background: getCalendarCellBackground(booking, bed.id), cursor: 'pointer', verticalAlign: 'top' }}>
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
                {renderBookingPromoSection()}
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
                  {beds.map((bed) => <option key={bed.id} value={bed.id}>{getBedName(bed.id)}</option>)}
                </select>
                {renderBookingMinutesControl()}
                <p>Total blocked time: <strong>{Number(selectedMinutes) + 6} mins</strong></p>
                {renderBookingCheckoutActionRow()}
                {renderBookingPromoSection()}
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
                {String(modalBooking.status || '').toLowerCase() === 'force_stopped' && <p style={{ color: '#ffcc66', fontWeight: 'bold' }}>Force Stopped</p>}
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
                {!modalBooking.booking_start && !['completed', 'no_show', 'force_stopped'].includes(String(modalBooking.status || '').toLowerCase()) && (
                  <button
                    onClick={() => startSession(modalBooking)}
                    disabled={modalStartBlocked}
                    style={{ width: '100%', marginTop: '18px', padding: '14px 18px', fontSize: '17px', fontWeight: 'bold', border: '1px solid rgba(212,168,83,0.75)' }}
                  >
                    Start Session
                  </button>
                )}

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                  {modalBooking.customer_id && !isStaffFreeBooking(modalBooking) && !isShopTestBooking(modalBooking) && (
                    <button onClick={() => openCustomerManagementFromBooking(modalBooking)} style={{ padding: '8px 10px', fontSize: '13px' }}>View/Edit Customer</button>
                  )}
                  {modalBooking.customer_id && !isStaffFreeBooking(modalBooking) && !isShopTestBooking(modalBooking) && (
                    <button onClick={() => emailBookingReceipt(modalBooking)} style={{ padding: '8px 10px', fontSize: '13px' }}>Email Receipt</button>
                  )}

                  {['booked'].includes(String(modalBooking.status || '').toLowerCase()) && !modalBooking.booking_start && !isStaffFreeBooking(modalBooking) && !isShopTestBooking(modalBooking) && (
                    <button onClick={() => setEditMode(true)} style={{ padding: '8px 10px', fontSize: '13px' }}>Edit</button>
                  )}

                  {['undressing', 'running', 'cooldown', 'active', 'time_sent', 'sent', 'customer_started', 'waiting_to_start', 'in_use'].includes(String(modalBooking.status || '').toLowerCase()) && (
                    <button onClick={() => forceStop(modalBooking)} style={{ padding: '8px 10px', fontSize: '13px' }}>Force Stop</button>
                  )}

                  {['booked'].includes(String(modalBooking.status || '').toLowerCase()) && !modalBooking.booking_start && (
                    <button onClick={() => updateBookingStatus(modalBooking.id, 'no_show')} style={{ padding: '8px 10px', fontSize: '13px' }}>No Show</button>
                  )}

                  {['completed', 'no_show', 'force_stopped'].includes(String(modalBooking.status || '').toLowerCase()) && (
                    <button onClick={() => managerResetBooking(modalBooking)} style={{ padding: '8px 10px', fontSize: '13px' }}>Manager Reset</button>
                  )}

                  {!modalBooking.booking_start && (
                    <button onClick={() => deleteBooking(modalBooking)} style={{ padding: '8px 10px', fontSize: '13px' }}>Delete</button>
                  )}

                  <button onClick={closeModal} style={{ padding: '8px 10px', fontSize: '13px' }}>Close</button>
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
