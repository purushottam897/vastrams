import React, { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download, Search, X, BookOpen, ArrowDownLeft, ArrowUpRight, DollarSign, Printer } from 'lucide-react'
import PrintPreviewModal from '../components/PrintPreviewModal'
import LedgerPrintModal from '../components/LedgerPrintModal'
import DropdownSelect from '../components/ui/DropdownSelect'
import CustomDatePicker from '../components/ui/CustomDatePicker'
import { toTitleCase } from '../utils/text'
import EmptyState from '../components/ui/EmptyState'
import Badge from '../components/ui/Badge'
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

const fmt = (v) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(v)

const txTypeLabel = (type) => {
  switch (type) {
    case 'BILL_POSTED': return 'Bill'
    case 'BILL_PAID': return 'Payment'
    case 'LOAN_DRAWDOWN': return 'Loan'
    case 'LOAN_REPAYMENT': return 'Repayment'
    case 'REPAYMENT_PRINCIPAL': return 'Repayment'
    case 'REPAYMENT_INTEREST': return 'Interest'
    case 'INTEREST_ACCRUED': return 'Interest'
    case 'CHEQUE_BOUNCED_REVERSAL': return 'Reversal'
    default: return type
  }
}

const isCreditType = (type) => ['BILL_PAID', 'LOAN_REPAYMENT', 'REPAYMENT_PRINCIPAL', 'REPAYMENT_INTEREST'].includes(type)

import { formatDateDisplay } from '../utils/date'

const formatDate = formatDateDisplay

export function RunningLedger() {
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [printDoc, setPrintDoc] = useState(null)
  const [vendors, setVendors] = useState([])
  const [financiers, setFinanciers] = useState([])
  const [partiesLoading, setPartiesLoading] = useState(true)
  const [party, setParty] = useState('')
  const [partyType, setPartyType] = useState('')
  const [partyId, setPartyId] = useState('')
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [ledger, setLedger] = useState([])
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showPdfModal, setShowPdfModal] = useState(false)

  useEffect(() => {
    const partyParam = searchParams.get('party')
    if (partyParam && partyParam !== party) {
      setParty(partyParam)
      const parts = partyParam.split('|')
      if (parts.length === 3) {
        setPartyType(parts[0])
        setPartyId(parts[1])
      }
    }
    const fromParam = searchParams.get('from') || ''
    if (fromParam !== fromDate) {
      setFromDate(fromParam)
    }
    const toParam = searchParams.get('to') || ''
    if (toParam !== toDate) {
      setToDate(toParam)
    }
  }, [searchParams])

  const handlePartyChange = (val) => {
    setParty(val)
    const parts = val.split('|')
    if (parts.length === 3) {
      setPartyType(parts[0])
      setPartyId(parts[1])
    }
    const newParams = new URLSearchParams(searchParams)
    newParams.set('party', val)
    setSearchParams(newParams)
  }

  const handleFromDateChange = (val) => {
    setFromDate(val)
    const newParams = new URLSearchParams(searchParams)
    if (val) {
      newParams.set('from', val)
    } else {
      newParams.delete('from')
    }
    setSearchParams(newParams)
  }

  const handleToDateChange = (val) => {
    setToDate(val)
    const newParams = new URLSearchParams(searchParams)
    if (val) {
      newParams.set('to', val)
    } else {
      newParams.delete('to')
    }
    setSearchParams(newParams)
  }

  const handleClearDates = () => {
    setFromDate('')
    setToDate('')
    const newParams = new URLSearchParams(searchParams)
    newParams.delete('from')
    newParams.delete('to')
    setSearchParams(newParams)
  }

  useEffect(() => {
    const controller = new AbortController()
    const fetchParties = async () => {
      try {
        setPartiesLoading(true)
        const [vendorsData, financiersData] = await Promise.all([
          api.get('/vendors', { signal: controller.signal }),
          api.get('/financiers', { signal: controller.signal }),
        ])
        if (!controller.signal.aborted) {
          setVendors(vendorsData)
          setFinanciers(financiersData)
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err.message || 'Failed to load parties')
        }
      } finally {
        if (!controller.signal.aborted) {
          setPartiesLoading(false)
        }
      }
    }
    fetchParties()

    const handleDataChanged = () => fetchParties()
    window.addEventListener('api-data-changed', handleDataChanged)
    window.addEventListener('vastrams:data-restored', handleDataChanged)

    return () => {
      controller.abort()
      window.removeEventListener('api-data-changed', handleDataChanged)
      window.removeEventListener('vastrams:data-restored', handleDataChanged)
    }
  }, [])

  useEffect(() => {
    if (!partyId || !partyType) return
    const controller = new AbortController()
    const fetchLedger = async () => {
      try {
        setLedgerLoading(true)
        const endpoint = partyType === 'vendor'
          ? `/ledger/vendor/${partyId}`
          : `/ledger/financier/${partyId}`
        const data = await api.get(endpoint, { signal: controller.signal })
        
        let runningBal = 0
        const rows = data.map((t) => {
          const isCredit = isCreditType(t.type)
          const debit = isCredit ? 0 : t.amount
          const credit = isCredit ? t.amount : 0
          runningBal = t.runningBalance !== undefined ? t.runningBalance : (runningBal + debit - credit)
          return {
            id: t._id,
            referenceId: t.referenceId,
            rawDate: t.date,
            date: formatDate(t.date),
            ref: t.referenceId?.toString?.()?.slice(-8)?.toUpperCase() || '—',
            type: txTypeLabel(t.type),
            rawType: t.type,
            description: t.description || '—',
            debit,
            credit,
            balance: runningBal,
          }
        })
        if (!controller.signal.aborted) {
          setLedger(rows)
          setError(null)
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err.message || 'Failed to load ledger')
          setLedger([])
        }
      } finally {
        if (!controller.signal.aborted) {
          setLedgerLoading(false)
        }
      }
    }
    fetchLedger()
    return () => controller.abort()
  }, [partyId, partyType])

  const vendorOptions = useMemo(() => vendors.map(v => ({
    value: `vendor|${v._id}|${v.name}`,
    label: `${toTitleCase(v.name)} (Vendor)`,
  })), [vendors])

  const financierOptions = useMemo(() => financiers.map(f => ({
    value: `financier|${f._id}|${f.name}`,
    label: `${toTitleCase(f.name)} (Financier)`,
  })), [financiers])

  const partyOptions = useMemo(() => [...vendorOptions, ...financierOptions], [vendorOptions, financierOptions])

  const filteredLedger = useMemo(() => {
    return ledger.filter(row => {
      if (search) {
        const s = search.toLowerCase()
        const matchSearch =
          (row.type || '').toLowerCase().includes(s) ||
          (row.ref || '').toLowerCase().includes(s) ||
          (row.description || '').toLowerCase().includes(s)
        if (!matchSearch) return false
      }
      if (!fromDate && !toDate) return true
      const rowDate = row.rawDate ? new Date(row.rawDate) : null
      if (!rowDate) return true
      const rowDay = new Date(rowDate.getFullYear(), rowDate.getMonth(), rowDate.getDate())
      if (fromDate) {
        const [fd, fm, fy] = fromDate.split('-').map(Number)
        const from = new Date(fy, fm - 1, fd)
        if (rowDay < from) return false
      }
      if (toDate) {
        const [td, tm, ty] = toDate.split('-').map(Number)
        const to = new Date(ty, tm - 1, td)
        if (rowDay > to) return false
      }
      return true
    })
  }, [ledger, search, fromDate, toDate])

  const totalDebit = useMemo(() => filteredLedger.reduce((s, r) => s + r.debit, 0), [filteredLedger])
  const totalCredit = useMemo(() => filteredLedger.reduce((s, r) => s + r.credit, 0), [filteredLedger])
  const finalBalance = useMemo(() => filteredLedger.length > 0 ? filteredLedger[filteredLedger.length - 1].balance : 0, [filteredLedger])

  const handleExport = async () => {
    if (!filteredLedger.length) {
      toast('No data to export', 'error')
      return
    }
    try {
      const XLSX = await import('xlsx')
      const rawPartyName = party ? party.split('|')[2] || 'Statement' : 'Statement'
      const cleanParty = rawPartyName.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
      const fileName = `Ledger_${cleanParty}_${new Date().toISOString().split('T')[0]}.xlsx`

      const exportData = filteredLedger.map(row => ({
        Date: row.date,
        Reference: row.ref,
        Type: row.type,
        Description: row.description,
        'Debit (Liability)': row.debit > 0 ? row.debit : '',
        'Credit (Payment)': row.credit > 0 ? row.credit : '',
        'Running Balance': row.balance,
      }))

      exportData.push({
        Date: 'TOTALS',
        Reference: '',
        Type: '',
        Description: '',
        'Debit (Liability)': totalDebit,
        'Credit (Payment)': totalCredit,
        'Running Balance': finalBalance,
      })

      const ws = XLSX.utils.json_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Ledger')
      XLSX.writeFile(wb, fileName)
      toast('Ledger exported successfully', 'success')
    } catch (err) {
      toast('Export failed: ' + err.message, 'error')
    }
  }

  const tableContainerRef = React.useRef(null)

  const pagination = usePagination({
    items: filteredLedger,
    moduleKey: 'ledger',
    initialPageSize: 20,
    filterDependencies: [party, fromDate, toDate, search],
    containerRef: tableContainerRef
  })

  const selectedPartyName = party ? party.split('|')[2] : ''

  const selectedPartyObj = useMemo(() => {
    if (!partyId || !partyType) return null
    if (partyType === 'vendor') {
      return vendors.find(v => String(v._id) === String(partyId)) || null
    } else if (partyType === 'financier') {
      return financiers.find(f => String(f._id) === String(partyId)) || null
    }
    return null
  }, [partyId, partyType, vendors, financiers])

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <PageHeader
        title="Running Ledger"
        description={selectedPartyName ? `Transaction journal and balance audit for ${toTitleCase(selectedPartyName)}` : "Select an entity to inspect sequential transactions and balance progression"}
        breadcrumbs={[{ label: 'Ledger' }]}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={!party || filteredLedger.length === 0}
            title="Export Ledger as Excel"
          >
            <Download className="w-4 h-4" />
            <span>Export Excel</span>
          </Button>
          <Button
            variant="primary"
            onClick={() => setShowPdfModal(true)}
            disabled={!party || filteredLedger.length === 0}
            title="View, Print and Export Professional Ledger PDF Statement"
          >
            <Printer className="w-4 h-4" />
            <span>PDF Statement</span>
          </Button>
        </div>
      </PageHeader>

      {/* KPI Stats when party selected */}
      {/* KPI Stats when party selected */}
      {party && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-5">
          <KpiCard
            title="Total Debits (Liabilities)"
            value={`₹${fmt(totalDebit)}`}
            subtitle="Bills & drawdown debt"
            icon={ArrowDownLeft}
            iconColor="text-rose-600 dark:text-rose-400"
            iconBg="bg-rose-50 dark:bg-rose-950/40 border-rose-100 dark:border-rose-900/40"
          />
          <KpiCard
            title="Total Credits (Payments)"
            value={`₹${fmt(totalCredit)}`}
            subtitle="Disbursed settlements"
            icon={ArrowUpRight}
            iconColor="text-emerald-600 dark:text-emerald-400"
            iconBg="bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/40"
          />
          <KpiCard
            title="Closing Balance"
            value={`₹${fmt(finalBalance)}`}
            subtitle="Current net outstanding"
            icon={DollarSign}
            iconColor={finalBalance > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}
            iconBg={finalBalance > 0 ? "bg-rose-50 dark:bg-rose-950/40 border-rose-100 dark:border-rose-900/40" : "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/40"}
          />
        </div>
      )}

      {/* Filter Toolbar */}
      <FilterToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search reference, type, description..."
        isFiltered={search !== '' || fromDate !== '' || toDate !== ''}
        onReset={() => { setSearch(''); handleClearDates(); }}
      >
        <div className="w-full sm:w-72">
          {partiesLoading ? (
            <Skeleton className="h-10 w-full rounded-xl" />
          ) : (
            <DropdownSelect
              value={party}
              onChange={handlePartyChange}
              placeholder="Select Party to View Ledger"
              options={partyOptions}
            />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-2 flex-1 sm:flex-initial min-w-[140px]">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">From:</span>
            <CustomDatePicker value={fromDate} onChange={handleFromDateChange} />
          </div>
          <div className="flex items-center gap-2 flex-1 sm:flex-initial min-w-[140px]">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">To:</span>
            <CustomDatePicker value={toDate} onChange={handleToDateChange} />
          </div>
        </div>
      </FilterToolbar>

      {/* Table Card */}
      <Card className="overflow-hidden">
        {!party ? (
          <div className="p-12">
            <EmptyState
              icon="ledger"
              title="Select an Entity"
              description="Choose a vendor or financier from the dropdown above to load their real-time transaction ledger."
            />
          </div>
        ) : ledgerLoading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/90 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-3.5">Date</th>
                  <th className="px-6 py-3.5">Reference</th>
                  <th className="px-6 py-3.5">Type</th>
                  <th className="px-6 py-3.5">Description</th>
                  <th className="px-6 py-3.5 text-right">Debit (Liability)</th>
                  <th className="px-6 py-3.5 text-right">Credit (Payment)</th>
                  <th className="px-6 py-3.5 text-right">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <SkeletonTableRow key={idx} cols={7} widths={["w-24", "w-20", "w-20", "w-44", "w-24", "w-24", "w-28"]} />
                ))}
              </tbody>
            </table>
          </div>
        ) : filteredLedger.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon="ledger"
              title="No Ledger Entries"
              description="No transactions found for this party within the specified date range."
            />
          </div>
        ) : (
          <>
            <div ref={tableContainerRef} className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/90 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-6 py-3.5">Date</th>
                    <th className="px-6 py-3.5">Reference</th>
                    <th className="px-6 py-3.5">Type</th>
                    <th className="px-6 py-3.5">Description</th>
                    <th className="px-6 py-3.5 text-right">Debit (Liability)</th>
                    <th className="px-6 py-3.5 text-right">Credit (Payment)</th>
                    <th className="px-6 py-3.5 text-right">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {pagination.paginatedItems.map((r, i) => (
                    <tr 
                      key={r.id || i}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors h-16"
                    >
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">{r.date}</td>
                      <td className="px-6 py-4 font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">{r.ref}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={isCreditType(r.rawType) ? 'success' : 'purple'} dot>
                          {r.type}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-slate-700 dark:text-slate-300 font-medium max-w-[320px] truncate">{r.description}</td>
                      <td className="px-6 py-4 text-right font-semibold text-rose-600 dark:text-rose-400 tabular-nums whitespace-nowrap">
                        {r.debit > 0 ? `₹${fmt(r.debit)}` : '—'}
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap">
                        {r.credit > 0 ? `₹${fmt(r.credit)}` : '—'}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                        ₹{fmt(r.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination} isLoading={ledgerLoading} />
          </>
        )}
      </Card>

      {/* Professional Running Ledger Statement PDF & Print Modal */}
      {showPdfModal && (
        <LedgerPrintModal
          isOpen={showPdfModal}
          onClose={() => setShowPdfModal(false)}
          partyName={selectedPartyName}
          partyType={partyType}
          partyObj={selectedPartyObj}
          fromDate={fromDate}
          toDate={toDate}
          transactions={filteredLedger}
          totalDebit={totalDebit}
          totalCredit={totalCredit}
          finalBalance={finalBalance}
        />
      )}
    </div>
  )
}

export default RunningLedger
