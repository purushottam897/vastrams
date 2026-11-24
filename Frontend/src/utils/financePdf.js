/**
 * Finance Section PDF Generation and Direct Download Utility
 * Produces executive-grade, well-formatted A4 PDF documents styled
 * to match the Purchases Tax Invoice & Voucher design (PrintPreviewModal):
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
 * Converts numbers into English words formatted for Indian Rupees
 */
export function numberToWords(num) {
  if (num === null || num === undefined || isNaN(num)) return 'Indian Rupee Zero Only'
  const val = Number(num)
  if (val === 0) return 'Indian Rupee Zero Only'
  const rupees = Math.floor(Math.abs(val))
  const paise = Math.round((Math.abs(val) - rupees) * 100)

  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen ']
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  function convert(n) {
    if (n.toString().length > 9) return 'overflow'
    let match = ('000000000' + n).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/)
    if (!match) return ''
    let str = ''
    str += match[1] != 0 ? (a[Number(match[1])] || b[match[1][0]] + ' ' + a[match[1][1]]) + 'Crore ' : ''
    str += match[2] != 0 ? (a[Number(match[2])] || b[match[2][0]] + ' ' + a[match[2][1]]) + 'Lakh ' : ''
    str += match[3] != 0 ? (a[Number(match[3])] || b[match[3][0]] + ' ' + a[match[3][1]]) + 'Thousand ' : ''
    str += match[4] != 0 ? (a[Number(match[4])] || b[match[4][0]] + ' ' + a[match[4][1]]) + 'Hundred ' : ''
    str += match[5] != 0 ? ((str !== '') ? 'and ' : '') + (a[Number(match[5])] || b[match[5][0]] + ' ' + a[match[5][1]]) : ''
    return str.trim()
  }

  let rupeeWords = convert(rupees)
  let result = rupeeWords ? `Indian Rupee ${rupeeWords}` : 'Indian Rupee Zero'
  if (paise > 0) {
    let paiseWords = convert(paise)
    result += ` and ${paiseWords} Paise`
  }
  result += ' Only'
  return result
}

/**
 * Standard Ack Number generator matching Purchases
 */
export function getAckNo(tag = 'FIN') {
  const d = new Date()
  const yyyymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
  return `${yyyymm}-${tag.toUpperCase()}-001`
}

/**
 * Standard QR code vector matching Purchases e-Invoice
 */
const QR_SVG = `
  <svg width="60" height="60" viewBox="0 0 100 100" style="display:block;">
    <rect width="100" height="100" fill="#ffffff"/>
    <rect x="8" y="8" width="28" height="28" fill="#000000"/>
    <rect x="14" y="14" width="16" height="16" fill="#ffffff"/>
    <rect x="18" y="18" width="8" height="8" fill="#000000"/>
    <rect x="64" y="8" width="28" height="28" fill="#000000"/>
    <rect x="70" y="14" width="16" height="16" fill="#ffffff"/>
    <rect x="74" y="18" width="8" height="8" fill="#000000"/>
    <rect x="8" y="64" width="28" height="28" fill="#000000"/>
    <rect x="14" y="70" width="16" height="16" fill="#ffffff"/>
    <rect x="18" y="74" width="8" height="8" fill="#000000"/>
    <rect x="42" y="12" width="14" height="6" fill="#000000"/>
    <rect x="42" y="24" width="8" height="12" fill="#000000"/>
    <rect x="42" y="42" width="16" height="16" fill="#000000"/>
    <rect x="64" y="42" width="12" height="8" fill="#000000"/>
    <rect x="80" y="42" width="12" height="14" fill="#000000"/>
    <rect x="42" y="64" width="14" height="14" fill="#000000"/>
    <rect x="62" y="64" width="14" height="8" fill="#000000"/>
    <rect x="62" y="76" width="8" height="16" fill="#000000"/>
    <rect x="76" y="74" width="16" height="18" fill="#000000"/>
  </svg>
`

/**
 * Builds Purchases-style box-bordered HTML document for Finance Summary / Financiers List
 */
export function buildFinanceSummaryHtml({ financiers = [], companyProfile = {}, search = '', statusFilter = 'ALL' }) {
  const compName = companyProfile.businessName || 'Vastrams'
  const compAddress = companyProfile.address || '123 Main St, Surat, Gujarat'
  const compGstin = companyProfile.gstin || '24AAAAA0000A1Z0'
  const compState = (compGstin || '24').substring(0, 2)
  const bankName = companyProfile.bankName || 'HDFC Bank'
  const bankAccount = companyProfile.bankAccount || '50200012345678'
  const bankIFSC = companyProfile.bankIFSC || 'HDFC0001234'

  const generatedDate = getTodayDateString()
  const generatedAt = getFormattedTimestamp()
  const ackNo = getAckNo('FIN')

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

    return `
      <tr style="border-bottom: 1px solid #000000;">
        <td style="border-right: 1px solid #000000; padding: 6px 8px; text-align: center; font-size: 11px;">${idx + 1}</td>
        <td style="border-right: 1px solid #000000; padding: 6px 8px; font-weight: 700; color: #000000; font-size: 11px;">
          ${f.name || '—'}
          ${f.phone ? `<div style="font-size: 9px; font-weight: normal; color: #475569;">Ph: ${f.phone}</div>` : ''}
        </td>
        <td style="border-right: 1px solid #000000; padding: 6px 8px; color: #334155; font-size: 10px; max-width: 160px; word-break: break-word;">${f.address || '—'}</td>
        <td style="border-right: 1px solid #000000; padding: 6px 8px; text-align: center; color: #000000; font-size: 11px;">${rateStr}</td>
        <td style="border-right: 1px solid #000000; padding: 6px 8px; text-align: center; font-weight: 700; color: #000000; font-size: 11px;">${f.loansCount || 0}</td>
        <td style="border-right: 1px solid #000000; padding: 6px 8px; text-align: center; font-size: 10px; font-weight: 700;">${f.status || 'Active'}</td>
        <td style="padding: 6px 8px; text-align: right; font-weight: 700; color: #000000; font-size: 11px; font-family: monospace;">${fmtCurrency(outBal)}</td>
      </tr>
    `
  }).join('')

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #000000; background: #ffffff; padding: 16px 20px; width: 800px; box-sizing: border-box; line-height: 1.35; border: 2px solid #000000;">
      
      <!-- Top Title Box with e-Invoice QR (Purchases Layout) -->
      <div style="border: 1px solid #000000; background: #f8fafc; padding: 12px 14px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <div style="font-size: 20px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; color: #000000; margin-bottom: 2px;">
            ${compName.toUpperCase()}
          </div>
          <div style="font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #000000; margin-bottom: 6px;">
            FINANCE STATEMENT
          </div>
          <div style="font-size: 11px; font-family: monospace; color: #000000;">
            <p style="margin: 0;"><strong>Ack No:</strong> <span style="color: #334155;">${ackNo}</span></p>
            <p style="margin: 2px 0 0 0;"><strong>Ack Date:</strong> <span style="color: #334155;">${generatedDate}</span></p>
          </div>
        </div>
        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end;">
          <span style="font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #475569; margin-bottom: 4px;">e-Invoice / Verified</span>
          <div style="width: 64px; height: 64px; border: 1px solid #000000; padding: 2px; background: #ffffff; display: flex; align-items: center; justify-content: center;">
            ${QR_SVG}
          </div>
        </div>
      </div>

      <!-- Dual-Column Header Box: Recipient (Bill To) & Supplier (From) -->
      <div style="border: 1px solid #000000; margin-bottom: 12px; display: grid; grid-template-columns: 1fr 1fr;">
        <!-- Left: Recipient Details -->
        <div style="border-right: 1px solid #000000; padding: 10px 12px; font-size: 11px;">
          <h2 style="margin: 0 0 4px 0; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b;">Recipient (Bill To / Counterparty)</h2>
          <p style="margin: 0; font-size: 13px; font-weight: 800; color: #000000;">All Registered Financiers (${totalFinanciers})</p>
          <p style="margin: 2px 0 0 0; color: #334155;">Scope: ${filterText}</p>
          <p style="margin: 4px 0 0 0; font-family: monospace;"><strong>Active Facilities:</strong> ${totalActiveLoans}</p>
          <p style="margin: 2px 0 0 0;"><strong>State Code:</strong> ${compState}</p>
        </div>

        <!-- Right: Supplier (From) Details -->
        <div style="padding: 10px 12px; font-size: 11px;">
          <h2 style="margin: 0 0 4px 0; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b;">Supplier (From / Issuer)</h2>
          <p style="margin: 0; font-size: 13px; font-weight: 800; color: #000000;">${compName}</p>
          <p style="margin: 2px 0 0 0; color: #334155;">${compAddress}</p>
          <p style="margin: 4px 0 0 0; font-family: monospace;"><strong>GSTIN/UIN:</strong> ${compGstin}</p>
          <p style="margin: 2px 0 0 0;"><strong>State Code:</strong> ${compState}</p>
        </div>
      </div>

      <!-- 4-Column Document Metadata Grid -->
      <div style="border: 1px solid #000000; margin-bottom: 12px; display: grid; grid-template-columns: repeat(4, 1fr);">
        <div style="border-right: 1px solid #000000; padding: 6px 8px;">
          <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b;">Document No.</div>
          <div style="font-size: 12px; font-weight: 800; font-family: monospace; color: #000000; margin-top: 1px;">${ackNo}</div>
        </div>
        <div style="border-right: 1px solid #000000; padding: 6px 8px;">
          <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b;">Dated</div>
          <div style="font-size: 12px; font-weight: 800; color: #000000; margin-top: 1px;">${generatedDate}</div>
        </div>
        <div style="border-right: 1px solid #000000; padding: 6px 8px;">
          <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b;">Terms / Mode</div>
          <div style="font-size: 12px; font-weight: 800; color: #000000; margin-top: 1px;">Credit & Loans</div>
        </div>
        <div style="padding: 6px 8px;">
          <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b;">Instrument / Ref No.</div>
          <div style="font-size: 12px; font-weight: 800; font-family: monospace; color: #000000; margin-top: 1px;">FIN-REG-${totalFinanciers}</div>
        </div>
      </div>

      <!-- Itemized Facilities Table (Purchases Bordered Table Layout) -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px; border: 1px solid #000000; font-size: 11px;">
        <thead>
          <tr style="background: #f5f5f5; border-bottom: 1px solid #000000; text-transform: uppercase; font-size: 10px; font-weight: 700; color: #000000;">
            <th style="border-right: 1px solid #000000; padding: 6px 4px; width: 36px; text-align: center;">SI No.</th>
            <th style="border-right: 1px solid #000000; padding: 6px 8px; text-align: left;">Description of Financier / Credit Entity</th>
            <th style="border-right: 1px solid #000000; padding: 6px 8px; text-align: left;">Office Address</th>
            <th style="border-right: 1px solid #000000; padding: 6px 8px; text-align: center; width: 75px;">Rate</th>
            <th style="border-right: 1px solid #000000; padding: 6px 8px; text-align: center; width: 55px;">Notes</th>
            <th style="border-right: 1px solid #000000; padding: 6px 8px; text-align: center; width: 65px;">Status</th>
            <th style="padding: 6px 8px; text-align: right; width: 110px;">Outstanding (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="7" style="text-align: center; padding: 18px; color: #64748b; font-style: italic;">No financiers registered in Vastrams ERP.</td></tr>`}
        </tbody>
        <tfoot>
          <tr style="background: #f8fafc; border-top: 2px solid #000000; font-weight: 800; font-size: 11px;">
            <td colspan="4" style="border-right: 1px solid #000000; padding: 8px 10px; text-transform: uppercase; color: #000000;">
              Total Outstanding Summary (${totalFinanciers} Financiers)
            </td>
            <td style="border-right: 1px solid #000000; padding: 8px 6px; text-align: center; color: #000000;">${totalActiveLoans}</td>
            <td style="border-right: 1px solid #000000; padding: 8px 6px; text-align: center; color: #000000;">—</td>
            <td style="padding: 8px 8px; text-align: right; color: #000000; font-size: 12px; font-family: monospace;">
              ${fmtCurrency(totalOutstanding)}
            </td>
          </tr>
        </tfoot>
      </table>

      <!-- Amount Chargeable in Words Box (Purchases Layout) -->
      <div style="border: 1px solid #000000; padding: 8px 10px; margin-bottom: 12px; font-size: 11px; background: #ffffff;">
        <span style="font-weight: 700; text-transform: uppercase; font-size: 9px; color: #64748b;">Amount Chargeable (in words):</span>
        <div style="font-weight: 800; color: #000000; margin-top: 2px; font-size: 11.5px;">
          ${numberToWords(totalOutstanding)}
        </div>
      </div>

      <!-- Bottom Dual Box: Company Bank Details & Declaration on Left, Authorised Signatory on Right -->
      <div style="border: 1px solid #000000; display: grid; grid-template-columns: 1.4fr 1fr;">
        <div style="padding: 10px 12px; border-right: 1px solid #000000; font-size: 10px; color: #334155; line-height: 1.4;">
          <p style="margin: 0 0 4px 0; font-weight: 700; text-transform: uppercase; font-size: 9px; color: #64748b;">Company Bank Details:</p>
          <p style="margin: 0;"><strong>Bank Name:</strong> ${bankName}</p>
          <p style="margin: 1px 0 0 0;"><strong>A/C No:</strong> <span style="font-family: monospace;">${bankAccount}</span></p>
          <p style="margin: 1px 0 0 0;"><strong>Branch & IFS Code:</strong> <span style="font-family: monospace;">${bankIFSC}</span></p>
          <div style="margin-top: 8px; padding-top: 6px; border-top: 1px dashed #cbd5e1; font-size: 9px; color: #64748b;">
            <strong>Declaration:</strong> We declare that this document reflects the actual transactions recorded in the Vastrams ERP system and that all particulars are true and correct. Certified for record-keeping and statutory reconciliation.
          </div>
        </div>

        <div style="padding: 10px 12px; display: flex; flex-direction: column; justify-content: space-between; text-align: right; background: #fafafa;">
          <div>
            <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #000000;">For ${compName}</span>
          </div>
          <div style="margin-top: 40px; text-align: center;">
            <div style="border-bottom: 1px solid #000000; width: 140px; margin: 0 0 4px auto;"></div>
            <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #000000;">Authorized Signatory</span>
          </div>
        </div>
      </div>

    </div>
  `
}

/**
 * Builds Purchases-style box-bordered HTML document for Financier Profile Statement
 */
export function buildFinancierProfileHtml({ profile = {}, loans = [], companyProfile = {} }) {
  const compName = companyProfile.businessName || 'Vastrams'
  const compAddress = companyProfile.address || '123 Main St, Surat, Gujarat'
  const compGstin = companyProfile.gstin || '24AAAAA0000A1Z0'
  const compState = (compGstin || '24').substring(0, 2)
  const bankName = companyProfile.bankName || 'HDFC Bank'
  const bankAccount = companyProfile.bankAccount || '50200012345678'
  const bankIFSC = companyProfile.bankIFSC || 'HDFC0001234'

  const generatedDate = getTodayDateString()
  const generatedAt = getFormattedTimestamp()
  const ackNo = getAckNo('LN')

  const totalLoans = loans.length
  const totalLoaned = loans.reduce((s, l) => s + (l.amount || 0), 0)
  const totalPaid = loans.reduce((s, l) => s + (l.paid || 0), 0)
  const totalOutstanding = loans.reduce((s, l) => s + (l.outstanding || 0), 0)

  const rowsHtml = loans.map((l, idx) => {
    const dDate = l.date ? formatDateDisplay(l.date) : '—'
    const mDate = l.maturityDate ? formatDateDisplay(l.maturityDate) : '—'
    const rateStr = l.interestRate !== null && l.interestRate !== undefined && !isNaN(l.interestRate) ? `${l.interestRate}% p.a.` : '—'

    return `
      <tr style="border-bottom: 1px solid #000000;">
        <td style="border-right: 1px solid #000000; padding: 6px 8px; text-align: center; font-size: 11px;">${idx + 1}</td>
        <td style="border-right: 1px solid #000000; padding: 6px 8px; font-family: monospace; font-weight: 700; color: #000000; font-size: 11px;">#${l.noteNo || '—'}</td>
        <td style="border-right: 1px solid #000000; padding: 6px 8px; font-size: 11px; white-space: nowrap;">${dDate}</td>
        <td style="border-right: 1px solid #000000; padding: 6px 8px; font-size: 11px; white-space: nowrap;">${mDate}</td>
        <td style="border-right: 1px solid #000000; padding: 6px 8px; text-align: center; font-size: 11px;">${rateStr}</td>
        <td style="border-right: 1px solid #000000; padding: 6px 8px; text-align: right; font-weight: 600; font-family: monospace; font-size: 11px;">${fmtCurrency(l.amount)}</td>
        <td style="border-right: 1px solid #000000; padding: 6px 8px; text-align: right; font-weight: 600; font-family: monospace; font-size: 11px;">${fmtCurrency(l.paid)}</td>
        <td style="border-right: 1px solid #000000; padding: 6px 8px; text-align: center; font-size: 10px; font-weight: 700;">${l.status || 'Active'}</td>
        <td style="padding: 6px 8px; text-align: right; font-weight: 700; color: #000000; font-size: 11px; font-family: monospace;">${fmtCurrency(l.outstanding)}</td>
      </tr>
    `
  }).join('')

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #000000; background: #ffffff; padding: 16px 20px; width: 800px; box-sizing: border-box; line-height: 1.35; border: 2px solid #000000;">
      
      <!-- Top Title Box with e-Invoice QR (Purchases Layout) -->
      <div style="border: 1px solid #000000; background: #f8fafc; padding: 12px 14px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <div style="font-size: 20px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; color: #000000; margin-bottom: 2px;">
            ${compName.toUpperCase()}
          </div>
          <div style="font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #000000; margin-bottom: 6px;">
            FINANCIER LOAN STATEMENT
          </div>
          <div style="font-size: 11px; font-family: monospace; color: #000000;">
            <p style="margin: 0;"><strong>Ack No:</strong> <span style="color: #334155;">${ackNo}</span></p>
            <p style="margin: 2px 0 0 0;"><strong>Ack Date:</strong> <span style="color: #334155;">${generatedDate}</span></p>
          </div>
        </div>
        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end;">
          <span style="font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #475569; margin-bottom: 4px;">e-Invoice / Verified</span>
          <div style="width: 64px; height: 64px; border: 1px solid #000000; padding: 2px; background: #ffffff; display: flex; align-items: center; justify-content: center;">
            ${QR_SVG}
          </div>
        </div>
      </div>

      <!-- Dual-Column Header Box: Recipient (Bill To) & Supplier (From) -->
      <div style="border: 1px solid #000000; margin-bottom: 12px; display: grid; grid-template-columns: 1fr 1fr;">
        <!-- Left: Financier Recipient Details -->
        <div style="border-right: 1px solid #000000; padding: 10px 12px; font-size: 11px;">
          <h2 style="margin: 0 0 4px 0; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b;">Recipient (Bill To / Financier)</h2>
          <p style="margin: 0; font-size: 13px; font-weight: 800; color: #000000;">${profile.name || 'Financier'}</p>
          <p style="margin: 2px 0 0 0; color: #334155;">${profile.address || '—'}</p>
          ${profile.phone ? `<p style="margin: 2px 0 0 0; color: #475569;"><strong>Phone:</strong> ${profile.phone}</p>` : ''}
          <p style="margin: 4px 0 0 0; font-family: monospace;"><strong>Account Status:</strong> ${profile.status || 'Active'}</p>
          ${profile.defaultInterestRate !== undefined ? `<p style="margin: 2px 0 0 0;"><strong>Standard Rate:</strong> ${profile.defaultInterestRate}% p.a.</p>` : ''}
        </div>

        <!-- Right: Supplier (From) Details -->
        <div style="padding: 10px 12px; font-size: 11px;">
          <h2 style="margin: 0 0 4px 0; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b;">Supplier (From / Issuer)</h2>
          <p style="margin: 0; font-size: 13px; font-weight: 800; color: #000000;">${compName}</p>
          <p style="margin: 2px 0 0 0; color: #334155;">${compAddress}</p>
          <p style="margin: 4px 0 0 0; font-family: monospace;"><strong>GSTIN/UIN:</strong> ${compGstin}</p>
          <p style="margin: 2px 0 0 0;"><strong>State Code:</strong> ${compState}</p>
        </div>
      </div>

      <!-- 4-Column Document Metadata Grid -->
      <div style="border: 1px solid #000000; margin-bottom: 12px; display: grid; grid-template-columns: repeat(4, 1fr);">
        <div style="border-right: 1px solid #000000; padding: 6px 8px;">
          <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b;">Document No.</div>
          <div style="font-size: 12px; font-weight: 800; font-family: monospace; color: #000000; margin-top: 1px;">${ackNo}</div>
        </div>
        <div style="border-right: 1px solid #000000; padding: 6px 8px;">
          <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b;">Dated</div>
          <div style="font-size: 12px; font-weight: 800; color: #000000; margin-top: 1px;">${generatedDate}</div>
        </div>
        <div style="border-right: 1px solid #000000; padding: 6px 8px;">
          <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b;">Payment Mode</div>
          <div style="font-size: 12px; font-weight: 800; color: #000000; margin-top: 1px;">Bank Transfer / Credit</div>
        </div>
        <div style="padding: 6px 8px;">
          <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b;">Instrument / Ref No.</div>
          <div style="font-size: 12px; font-weight: 800; font-family: monospace; color: #000000; margin-top: 1px;">LN-STMT-${totalLoans}</div>
        </div>
      </div>

      <!-- Itemized Facilities Table (Purchases Bordered Table Layout) -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px; border: 1px solid #000000; font-size: 11px;">
        <thead>
          <tr style="background: #f5f5f5; border-bottom: 1px solid #000000; text-transform: uppercase; font-size: 10px; font-weight: 700; color: #000000;">
            <th style="border-right: 1px solid #000000; padding: 6px 4px; width: 36px; text-align: center;">SI No.</th>
            <th style="border-right: 1px solid #000000; padding: 6px 8px; text-align: left;">Note #</th>
            <th style="border-right: 1px solid #000000; padding: 6px 8px; text-align: left;">Drawdown Date</th>
            <th style="border-right: 1px solid #000000; padding: 6px 8px; text-align: left;">Maturity Date</th>
            <th style="border-right: 1px solid #000000; padding: 6px 8px; text-align: center;">Rate</th>
            <th style="border-right: 1px solid #000000; padding: 6px 8px; text-align: right;">Principal (₹)</th>
            <th style="border-right: 1px solid #000000; padding: 6px 8px; text-align: right;">Repaid (₹)</th>
            <th style="border-right: 1px solid #000000; padding: 6px 8px; text-align: center; width: 65px;">Status</th>
            <th style="padding: 6px 8px; text-align: right; width: 105px;">Pending (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="9" style="text-align: center; padding: 18px; color: #64748b; font-style: italic;">No loan notes recorded for this financier.</td></tr>`}
        </tbody>
        <tfoot>
          <tr style="background: #f8fafc; border-top: 2px solid #000000; font-weight: 800; font-size: 11px;">
            <td colspan="5" style="border-right: 1px solid #000000; padding: 8px 10px; text-transform: uppercase; color: #000000;">
              Totals (${totalLoans} Notes)
            </td>
            <td style="border-right: 1px solid #000000; padding: 8px 8px; text-align: right; font-family: monospace;">${fmtCurrency(totalLoaned)}</td>
            <td style="border-right: 1px solid #000000; padding: 8px 8px; text-align: right; font-family: monospace;">${fmtCurrency(totalPaid)}</td>
            <td style="border-right: 1px solid #000000; padding: 8px 6px; text-align: center;">—</td>
            <td style="padding: 8px 8px; text-align: right; color: #000000; font-size: 12px; font-family: monospace;">${fmtCurrency(totalOutstanding)}</td>
          </tr>
        </tfoot>
      </table>

      <!-- Amount Chargeable in Words Box (Purchases Layout) -->
      <div style="border: 1px solid #000000; padding: 8px 10px; margin-bottom: 12px; font-size: 11px; background: #ffffff;">
        <span style="font-weight: 700; text-transform: uppercase; font-size: 9px; color: #64748b;">Amount Chargeable (in words):</span>
        <div style="font-weight: 800; color: #000000; margin-top: 2px; font-size: 11.5px;">
          ${numberToWords(totalOutstanding)}
        </div>
      </div>

      <!-- Bottom Dual Box: Company Bank Details & Declaration on Left, Authorised Signatory on Right -->
      <div style="border: 1px solid #000000; display: grid; grid-template-columns: 1.4fr 1fr;">
        <div style="padding: 10px 12px; border-right: 1px solid #000000; font-size: 10px; color: #334155; line-height: 1.4;">
          <p style="margin: 0 0 4px 0; font-weight: 700; text-transform: uppercase; font-size: 9px; color: #64748b;">Company Bank Details:</p>
          <p style="margin: 0;"><strong>Bank Name:</strong> ${bankName}</p>
          <p style="margin: 1px 0 0 0;"><strong>A/C No:</strong> <span style="font-family: monospace;">${bankAccount}</span></p>
          <p style="margin: 1px 0 0 0;"><strong>Branch & IFS Code:</strong> <span style="font-family: monospace;">${bankIFSC}</span></p>
          <div style="margin-top: 8px; padding-top: 6px; border-top: 1px dashed #cbd5e1; font-size: 9px; color: #64748b;">
            <strong>Declaration:</strong> This statement summarizes principal drawdowns and repayment allocations for ${profile.name || 'this financier'}. Certified for commercial records.
          </div>
        </div>

        <div style="padding: 10px 12px; display: flex; flex-direction: column; justify-content: space-between; text-align: right; background: #fafafa;">
          <div>
            <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #000000;">For ${compName}</span>
          </div>
          <div style="margin-top: 40px; text-align: center;">
            <div style="border-bottom: 1px solid #000000; width: 140px; margin: 0 0 4px auto;"></div>
            <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #000000;">Authorized Signatory</span>
          </div>
        </div>
      </div>

    </div>
  `
}

/**
 * Builds Purchases-style box-bordered HTML document for Loans & Credit Facilities Register
 */
export function buildLoansRegisterHtml({ loans = [], companyProfile = {}, search = '', statusFilter = 'ALL', sortBy = '' }) {
  const compName = companyProfile.businessName || 'Vastrams'
  const compAddress = companyProfile.address || '123 Main St, Surat, Gujarat'
  const compGstin = companyProfile.gstin || '24AAAAA0000A1Z0'
  const compState = (compGstin || '24').substring(0, 2)
  const bankName = companyProfile.bankName || 'HDFC Bank'
  const bankAccount = companyProfile.bankAccount || '50200012345678'
  const bankIFSC = companyProfile.bankIFSC || 'HDFC0001234'

  const generatedDate = getTodayDateString()
  const generatedAt = getFormattedTimestamp()
  const ackNo = getAckNo('LN')

  const totalLoans = loans.length
  const totalPrincipal = loans.reduce((s, l) => s + (l.amount || 0), 0)
  const totalRepaid = loans.reduce((s, l) => s + (l.repaid || 0), 0)
  const totalPending = loans.reduce((s, l) => s + (l.pending || 0), 0)

  const rowsHtml = loans.map((l, idx) => {
    const dDate = l.loanDate ? formatDateDisplay(l.loanDate) : '—'
    const mDate = l.maturityDate ? formatDateDisplay(l.maturityDate) : '—'
    const rateStr = l.rate !== null && l.rate !== undefined && l.rate !== '' ? `${l.rate}% p.a.` : '—'

    return `
      <tr style="border-bottom: 1px solid #000000;">
        <td style="border-right: 1px solid #000000; padding: 6px 8px; text-align: center; font-size: 11px;">${idx + 1}</td>
        <td style="border-right: 1px solid #000000; padding: 6px 8px; font-family: monospace; font-weight: 700; color: #000000; font-size: 11px;">#${l.noteNo || '—'}</td>
        <td style="border-right: 1px solid #000000; padding: 6px 8px; font-weight: 700; color: #000000; font-size: 11px;">${l.financier || '—'}</td>
        <td style="border-right: 1px solid #000000; padding: 6px 8px; font-size: 11px; white-space: nowrap;">${dDate}</td>
        <td style="border-right: 1px solid #000000; padding: 6px 8px; font-size: 11px; white-space: nowrap;">${mDate}</td>
        <td style="border-right: 1px solid #000000; padding: 6px 8px; text-align: center; font-size: 11px;">${rateStr}</td>
        <td style="border-right: 1px solid #000000; padding: 6px 8px; text-align: right; font-weight: 600; font-family: monospace; font-size: 11px;">${fmtCurrency(l.amount)}</td>
        <td style="border-right: 1px solid #000000; padding: 6px 8px; text-align: right; font-weight: 600; font-family: monospace; font-size: 11px;">${fmtCurrency(l.repaid)}</td>
        <td style="border-right: 1px solid #000000; padding: 6px 8px; text-align: center; font-size: 10px; font-weight: 700;">${l.status || 'Active'}</td>
        <td style="padding: 6px 8px; text-align: right; font-weight: 700; color: #000000; font-size: 11px; font-family: monospace;">${fmtCurrency(l.pending)}</td>
      </tr>
    `
  }).join('')

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #000000; background: #ffffff; padding: 16px 20px; width: 850px; box-sizing: border-box; line-height: 1.35; border: 2px solid #000000;">
      
      <!-- Top Title Box with e-Invoice QR (Purchases Layout) -->
      <div style="border: 1px solid #000000; background: #f8fafc; padding: 12px 14px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <div style="font-size: 20px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; color: #000000; margin-bottom: 2px;">
            ${compName.toUpperCase()}
          </div>
          <div style="font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #000000; margin-bottom: 6px;">
            LOANS REGISTER
          </div>
          <div style="font-size: 11px; font-family: monospace; color: #000000;">
            <p style="margin: 0;"><strong>Ack No:</strong> <span style="color: #334155;">${ackNo}</span></p>
            <p style="margin: 2px 0 0 0;"><strong>Ack Date:</strong> <span style="color: #334155;">${generatedDate}</span></p>
          </div>
        </div>
        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end;">
          <span style="font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #475569; margin-bottom: 4px;">e-Invoice / Verified</span>
          <div style="width: 64px; height: 64px; border: 1px solid #000000; padding: 2px; background: #ffffff; display: flex; align-items: center; justify-content: center;">
            ${QR_SVG}
          </div>
        </div>
      </div>

      <!-- Dual-Column Header Box: Recipient (Bill To) & Supplier (From) -->
      <div style="border: 1px solid #000000; margin-bottom: 12px; display: grid; grid-template-columns: 1fr 1fr;">
        <!-- Left: Recipient Details -->
        <div style="border-right: 1px solid #000000; padding: 10px 12px; font-size: 11px;">
          <h2 style="margin: 0 0 4px 0; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b;">Recipient (Bill To / Counterparties)</h2>
          <p style="margin: 0; font-size: 13px; font-weight: 800; color: #000000;">All Loan & Credit Facilities (${totalLoans})</p>
          <p style="margin: 2px 0 0 0; color: #334155;">Status Filter: ${statusFilter} ${search ? `| Search: "${search}"` : ''}</p>
          <p style="margin: 4px 0 0 0; font-family: monospace;"><strong>Total Principal:</strong> ${fmtCurrency(totalPrincipal)}</p>
          <p style="margin: 2px 0 0 0;"><strong>State Code:</strong> ${compState}</p>
        </div>

        <!-- Right: Supplier (From) Details -->
        <div style="padding: 10px 12px; font-size: 11px;">
          <h2 style="margin: 0 0 4px 0; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b;">Supplier (From / Issuer)</h2>
          <p style="margin: 0; font-size: 13px; font-weight: 800; color: #000000;">${compName}</p>
          <p style="margin: 2px 0 0 0; color: #334155;">${compAddress}</p>
          <p style="margin: 4px 0 0 0; font-family: monospace;"><strong>GSTIN/UIN:</strong> ${compGstin}</p>
          <p style="margin: 2px 0 0 0;"><strong>State Code:</strong> ${compState}</p>
        </div>
      </div>

      <!-- 4-Column Document Metadata Grid -->
      <div style="border: 1px solid #000000; margin-bottom: 12px; display: grid; grid-template-columns: repeat(4, 1fr);">
        <div style="border-right: 1px solid #000000; padding: 6px 8px;">
          <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b;">Document No.</div>
          <div style="font-size: 12px; font-weight: 800; font-family: monospace; color: #000000; margin-top: 1px;">${ackNo}</div>
        </div>
        <div style="border-right: 1px solid #000000; padding: 6px 8px;">
          <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b;">Dated</div>
          <div style="font-size: 12px; font-weight: 800; color: #000000; margin-top: 1px;">${generatedDate}</div>
        </div>
        <div style="border-right: 1px solid #000000; padding: 6px 8px;">
          <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b;">Payment Mode</div>
          <div style="font-size: 12px; font-weight: 800; color: #000000; margin-top: 1px;">Bank Credit / Cheque</div>
        </div>
        <div style="padding: 6px 8px;">
          <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b;">Instrument / Ref No.</div>
          <div style="font-size: 12px; font-weight: 800; font-family: monospace; color: #000000; margin-top: 1px;">LN-REG-${totalLoans}</div>
        </div>
      </div>

      <!-- Itemized Facilities Table (Purchases Bordered Table Layout) -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px; border: 1px solid #000000; font-size: 11px;">
        <thead>
          <tr style="background: #f5f5f5; border-bottom: 1px solid #000000; text-transform: uppercase; font-size: 10px; font-weight: 700; color: #000000;">
            <th style="border-right: 1px solid #000000; padding: 6px 4px; width: 34px; text-align: center;">SI No.</th>
            <th style="border-right: 1px solid #000000; padding: 6px 8px; text-align: left;">Note #</th>
            <th style="border-right: 1px solid #000000; padding: 6px 8px; text-align: left;">Financier</th>
            <th style="border-right: 1px solid #000000; padding: 6px 8px; text-align: left;">Drawdown Date</th>
            <th style="border-right: 1px solid #000000; padding: 6px 8px; text-align: left;">Maturity Date</th>
            <th style="border-right: 1px solid #000000; padding: 6px 8px; text-align: center; width: 65px;">Rate</th>
            <th style="border-right: 1px solid #000000; padding: 6px 8px; text-align: right;">Principal (₹)</th>
            <th style="border-right: 1px solid #000000; padding: 6px 8px; text-align: right;">Repaid (₹)</th>
            <th style="border-right: 1px solid #000000; padding: 6px 8px; text-align: center; width: 60px;">Status</th>
            <th style="padding: 6px 8px; text-align: right; width: 105px;">Pending (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="10" style="text-align: center; padding: 18px; color: #64748b; font-style: italic;">No loans match the current selection.</td></tr>`}
        </tbody>
        <tfoot>
          <tr style="background: #f8fafc; border-top: 2px solid #000000; font-weight: 800; font-size: 11px;">
            <td colspan="6" style="border-right: 1px solid #000000; padding: 8px 10px; text-transform: uppercase; color: #000000;">
              Totals (${totalLoans} Facilities)
            </td>
            <td style="border-right: 1px solid #000000; padding: 8px 8px; text-align: right; font-family: monospace;">${fmtCurrency(totalPrincipal)}</td>
            <td style="border-right: 1px solid #000000; padding: 8px 8px; text-align: right; font-family: monospace;">${fmtCurrency(totalRepaid)}</td>
            <td style="border-right: 1px solid #000000; padding: 8px 6px; text-align: center;">—</td>
            <td style="padding: 8px 8px; text-align: right; color: #000000; font-size: 12px; font-family: monospace;">${fmtCurrency(totalPending)}</td>
          </tr>
        </tfoot>
      </table>

      <!-- Amount Chargeable in Words Box (Purchases Layout) -->
      <div style="border: 1px solid #000000; padding: 8px 10px; margin-bottom: 12px; font-size: 11px; background: #ffffff;">
        <span style="font-weight: 700; text-transform: uppercase; font-size: 9px; color: #64748b;">Amount Chargeable (in words):</span>
        <div style="font-weight: 800; color: #000000; margin-top: 2px; font-size: 11.5px;">
          ${numberToWords(totalPending)}
        </div>
      </div>

      <!-- Bottom Dual Box: Company Bank Details & Declaration on Left, Authorised Signatory on Right -->
      <div style="border: 1px solid #000000; display: grid; grid-template-columns: 1.4fr 1fr;">
        <div style="padding: 10px 12px; border-right: 1px solid #000000; font-size: 10px; color: #334155; line-height: 1.4;">
          <p style="margin: 0 0 4px 0; font-weight: 700; text-transform: uppercase; font-size: 9px; color: #64748b;">Company Bank Details:</p>
          <p style="margin: 0;"><strong>Bank Name:</strong> ${bankName}</p>
          <p style="margin: 1px 0 0 0;"><strong>A/C No:</strong> <span style="font-family: monospace;">${bankAccount}</span></p>
          <p style="margin: 1px 0 0 0;"><strong>Branch & IFS Code:</strong> <span style="font-family: monospace;">${bankIFSC}</span></p>
          <div style="margin-top: 8px; padding-top: 6px; border-top: 1px dashed #cbd5e1; font-size: 9px; color: #64748b;">
            <strong>Declaration:</strong> Certified register of financial notes and loan exposures as recorded in Vastrams database. All particulars are true and correct.
          </div>
        </div>

        <div style="padding: 10px 12px; display: flex; flex-direction: column; justify-content: space-between; text-align: right; background: #fafafa;">
          <div>
            <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #000000;">For ${compName}</span>
          </div>
          <div style="margin-top: 40px; text-align: center;">
            <div style="border-bottom: 1px solid #000000; width: 140px; margin: 0 0 4px auto;"></div>
            <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #000000;">Authorized Signatory</span>
          </div>
        </div>
      </div>

    </div>
  `
}

/**
 * Builds Purchases-style box-bordered HTML document for Financier Repayments Register
 */
export function buildFinancierRepaymentsHtml({ repayments = [], companyProfile = {}, search = '', modeFilter = 'ALL' }) {
  const compName = companyProfile.businessName || 'Vastrams'
  const compAddress = companyProfile.address || '123 Main St, Surat, Gujarat'
  const compGstin = companyProfile.gstin || '24AAAAA0000A1Z0'
  const compState = (compGstin || '24').substring(0, 2)
  const bankName = companyProfile.bankName || 'HDFC Bank'
  const bankAccount = companyProfile.bankAccount || '50200012345678'
  const bankIFSC = companyProfile.bankIFSC || 'HDFC0001234'

  const generatedDate = getTodayDateString()
  const generatedAt = getFormattedTimestamp()
  const ackNo = getAckNo('REP')

  const totalRepayments = repayments.length
  const totalRepaid = repayments.reduce((s, r) => s + (r.amount || 0), 0)

  const rowsHtml = repayments.map((r, idx) => {
    const rDate = r.date ? formatDateDisplay(r.date) : '—'

    return `
      <tr style="border-bottom: 1px solid #000000;">
        <td style="border-right: 1px solid #000000; padding: 6px 8px; text-align: center; font-size: 11px;">${idx + 1}</td>
        <td style="border-right: 1px solid #000000; padding: 6px 8px; font-family: monospace; font-weight: 700; color: #000000; font-size: 11px;">${r.ref || '—'}</td>
        <td style="border-right: 1px solid #000000; padding: 6px 8px; font-weight: 700; color: #000000; font-size: 11px;">${r.financier || '—'}</td>
        <td style="border-right: 1px solid #000000; padding: 6px 8px; font-size: 11px; white-space: nowrap;">${rDate}</td>
        <td style="border-right: 1px solid #000000; padding: 6px 8px; text-align: center; font-size: 11px;">${r.mode || 'Bank Transfer'}</td>
        <td style="border-right: 1px solid #000000; padding: 6px 8px; color: #334155; font-size: 10px; max-width: 180px; word-break: break-word;">${r.remarks || '—'}</td>
        <td style="padding: 6px 8px; text-align: right; font-weight: 700; color: #000000; font-size: 11px; font-family: monospace;">${fmtCurrency(r.amount)}</td>
      </tr>
    `
  }).join('')

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #000000; background: #ffffff; padding: 16px 20px; width: 800px; box-sizing: border-box; line-height: 1.35; border: 2px solid #000000;">
      
      <!-- Top Title Box with e-Invoice QR (Purchases Layout) -->
      <div style="border: 1px solid #000000; background: #f8fafc; padding: 12px 14px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <div style="font-size: 20px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; color: #000000; margin-bottom: 2px;">
            ${compName.toUpperCase()}
          </div>
          <div style="font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #000000; margin-bottom: 6px;">
            FINANCIER REPAYMENTS
          </div>
          <div style="font-size: 11px; font-family: monospace; color: #000000;">
            <p style="margin: 0;"><strong>Ack No:</strong> <span style="color: #334155;">${ackNo}</span></p>
            <p style="margin: 2px 0 0 0;"><strong>Ack Date:</strong> <span style="color: #334155;">${generatedDate}</span></p>
          </div>
        </div>
        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end;">
          <span style="font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #475569; margin-bottom: 4px;">e-Invoice / Verified</span>
          <div style="width: 64px; height: 64px; border: 1px solid #000000; padding: 2px; background: #ffffff; display: flex; align-items: center; justify-content: center;">
            ${QR_SVG}
          </div>
        </div>
      </div>

      <!-- Dual-Column Header Box: Recipient (Bill To) & Supplier (From) -->
      <div style="border: 1px solid #000000; margin-bottom: 12px; display: grid; grid-template-columns: 1fr 1fr;">
        <!-- Left: Recipient Details -->
        <div style="border-right: 1px solid #000000; padding: 10px 12px; font-size: 11px;">
          <h2 style="margin: 0 0 4px 0; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b;">Recipient (Bill To / Counterparty)</h2>
          <p style="margin: 0; font-size: 13px; font-weight: 800; color: #000000;">All Financier Repayments (${totalRepayments})</p>
          <p style="margin: 2px 0 0 0; color: #334155;">Payment Mode Filter: ${modeFilter} ${search ? `| Search: "${search}"` : ''}</p>
          <p style="margin: 4px 0 0 0; font-family: monospace;"><strong>Total Settled:</strong> ${fmtCurrency(totalRepaid)}</p>
          <p style="margin: 2px 0 0 0;"><strong>State Code:</strong> ${compState}</p>
        </div>

        <!-- Right: Supplier (From) Details -->
        <div style="padding: 10px 12px; font-size: 11px;">
          <h2 style="margin: 0 0 4px 0; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b;">Supplier (From / Issuer)</h2>
          <p style="margin: 0; font-size: 13px; font-weight: 800; color: #000000;">${compName}</p>
          <p style="margin: 2px 0 0 0; color: #334155;">${compAddress}</p>
          <p style="margin: 4px 0 0 0; font-family: monospace;"><strong>GSTIN/UIN:</strong> ${compGstin}</p>
          <p style="margin: 2px 0 0 0;"><strong>State Code:</strong> ${compState}</p>
        </div>
      </div>

      <!-- 4-Column Document Metadata Grid -->
      <div style="border: 1px solid #000000; margin-bottom: 12px; display: grid; grid-template-columns: repeat(4, 1fr);">
        <div style="border-right: 1px solid #000000; padding: 6px 8px;">
          <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b;">Document No.</div>
          <div style="font-size: 12px; font-weight: 800; font-family: monospace; color: #000000; margin-top: 1px;">${ackNo}</div>
        </div>
        <div style="border-right: 1px solid #000000; padding: 6px 8px;">
          <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b;">Dated</div>
          <div style="font-size: 12px; font-weight: 800; color: #000000; margin-top: 1px;">${generatedDate}</div>
        </div>
        <div style="border-right: 1px solid #000000; padding: 6px 8px;">
          <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b;">Payment Mode</div>
          <div style="font-size: 12px; font-weight: 800; color: #000000; margin-top: 1px;">Bank Transfer / Cheque</div>
        </div>
        <div style="padding: 6px 8px;">
          <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b;">Instrument / Ref No.</div>
          <div style="font-size: 12px; font-weight: 800; font-family: monospace; color: #000000; margin-top: 1px;">REP-REG-${totalRepayments}</div>
        </div>
      </div>

      <!-- Itemized Table (Purchases Bordered Table Layout) -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px; border: 1px solid #000000; font-size: 11px;">
        <thead>
          <tr style="background: #f5f5f5; border-bottom: 1px solid #000000; text-transform: uppercase; font-size: 10px; font-weight: 700; color: #000000;">
            <th style="border-right: 1px solid #000000; padding: 6px 4px; width: 36px; text-align: center;">SI No.</th>
            <th style="border-right: 1px solid #000000; padding: 6px 8px; text-align: left;">Ref #</th>
            <th style="border-right: 1px solid #000000; padding: 6px 8px; text-align: left;">Financier</th>
            <th style="border-right: 1px solid #000000; padding: 6px 8px; text-align: left;">Repayment Date</th>
            <th style="border-right: 1px solid #000000; padding: 6px 8px; text-align: center;">Mode</th>
            <th style="border-right: 1px solid #000000; padding: 6px 8px; text-align: left;">Remarks / Notes</th>
            <th style="padding: 6px 8px; text-align: right; width: 120px;">Amount Repaid (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="7" style="text-align: center; padding: 18px; color: #64748b; font-style: italic;">No repayments match the current filters.</td></tr>`}
        </tbody>
        <tfoot>
          <tr style="background: #f8fafc; border-top: 2px solid #000000; font-weight: 800; font-size: 11px;">
            <td colspan="6" style="border-right: 1px solid #000000; padding: 8px 10px; text-transform: uppercase; color: #000000;">
              Totals (${totalRepayments} Vouchers)
            </td>
            <td style="padding: 8px 8px; text-align: right; color: #000000; font-size: 12px; font-family: monospace;">
              ${fmtCurrency(totalRepaid)}
            </td>
          </tr>
        </tfoot>
      </table>

      <!-- Amount Chargeable in Words Box (Purchases Layout) -->
      <div style="border: 1px solid #000000; padding: 8px 10px; margin-bottom: 12px; font-size: 11px; background: #ffffff;">
        <span style="font-weight: 700; text-transform: uppercase; font-size: 9px; color: #64748b;">Amount Chargeable (in words):</span>
        <div style="font-weight: 800; color: #000000; margin-top: 2px; font-size: 11.5px;">
          ${numberToWords(totalRepaid)}
        </div>
      </div>

      <!-- Bottom Dual Box: Company Bank Details & Declaration on Left, Authorised Signatory on Right -->
      <div style="border: 1px solid #000000; display: grid; grid-template-columns: 1.4fr 1fr;">
        <div style="padding: 10px 12px; border-right: 1px solid #000000; font-size: 10px; color: #334155; line-height: 1.4;">
          <p style="margin: 0 0 4px 0; font-weight: 700; text-transform: uppercase; font-size: 9px; color: #64748b;">Company Bank Details:</p>
          <p style="margin: 0;"><strong>Bank Name:</strong> ${bankName}</p>
          <p style="margin: 1px 0 0 0;"><strong>A/C No:</strong> <span style="font-family: monospace;">${bankAccount}</span></p>
          <p style="margin: 1px 0 0 0;"><strong>Branch & IFS Code:</strong> <span style="font-family: monospace;">${bankIFSC}</span></p>
          <div style="margin-top: 8px; padding-top: 6px; border-top: 1px dashed #cbd5e1; font-size: 9px; color: #64748b;">
            <strong>Declaration:</strong> Certified register of loan settlements and repayments recorded in Vastrams database. All particulars are true and correct.
          </div>
        </div>

        <div style="padding: 10px 12px; display: flex; flex-direction: column; justify-content: space-between; text-align: right; background: #fafafa;">
          <div>
            <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #000000;">For ${compName}</span>
          </div>
          <div style="margin-top: 40px; text-align: center;">
            <div style="border-bottom: 1px solid #000000; width: 140px; margin: 0 0 4px auto;"></div>
            <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #000000;">Authorized Signatory</span>
          </div>
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
