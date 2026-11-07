import React, { useState, useEffect } from 'react'
import { X, Printer, Download, FileText, CheckCircle2 } from 'lucide-react'
import api from '../utils/api'
import { toTitleCase } from '../utils/text'

const fmt = (v) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(v || 0)

export function LedgerPrintModal({
  isOpen,
  onClose,
  partyName,
  partyType,
  partyObj,
  fromDate,
  toDate,
  transactions = [],
  totalDebit = 0,
  totalCredit = 0,
  finalBalance = 0,
}) {
  const [profile, setProfile] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(true)

  useEffect(() => {
    if (!isOpen) return

    let isMounted = true
    const fetchProfile = async () => {
      try {
        setLoadingProfile(true)
        const res = await api.get('/settings/profile')
        if (isMounted && res?.data) {
          setProfile(res.data)
        }
      } catch {
        if (isMounted) {
          setProfile({
            businessName: 'VASTRAMS',
            address: '',
            phone: '',
            email: '',
            gstin: '',
          })
        }
      } finally {
        if (isMounted) setLoadingProfile(false)
      }
    }

    fetchProfile()
    return () => {
      isMounted = false
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // Date formatting helpers
  const today = new Date()
  const generatedDateStr = today.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const generatedTimeStr = today.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  })

  // Statement period text
  let periodText = 'All Transactions (Complete Ledger)'
  if (fromDate && toDate) {
    periodText = `${fromDate} to ${toDate}`
  } else if (fromDate) {
    periodText = `From ${fromDate}`
  } else if (toDate) {
    periodText = `Up to ${toDate}`
  }

  // Safe Filename Construction
  const cleanParty = (partyName || 'Statement')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  const dateStr = today.toISOString().split('T')[0]
  const dynamicPdfFilename = `Vastrams_Ledger_${cleanParty}_${dateStr}`

  const handlePrint = () => {
    const originalTitle = document.title
    document.title = dynamicPdfFilename
    window.print()
    setTimeout(() => {
      document.title = originalTitle
    }, 1000)
  }

  const companyName = profile?.businessName || 'VASTRAMS'
  const isVendor = partyType?.toLowerCase() === 'vendor'
  const partyTypeLabel = isVendor ? 'Vendor' : 'Financier'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs print-modal-overlay">
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 14mm 14mm 14mm;
          }
          /* Hide all non-printable chrome */
          body * {
            visibility: hidden;
          }
          .printable-ledger-statement,
          .printable-ledger-statement * {
            visibility: visible;
          }
          .printable-ledger-statement {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            box-shadow: none !important;
            border: none !important;
            color: #0f172a !important;
          }
          .no-print {
            display: none !important;
          }
          table {
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
            break-inside: avoid;
          }
          thead {
            display: table-header-group;
          }
          tfoot {
            display: table-footer-group;
          }
        }
      `}</style>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl h-[94vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700">
        {/* Modal Toolbar (no-print) */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/80 no-print shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Running Ledger Statement
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Print or Save as PDF for {toTitleCase(partyName || 'Party')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
              title="Print Document or Save as PDF"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Save PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              title="Close Preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto bg-slate-100/80 dark:bg-slate-900/60 p-3 sm:p-6 lg:p-8 flex justify-center">
          {/* Printable Statement Document (A4 format) */}
          <div
            id="printable-ledger-statement"
            className="printable-ledger-statement bg-white text-slate-900 w-full max-w-[850px] p-8 sm:p-10 shadow-lg rounded-xl border border-slate-200 text-xs leading-relaxed"
            style={{ minHeight: '1050px', fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
          >
            {/* SECTION A & B: COMPANY HEADER & STATEMENT TITLE */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-6 border-b-2 border-slate-900">
              <div className="space-y-1 max-w-[420px]">
                <h1 className="text-2xl font-black tracking-wider uppercase text-slate-900">
                  {companyName}
                </h1>
                {profile?.address && (
                  <p className="text-slate-600 text-[11px] leading-tight whitespace-pre-line">
                    {profile.address}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-slate-600 pt-0.5">
                  {profile?.phone && <span>Phone: {profile.phone}</span>}
                  {profile?.email && <span>Email: {profile.email}</span>}
                </div>
                {profile?.gstin && (
                  <p className="text-[11px] font-semibold text-slate-800">
                    GSTIN: <span className="font-mono">{profile.gstin}</span>
                  </p>
                )}
              </div>

              <div className="text-left sm:text-right space-y-1 sm:self-start">
                <div className="inline-block px-3 py-1 bg-slate-900 text-white font-bold text-xs uppercase tracking-widest rounded-sm">
                  RUNNING LEDGER STATEMENT
                </div>
                <p className="text-[11px] text-slate-500 pt-1">
                  Statement of Account & Balance Journal
                </p>
                <p className="text-[11px] font-medium text-slate-700">
                  Date: <span className="font-semibold">{generatedDateStr}</span>
                </p>
                <p className="text-[11px] font-medium text-slate-700">
                  Period: <span className="font-semibold">{periodText}</span>
                </p>
              </div>
            </div>

            {/* SECTION C: PARTY INFORMATION & ACCOUNT SUMMARY */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-5 border-b border-slate-200">
              {/* Party Information */}
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200/80 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                  Statement For ({partyTypeLabel})
                </span>
                <p className="text-base font-bold text-slate-900 leading-tight">
                  {toTitleCase(partyName || '—')}
                </p>
                {partyObj?.contactPerson && (
                  <p className="text-[11px] text-slate-600">
                    Attn: {partyObj.contactPerson}
                  </p>
                )}
                {partyObj?.address && (
                  <p className="text-[11px] text-slate-600 leading-tight">
                    {partyObj.address}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-slate-600">
                  {partyObj?.phone && <span>Ph: {partyObj.phone}</span>}
                  {partyObj?.email && <span>Email: {partyObj.email}</span>}
                </div>
                {partyObj?.gstin && (
                  <p className="text-[11px] font-semibold text-slate-800 pt-0.5">
                    GSTIN: <span className="font-mono">{partyObj.gstin}</span>
                  </p>
                )}
              </div>

              {/* Statement Summary Box */}
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200/80 flex flex-col justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Account Overview
                </span>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Total Debits (Liabilities):</span>
                    <span className="font-bold text-rose-600 tabular-nums">₹{fmt(totalDebit)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Total Credits (Payments):</span>
                    <span className="font-bold text-emerald-600 tabular-nums">₹{fmt(totalCredit)}</span>
                  </div>
                  <div className="pt-1.5 border-t border-slate-200 flex justify-between items-center">
                    <span className="font-bold text-slate-900">Closing Balance:</span>
                    <span className="text-sm font-black text-slate-900 tabular-nums">
                      ₹{fmt(finalBalance)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION D: LEDGER TRANSACTION TABLE */}
            <div className="py-5">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="border-b-2 border-slate-900 bg-slate-100 text-slate-800 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-2.5 w-[12%]">Date</th>
                    <th className="py-2.5 px-2.5 w-[14%]">Reference</th>
                    <th className="py-2.5 px-2.5 w-[12%]">Type</th>
                    <th className="py-2.5 px-2.5 w-[26%]">Description</th>
                    <th className="py-2.5 px-2.5 w-[12%] text-right">Debit (₹)</th>
                    <th className="py-2.5 px-2.5 w-[12%] text-right">Credit (₹)</th>
                    <th className="py-2.5 px-2.5 w-[12%] text-right">Balance (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-400 italic">
                        No transactions found for this party and date selection.
                      </td>
                    </tr>
                  ) : (
                    transactions.map((r, i) => (
                      <tr
                        key={r.id || i}
                        className={i % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}
                      >
                        <td className="py-2 px-2.5 font-medium text-slate-700 whitespace-nowrap">
                          {r.date}
                        </td>
                        <td className="py-2 px-2.5 font-mono text-[10px] font-semibold text-slate-800 whitespace-nowrap">
                          {r.ref || '—'}
                        </td>
                        <td className="py-2 px-2.5 font-medium text-slate-700">
                          {r.type}
                        </td>
                        <td className="py-2 px-2.5 text-slate-600 truncate max-w-[220px]">
                          {r.description || '—'}
                        </td>
                        <td className="py-2 px-2.5 text-right font-semibold text-rose-600 tabular-nums whitespace-nowrap">
                          {r.debit > 0 ? fmt(r.debit) : '—'}
                        </td>
                        <td className="py-2 px-2.5 text-right font-semibold text-emerald-600 tabular-nums whitespace-nowrap">
                          {r.credit > 0 ? fmt(r.credit) : '—'}
                        </td>
                        <td className="py-2 px-2.5 text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">
                          ₹{fmt(r.balance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-900 bg-slate-100 font-bold text-[11px]">
                    <td colSpan={4} className="py-2.5 px-2.5 uppercase tracking-wider text-slate-900">
                      TOTALS ({transactions.length} Transactions)
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-black text-rose-700 tabular-nums">
                      ₹{fmt(totalDebit)}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-black text-emerald-700 tabular-nums">
                      ₹{fmt(totalCredit)}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-black text-slate-900 tabular-nums">
                      ₹{fmt(finalBalance)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* SECTION E: FINANCIAL SUMMARY & STATEMENT NOTES */}
            <div className="pt-4 border-t border-slate-200 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="space-y-1 max-w-[450px]">
                  <p className="text-[11px] font-bold text-slate-900 uppercase tracking-wider">
                    Balance Status & Terms
                  </p>
                  <p className="text-[11px] text-slate-600">
                    {finalBalance > 0
                      ? `Net outstanding payable of ₹${fmt(finalBalance)} is due to ${toTitleCase(partyName)} as per above journal entries.`
                      : finalBalance < 0
                      ? `Net advance balance of ₹${fmt(Math.abs(finalBalance))} in favor of Vastrams as of ${generatedDateStr}.`
                      : `Account is completely balanced and settled. Nil outstanding balance.`}
                  </p>
                  <p className="text-[10px] text-slate-400 italic">
                    All transactions are recorded sequentially in accordance with standard trade credit terms.
                  </p>
                </div>
                <div className="text-right sm:self-center shrink-0">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Net Outstanding
                  </span>
                  <span className="text-lg font-black text-slate-900 tabular-nums block">
                    ₹{fmt(finalBalance)}
                  </span>
                </div>
              </div>

              {/* Signatures & Footer Notice */}
              <div className="pt-8 flex flex-col sm:flex-row justify-between items-end gap-6 text-[10px] text-slate-500">
                <div className="space-y-1">
                  <p className="font-semibold text-slate-700">
                    Generated by: Vastrams Financial Accounting
                  </p>
                  <p>Timestamp: {generatedDateStr} at {generatedTimeStr}</p>
                  <p className="italic text-slate-400">
                    * This is a computer-generated statement of account. No signature required.
                  </p>
                </div>
                <div className="text-center sm:text-right space-y-8 min-w-[180px]">
                  <p className="font-bold text-slate-800 uppercase text-[11px]">
                    For {companyName}
                  </p>
                  <div className="pt-6 border-t border-slate-400">
                    <p className="font-bold text-slate-900">Authorised Signatory</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LedgerPrintModal

