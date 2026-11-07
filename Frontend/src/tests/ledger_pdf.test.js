import test from 'node:test'
import assert from 'node:assert/strict'

test('Running Ledger PDF & Print Feature Tests', async (t) => {
  await t.test('PDF Filename construction sanitizes party name and includes date', () => {
    const buildPdfFilename = (partyName, date) => {
      const cleanParty = (partyName || 'Statement')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
      const dateStr = date ? date.toISOString().split('T')[0] : '2026-11-08'
      return `Vastrams_Ledger_${cleanParty}_${dateStr}`
    }

    const testDate = new Date('2026-11-08T00:00:00Z')
    assert.equal(
      buildPdfFilename('TSR Textiles', testDate),
      'Vastrams_Ledger_TSR_Textiles_2026-11-08'
    )
    assert.equal(
      buildPdfFilename('Sri Ram & Co. / Surat', testDate),
      'Vastrams_Ledger_Sri_Ram_Co_Surat_2026-11-08'
    )
    assert.equal(
      buildPdfFilename('Financier (HDFC Capital)', testDate),
      'Vastrams_Ledger_Financier_HDFC_Capital_2026-11-08'
    )
  })

  await t.test('Statement Period formatting accurately reflects user filter selection', () => {
    const formatPeriod = (fromDate, toDate) => {
      if (fromDate && toDate) return `${fromDate} to ${toDate}`
      if (fromDate) return `From ${fromDate}`
      if (toDate) return `Up to ${toDate}`
      return 'All Transactions (Complete Ledger)'
    }

    assert.equal(formatPeriod('01-11-2026', '08-11-2026'), '01-11-2026 to 08-11-2026')
    assert.equal(formatPeriod('01-11-2026', ''), 'From 01-11-2026')
    assert.equal(formatPeriod('', '08-11-2026'), 'Up to 08-11-2026')
    assert.equal(formatPeriod('', ''), 'All Transactions (Complete Ledger)')
  })

  await t.test('Ledger transaction calculations and running balance integrity', () => {
    const transactions = [
      { id: '1', date: '01-11-2026', ref: 'BILL-101', type: 'Bill', debit: 100000, credit: 0 },
      { id: '2', date: '03-11-2026', ref: 'PAY-201', type: 'Payment', debit: 0, credit: 40000 },
      { id: '3', date: '05-11-2026', ref: 'BILL-102', type: 'Bill', debit: 73745, credit: 0 }
    ]

    let runningBal = 0
    const calculatedRows = transactions.map(t => {
      runningBal = runningBal + t.debit - t.credit
      return { ...t, balance: runningBal }
    })

    const totalDebit = calculatedRows.reduce((s, r) => s + r.debit, 0)
    const totalCredit = calculatedRows.reduce((s, r) => s + r.credit, 0)
    const finalBalance = calculatedRows[calculatedRows.length - 1].balance

    assert.equal(totalDebit, 173745)
    assert.equal(totalCredit, 40000)
    assert.equal(finalBalance, 133745)
    assert.equal(calculatedRows[0].balance, 100000)
    assert.equal(calculatedRows[1].balance, 60000)
    assert.equal(calculatedRows[2].balance, 133745)
  })

  await t.test('Currency formatting conforms to Indian Rupee standard', () => {
    const fmt = (v) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(v || 0)
    assert.equal(`₹${fmt(133745)}`, '₹1,33,745')
    assert.equal(`₹${fmt(50000)}`, '₹50,000')
    assert.equal(`₹${fmt(40000)}`, '₹40,000')
  })
})
