import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Printer, Download, CheckCircle2 } from 'lucide-react'
import api from '../utils/api'
import CustomDatePicker from './ui/CustomDatePicker'
import { toInputDate, fromInputDate } from '../utils/date'

// English word spelling utility for currencies with Rupees & Paise support
export function numberToWords(num) {
  if (num === null || num === undefined || isNaN(num)) return 'Indian Rupee Zero Only';
  const val = Number(num);
  if (val === 0) return 'Indian Rupee Zero Only';
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

// Format payment mode string (e.g. BANK_TRANSFER -> Bank Transfer)
export function formatPaymentMode(mode) {
  if (!mode) return '—'
  if (mode === 'BANK_TRANSFER') return 'Bank Transfer'
  if (mode === 'CASH') return 'Cash'
  if (mode === 'CHEQUE') return 'Cheque'
  if (mode === 'ONLINE') return 'Online'
  if (mode === 'OTHER') return 'Other'
  if (mode === 'NEFT') return 'NEFT'
  if (mode === 'RTGS') return 'RTGS'
  if (mode === 'UPI') return 'UPI'
  if (mode === 'IMPS') return 'IMPS'
  if (mode === 'NEFT_RTGS' || mode === 'NEFT / RTGS') return 'NEFT / RTGS'
  
  return String(mode)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
}

// Format date to DD/MON/YYYY (e.g. 05/AUG/2026)
export function formatSlashDate(d) {
  if (!d || d === '—') return '—'
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  let dateObj = d
  if (typeof d === 'string') {
    const trimmed = d.trim()
    if (/^\d{2}\/[A-Za-z]{3}\/\d{4}$/.test(trimmed)) {
      const parts = trimmed.split('/')
      return `${parts[0]}/${parts[1].toUpperCase()}/${parts[2]}`
    }
    const parts = trimmed.split(/[-/\s]/)
    if (parts.length === 3) {
      const monthsMap = { JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5, JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11, Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 }
      const monthIdx = monthsMap[parts[1]] !== undefined ? monthsMap[parts[1]] : Number(parts[1]) - 1
      dateObj = new Date(Number(parts[2]), monthIdx, Number(parts[0]))
    } else {
      dateObj = new Date(d)
    }
  }
  if (!dateObj || isNaN(dateObj.getTime())) return String(d)

  const day = String(dateObj.getDate()).padStart(2, '0')
  const month = months[dateObj.getMonth()]
  const year = dateObj.getFullYear()
  return `${day}/${month}/${year}`
}

// Ack Number algorithm: YYYYMM-[TAG]-[COUNTER] (ordered deterministically by date & reference)
export function generateAckNumber(doc, docType = 'ACK', explicitIndex = null) {
  if (doc?.ackNo) return doc.ackNo

  // Determine document date
  const docDateVal = doc?.billDate || doc?.paymentDate || doc?.drawdownDate || doc?.repaymentDate || doc?.createdAt || doc?.date
  const dateObj = docDateVal ? new Date(docDateVal) : new Date()
  const validDate = !isNaN(dateObj.getTime()) ? dateObj : new Date()

  const year = validDate.getFullYear()
  const month = String(validDate.getMonth() + 1).padStart(2, '0')
  const yyyymm = `${year}${month}`

  let seq = 1

  if (explicitIndex !== null && explicitIndex !== undefined && !isNaN(Number(explicitIndex))) {
    seq = Number(explicitIndex) + 1
  } else {
    // Search for sequence number inside billNumber, referenceNumber, loanReference, etc.
    const refStr = String(
      doc?.billNumber || doc?.referenceNumber || doc?.loanReference || doc?.voucherNo || doc?.docNo || ''
    ).trim()

    if (refStr) {
      const matches = refStr.match(/\d+/g)
      if (matches && matches.length > 0) {
        // Take the last group of numbers (usually sequence counter)
        const lastNumStr = matches[matches.length - 1]
        const parsed = parseInt(lastNumStr, 10)
        if (!isNaN(parsed) && parsed > 0) {
          seq = parsed
        }
      }
    }
  }

  const seqStr = String(seq).padStart(3, '0')
  const tag = (docType || 'ACK').toUpperCase().substring(0, 4)
  return `${yyyymm}-${tag}-${seqStr}`
}

const fmt = (v) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0)

function getPreviewBorders(settings) {
  const c = settings.borderColor || '#000000'
  switch (settings.borderStyle) {
    case 'borderless': return { outer: 'none', cell: 'none', bgHeader: 'transparent', labelColor: '#94a3b8' }
    case 'minimal':    return { outer: '1px solid #e2e8f0', cell: '1px solid #e2e8f0', bgHeader: '#ffffff', labelColor: '#94a3b8' }
    default:           return { outer: `2px solid ${c}`, cell: `1px solid ${c}`, bgHeader: '#f5f5f5', labelColor: '#475569' }
  }
}

export function generatePdfFilename({ type, fields = {}, doc = {} }) {
  let docType = 'Document'
  if (type === 'payment') docType = 'Payment_Voucher'
  else if (type === 'bill') docType = 'Tax_Invoice'
  else if (type === 'loan') docType = 'Loan_Drawdown'
  else if (type === 'repayment') docType = 'Loan_Repayment'
  else if (fields?.title) docType = fields.title.trim().replace(/\s+/g, '_')

  let vendorName = ''
  if (type === 'payment') {
    vendorName = fields?.recipientName || doc?.vendorId?.name || ''
  } else if (type === 'bill') {
    vendorName = fields?.supplierName || doc?.vendorId?.name || ''
  } else {
    vendorName = fields?.recipientName || fields?.supplierName || doc?.partyName || ''
  }

  // If vendorName is empty or matches Vastrams (the issuer), look up the other side
  if (!vendorName || vendorName.trim().toLowerCase() === 'vastrams') {
    if (fields?.recipientName && fields.recipientName.trim().toLowerCase() !== 'vastrams') {
      vendorName = fields.recipientName
    } else if (fields?.supplierName && fields.supplierName.trim().toLowerCase() !== 'vastrams') {
      vendorName = fields.supplierName
    } else {
      vendorName = 'Vendor'
    }
  }

  // Clean vendor name: remove invalid filename characters, replace whitespace with underscores
  const cleanVendor = vendorName
    .trim()
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Vendor'

  // Document Date in YYYY-MM-DD
  let dateStr = ''
  if (fields?.docDate) {
    dateStr = toInputDate(fields.docDate)
  }
  if (!dateStr && doc) {
    const raw = doc.paymentDate || doc.billDate || doc.drawdownDate || doc.repaymentDate || doc.date
    if (raw) dateStr = toInputDate(raw)
  }
  if (!dateStr) {
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    dateStr = `${y}-${m}-${d}`
  }

  return `${docType}_${cleanVendor}_${dateStr}.pdf`
}

export async function downloadInvoicePdf(element, filename, options = {}) {
  if (!element) {
    throw new Error('Document preview element not found')
  }

  // Unfocus active element to commit any in-progress contentEditable changes
  if (typeof document !== 'undefined' && document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur()
  }

  // Wait for any images (e.g. QR code) inside element to finish loading
  const images = Array.from(element.querySelectorAll('img'))
  await Promise.all(
    images.map(img => {
      if (img.complete) return Promise.resolve()
      return new Promise(resolve => {
        img.onload = resolve
        img.onerror = resolve
      })
    })
  )

  const [{ jsPDF }, html2canvasModule] = await Promise.all([
    import('jspdf'),
    import('html2canvas')
  ])
  const html2canvas = html2canvasModule.default || html2canvasModule

  // Render element to high-res canvas (scale 2 = crisp 300dpi output)
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    backgroundColor: '#ffffff',
    logging: false,
    scrollX: 0,
    scrollY: 0,
    windowWidth: element.scrollWidth || 800,
    onclone: (clonedDoc) => {
      const el = clonedDoc.querySelector('.printable-preview-content') || clonedDoc.querySelector('.print-container')
      if (el) {
        el.style.boxShadow = 'none'
        el.style.borderRadius = '0px'
        el.style.transform = 'none'
        el.style.width = '800px'
        el.style.maxWidth = '800px'
        el.style.margin = '0 auto'
      }
      clonedDoc.querySelectorAll('[contenteditable]').forEach(node => {
        node.style.outline = 'none'
        node.style.border = 'none'
      })
    }
  })

  if (!canvas || canvas.width === 0 || canvas.height === 0) {
    throw new Error('Canvas rendering produced an empty image')
  }

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

  // Single-page fit optimization: If the content is slightly taller than printable height (within 8%),
  // scale it slightly to fit cleanly on one single page and eliminate unnecessary blank second page
  if (imgHeight <= printableHeight * 1.08) {
    const finalHeight = Math.min(imgHeight, printableHeight)
    const finalWidth = (imgHeight > printableHeight) ? (imgWidth * (printableHeight / imgHeight)) : imgWidth
    const xPos = margin + ((printableWidth - finalWidth) / 2)
    pdf.addImage(imgData, 'PNG', xPos, margin, finalWidth, finalHeight, undefined, 'FAST')
  } else {
    // Multi-page document
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

  // Store the PDF on the backend so scanning the embedded QR code serves this exact PDF
  if (options?.token) {
    try {
      const pdfBase64 = pdf.output('datauristring')
      await api.post('/documents/save', {
        token: options.token,
        pdfBase64,
        filename
      })
    } catch (saveErr) {
      console.error('Failed to store PDF for public QR access:', saveErr)
      throw new Error('Failed to store PDF for QR access. Please try again.')
    }
  }

  pdf.save(filename)
  return true
}

export function printInvoiceElement(element, docTitle, settings = {}) {
  if (!element) return

  // Unfocus active element to commit any in-progress contentEditable changes
  if (typeof document !== 'undefined' && document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur()
  }

  // Create an isolated hidden iframe
  const iframe = document.createElement('iframe')
  iframe.setAttribute('style', 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;z-index:-1;')
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow.document
  doc.open()

  // Collect all stylesheets and style blocks from the main document to preserve Tailwind CSS & fonts
  const headElements = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map(el => el.outerHTML)
    .join('\n')

  const fontClass = settings.fontSize === 'small' ? 'text-xs' : settings.fontSize === 'large' ? 'text-base' : 'text-sm'
  const fontFamily = settings.fontFamily || 'Inter, sans-serif'
  const outerBorder = getPreviewBorders(settings).outer

  doc.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${docTitle || 'Tax Invoice'}</title>
        ${headElements}
        <style>
          @page {
            size: A4 portrait;
            margin: 8mm 10mm;
          }
          *, *::before, *::after {
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #0f172a !important;
            width: 100% !important;
            height: auto !important;
          }
          body {
            font-family: ${fontFamily};
            background: #ffffff;
          }
          .invoice-print-root {
            width: 100% !important;
            max-width: 800px !important;
            margin: 0 auto !important;
            padding: 16px 20px !important;
            background: #ffffff !important;
            color: #0f172a !important;
            box-sizing: border-box !important;
            border: ${outerBorder} !important;
            transform: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          thead {
            display: table-header-group;
          }
          tfoot {
            display: table-footer-group;
          }
          [contenteditable] {
            outline: none !important;
            border-color: transparent !important;
          }
        </style>
      </head>
      <body>
        <div class="printable-preview-content ${fontClass} invoice-print-root">
          ${element.innerHTML}
        </div>
      </body>
    </html>
  `)
  doc.close()

  const triggerIframePrint = () => {
    try {
      iframe.contentWindow.focus()
      iframe.contentWindow.print()
    } catch {
      window.print()
    } finally {
      setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe)
        }
      }, 2000)
    }
  }

  // Ensure iframe resources (QR image, fonts) have a brief moment to render
  if (iframe.contentWindow.document.readyState === 'complete') {
    setTimeout(triggerIframePrint, 150)
  } else {
    iframe.contentWindow.addEventListener('load', () => {
      setTimeout(triggerIframePrint, 150)
    }, { once: true })
    setTimeout(triggerIframePrint, 500)
  }
}

export function PrintPreviewModal({ type, id, onClose }) {
  const invoiceRef = useRef(null)
  const [doc, setDoc] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [pdfError, setPdfError] = useState(null)
  const [docToken, setDocToken] = useState('')
  const [docPublicUrl, setDocPublicUrl] = useState('')

  // Visible sections toggles (HSN, Qty, TaxTable all off by default)
  const [settings, setSettings] = useState({
    showQr: true,
    showHsn: false,
    showQty: false,
    showTaxTable: false,
    swapRecipientSupplier: false,
    borderStyle: 'boxed',
  })

  // Core editable fields
  const [fields, setFields] = useState({
    docDate: '',
    totalAmount: 0,
    description: '',
    taxRate: 0,
    // In-place values stored here to allow initial fallback
    title: '',
    supplierName: '',
    supplierAddress: '',
    supplierGstin: '',
    supplierState: '',
    recipientName: '',
    recipientAddress: '',
    recipientGstin: '',
    recipientState: '',
    docNo: '',
    payMode: '',
    refNum: '',
    hsnValue: '9983',
    qtyValue: '1 No',
    declaration: 'We declare that this invoice shows the actual price of the goods / services described and that all particulars are true and correct.',
    signatoryLabel: "",
    signatoryRole: 'Authorised Signatory',
    bankFirmName: '',
    bankName: '',
    bankAccount: '',
    bankIFSC: '',
  })

  useEffect(() => {
    if (!type || !id) return

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

        // Fetch or register public QR access token for customer scanning
        try {
          const tokenRes = await api.post('/documents/token', { type, id })
          if (tokenRes?.token) {
            setDocToken(tokenRes.token)
            if (tokenRes.publicUrl) {
              setDocPublicUrl(tokenRes.publicUrl)
            }
          }
        } catch {
          // Token will be generated on demand if needed
        }

        // Fetch saved invoice template settings from backend
        let tmpl = {}
        try {
          const templateRes = await api.get('/settings/invoice-template')
          if (templateRes?.data) {
            tmpl = templateRes.data
          }
        } catch {
          tmpl = prof?.invoiceTemplates || {}
        }

        setSettings({
          showQr: tmpl.showQRCode !== undefined ? tmpl.showQRCode : (tmpl.showQr !== undefined ? tmpl.showQr : true),
          showHsn: tmpl.showHSNColumn !== undefined ? tmpl.showHSNColumn : (tmpl.showHsn !== undefined ? tmpl.showHsn : false),
          showQty: tmpl.showQuantityColumn !== undefined ? tmpl.showQuantityColumn : (tmpl.showQty !== undefined ? tmpl.showQty : false),
          showTaxTable: tmpl.showGSTTable !== undefined ? tmpl.showGSTTable : (tmpl.showTaxTable !== undefined ? tmpl.showTaxTable : false),
          swapRecipientSupplier: tmpl.swapRecipientSupplier !== undefined ? tmpl.swapRecipientSupplier : false,
          borderStyle: tmpl.borderStyle || 'minimal',
          theme: tmpl.theme || 'modern-minimal',
          accentColor: tmpl.accentColor || '#000000',
          borderColor: tmpl.borderColor || '#000000',
          headerBackground: tmpl.headerBackground || '#F8FAFC',
          fontSize: tmpl.fontSize || 'medium',
          fontFamily: tmpl.fontFamily || 'Inter, sans-serif'
        })

        const todayFormattedStr = formatSlashDate(new Date())
        const computedAckNo = generateAckNumber(data, type)

        // Setup base fields
        let initialFields = {
          docDate: '',
          totalAmount: 0,
          description: '',
          taxRate: 18,
          title: '',
          ackNo: computedAckNo,
          ackDate: todayFormattedStr,
          supplierName: '',
          supplierAddress: '',
          supplierGstin: '',
          supplierState: '',
          recipientName: '',
          recipientAddress: '',
          recipientGstin: '',
          recipientState: '',
          docNo: '',
          payMode: '',
          refNum: '',
          hsnValue: '9983',
          qtyValue: '1 No',
          declaration: tmpl.declarationText || 'We declare that this invoice shows the actual price of the goods / services described and that all particulars are true and correct.',
          signatoryLabel: `For ${prof.businessName || 'Vastrams'}`,
          signatoryRole: 'Authorised Signatory',
          bankFirmName: prof.businessName || '',
          bankName: prof.bankName || '',
          bankAccount: prof.bankAccount || '',
          bankIFSC: prof.bankIFSC || '',
        }

        if (type === 'bill') {
          const vendorName = data.vendorId?.name || ''
          initialFields.title = 'Tax Invoice'
          initialFields.supplierName = vendorName
          initialFields.supplierAddress = data.vendorId?.address || ''
          initialFields.supplierGstin = data.vendorId?.gstin || ''
          initialFields.supplierState = (data.vendorId?.gstin || '').substring(0, 2)
          initialFields.recipientName = prof.businessName || ''
          initialFields.recipientAddress = prof.address || ''
          initialFields.recipientGstin = prof.gstin || ''
          initialFields.recipientState = (prof.gstin || '').substring(0, 2)
          initialFields.docNo = data.billNumber || ''
          initialFields.docDate = data.billDate ? fromInputDate(toInputDate(data.billDate)) : ''
          initialFields.payMode = 'Credit (Outstanding)'
          initialFields.refNum = '—'
          initialFields.description = 'Purchase Bill Settlement'
          initialFields.totalAmount = data.amount || 0
          initialFields.taxRate = Number(data.taxRate || data.gstRate || 0)
          initialFields.signatoryLabel = vendorName ? (vendorName.trim().toLowerCase().startsWith('for ') ? vendorName.trim() : `For ${vendorName.trim()}`) : `For ${prof.businessName || 'Vastrams'}`
        } else if (type === 'payment') {
          const vendorName = data.vendorId?.name || ''
          initialFields.title = 'Payment Voucher'
          initialFields.supplierName = prof.businessName || ''
          initialFields.supplierAddress = prof.address || ''
          initialFields.supplierGstin = prof.gstin || ''
          initialFields.supplierState = (prof.gstin || '').substring(0, 2)
          initialFields.recipientName = vendorName
          initialFields.recipientAddress = data.vendorId?.address || ''
          initialFields.recipientGstin = data.vendorId?.gstin || ''
          initialFields.recipientState = (data.vendorId?.gstin || '').substring(0, 2)
          initialFields.docNo = data.referenceNumber || ''
          initialFields.docDate = data.paymentDate ? fromInputDate(toInputDate(data.paymentDate)) : ''
          initialFields.payMode = formatPaymentMode(data.paymentMode)
          initialFields.refNum = data.referenceNumber || ''
          initialFields.description = `Payment via ${formatPaymentMode(data.paymentMode || 'Bank Transfer')} - Ref: ${data.referenceNumber}`
          initialFields.totalAmount = data.amount || 0
          initialFields.signatoryLabel = vendorName ? (vendorName.trim().toLowerCase().startsWith('for ') ? vendorName.trim() : `For ${vendorName.trim()}`) : `For ${prof.businessName || 'Vastrams'}`
        } else if (type === 'loan') {
          const l = data.loan || data
          initialFields.title = 'Loan Drawdown Advice'
          initialFields.supplierName = prof.businessName || ''
          initialFields.supplierAddress = prof.address || ''
          initialFields.supplierGstin = prof.gstin || ''
          initialFields.supplierState = (prof.gstin || '').substring(0, 2)
          initialFields.recipientName = l.financierId?.name || ''
          initialFields.recipientAddress = '—'
          initialFields.recipientGstin = l.financierId?.gstin || 'N/A'
          initialFields.recipientState = '—'
          initialFields.docNo = l.loanReference || ''
          initialFields.docDate = l.drawdownDate ? fromInputDate(toInputDate(l.drawdownDate)) : ''
          initialFields.payMode = l.linkedChequeId ? 'Cheque' : 'Bank Transfer'
          initialFields.refNum = l.linkedChequeId?.chequeNumber || '—'

          let accruedInterest = 0
          let daysElapsed = 0
          if (l.drawdownDate && l.interestRate && l.principalAmount) {
            let dDate = new Date(l.drawdownDate)
            if (isNaN(dDate.getTime()) && typeof l.drawdownDate === 'string') {
              const parts = l.drawdownDate.split(/[-/\s]/)
              if (parts.length === 3) {
                const monthsMap = { JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5, JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11, Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 }
                const mIdx = monthsMap[parts[1]] !== undefined ? monthsMap[parts[1]] : Number(parts[1]) - 1
                const yNum = Number(parts[2])
                const dNum = Number(parts[0])
                if (yNum > 1000) {
                  dDate = new Date(yNum, mIdx, dNum)
                } else {
                  dDate = new Date(Number(parts[2]), mIdx, Number(parts[0]))
                }
              }
            }
            if (dDate && !isNaN(dDate.getTime())) {
              daysElapsed = Math.max(0, Math.floor((new Date() - dDate) / (1000 * 60 * 60 * 24)))
              accruedInterest = (l.principalAmount * l.interestRate * daysElapsed) / (100 * 365)
            }
          }

          const principal = l.principalAmount || 0
          const totalPayable = Math.round((principal + accruedInterest) * 100) / 100

          initialFields.description = `Loan Drawdown Principal - Ref: ${l.loanReference || ''}`
          initialFields.totalAmount = totalPayable
          initialFields.interestRate = (l.interestRate !== null && l.interestRate !== undefined && !isNaN(l.interestRate)) ? l.interestRate : null
          initialFields.accruedInterest = Math.round(accruedInterest * 100) / 100
          initialFields.daysElapsed = daysElapsed
          const financierName = l.financierId?.name || ''
          initialFields.signatoryLabel = financierName ? (financierName.trim().toLowerCase().startsWith('for ') ? financierName.trim() : `For ${financierName.trim()}`) : `For ${prof.businessName || 'Vastrams'}`
        } else if (type === 'repayment') {
          initialFields.title = 'Loan Repayment Receipt'
          initialFields.supplierName = data.loanId?.financierId?.name || ''
          initialFields.supplierAddress = '—'
          initialFields.supplierGstin = '—'
          initialFields.supplierState = '—'
          initialFields.recipientName = prof.businessName || ''
          initialFields.recipientAddress = prof.address || ''
          initialFields.recipientGstin = prof.gstin || ''
          initialFields.recipientState = (prof.gstin || '').substring(0, 2)
          initialFields.docNo = data.referenceNumber || ''
          initialFields.docDate = data.repaymentDate ? fromInputDate(toInputDate(data.repaymentDate)) : ''
          initialFields.payMode = formatPaymentMode(data.repaymentMode)
          initialFields.refNum = data.referenceNumber || ''
          initialFields.description = `Loan Repayment Settlement - Ref: ${data.referenceNumber || ''}`
          initialFields.totalAmount = data.amount || 0
          initialFields.principalPaid = data.principalPaid || 0
          initialFields.interestPaid = data.interestPaid || 0
          const repFinancier = data.loanId?.financierId?.name || data.financierId?.name || ''
          initialFields.signatoryLabel = repFinancier ? (repFinancier.trim().toLowerCase().startsWith('for ') ? repFinancier.trim() : `For ${repFinancier.trim()}`) : `For ${prof.businessName || 'Vastrams'}`
        }

        setFields(initialFields)
        setError(null)
      } catch (err) {
        setError(err.message || 'Failed to fetch document details')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [type, id])

  const handlePrint = async () => {
    // Unfocus active element to commit any in-progress contentEditable changes
    if (typeof document !== 'undefined' && document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur()
    }

    try {
      setDownloadingPdf(true)
      setPdfError(null)

      const targetElement = invoiceRef.current || document.querySelector('.printable-preview-content')
      if (!targetElement) {
        throw new Error('Document preview element not found')
      }

      // Ensure public token is obtained if not already loaded
      let activeToken = docToken
      if (!activeToken) {
        try {
          const tokenRes = await api.post('/documents/token', { type, id })
          if (tokenRes?.token) {
            activeToken = tokenRes.token
            setDocToken(activeToken)
            if (tokenRes.publicUrl) setDocPublicUrl(tokenRes.publicUrl)
          }
        } catch (e) {
          console.warn('Failed to register QR token:', e)
        }
      }

      const filename = generatePdfFilename({ type, fields, doc })
      await downloadInvoicePdf(targetElement, filename, { settings, token: activeToken })
    } catch (err) {
      console.error('Failed to generate and download PDF directly:', err)
      setPdfError(err.message || 'Failed to generate PDF. Please try again.')
    } finally {
      setDownloadingPdf(false)
    }
  }

  if (!type || !id) return null

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
        <div className="bg-white p-6 rounded-xl shadow-xl flex items-center space-x-3">
          <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-600"></div>
          <span className="text-sm font-semibold text-slate-700">Loading Document...</span>
        </div>
      </div>
    )
  }

  if (error || !doc) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
        <div className="bg-white p-6 rounded-xl shadow-xl max-w-md w-full text-center">
          <p className="text-red-500 font-semibold text-lg mb-4">{error || 'Document not found'}</p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  const taxRateNum = Number(fields.taxRate || 0)
  const isGstApplicable = settings.showTaxTable && taxRateNum > 0
  const taxableValue = isGstApplicable ? (fields.totalAmount / (1 + taxRateNum / 100)) : fields.totalAmount
  const totalTax = isGstApplicable ? (fields.totalAmount - taxableValue) : 0

  let cgstAmount = 0
  let sgstAmount = 0
  let igstAmount = 0
  let cgstRate = 0
  let sgstRate = 0
  let igstRate = 0

  if (settings.showTaxTable && taxRateNum > 0) {
    const codeSup = (fields.supplierState || '').trim()
    const codeRec = (fields.recipientState || '').trim()
    if (codeSup && codeRec && codeSup !== codeRec) {
      igstRate = taxRateNum
      igstAmount = totalTax
    } else {
      cgstRate = taxRateNum / 2
      sgstRate = taxRateNum / 2
      cgstAmount = totalTax / 2
      sgstAmount = totalTax / 2
    }
  }

  // QR Code encodes the real accessible PDF URL — scanning opens the actual invoice on any device
  const documentDateStr = formatSlashDate(fields.docDate)
  const softCopyUrl = docPublicUrl || `${window.location.origin}/api/documents/public/${docToken || `${type}_${id}`}`
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(softCopyUrl)}`

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-6 print-modal-overlay">
      <style dangerouslySetInnerHTML={{__html: `
        @page {
          size: A4 portrait;
          margin: 6mm 8mm;
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

          /* 2. When rendered via portal in body, completely hide #root so background page does not print */
          body:has(.print-modal-overlay) > #root,
          body > #root:has(~ .print-modal-overlay) {
            display: none !important;
          }

          /* 3. If rendered inside #root without portal, ensure parent wrappers stay unconstrained */
          html, body, #root, #root > div, .flex-1, main, [class*="space-y"] {
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

          /* 4. Hide background siblings if modal is nested inside main */
          main > div > *:not(:has(.print-modal-overlay)):not(.print-modal-overlay) {
            display: none !important;
          }

          /* 5. Overlay & Card Layout - flatten out modal wrappers for printing */
          .print-modal-overlay {
            position: static !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            background: #ffffff !important;
            backdrop-filter: none !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
            overflow: visible !important;
            z-index: auto !important;
          }
          .print-modal-dialog {
            border: none !important;
            box-shadow: none !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            background: #ffffff !important;
            display: block !important;
            overflow: visible !important;
            border-radius: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .print-preview-column {
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
          }

          /* 6. Scaled A4 preview container - strictly fit 1 single page */
          .printable-preview-content {
            zoom: 1 !important;
            transform: none !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            border: none !important;
            box-shadow: none !important;
            margin: 0 auto !important;
            padding: 2mm 4mm !important;
            display: block !important;
            overflow: visible !important;
            box-sizing: border-box !important;
            background: #ffffff !important;
            color: #000000 !important;
            page-break-after: avoid !important;
            page-break-before: avoid !important;
            break-after: avoid !important;
            break-before: avoid !important;
          }

          /* 7. Ensure table rows do not break awkwardly */
          .print-table {
            page-break-inside: auto;
          }
          .print-table tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .print-table thead {
            display: table-header-group;
          }
          .print-table tfoot {
            display: table-footer-group;
          }
        }
      `}} />

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-[1240px] h-[95vh] sm:h-[92vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700 print-modal-dialog">
        
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 no-print">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white">A4 Invoice & Voucher Designer</h2>
            <p className="text-[11px] sm:text-xs text-slate-500">Edit any heading or text label directly on the document by clicking and typing!</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition" aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
          
          {/* Settings Panel (Left Column) */}
          <div className="w-full lg:w-[320px] lg:shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-700 px-4 sm:px-6 py-4 sm:py-5 overflow-y-visible lg:overflow-y-auto overflow-x-hidden space-y-5 bg-slate-50/50 dark:bg-slate-900/40 text-left box-border no-print">

            {/* Core fields */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Document Data</h3>
              <div className="space-y-3 text-xs">

                {/* Dated */}
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">Dated</label>
                  <CustomDatePicker
                    value={fields.docDate || documentDateStr}
                    onChange={val => setFields({...fields, docDate: val})}
                  />
                </div>

                {/* Ack Date */}
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">Ack Date (Editable)</label>
                  <CustomDatePicker
                    value={fields.ackDate}
                    onChange={val => setFields({...fields, ackDate: val})}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">Total Amount (₹)</label>
                  <input
                    type="number"
                    value={fields.totalAmount}
                    onChange={e => setFields({...fields, totalAmount: Number(e.target.value)})}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium box-border focus:outline-none focus:ring-1 focus:ring-brand-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">Item Description</label>
                  <textarea
                    rows={3}
                    value={fields.description}
                    onChange={e => setFields({...fields, description: e.target.value})}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-normal box-border focus:outline-none focus:ring-1 focus:ring-brand-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">Signatory Label</label>
                  <input
                    type="text"
                    value={fields.signatoryLabel}
                    onChange={e => setFields({...fields, signatoryLabel: e.target.value})}
                    placeholder="e.g. For TSR textiles"
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium box-border focus:outline-none focus:ring-1 focus:ring-brand-primary"
                  />
                </div>

              </div>
            </div>

            {/* Optional columns & GST */}
            <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-3 text-xs">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Optional Sections</h3>

              {/* QR Code */}
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.showQr}
                  onChange={e => setSettings({...settings, showQr: e.target.checked})}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span className="font-semibold text-slate-600 dark:text-slate-300">Show QR Code</span>
              </label>

              {/* GST Tax Table + rate */}
              <div>
                <label className="flex items-center space-x-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings.showTaxTable}
                    onChange={e => setSettings({...settings, showTaxTable: e.target.checked})}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="font-semibold text-slate-600 dark:text-slate-300">Show GST Tax Table</span>
                </label>
                {settings.showTaxTable && (
                  <div className="mt-2 ml-6">
                    <label className="block font-semibold text-slate-400 mb-1">GST Rate (%)</label>
                    <input
                      type="number"
                      value={fields.taxRate}
                      min={0}
                      max={100}
                      onChange={e => setFields({...fields, taxRate: Number(e.target.value)})}
                      className="w-24 px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white font-bold text-xs"
                    />
                    <span className="ml-2 text-slate-400 text-[10px]">default 0%</span>
                  </div>
                )}
              </div>

              {/* HSN/SAC column */}
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.showHsn}
                  onChange={e => setSettings({...settings, showHsn: e.target.checked})}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span className="font-semibold text-slate-600 dark:text-slate-300">Show HSN/SAC Column</span>
              </label>

              {/* Quantity column */}
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.showQty}
                  onChange={e => setSettings({...settings, showQty: e.target.checked})}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span className="font-semibold text-slate-600 dark:text-slate-300">Show Quantity Column</span>
              </label>

              {/* Swap Recipient / Supplier */}
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.swapRecipientSupplier}
                  onChange={e => {
                    const newSettings = { ...settings, swapRecipientSupplier: e.target.checked }
                    setSettings(newSettings)
                    api.put('/settings/invoice-template', {
                      showQRCode: newSettings.showQr,
                      showHSNColumn: newSettings.showHsn,
                      showQuantityColumn: newSettings.showQty,
                      showGSTTable: newSettings.showTaxTable,
                      swapRecipientSupplier: newSettings.swapRecipientSupplier,
                      borderStyle: newSettings.borderStyle
                    }).catch(() => {})
                  }}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span className="font-semibold text-slate-600 dark:text-slate-300">Swap Recipient / Supplier</span>
              </label>

            </div>

            {/* Border Style toggle */}
            <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Border Style</h3>
              <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 text-xs">
                {[
                  { label: 'Minimal',    value: 'minimal'    },
                  { label: 'Boxed',      value: 'boxed'      },
                  { label: 'Borderless', value: 'borderless' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSettings({ ...settings, borderStyle: opt.value })}
                    className="flex-1 py-1.5 font-semibold transition-colors"
                    style={{
                      background: settings.borderStyle === opt.value ? '#1E293B' : 'transparent',
                      color:      settings.borderStyle === opt.value ? '#F0F4F8'  : '#64748B',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-slate-700/30 p-3.5 rounded-xl border border-gray-200 dark:border-slate-700 text-[11px] text-gray-700 dark:text-gray-300 space-y-1">
              <p className="font-bold uppercase tracking-wider">Tip:</p>
              <p>Click any heading or label on the document preview to edit it directly.</p>
            </div>

          </div>

          {/* Interactive Editable A4 Preview (Right Column) */}
          <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-900 p-2 sm:p-6 lg:p-8 flex items-start justify-center relative print-preview-column">
            <div 
              ref={invoiceRef}
              className={`printable-preview-content w-full max-w-[800px] bg-white text-slate-900 rounded-lg shadow-xl p-4 sm:p-8 leading-tight origin-top transition-colors ${
                settings.fontSize === 'small' ? 'text-xs' : settings.fontSize === 'large' ? 'text-base' : 'text-sm'
              }`} 
              style={{ 
                transform: typeof window !== 'undefined' && window.innerWidth < 640 ? 'scale(0.95)' : 'scale(0.85)',
                fontFamily: settings.fontFamily || 'Inter, sans-serif',
                border: getPreviewBorders(settings).outer
              }}
            >
              
              {/* Document Title / Headers */}
              <div 
                className="p-4 rounded-md mb-4 flex justify-between items-start border text-left"
                style={{ 
                  background: settings.headerBackground || '#F8FAFC',
                  borderColor: getPreviewBorders(settings).cell === 'none' ? 'transparent' : (settings.borderColor || '#000000')
                }}
              >
                <div>
                  <h1 
                    contentEditable={true} 
                    suppressContentEditableWarning={true}
                    className="text-xl font-extrabold uppercase tracking-wider outline-none px-1 rounded border border-transparent hover:border-slate-300"
                    style={{ color: '#000000' }}
                  >
                    {fields.title || 'Document'}
                  </h1>

                  <div className="mt-2 text-xs font-mono space-y-0.5">
                    <p>
                      <span className="font-bold text-slate-900">Ack No:</span>{' '}
                      <span className="font-semibold text-slate-700 select-none">
                        {fields.ackNo}
                      </span>
                    </p>
                    <p>
                      <span className="font-bold text-slate-900">Ack Date:</span>{' '}
                      <span 
                        contentEditable={true} 
                        suppressContentEditableWarning={true} 
                        className="font-semibold outline-none hover:bg-slate-100 px-0.5 rounded text-slate-800"
                        onBlur={e => setFields({...fields, ackDate: e.target.innerText})}
                      >
                        {fields.ackDate || documentDateStr}
                      </span>
                    </p>
                  </div>

                </div>
                {settings.showQr && (
                  <div className="text-right flex flex-col items-end">
                    <span contentEditable={true} suppressContentEditableWarning={true} className="text-[10px] font-bold tracking-widest uppercase mb-1 outline-none text-slate-500">e-Invoice</span>
                    <img src={qrImageUrl} alt="QR Code" crossOrigin="anonymous" className="w-20 h-20 border border-slate-900 p-0.5 bg-white shadow-sm" />
                  </div>
                )}
              </div>

              {/* Merged Header Block: Recipient & Supplier + Bottom Document Metadata Row */}
              <div className="mb-4 text-left" style={{ border: getPreviewBorders(settings).cell }}>
                <div className="grid grid-cols-2">
                  {/* Left Column */}
                  {settings.swapRecipientSupplier ? (
                    /* Supplier Details (From - LEFT) */
                    <div className="p-3 text-xs space-y-1" style={{ borderRight: getPreviewBorders(settings).cell }}>
                      <h2 
                        contentEditable={true} 
                        suppressContentEditableWarning={true}
                        className="font-bold text-[10px] uppercase text-slate-500 tracking-wider outline-none hover:bg-slate-50"
                      >
                        Supplier (From)
                      </h2>
                      <p 
                        contentEditable={true} 
                        suppressContentEditableWarning={true}
                        className="font-bold text-sm outline-none hover:bg-slate-50 px-0.5 rounded"
                        onBlur={e => setFields({...fields, supplierName: e.target.innerText})}
                      >
                        {fields.supplierName || 'Supplier'}
                      </p>
                      <p 
                        contentEditable={true} 
                        suppressContentEditableWarning={true}
                        className="whitespace-pre-line outline-none hover:bg-slate-50 px-0.5 rounded"
                        onBlur={e => setFields({...fields, supplierAddress: e.target.innerText})}
                      >
                        {fields.supplierAddress || 'Address details...'}
                      </p>
                      <p className="font-mono mt-1">
                        <span contentEditable={true} suppressContentEditableWarning={true} className="font-bold outline-none">GSTIN/UIN:</span>{' '}
                        <span 
                          contentEditable={true} 
                          suppressContentEditableWarning={true}
                          className="outline-none hover:bg-slate-50 font-semibold px-0.5 rounded"
                          onBlur={e => setFields({...fields, supplierGstin: e.target.innerText.toUpperCase()})}
                        >
                          {fields.supplierGstin || '—'}
                        </span>
                      </p>
                      <p>
                        <span contentEditable={true} suppressContentEditableWarning={true} className="font-semibold text-slate-500 outline-none">State Code:</span>{' '}
                        <span 
                          contentEditable={true} 
                          suppressContentEditableWarning={true}
                          className="outline-none hover:bg-slate-50 font-semibold px-0.5 rounded"
                          onBlur={e => setFields({...fields, supplierState: e.target.innerText})}
                        >
                          {fields.supplierState || '—'}
                        </span>
                      </p>
                    </div>
                  ) : (
                    /* Recipient Details (Bill To - LEFT) */
                    <div className="p-3 text-xs space-y-1" style={{ borderRight: getPreviewBorders(settings).cell }}>
                      <h2 
                        contentEditable={true} 
                        suppressContentEditableWarning={true}
                        className="font-bold text-[10px] uppercase text-slate-500 tracking-wider outline-none hover:bg-slate-50"
                      >
                        Recipient (Bill To)
                      </h2>
                      <p 
                        contentEditable={true} 
                        suppressContentEditableWarning={true}
                        className="font-bold text-sm outline-none hover:bg-slate-50 px-0.5 rounded"
                        onBlur={e => setFields({...fields, recipientName: e.target.innerText})}
                      >
                        {fields.recipientName || 'Recipient'}
                      </p>
                      <p 
                        contentEditable={true} 
                        suppressContentEditableWarning={true}
                        className="whitespace-pre-line outline-none hover:bg-slate-50 px-0.5 rounded"
                        onBlur={e => setFields({...fields, recipientAddress: e.target.innerText})}
                      >
                        {fields.recipientAddress || 'Address details...'}
                      </p>
                      <p className="font-mono mt-1">
                        <span contentEditable={true} suppressContentEditableWarning={true} className="font-bold outline-none">GSTIN/UIN:</span>{' '}
                        <span 
                          contentEditable={true} 
                          suppressContentEditableWarning={true}
                          className="outline-none hover:bg-slate-50 font-semibold px-0.5 rounded"
                          onBlur={e => setFields({...fields, recipientGstin: e.target.innerText.toUpperCase()})}
                        >
                          {fields.recipientGstin || '—'}
                        </span>
                      </p>
                      <p>
                        <span contentEditable={true} suppressContentEditableWarning={true} className="font-semibold text-slate-500 outline-none">State Code:</span>{' '}
                        <span 
                          contentEditable={true} 
                          suppressContentEditableWarning={true}
                          className="outline-none hover:bg-slate-50 font-semibold px-0.5 rounded"
                          onBlur={e => setFields({...fields, recipientState: e.target.innerText})}
                        >
                          {fields.recipientState || '—'}
                        </span>
                      </p>
                    </div>
                  )}

                  {/* Right Column */}
                  {settings.swapRecipientSupplier ? (
                    /* Recipient Details (Bill To - RIGHT) */
                    <div className="p-3 text-xs space-y-1">
                      <h2 
                        contentEditable={true} 
                        suppressContentEditableWarning={true}
                        className="font-bold text-[10px] uppercase text-slate-500 tracking-wider outline-none hover:bg-slate-50"
                      >
                        Recipient (Bill To)
                      </h2>
                      <p 
                        contentEditable={true} 
                        suppressContentEditableWarning={true}
                        className="font-bold text-sm outline-none hover:bg-slate-50 px-0.5 rounded"
                        onBlur={e => setFields({...fields, recipientName: e.target.innerText})}
                      >
                        {fields.recipientName || 'Recipient'}
                      </p>
                      <p 
                        contentEditable={true} 
                        suppressContentEditableWarning={true}
                        className="whitespace-pre-line outline-none hover:bg-slate-50 px-0.5 rounded"
                        onBlur={e => setFields({...fields, recipientAddress: e.target.innerText})}
                      >
                        {fields.recipientAddress || 'Address details...'}
                      </p>
                      <p className="font-mono mt-1">
                        <span contentEditable={true} suppressContentEditableWarning={true} className="font-bold outline-none">GSTIN/UIN:</span>{' '}
                        <span 
                          contentEditable={true} 
                          suppressContentEditableWarning={true}
                          className="outline-none hover:bg-slate-50 font-semibold px-0.5 rounded"
                          onBlur={e => setFields({...fields, recipientGstin: e.target.innerText.toUpperCase()})}
                        >
                          {fields.recipientGstin || '—'}
                        </span>
                      </p>
                      <p>
                        <span contentEditable={true} suppressContentEditableWarning={true} className="font-semibold text-slate-500 outline-none">State Code:</span>{' '}
                        <span 
                          contentEditable={true} 
                          suppressContentEditableWarning={true}
                          className="outline-none hover:bg-slate-50 font-semibold px-0.5 rounded"
                          onBlur={e => setFields({...fields, recipientState: e.target.innerText})}
                        >
                          {fields.recipientState || '—'}
                        </span>
                      </p>
                    </div>
                  ) : (
                    /* Supplier Details (From - RIGHT) */
                    <div className="p-3 text-xs space-y-1">
                      <h2 
                        contentEditable={true} 
                        suppressContentEditableWarning={true}
                        className="font-bold text-[10px] uppercase text-slate-500 tracking-wider outline-none hover:bg-slate-50"
                      >
                        Supplier (From)
                      </h2>
                      <p 
                        contentEditable={true} 
                        suppressContentEditableWarning={true}
                        className="font-bold text-sm outline-none hover:bg-slate-50 px-0.5 rounded"
                        onBlur={e => setFields({...fields, supplierName: e.target.innerText})}
                      >
                        {fields.supplierName || 'Supplier'}
                      </p>
                      <p 
                        contentEditable={true} 
                        suppressContentEditableWarning={true}
                        className="whitespace-pre-line outline-none hover:bg-slate-50 px-0.5 rounded"
                        onBlur={e => setFields({...fields, supplierAddress: e.target.innerText})}
                      >
                        {fields.supplierAddress || 'Address details...'}
                      </p>
                      <p className="font-mono mt-1">
                        <span contentEditable={true} suppressContentEditableWarning={true} className="font-bold outline-none">GSTIN/UIN:</span>{' '}
                        <span 
                          contentEditable={true} 
                          suppressContentEditableWarning={true}
                          className="outline-none hover:bg-slate-50 font-semibold px-0.5 rounded"
                          onBlur={e => setFields({...fields, supplierGstin: e.target.innerText.toUpperCase()})}
                        >
                          {fields.supplierGstin || '—'}
                        </span>
                      </p>
                      <p>
                        <span contentEditable={true} suppressContentEditableWarning={true} className="font-semibold text-slate-500 outline-none">State Code:</span>{' '}
                        <span 
                          contentEditable={true} 
                          suppressContentEditableWarning={true}
                          className="outline-none hover:bg-slate-50 font-semibold px-0.5 rounded"
                          onBlur={e => setFields({...fields, supplierState: e.target.innerText})}
                        >
                          {fields.supplierState || '—'}
                        </span>
                      </p>
                    </div>
                  )}
                </div>

                {/* Merged Bottom Row: 4 Document Metadata Columns */}
                <div className="grid grid-cols-4 text-xs text-left" style={{ borderTop: getPreviewBorders(settings).cell }}>
                  <div className="p-2.5" style={{ borderRight: getPreviewBorders(settings).cell }}>
                    <p contentEditable={true} suppressContentEditableWarning={true} className="font-semibold text-slate-500 uppercase text-[9px] outline-none">Document No.</p>
                    <p contentEditable={true} suppressContentEditableWarning={true} className="font-bold text-sm outline-none hover:bg-slate-50 px-0.5 rounded" onBlur={e => setFields({...fields, docNo: e.target.innerText})}>{fields.docNo}</p>
                  </div>
                  <div className="p-2.5" style={{ borderRight: getPreviewBorders(settings).cell }}>
                    <p className="font-semibold text-slate-500 uppercase text-[9px]">Dated</p>
                    <p className="font-bold text-sm">{documentDateStr}</p>
                  </div>
                  <div className="p-2.5" style={{ borderRight: getPreviewBorders(settings).cell }}>
                    <p contentEditable={true} suppressContentEditableWarning={true} className="font-semibold text-slate-500 uppercase text-[9px] outline-none">Payment Mode</p>
                    <p contentEditable={true} suppressContentEditableWarning={true} className="font-bold text-sm outline-none hover:bg-slate-50 px-0.5 rounded" onBlur={e => setFields({...fields, payMode: e.target.innerText})}>{fields.payMode}</p>
                  </div>
                  <div className="p-2.5">
                    <p contentEditable={true} suppressContentEditableWarning={true} className="font-semibold text-slate-500 uppercase text-[9px] outline-none">Instrument / Ref No.</p>
                    <p contentEditable={true} suppressContentEditableWarning={true} className="font-bold text-sm outline-none hover:bg-slate-50 px-0.5 rounded" onBlur={e => setFields({...fields, refNum: e.target.innerText})}>{fields.refNum || '—'}</p>
                  </div>
                </div>
              </div>

              {/* Item Details Table */}
              <table className="print-table w-full mb-4 text-xs" style={{ border: getPreviewBorders(settings).cell }}>
                <thead>
                  <tr className="text-slate-900 dark:text-slate-100" style={{ borderBottom: getPreviewBorders(settings).cell, backgroundColor: getPreviewBorders(settings).bgHeader }}>
                    <th contentEditable={true} suppressContentEditableWarning={true} className="p-2 text-center outline-none text-slate-900 dark:text-slate-100 font-bold whitespace-nowrap" style={{ borderRight: getPreviewBorders(settings).cell, width: '40px', minWidth: '40px' }}>SI No.</th>
                    <th contentEditable={true} suppressContentEditableWarning={true} className="p-2 text-left outline-none text-slate-900 dark:text-slate-100 font-bold" style={{ borderRight: getPreviewBorders(settings).cell }}>Description of Goods / Services</th>
                    {settings.showHsn && <th contentEditable={true} suppressContentEditableWarning={true} className="p-2 text-center w-24 outline-none text-slate-900 dark:text-slate-100 font-bold" style={{ borderRight: getPreviewBorders(settings).cell }}>HSN/SAC</th>}
                    {settings.showQty && <th contentEditable={true} suppressContentEditableWarning={true} className="p-2 text-center w-16 outline-none text-slate-900 dark:text-slate-100 font-bold" style={{ borderRight: getPreviewBorders(settings).cell }}>Quantity</th>}
                    <th contentEditable={true} suppressContentEditableWarning={true} className="p-2 text-right w-24 outline-none text-slate-900 dark:text-slate-100 font-bold" style={{ borderRight: getPreviewBorders(settings).cell }}>Rate</th>
                    <th contentEditable={true} suppressContentEditableWarning={true} className="p-2 text-right w-28 outline-none text-slate-900 dark:text-slate-100 font-bold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="align-top text-left" style={{ borderBottom: getPreviewBorders(settings).cell }}>
                    <td className="p-2 text-center whitespace-nowrap" style={{ borderRight: getPreviewBorders(settings).cell, width: '40px', minWidth: '40px' }}>1</td>
                    <td className="p-2 space-y-1" style={{ borderRight: getPreviewBorders(settings).cell }}>
                      <p className="font-bold">{fields.description}</p>
                      {type === 'bill' && <p className="text-[10px] text-slate-500 dark:text-slate-400">Service rendered as per bill {fields.docNo}</p>}
                      {type === 'loan' && (
                        <div className="mt-2 text-[10px] space-y-0.5 border-t pt-1 border-dashed border-slate-300 dark:border-slate-600">
                          <p className="font-bold text-slate-700 dark:text-slate-200">Loan & Interest Parameters:</p>
                          <p>Financier: <span className="font-semibold">{fields.recipientName}</span></p>
                          <p>Interest Rate: <span className="font-bold text-slate-900">{fields.interestRate !== null && fields.interestRate !== undefined ? `${fields.interestRate}% p.a.` : '—'}</span></p>
                          {fields.accruedInterest > 0 && (
                            <p>Accrued Interest ({fields.daysElapsed} days): <span className="font-bold text-slate-900">₹{fmt(fields.accruedInterest)}</span></p>
                          )}
                          <p>Total Amount Payable (Principal + Interest): <span className="font-bold text-slate-900">₹{fmt((fields.totalAmount || 0) + (fields.accruedInterest || 0))}</span></p>
                        </div>
                      )}
                      {type === 'repayment' && (
                        <div className="mt-2 text-[10px] space-y-0.5 border-t pt-1 border-dashed border-slate-300 dark:border-slate-600">
                          <p className="font-bold text-slate-700 dark:text-slate-200">Repayment Settlement Breakdown:</p>
                          <p>Repayment for Loan Ref: <span className="font-semibold">{doc.loanId?.loanReference || 'N/A'}</span></p>
                          <p>Principal Applied: <span className="font-bold text-slate-900">₹{fmt(fields.principalPaid || doc.principalPaid || 0)}</span></p>
                          <p>Interest Applied: <span className="font-bold text-slate-900">₹{fmt(fields.interestPaid || doc.interestPaid || 0)}</span></p>
                        </div>
                      )}
                    </td>
                    {settings.showHsn && (
                      <td 
                        contentEditable={true} 
                        suppressContentEditableWarning={true}
                        className="p-2 text-center font-mono outline-none hover:bg-slate-100 dark:hover:bg-slate-700/60"
                        style={{ borderRight: getPreviewBorders(settings).cell }}
                        onBlur={e => setFields({...fields, hsnValue: e.target.innerText})}
                      >
                        {fields.hsnValue}
                      </td>
                    )}
                    {settings.showQty && (
                      <td 
                        contentEditable={true} 
                        suppressContentEditableWarning={true}
                        className="p-2 text-center outline-none hover:bg-slate-100 dark:hover:bg-slate-700/60"
                        style={{ borderRight: getPreviewBorders(settings).cell }}
                        onBlur={e => setFields({...fields, qtyValue: e.target.innerText})}
                      >
                        {fields.qtyValue}
                      </td>
                    )}
                    <td className="p-2 text-right tabular-nums" style={{ borderRight: getPreviewBorders(settings).cell }}>
                      {type === 'loan' ? (fields.interestRate !== null && fields.interestRate !== undefined ? `${fields.interestRate}% p.a.` : '—') : `₹${fmt(taxableValue)}`}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      ₹{fmt(taxableValue)}
                    </td>
                  </tr>

                  {/* GST Additions */}
                  {settings.showTaxTable && (
                    <>
                      {cgstAmount > 0 && (
                        <tr className="align-top text-left" style={{ borderBottom: getPreviewBorders(settings).cell }}>
                          <td className="p-1" style={{ borderRight: getPreviewBorders(settings).cell }}></td>
                          <td className="p-1 text-right italic font-semibold" style={{ borderRight: getPreviewBorders(settings).cell }} colSpan={(settings.showHsn ? 1 : 0) + (settings.showQty ? 1 : 0) + 2}>
                            <span contentEditable={true} suppressContentEditableWarning={true} className="outline-none">CGST @ {cgstRate}%</span>
                          </td>
                          <td className="p-1 text-right tabular-nums font-semibold">₹{fmt(cgstAmount)}</td>
                        </tr>
                      )}
                      {sgstAmount > 0 && (
                        <tr className="align-top text-left" style={{ borderBottom: getPreviewBorders(settings).cell }}>
                          <td className="p-1" style={{ borderRight: getPreviewBorders(settings).cell }}></td>
                          <td className="p-1 text-right italic font-semibold" style={{ borderRight: getPreviewBorders(settings).cell }} colSpan={(settings.showHsn ? 1 : 0) + (settings.showQty ? 1 : 0) + 2}>
                            <span contentEditable={true} suppressContentEditableWarning={true} className="outline-none">SGST @ {sgstRate}%</span>
                          </td>
                          <td className="p-1 text-right tabular-nums font-semibold">₹{fmt(sgstAmount)}</td>
                        </tr>
                      )}
                      {igstAmount > 0 && (
                        <tr className="align-top text-left" style={{ borderBottom: getPreviewBorders(settings).cell }}>
                          <td className="p-1" style={{ borderRight: getPreviewBorders(settings).cell }}></td>
                          <td className="p-1 text-right italic font-semibold" style={{ borderRight: getPreviewBorders(settings).cell }} colSpan={(settings.showHsn ? 1 : 0) + (settings.showQty ? 1 : 0) + 2}>
                            <span contentEditable={true} suppressContentEditableWarning={true} className="outline-none">IGST @ {igstRate}%</span>
                          </td>
                          <td className="p-1 text-right tabular-nums font-semibold">₹{fmt(igstAmount)}</td>
                        </tr>
                      )}
                    </>
                  )}

                  {/* Grand Totals */}
                  <tr className="bg-slate-100 dark:bg-slate-700/80 text-slate-900 dark:text-slate-100 font-bold text-left">
                    <td contentEditable={true} suppressContentEditableWarning={true} className="p-2 text-center outline-none text-slate-900 dark:text-slate-100 font-bold" style={{ borderRight: getPreviewBorders(settings).cell }} colSpan={1 + 1 + (settings.showHsn ? 1 : 0)}>Total</td>
                    {settings.showQty && <td className="p-2 text-center text-slate-900 dark:text-slate-100 font-bold" style={{ borderRight: getPreviewBorders(settings).cell }}>{fields.qtyValue}</td>}
                    <td className="p-2 text-right" style={{ borderRight: getPreviewBorders(settings).cell }}></td>
                    <td className="p-2 text-right tabular-nums text-sm font-extrabold text-slate-900 dark:text-slate-100">₹{fmt(fields.totalAmount)}</td>
                  </tr>
                </tbody>
              </table>

              {/* Currency spelling card */}
              <div className="p-3 text-xs mb-4 text-left" style={{ border: getPreviewBorders(settings).cell }}>
                <p 
                  contentEditable={true} 
                  suppressContentEditableWarning={true} 
                  className="font-semibold text-slate-500 uppercase text-[9px] mb-1 outline-none"
                >
                  Amount Chargeable (in words)
                </p>
                <p className="font-bold text-sm">
                  {numberToWords(fields.totalAmount)}
                </p>
              </div>

              {/* Detailed GST breakdown table */}
              {settings.showTaxTable && (
                <table className="print-table w-full text-[10px] mb-4 text-center" style={{ border: getPreviewBorders(settings).cell }}>
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-700/80 text-slate-900 dark:text-slate-100 font-semibold" style={{ borderBottom: getPreviewBorders(settings).cell }}>
                      <th contentEditable={true} suppressContentEditableWarning={true} className="p-1 outline-none text-slate-900 dark:text-slate-100 font-bold" style={{ borderRight: getPreviewBorders(settings).cell }} rowSpan={2}>HSN/SAC</th>
                      <th contentEditable={true} suppressContentEditableWarning={true} className="p-1 outline-none text-slate-900 dark:text-slate-100 font-bold" style={{ borderRight: getPreviewBorders(settings).cell }} rowSpan={2}>Taxable Value</th>
                      <th contentEditable={true} suppressContentEditableWarning={true} className="p-1 outline-none text-slate-900 dark:text-slate-100 font-bold" style={{ borderRight: getPreviewBorders(settings).cell }} colSpan={2}>Central Tax</th>
                      <th contentEditable={true} suppressContentEditableWarning={true} className="p-1 outline-none text-slate-900 dark:text-slate-100 font-bold" style={{ borderRight: getPreviewBorders(settings).cell }} colSpan={2}>State Tax</th>
                      {igstAmount > 0 && <th contentEditable={true} suppressContentEditableWarning={true} className="p-1 outline-none text-slate-900 dark:text-slate-100 font-bold" style={{ borderRight: getPreviewBorders(settings).cell }} colSpan={2}>Integrated Tax</th>}
                      <th contentEditable={true} suppressContentEditableWarning={true} className="p-1 outline-none text-slate-900 dark:text-slate-100 font-bold" rowSpan={2}>Total Tax Amount</th>
                    </tr>
                    <tr className="bg-slate-100 dark:bg-slate-700/80 text-slate-900 dark:text-slate-100 font-semibold" style={{ borderBottom: getPreviewBorders(settings).cell }}>
                      <th contentEditable={true} suppressContentEditableWarning={true} className="p-1 outline-none text-slate-900 dark:text-slate-100 font-bold" style={{ borderRight: getPreviewBorders(settings).cell }}>Rate</th>
                      <th contentEditable={true} suppressContentEditableWarning={true} className="p-1 outline-none text-slate-900 dark:text-slate-100 font-bold" style={{ borderRight: getPreviewBorders(settings).cell }}>Amount</th>
                      <th contentEditable={true} suppressContentEditableWarning={true} className="p-1 outline-none text-slate-900 dark:text-slate-100 font-bold" style={{ borderRight: getPreviewBorders(settings).cell }}>Rate</th>
                      <th contentEditable={true} suppressContentEditableWarning={true} className="p-1 outline-none text-slate-900 dark:text-slate-100 font-bold" style={{ borderRight: getPreviewBorders(settings).cell }}>Amount</th>
                      {igstAmount > 0 && (
                        <>
                          <th contentEditable={true} suppressContentEditableWarning={true} className="p-1 outline-none text-slate-900 dark:text-slate-100 font-bold" style={{ borderRight: getPreviewBorders(settings).cell }}>Rate</th>
                          <th contentEditable={true} suppressContentEditableWarning={true} className="p-1 outline-none text-slate-900 dark:text-slate-100 font-bold" style={{ borderRight: getPreviewBorders(settings).cell }}>Amount</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="font-mono">
                      <td className="p-1.5" style={{ borderRight: getPreviewBorders(settings).cell }}>{fields.hsnValue || 'N/A'}</td>
                      <td className="p-1.5 text-right tabular-nums" style={{ borderRight: getPreviewBorders(settings).cell }}>₹{fmt(taxableValue)}</td>
                      <td className="p-1.5" style={{ borderRight: getPreviewBorders(settings).cell }}>{cgstRate}%</td>
                      <td className="p-1.5 text-right tabular-nums font-semibold" style={{ borderRight: getPreviewBorders(settings).cell }}>₹{fmt(cgstAmount)}</td>
                      <td className="p-1.5" style={{ borderRight: getPreviewBorders(settings).cell }}>{sgstRate}%</td>
                      <td className="p-1.5 text-right tabular-nums font-semibold" style={{ borderRight: getPreviewBorders(settings).cell }}>₹{fmt(sgstAmount)}</td>
                      {igstAmount > 0 && (
                        <>
                          <td className="p-1.5" style={{ borderRight: getPreviewBorders(settings).cell }}>{igstRate}%</td>
                          <td className="p-1.5 text-right tabular-nums font-semibold" style={{ borderRight: getPreviewBorders(settings).cell }}>₹{fmt(igstAmount)}</td>
                        </>
                      )}
                      <td className="p-1.5 text-right tabular-nums font-bold">₹{fmt(cgstAmount + sgstAmount + igstAmount)}</td>
                    </tr>
                    <tr className="font-bold bg-slate-100 dark:bg-slate-700/80 text-slate-900 dark:text-slate-100" style={{ borderTop: getPreviewBorders(settings).cell }}>
                      <td colSpan={2} className="p-1.5 text-center" style={{ borderRight: getPreviewBorders(settings).cell }}>Total Tax</td>
                      <td className="p-1.5 text-right tabular-nums" colSpan={2} style={{ borderRight: getPreviewBorders(settings).cell }}>₹{fmt(cgstAmount)}</td>
                      <td className="p-1.5 text-right tabular-nums" colSpan={2} style={{ borderRight: getPreviewBorders(settings).cell }}>₹{fmt(sgstAmount)}</td>
                      {igstAmount > 0 && <td className="p-1.5 text-right tabular-nums" colSpan={2} style={{ borderRight: getPreviewBorders(settings).cell }}>₹{fmt(igstAmount)}</td>}
                      <td className="p-1.5 text-right tabular-nums">₹{fmt(cgstAmount + sgstAmount + igstAmount)}</td>
                    </tr>
                  </tbody>
                </table>
              )}

              {/* Declaration & Signatory */}
              <div className="text-xs text-left" style={{ border: getPreviewBorders(settings).cell }}>

                {/* Bank Details row — under declaration */}
                <div className="p-3" style={{ borderBottom: getPreviewBorders(settings).cell, color: '#000000' }}>
                  <p className="font-bold uppercase text-[9px] mb-1" style={{ color: '#000000' }}>Bank Details for NEFT / RTGS Transfer</p>
                  <div className="grid grid-cols-2 gap-x-4 text-[10px]" style={{ color: '#000000' }}>
                    <p><span className="font-semibold">Firm Name:</span>{' '}
                      <span
                        contentEditable={true}
                        suppressContentEditableWarning={true}
                        className="outline-none hover:bg-slate-50 px-0.5 rounded"
                        onBlur={e => setFields({...fields, bankFirmName: e.target.innerText})}
                      >{fields.bankFirmName || fields.signatoryLabel || 'Vastrams'}</span>
                    </p>
                    <p><span className="font-semibold">Bank:</span>{' '}
                      <span
                        contentEditable={true}
                        suppressContentEditableWarning={true}
                        className="outline-none hover:bg-slate-50 px-0.5 rounded"
                        onBlur={e => setFields({...fields, bankName: e.target.innerText})}
                      >{fields.bankName || 'HDFC Bank'}</span>
                    </p>
                    <p><span className="font-semibold">A/C No:</span>{' '}
                      <span
                        contentEditable={true}
                        suppressContentEditableWarning={true}
                        className="outline-none hover:bg-slate-50 px-0.5 rounded font-mono"
                        onBlur={e => setFields({...fields, bankAccount: e.target.innerText})}
                      >{fields.bankAccount || 'Enter Account Number'}</span>
                    </p>
                    <p><span className="font-semibold">IFSC:</span>{' '}
                      <span
                        contentEditable={true}
                        suppressContentEditableWarning={true}
                        className="outline-none hover:bg-slate-50 px-0.5 rounded font-mono"
                        onBlur={e => setFields({...fields, bankIFSC: e.target.innerText})}
                      >{fields.bankIFSC || 'Enter IFSC Code'}</span>
                    </p>
                  </div>
                </div>

                {/* Declaration + Signatory row */}
                <div className="grid grid-cols-2">
                  <div className="p-3 space-y-2" style={{ borderRight: getPreviewBorders(settings).cell }}>

                    <h3 
                      contentEditable={true} 
                      suppressContentEditableWarning={true}
                      className="font-bold underline outline-none hover:bg-slate-50 px-0.5 rounded"
                      style={{ color: '#000000' }}
                    >
                      Declaration
                    </h3>
                    <p 
                      contentEditable={true} 
                      suppressContentEditableWarning={true}
                      className="text-[10px] leading-normal outline-none hover:bg-slate-50 px-0.5 rounded whitespace-pre-line"
                      style={{ color: '#000000' }}
                      onBlur={e => setFields({...fields, declaration: e.target.innerText})}
                    >
                      {fields.declaration}
                    </p>
                  </div>
                  <div className="p-3 flex flex-col justify-between items-end h-28 text-right">
                    <span 
                      contentEditable={true} 
                      suppressContentEditableWarning={true}
                      className="font-bold text-[10px] outline-none hover:bg-slate-50 px-0.5 rounded"
                      style={{ color: '#000000' }}
                      onBlur={e => setFields({...fields, signatoryLabel: e.target.innerText})}
                    >
                      {fields.signatoryLabel}
                    </span>
                    <div 
                      contentEditable={true} 
                      suppressContentEditableWarning={true}
                      className="border-t border-slate-300 w-44 pt-1 font-semibold text-center text-[10px] uppercase tracking-wider outline-none hover:bg-slate-50"
                      style={{ color: '#000000' }}
                      onBlur={e => setFields({...fields, signatoryRole: e.target.innerText})}
                    >
                      {fields.signatoryRole}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* Footer actions */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-t border-slate-200 dark:border-slate-700 flex flex-col-reverse sm:flex-row justify-between items-center gap-2 sm:gap-2.5 bg-slate-50 dark:bg-slate-800/50 no-print">
          <div>
            {pdfError && <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">{pdfError}</span>}
          </div>
          <div className="flex items-center gap-2 sm:gap-2.5 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              disabled={downloadingPdf}
              className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 text-sm font-semibold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handlePrint}
              disabled={downloadingPdf || loading}
              className="w-full sm:w-auto flex items-center justify-center space-x-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg shadow-sm transition"
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

      </div>
    </div>
  )

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body)
  }
  return modalContent
}

export default PrintPreviewModal
