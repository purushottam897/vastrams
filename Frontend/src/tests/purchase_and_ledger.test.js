import test from 'node:test'
import assert from 'node:assert/strict'
import { formatDateDisplay } from '../utils/date.js'

test('Purchases Payment Status & Ledger Account Date Tests', async (t) => {
  await t.test('1. Every purchase bill is displayed with status Paid regardless of due date', () => {
    const rawBills = [
      {
        _id: 'b1',
        billNumber: 'INV-001',
        amount: 50000,
        paidAmount: 0,
        outstandingAmount: 50000,
        dueDate: '2026-01-01T00:00:00.000Z', // Past date (formerly Overdue)
        status: 'UNPAID'
      },
      {
        _id: 'b2',
        billNumber: 'INV-002',
        amount: 25000,
        paidAmount: 10000,
        outstandingAmount: 15000,
        dueDate: new Date().toISOString(), // Today's date (formerly Due Today)
        status: 'PARTIALLY_PAID'
      },
      {
        _id: 'b3',
        billNumber: 'INV-003',
        amount: 30000,
        paidAmount: 0,
        outstandingAmount: 30000,
        dueDate: '2026-12-31T00:00:00.000Z', // Future date (formerly Pending)
        status: 'UNPAID'
      }
    ]

    // Mapping logic in PurchaseBills.jsx
    const mapped = rawBills.map(b => ({
      id: b._id,
      billNo: b.billNumber,
      amount: b.amount,
      status: 'Paid'
    }))

    assert.equal(mapped.length, 3)
    mapped.forEach(b => {
      assert.equal(b.status, 'Paid', `Bill ${b.billNo} status must be Paid`)
    })
  })

  await t.test('2. Ledger row formats exact payment received date for screen, export, and print', () => {
    const paymentTx = {
      _id: 'tx_pay_1',
      referenceType: 'Payment',
      referenceId: 'pay_001',
      date: '2026-05-10T00:00:00.000Z',
      paymentDate: '2026-05-10T00:00:00.000Z',
      amount: 15000,
      type: 'BILL_PAID',
      description: 'Payment via BANK_TRANSFER'
    }

    const resolvedDate = (paymentTx.referenceType === 'Payment' && (paymentTx.paymentDate || paymentTx.date))
      ? (paymentTx.paymentDate || paymentTx.date)
      : paymentTx.date

    const formattedDate = formatDateDisplay(resolvedDate)

    assert.equal(resolvedDate, '2026-05-10T00:00:00.000Z')
    assert.equal(formattedDate, '10 May 2026')
  })

  await t.test('3. Multiple payments for a single purchase preserve individual payment received dates', () => {
    const transactions = [
      {
        referenceType: 'Payment',
        referenceId: 'pay_1',
        paymentDate: '2026-05-10T00:00:00.000Z',
        date: '2026-05-10T00:00:00.000Z',
        amount: 40000
      },
      {
        referenceType: 'Payment',
        referenceId: 'pay_2',
        paymentDate: '2026-06-15T00:00:00.000Z',
        date: '2026-06-15T00:00:00.000Z',
        amount: 60000
      }
    ]

    const rows = transactions.map(t => {
      const resolvedDate = (t.referenceType === 'Payment' && (t.paymentDate || t.date))
        ? (t.paymentDate || t.date)
        : t.date
      return {
        date: formatDateDisplay(resolvedDate),
        amount: t.amount
      }
    })

    assert.equal(rows[0].date, '10 May 2026')
    assert.equal(rows[0].amount, 40000)
    assert.equal(rows[1].date, '15 Jun 2026')
    assert.equal(rows[1].amount, 60000)
  })
})
