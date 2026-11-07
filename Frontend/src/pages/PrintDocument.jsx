import React, { useState, useEffect } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer, Download } from 'lucide-react'
import api from '../utils/api'
import { generateAckNumber, formatSlashDate, formatPaymentMode, downloadInvoicePdf, generatePdfFilename } from '../components/PrintPreviewModal'

// English word spelling utility for currencies with Rupees & Paise support
function numberToWords(num) {
  if (num === null || num === undefined || isNaN(num)) return '';
  const val = Number(num);
  const rupees = Math.floor(val);
  const paise = Math.round((val - rupees) * 100);

  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  function convert(n) {
    if (n.toString().length > 9) return 'overflow';
    let match = ('000000000' + n).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!match) return ''; 
    let str = '';
    str += match[1] != 0 ? (a[Number(match[1])] || b[match[1][0]] + ' ' + a[match[1][1]]) + 'Crore ' : '';
    str += match[2] != 0 ? (a[Number(match[2])] || b[match[2][0]] + ' ' + a[match[2][1]]) + 'Lakh ' : '';
    str += match[3] != 0 ? (a[Number(match[3])] || b[match[3][0]] + ' ' + a[match[3][1]]) + 'Thousand ' : '';
    str += match[4] != 0 ? (a[Number(match[4])] || b[match[4][0]] + ' ' + a[match[4][1]]) + 'Hundred ' : '';
    str += match[5] != 0 ? ((str !== '') ? 'and ' : '') + (a[Number(match[5])] || b[match[5][0]] + ' ' + a[match[5][1]]) : '';
    return str.trim();
  }

  let rupeeWords = convert(rupees);
  let result = rupeeWords ? `Indian Rupee ${rupeeWords}` : 'Indian Rupee Zero';
  if (paise > 0) {
    let paiseWords = convert(paise);
    result += ` and ${paiseWords} Paise`;
  }
  result += ' Only';
  return result;
}

const fmt = (v) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

export function PrintDocument() {
  const { type, id } = useParams()
  const navigate = useNavigate()
  const [doc, setDoc] = useState(null)
  const [profile, setProfile] = useState(null)
  const [template, setTemplate] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const profileRes = await api.get('/settings/profile')
        const prof = profileRes?.data || {
          businessName: 'Vastrams',
          address: '123 Main St, Surat, Gujarat',
          gstin: '24AAAAA0000A1Z0',
          phone: '9876543210',
          email: 'admin@vastrams.in'
        }
        setProfile(prof)

        try {
          const tmplRes = await api.get('/settings/invoice-template')
          if (tmplRes?.data) setTemplate(tmplRes.data)
          else setTemplate(prof?.invoiceTemplates || {})
        } catch {
          setTemplate(prof?.invoiceTemplates || {})
        }

        let endpoint = ''
        if (type === 'bill') {
          endpoint = `/bills/${id}`
        } else if (type === 'payment') {
          endpoint = `/payments/${id}`
        } else if (type === 'loan') {
          endpoint = `/loans/${id}`
        } else if (type === 'repayment') {
          endpoint = `/loans/repayments/${id}`
        } else {
          throw new Error('Invalid document type')
        }

        const data = await api.get(endpoint)
        setDoc(data)
        setError(null)
      } catch (err) {
        setError(err.message || 'Failed to fetch document details')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [type, id])

  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [pdfError, setPdfError] = useState(null)

  const handlePrint = async () => {
    try {
      setDownloadingPdf(true)
      setPdfError(null)

      const targetElement = document.querySelector('.print-container') || document.querySelector('.printable-preview-content')
      if (!targetElement) {
        throw new Error('Document preview element not found')
      }

      const vendorName = partyName || doc?.vendorId?.name || ''
      const filename = generatePdfFilename({
        type,
        fields: { title, recipientName: vendorName, supplierName: vendorName, docDate: docDateStr },
        doc
      })
      await downloadInvoicePdf(targetElement, filename)
    } catch (err) {
      console.error('Failed to generate and download PDF:', err)
      setPdfError('Failed to generate PDF. Please try again.')
    } finally {
      setDownloadingPdf(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-100">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  if (error || !doc) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 p-4">
        <div className="bg-white p-6 rounded-xl shadow-md max-w-md w-full text-center">
          <p className="text-red-500 font-semibold text-lg mb-4">{error || 'Document not found'}</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  let title = 'Document'
  let documentNo = '—'
  let documentDate = '—'
  let partyName = '—'
  let partyAddress = '—'
  let partyGstin = '—'
  let totalAmount = 0
  let mode = '—'
  let refNum = '—'
  let qrData = ''
  let loanInterestRate = 0

  let isGstApplicable = false
  let taxableValue = 0
  let cgstAmount = 0
  let sgstAmount = 0
  let igstAmount = 0
  let cgstRate = 0
  let sgstRate = 0
  let igstRate = 0
  let stateCodeSupplier = ''
  let stateCodeRecipient = ''

  if (type === 'bill') {
    title = 'Tax Invoice'
    const billObj = doc
    documentNo = billObj.billNumber || '—'
    documentDate = billObj.billDate ? new Date(billObj.billDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
    partyName = billObj.vendorId?.name || '—'
    partyAddress = billObj.vendorId?.address || '—'
    partyGstin = billObj.vendorId?.gstin || '—'
    totalAmount = billObj.amount || 0
    mode = 'Credit (Outstanding)'
    refNum = '—'

    const billTaxRate = Number(billObj.taxRate || billObj.gstRate || 0)
    if (billTaxRate > 0) {
      isGstApplicable = true
      taxableValue = totalAmount / (1 + billTaxRate / 100)
      const totalTax = totalAmount - taxableValue
      stateCodeSupplier = (partyGstin || '').trim().substring(0, 2)
      stateCodeRecipient = (profile.gstin || '24').trim().substring(0, 2)

      if (stateCodeSupplier && stateCodeRecipient && stateCodeSupplier !== stateCodeRecipient) {
        igstRate = billTaxRate
        igstAmount = totalTax
      } else {
        cgstRate = billTaxRate / 2
        sgstRate = billTaxRate / 2
        cgstAmount = totalTax / 2
        sgstAmount = totalTax / 2
      }
    } else {
      isGstApplicable = false
      taxableValue = totalAmount
      cgstAmount = 0
      sgstAmount = 0
      igstAmount = 0
    }

    qrData = `GSTIN_SUP:${partyGstin}|GSTIN_REC:${profile.gstin}|INV_NO:${documentNo}|DATE:${documentDate}|VAL:${totalAmount}`
  } else if (type === 'payment') {
    title = 'Payment Voucher'
    const payObj = doc
    documentNo = payObj.referenceNumber || '—'
    documentDate = payObj.paymentDate ? new Date(payObj.paymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
    partyName = payObj.vendorId?.name || '—'
    partyAddress = payObj.vendorId?.address || '—'
    partyGstin = payObj.vendorId?.gstin || 'N/A'
    totalAmount = payObj.amount || 0
    mode = formatPaymentMode(payObj.paymentMode)
    refNum = payObj.referenceNumber || '—'
    qrData = `VOUCHER:${documentNo}|PAYEE:${partyName}|VAL:${totalAmount}|DATE:${documentDate}`
  } else if (type === 'loan') {
    title = 'Loan Drawdown Advice'
    const loanObj = doc.loan || doc
    documentNo = loanObj.loanReference || '—'
    documentDate = loanObj.drawdownDate ? new Date(loanObj.drawdownDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
    partyName = loanObj.financierId?.name || '—'
    partyAddress = '—'
    partyGstin = loanObj.financierId?.gstin || 'N/A'
    
    const principalAmount = loanObj.principalAmount || 0
    loanInterestRate = (loanObj.interestRate !== null && loanObj.interestRate !== undefined && !isNaN(loanObj.interestRate)) ? loanObj.interestRate : null
    let accruedInterest = 0
    if (loanObj.drawdownDate && loanInterestRate !== null && principalAmount) {
      let dDate = new Date(loanObj.drawdownDate)
      if (isNaN(dDate.getTime()) && typeof loanObj.drawdownDate === 'string') {
        const parts = loanObj.drawdownDate.split(/[-/\s]/)
        if (parts.length === 3) {
          const monthsMap = { JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5, JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11, Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 }
          const mIdx = monthsMap[parts[1]] !== undefined ? monthsMap[parts[1]] : Number(parts[1]) - 1
          const yNum = Number(parts[2])
          const dNum = Number(parts[0])
          // Handle both YYYY-MM-DD and DD-MM-YYYY
          if (yNum > 1000) {
            dDate = new Date(yNum, mIdx, dNum)
          } else {
            dDate = new Date(Number(parts[2]), mIdx, Number(parts[0]))
          }
        }
      }
      if (dDate && !isNaN(dDate.getTime())) {
        const daysElapsed = Math.max(0, Math.floor((new Date() - dDate) / (1000 * 60 * 60 * 24)))
        accruedInterest = (principalAmount * Number(loanInterestRate) * daysElapsed) / (100 * 365)
      }
    }
    totalAmount = Math.round((principalAmount + accruedInterest) * 100) / 100

    mode = loanObj.linkedChequeId ? 'Cheque' : 'Bank Transfer'
    refNum = loanObj.linkedChequeId?.chequeNumber || '—'
    qrData = `LOAN:${documentNo}|FINANCIER:${partyName}|VAL:${totalAmount}|RATE:${loanInterestRate}%`
  } else if (type === 'repayment') {
    title = 'Loan Repayment Receipt'
    const repayObj = doc
    documentNo = repayObj.referenceNumber || '—'
    documentDate = repayObj.repaymentDate ? new Date(repayObj.repaymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
    partyName = repayObj.loanId?.financierId?.name || '—'
    partyAddress = '—'
    partyGstin = repayObj.loanId?.financierId?.gstin || 'N/A'
    totalAmount = repayObj.amount || 0
    mode = formatPaymentMode(repayObj.repaymentMode)
    refNum = repayObj.referenceNumber || '—'
    qrData = `REPAYMENT:${documentNo}|FINANCIER:${partyName}|VAL:${totalAmount}|DATE:${documentDate}`
  }

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrData)}`

  useEffect(() => {
    if (doc) {
      const parts = [title]
      if (documentNo && documentNo !== '—') parts.push(documentNo)
      const formattedTitle = parts.join(' - ')
      document.title = formattedTitle

      const handleAfterPrint = () => {
        document.title = 'Vastrams - Vendor & Finance Management'
      }
      window.addEventListener('afterprint', handleAfterPrint)
      return () => {
        window.removeEventListener('afterprint', handleAfterPrint)
        document.title = 'Vastrams - Vendor & Finance Management'
      }
    }
  }, [doc, title, documentNo])

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-4 sm:px-6 print-root">
      {/* Single A4 Page Strict Print Styles */}
      <style dangerouslySetInnerHTML={{__html: `
        @page {
          size: A4 portrait;
          margin: 5mm;
        }
        @media print {
          /* 1. Hide non-print chrome */
          aside,
          header,
          nav,
          footer,
          .no-print {
            display: none !important;
          }
          /* 2. Ensure parent layout wrappers stay visible */
          html, body, #root, #root > div, .flex-1, main, motion.div {
            display: block !important;
            position: static !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-root {
            background-color: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            height: auto !important;
            display: block !important;
            overflow: visible !important;
          }
          .print-container {
            zoom: 1 !important;
            border: 2px solid #000000 !important;
            padding: 10px !important;
            margin: 0 auto !important;
            max-width: 100% !important;
            height: auto !important;
            box-shadow: none !important;
            background-color: #fff !important;
            page-break-after: avoid !important;
            page-break-before: avoid !important;
            break-after: avoid !important;
            break-before: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            box-sizing: border-box !important;
            display: block !important;
            overflow: visible !important;
          }
          div, table, tr, td, th, tbody {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .print-table th, .print-table td {
            border-color: #000000 !important;
            padding: 3px 6px !important;
          }
          .p-8 { padding: 10px !important; }
          .p-6 { padding: 8px !important; }
          .p-4 { padding: 6px !important; }
          .p-3 { padding: 5px !important; }
          .mb-4 { margin-bottom: 4px !important; }
          .mb-6 { margin-bottom: 6px !important; }
          .pb-4 { padding-bottom: 4px !important; }
        }
      `}} />

      <div className="max-w-[800px] mx-auto mb-6 flex justify-between items-center no-print">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center space-x-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition"
        >
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>
        <div className="flex items-center gap-3">
          {pdfError && <span className="text-xs font-semibold text-rose-600">{pdfError}</span>}
          <button
            onClick={handlePrint}
            disabled={downloadingPdf || loading}
            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium text-sm px-4 py-2 rounded-lg shadow-sm transition"
          >
            {downloadingPdf ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1" />
                <span>Downloading PDF...</span>
              </>
            ) : (
              <>
                <Download size={16} />
                <span>Print Document</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Document Frame */}
      <div className="print-container max-w-[800px] mx-auto bg-white border border-slate-300 rounded-xl shadow-lg p-8 text-black font-sans leading-tight">
        
        {/* e-Invoice Heading & QR Header */}
        <div className="flex justify-between items-start border-b border-black pb-4 mb-4">
          <div>
            <h1 className="text-xl font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400" style={{ color: '#00C896' }}>{title}</h1>
            <div className="mt-2 text-xs font-mono">
              <p>Ack No: <span className="font-semibold">{generateAckNumber(doc, type)}</span></p>
              <p>Ack Date: <span className="font-semibold">{formatSlashDate(new Date())}</span></p>
            </div>
          </div>
          <div className="text-right flex flex-col items-end">
            <span className="text-[10px] font-bold tracking-widest uppercase mb-1">e-Invoice</span>
            <img src={qrImageUrl} alt="QR Code" crossOrigin="anonymous" className="w-20 h-20 border border-black p-0.5" />
          </div>
        </div>

        {/* Merged Header Block: Recipient & Supplier + Bottom Document Metadata Row */}
        <div className="border border-black mb-4">
          <div className="grid grid-cols-2">
            {/* Left Column */}
            {template.swapRecipientSupplier ? (
              /* Supplier details box (From - LEFT) */
              <div className="border-r border-black p-3 text-xs space-y-1">
                <h2 className="font-bold text-[10px] uppercase text-slate-500 tracking-wider">Supplier (From)</h2>
                {type === 'bill' ? (
                  <>
                    <p className="font-bold text-sm">{partyName}</p>
                    <p className="whitespace-pre-line">{partyAddress}</p>
                    {partyGstin && <p className="font-mono mt-1 font-semibold">GSTIN/UIN: {partyGstin}</p>}
                    {stateCodeSupplier && <p>State Name: {stateCodeSupplier === '24' ? 'Gujarat' : stateCodeSupplier === '29' ? 'Karnataka' : 'Other'}, Code : {stateCodeSupplier}</p>}
                  </>
                ) : (
                  <>
                    <p className="font-bold text-sm">{profile.businessName}</p>
                    <p className="whitespace-pre-line">{profile.address}</p>
                    {profile.gstin && <p className="font-mono mt-1 font-semibold">GSTIN/UIN: {profile.gstin}</p>}
                    <p>State Name: Gujarat, Code : 24</p>
                  </>
                )}
              </div>
            ) : (
              /* Recipient details box (Bill To - LEFT) */
              <div className="border-r border-black p-3 text-xs space-y-1">
                <h2 className="font-bold text-[10px] uppercase text-slate-500 tracking-wider">Recipient (Bill To)</h2>
                {type === 'bill' ? (
                  <>
                    <p className="font-bold text-sm">{profile.businessName}</p>
                    <p className="whitespace-pre-line">{profile.address}</p>
                    {profile.gstin && <p className="font-mono mt-1 font-semibold">GSTIN/UIN: {profile.gstin}</p>}
                    <p>State Name: Gujarat, Code : 24</p>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-sm">{partyName}</p>
                    <p className="whitespace-pre-line">{partyAddress !== '—' ? partyAddress : 'N/A'}</p>
                    {partyGstin && partyGstin !== '—' && <p className="font-mono mt-1 font-semibold">GSTIN/UIN: {partyGstin}</p>}
                  </>
                )}
              </div>
            )}

            {/* Right Column */}
            {template.swapRecipientSupplier ? (
              /* Recipient details box (Bill To - RIGHT) */
              <div className="p-3 text-xs space-y-1">
                <h2 className="font-bold text-[10px] uppercase text-slate-500 tracking-wider">Recipient (Bill To)</h2>
                {type === 'bill' ? (
                  <>
                    <p className="font-bold text-sm">{profile.businessName}</p>
                    <p className="whitespace-pre-line">{profile.address}</p>
                    {profile.gstin && <p className="font-mono mt-1 font-semibold">GSTIN/UIN: {profile.gstin}</p>}
                    <p>State Name: Gujarat, Code : 24</p>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-sm">{partyName}</p>
                    <p className="whitespace-pre-line">{partyAddress !== '—' ? partyAddress : 'N/A'}</p>
                    {partyGstin && partyGstin !== '—' && <p className="font-mono mt-1 font-semibold">GSTIN/UIN: {partyGstin}</p>}
                  </>
                )}
              </div>
            ) : (
              /* Supplier details box (From - RIGHT) */
              <div className="p-3 text-xs space-y-1">
                <h2 className="font-bold text-[10px] uppercase text-slate-500 tracking-wider">Supplier (From)</h2>
                {type === 'bill' ? (
                  <>
                    <p className="font-bold text-sm">{partyName}</p>
                    <p className="whitespace-pre-line">{partyAddress}</p>
                    {partyGstin && <p className="font-mono mt-1 font-semibold">GSTIN/UIN: {partyGstin}</p>}
                    {stateCodeSupplier && <p>State Name: {stateCodeSupplier === '24' ? 'Gujarat' : stateCodeSupplier === '29' ? 'Karnataka' : 'Other'}, Code : {stateCodeSupplier}</p>}
                  </>
                ) : (
                  <>
                    <p className="font-bold text-sm">{profile.businessName}</p>
                    <p className="whitespace-pre-line">{profile.address}</p>
                    {profile.gstin && <p className="font-mono mt-1 font-semibold">GSTIN/UIN: {profile.gstin}</p>}
                    <p>State Name: Gujarat, Code : 24</p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Merged Bottom Row: 4 Metadata Columns */}
          <div className="grid grid-cols-4 border-t border-black text-xs">
            <div className="border-r border-black p-2.5">
              <p className="font-semibold text-slate-500 uppercase text-[9px]">Document No.</p>
              <p className="font-bold text-sm">{documentNo}</p>
            </div>
            <div className="border-r border-black p-2.5">
              <p className="font-semibold text-slate-500 uppercase text-[9px]">Dated</p>
              <p className="font-bold text-sm">{documentDate}</p>
            </div>
            <div className="border-r border-black p-2.5">
              <p className="font-semibold text-slate-500 uppercase text-[9px]">Payment Mode</p>
              <p className="font-bold text-sm">{mode}</p>
            </div>
            <div className="p-2.5">
              <p className="font-semibold text-slate-500 uppercase text-[9px]">Ref No. / Instrument</p>
              <p className="font-bold text-sm">{refNum !== '—' ? refNum : '—'}</p>
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <table className="print-table w-full border border-black mb-4 text-xs">
          <thead>
            <tr className="border-b border-black bg-slate-100 dark:bg-slate-700/80 text-slate-900 dark:text-slate-100">
              <th className="border-r border-black p-2 text-center text-slate-900 dark:text-slate-100 font-bold whitespace-nowrap" style={{ width: '40px', minWidth: '40px' }}>SI No.</th>
              <th className="border-r border-black p-2 text-left text-slate-900 dark:text-slate-100 font-bold">Description of Goods / Services</th>
              {isGstApplicable && <th className="border-r border-black p-2 text-center w-24 text-slate-900 dark:text-slate-100 font-bold">HSN/SAC</th>}
              <th className="border-r border-black p-2 text-center w-16 text-slate-900 dark:text-slate-100 font-bold">Quantity</th>
              <th className="border-r border-black p-2 text-right w-24 text-slate-900 dark:text-slate-100 font-bold">Rate</th>
              <th className="p-2 text-right w-28 text-slate-900 dark:text-slate-100 font-bold">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="align-top border-b border-black">
              <td className="border-r border-black p-2 text-center whitespace-nowrap" style={{ width: '40px', minWidth: '40px' }}>1</td>
              <td className="border-r border-black p-2 space-y-1">
                {type === 'bill' && (
                  <>
                    <p className="font-bold">Purchase Bill Settlement</p>
                    <p className="text-[10px] text-slate-500">Service rendered as per bill {documentNo}</p>
                  </>
                )}
                {type === 'payment' && (
                  <>
                    <p className="font-bold">Payment to {partyName}</p>
                    <p className="text-[10px] text-slate-500">Settled Outstanding payables via {mode}</p>
                  </>
                )}
                {type === 'loan' && (
                  <>
                    <p className="font-bold">Loan Drawdown Principal</p>
                    <p className="text-[10px] text-slate-500">Financier: {partyName} - Interest Rate: {loanInterestRate !== null ? `${loanInterestRate}%` : 'Not specified'}</p>
                  </>
                )}
                {type === 'repayment' && (
                  <>
                    <p className="font-bold">Loan Repayment Settlement</p>
                    <p className="text-[10px] text-slate-500">Repayment to {partyName} for Loan Drawdown Ref: {doc.loanId?.loanReference}</p>
                    <p className="text-[10px] text-slate-600 font-semibold mt-1">Principal Applied: ₹{fmt(doc.principalPaid || 0)} | Interest Applied: ₹{fmt(doc.interestPaid || 0)}</p>
                  </>
                )}
              </td>
              {isGstApplicable && <td className="border-r border-black p-2 text-center font-mono">9983</td>}
              <td className="border-r border-black p-2 text-center">1 No</td>
              <td className="border-r border-black p-2 text-right tabular-nums">
                {type === 'loan' ? (loanInterestRate !== null ? `${loanInterestRate}% p.a.` : '—') : (isGstApplicable ? `₹${fmt(taxableValue)}` : `₹${fmt(totalAmount)}`)}
              </td>
              <td className="p-2 text-right tabular-nums">
                ₹{isGstApplicable ? fmt(taxableValue) : fmt(totalAmount)}
              </td>
            </tr>

            {/* GST Breakdown lines (Bill only) */}
            {isGstApplicable && (
              <>
                {cgstAmount > 0 && (
                  <tr className="align-top border-b border-black">
                    <td className="border-r border-black p-1"></td>
                    <td className="border-r border-black p-1 text-right italic font-semibold" colSpan={isGstApplicable ? 4 : 3}>CGST @ {cgstRate}%</td>
                    <td className="p-1 text-right tabular-nums font-semibold">₹{fmt(cgstAmount)}</td>
                  </tr>
                )}
                {sgstAmount > 0 && (
                  <tr className="align-top border-b border-black">
                    <td className="border-r border-black p-1"></td>
                    <td className="border-r border-black p-1 text-right italic font-semibold" colSpan={isGstApplicable ? 4 : 3}>SGST @ {sgstRate}%</td>
                    <td className="p-1 text-right tabular-nums font-semibold">₹{fmt(sgstAmount)}</td>
                  </tr>
                )}
                {igstAmount > 0 && (
                  <tr className="align-top border-b border-black">
                    <td className="border-r border-black p-1"></td>
                    <td className="border-r border-black p-1 text-right italic font-semibold" colSpan={isGstApplicable ? 4 : 3}>IGST @ {igstRate}%</td>
                    <td className="p-1 text-right tabular-nums font-semibold">₹{fmt(igstAmount)}</td>
                  </tr>
                )}
              </>
            )}

            {/* Grand Total Row */}
            <tr className="bg-slate-100 dark:bg-slate-700/80 font-bold text-slate-900 dark:text-slate-100">
              <td className="border-r border-black p-2 text-center text-slate-900 dark:text-slate-100 font-bold" colSpan={isGstApplicable ? 3 : 2}>Total</td>
              <td className="border-r border-black p-2 text-center text-slate-900 dark:text-slate-100 font-bold">1 No</td>
              <td className="border-r border-black p-2 text-right"></td>
              <td className="p-2 text-right tabular-nums text-sm font-extrabold text-slate-900 dark:text-slate-100">₹{fmt(totalAmount)}</td>
            </tr>
          </tbody>
        </table>

        {/* Amount in words block */}
        <div className="border border-black p-3 text-xs mb-4">
          <p className="font-semibold text-slate-500 uppercase text-[9px] mb-1">Amount Chargeable (in words)</p>
          <p className="font-bold text-sm">{numberToWords(Math.round(totalAmount))}</p>
        </div>

        {/* GST Tax Breakdown Table (For Bill only) */}
        {isGstApplicable && (
          <table className="print-table w-full border border-black text-[10px] mb-4">
            <thead>
              <tr className="border-b border-black bg-slate-100 dark:bg-slate-700/80 text-slate-900 dark:text-slate-100 font-semibold text-center">
                <th className="border-r border-black p-1 text-slate-900 dark:text-slate-100 font-bold" rowSpan={2}>HSN/SAC</th>
                <th className="border-r border-black p-1 text-slate-900 dark:text-slate-100 font-bold" rowSpan={2}>Taxable Value</th>
                <th className="border-r border-black p-1 text-slate-900 dark:text-slate-100 font-bold" colSpan={2}>Central Tax</th>
                <th className="border-r border-black p-1 text-slate-900 dark:text-slate-100 font-bold" colSpan={2}>State Tax</th>
                {igstAmount > 0 && <th className="border-r border-black p-1 text-slate-900 dark:text-slate-100 font-bold" colSpan={2}>Integrated Tax</th>}
                <th className="p-1 text-slate-900 dark:text-slate-100 font-bold" rowSpan={2}>Total Tax Amount</th>
              </tr>
              <tr className="border-b border-black bg-slate-100 dark:bg-slate-700/80 text-slate-900 dark:text-slate-100 font-semibold text-center">
                <th className="border-r border-black p-1 text-slate-900 dark:text-slate-100 font-bold">Rate</th>
                <th className="border-r border-black p-1 text-slate-900 dark:text-slate-100 font-bold">Amount</th>
                <th className="border-r border-black p-1 text-slate-900 dark:text-slate-100 font-bold">Rate</th>
                <th className="border-r border-black p-1 text-slate-900 dark:text-slate-100 font-bold">Amount</th>
                {igstAmount > 0 && (
                  <>
                    <th className="border-r border-black p-1 text-slate-900 dark:text-slate-100 font-bold">Rate</th>
                    <th className="border-r border-black p-1 text-slate-900 dark:text-slate-100 font-bold">Amount</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              <tr className="text-center font-mono">
                <td className="border-r border-black p-1.5">9983</td>
                <td className="border-r border-black p-1.5 text-right tabular-nums">₹{fmt(taxableValue)}</td>
                <td className="border-r border-black p-1.5">{cgstRate}%</td>
                <td className="border-r border-black p-1.5 text-right tabular-nums">₹{fmt(cgstAmount)}</td>
                <td className="border-r border-black p-1.5">{sgstRate}%</td>
                <td className="border-r border-black p-1.5 text-right tabular-nums">₹{fmt(sgstAmount)}</td>
                {igstAmount > 0 && (
                  <>
                    <td className="border-r border-black p-1.5">{igstRate}%</td>
                    <td className="border-r border-black p-1.5 text-right tabular-nums">₹{fmt(igstAmount)}</td>
                  </>
                )}
                <td className="p-1.5 text-right tabular-nums font-semibold">₹{fmt(cgstAmount + sgstAmount + igstAmount)}</td>
              </tr>
              <tr className="text-center font-bold bg-slate-100 dark:bg-slate-700/80 text-slate-900 dark:text-slate-100 border-t border-black">
                <td className="border-r border-black p-1.5 text-slate-900 dark:text-slate-100">Total</td>
                <td className="border-r border-black p-1.5 text-right tabular-nums text-slate-900 dark:text-slate-100">₹{fmt(taxableValue)}</td>
                <td className="border-r border-black p-1.5 text-slate-900 dark:text-slate-100" colSpan={2}>₹{fmt(cgstAmount)}</td>
                <td className="border-r border-black p-1.5 text-slate-900 dark:text-slate-100" colSpan={2}>₹{fmt(sgstAmount)}</td>
                {igstAmount > 0 && <td className="border-r border-black p-1.5 text-slate-900 dark:text-slate-100" colSpan={2}>₹{fmt(igstAmount)}</td>}
                <td className="p-1.5 text-right tabular-nums text-slate-900 dark:text-slate-100">₹{fmt(cgstAmount + sgstAmount + igstAmount)}</td>
              </tr>
            </tbody>
          </table>
        )}

        {/* Declarations, Bank Details & Signature block */}
        <div className="border border-black text-xs">
          <div className="p-3 border-b border-black text-black">
            <p className="font-bold uppercase text-[9px] mb-1">Bank Details for NEFT / RTGS Transfer</p>
            <div className="grid grid-cols-2 gap-x-4 text-[10px] font-mono">
              <p><span className="font-semibold">Firm Name:</span> {profile?.businessName || 'Vastrams'}</p>
              <p><span className="font-semibold">Bank:</span> {profile?.bankName || (Array.isArray(profile?.banks) && profile.banks[0]) || 'HDFC Bank'}</p>
              <p><span className="font-semibold">A/C No:</span> {profile?.accountNo || '920010045812903'}</p>
              <p><span className="font-semibold">IFSC:</span> {profile?.ifscCode || 'HDFC0000240'}</p>
            </div>
          </div>
          <div className="grid grid-cols-2">
            <div className="border-r border-black p-3 space-y-2">
              <h3 className="font-bold underline">Declaration</h3>
              <p className="text-[10px] text-slate-500 leading-normal">
                We declare that this invoice shows the actual price of the goods / services described and that all particulars are true and correct.
              </p>
            </div>
            <div className="p-3 flex flex-col justify-between items-end h-28 text-right">
              <span className="font-bold text-[10px]">{partyName ? (partyName.trim().toLowerCase().startsWith('for ') ? partyName.trim() : `For ${partyName.trim()}`) : `For ${profile?.businessName || 'Vastrams'}`}</span>
              <div className="border-t border-slate-300 w-44 pt-1 font-semibold text-center text-[10px] uppercase text-slate-500 tracking-wider">
                Authorised Signatory
              </div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-[9px] text-slate-400 mt-4 uppercase tracking-widest no-print">
          This is a computer generated document and does not require a physical signature.
        </div>

      </div>
    </div>
  )
}

export default PrintDocument
