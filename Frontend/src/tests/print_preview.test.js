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
  })
})
