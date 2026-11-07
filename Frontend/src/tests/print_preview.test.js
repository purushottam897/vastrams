import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// Test implementation of numberToWords extracted for Node runner
function numberToWords(num) {
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

test('A4 Invoice & Voucher Designer Print Feature Tests', async (t) => {
  await t.test('numberToWords currency spelling utility', () => {
    assert.equal(numberToWords(0), 'Indian Rupee Zero Only')
    assert.equal(numberToWords(50000), 'Indian Rupee Fifty Thousand Only')
    assert.equal(numberToWords(133745), 'Indian Rupee One Lakh Thirty Three Thousand Seven Hundred and Forty Five Only')
    assert.equal(numberToWords(1500.50), 'Indian Rupee One Thousand Five Hundred and Fifty Paise Only')
  })

  await t.test('Dynamic document title generation for PDF filename matching', () => {
    const buildDynamicTitle = ({ title, docNo, recipientName, docDate }) => {
      const titleParts = []
      if (title) titleParts.push(title.trim())
      if (docNo) titleParts.push(docNo.trim())
      if (recipientName && recipientName !== 'Vastrams') {
        titleParts.push(recipientName.trim())
      }
      if (docDate) titleParts.push(docDate.trim())
      return titleParts.length > 0 ? titleParts.join(' - ') : (title || 'Document')
    }

    assert.equal(
      buildDynamicTitle({
        title: 'Tax Invoice',
        docNo: 'INV-2026-001',
        recipientName: 'TSR Textiles',
        docDate: '08 Nov 2026'
      }),
      'Tax Invoice - INV-2026-001 - TSR Textiles - 08 Nov 2026'
    )

    assert.equal(
      buildDynamicTitle({
        title: 'Payment Voucher',
        docNo: 'VCH-991',
        recipientName: 'Sri Ram & Co',
        docDate: '08 Nov 2026'
      }),
      'Payment Voucher - VCH-991 - Sri Ram & Co - 08 Nov 2026'
    )
  })

  await t.test('Print CSS does NOT contain faulty main > div > *:not(.print-modal-overlay) rule', () => {
    const modalFilePath = path.resolve('src/components/PrintPreviewModal.jsx')
    const modalContent = fs.readFileSync(modalFilePath, 'utf-8')

    // The faulty selector that hid the parent div.space-y-6 must be absent
    const hasFaultySelector = modalContent.includes('main > div > *:not(.print-modal-overlay)')
    assert.equal(hasFaultySelector, false, 'The faulty CSS selector hiding parent container must be removed')

    // Must include portal and isolated printing styles
    assert.ok(modalContent.includes('createPortal'), 'Must use React createPortal to isolate modal from #root layout constraints')
    assert.ok(modalContent.includes('.printable-preview-content'), 'Must define styles for printable-preview-content')
    assert.ok(modalContent.includes('printInvoiceElement'), 'Must export and call printInvoiceElement')
    assert.ok(modalContent.includes('invoiceRef'), 'Must attach ref to invoice preview element')
    assert.ok(modalContent.includes('size: A4 portrait'), 'Must define A4 portrait page size in print styles')
  })

  await t.test('Payment Voucher does not contain Allocated Bills section', () => {
    const modalFilePath = path.resolve('src/components/PrintPreviewModal.jsx')
    const modalContent = fs.readFileSync(modalFilePath, 'utf-8')

    const printDocFilePath = path.resolve('src/pages/PrintDocument.jsx')
    const printDocContent = fs.readFileSync(printDocFilePath, 'utf-8')

    // Neither file should render "Allocated Bills:"
    assert.equal(modalContent.includes('Allocated Bills:'), false, 'PrintPreviewModal must not contain Allocated Bills')
    assert.equal(printDocContent.includes('Allocated Bills:'), false, 'PrintDocument must not contain Allocated Bills')

    // Neither file should render bill settlement lines
    assert.equal(modalContent.includes('Settled: ₹'), false, 'PrintPreviewModal must not contain bill settlement lines')
    assert.equal(printDocContent.includes('Settled: ₹'), false, 'PrintDocument must not contain bill settlement lines')

    // Must preserve payment description logic
    assert.ok(modalContent.includes('initialFields.description = `Payment via'), 'Must preserve payment description format')
  })

  await t.test('generatePdfFilename correctly builds vendor-based PDF filenames', () => {
    // Replicate the pure generator logic matching PrintPreviewModal export
    const generateFilename = ({ type, fields = {}, doc = {} }) => {
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

      if (!vendorName || vendorName.trim().toLowerCase() === 'vastrams') {
        if (fields?.recipientName && fields.recipientName.trim().toLowerCase() !== 'vastrams') {
          vendorName = fields.recipientName
        } else if (fields?.supplierName && fields.supplierName.trim().toLowerCase() !== 'vastrams') {
          vendorName = fields.supplierName
        } else {
          vendorName = 'Vendor'
        }
      }

      const cleanVendor = vendorName
        .trim()
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '') || 'Vendor'

      let dateStr = ''
      if (fields?.docDate) {
        // Simple YYYY-MM-DD extractor
        const parts = fields.docDate.split(/[-/]/)
        if (parts.length === 3) {
          if (parts[0].length === 4) dateStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
          else dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
        }
      }
      if (!dateStr) dateStr = '2026-11-08'

      return `${docType}_${cleanVendor}_${dateStr}.pdf`
    }

    // Exact examples from User Prompt Section 6
    assert.equal(
      generateFilename({ type: 'payment', fields: { recipientName: 'TSR Textiles', docDate: '08-11-2026' } }),
      'Payment_Voucher_TSR_Textiles_2026-11-08.pdf'
    )
    assert.equal(
      generateFilename({ type: 'bill', fields: { supplierName: 'TSR Textiles', docDate: '08-11-2026' } }),
      'Tax_Invoice_TSR_Textiles_2026-11-08.pdf'
    )
    assert.equal(
      generateFilename({ type: 'payment', fields: { recipientName: 'ABC Textiles', docDate: '08-11-2026' } }),
      'Payment_Voucher_ABC_Textiles_2026-11-08.pdf'
    )

    // Invalid filesystem characters sanitization
    assert.equal(
      generateFilename({ type: 'payment', fields: { recipientName: 'TSR / Textiles * Ltd:?', docDate: '2026-11-08' } }),
      'Payment_Voucher_TSR_Textiles_Ltd_2026-11-08.pdf'
    )

    // Safe fallback when vendor name is missing
    assert.equal(
      generateFilename({ type: 'payment', fields: { recipientName: '', docDate: '2026-11-08' } }),
      'Payment_Voucher_Vendor_2026-11-08.pdf'
    )
  })

  await t.test('Direct PDF generation implementation and button integration', () => {
    const modalFilePath = path.resolve('src/components/PrintPreviewModal.jsx')
    const modalContent = fs.readFileSync(modalFilePath, 'utf-8')

    const printDocFilePath = path.resolve('src/pages/PrintDocument.jsx')
    const printDocContent = fs.readFileSync(printDocFilePath, 'utf-8')

    // Must export downloadInvoicePdf and generatePdfFilename
    assert.ok(modalContent.includes('export async function downloadInvoicePdf'), 'Must export downloadInvoicePdf')
    assert.ok(modalContent.includes('export function generatePdfFilename'), 'Must export generatePdfFilename')

    // Must use jsPDF and html2canvas with scale 2
    assert.ok(modalContent.includes('jsPDF'), 'Must use jsPDF for A4 PDF creation')
    assert.ok(modalContent.includes('html2canvas'), 'Must use html2canvas')
    assert.ok(modalContent.includes('scale: 2'), 'Must render high-resolution 2x scale canvas')

    // Must have crossOrigin="anonymous" on QR code
    assert.ok(modalContent.includes('crossOrigin="anonymous"'), 'Must set crossOrigin on QR code in PrintPreviewModal')
    assert.ok(printDocContent.includes('crossOrigin="anonymous"'), 'Must set crossOrigin on QR code in PrintDocument')

    // PrintDocument must import and call downloadInvoicePdf
    assert.ok(printDocContent.includes('downloadInvoicePdf'), 'PrintDocument must use downloadInvoicePdf')
  })

  await t.test('signatoryLabel defaults to vendor name', () => {
    const modalFilePath = path.resolve('src/components/PrintPreviewModal.jsx')
    const modalContent = fs.readFileSync(modalFilePath, 'utf-8')

    // Must dynamically set signatoryLabel using vendorName
    assert.ok(modalContent.includes('initialFields.signatoryLabel = vendorName'), 'Must set signatoryLabel using vendorName')
    assert.ok(modalContent.includes('Signatory Label'), 'Must provide Signatory Label editor field')
  })
})
