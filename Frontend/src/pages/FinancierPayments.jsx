import React, { useState, useEffect, useReducer, useCallback, useMemo } from 'react'
import { Plus, Search, Trash2, Edit2, Eye, X, Landmark, DollarSign, Printer, CreditCard } from 'lucide-react'
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
import { useCompanyProfile } from '../context/ProfileContext'
import { downloadFinancierRepaymentsPdf } from '../utils/financePdf'

const fmt = (v) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(v)
const initials = (name) => (name || '').split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()
const avatarColors = [
  'bg-indigo-50 text-indigo-700 border-indigo-200',
  'bg-blue-50 text-blue-700 border-blue-200',
  'bg-purple-50 text-purple-700 border-purple-200',
  'bg-emerald-50 text-emerald-700 border-emerald-200'
]

const getModeBadgeVariant = (mode) => {
  const m = String(mode).toLowerCase()
  if (m.includes('cash')) return 'success'
  if (m.includes('cheque')) return 'warning'
  if (m.includes('neft') || m.includes('rtgs') || m.includes('bank') || m.includes('upi')) return 'info'
  return 'neutral'
}

export function FinancierPayments() {
  const toast = useToast()
  const confirm = useConfirm()
  const { companyProfile } = useCompanyProfile()
  const [paymentModes, setPaymentModes] = useState([])

  const [repayments, setRepayments] = useState([])
  const [financiers, setFinanciers] = useState([])
  const [loans, setLoans] = useState([])
  const [loading, setLoading] = useState(true)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [modeFilter, setModeFilter] = useState('ALL')
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState('add') // 'add' | 'edit' | 'preview'
  const [selectedRepay, setSelectedRepay] = useState(null)
  const [printDoc, setPrintDoc] = useState(null)

  const emptyForm = {
    financier: '',
    date: getTodayFormatted(),
    amount: '',
    mode: 'Bank Transfer',
    remarks: '',
    chequeNo: ''
  }
  const [form, setForm] = useState(emptyForm)
  const [initialFormSnapshot, setInitialFormSnapshot] = useState(emptyForm)
  const { confirmNavigation } = useDirtyStateContext()
  const { confirmConfig, isSaving, requestSaveConfirmation } = useSaveConfirmation()

  const isFormDirty = useMemo(() => {
    if (!showModal || modalMode === 'preview') return false
    return (
      (form.financier || '') !== (initialFormSnapshot.financier || '') ||
      (form.date || '') !== (initialFormSnapshot.date || '') ||
      (form.amount || '') !== (initialFormSnapshot.amount || '') ||
      (form.mode || '') !== (initialFormSnapshot.mode || '') ||
      (form.chequeNo || '') !== (initialFormSnapshot.chequeNo || '') ||
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
    id: 'financier-payment-form',
    title: modalMode === 'add' ? 'Record Repayment Form' : 'Edit Repayment Form',
    isDirty: isFormDirty,
    onSave: () => handleSave(),
    onDiscard: () => setForm(emptyForm)
  })

  const fetchRepaymentsData = async (signal) => {
    try {
      setLoading(true)
      const [repaymentsData, financiersData, loansData, profileRes] = await Promise.all([
        api.get('/loans/repayments/all', { signal }),
        api.get('/financiers', { signal }),
        api.get('/loans', { signal }),
        api.get('/settings/profile', { signal })
      ])

      const mappedRepayments = repaymentsData.map(r => {
        const repaymentDateStr = r.repaymentDate ? fromInputDate(r.repaymentDate.split('T')[0]) : ''
        const l = r.loanId || {}
        const financierName = l.financierId?.name || '—'

        return {
          id: r._id,
          loanId: l._id || '',
          ref: r.referenceNumber || '—',
          financier: financierName,
          date: repaymentDateStr,
          amount: r.amount,
          mode: formatPaymentMode(r.repaymentMode || 'BANK_TRANSFER'),
          remarks: r.remarks || `Repayment Ref: ${r.referenceNumber}`,
          allocations: [{
            noteNo: l.loanReference || '—',
            prev: (l.outstandingPrincipal || 0) + (r.principalPaid || 0),
            adjusted: r.principalPaid || 0,
            next: l.outstandingPrincipal || 0,
            status: l.status === 'SETTLED' ? 'Closed' : 'Active'
          }]
        }
      })

      if (!signal || !signal.aborted) {
        setRepayments(mappedRepayments)
        setFinanciers(financiersData)
        setLoans(loansData)
        if (profileRes && profileRes.data) {
          const activeModes = (profileRes.data.paymentModes || []).filter(m => m.enabled)
          setPaymentModes(activeModes)
        }
        setLoading(false)
      }
    } catch (err) {
      if (!signal || !signal.aborted) {
        setError(err.message || 'Failed to fetch repayments')
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    fetchRepaymentsData(controller.signal)
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const handleDataChanged = () => fetchRepaymentsData()
    window.addEventListener('api-data-changed', handleDataChanged)
    window.addEventListener('vastrams:data-restored', handleDataChanged)
    return () => {
      window.removeEventListener('api-data-changed', handleDataChanged)
      window.removeEventListener('vastrams:data-restored', handleDataChanged)
    }
  }, [])

  const handleOpenAdd = () => {
    setForm(emptyForm)
    setInitialFormSnapshot(emptyForm)
    setModalMode('add')
    setShowModal(true)
  }

  const handleOpenPreview = (repay) => {
    setSelectedRepay(repay)
    setModalMode('preview')
    setShowModal(true)
  }

  const handleOpenEdit = (repay) => {
    const rawMode = repay.mode || repay.paymentMode
    let displayMode = 'Bank Transfer'
    if (rawMode === 'CASH' || rawMode === 'Cash') displayMode = 'Cash'
    else if (rawMode === 'CHEQUE' || rawMode === 'Cheque') displayMode = 'Cheque'
    else if (rawMode === 'NEFT') displayMode = 'NEFT'
    else if (rawMode === 'RTGS') displayMode = 'RTGS'
    else if (rawMode === 'UPI') displayMode = 'UPI'
    else if (rawMode === 'Bank Transfer' || rawMode === 'BANK_TRANSFER') displayMode = 'Bank Transfer'
    else displayMode = rawMode || 'Bank Transfer'

    const editObj = {
      ...repay,
      financier: repay.financier || '',
      date: repay.date || (repay.repaymentDate ? fromInputDate(toInputDate(repay.repaymentDate)) : getTodayFormatted()),
      amount: repay.amount || 0,
      mode: displayMode,
      refNum: repay.refNum || repay.referenceNumber || ''
    }
    setSelectedRepay(repay)
    setForm(editObj)
    setInitialFormSnapshot(editObj)
    setModalMode('edit')
    setShowModal(true)
  }

  const handleSave = (e) => {
    if (e) e.preventDefault()
    const amt = Number(form.amount) || 0
    const selectedFinObj = financiers.find(f => f.name === form.financier)
    if (!selectedFinObj) {
      toast('Financier not found', 'error')
      return
    }

    const isEdit = modalMode === 'edit' && selectedRepay?.id

    requestSaveConfirmation({
      title: isEdit ? 'Confirm Repayment Update' : 'Confirm Record Repayment',
      message: isEdit 
        ? `You are about to update repayment of ₹${amt} for "${form.financier}".`
        : `You are about to record a repayment of ₹${amt} to "${form.financier}".`,
      initialValues: initialFormSnapshot,
      currentValues: form,
      labelMap: {
        financier: 'Financier',
        date: 'Repayment Date',
        amount: 'Amount',
        mode: 'Payment Mode',
        chequeNo: 'Cheque Number',
        remarks: 'Remarks'
      },
      onSaveApi: async () => {
        const modeMapping = {
          'Cash': 'CASH',
          'Cheque': 'CHEQUE',
          'NEFT': 'BANK_TRANSFER',
          'RTGS': 'BANK_TRANSFER',
          'UPI': 'BANK_TRANSFER',
          'Bank Transfer': 'BANK_TRANSFER'
        }

        try {
          if (isEdit) {
            const loanId = selectedRepay.loanId || (loans.find(l => l.financierId?.name === form.financier)?._id)
            if (!loanId) {
              toast('Could not identify corresponding loan to update repayment', 'error')
              return false
            }
            await api.put(`/loans/${loanId}/repayments/${selectedRepay.id}`, {
              amount: amt,
              repaymentDate: toInputDate(form.date),
              repaymentMode: modeMapping[form.mode] || 'BANK_TRANSFER',
              referenceNumber: form.refNum || selectedRepay.ref || ('REP-' + String(Math.floor(100 + Math.random() * 900))),
              chequeNumber: form.mode === 'Cheque' ? form.chequeNo : undefined,
              principalPaid: amt,
              interestPaid: 0
            })
            toast('Repayment updated successfully', 'success')
          } else {
            for (const alloc of fifoAllocations) {
              if (alloc.adjusted > 0) {
                await api.post(`/loans/${alloc.loanId}/repayments`, {
                  amount: alloc.adjusted,
                  repaymentDate: toInputDate(form.date),
                  repaymentMode: modeMapping[form.mode] || 'BANK_TRANSFER',
                  referenceNumber: 'REP-' + String(Math.floor(100 + Math.random() * 900)),
                  chequeNumber: form.mode === 'Cheque' ? form.chequeNo : undefined,
                  principalPaid: alloc.principalPaid,
                  interestPaid: alloc.interestPaid
                })
              }
            }
            toast('Repayments recorded successfully', 'success')
          }
          await fetchRepaymentsData()
          setShowModal(false)
          setForm(emptyForm)
        } catch (err) {
          toast(err.message || 'Failed to save repayment', 'error')
          return false
        }
      }
    })
  }

  const handleDelete = async (id) => {
    if (await confirm('Are you sure you want to delete this repayment? This will reverse the loan principal and interest allocations.', { title: 'Delete Repayment' })) {
      try {
        const targetRepay = repayments.find(r => r.id === id)
        const loanId = targetRepay?.loanId || (loans.find(l => l.financierId?.name === targetRepay?.financier)?._id)
        if (!loanId) {
          toast('Could not find parent loan to delete repayment', 'error')
          return
        }
        await api.delete(`/loans/${loanId}/repayments/${id}`)
        await fetchRepaymentsData()
        toast('Repayment deleted successfully', 'success')
      } catch (err) {
        toast(err.message || 'Failed to delete repayment', 'error')
      }
    }
  }

  const fifoAllocations = useMemo(() => {
    const amt = Number(form.amount) || 0
    const finLoans = loans
      .filter(l => !l.isDeleted && l.financierId?.name === form.financier && l.outstandingPrincipal > 0)
      .sort((a, b) => new Date(a.drawdownDate) - new Date(b.drawdownDate))

    let remaining = amt
    const result = []

    for (const l of finLoans) {
      if (remaining <= 0) break

      let accruedInterest = 0
      if (l.drawdownDate && l.interestRate) {
        const dDate = new Date(l.drawdownDate)
        if (!isNaN(dDate.getTime())) {
          const daysElapsed = Math.max(0, Math.floor((new Date() - dDate) / (1000 * 60 * 60 * 24)))
          accruedInterest = (l.outstandingPrincipal * l.interestRate * daysElapsed) / (100 * 365)
        }
      }

      const interestPaid = Math.min(accruedInterest, remaining)
      const remAfterInterest = remaining - interestPaid
      const principalPaid = Math.min(l.outstandingPrincipal, remAfterInterest)
      const adjusted = interestPaid + principalPaid
      const next = Math.max(0, l.outstandingPrincipal - principalPaid)

      result.push({
        loanId: l._id,
        noteNo: l.loanReference,
        prev: l.outstandingPrincipal,
        accruedInterest: Math.round(accruedInterest * 100) / 100,
        principalPaid: Math.round(principalPaid * 100) / 100,
        interestPaid: Math.round(interestPaid * 100) / 100,
        adjusted: Math.round(adjusted * 100) / 100,
        next: Math.round(next * 100) / 100,
        status: next === 0 ? 'Closed' : 'Active'
      })
      remaining -= adjusted
    }
    return result
  }, [form.financier, form.amount, loans])

  const filtered = useMemo(() => {
    return repayments.filter(r => {
      const matchSearch =
        (r.financier || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.remarks || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.ref || '').toLowerCase().includes(search.toLowerCase())
      const matchMode =
        modeFilter === 'ALL' ||
        r.mode.toLowerCase().includes(modeFilter.toLowerCase())
      return matchSearch && matchMode
    })
  }, [repayments, search, modeFilter])

  const totalRepaid = useMemo(() => repayments.reduce((s, r) => s + (Number(r.amount) || 0), 0), [repayments])
  const uniqueFinanciers = useMemo(() => new Set(repayments.map(r => r.financier)).size, [repayments])

  const tableContainerRef = React.useRef(null)

  const pagination = usePagination({
    items: filtered,
    moduleKey: 'financier_payments',
    initialPageSize: 20,
    filterDependencies: [search, modeFilter],
    containerRef: tableContainerRef
  })

  const handleDownloadPdf = async () => {
    try {
      setDownloadingPdf(true)
      await downloadFinancierRepaymentsPdf({
        repayments: filtered,
        companyProfile,
        search,
        modeFilter
      })
      toast('Financier repayments PDF downloaded successfully', 'success')
    } catch (err) {
      console.error('Failed to download PDF:', err)
      toast('Failed to generate PDF. Please try again.', 'error')
    } finally {
      setDownloadingPdf(false)
    }
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <PageHeader
        title="Financier Repayments"
        description="Track and record loan principal settlements and interest disbursements"
        breadcrumbs={[{ label: 'Financier Repayments' }]}
      >
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf || loading || filtered.length === 0}
            className="shadow-sm justify-center cursor-pointer"
            title="Download PDF statement of displayed repayments"
          >
            {downloadingPdf ? (
              <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Printer className="w-4 h-4" />
            )}
            <span>Print / Download PDF</span>
          </Button>
          <Button onClick={handleOpenAdd} className="shadow-sm justify-center">
            <Plus className="w-4 h-4" />
            <span>Record Repayment</span>
          </Button>
        </div>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-5">
        <KpiCard
          title="Total Repaid"
          value={loading ? <Skeleton className="h-8 w-32" /> : `₹${fmt(totalRepaid)}`}
          subtitle="Cumulative settlements"
          icon={DollarSign}
          iconColor="text-emerald-600 dark:text-emerald-400"
          iconBg="bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/40"
        />
        <KpiCard
          title="Repayments Recorded"
          value={loading ? <Skeleton className="h-8 w-16" /> : String(repayments.length)}
          subtitle="Transactions completed"
          icon={CreditCard}
          iconColor="text-slate-600 dark:text-slate-300"
          iconBg="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
        />
        <KpiCard
          title="Financiers Paid"
          value={loading ? <Skeleton className="h-8 w-16" /> : String(uniqueFinanciers)}
          subtitle="Active creditors"
          icon={Landmark}
          iconColor="text-blue-600 dark:text-blue-400"
          iconBg="bg-blue-50 dark:bg-blue-950/40 border-blue-100 dark:border-blue-900/40"
        />
      </div>

      {/* Filter Toolbar */}
      <FilterToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search repayments by financier, reference #, remarks..."
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
            <EmptyState icon="search" title="Error Loading Repayments" description={error} />
          </div>
        ) : loading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/90 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-3.5">Ref #</th>
                  <th className="px-6 py-3.5">Financier</th>
                  <th className="px-6 py-3.5">Repayment Date</th>
                  <th className="px-6 py-3.5 text-right">Amount Repaid</th>
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
            {repayments.length === 0 ? (
              <EmptyState 
                icon="wallet" 
                title="No Repayments Recorded" 
                description="Record your first financier repayment to track loan settlements." 
                action={{ label: "Record Repayment", onClick: handleOpenAdd }} 
              />
            ) : (
              <EmptyState 
                icon="search" 
                title="No Matching Repayments" 
                description="No repayment records match your filter criteria." 
              />
            )}
          </div>
        ) : (
          <>
            {/* Mobile Cards View (< md) */}
            <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-700/50">
              {pagination.paginatedItems.map((r, i) => (
                <div 
                  key={r._id || r.id} 
                  onClick={() => handleOpenPreview(r)} 
                  className="p-4 space-y-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`h-9 w-9 rounded-xl border flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs ${avatarColors[i % avatarColors.length]}`}>
                        {initials(r.financier)}
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate block">{toTitleCase(r.financier)}</span>
                        <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-bold">{r.ref}</p>
                      </div>
                    </div>
                    <Badge variant={getModeBadgeVariant(r.mode)} dot>
                      {toTitleCase(r.mode)}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs py-2 px-3 rounded-lg bg-slate-50/80 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/60">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Repayment Date</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300 block">{r.date}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Amount Repaid</span>
                      <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400 tabular-nums block">
                        ₹{fmt(r.amount)}
                      </span>
                    </div>
                    {r.remarks && (
                      <div className="col-span-2 pt-1 border-t border-slate-200/40 dark:border-slate-700/40 text-[11px] text-slate-500 truncate">
                        <span className="text-slate-400 font-medium">Remarks: </span>
                        <span>{r.remarks}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-1.5 pt-1" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => handleOpenPreview(r)}
                      className="h-9 px-3 rounded-lg text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors"
                      title="View Details"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View</span>
                    </button>
                    <button
                      onClick={() => handleOpenEdit(r)}
                      className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white bg-slate-100 dark:bg-slate-700 transition-colors"
                      title="Edit Repayment"
                      aria-label="Edit Repayment"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="h-9 w-9 flex items-center justify-center rounded-lg text-rose-500 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 transition-colors"
                      title="Delete Repayment"
                      aria-label="Delete Repayment"
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
                    <th className="px-6 py-3.5">Financier</th>
                    <th className="px-6 py-3.5">Repayment Date</th>
                    <th className="px-6 py-3.5 text-right">Amount Repaid</th>
                    <th className="px-6 py-3.5">Mode</th>
                    <th className="px-6 py-3.5">Remarks</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {pagination.paginatedItems.map((r, i) => (
                    <tr 
                      key={r._id || r.id} 
                      onClick={() => handleOpenPreview(r)} 
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer h-16"
                    >
                      <td className="px-6 py-4 font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {r.ref}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`h-9 w-9 rounded-xl border flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs ${avatarColors[i % avatarColors.length]}`}>
                            {initials(r.financier)}
                          </div>
                          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{toTitleCase(r.financier)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">{r.date}</td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                        ₹{fmt(r.amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={getModeBadgeVariant(r.mode)} dot>
                          {toTitleCase(r.mode)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400 max-w-[240px] truncate">{r.remarks || '—'}</td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => handleOpenPreview(r)}
                            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(r)}
                            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            title="Edit Repayment"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(r.id)}
                            className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="Delete Repayment"
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
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/80">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100" style={{ fontFamily: 'var(--font-display)' }}>
                    {modalMode === 'add' ? 'Record Financier Repayment' : modalMode === 'edit' ? 'Edit Repayment Details' : 'Repayment Overview'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {modalMode === 'preview' ? `Transaction Reference #${selectedRepay?.ref}` : 'Record repayment amount to reduce loan exposure'}
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
              <div className="p-6 overflow-y-auto flex-1 space-y-4">
                {modalMode === 'preview' ? (
                  <div className="space-y-4 text-xs">
                    <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Financier</span>
                        <p className="font-bold text-sm text-slate-900 dark:text-slate-100 mt-0.5">{toTitleCase(selectedRepay?.financier)}</p>
                      </div>
                      <Badge variant={getModeBadgeVariant(selectedRepay?.mode)}>
                        {toTitleCase(selectedRepay?.mode)}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-4 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                      <div>
                        <span className="text-slate-400 block mb-0.5">Amount Repaid</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums text-base">₹{fmt(selectedRepay?.amount || 0)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Repayment Date</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{selectedRepay?.date}</span>
                      </div>
                      <div className="col-span-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                        <span className="text-slate-400 block mb-0.5">Remarks</span>
                        <span className="text-slate-700 dark:text-slate-300">{selectedRepay?.remarks || '—'}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <form id="repay-form" onSubmit={handleSave} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Financier <span className="text-rose-500">*</span>
                      </label>
                      <DropdownSelect
                        value={form.financier}
                        onChange={val => setForm({...form, financier: val})}
                        placeholder="Select Financier"
                        options={financiers.map(f => ({ value: f.name, label: toTitleCase(f.name) }))}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Repayment Date <span className="text-rose-500">*</span>
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
                            { value: 'UPI', label: 'UPI' }
                          ]}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Amount (₹) <span className="text-rose-500">*</span>
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

                    {form.mode === 'Cheque' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Cheque Number <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="123456"
                          value={form.chequeNo || ''}
                          onChange={e => setForm({ ...form, chequeNo: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                          className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Remarks</label>
                      <textarea
                        rows={2}
                        value={form.remarks}
                        onChange={e => setForm({...form, remarks: e.target.value})}
                        placeholder="Additional notes..."
                        className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
                      />
                    </div>
                  </form>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3 bg-slate-50/50 dark:bg-slate-800/80">
                {modalMode === 'preview' ? (
                  <Button variant="secondary" onClick={() => setShowModal(false)}>Close</Button>
                ) : (
                  <>
                    <Button variant="secondary" onClick={closeModal}>Cancel</Button>
                    <Button type="submit" form="repay-form" loading={isSaving}>
                      {modalMode === 'add' ? 'Record Repayment' : 'Update Repayment'}
                    </Button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <SaveConfirmationModal {...confirmConfig} isSaving={isSaving} />
    </div>
  )
}

export default FinancierPayments
