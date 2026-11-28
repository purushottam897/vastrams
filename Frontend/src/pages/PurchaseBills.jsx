import React, { useState, useEffect, useMemo, useReducer, useCallback } from 'react'
import { Plus, Search, Trash2, Edit2, Eye, X, Printer, FileText, AlertCircle, Clock, CheckCircle } from 'lucide-react'
import PrintPreviewModal from '../components/PrintPreviewModal'
import { toInputDate, fromInputDate, getTodayFormatted } from '../utils/date'
import DropdownSelect from '../components/ui/DropdownSelect'
import CustomDatePicker from '../components/ui/CustomDatePicker'
import { toTitleCase } from '../utils/text'
import EmptyState from '../components/ui/EmptyState'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import PageHeader from '../components/ui/PageHeader'
import { Card, KpiCard } from '../components/ui/Card'
import FilterToolbar from '../components/ui/FilterToolbar'
import api from '../utils/api'
import { useToast } from '../hooks/useToast'
import { useConfirm } from '../hooks/useConfirm'
import { useDirtyForm } from '../hooks/useDirtyForm'
import { useDirtyStateContext } from '../context/DirtyStateContext'
import { useSaveConfirmation } from '../hooks/useSaveConfirmation'
import { SaveConfirmationModal } from '../components/ui/SaveConfirmationModal'
import { AnimatePresence, motion } from 'framer-motion'
import { Skeleton, SkeletonTableRow } from '../components/ui/Skeleton'
import { usePagination } from '../hooks/usePagination'
import Pagination from '../components/ui/Pagination'

const initials = (name) => name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()
const avatarColors = [
  'bg-emerald-50 text-emerald-700 border-emerald-200',
  'bg-blue-50 text-blue-700 border-blue-200',
  'bg-purple-50 text-purple-700 border-purple-200',
  'bg-amber-50 text-amber-700 border-amber-200',
  'bg-slate-100 text-slate-700 border-slate-200'
]

const fmt = (v) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(v)

const getStatusBadgeVariant = (status) => {
  return 'success'
}

// ── Fetch state reducer ───────────────────────────────────────────────────────
const fetchInitial = { status: 'idle', bills: [], vendors: [], error: null }
function fetchReducer(state, action) {
  switch (action.type) {
    case 'FETCH_START':   return { ...state, status: 'loading', error: null }
    case 'FETCH_SUCCESS': return { status: 'success', bills: action.payload.bills, vendors: action.payload.vendors, error: null }
    case 'FETCH_ERROR':   return { ...state, status: 'error', error: action.payload }
    default:              return state
  }
}

export function PurchaseBills() {
  const toast = useToast()
  const confirm = useConfirm()

  const [fetchState, fetchDispatch] = useReducer(fetchReducer, fetchInitial)
  const { bills, vendors, status: fetchStatus, error } = fetchState
  const loading = fetchStatus === 'idle' || fetchStatus === 'loading'

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState('add') // 'add' | 'edit' | 'preview'
  const [selectedBill, setSelectedBill] = useState(null)
  const [printDoc, setPrintDoc] = useState(null)

  const emptyForm = {
    vendor: '',
    billNo: '',
    paymentType: 'Credit',
    customPaymentType: '',
    date: getTodayFormatted(),
    dueDate: getTodayFormatted(),
    amount: '',
    remarks: '',
  }
  const [form, setForm] = useState(emptyForm)
  const [initialFormSnapshot, setInitialFormSnapshot] = useState(emptyForm)
  const { confirmNavigation } = useDirtyStateContext()
  const { confirmConfig, isSaving, requestSaveConfirmation } = useSaveConfirmation()

  const isFormDirty = useMemo(() => {
    if (!showModal || modalMode === 'preview') return false
    return (
      (form.vendor || '') !== (initialFormSnapshot.vendor || '') ||
      (form.billNo || '') !== (initialFormSnapshot.billNo || '') ||
      (form.paymentType || '') !== (initialFormSnapshot.paymentType || '') ||
      (form.customPaymentType || '') !== (initialFormSnapshot.customPaymentType || '') ||
      (form.date || '') !== (initialFormSnapshot.date || '') ||
      (form.dueDate || '') !== (initialFormSnapshot.dueDate || '') ||
      (form.amount || '') !== (initialFormSnapshot.amount || '') ||
      (form.remarks || '') !== (initialFormSnapshot.remarks || '')
    )
  }, [showModal, modalMode, form, initialFormSnapshot])

  const closeModal = useCallback(() => {
    confirmNavigation(() => {
      setShowModal(false)
      setForm(emptyForm)
    })
  }, [confirmNavigation])

  useDirtyForm({
    id: 'purchase-bill-form',
    title: modalMode === 'add' ? 'Add Purchase Bill Form' : 'Edit Purchase Bill Form',
    isDirty: isFormDirty,
    onSave: () => handleSave(),
    onDiscard: () => setForm(emptyForm)
  })

  // Sub-modal states for adding vendor inline
  const emptyVendorForm = {
    name: '',
    type: 'smallVendor',
    phone: '',
    email: '',
    address: '',
    gstin: '',
    openingBalance: '',
    status: 'Active'
  }
  const [showAddVendorInline, setShowAddVendorInline] = useState(false)
  const [vendorForm, setVendorForm] = useState(emptyVendorForm)

  const fetchBillsAndVendors = useCallback(async (signal) => {
    fetchDispatch({ type: 'FETCH_START' })
    try {
      const [billsData, vendorsData] = await Promise.all([
        api.get('/bills', signal ? { signal } : {}),
        api.get('/vendors', signal ? { signal } : {})
      ])

      const mapped = billsData.map(b => {
        const billDateStr = b.billDate ? fromInputDate(b.billDate.split('T')[0]) : ''
        const dueDateStr = b.dueDate ? fromInputDate(b.dueDate.split('T')[0]) : ''

        return {
          id: b._id,
          billNo: b.billNumber,
          vendor: b.vendorId?.name || '—',
          vendorId: b.vendorId?._id || b.vendorId || '',
          paymentType: b.paymentType || 'Credit',
          date: billDateStr,
          dueDate: dueDateStr,
          amount: b.amount,
          paid: b.paidAmount,
          outstanding: b.outstandingAmount,
          remarks: b.remarks || '',
          status: 'Paid'
        }
      })

      if (!signal || !signal.aborted) {
        fetchDispatch({ type: 'FETCH_SUCCESS', payload: { bills: mapped, vendors: vendorsData } })
      }
    } catch (err) {
      if (!signal || !signal.aborted) {
        fetchDispatch({ type: 'FETCH_ERROR', payload: err.message || 'Failed to fetch bills' })
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchBillsAndVendors(controller.signal)
    return () => controller.abort()
  }, [fetchBillsAndVendors])

  useEffect(() => {
    const handleDataChanged = () => fetchBillsAndVendors()
    window.addEventListener('api-data-changed', handleDataChanged)
    window.addEventListener('vastrams:data-restored', handleDataChanged)
    return () => {
      window.removeEventListener('api-data-changed', handleDataChanged)
      window.removeEventListener('vastrams:data-restored', handleDataChanged)
    }
  }, [fetchBillsAndVendors])

  const vendorListOptions = useMemo(() => {
    return vendors.map(v => ({ value: v._id, label: toTitleCase(v.name) }))
  }, [vendors])

  const handleOpenAdd = () => {
    setForm(emptyForm)
    setInitialFormSnapshot(emptyForm)
    setModalMode('add')
    setShowModal(true)
  }

  const handleOpenPreview = (bill) => {
    setSelectedBill(bill)
    setModalMode('preview')
    setShowModal(true)
  }

  const handleOpenEdit = (bill) => {
    const editObj = {
      ...bill,
      vendor: bill.vendorId || bill.vendor,
      customPaymentType: ['Credit', 'cash'].includes(bill.paymentType) ? '' : bill.paymentType,
      paymentType: ['Credit', 'cash'].includes(bill.paymentType) ? bill.paymentType : 'custom'
    }
    setSelectedBill(bill)
    setForm(editObj)
    setInitialFormSnapshot(editObj)
    setModalMode('edit')
    setShowModal(true)
  }

  const handleSave = (e) => {
    if (e) e.preventDefault()
    requestSaveConfirmation({
      title: modalMode === 'add' ? 'Confirm Add Purchase Bill' : 'Confirm Update Bill',
      message: `You are about to save changes for Bill #${form.billNo || 'New'}.`,
      initialValues: initialFormSnapshot,
      currentValues: form,
      labelMap: {
        vendor: 'Vendor',
        billNo: 'Bill Number',
        paymentType: 'Payment Terms',
        customPaymentType: 'Custom Terms',
        date: 'Bill Date',
        dueDate: 'Due Date',
        amount: 'Bill Amount',
        remarks: 'Remarks'
      },
      onSaveApi: async () => {
        let savedPaymentType = form.paymentType
        if (form.paymentType === 'custom') {
          savedPaymentType = form.customPaymentType || 'Custom'
        }

        const payload = {
          billNumber: form.billNo,
          vendorId: form.vendor,
          paymentType: savedPaymentType,
          billDate: toInputDate(form.date),
          dueDate: toInputDate(form.dueDate),
          amount: Number(form.amount) || 0,
          remarks: form.remarks
        }

        try {
          if (modalMode === 'add') {
            await api.post('/bills', payload)
          } else {
            await api.put(`/bills/${selectedBill.id}`, payload)
          }
          await fetchBillsAndVendors()
          setShowModal(false)
          setForm(emptyForm)
          toast(modalMode === 'add' ? 'Purchase Bill created successfully' : 'Purchase Bill updated successfully', 'success')
        } catch (err) {
          toast(err.message || 'Failed to save bill', 'error')
          return false
        }
      }
    })
  }

  const handleDelete = async (id) => {
    if (await confirm('Are you sure you want to delete this purchase bill? This will reverse the payable ledger entry.', { title: 'Delete Bill' })) {
      try {
        await api.delete(`/bills/${id}`)
        await fetchBillsAndVendors()
        toast('Purchase bill deleted successfully', 'success')
      } catch (err) {
        toast(err.message || 'Failed to delete bill', 'error')
      }
    }
  }

  const handleSaveVendorInline = async (e) => {
    e.preventDefault()
    if (!vendorForm.name) {
      toast('Vendor name is required', 'error')
      return
    }
    try {
      const res = await api.post('/vendors', {
        ...vendorForm,
        openingBalance: Number(vendorForm.openingBalance) || 0
      })
      toast('Vendor added successfully', 'success')
      await fetchBillsAndVendors()
      const newVendorId = res?._id || res?.data?._id
      if (newVendorId) {
        setForm(prev => ({ ...prev, vendor: newVendorId }))
      }
      setShowAddVendorInline(false)
      setVendorForm(emptyVendorForm)
    } catch (err) {
      toast(err.message || 'Error saving vendor', 'error')
    }
  }

  const tableContainerRef = React.useRef(null)

  const filtered = useMemo(() => {
    return bills.filter(b => {
      const matchSearch =
        (b.billNo || '').toLowerCase().includes(search.toLowerCase()) ||
        (b.vendor || '').toLowerCase().includes(search.toLowerCase())
      const matchStatus =
        statusFilter === 'ALL' ||
        b.status.toUpperCase() === statusFilter.toUpperCase()
      return matchSearch && matchStatus
    })
  }, [bills, search, statusFilter])

  const pagination = usePagination({
    items: filtered,
    moduleKey: 'bills',
    initialPageSize: 20,
    filterDependencies: [search, statusFilter],
    containerRef: tableContainerRef
  })

  const totalBilled = useMemo(() => bills.reduce((s, b) => s + (b.amount || 0), 0), [bills])
  const paidCount = useMemo(() => bills.filter(b => b.status === 'Paid').length, [bills])

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Page Header */}
      <PageHeader
        title="Purchase Bills"
        description="Track vendor invoices, payment terms, due dates, and settlement progress"
        breadcrumbs={[{ label: 'Purchase Bills' }]}
      >
        <Button onClick={handleOpenAdd} className="shadow-sm">
          <Plus className="w-4 h-4" />
          <span>Add Purchase Bill</span>
        </Button>
      </PageHeader>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-5">
        <KpiCard
          title="Total Bills"
          value={loading ? <Skeleton className="h-8 w-16" /> : String(bills.length)}
          subtitle="All recorded invoices"
          icon={FileText}
          iconColor="text-slate-600 dark:text-slate-300"
          iconBg="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
        />
        <KpiCard
          title="Paid Invoices"
          value={loading ? <Skeleton className="h-8 w-16" /> : String(paidCount)}
          subtitle="All purchases paid"
          icon={CheckCircle}
          iconColor="text-emerald-600 dark:text-emerald-400"
          iconBg="bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/40"
        />
        <KpiCard
          title="Payment Status"
          value={loading ? <Skeleton className="h-8 w-16" /> : "Paid"}
          subtitle="Settlement confirmed"
          icon={CheckCircle}
          iconColor="text-emerald-600 dark:text-emerald-400"
          iconBg="bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/40"
        />
        <KpiCard
          title="Total Billed"
          value={loading ? <Skeleton className="h-8 w-32" /> : `₹${fmt(totalBilled)}`}
          subtitle="Cumulative invoice sum"
          icon={FileText}
          iconColor="text-emerald-600 dark:text-emerald-400"
          iconBg="bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/40"
        />
      </div>

      {/* Filter Toolbar */}
      <FilterToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by bill #, vendor name..."
        isFiltered={search !== '' || statusFilter !== 'ALL'}
        onReset={() => { setSearch(''); setStatusFilter('ALL') }}
      >
        <div className="w-full sm:w-48">
          <DropdownSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'ALL', label: 'All Statuses' },
              { value: 'Paid', label: 'Paid' }
            ]}
          />
        </div>
      </FilterToolbar>

      {/* Table Card */}
      <Card className="overflow-hidden">
        {error ? (
          <div className="p-8">
            <EmptyState icon="search" title="Error Loading Bills" description={error} />
          </div>
        ) : loading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/90 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-3.5">Bill No</th>
                  <th className="px-6 py-3.5">Vendor</th>
                  <th className="px-6 py-3.5">Terms</th>
                  <th className="px-6 py-3.5">Bill Date</th>
                  <th className="px-6 py-3.5">Due Date</th>
                  <th className="px-6 py-3.5 text-right">Amount</th>
                  <th className="px-6 py-3.5 text-center">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <SkeletonTableRow key={idx} cols={8} widths={["w-20", "w-36", "w-20", "w-24", "w-24", "w-20", "w-16", "w-20"]} />
                ))}
              </tbody>
            </table>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8">
            {bills.length === 0 ? (
              <EmptyState 
                icon="document" 
                title="No Purchase Bills Found" 
                description="Get started by adding your first vendor invoice." 
                action={{ label: "Add Purchase Bill", onClick: handleOpenAdd }} 
              />
            ) : (
              <EmptyState 
                icon="search" 
                title="No Matching Bills" 
                description="No purchase bills match your search criteria. Try clearing filters." 
              />
            )}
          </div>
        ) : (
          <>
            {/* Mobile Cards View (< md) */}
            <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-700/50">
              {pagination.paginatedItems.map((b, i) => (
                <div 
                  key={b._id || b.id} 
                  onClick={() => handleOpenPreview(b)} 
                  className="p-4 space-y-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`h-9 w-9 rounded-xl border flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs ${avatarColors[i % avatarColors.length]}`}>
                        {initials(b.vendor || 'V')}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{toTitleCase(b.vendor)}</p>
                        <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-bold">{b.billNo}</p>
                      </div>
                    </div>
                    <Badge variant={getStatusBadgeVariant(b.status)} dot>
                      {toTitleCase(b.status)}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs py-2 px-3 rounded-lg bg-slate-50/80 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/60">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Billed</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300 block">{b.date}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Due Date</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300 block">{b.dueDate}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Total Amount</span>
                      <span className="font-bold text-sm text-slate-900 dark:text-slate-100 tabular-nums block">₹{fmt(b.amount)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1" onClick={e => e.stopPropagation()}>
                    <Badge variant="neutral">{toTitleCase(b.paymentType || 'Credit')}</Badge>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setPrintDoc({ type: 'bill', id: b.id })}
                        className="h-9 px-2.5 rounded-lg text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors"
                        title="Print Invoice"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print</span>
                      </button>
                      <button
                        onClick={() => handleOpenPreview(b)}
                        className="h-9 px-2.5 rounded-lg text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View</span>
                      </button>
                      <button
                        onClick={() => handleOpenEdit(b)}
                        className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white bg-slate-100 dark:bg-slate-700 transition-colors"
                        title="Edit Bill"
                        aria-label="Edit Bill"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(b.id)}
                        className="h-9 w-9 flex items-center justify-center rounded-lg text-rose-500 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 transition-colors"
                        title="Delete Bill"
                        aria-label="Delete Bill"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table (>= md) */}
            <div ref={tableContainerRef} className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/90 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-6 py-3.5">Bill No</th>
                    <th className="px-6 py-3.5">Vendor</th>
                    <th className="px-6 py-3.5">Terms</th>
                    <th className="px-6 py-3.5">Bill Date</th>
                    <th className="px-6 py-3.5">Due Date</th>
                    <th className="px-6 py-3.5 text-right">Amount</th>
                    <th className="px-6 py-3.5 text-center">Status</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {pagination.paginatedItems.map((b, i) => (
                    <tr 
                      key={b._id || b.id} 
                      onClick={() => handleOpenPreview(b)} 
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer h-16"
                    >
                      <td className="px-6 py-4 font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {b.billNo}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`h-9 w-9 rounded-xl border flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs ${avatarColors[i % avatarColors.length]}`}>
                            {initials(b.vendor || 'V')}
                          </div>
                          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{toTitleCase(b.vendor)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant="neutral">{toTitleCase(b.paymentType || 'Credit')}</Badge>
                      </td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">{b.date}</td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">{b.dueDate}</td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                        ₹{fmt(b.amount)}
                      </td>
                      <td className="px-6 py-4 text-center whitespace-nowrap">
                        <Badge variant={getStatusBadgeVariant(b.status)} dot>
                          {toTitleCase(b.status)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => setPrintDoc({ type: 'bill', id: b.id })}
                            className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            title="Print Invoice"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenPreview(b)}
                            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            title="View Bill Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(b)}
                            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            title="Edit Bill"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(b.id)}
                            className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="Delete Bill"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination} isLoading={loading} />
          </>
        )}
      </Card>

      {/* Bill Add / Edit / Preview Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={closeModal}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="bg-white dark:bg-slate-800 w-full max-w-xl rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden relative z-10 flex flex-col max-h-[90vh]"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/80">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100" style={{ fontFamily: 'var(--font-display)' }}>
                    {modalMode === 'add' ? 'Add Purchase Bill' : modalMode === 'edit' ? 'Edit Purchase Bill' : 'Purchase Bill Details'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {modalMode === 'preview' ? `Invoice #${selectedBill?.billNo}` : 'Enter bill particulars and payment schedule'}
                  </p>
                </div>
                <button
                  onClick={closeModal}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto flex-1 space-y-5">
                {modalMode === 'preview' ? (
                  <div className="space-y-5 text-xs">
                    <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Vendor</span>
                        <p className="font-bold text-sm text-slate-900 dark:text-slate-100 mt-0.5">{toTitleCase(selectedBill?.vendor)}</p>
                      </div>
                      <Badge variant={getStatusBadgeVariant(selectedBill?.status)} dot>
                        {toTitleCase(selectedBill?.status)}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                      <div>
                        <span className="text-slate-400 block mb-0.5">Bill Number</span>
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{selectedBill?.billNo}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Payment Terms</span>
                        <Badge variant="neutral">{toTitleCase(selectedBill?.paymentType)}</Badge>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Bill Amount</span>
                        <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">₹{fmt(selectedBill?.amount || 0)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Bill Date</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{selectedBill?.date}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Due Date</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{selectedBill?.dueDate}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Outstanding Balance</span>
                        <span className="font-bold text-rose-600 dark:text-rose-400 tabular-nums">₹{fmt(selectedBill?.outstanding || 0)}</span>
                      </div>
                      {selectedBill?.remarks && (
                        <div className="col-span-full pt-2 border-t border-slate-100 dark:border-slate-700/60">
                          <span className="text-slate-400 block mb-0.5">Remarks</span>
                          <span className="text-slate-700 dark:text-slate-300">{selectedBill.remarks}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <form id="bill-form" onSubmit={handleSave} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Vendor <span className="text-rose-500">*</span>
                      </label>
                      <DropdownSelect
                        value={form.vendor}
                        onChange={val => setForm({...form, vendor: val})}
                        placeholder="Select Vendor"
                        options={vendorListOptions}
                        actionLabel="＋ Add New Vendor"
                        onAction={() => {
                          setVendorForm(emptyVendorForm)
                          setShowAddVendorInline(true)
                        }}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Bill Number
                        </label>
                        <input
                          type="text"
                          value={form.billNo}
                          onChange={e => setForm({...form, billNo: e.target.value})}
                          placeholder="e.g. INV-2026-001"
                          className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Bill Amount (₹) <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="number"
                          required
                          min={1}
                          value={form.amount}
                          onChange={e => setForm({...form, amount: e.target.value})}
                          placeholder="50000"
                          className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 tabular-nums outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Bill Date
                        </label>
                        <CustomDatePicker
                          value={form.date}
                          onChange={d => setForm({...form, date: d})}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Due Date
                        </label>
                        <CustomDatePicker
                          value={form.dueDate}
                          onChange={d => setForm({...form, dueDate: d})}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Payment Terms
                        </label>
                        <DropdownSelect
                          value={form.paymentType}
                          onChange={val => setForm({...form, paymentType: val})}
                          options={[
                            { value: 'Credit', label: 'Credit' },
                            { value: 'cash', label: 'Cash' },
                            { value: 'custom', label: 'Custom' }
                          ]}
                        />
                      </div>
                      {form.paymentType === 'custom' && (
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Custom Terms
                          </label>
                          <input
                            type="text"
                            value={form.customPaymentType}
                            onChange={e => setForm({...form, customPaymentType: e.target.value})}
                            placeholder="e.g. 45 Days Net"
                            className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          />
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Remarks</label>
                      <textarea
                        rows={2}
                        value={form.remarks}
                        onChange={e => setForm({...form, remarks: e.target.value})}
                        placeholder="Additional notes or references..."
                        className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
                      />
                    </div>
                  </form>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3 bg-slate-50/50 dark:bg-slate-800/80">
                {modalMode === 'preview' ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowModal(false)
                        setPrintDoc({ type: 'bill', id: selectedBill?._id || selectedBill?.id })
                      }}
                    >
                      <Printer className="w-4 h-4" />
                      <span>Print Document</span>
                    </Button>
                    <Button variant="secondary" onClick={() => setShowModal(false)}>
                      Close
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="secondary" onClick={closeModal}>
                      Cancel
                    </Button>
                    <Button type="submit" form="bill-form" loading={isSaving}>
                      {modalMode === 'add' ? 'Save Purchase Bill' : 'Update Bill'}
                    </Button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Inline Quick Add Vendor Modal */}
      <AnimatePresence>
        {showAddVendorInline && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs" onClick={() => setShowAddVendorInline(false)}>
            <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl p-5" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-700 mb-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Quick Add Vendor</h3>
                <button onClick={() => setShowAddVendorInline(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleSaveVendorInline} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Vendor Name *</label>
                  <input
                    type="text"
                    required
                    value={vendorForm.name}
                    onChange={e => setVendorForm({...vendorForm, name: e.target.value})}
                    placeholder="Vendor Name"
                    className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Phone</label>
                  <input
                    type="text"
                    value={vendorForm.phone}
                    onChange={e => setVendorForm({...vendorForm, phone: e.target.value})}
                    placeholder="Phone Number"
                    className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">GSTIN</label>
                  <input
                    type="text"
                    value={vendorForm.gstin}
                    onChange={e => setVendorForm({...vendorForm, gstin: e.target.value.toUpperCase()})}
                    placeholder="GSTIN"
                    className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg outline-none uppercase focus:border-emerald-500"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700 mt-4">
                  <Button variant="secondary" size="sm" onClick={() => setShowAddVendorInline(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm">
                    Save Vendor
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </AnimatePresence>

      <SaveConfirmationModal {...confirmConfig} isSaving={isSaving} />

      {printDoc && (
        <PrintPreviewModal
          type={printDoc.type}
          id={printDoc.id}
          onClose={() => setPrintDoc(null)}
        />
      )}
    </div>
  )
}

export default PurchaseBills
