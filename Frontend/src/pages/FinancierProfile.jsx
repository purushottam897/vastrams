import React, { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Edit2, Plus, ArrowLeft, Building2, X, Landmark, DollarSign, CheckCircle2, Clock, Printer } from 'lucide-react'
import PrintPreviewModal from '../components/PrintPreviewModal'
import { toInputDate, fromInputDate, getTodayFormatted } from '../utils/date'
import DropdownSelect from '../components/ui/DropdownSelect'
import CustomDatePicker from '../components/ui/CustomDatePicker'
import { toTitleCase } from '../utils/text'
import EmptyState from '../components/ui/EmptyState'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import PageHeader from '../components/ui/PageHeader'
import { Card, CardHeader, CardTitle, CardContent, KpiCard } from '../components/ui/Card'
import api from '../utils/api'
import { useToast } from '../hooks/useToast'
import Skeleton from '../components/ui/Skeleton'
import { AnimatePresence, motion } from 'framer-motion'
import { useCompanyProfile } from '../context/ProfileContext'
import { downloadFinancierProfilePdf } from '../utils/financePdf'
import { usePagination } from '../hooks/usePagination'
import Pagination from '../components/ui/Pagination'

const fmt = (v) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(v)

export function FinancierProfile() {
  const toast = useToast()
  const { id } = useParams()
  const navigate = useNavigate()
  const { companyProfile } = useCompanyProfile()
  
  const [profile, setProfile] = useState(null)
  const [loans, setLoans] = useState([])
  const [paymentModes, setPaymentModes] = useState([])
  const [loading, setLoading] = useState(true)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [error, setError] = useState(null)
  const [printDoc, setPrintDoc] = useState(null)

  // Modals state
  const [showEditModal, setShowEditModal] = useState(false)
  const [showRepayModal, setShowRepayModal] = useState(false)
  const [showAddLoanModal, setShowAddLoanModal] = useState(false)

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    address: '',
    status: 'Active',
    notes: ''
  })

  // Repayment form state & sub-step
  const [repayStep, setRepayStep] = useState('input') // 'input' | 'preview'
  const [repayForm, setRepayForm] = useState({
    date: getTodayFormatted(),
    amount: '',
    mode: 'Bank Transfer',
    remarks: '',
    chequeNo: ''
  })

  // Add loan form state
  const [loanForm, setLoanForm] = useState({
    noteNo: '',
    date: '',
    amount: '',
    interestRate: '',
    remarks: ''
  })

  const fetchProfileAndLoans = async (signal) => {
    try {
      setLoading(true)
      const [finData, loansData, profileRes] = await Promise.all([
        api.get(`/financiers/${id}`, { signal }),
        api.get('/loans', { signal }),
        api.get('/settings/profile', { signal }).catch(() => ({ data: {} }))
      ])
      
      if (!signal || !signal.aborted) {
        if (profileRes.data && profileRes.data.paymentModes) {
          const activeModes = profileRes.data.paymentModes.filter(m => m.enabled)
          if (activeModes.length > 0) setPaymentModes(activeModes)
        }
        setProfile({
          ...finData,
          id: finData._id
        })
        
        setEditForm({
          name: finData.name || '',
          phone: finData.phone || '',
          address: finData.address || '',
          status: finData.status || 'Active',
          notes: finData.notes || ''
        })
        
        const finLoans = loansData
          .filter(l => !l.isDeleted && (l.financierId?._id === id || l.financierId === id))
          .map(l => ({
            id: l._id,
            noteNo: l.loanReference,
            date: l.drawdownDate ? fromInputDate(l.drawdownDate.split('T')[0]) : '',
            amount: l.principalAmount,
            paid: l.paidPrincipal,
            outstanding: l.outstandingPrincipal,
            status: l.status
          }))
        setLoans(finLoans)
        setLoading(false)
      }
    } catch (err) {
      if (!signal || !signal.aborted) {
        setError(err.message || 'Failed to load financier profile')
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    fetchProfileAndLoans(controller.signal)
    return () => controller.abort()
  }, [id])

  const totals = useMemo(() => {
    const totalLoans = loans.length
    const active = loans.filter(l => String(l.status).toLowerCase() === 'active').length
    const closed = loans.filter(l => String(l.status).toLowerCase() === 'closed' || String(l.status).toLowerCase() === 'settled').length
    const totalLoaned = loans.reduce((s, l) => s + l.amount, 0)
    const totalPaid = loans.reduce((s, l) => s + l.paid, 0)
    const outstanding = loans.reduce((s, l) => s + l.outstanding, 0)
    return { totalLoans, active, closed, totalLoaned, totalPaid, outstanding }
  }, [loans])

  const handleSaveEdit = async (e) => {
    e.preventDefault()
    try {
      await api.put(`/financiers/${id}`, {
        name: editForm.name,
        phone: editForm.phone,
        address: editForm.address,
        status: editForm.status,
        notes: editForm.notes,
        defaultInterestRate: profile?.defaultInterestRate || 12
      })
      await fetchProfileAndLoans()
      setShowEditModal(false)
      toast('Financier updated successfully', 'success')
    } catch (err) {
      toast(err.message || 'Failed to update financier', 'error')
    }
  }

  const handleSaveLoan = async (e) => {
    e.preventDefault()
    const amt = Number(loanForm.amount) || 0
    const payload = {
      financierId: id,
      loanReference: loanForm.noteNo,
      principalAmount: amt,
      notes: loanForm.remarks || ''
    }
    if (loanForm.date) {
      const dateStr = toInputDate(loanForm.date)
      if (dateStr) payload.drawdownDate = dateStr
    }
    if (loanForm.interestRate !== undefined && loanForm.interestRate !== null && loanForm.interestRate !== '') {
      payload.interestRate = Number(loanForm.interestRate)
    }
    try {
      await api.post('/loans', payload)
      await fetchProfileAndLoans()
      setShowAddLoanModal(false)
      setLoanForm({ noteNo: '', date: '', amount: '', interestRate: '', remarks: '' })
      toast('Loan account created successfully', 'success')
    } catch (err) {
      toast(err.message || 'Failed to save loan', 'error')
    }
  }

  const fifoAllocations = useMemo(() => {
    const amt = Number(repayForm.amount) || 0
    let remaining = amt
    const result = []

    for (const l of loans) {
      if (l.outstanding <= 0) continue
      const adjusted = Math.min(l.outstanding, remaining)
      const next = l.outstanding - adjusted
      result.push({
        id: l.id,
        noteNo: l.noteNo,
        prev: l.outstanding,
        adjusted: adjusted,
        next: next,
        status: next === 0 ? 'Closed' : 'Active'
      })
      remaining -= adjusted
      if (remaining <= 0) break
    }
    return result
  }, [loans, repayForm.amount])

  const isOverBalance = Number(repayForm.amount) > totals.outstanding

  const handleAmountChange = (e) => {
    let val = e.target.value.replace(/[^0-9.]/g, '')
    const parts = val.split('.')
    if (parts[0].length > 12) {
      parts[0] = parts[0].slice(0, 12)
    }
    val = parts.join('.')
    setRepayForm(prev => ({ ...prev, amount: val }))
  }

  const handleConfirmRepayment = async () => {
    if (repayForm.mode === 'Cheque') {
      if (!repayForm.chequeNo || repayForm.chequeNo.length !== 6) {
        toast('Cheque number must be exactly 6 digits', 'error')
        return
      }
    }

    if (isOverBalance) {
      toast('Amount cannot exceed the total outstanding balance', 'error')
      return
    }

    const modeMapping = {
      'Cash': 'CASH',
      'Cheque': 'CHEQUE',
      'NEFT': 'BANK_TRANSFER',
      'RTGS': 'BANK_TRANSFER',
      'UPI': 'BANK_TRANSFER',
      'Bank Transfer': 'BANK_TRANSFER'
    }

    try {
      for (const alloc of fifoAllocations) {
        if (alloc.adjusted > 0) {
          await api.post(`/loans/${alloc.id}/repayments`, {
            amount: alloc.adjusted,
            repaymentDate: toInputDate(repayForm.date),
            repaymentMode: modeMapping[repayForm.mode] || 'BANK_TRANSFER',
            referenceNumber: 'REP-' + String(Math.floor(100 + Math.random() * 900)),
            chequeNumber: repayForm.mode === 'Cheque' ? repayForm.chequeNo : undefined,
            principalPaid: alloc.adjusted,
            interestPaid: 0
          })
        }
      }
      await fetchProfileAndLoans()
      setShowRepayModal(false)
      setRepayStep('input')
      setRepayForm({ date: getTodayFormatted(), amount: '', mode: 'Bank Transfer', remarks: '', chequeNo: '' })
      toast('Repayment recorded successfully', 'success')
    } catch (err) {
      toast(err.message || 'Failed to confirm repayments', 'error')
    }
  }

  const tableContainerRef = React.useRef(null)

  const pagination = usePagination({
    items: loans,
    moduleKey: 'financier_profile_loans',
    initialPageSize: 20,
    filterDependencies: [id],
    containerRef: tableContainerRef
  })

  if (error) {
    return (
      <div className="p-6">
        <EmptyState icon="search" title="Error Loading Profile" description={error} />
      </div>
    )
  }

  if (loading || !profile) {
    return (
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  const handleDownloadPdf = async () => {
    try {
      setDownloadingPdf(true)
      await downloadFinancierProfilePdf({
        profile,
        loans,
        companyProfile
      })
      toast('Financier statement PDF downloaded successfully', 'success')
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
        title={toTitleCase(profile.name)}
        description={`Financier profile · ${totals.totalLoans} loan notes recorded`}
        breadcrumbs={[
          { label: 'Finance', href: '/financiers' },
          { label: toTitleCase(profile.name) }
        ]}
      >
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf || loading}
            className="justify-center cursor-pointer shadow-sm"
            title="Download PDF statement for this financier"
          >
            {downloadingPdf ? (
              <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Printer className="w-4 h-4" />
            )}
            <span>Print / Download PDF</span>
          </Button>
          <Button variant="outline" onClick={() => setShowEditModal(true)} className="justify-center">
            <Edit2 className="w-4 h-4" />
            <span>Edit Profile</span>
          </Button>
          <Button onClick={() => { setRepayStep('input'); setShowRepayModal(true); }} className="justify-center">
            <span>Record Repayment</span>
          </Button>
        </div>
      </PageHeader>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 sm:gap-5">
        <KpiCard
          title="Total Loans"
          value={String(totals.totalLoans)}
          subtitle="All facilities"
          icon={Landmark}
          iconColor="text-slate-600 dark:text-slate-300"
          iconBg="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
        />
        <KpiCard
          title="Active Loans"
          value={String(totals.active)}
          subtitle="Unsettled"
          icon={Clock}
          iconColor="text-blue-600 dark:text-blue-400"
          iconBg="bg-blue-50 dark:bg-blue-950/40 border-blue-100 dark:border-blue-900/40"
        />
        <KpiCard
          title="Closed Loans"
          value={String(totals.closed)}
          subtitle="Fully repaid"
          icon={CheckCircle2}
          iconColor="text-emerald-600 dark:text-emerald-400"
          iconBg="bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/40"
        />
        <KpiCard
          title="Total Loaned"
          value={`₹${fmt(totals.totalLoaned)}`}
          subtitle="Disbursed"
          icon={DollarSign}
          iconColor="text-slate-600 dark:text-slate-300"
          iconBg="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
        />
        <KpiCard
          title="Total Paid"
          value={`₹${fmt(totals.totalPaid)}`}
          subtitle="Principal settled"
          icon={DollarSign}
          iconColor="text-emerald-600 dark:text-emerald-400"
          iconBg="bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/40"
        />
        <KpiCard
          title="Outstanding"
          value={`₹${fmt(totals.totalOutstanding)}`}
          subtitle="Remaining balance"
          icon={DollarSign}
          iconColor="text-rose-600 dark:text-rose-400"
          iconBg="bg-rose-50 dark:bg-rose-950/40 border-rose-100 dark:border-rose-900/40"
        />
      </div>

      {/* Details Card */}
      <Card>
        <CardHeader>
          <CardTitle>Financier Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 text-sm">
            <div>
              <span className="text-xs text-slate-400 font-semibold block mb-1">Phone Number</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono text-sm">{profile.phone || '—'}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 font-semibold block mb-1">Office Address</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{profile.address || '—'}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 font-semibold block mb-1">Account Status</span>
              <Badge variant={String(profile.status).toLowerCase() === 'active' ? 'success' : 'danger'} dot>
                {toTitleCase(profile.status)}
              </Badge>
            </div>
            {profile.notes && (
              <div className="col-span-full pt-4 border-t border-slate-100 dark:border-slate-700/60">
                <span className="text-xs text-slate-400 font-semibold block mb-1">Notes</span>
                <p className="text-slate-700 dark:text-slate-300 italic text-sm">{profile.notes}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Loans Table Card */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Loan Facilities</CardTitle>
          <Button size="sm" onClick={() => setShowAddLoanModal(true)}>
            <Plus className="w-4 h-4" />
            <span>Add Loan</span>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {!loans || loans.length === 0 ? (
            <div className="p-8">
              <EmptyState 
                icon="loan" 
                title="No Loans Found" 
                description="Add a loan facility from this financier to get started" 
                action={{ label: "Add Loan", onClick: () => setShowAddLoanModal(true) }} 
              />
            </div>
          ) : (
            <>
              {/* Mobile Cards View (< md) */}
              <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-700/50">
                {pagination.paginatedItems.map((l, i) => (
                  <div key={l.id || i} className="p-4 space-y-2.5 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
                        {l.noteNo}
                      </span>
                      <Badge variant={String(l.status).toLowerCase() === 'active' ? 'warning' : 'success'} dot>
                        {toTitleCase(l.status)}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-2 p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800/60 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase font-bold">Principal</span>
                        <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">₹{fmt(l.amount)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase font-bold">Paid</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">₹{fmt(l.paid)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase font-bold">Pending</span>
                        <span className={`font-bold tabular-nums ${l.outstanding > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
                          ₹{fmt(l.outstanding)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Drawdown: <span className="font-medium text-slate-700 dark:text-slate-300">{l.date}</span></span>
                      <button
                        onClick={() => setPrintDoc({ type: 'loan', id: l.id })}
                        className="h-7 px-2.5 rounded-lg text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors"
                        title="Print Loan Voucher"
                      >
                        <Printer className="w-3 h-3" />
                        <span>Print</span>
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
                      <th className="px-6 py-3.5">Note #</th>
                      <th className="px-6 py-3.5">Date</th>
                      <th className="px-6 py-3.5 text-right">Loan Amount</th>
                      <th className="px-6 py-3.5 text-right">Principal Paid</th>
                      <th className="px-6 py-3.5 text-right">Outstanding</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {pagination.paginatedItems.map((l, i) => (
                      <tr key={l.id || i} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors h-16">
                        <td className="px-6 py-4 font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">{l.noteNo}</td>
                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">{l.date}</td>
                        <td className="px-6 py-4 text-slate-900 dark:text-slate-100 text-right font-bold tabular-nums whitespace-nowrap">₹{fmt(l.amount)}</td>
                        <td className="px-6 py-4 text-emerald-600 dark:text-emerald-400 text-right font-bold tabular-nums whitespace-nowrap">₹{fmt(l.paid)}</td>
                        <td className={`px-6 py-4 text-right font-bold tabular-nums whitespace-nowrap ${l.outstanding > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'}`}>
                          ₹{fmt(l.outstanding)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant={String(l.status).toLowerCase() === 'active' ? 'warning' : 'success'} dot>
                            {toTitleCase(l.status)}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <button
                            onClick={() => setPrintDoc({ type: 'loan', id: l.id })}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors inline-flex items-center gap-1 text-xs"
                            title="Print Loan Voucher"
                          >
                            <Printer className="w-4 h-4" />
                            <span className="hidden sm:inline">Print</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination {...pagination} isLoading={loading} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Financier Modal */}
      <AnimatePresence>
        {showEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs" onClick={() => setShowEditModal(false)}>
            <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-700 mb-4">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Edit Financier Details</h3>
                <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSaveEdit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Name *</label>
                  <input
                    type="text"
                    required
                    value={editForm.name}
                    onChange={e => setEditForm({...editForm, name: e.target.value})}
                    className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Phone</label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={e => setEditForm({...editForm, phone: e.target.value})}
                    className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg outline-none font-mono focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Address</label>
                  <textarea
                    rows={2}
                    value={editForm.address}
                    onChange={e => setEditForm({...editForm, address: e.target.value})}
                    className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-emerald-500 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Status</label>
                  <DropdownSelect
                    value={editForm.status}
                    onChange={val => setEditForm({...editForm, status: val})}
                    options={[
                      { value: 'Active', label: 'Active' },
                      { value: 'Inactive', label: 'Inactive' }
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Notes</label>
                  <textarea
                    rows={2}
                    value={editForm.notes}
                    onChange={e => setEditForm({...editForm, notes: e.target.value})}
                    className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-emerald-500 resize-none"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700 mt-4">
                  <Button variant="secondary" onClick={() => setShowEditModal(false)}>Cancel</Button>
                  <Button type="submit">Save Changes</Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Record Repayment Modal */}
      <AnimatePresence>
        {showRepayModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs" onClick={() => setShowRepayModal(false)}>
            <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-700 mb-4">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {repayStep === 'input' ? 'Record Financier Repayment' : 'Confirm Repayment Allocation'}
                </h3>
                <button onClick={() => setShowRepayModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {repayStep === 'input' ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Repayment Date *</label>
                      <CustomDatePicker
                        value={repayForm.date}
                        onChange={val => setRepayForm({...repayForm, date: val})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Payment Mode *</label>
                      <DropdownSelect
                        value={repayForm.mode}
                        onChange={val => setRepayForm({...repayForm, mode: val})}
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
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Amount (₹) *</label>
                    <input
                      type="text"
                      required
                      value={repayForm.amount}
                      onChange={handleAmountChange}
                      placeholder="50000"
                      className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg outline-none font-bold tabular-nums focus:border-emerald-500"
                    />
                    {isOverBalance && (
                      <p className="text-rose-500 text-xs mt-1">Amount cannot exceed total outstanding balance of ₹{fmt(totals.outstanding)}.</p>
                    )}
                  </div>

                  {repayForm.mode === 'Cheque' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Cheque Number *</label>
                      <input
                        type="text"
                        placeholder="123456"
                        value={repayForm.chequeNo || ''}
                        onChange={e => setRepayForm({...repayForm, chequeNo: e.target.value.slice(0, 6).replace(/[^0-9]/g, '')})}
                        className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg outline-none font-mono focus:border-emerald-500"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Remarks</label>
                    <textarea
                      rows={2}
                      value={repayForm.remarks}
                      onChange={e => setRepayForm({...repayForm, remarks: e.target.value})}
                      placeholder="Notes..."
                      className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-emerald-500 resize-none"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700 mt-4">
                    <Button variant="secondary" onClick={() => setShowRepayModal(false)}>Cancel</Button>
                    <Button
                      onClick={() => setRepayStep('preview')}
                      disabled={!repayForm.amount || isOverBalance}
                    >
                      Preview Allocation
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3.5 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
                    <span className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-300 block mb-0.5">Repayment Amount</span>
                    <span className="text-xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">₹{fmt(Number(repayForm.amount) || 0)}</span>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-700 text-[10px] font-bold uppercase text-slate-400">
                        <tr>
                          <th className="px-3 py-2">Note #</th>
                          <th className="px-3 py-2 text-right">Prev Balance</th>
                          <th className="px-3 py-2 text-right text-emerald-600">Adjusted</th>
                          <th className="px-3 py-2 text-right">New Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                        {fifoAllocations.map((a, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2 font-mono">{a.noteNo}</td>
                            <td className="px-3 py-2 text-right text-slate-500 tabular-nums">₹{fmt(a.prev)}</td>
                            <td className="px-3 py-2 text-right font-bold text-emerald-600 tabular-nums">₹{fmt(a.adjusted)}</td>
                            <td className="px-3 py-2 text-right text-slate-500 tabular-nums">₹{fmt(a.next)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700 mt-4">
                    <Button variant="secondary" onClick={() => setRepayStep('input')}>Back</Button>
                    <Button onClick={handleConfirmRepayment}>Confirm Repayment</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Loan Modal */}
      <AnimatePresence>
        {showAddLoanModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs" onClick={() => setShowAddLoanModal(false)}>
            <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-700 mb-4">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Add Loan Facility</h3>
                <button onClick={() => setShowAddLoanModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSaveLoan} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Note / Reference Number *</label>
                  <input
                    type="text"
                    required
                    value={loanForm.noteNo}
                    onChange={e => setLoanForm({...loanForm, noteNo: e.target.value})}
                    placeholder="e.g. LN-2026-001"
                    className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg outline-none font-mono focus:border-emerald-500"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Loan Date</label>
                    <CustomDatePicker
                      value={loanForm.date}
                      onChange={val => setLoanForm({...loanForm, date: val})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Interest Rate (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="12.00"
                      value={loanForm.interestRate}
                      onChange={e => setLoanForm({...loanForm, interestRate: e.target.value})}
                      className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Principal Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    value={loanForm.amount}
                    onChange={e => setLoanForm({...loanForm, amount: e.target.value})}
                    placeholder="500000"
                    className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg outline-none tabular-nums focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Remarks</label>
                  <textarea
                    rows={2}
                    value={loanForm.remarks}
                    onChange={e => setLoanForm({...loanForm, remarks: e.target.value})}
                    placeholder="Additional terms or notes..."
                    className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-emerald-500 resize-none"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700 mt-4">
                  <Button variant="secondary" onClick={() => setShowAddLoanModal(false)}>Cancel</Button>
                  <Button type="submit">Create Loan</Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </AnimatePresence>

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

export default FinancierProfile
