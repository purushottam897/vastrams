import React, { useState, useEffect, useReducer, useCallback, useMemo } from 'react'
import { Plus, X, Edit2, Eye, Trash2, Landmark, Coins, TrendingUp, Percent, Printer } from 'lucide-react'
import PrintPreviewModal from '../components/PrintPreviewModal'
import { toInputDate, fromInputDate, getTodayFormatted, getDefaultMaturityDate, formatDateDisplay } from '../utils/date'
import DropdownSelect from '../components/ui/DropdownSelect'
import CustomDatePicker from '../components/ui/CustomDatePicker'
import { toTitleCase } from '../utils/text'
import EmptyState from '../components/ui/EmptyState'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import PageHeader from '../components/ui/PageHeader'
import { Card, KpiCard } from '../components/ui/Card'
import api from '../utils/api'
import { useToast } from '../hooks/useToast'
import { useConfirm } from '../hooks/useConfirm'
import { useDirtyForm } from '../hooks/useDirtyForm'
import { useDirtyStateContext } from '../context/DirtyStateContext'
import { useSaveConfirmation } from '../hooks/useSaveConfirmation'
import { SaveConfirmationModal } from '../components/ui/SaveConfirmationModal'
import { AnimatePresence, motion } from 'framer-motion'
import { Skeleton, SkeletonCard } from '../components/ui/Skeleton'
import { usePagination } from '../hooks/usePagination'
import Pagination from '../components/ui/Pagination'
import { useCompanyProfile } from '../context/ProfileContext'
import { downloadLoansRegisterPdf } from '../utils/financePdf'

const fmt = (v) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(v)

export function Loans() {
  const toast = useToast()
  const confirm = useConfirm()
  const { companyProfile } = useCompanyProfile()
  const [loans, setLoans] = useState([])
  const [financiers, setFinanciers] = useState([])
  const [loading, setLoading] = useState(true)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [error, setError] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState('add') // 'add' | 'edit' | 'preview'
  const [selectedLoan, setSelectedLoan] = useState(null)
  const [printDoc, setPrintDoc] = useState(null)

  const emptyForm = {
    financier: '',
    noteNo: '',
    loanDate: '',
    maturityDate: '',
    amount: '',
    rate: '',
    remarks: '',
  }
  const [form, setForm] = useState(emptyForm)
  const [initialFormSnapshot, setInitialFormSnapshot] = useState(emptyForm)
  const { confirmNavigation } = useDirtyStateContext()
  const { confirmConfig, isSaving, requestSaveConfirmation } = useSaveConfirmation()

  const isFormDirty = useMemo(() => {
    if (!showModal || modalMode === 'preview') return false
    return (
      (form.financier || '') !== (initialFormSnapshot.financier || '') ||
      (form.noteNo || '') !== (initialFormSnapshot.noteNo || '') ||
      (form.loanDate || '') !== (initialFormSnapshot.loanDate || '') ||
      (form.maturityDate || '') !== (initialFormSnapshot.maturityDate || '') ||
      (form.amount || '') !== (initialFormSnapshot.amount || '') ||
      (form.rate || '') !== (initialFormSnapshot.rate || '') ||
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
    id: 'loan-form',
    title: modalMode === 'add' ? 'Add Loan Form' : 'Edit Loan Form',
    isDirty: isFormDirty,
    onSave: () => handleSave(),
    onDiscard: () => setForm(emptyForm)
  })

  const fetchLoansAndFinanciers = async (signal) => {
    try {
      setLoading(true)
      const [loansData, financiersData] = await Promise.all([
        api.get('/loans', { signal }),
        api.get('/financiers', { signal })
      ])

      const mappedLoans = loansData.map(l => {
        const drawdownDateStr = l.drawdownDate ? fromInputDate(l.drawdownDate.split('T')[0]) : ''
        const maturityDateStr = l.maturityDate ? fromInputDate(l.maturityDate.split('T')[0]) : ''
        
        let displayStatus = 'Active'
        if (l.status === 'SETTLED') displayStatus = 'Closed'
        else if (l.status === 'OVERDUE') displayStatus = 'Overdue'

        let accruedInterest = 0
        if (l.drawdownDate && l.interestRate !== null && l.interestRate !== undefined && !isNaN(l.interestRate) && l.outstandingPrincipal) {
          const dDate = new Date(l.drawdownDate)
          if (!isNaN(dDate.getTime())) {
            const daysElapsed = Math.max(0, Math.floor((new Date() - dDate) / (1000 * 60 * 60 * 24)))
            accruedInterest = (l.outstandingPrincipal * Number(l.interestRate) * daysElapsed) / (100 * 365)
          }
        }
        const totalPending = Math.round(((l.outstandingPrincipal || 0) + accruedInterest) * 100) / 100

        return {
          id: l._id,
          _id: l._id,
          noteNo: l.loanReference,
          financier:   l.financierId?.name || null,
          isOrphaned:  !l.financierId?.name,
          financierId: l.financierId?._id || l.financierId || '',
          loanDate: drawdownDateStr,
          maturityDate: maturityDateStr,
          amount: l.principalAmount,
          rate: (l.interestRate !== null && l.interestRate !== undefined && !isNaN(l.interestRate)) ? String(l.interestRate) : '',
          repaid: l.paidPrincipal,
          pending: totalPending,
          principalPending: l.outstandingPrincipal,
          accruedInterest: accruedInterest,
          progress: l.principalAmount > 0 ? Math.min(100, Math.round((l.paidPrincipal / l.principalAmount) * 100)) : 0,
          remarks: l.notes || '',
          status: displayStatus
        }
      })

      if (!signal || !signal.aborted) {
        setLoans(mappedLoans)
        setFinanciers(financiersData)
        setLoading(false)
      }
    } catch (err) {
      if (!signal || !signal.aborted) {
        setError(err.message || 'Failed to fetch loans')
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    fetchLoansAndFinanciers(controller.signal)
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const handleDataChanged = () => fetchLoansAndFinanciers()
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

  const handleOpenPreview = (loan) => {
    setSelectedLoan(loan)
    setModalMode('preview')
    setShowModal(true)
  }

  const handleOpenEdit = (loan) => {
    const editObj = {
      ...loan,
      financier: loan.financierId || loan.financier,
      loanDate: loan.loanDate || '',
      maturityDate: loan.maturityDate || '',
      rate: (loan.rate !== undefined && loan.rate !== null && loan.rate !== 'undefined') ? String(loan.rate) : '',
    }
    setSelectedLoan(loan)
    setForm(editObj)
    setInitialFormSnapshot(editObj)
    setModalMode('edit')
    setShowModal(true)
  }

  const handleSave = (e) => {
    if (e) e.preventDefault()
    requestSaveConfirmation({
      title: modalMode === 'add' ? 'Confirm Add Loan' : 'Confirm Loan Update',
      message: `You are about to save changes for Loan #${form.noteNo || 'New'}.`,
      initialValues: initialFormSnapshot,
      currentValues: form,
      labelMap: {
        financier: 'Financier',
        noteNo: 'Note Number',
        loanDate: 'Loan Date',
        maturityDate: 'Maturity Date',
        amount: 'Loan Amount',
        rate: 'Interest Rate (%)',
        remarks: 'Remarks'
      },
      onSaveApi: async () => {
        const payload = {
          financierId: form.financier,
          loanReference: form.noteNo,
          principalAmount: Number(form.amount) || 0,
          notes: form.remarks || ''
        }

        if (form.loanDate) {
          const dateStr = toInputDate(form.loanDate)
          if (dateStr) payload.drawdownDate = dateStr
        }

        if (form.maturityDate) {
          const matStr = toInputDate(form.maturityDate)
          if (matStr) payload.maturityDate = matStr
        }

        if (form.rate !== undefined && form.rate !== null && form.rate !== '') {
          payload.interestRate = Number(form.rate)
        }

        try {
          if (modalMode === 'add') {
            await api.post('/loans', payload)
          } else {
            await api.put(`/loans/${selectedLoan.id}`, payload)
          }
          await fetchLoansAndFinanciers()
          setShowModal(false)
          setForm(emptyForm)
          toast(modalMode === 'add' ? 'Loan created successfully' : 'Loan updated successfully', 'success')
        } catch (err) {
          toast(err.message || 'Failed to save loan', 'error')
          return false
        }
      }
    })
  }

  const handleDelete = async (id) => {
    if (await confirm('Are you sure you want to delete this loan? This action cannot be undone.', { title: 'Delete Loan' })) {
      try {
        await api.delete(`/loans/${id}`)
        await fetchLoansAndFinanciers()
        toast('Loan deleted successfully', 'success')
      } catch (err) {
        toast(err.message || 'Failed to delete loan', 'error')
      }
    }
  }

  const [sortBy, setSortBy] = useState('active-first')

  const activeLoans = loans.filter(l => l.status === 'Active' || l.status === 'Overdue')
  const totalExposure = activeLoans.reduce((s, l) => s + l.pending, 0)
  const totalPrincipal = loans.reduce((s, l) => s + (l.amount || 0), 0)

  const sortedLoans = useMemo(() => {
    return [...loans].sort((a, b) => {
      if (sortBy === 'active-first') {
        const aActive = a.status === 'Active' || a.status === 'Overdue' ? 0 : 1
        const bActive = b.status === 'Active' || b.status === 'Overdue' ? 0 : 1
        if (aActive !== bActive) return aActive - bActive
        return (b.pending || 0) - (a.pending || 0)
      }
      if (sortBy === 'newest') {
        const da = a.loanDate ? new Date(toInputDate(a.loanDate)) : 0
        const db = b.loanDate ? new Date(toInputDate(b.loanDate)) : 0
        return db - da
      }
      if (sortBy === 'oldest') {
        const da = a.loanDate ? new Date(toInputDate(a.loanDate)) : 0
        const db = b.loanDate ? new Date(toInputDate(b.loanDate)) : 0
        return da - db
      }
      if (sortBy === 'highest-pending') {
        return (b.pending || 0) - (a.pending || 0)
      }
      if (sortBy === 'highest-principal') {
        return (b.amount || 0) - (a.amount || 0)
      }
      return 0
    })
  }, [loans, sortBy])

  const cardContainerRef = React.useRef(null)

  const pagination = usePagination({
    items: sortedLoans,
    moduleKey: 'loans',
    initialPageSize: 20,
    filterDependencies: [sortBy],
    containerRef: cardContainerRef
  })

  const handleDownloadPdf = async () => {
    try {
      setDownloadingPdf(true)
      await downloadLoansRegisterPdf({
        loans: sortedLoans,
        companyProfile,
        sortBy
      })
      toast('Loans register PDF downloaded successfully', 'success')
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
        title="Loans"
        description={`${activeLoans.length} active facilities · ₹${fmt(totalExposure)} total pending exposure`}
        breadcrumbs={[{ label: 'Loans' }]}
      >
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
          <div className="w-full sm:w-48">
            <DropdownSelect
              value={sortBy}
              onChange={setSortBy}
              options={[
                { value: 'active-first', label: 'Active First' },
                { value: 'newest', label: 'Newest Date' },
                { value: 'oldest', label: 'Oldest Date' },
                { value: 'highest-pending', label: 'Highest Pending' },
                { value: 'highest-principal', label: 'Highest Principal' }
              ]}
            />
          </div>
          <Button
            variant="outline"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf || loading || sortedLoans.length === 0}
            className="shadow-sm justify-center cursor-pointer"
            title="Download PDF statement of displayed loans"
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
            <span>Add Loan</span>
          </Button>
        </div>
      </PageHeader>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-5">
        <KpiCard
          title="Active Loans"
          value={loading ? <Skeleton className="h-8 w-16" /> : String(activeLoans.length)}
          subtitle="Currently active notes"
          icon={Landmark}
          iconColor="text-blue-600 dark:text-blue-400"
          iconBg="bg-blue-50 dark:bg-blue-950/40 border-blue-100 dark:border-blue-900/40"
        />
        <KpiCard
          title="Total Principal Disbursed"
          value={loading ? <Skeleton className="h-8 w-32" /> : `₹${fmt(totalPrincipal)}`}
          subtitle="All recorded borrowings"
          icon={Coins}
          iconColor="text-slate-600 dark:text-slate-300"
          iconBg="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
        />
        <KpiCard
          title="Total Outstanding Exposure"
          value={loading ? <Skeleton className="h-8 w-32" /> : `₹${fmt(totalExposure)}`}
          subtitle="Principal + accrued interest"
          icon={Coins}
          iconColor="text-rose-600 dark:text-rose-400"
          iconBg="bg-rose-50 dark:bg-rose-950/40 border-rose-100 dark:border-rose-900/40"
        />
      </div>

      {error ? (
        <Card className="p-8">
          <EmptyState icon="search" title="Error Loading Loans" description={error} />
        </Card>
      ) : loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {Array.from({ length: 4 }).map((_, idx) => (
            <SkeletonCard key={idx} className="h-48" />
          ))}
        </div>
      ) : loans.length === 0 ? (
        <Card className="p-8">
          <EmptyState 
            icon="loan" 
            title="No Loans Found" 
            description="Record a loan from financiers or add a new facility to begin tracking." 
            action={{ label: "Add Loan", onClick: handleOpenAdd }} 
          />
        </Card>
      ) : (
        <div className="space-y-5" ref={cardContainerRef}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            {pagination.paginatedItems.map((loan, i) => (
              <motion.div 
                key={loan._id || loan.id} 
                onClick={() => handleOpenPreview(loan)} 
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.2 }}
                className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 p-4 sm:p-6 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all relative group cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-xs font-bold font-mono uppercase tracking-wider text-slate-400">Note #{loan.noteNo || '—'}</p>
                      <h3 className={`text-base sm:text-lg font-bold mt-1 ${loan.isOrphaned ? 'text-slate-400 italic' : 'text-slate-900 dark:text-slate-100'}`}>
                        {loan.isOrphaned ? 'Deleted Financier' : toTitleCase(loan.financier)}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        {loan.rate !== '' && loan.rate !== null && loan.rate !== undefined ? `${loan.rate}% p.a.` : 'Rate: Not specified'} · Issued: {formatDateDisplay(loan.loanDate)}
                      </p>
                    </div>
                    <Badge variant={loan.status === 'Overdue' ? 'danger' : loan.status === 'Closed' ? 'success' : 'purple'} dot>
                      {toTitleCase(loan.status)}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 sm:gap-3 p-3 sm:p-3.5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700/60 mb-4 text-xs">
                    <div>
                      <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase mb-1">Principal</p>
                      <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">₹{fmt(loan.amount)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase mb-1">Repaid</p>
                      <p className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">₹{fmt(loan.repaid)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase mb-1">Pending</p>
                      <p className={`text-xs sm:text-sm font-bold tabular-nums ${loan.pending > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600'}`}>
                        {loan.pending > 0 ? `₹${fmt(loan.pending)}` : 'Nil'}
                      </p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                      <span className="text-xs font-semibold">Repayment Progress</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">{loan.progress}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${loan.progress}%` }} />
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-3.5 border-t border-slate-100 dark:border-slate-700/60">
                  <span className="text-xs text-slate-400 truncate max-w-[160px] sm:max-w-[240px]" title={loan.remarks}>{loan.remarks || '—'}</span>
                  <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setPrintDoc({ type: 'loan', id: loan.id || loan._id })}
                      className="h-9 w-9 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      title="Print Loan Voucher"
                      aria-label="Print Loan Voucher"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleOpenPreview(loan)}
                      className="h-9 w-9 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      title="View Details"
                      aria-label="View Details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleOpenEdit(loan)}
                      className="h-9 w-9 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      title="Edit Loan"
                      aria-label="Edit Loan"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(loan.id)}
                      className="h-9 w-9 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                      title="Delete Loan"
                      aria-label="Delete Loan"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
          <Pagination {...pagination} isLoading={loading} />
        </div>
      )}

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
                    {modalMode === 'add' ? 'Add Loan Facility' : modalMode === 'edit' ? 'Edit Loan Facility' : 'Loan Facility Details'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {modalMode === 'preview' ? `Note #${selectedLoan?.noteNo}` : 'Specify borrower terms and principal balance'}
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
                        <p className="font-bold text-sm text-slate-900 dark:text-slate-100 mt-0.5">{toTitleCase(selectedLoan?.financier)}</p>
                      </div>
                      <Badge variant={selectedLoan?.status === 'Closed' ? 'success' : 'info'} dot>
                        {toTitleCase(selectedLoan?.status)}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                      <div>
                        <span className="text-slate-400 block mb-0.5">Note Number</span>
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{selectedLoan?.noteNo || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Interest Rate</span>
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          {selectedLoan?.rate !== '' && selectedLoan?.rate !== null && selectedLoan?.rate !== undefined ? `${selectedLoan?.rate}% p.a.` : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Loan Date</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{formatDateDisplay(selectedLoan?.loanDate)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Maturity Date</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{formatDateDisplay(selectedLoan?.maturityDate)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Principal Amount</span>
                        <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">₹{fmt(selectedLoan?.amount || 0)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Principal Repaid</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">₹{fmt(selectedLoan?.repaid || 0)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Total Pending</span>
                        <span className="font-bold text-rose-600 dark:text-rose-400 tabular-nums">₹{fmt(selectedLoan?.pending || 0)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <form id="loan-form-dialog" onSubmit={handleSave} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Financier <span className="text-rose-500">*</span>
                      </label>
                      <DropdownSelect
                        value={form.financier}
                        onChange={val => setForm({...form, financier: val})}
                        placeholder="Select Financier"
                        options={financiers.map(f => ({ value: f._id, label: toTitleCase(f.name) }))}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Note Number <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={form.noteNo}
                          onChange={e => setForm({...form, noteNo: e.target.value})}
                          placeholder="e.g. LN-2026-001"
                          className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Principal Amount (₹) <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="number"
                          required
                          value={form.amount}
                          onChange={e => setForm({...form, amount: e.target.value})}
                          placeholder="500000"
                          className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 tabular-nums outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Loan Date
                        </label>
                        <CustomDatePicker
                          value={form.loanDate}
                          onChange={d => setForm({...form, loanDate: d})}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Maturity Date
                        </label>
                        <CustomDatePicker
                          value={form.maturityDate}
                          onChange={d => setForm({...form, maturityDate: d})}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Interest Rate (% p.a.)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={form.rate}
                          onChange={e => setForm({...form, rate: e.target.value})}
                          placeholder="12.00"
                          className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Remarks</label>
                        <textarea
                          rows={1}
                          value={form.remarks}
                          onChange={e => setForm({...form, remarks: e.target.value})}
                          placeholder="Additional notes..."
                          className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
                        />
                      </div>
                    </div>
                  </form>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3 bg-slate-50/50 dark:bg-slate-800/80">
                {modalMode === 'preview' ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const loanId = selectedLoan?.id || selectedLoan?._id
                        setShowModal(false)
                        setPrintDoc({ type: 'loan', id: loanId })
                      }}
                      className="flex items-center gap-1.5"
                    >
                      <Printer className="w-4 h-4" />
                      Print Document
                    </Button>
                    <Button variant="secondary" onClick={() => setShowModal(false)}>Close</Button>
                  </div>
                ) : (
                  <>
                    <Button variant="secondary" onClick={closeModal}>Cancel</Button>
                    <Button type="submit" form="loan-form-dialog" loading={isSaving}>
                      {modalMode === 'add' ? 'Save Loan' : 'Update Loan'}
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

export default Loans
