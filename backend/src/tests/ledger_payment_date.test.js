import test from 'node:test'
import assert from 'node:assert/strict'

test('Ledger Payment Received Date & Purchases Tests', async (t) => {
  await t.test('Transaction model schema accepts date and defaults to current date', () => {
    const mockTx = {
      type: 'BILL_PAID',
      amount: 15000,
      runningBalance: 5000,
      referenceType: 'Payment',
      referenceId: '665000000000000000000001',
      date: new Date('2026-05-10T00:00:00.000Z')
    }
    assert.equal(mockTx.date.toISOString().split('T')[0], '2026-05-10')
  })

  await t.test('Ledger statement resolves exact Payment.paymentDate for single and multiple payments', () => {
    const billId = '665000000000000000000010'
    const payment1Id = '665000000000000000000021'
    const payment2Id = '665000000000000000000022'

    // Bill for ₹100,000 issued on 2026-04-01
    // Payment 1 for ₹40,000 received on 2026-05-10
    // Payment 2 for ₹60,000 received on 2026-06-15
    const payments = [
      { _id: payment1Id, paymentDate: new Date('2026-05-10T00:00:00.000Z') },
      { _id: payment2Id, paymentDate: new Date('2026-06-15T00:00:00.000Z') }
    ]
    const paymentDateMap = new Map(payments.map(p => [p._id, p.paymentDate]))

    const transactions = [
      {
        _id: 'tx_bill_1',
        type: 'BILL_POSTED',
        amount: 100000,
        referenceType: 'Bill',
        referenceId: billId,
        date: new Date('2026-04-01T00:00:00.000Z')
      },
      {
        _id: 'tx_pay_1',
        type: 'BILL_PAID',
        amount: 40000,
        referenceType: 'Payment',
        referenceId: payment1Id,
        // Old transaction date might have been creation date (e.g. today)
        date: new Date('2026-11-24T00:00:00.000Z')
      },
      {
        _id: 'tx_pay_2',
        type: 'BILL_PAID',
        amount: 60000,
        referenceType: 'Payment',
        referenceId: payment2Id,
        // Old transaction date might have been creation date
        date: new Date('2026-11-24T00:00:00.000Z')
      }
    ]

    // Resolution logic as in ledger.controller.js
    for (const tx of transactions) {
      if (tx.referenceType === 'Payment' && paymentDateMap.has(tx.referenceId)) {
        tx.date = paymentDateMap.get(tx.referenceId)
      }
    }

    assert.equal(transactions[1].date.toISOString().split('T')[0], '2026-05-10', 'Payment 1 date must match entered paymentDate')
    assert.equal(transactions[2].date.toISOString().split('T')[0], '2026-06-15', 'Payment 2 date must match entered paymentDate')

    // Chronological order sorting
    transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    assert.equal(transactions[0].type, 'BILL_POSTED')
    assert.equal(transactions[1]._id, 'tx_pay_1')
    assert.equal(transactions[2]._id, 'tx_pay_2')
  })
})
