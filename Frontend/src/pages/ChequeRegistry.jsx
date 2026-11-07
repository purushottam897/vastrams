import React, { useState, useEffect, useReducer, useCallback, useMemo } from 'react'
import { Plus, Search, Trash2, Edit2, Eye, X, CheckSquare, Clock, AlertTriangle, CheckCircle2, DollarSign } from 'lucide-react'
import { toInputDate, fromInputDate, getTodayFormatted } from '../utils/date'
import DropdownSelect from '../components/ui/DropdownSelect'
import CustomDatePicker from '../components/ui/CustomDatePicker'
import { toTitleCase } from '../utils/text'
import EmptyState from '../components/ui/EmptyState'
import Badge from '../components/ui/Badge'
import PartyTypeBadge from '../components/ui/PartyTypeBadge'
import Button from '../components/ui/Button'
import PageHeader from '../components/ui/PageHeader'
import { Card, KpiCard } from '../components/ui/Card'
import FilterToolbar from '../components/ui/FilterToolbar'
import { AnimatePresence, motion } from 'framer-motion'
import { Skeleton, SkeletonTableRow } from '../components/ui/Skeleton'
import { usePagination } from '../hooks/usePagination'
import Pagination from '../components/ui/Pagination'
import api from '../utils/api'
import { useToast } from '../hooks/useToast'
import { useConfirm } from '../hooks/useConfirm'
import { useDirtyForm } from '../hooks/useDirtyForm'
import { useDirtyStateContext } from '../context/DirtyStateContext'
import { useSaveConfirmation } from '../hooks/useSaveConfirmation'
import { SaveConfirmationModal } from '../components/ui/SaveConfirmationModal'

const fmt = (v) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(v)

const BE_STATUS_MAP = {
  PENDING: 'Pending',
  CLEARED: 'cleared',
  BOUNCED: 'bounced',
  CANCELLED: 'deposited',
}
const FE_STATUS_MAP = {
  Pending: 'PENDING',
  cleared: 'CLEARED',
  bounced: 'BOUNCED',
  deposited: 'CANCELLED',
}

const BE_TYPE_MAP = {
  Vendor: 'ISSUED_VENDOR',
  Financier: 'ISSUED_FINANCIER',
}

const getStatusBadgeVariant = (status) => {
  const s = String(status).toLowerCase()
  if (s === 'cleared') return 'success'
  if (s === 'pending') return 'warning'
  if (s === 'deposited') return 'info'
  if (s === 'bounced') return 'danger'
  return 'neutral'
}

const getChequeSchedule = (cheque) => {
  const rawStatus = cheque.rawStatus || 'PENDING'
  if (rawStatus === 'CLEARED' || cheque.status === 'cleared') {
    return { label: 'Cleared', variant: 'success', category: 'cleared', isUpcoming: false, days: null }
  }
  if (rawStatus === 'BOUNCED' || cheque.status === 'bounced') {
    return { label: 'Bounced', variant: 'danger', category: 'bounced', isUpcoming: false, days: null }
  }
  if (rawStatus === 'CANCELLED' || cheque.status === 'deposited') {
    return { label: 'Cancelled', variant: 'neutral', category: 'cancelled', isUpcoming: false, days: null }
  }

  // It is PENDING (Active Upcoming Cheque)
  if (!cheque.rawDate) {
    return { label: 'Upcoming', variant: 'info', category: 'upcoming', isUpcoming: true, days: 0 }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const chqDate = new Date(cheque.rawDate)
  chqDate.setHours(0, 0, 0, 0)

  const diffTime = chqDate.getTime() - today.getTime()
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return { label: 'Due Today', variant: 'warning', category: 'due_today', isUpcoming: true, days: 0 }
  }
  if (diffDays > 0 && diffDays <= 7) {
    return { label: `Due in ${diffDays}d`, variant: 'warning', category: 'due_soon', isUpcoming: true, days: diffDays }
  }
  if (diffDays > 7) {
    return { label: `Upcoming (${diffDays}d)`, variant: 'info', category: 'future', isUpcoming: true, days: diffDays }
  }
  return { label: `Due (${Math.abs(diffDays)}d ago)`, variant: 'warning', category: 'due_past', isUpcoming: true, days: diffDays }
}

export function ChequeRegistry() {
  const toast = useToast()
  const confirm = useConfirm()
  const [banks, setBanks] = useState([])

  const [cheques, setCheques] = useState([])
  const [vendors, setVendors] = useState([])
  const [financiers, setFinanciers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('UPCOMING')
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState('add') // 'add' | 'edit' | 'preview'
  const [selectedCheque, setSelectedCheque] = useState(null)

  const emptyForm = {
    chequeNo: '',
    date: getTodayFormatted(),
    amount: '',
    bank: '',
    partyType: 'Vendor',
    party: '',
    partyId: '',
    status: 'Pending',
    remarks: ''
  }
  const [form, setForm] = useState(emptyForm)
  const [initialFormSnapshot, setInitialFormSnapshot] = useState(emptyForm)
  const { confirmNavigation } = useDirtyStateContext()
  const { confirmConfig, isSaving, requestSaveConfirmation } = useSaveConfirmation()

  const isFormDirty = useMemo(() => {
    if (!showModal || modalMode === 'preview') return false
    return (
      (form.chequeNo || '') !== (initialFormSnapshot.chequeNo || '') ||
      (form.date || '') !== (initialFormSnapshot.date || '') ||
      (form.amount || '') !== (initialFormSnapshot.amount || '') ||
      (form.bank || '') !== (initialFormSnapshot.bank || '') ||
      (form.partyType || '') !== (initialFormSnapshot.partyType || '') ||
      (form.party || '') !== (initialFormSnapshot.party || '') ||
      (form.status || '') !== (initialFormSnapshot.status || '') ||
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
    id: 'cheque-registry-form',
    title: modalMode === 'add' ? 'Add Cheque Form' : 'Edit Cheque Form',
    isDirty: isFormDirty,
    onSave: () => handleSave(),
    onDiscard: () => setForm(emptyForm)
  })

  const fetchData = async (signal) => {
    try {
      setLoading(true)
      const [chequesData, vendorsData, financiersData, profileRes] = await Promise.all([
        api.get('/cheques', { signal }),
        api.get('/vendors', { signal }),
        api.get('/financiers', { signal }),
        api.get('/settings/profile', { signal })
      ])

      const mapped = chequesData.map((c, idx) => ({
        id: c._id,
        chequeNo: c.chequeNumber,
        date: c.chequeDate ? fromInputDate(c.chequeDate.split('T')[0]) : '—',
        rawDate: c.chequeDate ? c.chequeDate.split('T')[0] : '',
        amount: c.amount || 0,
        bank: c.bankName || c.vendorId?.bankName || c.vendorId?.bank || c.financierId?.bank || '—',
        partyType: c.type === 'ISSUED_VENDOR' ? 'Vendor' : 'Financier',
        partyId: c.vendorId?._id || c.financierId?._id || '',
        party: c.partyName || (c.vendorId?.name) || (c.financierId?.name) || '—',
        status: BE_STATUS_MAP[c.status] || 'Pending',
        rawStatus: c.status || 'PENDING',
        remarks: c.bounceReason || '—',
        idx,
      }))

      if (!signal || !signal.aborted) {
        setCheques(mapped)
        setVendors(vendorsData)
        setFinanciers(financiersData)
        if (profileRes && profileRes.data) {
          setBanks(profileRes.data.banks || [])
        }
        setError(null)
      }
    } catch (err) {
      if (!signal || !signal.aborted) {
        setError(err.message || 'Failed to load cheques')
      }
    } finally {
      if (!signal || !signal.aborted) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    fetchData(controller.signal)
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const handleDataChanged = () => fetchData()
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

  const handleOpenPreview = (cheque) => {
    setSelectedCheque(cheque)
    setModalMode('preview')
    setShowModal(true)
  }

  const handleOpenEdit = (cheque) => {
    const editObj = {
      ...cheque,
      partyType: cheque.partyType || 'Vendor',
      status: cheque.status || 'Pending'
    }
    setSelectedCheque(cheque)
    setForm(editObj)
    setInitialFormSnapshot(editObj)
    setModalMode('edit')
    setShowModal(true)
  }

  const handleSave = (e) => {
    if (e) e.preventDefault()
    let selectedPartyId = form.partyId
    if (!selectedPartyId && form.party) {
      if (form.partyType === 'Vendor') {
        selectedPartyId = vendors.find(v => v.name === form.party)?._id || ''
      } else {
        selectedPartyId = financiers.find(f => f.name === form.party)?._id || ''
      }
    }

    requestSaveConfirmation({
      title: modalMode === 'add' ? 'Confirm Register Cheque' : 'Confirm Cheque Update',
      message: `You are about to save changes for Cheque #${form.chequeNo || 'New'}.`,
      initialValues: initialFormSnapshot,
      currentValues: form,
      labelMap: {
        chequeNo: 'Cheque Number',
        date: 'Cheque Date',
        amount: 'Amount',
        bank: 'Bank Name',
        partyType: 'Party Type',
        party: 'Party Name',
        status: 'Status',
        remarks: 'Remarks / Bounce Reason'
      },
      onSaveApi: async () => {
        const payload = {
          chequeNumber: form.chequeNo,
          chequeDate: toInputDate(form.date),
          amount: Number(form.amount) || 0,
          bankName: form.bank,
          type: BE_TYPE_MAP[form.partyType] || 'ISSUED_VENDOR',
          status: modalMode === 'add' ? 'PENDING' : (FE_STATUS_MAP[form.status] || 'PENDING'),
          bounceReason: form.remarks,
          partyName: form.party,
          vendorId: form.partyType === 'Vendor' ? selectedPartyId : undefined,
          financierId: form.partyType === 'Financier' ? selectedPartyId : undefined,
        }

        try {
          if (modalMode === 'add') {
            await api.post('/cheques', payload)
            toast('Cheque registered successfully', 'success')
          } else {
            await api.put(`/cheques/${selectedCheque.id}`, payload)
            toast('Cheque updated successfully', 'success')
          }
          await fetchData()
          setShowModal(false)
          setForm(emptyForm)
        } catch (err) {
          toast(err.message || 'Failed to save cheque', 'error')
          return false
        }
      }
    })
  }

  const handleDelete = async (id) => {
    if (await confirm('Are you sure you want to delete this cheque record? This action cannot be undone.', { title: 'Delete Cheque' })) {
      try {
        await api.delete(`/cheques/${id}`)
        await fetchData()
        toast('Cheque deleted successfully', 'success')
      } catch (err) {
        toast(err.message || 'Failed to delete cheque', 'error')
      }
    }
  }

  const partyOptions = useMemo(() => {
    return form.partyType === 'Vendor'
      ? vendors.map(v => ({ value: v.name, label: toTitleCase(v.name) }))
      : form.partyType === 'Financier'
        ? financiers.map(f => ({ value: f.name, label: toTitleCase(f.name) }))
        : []
  }, [form.partyType, vendors, financiers])

  const upcomingCheques = useMemo(() => {
    return cheques.filter(c => !c.rawStatus || c.rawStatus === 'PENDING')
  }, [cheques])

  const totalUpcomingAmount = useMemo(() => {
    return upcomingCheques.reduce((s, c) => s + (c.amount || 0), 0)
  }, [upcomingCheques])

  const approachingCheques = useMemo(() => {
    return upcomingCheques.filter(c => {
      const s = getChequeSchedule(c)
      return s.days !== null && s.days >= 0 && s.days <= 7
    })
  }, [upcomingCheques])

  const approachingAmount = useMemo(() => {
    return approachingCheques.reduce((s, c) => s + (c.amount || 0), 0)
  }, [approachingCheques])

  const futureCheques = useMemo(() => {
    return upcomingCheques.filter(c => {
      const s = getChequeSchedule(c)
      return s.days !== null && s.days > 7
    })
  }, [upcomingCheques])

  const futureAmount = useMemo(() => {
    return futureCheques.reduce((s, c) => s + (c.amount || 0), 0)
  }, [futureCheques])

  const clearedCount = useMemo(() => cheques.filter(c => c.rawStatus === 'CLEARED' || c.status === 'cleared').length, [cheques])
  const bouncedCount = useMemo(() => cheques.filter(c => c.rawStatus === 'BOUNCED' || c.status === 'bounced').length, [cheques])

  const filtered = useMemo(() => {
    return cheques.filter(c => {
      const matchSearch =
        (c.chequeNo || '').includes(search) ||
        (c.party || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.bank || '').toLowerCase().includes(search.toLowerCase())

      const s = getChequeSchedule(c)
      let matchFilter = true

      if (statusFilter === 'UPCOMING') {
        matchFilter = s.isUpcoming
      } else if (statusFilter === 'DUE_SOON') {
        matchFilter = s.isUpcoming && s.days !== null && s.days >= 0 && s.days <= 7
      } else if (statusFilter === 'FUTURE') {
        matchFilter = s.isUpcoming && s.days !== null && s.days > 7
      } else if (statusFilter === 'ALL') {
        matchFilter = true
      } else if (statusFilter === 'cleared') {
        matchFilter = c.rawStatus === 'CLEARED' || c.status === 'cleared'
      } else if (statusFilter === 'bounced') {
        matchFilter = c.rawStatus === 'BOUNCED' || c.status === 'bounced'
      }

      return matchSearch && matchFilter
    })
  }, [cheques, search, statusFilter])

  const tableContainerRef = React.useRef(null)

  const pagination = usePagination({
    items: filtered,
    moduleKey: 'cheques',
    initialPageSize: 20,
    filterDependencies: [search, statusFilter],
    containerRef: tableContainerRef
  })

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <PageHeader
        title="Cheque Registry"
        description={`${upcomingCheques.length} upcoming cheques (₹${fmt(totalUpcomingAmount)}) · Track scheduled and approaching banking instruments`}
        breadcrumbs={[{ label: 'Cheques' }]}
      >
        <Button onClick={handleOpenAdd} className="shadow-sm">
          <Plus className="w-4 h-4" />
          <span>Add Cheque</span>
        </Button>
      </PageHeader>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-5">
        <KpiCard
          title="Upcoming Cheques"
          value={loading ? <Skeleton className="h-8 w-16" /> : String(upcomingCheques.length)}
          subtitle={`₹${fmt(totalUpcomingAmount)} scheduled`}
          icon={Clock}
          iconColor="text-amber-600 dark:text-amber-400"
          iconBg="bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/40"
        />
        <KpiCard
          title="Approaching (≤ 7 Days)"
          value={loading ? <Skeleton className="h-8 w-16" /> : String(approachingCheques.length)}
          subtitle={`₹${fmt(approachingAmount)} due soon`}
          icon={AlertTriangle}
          iconColor="text-orange-600 dark:text-orange-400"
          iconBg="bg-orange-50 dark:bg-orange-950/40 border-orange-100 dark:border-orange-900/40"
        />
        <KpiCard
          title="Future Dated (> 7 Days)"
          value={loading ? <Skeleton className="h-8 w-16" /> : String(futureCheques.length)}
          subtitle={`₹${fmt(futureAmount)} scheduled ahead`}
          icon={CheckSquare}
          iconColor="text-blue-600 dark:text-blue-400"
          iconBg="bg-blue-50 dark:bg-blue-950/40 border-blue-100 dark:border-blue-900/40"
        />
        <KpiCard
          title="Total Instruments"
          value={loading ? <Skeleton className="h-8 w-16" /> : String(cheques.length)}
          subtitle={`${cheques.length} total recorded`}
          icon={CheckCircle2}
          iconColor="text-slate-600 dark:text-slate-300"
          iconBg="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
        />
      </div>

      {/* Filter Toolbar */}
      <FilterToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by cheque #, party name, bank..."
        isFiltered={search !== '' || statusFilter !== 'UPCOMING'}
        onReset={() => { setSearch(''); setStatusFilter('UPCOMING') }}
      >
        <div className="w-full sm:w-56">
          <DropdownSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'UPCOMING', label: 'Upcoming Cheques' },
              { value: 'DUE_SOON', label: 'Approaching (≤ 7 Days)' },
              { value: 'FUTURE', label: 'Future Dated (> 7 Days)' },
              { value: 'ALL', label: 'All Cheques' }
            ]}
          />
        </div>
      </FilterToolbar>

      {/* Table Card */}
      <Card className="overflow-hidden">
        {error ? (
          <div className="p-8">
            <EmptyState icon="search" title="Error Loading Cheques" description={error} />
          </div>
        ) : loading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/90 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-3.5">Cheque No.</th>
                  <th className="px-6 py-3.5">Cheque Date</th>
                  <th className="px-6 py-3.5 text-right">Amount</th>
                  <th className="px-6 py-3.5">Bank Name</th>
                  <th className="px-6 py-3.5">Party Type</th>
                  <th className="px-6 py-3.5">Party</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Remarks</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <SkeletonTableRow key={idx} cols={9} widths={["w-24", "w-24", "w-20", "w-32", "w-20", "w-36", "w-20", "w-28", "w-20"]} />
                ))}
              </tbody>
            </table>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8">
            {cheques.length === 0 ? (
              <EmptyState
                icon="cheque"
                title="No Cheques Registered"
                description="Register a new cheque to begin tracking clearing milestones."
                action={{ label: 'Add Cheque', onClick: handleOpenAdd }}
              />
            ) : (
              <EmptyState
                icon="search"
                title="No Matching Cheques"
                description="Try adjusting your search or filter keywords."
              />
            )}
          </div>
        ) : (
          <>
            {/* Mobile Cards View (< md) */}
            <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-700/50">
              {pagination.paginatedItems.map((c, i) => (
                <div 
                  key={c._id || c.id} 
                  onClick={() => handleOpenPreview(c)} 
                  className="p-4 space-y-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400 block">
                        Cheque #{c.chequeNo}
                      </span>
                      <span className="text-xs text-slate-500 font-medium">{c.date}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs py-2 px-3 rounded-lg bg-slate-50/80 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/60">
                    <div className="min-w-0">
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Party</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100 truncate block">{toTitleCase(c.party)}</span>
                      <div className="mt-1">
                        <PartyTypeBadge type={c.partyType} />
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Amount</span>
                      <span className="font-bold text-sm text-slate-900 dark:text-slate-100 tabular-nums block">
                        ₹{fmt(c.amount)}
                      </span>
                      {c.bank && c.bank !== '—' && (
                        <span className="text-[11px] text-slate-500 truncate block mt-1">{toTitleCase(c.bank)}</span>
                      )}
                    </div>
                    {c.remarks && (
                      <div className="col-span-2 pt-1 border-t border-slate-200/40 dark:border-slate-700/40 text-[11px] text-slate-500 truncate">
                        <span className="text-slate-400 font-medium">Remarks: </span>
                        <span>{c.remarks}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-1.5 pt-1" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => handleOpenPreview(c)}
                      className="h-9 px-3 rounded-lg text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors"
                      title="View Details"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View</span>
                    </button>
                    <button
                      onClick={() => handleOpenEdit(c)}
                      className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white bg-slate-100 dark:bg-slate-700 transition-colors"
                      title="Edit Cheque"
                      aria-label="Edit Cheque"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="h-9 w-9 flex items-center justify-center rounded-lg text-rose-500 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 transition-colors"
                      title="Delete Cheque"
                      aria-label="Delete Cheque"
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
                    <th className="px-6 py-3.5">Cheque No.</th>
                    <th className="px-6 py-3.5">Cheque Date</th>
                    <th className="px-6 py-3.5 text-right">Amount</th>
                    <th className="px-6 py-3.5">Bank Name</th>
                    <th className="px-6 py-3.5">Party Type</th>
                    <th className="px-6 py-3.5">Party</th>
                    <th className="px-6 py-3.5">Remarks</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {pagination.paginatedItems.map((c, i) => (
                    <tr 
                      key={c._id || c.id} 
                      onClick={() => handleOpenPreview(c)} 
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer h-16"
                    >
                      <td className="px-6 py-4 font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {c.chequeNo}
                      </td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">{c.date}</td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                        ₹{fmt(c.amount)}
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-300 font-medium">{c.bank !== '—' ? toTitleCase(c.bank) : '—'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <PartyTypeBadge type={c.partyType} />
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[200px]">{toTitleCase(c.party)}</td>
                      <td className="px-6 py-4 text-slate-400 italic truncate max-w-[180px]">{c.remarks || '—'}</td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => handleOpenPreview(c)}
                            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(c)}
                            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            title="Edit Cheque"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="Delete Cheque"
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
                    {modalMode === 'add' ? 'Register Cheque' : modalMode === 'edit' ? 'Edit Cheque Record' : 'Cheque Record Details'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {modalMode === 'preview' ? `Cheque #${selectedCheque?.chequeNo}` : 'Enter cheque instrument specifics and payee information'}
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
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">{selectedCheque?.partyType}</span>
                        <p className="font-bold text-sm text-slate-900 dark:text-slate-100 mt-0.5">{toTitleCase(selectedCheque?.party)}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                      <div>
                        <span className="text-slate-400 block mb-0.5">Cheque Number</span>
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{selectedCheque?.chequeNo}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Cheque Date</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{selectedCheque?.date}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Cheque Amount</span>
                        <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">₹{fmt(selectedCheque?.amount || 0)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Drawee Bank</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{selectedCheque?.bank || '—'}</span>
                      </div>
                      {selectedCheque?.remarks && (
                        <div className="col-span-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                          <span className="text-slate-400 block mb-0.5">Remarks / Reason</span>
                          <span className="text-slate-700 dark:text-slate-300">{selectedCheque.remarks}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <form id="cheque-form" onSubmit={handleSave} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Party Type <span className="text-rose-500">*</span>
                        </label>
                        <DropdownSelect
                          value={form.partyType}
                          onChange={val => setForm({...form, partyType: val, party: '', partyId: ''})}
                          options={[
                            { value: 'Vendor', label: 'Vendor' },
                            { value: 'Financier', label: 'Financier' }
                          ]}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Party Name <span className="text-rose-500">*</span>
                        </label>
                        <DropdownSelect
                          value={form.party}
                          onChange={val => {
                            const found = form.partyType === 'Vendor' 
                              ? vendors.find(v => v.name === val)
                              : financiers.find(f => f.name === val)
                            setForm({ ...form, party: val, partyId: found?._id || '' })
                          }}
                          placeholder="Select Party"
                          options={partyOptions}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Cheque Number <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="123456"
                          value={form.chequeNo}
                          onChange={e => setForm({...form, chequeNo: e.target.value.slice(0, 6).replace(/[^0-9]/g, '')})}
                          className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Amount (₹) <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="number"
                          required
                          min={1}
                          placeholder="50000"
                          value={form.amount}
                          onChange={e => setForm({...form, amount: e.target.value})}
                          className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 tabular-nums outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Cheque Date <span className="text-rose-500">*</span>
                        </label>
                        <CustomDatePicker
                          value={form.date}
                          onChange={d => setForm({...form, date: d})}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Drawee Bank Name</label>
                        <input
                          type="text"
                          placeholder="e.g. State Bank of India"
                          value={form.bank}
                          onChange={e => setForm({...form, bank: e.target.value})}
                          className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Remarks</label>
                      <textarea
                        rows={2}
                        value={form.remarks}
                        onChange={e => setForm({...form, remarks: e.target.value})}
                        placeholder="Additional remarks..."
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
                    <Button type="submit" form="cheque-form" loading={isSaving}>
                      {modalMode === 'add' ? 'Register Cheque' : 'Update Cheque'}
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

export default ChequeRegistry
