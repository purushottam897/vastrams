/**
 * Finance Section PDF Generation and Direct Download Utility
 * Produces executive-grade, well-formatted A4 PDF reports for:
 * 1. Finance Summary / Financiers List (Financiers.jsx)
 * 2. Financier Profile & Loan Facility Statement (FinancierProfile.jsx)
 * 3. Loans & Credit Facilities Register (Loans.jsx)
 * 4. Financier Repayments Register (FinancierPayments.jsx)
 */

import { formatDateDisplay } from './date.js'

export const fmtNumber = (v) => {
  if (v === null || v === undefined || isNaN(v)) return '0'
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(v)
}

export const fmtCurrency = (v) => {
  if (v === null || v === undefined || isNaN(v)) return '₹0'
  return `₹${fmtNumber(v)}`
}

export const sanitizeFilename = (name) => {
  return (name || 'Record')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
}

export const getTodayDateString = () => {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const getFormattedTimestamp = () => {
  const d = new Date()
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }) + ' ' + d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  })
}

/**
 * Builds printable HTML document for Finance Summary / Financiers List
 */
export function buildFinanceSummaryHtml({ financiers = [], companyProfile = {}, search = '', statusFilter = 'ALL' }) {
  const compName = companyProfile.businessName || 'Vastrams'
  const compPhone = companyProfile.phone || ''
  const compEmail = companyProfile.email || ''
  const compAddress = companyProfile.address || ''
  const compGstin = companyProfile.gstin || ''
  const generatedAt = getFormattedTimestamp()

  const totalFinanciers = financiers.length
  const totalActiveLoans = financiers.reduce((s, f) => s + (f.loansCount || 0), 0)
  const totalOutstanding = financiers.reduce((s, f) => s + (f.outstanding || f.outstandingBalance || 0), 0)

  const filterText = [
    statusFilter !== 'ALL' ? `Status: ${statusFilter}` : null,
    search ? `Search: "${search}"` : null
  ].filter(Boolean).join(' | ') || 'All Registered Financiers'

  const rowsHtml = financiers.map((f, idx) => {
    const rateStr = f.defaultInterestRate !== null && f.defaultInterestRate !== undefined ? `${f.defaultInterestRate}% p.a.` : '—'
    const outBal = f.outstanding || f.outstandingBalance || 0
    const statusColor = String(f.status).toLowerCase() === 'active' ? '#047857' : '#b91c1c'
    const statusBg = String(f.status).toLowerCase() === 'active' ? '#d1fae5' : '#fee2e2'
    const isEven = idx % 2 === 1

    return `
      <tr style="background-color: ${isEven ? '#f8fafc' : '#ffffff'}; border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 9px 8px; text-align: center; color: #64748b; font-size: 11px;">${idx + 1}</td>
        <td style="padding: 9px 10px; font-weight: 700; color: #0f172a; font-size: 12px;">${f.name || '—'}</td>
        <td style="padding: 9px 10px; color: #334155; font-size: 11px;">${f.phone || '—'}</td>
        <td style="padding: 9px 10px; color: #64748b; font-size: 11px; max-width: 140px; word-break: break-word;">${f.address || '—'}</td>
        <td style="padding: 9px 10px; text-align: center; color: #475569; font-size: 11px;">${rateStr}</td>
        <td style="padding: 9px 10px; text-align: center; font-weight: 600; color: #0f172a; font-size: 11px;">${f.loansCount || 0}</td>
        <td style="padding: 9px 10px; text-align: right; font-weight: 700; color: ${outBal > 0 ? '#b91c1c' : '#047857'}; font-size: 12px; font-family: monospace;">${fmtCurrency(outBal)}</td>
        <td style="padding: 9px 8px; text-align: center;">
          <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 700; background-color: ${statusBg}; color: ${statusColor};">${f.status || 'Active'}</span>
        </td>
      </tr>
    `
  }).join('')

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; background: #ffffff; padding: 32px 36px; width: 800px; box-sizing: border-box; line-height: 1.4;">
      <!-- Header -->
      <div style="border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h1 style="margin: 0; font-size: 24px; font-weight: 900; letter-spacing: -0.5px; color: #0f172a; text-transform: uppercase;">${compName}</h1>
          <p style="margin: 2px 0 0 0; font-size: 11px; font-weight: 600; color: #4f46e5; text-transform: uppercase; letter-spacing: 0.5px;">Vendor & Finance Management System</p>
          ${compAddress ? `<p style="margin: 4px 0 0 0; font-size: 11px; color: #475569;">${compAddress}</p>` : ''}
          <div style="margin-top: 4px; font-size: 10px; color: #64748b; display: flex; gap: 12px;">
            ${compPhone ? `<span>Phone: ${compPhone}</span>` : ''}
            ${compEmail ? `<span>Email: ${compEmail}</span>` : ''}
            ${compGstin ? `<span>GSTIN: ${compGstin}</span>` : ''}
          </div>
        </div>
        <div style="text-align: right;">
          <div style="display: inline-block; background: #4f46e5; color: #ffffff; padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">Finance Statement</div>
          <p style="margin: 8px 0 0 0; font-size: 10px; color: #64748b;">Generated: <strong style="color: #0f172a;">${generatedAt}</strong></p>
          <p style="margin: 2px 0 0 0; font-size: 10px; color: #64748b;">Scope: <strong style="color: #0f172a;">${filterText}</strong></p>
        </div>
      </div>

      <!-- Summary KPI Metric Cards -->
      <div style="display: flex; gap: 12px; margin-bottom: 24px;">
        <div style="flex: 1; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; background: #f8fafc;">
          <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Total Financiers</span>
          <p style="margin: 4px 0 0 0; font-size: 20px; font-weight: 800; color: #0f172a;">${totalFinanciers}</p>
        </div>
        <div style="flex: 1; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; background: #f8fafc;">
          <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Active Loan Facilities</span>
          <p style="margin: 4px 0 0 0; font-size: 20px; font-weight: 800; color: #4f46e5;">${totalActiveLoans}</p>
        </div>
        <div style="flex: 1.2; border: 1px solid #fecdd3; border-radius: 10px; padding: 12px 14px; background: #fff1f2;">
          <span style="font-size: 10px; font-weight: 700; color: #9f1239; text-transform: uppercase; letter-spacing: 0.5px;">Total Outstanding Exposure</span>
          <p style="margin: 4px 0 0 0; font-size: 20px; font-weight: 800; color: #be123c; font-family: monospace;">${fmtCurrency(totalOutstanding)}</p>
        </div>
      </div>

      <!-- Main Data Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; border: 1px solid #cbd5e1; font-size: 11px;">
        <thead>
          <tr style="background: #0f172a; color: #ffffff; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px;">
            <th style="padding: 8px 6px; width: 32px; text-align: center;">#</th>
            <th style="padding: 8px 10px; text-align: left;">Financier Name</th>
            <th style="padding: 8px 10px; text-align: left;">Phone</th>
            <th style="padding: 8px 10px; text-align: left;">Office Address</th>
            <th style="padding: 8px 10px; text-align: center;">Interest Rate</th>
            <th style="padding: 8px 10px; text-align: center;">Active Loans</th>
            <th style="padding: 8px 10px; text-align: right;">Outstanding (₹)</th>
            <th style="padding: 8px 8px; text-align: center; width: 70px;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="8" style="text-align: center; padding: 24px; color: #94a3b8; font-style: italic;">No financiers match the selected filters.</td></tr>`}
        </tbody>
        <tfoot>
          <tr style="background: #f1f5f9; border-top: 2px solid #0f172a; font-weight: 800; font-size: 11px;">
            <td colspan="5" style="padding: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a;">Total Summary (${totalFinanciers} Financiers)</td>
            <td style="padding: 10px; text-align: center; color: #4f46e5; font-size: 12px;">${totalActiveLoans}</td>
            <td style="padding: 10px; text-align: right; color: #be123c; font-size: 13px; font-family: monospace;">${fmtCurrency(totalOutstanding)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      <!-- Signatures & Record-keeping Certification -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 36px; padding-top: 20px; border-top: 1px dashed #cbd5e1;">
        <div style="font-size: 10px; color: #64748b; max-width: 440px;">
          <p style="margin: 0; font-weight: 600; color: #334155;">Computer-Generated Business Record</p>
          <p style="margin: 2px 0 0 0;">This document reflects official credit liabilities and outstanding finance terms saved in Vastrams ERP. Certified for record-keeping and statutory reconciliation.</p>
        </div>
        <div style="text-align: center; width: 180px;">
          <div style="border-bottom: 1px solid #0f172a; height: 35px; margin-bottom: 6px;"></div>
          <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a; display: block;">Authorized Signatory</span>
          <span style="font-size: 9px; color: #64748b;">Seal / Stamp</span>
        </div>
      </div>
    </div>
  `
}

/**
 * Builds printable HTML document for Financier Profile Statement
 */
export function buildFinancierProfileHtml({ profile = {}, loans = [], companyProfile = {} }) {
  const compName = companyProfile.businessName || 'Vastrams'
  const generatedAt = getFormattedTimestamp()

  const totalLoans = loans.length
  const totalLoaned = loans.reduce((s, l) => s + (l.amount || 0), 0)
  const totalPaid = loans.reduce((s, l) => s + (l.paid || 0), 0)
  const totalOutstanding = loans.reduce((s, l) => s + (l.outstanding || 0), 0)

  const rowsHtml = loans.map((l, idx) => {
    const isEven = idx % 2 === 1
    const dDate = l.date ? formatDateDisplay(l.date) : '—'
    const mDate = l.maturityDate ? formatDateDisplay(l.maturityDate) : '—'
    const rateStr = l.interestRate !== null && l.interestRate !== undefined && !isNaN(l.interestRate) ? `${l.interestRate}% p.a.` : '—'
    const statusColor = String(l.status).toLowerCase() === 'closed' ? '#047857' : (String(l.status).toLowerCase() === 'overdue' ? '#b91c1c' : '#4f46e5')
    const statusBg = String(l.status).toLowerCase() === 'closed' ? '#d1fae5' : (String(l.status).toLowerCase() === 'overdue' ? '#fee2e2' : '#e0e7ff')

    return `
      <tr style="background-color: ${isEven ? '#f8fafc' : '#ffffff'}; border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 9px 8px; text-align: center; color: #64748b; font-size: 11px;">${idx + 1}</td>
        <td style="padding: 9px 10px; font-family: monospace; font-weight: 700; color: #0f172a; font-size: 11px;">#${l.noteNo || '—'}</td>
        <td style="padding: 9px 10px; color: #334155; font-size: 11px; white-space: nowrap;">${dDate}</td>
        <td style="padding: 9px 10px; color: #64748b; font-size: 11px; white-space: nowrap;">${mDate}</td>
        <td style="padding: 9px 10px; text-align: center; color: #475569; font-size: 11px;">${rateStr}</td>
        <td style="padding: 9px 10px; text-align: right; font-weight: 600; color: #0f172a; font-size: 11px; font-family: monospace;">${fmtCurrency(l.amount)}</td>
        <td style="padding: 9px 10px; text-align: right; font-weight: 600; color: #047857; font-size: 11px; font-family: monospace;">${fmtCurrency(l.paid)}</td>
        <td style="padding: 9px 10px; text-align: right; font-weight: 700; color: ${l.outstanding > 0 ? '#b91c1c' : '#047857'}; font-size: 12px; font-family: monospace;">${fmtCurrency(l.outstanding)}</td>
        <td style="padding: 9px 8px; text-align: center;">
          <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 700; background-color: ${statusBg}; color: ${statusColor};">${l.status || 'Active'}</span>
        </td>
      </tr>
    `
  }).join('')

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; background: #ffffff; padding: 32px 36px; width: 800px; box-sizing: border-box; line-height: 1.4;">
      <!-- Header -->
      <div style="border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h1 style="margin: 0; font-size: 24px; font-weight: 900; letter-spacing: -0.5px; color: #0f172a; text-transform: uppercase;">${compName}</h1>
          <p style="margin: 2px 0 0 0; font-size: 11px; font-weight: 600; color: #4f46e5; text-transform: uppercase; letter-spacing: 0.5px;">Vendor & Finance Management System</p>
          <div style="margin-top: 8px; font-size: 11px; color: #334155;">
            <p style="margin: 0; font-weight: 700; font-size: 13px; color: #0f172a;">Financier: ${profile.name || '—'}</p>
            ${profile.phone ? `<p style="margin: 2px 0 0 0;">Phone: ${profile.phone}</p>` : ''}
            ${profile.address ? `<p style="margin: 2px 0 0 0;">Address: ${profile.address}</p>` : ''}
          </div>
        </div>
        <div style="text-align: right;">
          <div style="display: inline-block; background: #0f172a; color: #ffffff; padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">Financier Loan Statement</div>
          <p style="margin: 8px 0 0 0; font-size: 10px; color: #64748b;">Generated: <strong style="color: #0f172a;">${generatedAt}</strong></p>
          <p style="margin: 2px 0 0 0; font-size: 10px; color: #64748b;">Account Status: <strong style="color: #047857;">${profile.status || 'Active'}</strong></p>
          ${profile.defaultInterestRate !== undefined ? `<p style="margin: 2px 0 0 0; font-size: 10px; color: #64748b;">Standard Rate: <strong>${profile.defaultInterestRate}% p.a.</strong></p>` : ''}
        </div>
      </div>

      <!-- KPI Summary Cards -->
      <div style="display: flex; gap: 12px; margin-bottom: 24px;">
        <div style="flex: 1; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; background: #f8fafc;">
          <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">Total Disbursed</span>
          <p style="margin: 4px 0 0 0; font-size: 18px; font-weight: 800; color: #0f172a; font-family: monospace;">${fmtCurrency(totalLoaned)}</p>
        </div>
        <div style="flex: 1; border: 1px solid #d1fae5; border-radius: 10px; padding: 12px 14px; background: #ecfdf5;">
          <span style="font-size: 10px; font-weight: 700; color: #047857; text-transform: uppercase;">Total Principal Settled</span>
          <p style="margin: 4px 0 0 0; font-size: 18px; font-weight: 800; color: #047857; font-family: monospace;">${fmtCurrency(totalPaid)}</p>
        </div>
        <div style="flex: 1.2; border: 1px solid #fecdd3; border-radius: 10px; padding: 12px 14px; background: #fff1f2;">
          <span style="font-size: 10px; font-weight: 700; color: #9f1239; text-transform: uppercase;">Outstanding Balance</span>
          <p style="margin: 4px 0 0 0; font-size: 18px; font-weight: 800; color: #be123c; font-family: monospace;">${fmtCurrency(totalOutstanding)}</p>
        </div>
      </div>

      <!-- Facilities Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; border: 1px solid #cbd5e1; font-size: 11px;">
        <thead>
          <tr style="background: #0f172a; color: #ffffff; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px;">
            <th style="padding: 8px 6px; width: 32px; text-align: center;">#</th>
            <th style="padding: 8px 10px; text-align: left;">Note #</th>
            <th style="padding: 8px 10px; text-align: left;">Drawdown Date</th>
            <th style="padding: 8px 10px; text-align: left;">Maturity Date</th>
            <th style="padding: 8px 10px; text-align: center;">Rate</th>
            <th style="padding: 8px 10px; text-align: right;">Principal (₹)</th>
            <th style="padding: 8px 10px; text-align: right;">Repaid (₹)</th>
            <th style="padding: 8px 10px; text-align: right;">Pending (₹)</th>
            <th style="padding: 8px 8px; text-align: center; width: 65px;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="9" style="text-align: center; padding: 24px; color: #94a3b8; font-style: italic;">No loan notes recorded for this financier.</td></tr>`}
        </tbody>
        <tfoot>
          <tr style="background: #f1f5f9; border-top: 2px solid #0f172a; font-weight: 800; font-size: 11px;">
            <td colspan="5" style="padding: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a;">Totals (${totalLoans} Notes)</td>
            <td style="padding: 10px; text-align: right; color: #0f172a; font-family: monospace;">${fmtCurrency(totalLoaned)}</td>
            <td style="padding: 10px; text-align: right; color: #047857; font-family: monospace;">${fmtCurrency(totalPaid)}</td>
            <td style="padding: 10px; text-align: right; color: #be123c; font-size: 12px; font-family: monospace;">${fmtCurrency(totalOutstanding)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      <!-- Footer & Signatures -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 36px; padding-top: 20px; border-top: 1px dashed #cbd5e1;">
        <div style="font-size: 10px; color: #64748b; max-width: 440px;">
          <p style="margin: 0; font-weight: 600; color: #334155;">Computer-Generated Business Record</p>
          <p style="margin: 2px 0 0 0;">This statement summarizes principal drawdowns and repayment allocations for ${profile.name || 'this financier'}. Certified for commercial records.</p>
        </div>
        <div style="text-align: center; width: 180px;">
          <div style="border-bottom: 1px solid #0f172a; height: 35px; margin-bottom: 6px;"></div>
          <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a; display: block;">Authorized Signatory</span>
          <span style="font-size: 9px; color: #64748b;">Seal / Stamp</span>
        </div>
      </div>
    </div>
  `
}

/**
 * Builds printable HTML document for Loans & Credit Facilities Register
 */
export function buildLoansRegisterHtml({ loans = [], companyProfile = {}, search = '', statusFilter = 'ALL', sortBy = '' }) {
  const compName = companyProfile.businessName || 'Vastrams'
  const generatedAt = getFormattedTimestamp()

  const totalLoans = loans.length
  const totalPrincipal = loans.reduce((s, l) => s + (l.amount || 0), 0)
  const totalRepaid = loans.reduce((s, l) => s + (l.repaid || 0), 0)
  const totalPending = loans.reduce((s, l) => s + (l.pending || 0), 0)

  const rowsHtml = loans.map((l, idx) => {
    const isEven = idx % 2 === 1
    const dDate = l.loanDate ? formatDateDisplay(l.loanDate) : '—'
    const mDate = l.maturityDate ? formatDateDisplay(l.maturityDate) : '—'
    const rateStr = l.rate !== null && l.rate !== undefined && l.rate !== '' ? `${l.rate}% p.a.` : '—'
    const statusColor = String(l.status).toLowerCase() === 'closed' ? '#047857' : (String(l.status).toLowerCase() === 'overdue' ? '#b91c1c' : '#4f46e5')
    const statusBg = String(l.status).toLowerCase() === 'closed' ? '#d1fae5' : (String(l.status).toLowerCase() === 'overdue' ? '#fee2e2' : '#e0e7ff')

    return `
      <tr style="background-color: ${isEven ? '#f8fafc' : '#ffffff'}; border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 9px 8px; text-align: center; color: #64748b; font-size: 11px;">${idx + 1}</td>
        <td style="padding: 9px 10px; font-family: monospace; font-weight: 700; color: #0f172a; font-size: 11px;">#${l.noteNo || '—'}</td>
        <td style="padding: 9px 10px; font-weight: 600; color: #0f172a; font-size: 11px;">${l.financier || '—'}</td>
        <td style="padding: 9px 10px; color: #334155; font-size: 11px; white-space: nowrap;">${dDate}</td>
        <td style="padding: 9px 10px; color: #64748b; font-size: 11px; white-space: nowrap;">${mDate}</td>
        <td style="padding: 9px 10px; text-align: center; color: #475569; font-size: 11px;">${rateStr}</td>
        <td style="padding: 9px 10px; text-align: right; font-weight: 600; color: #0f172a; font-size: 11px; font-family: monospace;">${fmtCurrency(l.amount)}</td>
        <td style="padding: 9px 10px; text-align: right; font-weight: 600; color: #047857; font-size: 11px; font-family: monospace;">${fmtCurrency(l.repaid)}</td>
        <td style="padding: 9px 10px; text-align: right; font-weight: 700; color: ${l.pending > 0 ? '#b91c1c' : '#047857'}; font-size: 12px; font-family: monospace;">${fmtCurrency(l.pending)}</td>
        <td style="padding: 9px 8px; text-align: center;">
          <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 700; background-color: ${statusBg}; color: ${statusColor};">${l.status || 'Active'}</span>
        </td>
      </tr>
    `
  }).join('')

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; background: #ffffff; padding: 32px 36px; width: 850px; box-sizing: border-box; line-height: 1.4;">
      <!-- Header -->
      <div style="border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h1 style="margin: 0; font-size: 24px; font-weight: 900; letter-spacing: -0.5px; color: #0f172a; text-transform: uppercase;">${compName}</h1>
          <p style="margin: 2px 0 0 0; font-size: 11px; font-weight: 600; color: #4f46e5; text-transform: uppercase; letter-spacing: 0.5px;">Vendor & Finance Management System</p>
        </div>
        <div style="text-align: right;">
          <div style="display: inline-block; background: #4f46e5; color: #ffffff; padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">Loans Register</div>
          <p style="margin: 8px 0 0 0; font-size: 10px; color: #64748b;">Generated: <strong style="color: #0f172a;">${generatedAt}</strong></p>
          <p style="margin: 2px 0 0 0; font-size: 10px; color: #64748b;">Facilities: <strong style="color: #0f172a;">${totalLoans} Notes</strong></p>
        </div>
      </div>

      <!-- KPI Summary Cards -->
      <div style="display: flex; gap: 12px; margin-bottom: 24px;">
        <div style="flex: 1; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; background: #f8fafc;">
          <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">Total Principal Disbursed</span>
          <p style="margin: 4px 0 0 0; font-size: 18px; font-weight: 800; color: #0f172a; font-family: monospace;">${fmtCurrency(totalPrincipal)}</p>
        </div>
        <div style="flex: 1; border: 1px solid #d1fae5; border-radius: 10px; padding: 12px 14px; background: #ecfdf5;">
          <span style="font-size: 10px; font-weight: 700; color: #047857; text-transform: uppercase;">Total Repaid</span>
          <p style="margin: 4px 0 0 0; font-size: 18px; font-weight: 800; color: #047857; font-family: monospace;">${fmtCurrency(totalRepaid)}</p>
        </div>
        <div style="flex: 1.2; border: 1px solid #fecdd3; border-radius: 10px; padding: 12px 14px; background: #fff1f2;">
          <span style="font-size: 10px; font-weight: 700; color: #9f1239; text-transform: uppercase;">Total Outstanding Exposure</span>
          <p style="margin: 4px 0 0 0; font-size: 18px; font-weight: 800; color: #be123c; font-family: monospace;">${fmtCurrency(totalPending)}</p>
        </div>
      </div>

      <!-- Main Loans Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; border: 1px solid #cbd5e1; font-size: 11px;">
        <thead>
          <tr style="background: #0f172a; color: #ffffff; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px;">
            <th style="padding: 8px 6px; width: 30px; text-align: center;">#</th>
            <th style="padding: 8px 8px; text-align: left;">Note #</th>
            <th style="padding: 8px 10px; text-align: left;">Financier</th>
            <th style="padding: 8px 10px; text-align: left;">Drawdown Date</th>
            <th style="padding: 8px 10px; text-align: left;">Maturity Date</th>
            <th style="padding: 8px 8px; text-align: center;">Rate</th>
            <th style="padding: 8px 10px; text-align: right;">Principal (₹)</th>
            <th style="padding: 8px 10px; text-align: right;">Repaid (₹)</th>
            <th style="padding: 8px 10px; text-align: right;">Pending (₹)</th>
            <th style="padding: 8px 8px; text-align: center; width: 65px;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="10" style="text-align: center; padding: 24px; color: #94a3b8; font-style: italic;">No loans match the current selection.</td></tr>`}
        </tbody>
        <tfoot>
          <tr style="background: #f1f5f9; border-top: 2px solid #0f172a; font-weight: 800; font-size: 11px;">
            <td colspan="6" style="padding: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a;">Totals (${totalLoans} Facilities)</td>
            <td style="padding: 10px; text-align: right; color: #0f172a; font-family: monospace;">${fmtCurrency(totalPrincipal)}</td>
            <td style="padding: 10px; text-align: right; color: #047857; font-family: monospace;">${fmtCurrency(totalRepaid)}</td>
            <td style="padding: 10px; text-align: right; color: #be123c; font-size: 12px; font-family: monospace;">${fmtCurrency(totalPending)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      <!-- Signatures -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 36px; padding-top: 20px; border-top: 1px dashed #cbd5e1;">
        <div style="font-size: 10px; color: #64748b; max-width: 440px;">
          <p style="margin: 0; font-weight: 600; color: #334155;">Computer-Generated Business Record</p>
          <p style="margin: 2px 0 0 0;">Certified register of financial notes and loan exposures as recorded in Vastrams database.</p>
        </div>
        <div style="text-align: center; width: 180px;">
          <div style="border-bottom: 1px solid #0f172a; height: 35px; margin-bottom: 6px;"></div>
          <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a; display: block;">Authorized Signatory</span>
          <span style="font-size: 9px; color: #64748b;">Seal / Stamp</span>
        </div>
      </div>
    </div>
  `
}

/**
 * Builds printable HTML document for Financier Repayments Register
 */
export function buildFinancierRepaymentsHtml({ repayments = [], companyProfile = {}, search = '', modeFilter = 'ALL' }) {
  const compName = companyProfile.businessName || 'Vastrams'
  const generatedAt = getFormattedTimestamp()

  const totalRepayments = repayments.length
  const totalRepaid = repayments.reduce((s, r) => s + (r.amount || 0), 0)

  const rowsHtml = repayments.map((r, idx) => {
    const isEven = idx % 2 === 1
    const rDate = r.date ? formatDateDisplay(r.date) : '—'

    return `
      <tr style="background-color: ${isEven ? '#f8fafc' : '#ffffff'}; border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 9px 8px; text-align: center; color: #64748b; font-size: 11px;">${idx + 1}</td>
        <td style="padding: 9px 10px; font-family: monospace; font-weight: 700; color: #0f172a; font-size: 11px;">${r.ref || '—'}</td>
        <td style="padding: 9px 10px; font-weight: 700; color: #0f172a; font-size: 11px;">${r.financier || '—'}</td>
        <td style="padding: 9px 10px; color: #334155; font-size: 11px; white-space: nowrap;">${rDate}</td>
        <td style="padding: 9px 10px; text-align: center; font-size: 11px;">
          <span style="display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; background: #e0e7ff; color: #3730a3;">${r.mode || 'Bank Transfer'}</span>
        </td>
        <td style="padding: 9px 10px; color: #64748b; font-size: 11px; max-width: 180px; word-break: break-word;">${r.remarks || '—'}</td>
        <td style="padding: 9px 10px; text-align: right; font-weight: 800; color: #047857; font-size: 12px; font-family: monospace;">${fmtCurrency(r.amount)}</td>
      </tr>
    `
  }).join('')

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; background: #ffffff; padding: 32px 36px; width: 800px; box-sizing: border-box; line-height: 1.4;">
      <!-- Header -->
      <div style="border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h1 style="margin: 0; font-size: 24px; font-weight: 900; letter-spacing: -0.5px; color: #0f172a; text-transform: uppercase;">${compName}</h1>
          <p style="margin: 2px 0 0 0; font-size: 11px; font-weight: 600; color: #4f46e5; text-transform: uppercase; letter-spacing: 0.5px;">Vendor & Finance Management System</p>
        </div>
        <div style="text-align: right;">
          <div style="display: inline-block; background: #047857; color: #ffffff; padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">Financier Repayments</div>
          <p style="margin: 8px 0 0 0; font-size: 10px; color: #64748b;">Generated: <strong style="color: #0f172a;">${generatedAt}</strong></p>
          <p style="margin: 2px 0 0 0; font-size: 10px; color: #64748b;">Vouchers: <strong style="color: #0f172a;">${totalRepayments} Recorded</strong></p>
        </div>
      </div>

      <!-- KPI Summary Cards -->
      <div style="display: flex; gap: 12px; margin-bottom: 24px;">
        <div style="flex: 1; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; background: #f8fafc;">
          <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">Total Repayment Vouchers</span>
          <p style="margin: 4px 0 0 0; font-size: 20px; font-weight: 800; color: #0f172a;">${totalRepayments}</p>
        </div>
        <div style="flex: 1.5; border: 1px solid #d1fae5; border-radius: 10px; padding: 12px 14px; background: #ecfdf5;">
          <span style="font-size: 10px; font-weight: 700; color: #047857; text-transform: uppercase;">Total Principal Settled</span>
          <p style="margin: 4px 0 0 0; font-size: 20px; font-weight: 800; color: #047857; font-family: monospace;">${fmtCurrency(totalRepaid)}</p>
        </div>
      </div>

      <!-- Repayments Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; border: 1px solid #cbd5e1; font-size: 11px;">
        <thead>
          <tr style="background: #0f172a; color: #ffffff; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px;">
            <th style="padding: 8px 6px; width: 32px; text-align: center;">#</th>
            <th style="padding: 8px 10px; text-align: left;">Ref #</th>
            <th style="padding: 8px 10px; text-align: left;">Financier</th>
            <th style="padding: 8px 10px; text-align: left;">Repayment Date</th>
            <th style="padding: 8px 10px; text-align: center;">Mode</th>
            <th style="padding: 8px 10px; text-align: left;">Remarks / Notes</th>
            <th style="padding: 8px 10px; text-align: right;">Amount Repaid (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="7" style="text-align: center; padding: 24px; color: #94a3b8; font-style: italic;">No repayments match the current filters.</td></tr>`}
        </tbody>
        <tfoot>
          <tr style="background: #f1f5f9; border-top: 2px solid #0f172a; font-weight: 800; font-size: 11px;">
            <td colspan="6" style="padding: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a;">Totals (${totalRepayments} Vouchers)</td>
            <td style="padding: 10px; text-align: right; color: #047857; font-size: 13px; font-family: monospace;">${fmtCurrency(totalRepaid)}</td>
          </tr>
        </tfoot>
      </table>

      <!-- Signatures -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 36px; padding-top: 20px; border-top: 1px dashed #cbd5e1;">
        <div style="font-size: 10px; color: #64748b; max-width: 440px;">
          <p style="margin: 0; font-weight: 600; color: #334155;">Computer-Generated Business Record</p>
          <p style="margin: 2px 0 0 0;">Certified register of loan settlements and repayments recorded in Vastrams database.</p>
        </div>
        <div style="text-align: center; width: 180px;">
          <div style="border-bottom: 1px solid #0f172a; height: 35px; margin-bottom: 6px;"></div>
          <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a; display: block;">Authorized Signatory</span>
          <span style="font-size: 9px; color: #64748b;">Seal / Stamp</span>
        </div>
      </div>
    </div>
  `
}

/**
 * Executes direct PDF rendering and native download using html2canvas and jsPDF.
 * Never triggers window.print() or browser print dialog.
 */
export async function downloadHtmlAsPdf(htmlString, filename = 'document.pdf') {
  if (typeof document === 'undefined') {
    throw new Error('downloadHtmlAsPdf must be executed in a browser environment')
  }

  // 1. Create off-screen container
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-9999px'
  container.style.top = '0'
  container.style.width = '820px'
  container.style.zIndex = '-99999'
  container.style.background = '#ffffff'
  container.innerHTML = htmlString
  document.body.appendChild(container)

  try {
    // 2. Dynamically import jspdf & html2canvas
    const [{ jsPDF }, html2canvasModule] = await Promise.all([
      import('jspdf'),
      import('html2canvas')
    ])
    const html2canvas = html2canvasModule.default || html2canvasModule

    // 3. Render container to high-res canvas (scale 2 = 300dpi)
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: 820
    })

    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      throw new Error('Canvas rendering produced an empty image')
    }

    // 4. Construct A4 PDF document
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    })

    const pageWidth = 210
    const pageHeight = 297
    const margin = 10
    const printableWidth = pageWidth - (margin * 2) // 190mm
    const printableHeight = pageHeight - (margin * 2) // 277mm

    const imgWidth = printableWidth
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    const imgData = canvas.toDataURL('image/png')

    if (!imgData || imgData.length < 100) {
      throw new Error('Failed to generate image data for PDF')
    }

    // If single page fit (with up to 8% margin)
    if (imgHeight <= printableHeight * 1.08) {
      const finalHeight = Math.min(imgHeight, printableHeight)
      const finalWidth = (imgHeight > printableHeight) ? (imgWidth * (printableHeight / imgHeight)) : imgWidth
      const xPos = margin + ((printableWidth - finalWidth) / 2)
      pdf.addImage(imgData, 'PNG', xPos, margin, finalWidth, finalHeight, undefined, 'FAST')
    } else {
      // Multi-page document handling
      let heightLeft = imgHeight
      let position = margin

      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight, undefined, 'FAST')
      heightLeft -= printableHeight

      while (heightLeft > 0) {
        position -= printableHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight, undefined, 'FAST')
        heightLeft -= printableHeight
      }
    }

    // 5. Trigger direct download with filename
    pdf.save(filename)
    return true
  } finally {
    // 6. Clean up DOM
    if (container.parentNode) {
      container.parentNode.removeChild(container)
    }
  }
}

/**
 * Direct download methods for each view
 */
export async function downloadFinanceSummaryPdf({ financiers, companyProfile, search, statusFilter }) {
  const dateStr = getTodayDateString()
  const filename = `Vastrams_Finance_Report_${dateStr}.pdf`
  const html = buildFinanceSummaryHtml({ financiers, companyProfile, search, statusFilter })
  return downloadHtmlAsPdf(html, filename)
}

export async function downloadFinancierProfilePdf({ profile, loans, companyProfile }) {
  const dateStr = getTodayDateString()
  const cleanName = sanitizeFilename(profile?.name || 'Financier')
  const filename = `Vastrams_Financier_Statement_${cleanName}_${dateStr}.pdf`
  const html = buildFinancierProfileHtml({ profile, loans, companyProfile })
  return downloadHtmlAsPdf(html, filename)
}

export async function downloadLoansRegisterPdf({ loans, companyProfile, search, statusFilter, sortBy }) {
  const dateStr = getTodayDateString()
  const filename = `Vastrams_Loans_Register_${dateStr}.pdf`
  const html = buildLoansRegisterHtml({ loans, companyProfile, search, statusFilter, sortBy })
  return downloadHtmlAsPdf(html, filename)
}

export async function downloadFinancierRepaymentsPdf({ repayments, companyProfile, search, modeFilter }) {
  const dateStr = getTodayDateString()
  const filename = `Vastrams_Financier_Repayments_${dateStr}.pdf`
  const html = buildFinancierRepaymentsHtml({ repayments, companyProfile, search, modeFilter })
  return downloadHtmlAsPdf(html, filename)
}
