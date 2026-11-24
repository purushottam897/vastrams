import React, { useState, useEffect, useReducer, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, Trash2, Edit2, Eye, X, Landmark, Percent, DollarSign, Printer } from 'lucide-react'
import DropdownSelect from '../components/ui/DropdownSelect'
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
import { downloadFinanceSummaryPdf } from '../utils/financePdf'

const fmt = (v) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(v)
const initials = (name) => (name || '').split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()
const avatarColors = [
  'bg-indigo-50 text-indigo-700 border-indigo-200',
  'bg-blue-50 text-blue-700 border-blue-200',
  'bg-purple-50 text-purple-700 border-purple-200',
  'bg-emerald-50 text-emerald-700 border-emerald-200'
]

export function Financiers() {
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const { companyProfile } = useCompanyProfile()
  const [financiers, setFinanciers] = useState([])
  const [loading, setLoading] = useState(true)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState('add') // 'add' | 'edit' | 'preview'
  const [selectedFin, setSelectedFin] = useState(null)

  const emptyForm = {
    name: '',
    phone: '',
    address: '',
    status: 'Active',
    notes: '',
    defaultInterestRate: 12
  }
  const [form, setForm] = useState(emptyForm)
  const [initialFormSnapshot, setInitialFormSnapshot] = useState(emptyForm)
  const { confirmNavigation } = useDirtyStateContext()
  const { confirmConfig, isSaving, requestSaveConfirmation } = useSaveConfirmation()

  const isFormDirty = useMemo(() => {
    if (!showModal || modalMode === 'preview') return false
    return (
      (form.name || '') !== (initialFormSnapshot.name || '') ||
      (form.phone || '') !== (initialFormSnapshot.phone || '') ||
      (form.address || '') !== (initialFormSnapshot.address || '') ||
      (form.status || '') !== (initialFormSnapshot.status || '') ||
      (form.notes || '') !== (initialFormSnapshot.notes || '') ||
      (form.defaultInterestRate || '') !== (initialFormSnapshot.defaultInterestRate || '')
    )
  }, [showModal, modalMode, form, initialFormSnapshot])

  const closeModal = useCallback(() => {
    confirmNavigation(() => {
      setShowModal(false)
      setForm(emptyForm)
    })
  }, [confirmNavigation])

  useDirtyForm({
    id: 'financier-form',
    title: modalMode === 'add' ? 'Add Financier Form' : 'Edit Financier Form',
    isDirty: isFormDirty,
    onSave: () => handleSave(),
    onDiscard: () => setForm(emptyForm)
  })

  const fetchFinanciers = async (signal) => {
    try {
      setLoading(true)
      const data = await api.get('/financiers', { signal })
      if (!signal || !signal.aborted) {
        setFinanciers(data.map(f => ({
          ...f,
          id: f._id,
          outstanding: f.outstandingBalance
        })))
        setLoading(false)
      }
    } catch (err) {
      if (!signal || !signal.aborted) {
        setError(err.message || 'Failed to fetch financiers')
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    fetchFinanciers(controller.signal)
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const handleDataChanged = () => {
      fetchFinanciers()
    }
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

  const handleOpenPreview = (fin) => {
    setSelectedFin(fin)
    setModalMode('preview')
    setShowModal(true)
  }

  const handleOpenEdit = (fin) => {
    const editObj = { ...fin }
    setSelectedFin(fin)
    setForm(editObj)
    setInitialFormSnapshot(editObj)
    setModalMode('edit')
    setShowModal(true)
  }

  const handleSave = (e) => {
    if (e) e.preventDefault()
    requestSaveConfirmation({
      title: modalMode === 'add' ? 'Confirm Add Financier' : 'Confirm Financier Update',
      message: `You are about to save changes for financier "${form.name || 'Financier'}".`,
      initialValues: initialFormSnapshot,
      currentValues: form,
      labelMap: {
        name: 'Financier Name',
        phone: 'Phone Number',
        address: 'Address',
        status: 'Status',
        notes: 'Notes / Remarks',
        defaultInterestRate: 'Default Interest Rate (%)'
      },
      onSaveApi: async () => {
        const payload = {
          name: form.name,
          phone: form.phone,
          address: form.address,
          status: form.status || 'Active',
          notes: form.notes,
          defaultInterestRate: Number(form.defaultInterestRate) || 12
        }

        try {
          if (modalMode === 'add') {
            await api.post('/financiers', payload)
          } else {
            await api.put(`/financiers/${selectedFin.id}`, payload)
          }
          await fetchFinanciers()
          setShowModal(false)
          setForm(emptyForm)
          toast(modalMode === 'add' ? 'Financier created successfully' : 'Financier updated successfully', 'success')
        } catch (err) {
          toast(err.message || 'Failed to save financier', 'error')
          return false
        }
      }
    })
  }

  const handleDelete = async (id) => {
    const financier = financiers.find(f => f.id === id)
    const name = financier ? financier.name : ''
    if (await confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`, { title: 'Delete Financier' })) {
      try {
        await api.delete(`/financiers/${id}`)
        await fetchFinanciers()
        toast('Financier deleted successfully', 'success')
      } catch (err) {
        toast(err.message || 'Failed to delete financier', 'error')
      }
    }
  }

  const tableContainerRef = React.useRef(null)

  const filtered = useMemo(() => {
    return financiers.filter(f => {
      const matchSearch =
        (f.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (f.notes && f.notes.toLowerCase().includes(search.toLowerCase())) ||
        (f.phone && f.phone.includes(search))

      const matchStatus =
        statusFilter === 'ALL' ||
        String(f.status).toUpperCase() === statusFilter.toUpperCase()

      return matchSearch && matchStatus
    })
  }, [financiers, search, statusFilter])

  const pagination = usePagination({
    items: filtered,
    moduleKey: 'financiers',
    initialPageSize: 20,
    filterDependencies: [search, statusFilter],
    containerRef: tableContainerRef
  })

  const totalOutstanding = useMemo(() => financiers.reduce((s, f) => s + (f.outstanding || 0), 0), [financiers])
  const activeLoansTotal = useMemo(() => financiers.reduce((s, f) => s + (f.loansCount || 0), 0), [financiers])

  const handleDownloadPdf = async () => {
    try {
      setDownloadingPdf(true)
      await downloadFinanceSummaryPdf({
        financiers: filtered,
        companyProfile,
        search,
        statusFilter
      })
      toast('Finance statement PDF downloaded successfully', 'success')
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
        title="Finance"
        description="Manage financiers, credit facilities, interest terms, and loan liabilities"
        breadcrumbs={[{ label: 'Finance' }]}
      >
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf || loading || filtered.length === 0}
            className="shadow-sm justify-center cursor-pointer"
            title="Download PDF statement of currently displayed finance records"
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
            <span>Add Finance</span>
          </Button>
        </div>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-5">
        <KpiCard
          title="Total Financiers"
          value={loading ? <Skeleton className="h-8 w-16" /> : String(financiers.length)}
          subtitle="Registered capital partners"
          icon={Landmark}
          iconColor="text-indigo-600 dark:text-indigo-400"
          iconBg="bg-indigo-50 dark:bg-indigo-950/40 border-indigo-100 dark:border-indigo-900/40"
        />
        <KpiCard
          title="Active Loan Accounts"
          value={loading ? <Skeleton className="h-8 w-16" /> : String(activeLoansTotal)}
          subtitle="Ongoing facilities"
          icon={Landmark}
          iconColor="text-emerald-600 dark:text-emerald-400"
          iconBg="bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/40"
        />
        <KpiCard
          title="Total Loan Exposure"
          value={loading ? <Skeleton className="h-8 w-32" /> : `₹${fmt(totalOutstanding)}`}
          subtitle="Remaining loan balance"
          icon={DollarSign}
          iconColor="text-rose-600 dark:text-rose-400"
          iconBg="bg-rose-50 dark:bg-rose-950/40 border-rose-100 dark:border-rose-900/40"
        />
      </div>

      {/* Filter Toolbar */}
      <FilterToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search financiers by name, phone, notes..."
        isFiltered={search !== '' || statusFilter !== 'ALL'}
        onReset={() => { setSearch(''); setStatusFilter('ALL') }}
      >
        <div className="w-full sm:w-48">
          <DropdownSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'ALL', label: 'All Statuses' },
              { value: 'Active', label: 'Active' },
              { value: 'Inactive', label: 'Inactive' }
            ]}
          />
        </div>
      </FilterToolbar>

      {/* Table Card */}
      <Card className="overflow-hidden">
        {error ? (
          <div className="p-8">
            <EmptyState icon="search" title="Error Loading Financiers" description={error} />
          </div>
        ) : loading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/90 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-3.5">Financier Name</th>
                  <th className="px-6 py-3.5">Phone</th>
                  <th className="px-6 py-3.5">Address</th>
                  <th className="px-6 py-3.5 text-right">Active Loans</th>
                  <th className="px-6 py-3.5 text-right">Outstanding</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <SkeletonTableRow key={idx} cols={7} widths={["w-36", "w-28", "w-44", "w-16", "w-20", "w-16", "w-20"]} />
                ))}
              </tbody>
            </table>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8">
            {financiers.length === 0 ? (
              <EmptyState 
                icon="bank" 
                title="No Financiers Found" 
                description="Add your first financier to start managing loans." 
                action={{ label: "Add Finance", onClick: handleOpenAdd }} 
              />
            ) : (
              <EmptyState 
                icon="search" 
                title="No Matching Financiers" 
                description="No financiers match your search filters. Try clearing filters." 
              />
            )}
          </div>
        ) : (
          <>
            {/* Mobile Cards View (< md) */}
            <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-700/50">
              {pagination.paginatedItems.map((f, i) => (
                <div 
                  key={f._id || f.id} 
                  onClick={() => navigate(`/financiers/${f.id}`)} 
                  className="p-4 space-y-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-10 w-10 rounded-xl border flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs ${avatarColors[i % avatarColors.length]}`}>
                        {initials(f.name)}
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100 block truncate">
                          {toTitleCase(f.name)}
                        </span>
                        {f.phone && <p className="text-xs text-slate-500 font-mono">{f.phone}</p>}
                      </div>
                    </div>
                    <Badge variant={String(f.status).toLowerCase() === 'active' ? 'success' : 'neutral'} dot>
                      {toTitleCase(f.status || 'Active')}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs py-2 px-3 rounded-lg bg-slate-50/80 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/60">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Active Loans</span>
                      <span className="font-bold text-sm text-slate-900 dark:text-slate-100 block">{f.loansCount || 0} Loans</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Outstanding Exposure</span>
                      <span className="font-bold text-sm text-rose-600 dark:text-rose-400 tabular-nums block">
                        ₹{fmt(f.outstanding)}
                      </span>
                    </div>
                    {f.address && (
                      <div className="col-span-2 pt-1 border-t border-slate-200/40 dark:border-slate-700/40 text-[11px] text-slate-500 truncate">
                        <span>Address: {f.address}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-1.5 pt-1" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => navigate(`/financiers/${f.id}`)}
                      className="h-9 px-3 rounded-lg text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors"
                      title="View Profile & Loans"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Profile</span>
                    </button>
                    <button
                      onClick={() => handleOpenEdit(f)}
                      className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white bg-slate-100 dark:bg-slate-700 transition-colors"
                      title="Edit Financier"
                      aria-label="Edit Financier"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(f.id)}
                      className="h-9 w-9 flex items-center justify-center rounded-lg text-rose-500 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 transition-colors"
                      title="Delete Financier"
                      aria-label="Delete Financier"
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
                    <th className="px-6 py-3.5">Financier Name</th>
                    <th className="px-6 py-3.5">Phone</th>
                    <th className="px-6 py-3.5">Address</th>
                    <th className="px-6 py-3.5 text-right">Active Loans</th>
                    <th className="px-6 py-3.5 text-right">Outstanding</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {pagination.paginatedItems.map((f, i) => (
                    <tr 
                      key={f._id || f.id} 
                      onClick={() => navigate(`/financiers/${f.id}`)} 
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer h-16"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`h-9 w-9 rounded-xl border flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs ${avatarColors[i % avatarColors.length]}`}>
                            {initials(f.name)}
                          </div>
                          <div className="min-w-0">
                            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 block hover:text-emerald-600 transition-colors">
                              {toTitleCase(f.name)}
                            </span>
                            {f.notes && <p className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-[220px]">{f.notes}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-300 font-mono font-medium whitespace-nowrap">{f.phone || '—'}</td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400 truncate max-w-[240px]">{f.address || '—'}</td>
                      <td className="px-6 py-4 text-slate-900 dark:text-slate-100 text-right tabular-nums font-semibold whitespace-nowrap">
                        {f.loansCount || 0}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-rose-600 dark:text-rose-400 tabular-nums whitespace-nowrap">
                        ₹{fmt(f.outstanding)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={String(f.status).toLowerCase() === 'active' ? 'success' : 'neutral'} dot>
                          {toTitleCase(f.status || 'Active')}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => navigate(`/financiers/${f.id}`)}
                            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            title="View Profile & Loans"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(f)}
                            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            title="Edit Financier"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(f.id)}
                            className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="Delete Financier"
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
              className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden relative z-10 flex flex-col max-h-[90vh]"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/80">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100" style={{ fontFamily: 'var(--font-display)' }}>
                    {modalMode === 'add' ? 'Add Finance Provider' : modalMode === 'edit' ? 'Edit Financier Details' : 'Financier Details'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {modalMode === 'preview' ? 'Financier overview' : 'Enter financier contact and terms'}
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
                <form id="financier-form" onSubmit={handleSave} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Financier Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={e => setForm({...form, name: e.target.value})}
                      placeholder="e.g. Bajaj Finance Ltd"
                      className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Phone Number</label>
                      <input
                        type="text"
                        value={form.phone}
                        onChange={e => setForm({...form, phone: e.target.value})}
                        placeholder="9876543210"
                        className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Status</label>
                      <DropdownSelect
                        value={form.status}
                        onChange={val => setForm({...form, status: val})}
                        options={[
                          { value: 'Active', label: 'Active' },
                          { value: 'Inactive', label: 'Inactive' }
                        ]}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Office Address</label>
                    <textarea
                      rows={2}
                      value={form.address}
                      onChange={e => setForm({...form, address: e.target.value})}
                      placeholder="Address..."
                      className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Notes / Remarks</label>
                    <textarea
                      rows={2}
                      value={form.notes}
                      onChange={e => setForm({...form, notes: e.target.value})}
                      placeholder="Notes regarding interest settlement, credit line..."
                      className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
                    />
                  </div>
                </form>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3 bg-slate-50/50 dark:bg-slate-800/80">
                <Button variant="secondary" onClick={closeModal}>
                  Cancel
                </Button>
                <Button type="submit" form="financier-form" loading={isSaving}>
                  {modalMode === 'add' ? 'Save Financier' : 'Update Financier'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <SaveConfirmationModal {...confirmConfig} isSaving={isSaving} />
    </div>
  )
}

export default Financiers
