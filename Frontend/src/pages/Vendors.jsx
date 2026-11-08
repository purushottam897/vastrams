import React, { useState, useEffect, useReducer, useCallback, useMemo } from 'react'
import { Plus, Search, Trash2, Edit2, Eye, X, Building2, Phone, Mail, MapPin, Landmark, DollarSign } from 'lucide-react'
import DropdownSelect from '../components/ui/DropdownSelect'
import { toTitleCase } from '../utils/text'
import EmptyState from '../components/ui/EmptyState'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import PageHeader from '../components/ui/PageHeader'
import { Card, CardHeader, CardTitle, CardContent, KpiCard } from '../components/ui/Card'
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

// ── Fetch state reducer ───────────────────────────────────────────────────────
const fetchInitial = { status: 'idle', vendors: [], error: null }
function fetchReducer(state, action) {
  switch (action.type) {
    case 'FETCH_START':   return { ...state, status: 'loading', error: null }
    case 'FETCH_SUCCESS': return { status: 'success', vendors: action.payload, error: null }
    case 'FETCH_ERROR':   return { ...state, status: 'error', error: action.payload }
    default:              return state
  }
}

export function Vendors() {
  const toast = useToast()
  const confirm = useConfirm()

  const [fetchState, fetchDispatch] = useReducer(fetchReducer, fetchInitial)
  const { vendors, status: fetchStatus, error } = fetchState
  const loading = fetchStatus === 'idle' || fetchStatus === 'loading'

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState('add') // 'add' | 'edit' | 'preview'
  const [selectedVendor, setSelectedVendor] = useState(null)

  const emptyForm = {
    name: '',
    type: 'largeVendor',
    customType: '',
    gstin: '',
    phone: '',
    email: '',
    address: '',
    bankName: '',
    accountNo: '',
    confirmAccountNo: '',
    ifsc: '',
    confirmIfsc: '',
    category: '',
    openingBalance: 0,
    status: 'Active'
  }
  const [form, setForm] = useState(emptyForm)
  const [formErrors, setFormErrors] = useState({})
  const [initialFormSnapshot, setInitialFormSnapshot] = useState(emptyForm)
  const { confirmNavigation } = useDirtyStateContext()

  const isFormDirty = useMemo(() => {
    if (!showModal || modalMode === 'preview') return false
    return (
      (form.name || '') !== (initialFormSnapshot.name || '') ||
      (form.phone || '') !== (initialFormSnapshot.phone || '') ||
      (form.email || '') !== (initialFormSnapshot.email || '') ||
      (form.gstin || '') !== (initialFormSnapshot.gstin || '') ||
      (form.address || '') !== (initialFormSnapshot.address || '') ||
      (form.bankName || '') !== (initialFormSnapshot.bankName || '') ||
      (form.accountNo || '') !== (initialFormSnapshot.accountNo || '') ||
      (form.ifsc || '') !== (initialFormSnapshot.ifsc || '') ||
      (form.category || '') !== (initialFormSnapshot.category || '')
    )
  }, [showModal, modalMode, form, initialFormSnapshot])

  const closeModal = useCallback(() => {
    confirmNavigation(() => {
      setShowModal(false)
      setForm(emptyForm)
    })
  }, [confirmNavigation])

  useDirtyForm({
    isDirty: isFormDirty,
    onSave: () => handleSave(),
    onDiscard: () => {
      setShowModal(false)
      setForm(emptyForm)
    }
  })

  const { confirmConfig, isSaving, requestSaveConfirmation } = useSaveConfirmation()

  const fetchVendors = useCallback(async () => {
    fetchDispatch({ type: 'FETCH_START' })
    try {
      const data = await api.get('/vendors')
      const normalized = (Array.isArray(data) ? data : []).map(v => ({
        ...v,
        id: v._id || v.id,
        outstanding: v.outstandingBalance ?? v.outstanding ?? (Number(v.openingBalance) || 0)
      }))
      fetchDispatch({ type: 'FETCH_SUCCESS', payload: normalized })
    } catch (err) {
      fetchDispatch({ type: 'FETCH_ERROR', payload: err.message || 'Failed to load vendors' })
    }
  }, [])

  useEffect(() => {
    fetchVendors()
  }, [fetchVendors])

  useEffect(() => {
    const handleDataChanged = () => fetchVendors()
    window.addEventListener('api-data-changed', handleDataChanged)
    window.addEventListener('vastrams:data-restored', handleDataChanged)
    return () => {
      window.removeEventListener('api-data-changed', handleDataChanged)
      window.removeEventListener('vastrams:data-restored', handleDataChanged)
    }
  }, [fetchVendors])

  const handleOpenAdd = () => {
    setForm(emptyForm)
    setInitialFormSnapshot(emptyForm)
    setFormErrors({})
    setModalMode('add')
    setShowModal(true)
  }

  const handleOpenPreview = async (vendor) => {
    setSelectedVendor(vendor)
    setModalMode('preview')
    setShowModal(true)
    try {
      const vId = vendor.id || vendor._id
      if (vId) {
        const fresh = await api.get(`/vendors/${vId}`)
        if (fresh) {
          setSelectedVendor(prev => ({
            ...fresh,
            id: fresh._id || fresh.id || prev?.id,
            outstanding: fresh.outstandingBalance ?? fresh.outstanding ?? (Number(fresh.openingBalance) || 0)
          }))
        }
      }
    } catch {}
  }

  const handleOpenEdit = (vendor) => {
    const editObj = {
      ...vendor,
      confirmAccountNo: vendor.accountNo || '',
      confirmIfsc: vendor.ifsc || '',
      type: vendor.type || 'largeVendor'
    }
    setSelectedVendor(vendor)
    setForm(editObj)
    setInitialFormSnapshot(editObj)
    setFormErrors({})
    setModalMode('edit')
    setShowModal(true)
  }

  const handleSave = (e) => {
    if (e) e.preventDefault()
    const errors = {}
    if (form.accountNo && form.accountNo !== form.confirmAccountNo) {
      errors.confirmAccountNo = 'Account numbers do not match'
    }
    if (form.ifsc && form.ifsc !== form.confirmIfsc) {
      errors.confirmIfsc = 'IFSC codes do not match'
    }
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }
    setFormErrors({})

    requestSaveConfirmation({
      title: modalMode === 'add' ? 'Confirm Add Vendor' : 'Confirm Vendor Update',
      message: `You are about to save changes for vendor "${form.name || 'Vendor'}".`,
      initialValues: initialFormSnapshot,
      currentValues: form,
      labelMap: {
        name: 'Vendor Name',
        type: 'Vendor Type',
        phone: 'Phone Number',
        email: 'Email Address',
        gstin: 'GSTIN',
        address: 'Address',
        bankName: 'Bank Name',
        accountNo: 'Account Number',
        ifsc: 'IFSC Code',
        category: 'Category',
        openingBalance: 'Opening Balance',
        status: 'Status'
      },
      onSaveApi: async () => {
        const payload = {
          name: form.name,
          type: form.type || 'largeVendor',
          gstin: form.gstin,
          phone: form.phone,
          email: form.email,
          address: form.address,
          bankName: form.bankName,
          accountNo: form.accountNo,
          ifsc: form.ifsc,
          category: form.category,
          openingBalance: Number(form.openingBalance) || 0,
          status: form.status || 'Active'
        }

        try {
          if (modalMode === 'add') {
            await api.post('/vendors', payload)
          } else {
            await api.put(`/vendors/${selectedVendor.id}`, payload)
          }
          await fetchVendors()
          setShowModal(false)
          setForm(emptyForm)
          toast(modalMode === 'add' ? 'Vendor created successfully' : 'Vendor updated successfully', 'success')
        } catch (err) {
          toast(err.message || 'Failed to save vendor', 'error')
          return false
        }
      }
    })
  }

  const handleDelete = async (id) => {
    const vendor = vendors.find(v => v.id === id)
    const name = vendor ? vendor.name : ''
    if (await confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`, { title: 'Delete Vendor' })) {
      try {
        await api.delete(`/vendors/${id}`)
        await fetchVendors()
        toast('Vendor deleted successfully', 'success')
      } catch (err) {
        toast(err.message || 'Failed to delete vendor', 'error')
      }
    }
  }

  const tableContainerRef = React.useRef(null)

  const filtered = useMemo(() => {
    return vendors.filter(v => {
      const matchSearch =
        (v.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (v.category || '').toLowerCase().includes(search.toLowerCase()) ||
        (v.gstin || '').toLowerCase().includes(search.toLowerCase()) ||
        (v.phone || '').toLowerCase().includes(search.toLowerCase())

      const matchStatus =
        statusFilter === 'ALL' ||
        String(v.status).toUpperCase() === statusFilter.toUpperCase()

      return matchSearch && matchStatus
    })
  }, [vendors, search, statusFilter])

  const pagination = usePagination({
    items: filtered,
    moduleKey: 'vendors',
    initialPageSize: 20,
    filterDependencies: [search, statusFilter],
    containerRef: tableContainerRef
  })

  const totalOutstanding = useMemo(() => vendors.reduce((s, v) => s + (v.outstanding || 0), 0), [vendors])
  const activeCount = useMemo(() => vendors.filter(v => String(v.status).toLowerCase() === 'active').length, [vendors])

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Page Header */}
      <PageHeader
        title="Vendors"
        description="Manage supplier profiles, payment terms, and outstanding balances"
        breadcrumbs={[{ label: 'Vendors' }]}
      >
        <Button onClick={handleOpenAdd} className="shadow-sm">
          <Plus className="w-4 h-4" />
          <span>Add Vendor</span>
        </Button>
      </PageHeader>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <KpiCard
          title="Total Vendors"
          value={loading ? <Skeleton className="h-8 w-16" /> : String(vendors.length)}
          subtitle="Registered suppliers"
          icon={Building2}
          iconColor="text-slate-600 dark:text-slate-300"
          iconBg="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
        />
        <KpiCard
          title="Active Accounts"
          value={loading ? <Skeleton className="h-8 w-16" /> : String(activeCount)}
          subtitle="Currently active"
          icon={Building2}
          iconColor="text-emerald-600 dark:text-emerald-400"
          iconBg="bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/40"
        />
        <KpiCard
          title="Total Payables Outstanding"
          value={loading ? <Skeleton className="h-8 w-28" /> : `₹${fmt(totalOutstanding)}`}
          subtitle="Unsettled vendor balances"
          icon={DollarSign}
          iconColor="text-rose-600 dark:text-rose-400"
          iconBg="bg-rose-50 dark:bg-rose-950/40 border-rose-100 dark:border-rose-900/40"
        />
      </div>

      {/* Filter Toolbar */}
      <FilterToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, GSTIN, phone, category..."
        isFiltered={search !== '' || statusFilter !== 'ALL'}
        onReset={() => { setSearch(''); setStatusFilter('ALL') }}
      >
        <div className="w-48">
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

      {/* Data Table Card */}
      <Card className="overflow-hidden">
        {error ? (
          <div className="p-8">
            <EmptyState icon="search" title="Error Loading Vendors" description={error} />
          </div>
        ) : loading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/90 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-3.5">Vendor Name</th>
                  <th className="px-6 py-3.5">Type</th>
                  <th className="px-6 py-3.5">Contact</th>
                  <th className="px-6 py-3.5">Category</th>
                  <th className="px-6 py-3.5 text-right">Outstanding</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <SkeletonTableRow key={idx} cols={7} widths={["w-36", "w-20", "w-28", "w-24", "w-20", "w-16", "w-20"]} />
                ))}
              </tbody>
            </table>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8">
            {vendors.length === 0 ? (
              <EmptyState 
                icon="store" 
                title="No Vendors Found" 
                description="Get started by registering your first vendor." 
                action={{ label: "Add Vendor", onClick: handleOpenAdd }} 
              />
            ) : (
              <EmptyState 
                icon="search" 
                title="No Matching Vendors" 
                description="No vendors match your search filters. Try clearing filters." 
              />
            )}
          </div>
        ) : (
          <>
            {/* Mobile Cards View (< md) */}
            <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-700/50">
              {pagination.paginatedItems.map((v, i) => (
                <div 
                  key={v._id || v.id} 
                  onClick={() => handleOpenPreview(v)}
                  className="p-4 space-y-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-10 w-10 rounded-xl border flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs ${avatarColors[i % avatarColors.length]}`}>
                        {initials(v.name || 'V')}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{toTitleCase(v.name)}</p>
                        <p className="text-xs text-slate-400 font-mono">GST: {v.gstin || '—'}</p>
                      </div>
                    </div>
                    <Badge variant="neutral">{toTitleCase(v.type || 'Vendor')}</Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs py-2 px-3 rounded-lg bg-slate-50/80 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/60">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Category</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300 truncate block">{toTitleCase(v.category || 'General')}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Outstanding</span>
                      <span className={`font-bold text-sm tabular-nums ${v.outstanding > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}`}>
                        {v.outstanding > 0 ? `₹${fmt(v.outstanding)}` : 'Clear'}
                      </span>
                    </div>
                    {v.phone && (
                      <div className="col-span-2 pt-1 border-t border-slate-200/40 dark:border-slate-700/40 flex items-center justify-between text-[11px] text-slate-500">
                        <span>Phone: <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{v.phone}</span></span>
                        {v.email && <span className="truncate max-w-[140px]">{v.email}</span>}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-1" onClick={e => e.stopPropagation()}>
                    <Badge variant={String(v.status).toLowerCase() === 'active' ? 'success' : 'neutral'} dot>
                      {toTitleCase(v.status || 'Active')}
                    </Badge>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenPreview(v)}
                        className="h-9 px-3 rounded-lg text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View</span>
                      </button>
                      <button
                        onClick={() => handleOpenEdit(v)}
                        className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white bg-slate-100 dark:bg-slate-700 transition-colors"
                        title="Edit Vendor"
                        aria-label="Edit Vendor"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(v.id)}
                        className="h-9 w-9 flex items-center justify-center rounded-lg text-rose-500 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 transition-colors"
                        title="Delete Vendor"
                        aria-label="Delete Vendor"
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
                    <th className="px-6 py-3.5">Vendor Name</th>
                    <th className="px-6 py-3.5">Type</th>
                    <th className="px-6 py-3.5">Contact</th>
                    <th className="px-6 py-3.5">Category</th>
                    <th className="px-6 py-3.5 text-right">Outstanding</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {pagination.paginatedItems.map((v, i) => (
                    <tr 
                      key={v._id || v.id} 
                      onClick={() => handleOpenPreview(v)} 
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer h-16"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`h-9 w-9 rounded-xl border flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs ${avatarColors[i % avatarColors.length]}`}>
                            {initials(v.name || 'V')}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{toTitleCase(v.name)}</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">GST: {v.gstin || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant="neutral">{toTitleCase(v.type || 'Vendor')}</Badge>
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                        <p className="text-sm font-mono font-medium">{v.phone || '—'}</p>
                        {v.email && <p className="text-xs text-slate-400">{v.email}</p>}
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-300 font-medium whitespace-nowrap">{toTitleCase(v.category || 'General')}</td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <span className={`text-sm font-bold tabular-nums ${v.outstanding > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'}`}>
                          {v.outstanding > 0 ? `₹${fmt(v.outstanding)}` : 'Clear'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={String(v.status).toLowerCase() === 'active' ? 'success' : 'neutral'} dot>
                          {toTitleCase(v.status || 'Active')}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEdit(v)}
                            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            title="Edit Vendor"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(v.id)}
                            className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="Delete Vendor"
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
              className="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden relative z-10 flex flex-col max-h-[90vh]"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/80">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100" style={{ fontFamily: 'var(--font-display)' }}>
                    {modalMode === 'add' ? 'Register New Vendor' : modalMode === 'edit' ? 'Edit Vendor Details' : 'Vendor Overview'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {modalMode === 'preview' ? 'Vendor profile and financial balance' : 'Enter supplier details and banking information'}
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
              <div className="p-6 overflow-y-auto flex-1 space-y-6">
                {modalMode === 'preview' ? (
                  <div className="space-y-6 text-sm">
                    {/* Header profile card */}
                    <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                      <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-bold text-lg flex items-center justify-center border border-emerald-200 dark:border-emerald-800 shrink-0">
                        {initials(selectedVendor?.name || 'V')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">{toTitleCase(selectedVendor?.name)}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="neutral">{toTitleCase(selectedVendor?.type || 'Vendor')}</Badge>
                          <Badge variant={String(selectedVendor?.status).toLowerCase() === 'active' ? 'success' : 'danger'} dot>
                            {toTitleCase(selectedVendor?.status || 'Active')}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {/* Contact & Tax Info */}
                    <div className="space-y-2">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Contact & Tax Details</h4>
                      <div className="grid grid-cols-2 gap-4 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-xs">
                        <div>
                          <span className="text-slate-400 block mb-0.5">Phone Number</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">{selectedVendor?.phone || '—'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block mb-0.5">Email Address</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedVendor?.email || '—'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block mb-0.5">GSTIN</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">{selectedVendor?.gstin || '—'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block mb-0.5">Item Category</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{toTitleCase(selectedVendor?.category || '—')}</span>
                        </div>
                        <div className="col-span-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                          <span className="text-slate-400 block mb-0.5">Address</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">{selectedVendor?.address || '—'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Banking Details */}
                    <div className="space-y-2">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Banking Information</h4>
                      <div className="grid grid-cols-3 gap-4 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-xs">
                        <div>
                          <span className="text-slate-400 block mb-0.5">Bank Name</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedVendor?.bankName || '—'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block mb-0.5">Account Number</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">{selectedVendor?.accountNo || '—'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block mb-0.5">IFSC Code</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">{selectedVendor?.ifsc || '—'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Financial Balances */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                        <span className="text-xs text-slate-500 block mb-1">Opening Balance</span>
                        <span className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">₹{fmt(selectedVendor?.openingBalance || 0)}</span>
                      </div>
                      <div className="p-4 bg-rose-50/50 dark:bg-rose-950/20 rounded-xl border border-rose-200/80 dark:border-rose-900/40">
                        <span className="text-xs text-rose-600 dark:text-rose-400 block mb-1 font-semibold">Current Outstanding</span>
                        <span className="text-lg font-black text-rose-600 dark:text-rose-400 tabular-nums">₹{fmt(selectedVendor?.outstandingBalance ?? selectedVendor?.outstanding ?? 0)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <form id="vendor-form" onSubmit={handleSave} className="space-y-6">
                    {/* Section 1: Basic Information */}
                    <div className="space-y-3">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 pb-1 border-b border-slate-100 dark:border-slate-700">
                        1. Basic Information
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Vendor Name <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={form.name}
                            onChange={e => setForm({...form, name: e.target.value})}
                            placeholder="e.g. Adani Enterprises"
                            className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Vendor Type <span className="text-rose-500">*</span>
                          </label>
                          <DropdownSelect
                            value={form.type}
                            onChange={val => setForm({...form, type: val})}
                            options={[
                              { value: 'smallVendor', label: 'Small Vendor' },
                              { value: 'largeVendor', label: 'Big Vendor' }
                            ]}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
                          <input
                            type="email"
                            value={form.email}
                            onChange={e => setForm({...form, email: e.target.value})}
                            placeholder="vendor@company.com"
                            className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">GSTIN</label>
                          <input
                            type="text"
                            value={form.gstin}
                            onChange={e => setForm({...form, gstin: e.target.value.toUpperCase()})}
                            placeholder="24AAAAA0000A1Z5"
                            className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 uppercase"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Business Address</label>
                        <textarea
                          rows={2}
                          value={form.address}
                          onChange={e => setForm({...form, address: e.target.value})}
                          placeholder="Complete billing & shipping address"
                          className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
                        />
                      </div>
                    </div>

                    {/* Section 2: Banking & Financials */}
                    <div className="space-y-3">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 pb-1 border-b border-slate-100 dark:border-slate-700">
                        2. Banking & Account Details
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Bank Name</label>
                          <input
                            type="text"
                            value={form.bankName}
                            onChange={e => setForm({...form, bankName: e.target.value})}
                            placeholder="HDFC Bank"
                            className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Account Number</label>
                          <input
                            type="text"
                            value={form.accountNo}
                            onChange={e => setForm({...form, accountNo: e.target.value})}
                            placeholder="Account number"
                            className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Confirm Account No.</label>
                          <input
                            type="text"
                            value={form.confirmAccountNo}
                            onChange={e => { setForm({...form, confirmAccountNo: e.target.value}); setFormErrors({...formErrors, confirmAccountNo: undefined}) }}
                            placeholder="Re-enter account"
                            className={`w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border rounded-lg text-slate-900 dark:text-slate-100 font-mono outline-none ${formErrors.confirmAccountNo ? 'border-rose-400 focus:ring-2 focus:ring-rose-500/20' : 'border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500'}`}
                          />
                          {formErrors.confirmAccountNo && <p className="text-[11px] text-rose-500 mt-1">{formErrors.confirmAccountNo}</p>}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">IFSC Code</label>
                          <input
                            type="text"
                            value={form.ifsc}
                            onChange={e => setForm({...form, ifsc: e.target.value.toUpperCase()})}
                            placeholder="HDFC0001234"
                            className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 uppercase"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Confirm IFSC Code</label>
                          <input
                            type="text"
                            value={form.confirmIfsc}
                            onChange={e => { setForm({...form, confirmIfsc: e.target.value.toUpperCase()}); setFormErrors({...formErrors, confirmIfsc: undefined}) }}
                            placeholder="Re-enter IFSC"
                            className={`w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border rounded-lg text-slate-900 dark:text-slate-100 font-mono outline-none uppercase ${formErrors.confirmIfsc ? 'border-rose-400 focus:ring-2 focus:ring-rose-500/20' : 'border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500'}`}
                          />
                          {formErrors.confirmIfsc && <p className="text-[11px] text-rose-500 mt-1">{formErrors.confirmIfsc}</p>}
                        </div>
                      </div>
                    </div>

                    {/* Section 3: Status & Category */}
                    <div className="space-y-3">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 pb-1 border-b border-slate-100 dark:border-slate-700">
                        3. Classification & Balance
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Item Category</label>
                          <input
                            type="text"
                            value={form.category}
                            onChange={e => setForm({...form, category: e.target.value})}
                            placeholder="Textiles / Yarn"
                            className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Opening Balance (₹)</label>
                          <input
                            type="number"
                            value={form.openingBalance}
                            onChange={e => setForm({...form, openingBalance: e.target.value})}
                            className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 tabular-nums outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Account Status</label>
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
                    </div>
                  </form>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3 bg-slate-50/50 dark:bg-slate-800/80">
                {modalMode === 'preview' ? (
                  <Button variant="secondary" onClick={() => setShowModal(false)}>
                    Close Preview
                  </Button>
                ) : (
                  <>
                    <Button variant="secondary" onClick={closeModal}>
                      Cancel
                    </Button>
                    <Button type="submit" form="vendor-form" loading={isSaving}>
                      {modalMode === 'add' ? 'Save Vendor' : 'Update Vendor'}
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

export default Vendors
