import React, { useState, useMemo, useEffect, useReducer, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Trash2, Edit2, Eye, X, Printer, CreditCard, DollarSign, ArrowUpRight } from 'lucide-react'
import PrintPreviewModal, { formatPaymentMode } from '../components/PrintPreviewModal'
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

const getModeBadgeVariant = (mode) => {
  const m = String(mode).toLowerCase()
  if (m.includes('cash')) return 'success'
  if (m.includes('cheque')) return 'warning'
  if (m.includes('neft') || m.includes('rtgs') || m.includes('bank') || m.includes('upi')) return 'info'
  return 'neutral'
}

// ── Fetch state reducer ───────────────────────────────────────────────────────
const fetchInitial = { status: 'idle', payments: [], vendors: [], bills: [], paymentModes: [], error: null }
function fetchReducer(state, action) {
  switch (action.type) {
    case 'FETCH_START':   return { ...state, status: 'loading', error: null }
    case 'FETCH_SUCCESS': return { status: 'success', ...action.payload, error: null }
    case 'FETCH_ERROR':   return { ...state, status: 'error', error: action.payload }
    default:              return state
  }
}

export function VendorPayments() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()

  const [fetchState, fetchDispatch] = useReducer(fetchReducer, fetchInitial)
  const { payments, vendors, bills, paymentModes, status: fetchStatus, error } = fetchState
  const loading = fetchStatus === 'idle' || fetchStatus === 'loading'

  const [search, setSearch] = useState('')
  const [modeFilter, setModeFilter] = useState('ALL')
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState('add') // 'add' | 'edit' | 'preview'
  const [selectedPay, setSelectedPay] = useState(null)
  const [printDoc, setPrintDoc] = useState(null)

  const emptyForm = {
    vendor: '',
    date: getTodayFormatted(),
    amount: '',
    mode: 'Bank Transfer',
    remarks: ''
  }
  const [form, setForm] = useState(emptyForm)
  const [initialFormSnapshot, setInitialFormSnapshot] = useState(emptyForm)
  const { confirmNavigation } = useDirtyStateContext()
  const { confirmConfig, isSaving, requestSaveConfirmation } = useSaveConfirmation()

  const isFormDirty = useMemo(() => {
    if (!showModal || modalMode === 'preview') return false
    return (
      (form.vendor || '') !== (initialFormSnapshot.vendor || '') ||
      (form.date || '') !== (initialFormSnapshot.date || '') ||
      (form.amount || '') !== (initialFormSnapshot.amount || '') ||
      (form.mode || '') !== (initialFormSnapshot.mode || '') ||
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
    id: 'vendor-payment-form',
    title: modalMode === 'add' ? 'Record Vendor Payment Form' : 'Edit Vendor Payment Form',
    isDirty: isFormDirty,
    onSave: () => handleSave(),
    onDiscard: () => setForm(emptyForm)
  })

  const fetchPaymentsData = useCallback(async (signal) => {
    fetchDispatch({ type: 'FETCH_START' })
    try {
      const [paymentsData, vendorsData, billsData, profileRes] = await Promise.all([
        api.get('/payments', signal ? { signal } : {}),
        api.get('/vendors', signal ? { signal } : {}),
        api.get('/bills', signal ? { signal } : {}),
        api.get('/settings/profile', signal ? { signal } : {})
      ])

      const mappedPayments = paymentsData.map(p => {
        const paymentDateStr = p.paymentDate ? fromInputDate(p.paymentDate.split('T')[0]) : ''
        
        const mappedAllocations = (p.allocations || []).map(a => {
          const b = a.billId || {}
          const prev = (b.outstandingAmount || 0) + (a.allocatedAmount || 0)
          const next = b.outstandingAmount || 0
          return {
            billNo: b.billNumber || '—',
            prev: prev,
            adjusted: a.allocatedAmount || 0,
            next: next,
            status: next === 0 ? 'Paid' : 'Partial'
          }
        })

        return {
          id: p._id,
          ref: p.referenceNumber || '—',
          refNum: p.referenceNumber || '',
          referenceNumber: p.referenceNumber || '',
          vendor: p.vendorId?.name || '—',
          vendorId: p.vendorId?._id || p.vendorId || '',
          date: paymentDateStr,
          paymentDate: p.paymentDate,
          amount: p.amount,
          paymentMode: p.paymentMode || 'BANK_TRANSFER',
          mode: formatPaymentMode(p.paymentMode || 'BANK_TRANSFER'),
          chequeId: p.chequeId?._id || p.chequeId || null,
          chequeNumber: p.chequeId?.chequeNumber || p.chequeNumber || '',
          chequeNo: p.chequeId?.chequeNumber || p.chequeNumber || '',
          chequeDate: p.chequeId?.chequeDate ? fromInputDate(toInputDate(p.chequeId.chequeDate)) : '',
          remarks: p.remarks || `Payment Ref: ${p.referenceNumber}`,
          allocations: mappedAllocations
        }
      })

      const mappedBills = billsData.map(b => ({
        billNo: b.billNumber,
        vendor: b.vendorId?.name || '—',
        vendorId: b.vendorId?._id || b.vendorId || '',
        // Full bill fields for FIFO allocation preview
        originalAmount: b.amount,
        paidAmount: b.paidAmount || 0,
        outstanding: b.outstandingAmount,
        billDate: b.billDate ? b.billDate.split('T')[0] : '',
        dueDate: b.dueDate ? b.dueDate.split('T')[0] : '',
        status: b.status
      }))

      const activeModes = profileRes?.data
        ? (profileRes.data.paymentModes || []).filter(m => m.enabled)
        : []

      if (!signal || !signal.aborted) {
        fetchDispatch({
          type: 'FETCH_SUCCESS',
          payload: { payments: mappedPayments, vendors: vendorsData, bills: mappedBills, paymentModes: activeModes }
        })
      }
    } catch (err) {
      if (!signal || !signal.aborted) {
        fetchDispatch({ type: 'FETCH_ERROR', payload: err.message || 'Failed to fetch payments' })
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchPaymentsData(controller.signal)
    return () => controller.abort()
  }, [fetchPaymentsData])

  useEffect(() => {
    const handleDataChanged = () => fetchPaymentsData()
    window.addEventListener('api-data-changed', handleDataChanged)
    window.addEventListener('vastrams:data-restored', handleDataChanged)
    return () => {
      window.removeEventListener('api-data-changed', handleDataChanged)
      window.removeEventListener('vastrams:data-restored', handleDataChanged)
    }
  }, [fetchPaymentsData])

  const handleOpenAdd = () => {
    setForm(emptyForm)
    setInitialFormSnapshot(emptyForm)
    setModalMode('add')
    setShowModal(true)
  }

  const handleOpenPreview = (pay) => {
    setSelectedPay(pay)
    setModalMode('preview')
    setShowModal(true)
  }

  const getDisplayMode = (raw) => {
    if (!raw) return 'Bank Transfer'
    const m = String(raw).toUpperCase().trim()
    if (m === 'CASH') return 'Cash'
    if (m === 'CHEQUE' || m === 'CHECK') return 'Cheque'
    if (m === 'UPI') return 'UPI'
    if (m === 'NEFT') return 'NEFT'
    if (m === 'RTGS') return 'RTGS'
    if (m === 'NEFT_RTGS' || m === 'NEFT / RTGS' || m === 'NEFT/RTGS') return 'NEFT / RTGS'
    if (m === 'BANK_TRANSFER' || m === 'BANK TRANSFER') return 'Bank Transfer'
    if (m === 'ONLINE') return 'Online'
    if (m === 'OTHER') return 'Other'
    return formatPaymentMode(raw)
  }

  const handleOpenEdit = (pay) => {
    const rawMode = pay.paymentMode || pay.mode
    const displayMode = getDisplayMode(rawMode)

    const editObj = {
      ...pay,
      vendor: pay.vendor || pay.vendorId?.name || '',
      date: pay.date || (pay.paymentDate ? fromInputDate(toInputDate(pay.paymentDate)) : getTodayFormatted()),
      amount: pay.amount || 0,
      mode: displayMode,
      refNum: pay.refNum || pay.referenceNumber || pay.ref || '',
      referenceNumber: pay.referenceNumber || pay.refNum || pay.ref || '',
      chequeNumber: pay.chequeNumber || pay.chequeNo || '',
      chequeNo: pay.chequeNumber || pay.chequeNo || '',
      chequeDate: pay.chequeDate || pay.date || getTodayFormatted(),
      remarks: pay.remarks || ''
    }
    setSelectedPay(pay)
    setForm(editObj)
    setInitialFormSnapshot(editObj)
    setModalMode('edit')
    setShowModal(true)
  }

  const handleSave = (e) => {
    if (e) e.preventDefault()
    const amt = Number(form.amount) || 0
    
    const selectedVendorObj = vendors.find(v => v.name === form.vendor)
    if (!selectedVendorObj) {
      toast('Selected vendor not found', 'error')
      return
    }

    const isEdit = modalMode === 'edit' && selectedPay?.id

    requestSaveConfirmation({
      title: isEdit ? 'Confirm Payment Update' : 'Confirm Payment Record',
      message: isEdit
        ? `You are about to update the payment of ₹${amt} for "${form.vendor}".`
        : `You are about to record a payment of ₹${amt} to "${form.vendor}".`,
      initialValues: initialFormSnapshot,
      currentValues: form,
      labelMap: {
        vendor: 'Vendor',
        date: 'Payment Date',
        amount: 'Payment Amount',
        mode: 'Payment Mode',
        remarks: 'Remarks'
      },
      onSaveApi: async () => {
        const modeMapping = {
          'Cash': 'CASH',
          'Cheque': 'CHEQUE',
          'NEFT': 'NEFT',
          'RTGS': 'RTGS',
          'NEFT / RTGS': 'NEFT_RTGS',
          'UPI': 'UPI',
          'Bank Transfer': 'BANK_TRANSFER',
          'Online': 'ONLINE',
          'Other': 'OTHER'
        }

        const mappedPaymentMode = modeMapping[form.mode] || (
          form.mode ? String(form.mode).toUpperCase().replace(/[^A-Z0-9_]/g, '_') : 'BANK_TRANSFER'
        )

        const payload = {
          vendorId: selectedVendorObj._id,
          amount: amt,
          paymentDate: toInputDate(form.date),
          paymentMode: mappedPaymentMode,
          referenceNumber: form.refNum || form.referenceNumber || selectedPay?.referenceNumber || selectedPay?.ref || ('TXN-' + String(Math.floor(100 + Math.random() * 900))),
          chequeNumber: form.mode === 'Cheque' ? (form.chequeNumber || form.chequeNo || selectedPay?.chequeNumber || String(Math.floor(100000 + Math.random() * 900000))) : undefined,
          remarks: form.remarks
        }

        try {
          if (isEdit) {
            const res = await api.put(`/payments/${selectedPay.id}`, payload)
            if (!res?.data?.success && res?.status >= 400) {
              throw new Error(res?.data?.message || 'Failed to update payment')
            }
            toast('Vendor payment updated successfully', 'success')
          } else {
            const res = await api.post('/payments', payload)
            if (!res?.data?.success && res?.status >= 400) {
              throw new Error(res?.data?.message || 'Failed to record payment')
            }
            toast('Vendor payment recorded successfully', 'success')
          }
          await fetchPaymentsData()
          try {
            queryClient.invalidateQueries()
          } catch {}
          window.dispatchEvent(new CustomEvent('api-data-changed'))
          setShowModal(false)
          setForm(emptyForm)
          setSelectedPay(null)
        } catch (err) {
          toast(err.message || 'Failed to save payment', 'error')
          return false
        }
      }
    })
  }

  const handleDelete = async (id) => {
    if (await confirm('Are you sure you want to delete this payment transaction? This will reverse vendor outstanding balance and FIFO allocations.', { title: 'Delete Payment' })) {
      try {
        await api.delete(`/payments/${id}`)
        await fetchPaymentsData()
        toast('Payment deleted successfully', 'success')
      } catch (err) {
        toast(err.message || 'Failed to delete payment', 'error')
      }
    }
  }

  // ── FIFO Allocation Preview ────────────────────────────────────────────────
  // Mirrors the backend fifo.service.js logic exactly (dueDate: 1, billDate: 1)
  // Returns ALL bills for the selected vendor (paid + outstanding) with per-bill
  // breakdown of previous payments, current allocation, and remaining balance.
  const fifoPreview = useMemo(() => {
    const amt = Number(form.amount) || 0
    const selectedVendorName = form.vendor

    if (!selectedVendorName) return { rows: [], summary: null }

    // All bills for this vendor sorted same as backend: dueDate asc, billDate asc
    const vendorBills = bills
      .filter(b => b.vendor === selectedVendorName)
      .slice() // avoid mutating original
      .sort((a, b) => {
        if (a.dueDate < b.dueDate) return -1
        if (a.dueDate > b.dueDate) return 1
        if (a.billDate < b.billDate) return -1
        if (a.billDate > b.billDate) return 1
        return 0
      })

    if (vendorBills.length === 0) return { rows: [], summary: null }

    const totalOriginal = vendorBills.reduce((s, b) => s + (b.originalAmount || 0), 0)
    const totalPreviouslyPaid = vendorBills.reduce((s, b) => s + (b.paidAmount || 0), 0)
    const totalOutstandingBefore = vendorBills.reduce((s, b) => s + (b.outstanding || 0), 0)

    // Run FIFO allocation (read-only — does NOT touch actual bill records)
    let remaining = amt
    const rows = vendorBills.map(b => {
      const outstandingBefore = b.outstanding || 0
      let currentAllocation = 0
      if (remaining > 0 && outstandingBefore > 0) {
        currentAllocation = Math.min(outstandingBefore, remaining)
        remaining -= currentAllocation
      }
      const outstandingAfter = outstandingBefore - currentAllocation
      return {
        billNo: b.billNo,
        billDate: b.billDate,
        originalAmount: b.originalAmount || 0,
        previouslyPaid: b.paidAmount || 0,
        outstandingBefore,
        currentAllocation,
        outstandingAfter,
        statusAfter: outstandingAfter === 0 ? 'Paid' : (currentAllocation > 0 ? 'Partial' : (b.paidAmount > 0 ? 'Partial' : 'Unpaid'))
      }
    })

    const totalCurrentAllocated = amt - remaining
    const totalOutstandingAfter = rows.reduce((s, r) => s + r.outstandingAfter, 0)
    const unallocated = remaining // excess payment beyond all outstanding

    return {
      rows,
      summary: {
        totalOriginal,
        totalPreviouslyPaid,
        totalOutstandingBefore,
        currentPayment: amt,
        totalCurrentAllocated,
        unallocated,
        totalOutstandingAfter
      }
    }
  }, [form.vendor, form.amount, bills])

  // Legacy alias kept for existing preview-mode allocations (unchanged)
  const fifoAllocations = fifoPreview.rows.filter(r => r.currentAllocation > 0)


  const tableContainerRef = React.useRef(null)

  const filtered = useMemo(() => {
    return payments.filter(p => {
      const matchSearch =
        (p.vendor || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.remarks || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.ref || '').toLowerCase().includes(search.toLowerCase())
      const matchMode =
        modeFilter === 'ALL' ||
        p.mode.toLowerCase().includes(modeFilter.toLowerCase())
      return matchSearch && matchMode
    })
  }, [payments, search, modeFilter])

  const pagination = usePagination({
    items: filtered,
    moduleKey: 'vendor_payments',
    initialPageSize: 20,
    filterDependencies: [search, modeFilter],
    containerRef: tableContainerRef
  })

  const totalPaid = useMemo(() => payments.reduce((s, p) => s + (p.amount || 0), 0), [payments])
  const uniqueVendors = useMemo(() => new Set(payments.map(p => p.vendor)).size, [payments])

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Page Header */}
      <PageHeader
        title="Vendor Payments"
        description="Track, reconcile, and allocate disbursements made to registered suppliers"
        breadcrumbs={[{ label: 'Vendor Payments' }]}
      >
        <Button onClick={handleOpenAdd} className="shadow-sm">
          <Plus className="w-4 h-4" />
          <span>Record Payment</span>
        </Button>
      </PageHeader>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-5">
        <KpiCard
          title="Total Paid Out"
          value={loading ? <Skeleton className="h-8 w-32" /> : `₹${fmt(totalPaid)}`}
          subtitle="Total settled disbursements"
          icon={DollarSign}
          iconColor="text-emerald-600 dark:text-emerald-400"
          iconBg="bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/40"
        />
        <KpiCard
          title="Payment Transactions"
          value={loading ? <Skeleton className="h-8 w-16" /> : String(payments.length)}
          subtitle="Processed payment vouchers"
          icon={CreditCard}
          iconColor="text-slate-600 dark:text-slate-300"
          iconBg="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
        />
        <KpiCard
          title="Vendors Paid"
          value={loading ? <Skeleton className="h-8 w-16" /> : String(uniqueVendors)}
          subtitle="Recipients served"
          icon={ArrowUpRight}
          iconColor="text-blue-600 dark:text-blue-400"
          iconBg="bg-blue-50 dark:bg-blue-950/40 border-blue-100 dark:border-blue-900/40"
        />
      </div>

      {/* Filter Toolbar */}
      <FilterToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by vendor, reference #, remarks..."
        isFiltered={search !== '' || modeFilter !== 'ALL'}
        onReset={() => { setSearch(''); setModeFilter('ALL') }}
      >
        <div className="w-full sm:w-48">
          <DropdownSelect
            value={modeFilter}
            onChange={setModeFilter}
            options={[
              { value: 'ALL', label: 'All Payment Modes' },
              { value: 'Bank Transfer', label: 'Bank Transfer' },
              { value: 'Cheque', label: 'Cheque' },
              { value: 'Cash', label: 'Cash' },
              { value: 'NEFT', label: 'NEFT / RTGS' },
              { value: 'UPI', label: 'UPI' }
            ]}
          />
        </div>
      </FilterToolbar>

      {/* Table Card */}
      <Card className="overflow-hidden">
        {error ? (
          <div className="p-8">
            <EmptyState icon="search" title="Error Loading Payments" description={error} />
          </div>
        ) : loading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/90 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-3.5">Ref #</th>
                  <th className="px-6 py-3.5">Vendor</th>
                  <th className="px-6 py-3.5">Payment Date</th>
                  <th className="px-6 py-3.5 text-right">Amount Paid</th>
                  <th className="px-6 py-3.5">Mode</th>
                  <th className="px-6 py-3.5">Remarks</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <SkeletonTableRow key={idx} cols={7} widths={["w-24", "w-36", "w-24", "w-20", "w-20", "w-40", "w-20"]} />
                ))}
              </tbody>
            </table>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8">
            {payments.length === 0 ? (
              <EmptyState 
                icon="wallet" 
                title="No Payments Recorded" 
                description="Record your first vendor payment to settle outstanding bills." 
                action={{ label: "Record Payment", onClick: handleOpenAdd }} 
              />
            ) : (
              <EmptyState 
                icon="search" 
                title="No Matching Payments" 
                description="No payments match your search criteria. Try clearing filters." 
              />
            )}
          </div>
        ) : (
          <>
            {/* Mobile Cards View (< md) */}
            <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-700/50">
              {pagination.paginatedItems.map((p, i) => (
                <div 
                  key={p.id} 
                  onClick={() => handleOpenPreview(p)} 
                  className="p-4 space-y-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`h-9 w-9 rounded-xl border flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs ${avatarColors[i % avatarColors.length]}`}>
                        {initials(p.vendor || 'V')}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{toTitleCase(p.vendor)}</p>
                        <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-bold">{p.ref}</p>
                      </div>
                    </div>
                    <Badge variant={getModeBadgeVariant(p.mode)} dot>
                      {toTitleCase(p.mode)}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs py-2 px-3 rounded-lg bg-slate-50/80 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/60">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Payment Date</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300 block">{p.date}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Amount Paid</span>
                      <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400 tabular-nums block">
                        ₹{fmt(p.amount)}
                      </span>
                    </div>
                    {p.remarks && (
                      <div className="col-span-2 pt-1 border-t border-slate-200/40 dark:border-slate-700/40 text-[11px] text-slate-500 truncate">
                        <span className="text-slate-400 font-medium">Remarks: </span>
                        <span>{p.remarks}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-1.5 pt-1" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setPrintDoc({ type: 'payment', id: p.id })}
                      className="h-9 px-2.5 rounded-lg text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors"
                      title="Print Voucher"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print</span>
                    </button>
                    <button
                      onClick={() => handleOpenPreview(p)}
                      className="h-9 px-2.5 rounded-lg text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors"
                      title="View Details"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View</span>
                    </button>
                    <button
                      onClick={() => handleOpenEdit(p)}
                      className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white bg-slate-100 dark:bg-slate-700 transition-colors"
                      title="Edit Payment"
                      aria-label="Edit Payment"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="h-9 w-9 flex items-center justify-center rounded-lg text-rose-500 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 transition-colors"
                      title="Delete Payment"
                      aria-label="Delete Payment"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table (>= md) */}
            <div ref={tableContainerRef} className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/90 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-6 py-3.5">Ref #</th>
                    <th className="px-6 py-3.5">Vendor</th>
                    <th className="px-6 py-3.5">Payment Date</th>
                    <th className="px-6 py-3.5 text-right">Amount Paid</th>
                    <th className="px-6 py-3.5">Mode</th>
                    <th className="px-6 py-3.5">Remarks</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {pagination.paginatedItems.map((p, i) => (
                    <tr 
                      key={p.id} 
                      onClick={() => handleOpenPreview(p)} 
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer h-16"
                    >
                      <td className="px-6 py-4 font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {p.ref}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`h-9 w-9 rounded-xl border flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs ${avatarColors[i % avatarColors.length]}`}>
                            {initials(p.vendor || 'V')}
                          </div>
                          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{toTitleCase(p.vendor)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">{p.date}</td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                        ₹{fmt(p.amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={getModeBadgeVariant(p.mode)} dot>
                          {toTitleCase(p.mode)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400 max-w-[240px] truncate">{p.remarks || '—'}</td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => setPrintDoc({ type: 'payment', id: p.id })}
                            className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            title="Print Voucher"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenPreview(p)}
                            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(p)}
                            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            title="Edit Payment"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="Delete Payment"
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

      {/* Modal Dialog */}
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
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/80">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100" style={{ fontFamily: 'var(--font-display)' }}>
                    {modalMode === 'add' ? 'Record Vendor Payment' : modalMode === 'edit' ? 'Edit Payment Details' : 'Payment Voucher Details'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {modalMode === 'preview' ? `Transaction Reference #${selectedPay?.ref}` : 'Record disbursement and allocate against outstanding bills'}
                  </p>
                </div>
                <button
                  onClick={closeModal}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto flex-1 space-y-5">
                {modalMode === 'preview' ? (
                  <div className="space-y-5 text-xs">
                    <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Vendor</span>
                        <p className="font-bold text-sm text-slate-900 dark:text-slate-100 mt-0.5">{toTitleCase(selectedPay?.vendor)}</p>
                      </div>
                      <Badge variant={getModeBadgeVariant(selectedPay?.mode)}>
                        {toTitleCase(selectedPay?.mode)}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-4 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                      <div>
                        <span className="text-slate-400 block mb-0.5">Amount Paid</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums text-base">₹{fmt(selectedPay?.amount || 0)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Payment Date</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{selectedPay?.date}</span>
                      </div>
                      <div className="col-span-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                        <span className="text-slate-400 block mb-0.5">Remarks / Ref</span>
                        <span className="text-slate-700 dark:text-slate-300">{selectedPay?.remarks || '—'}</span>
                      </div>
                    </div>

                    {/* FIFO Allocations Table */}
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">FIFO Bill Allocations</h4>
                      <div className="border border-slate-200/80 dark:border-slate-700/80 rounded-xl overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-700 text-[10px] font-bold uppercase text-slate-400">
                            <tr>
                              <th className="px-3 py-2">Bill #</th>
                              <th className="px-3 py-2 text-right">Prev Balance</th>
                              <th className="px-3 py-2 text-right">Adjusted</th>
                              <th className="px-3 py-2 text-right">New Balance</th>
                              <th className="px-3 py-2">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                            {selectedPay?.allocations?.map((a, idx) => (
                              <tr key={idx}>
                                <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">{a.billNo}</td>
                                <td className="px-3 py-2 text-right text-slate-500 tabular-nums">₹{fmt(a.prev)}</td>
                                <td className="px-3 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">₹{fmt(a.adjusted)}</td>
                                <td className="px-3 py-2 text-right text-slate-500 tabular-nums">₹{fmt(a.next)}</td>
                                <td className="px-3 py-2">
                                  <Badge variant={a.status === 'Paid' ? 'success' : 'warning'} className="text-[10px]">
                                    {toTitleCase(a.status)}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <form id="payment-form" onSubmit={handleSave} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Vendor <span className="text-rose-500">*</span>
                      </label>
                      <DropdownSelect
                        value={form.vendor}
                        onChange={val => setForm({...form, vendor: val})}
                        placeholder="Select Vendor"
                        options={vendors.map(v => ({ value: v.name, label: toTitleCase(v.name) }))}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Payment Date <span className="text-rose-500">*</span>
                        </label>
                        <CustomDatePicker
                          value={form.date}
                          onChange={val => setForm({...form, date: val})}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Payment Mode <span className="text-rose-500">*</span>
                        </label>
                        <DropdownSelect
                          value={form.mode}
                          onChange={val => setForm({...form, mode: val})}
                          options={paymentModes.length > 0 ? paymentModes.map(m => ({ value: m.name, label: m.name })) : [
                            { value: 'Bank Transfer', label: 'Bank Transfer' },
                            { value: 'Cheque', label: 'Cheque' },
                            { value: 'Cash', label: 'Cash' },
                            { value: 'UPI', label: 'UPI' },
                            { value: 'NEFT', label: 'NEFT' },
                            { value: 'RTGS', label: 'RTGS' },
                            { value: 'NEFT / RTGS', label: 'NEFT / RTGS' }
                          ]}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Amount to Pay (₹) <span className="text-rose-500">*</span>
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

                    {/* Conditional Mode Inputs */}
                    {form.mode === 'Cheque' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Cheque Number <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="123456"
                            value={form.chequeNumber || ''}
                            onChange={e => setForm({ ...form, chequeNumber: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                            className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Cheque Date
                          </label>
                          <CustomDatePicker
                            value={form.chequeDate || form.date}
                            onChange={val => setForm({ ...form, chequeDate: val })}
                          />
                        </div>
                      </div>
                    )}

                    {(form.mode === 'Bank Transfer' || form.mode === 'NEFT' || form.mode === 'RTGS' || form.mode === 'UPI' || form.mode === 'NEFT / RTGS') && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Transaction Reference / UTR Number
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. UTR12345678"
                          value={form.refNum || ''}
                          onChange={e => setForm({ ...form, refNum: e.target.value })}
                          className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        />
                      </div>
                    )}

                    {/* Real-time FIFO Allocation Preview */}
                    {form.vendor && (
                      <div className="rounded-xl border border-emerald-100 dark:border-emerald-900/40 overflow-hidden">
                        {/* Preview Header */}
                        <div className="px-3.5 py-2 bg-emerald-50/60 dark:bg-emerald-950/30 border-b border-emerald-100 dark:border-emerald-900/40 flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                            FIFO Allocation Preview
                          </span>
                          {fifoPreview.summary && (
                            <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                              {fifoPreview.rows.length} bill{fifoPreview.rows.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>

                        {/* No bills state */}
                        {fifoPreview.rows.length === 0 ? (
                          <div className="px-3.5 py-3 bg-emerald-50/20 dark:bg-emerald-950/10">
                            <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                              No bills found for <span className="font-semibold">{form.vendor}</span>.
                              {Number(form.amount) > 0 && ' This payment will be recorded as an advance.'}
                            </p>
                          </div>
                        ) : (
                          <>
                            {/* Bill-by-bill breakdown table */}
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-[11px]">
                                <thead className="bg-slate-50/80 dark:bg-slate-900/40 text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-700/60">
                                  <tr>
                                    <th className="px-3 py-2">Bill #</th>
                                    <th className="px-3 py-2 text-right">Original</th>
                                    <th className="px-3 py-2 text-right">Prev Paid</th>
                                    <th className="px-3 py-2 text-right">Outstanding</th>
                                    <th className="px-3 py-2 text-right text-emerald-700 dark:text-emerald-400">This Payment</th>
                                    <th className="px-3 py-2 text-right">Remaining</th>
                                    <th className="px-3 py-2 pl-2">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/40">
                                  {fifoPreview.rows.map((r, idx) => {
                                    const isFullyPaid   = r.outstandingBefore === 0
                                    const isBeingPaid   = r.currentAllocation > 0
                                    const isPartial     = r.outstandingAfter > 0 && r.currentAllocation > 0
                                    const isSettledNow  = r.outstandingAfter === 0 && r.currentAllocation > 0
                                    return (
                                      <tr
                                        key={idx}
                                        className={
                                          isFullyPaid ? 'bg-slate-50/40 dark:bg-slate-900/20 opacity-60'
                                          : isBeingPaid ? 'bg-emerald-50/30 dark:bg-emerald-950/20'
                                          : ''
                                        }
                                      >
                                        <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                          {r.billNo}
                                          {r.billDate && (
                                            <span className="block text-[9px] text-slate-400 font-normal">{r.billDate}</span>
                                          )}
                                        </td>
                                        <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                                          ₹{fmt(r.originalAmount)}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                                          {r.previouslyPaid > 0
                                            ? <span className="text-blue-600 dark:text-blue-400 font-medium">₹{fmt(r.previouslyPaid)}</span>
                                            : <span className="text-slate-300 dark:text-slate-600">—</span>
                                          }
                                        </td>
                                        <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap font-medium">
                                          {r.outstandingBefore === 0
                                            ? <span className="text-slate-300 dark:text-slate-600">₹0</span>
                                            : `₹${fmt(r.outstandingBefore)}`
                                          }
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                                          {r.currentAllocation > 0
                                            ? <span className="font-bold text-emerald-600 dark:text-emerald-400">₹{fmt(r.currentAllocation)}</span>
                                            : <span className="text-slate-300 dark:text-slate-600">—</span>
                                          }
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                                          {r.outstandingAfter > 0
                                            ? <span className="text-amber-700 dark:text-amber-400 font-medium">₹{fmt(r.outstandingAfter)}</span>
                                            : <span className="text-emerald-600 dark:text-emerald-400 font-medium">₹0</span>
                                          }
                                        </td>
                                        <td className="px-3 py-2 pl-2 whitespace-nowrap">
                                          {isFullyPaid && !isSettledNow ? (
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">Paid</span>
                                          ) : isSettledNow ? (
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">✓ Paid</span>
                                          ) : isPartial ? (
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">Partial</span>
                                          ) : (
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">Unpaid</span>
                                          )}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>

                            {/* Summary strip */}
                            {fifoPreview.summary && (
                              <div className="border-t border-slate-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-900/30 px-3.5 py-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
                                <div className="flex justify-between">
                                  <span className="text-slate-500 dark:text-slate-400">Total Outstanding Before</span>
                                  <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">₹{fmt(fifoPreview.summary.totalOutstandingBefore)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500 dark:text-slate-400">Current Payment</span>
                                  <span className="font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">₹{fmt(fifoPreview.summary.currentPayment)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500 dark:text-slate-400">Total Allocated</span>
                                  <span className="font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">₹{fmt(fifoPreview.summary.totalCurrentAllocated)}</span>
                                </div>
                                {fifoPreview.summary.unallocated > 0 ? (
                                  <div className="flex justify-between">
                                    <span className="text-amber-600 dark:text-amber-400">Excess (Advance)</span>
                                    <span className="font-bold text-amber-600 dark:text-amber-400 tabular-nums">₹{fmt(fifoPreview.summary.unallocated)}</span>
                                  </div>
                                ) : (
                                  <div className="flex justify-between">
                                    <span className="text-slate-500 dark:text-slate-400">Remaining Unallocated</span>
                                    <span className="font-semibold text-slate-400 dark:text-slate-500 tabular-nums">₹0</span>
                                  </div>
                                )}
                                <div className="col-span-2 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/40 flex justify-between">
                                  <span className="text-slate-600 dark:text-slate-300 font-semibold">Total Outstanding After</span>
                                  <span className={`font-bold tabular-nums ${fifoPreview.summary.totalOutstandingAfter === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                    ₹{fmt(fifoPreview.summary.totalOutstandingAfter)}
                                  </span>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Remarks</label>
                      <textarea
                        rows={2}
                        value={form.remarks}
                        onChange={e => setForm({...form, remarks: e.target.value})}
                        placeholder="Additional remarks or receipt details..."
                        className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
                      />
                    </div>
                  </form>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3 bg-slate-50/50 dark:bg-slate-800/80">
                {modalMode === 'preview' ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowModal(false)
                        setPrintDoc({ type: 'payment', id: selectedPay?.id })
                      }}
                    >
                      <Printer className="w-4 h-4" />
                      <span>Print Voucher</span>
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
                    <Button type="submit" form="payment-form" loading={isSaving}>
                      {modalMode === 'add' ? 'Record Payment' : 'Update Payment'}
                    </Button>
                  </>
                )}
              </div>
            </motion.div>
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

export default VendorPayments
