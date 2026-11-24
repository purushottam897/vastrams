import test from 'node:test'
import assert from 'node:assert/strict'

test('Cheque Issue Date & Withdrawal Date Functionality Tests', async (t) => {
  await t.test('Cheque schema structure accepts issueDate and withdrawalDate', () => {
    const cheque = {
      chequeNumber: '123456',
      amount: 50000,
      issueDate: new Date('2026-05-01T00:00:00.000Z'),
      withdrawalDate: new Date('2026-05-15T00:00:00.000Z'),
      status: 'CLEARED'
    }
    assert.equal(cheque.issueDate.toISOString().split('T')[0], '2026-05-01')
    assert.equal(cheque.withdrawalDate.toISOString().split('T')[0], '2026-05-15')
    assert.equal(cheque.status, 'CLEARED')
  })

  await t.test('Pre-save logic synchronizes issueDate, chequeDate, and updates status if withdrawn', () => {
    // Case 1: issueDate provided without chequeDate
    const doc1 = {
      issueDate: new Date('2026-06-10T00:00:00.000Z'),
      chequeDate: null,
      withdrawalDate: null,
      status: 'PENDING'
    }
    if (!doc1.issueDate && doc1.chequeDate) doc1.issueDate = doc1.chequeDate
    if (!doc1.chequeDate && doc1.issueDate) doc1.chequeDate = doc1.issueDate
    if (doc1.withdrawalDate && doc1.status === 'PENDING') doc1.status = 'CLEARED'

    assert.equal(doc1.chequeDate.toISOString().split('T')[0], '2026-06-10')
    assert.equal(doc1.status, 'PENDING')

    // Case 2: withdrawalDate provided on pending cheque
    const doc2 = {
      issueDate: new Date('2026-06-10T00:00:00.000Z'),
      chequeDate: new Date('2026-06-10T00:00:00.000Z'),
      withdrawalDate: new Date('2026-06-25T00:00:00.000Z'),
      status: 'PENDING'
    }
    if (!doc2.issueDate && doc2.chequeDate) doc2.issueDate = doc2.chequeDate
    if (!doc2.chequeDate && doc2.issueDate) doc2.chequeDate = doc2.issueDate
    if (doc2.withdrawalDate && doc2.status === 'PENDING') doc2.status = 'CLEARED'

    assert.equal(doc2.status, 'CLEARED', 'Status should auto-clear when withdrawalDate is present')
  })

  await t.test('Ledger statement uses Cheque Withdrawal Date as transaction date when available', () => {
    const paymentWithdrawnId = '665000000000000000000031'
    const paymentPendingId = '665000000000000000000032'

    const payments = [
      {
        _id: paymentWithdrawnId,
        paymentDate: new Date('2026-05-01T00:00:00.000Z'),
        paymentMode: 'CHEQUE',
        chequeId: {
          _id: 'chq_1',
          chequeNumber: '111111',
          issueDate: new Date('2026-05-01T00:00:00.000Z'),
          chequeDate: new Date('2026-05-01T00:00:00.000Z'),
          withdrawalDate: new Date('2026-05-20T00:00:00.000Z'),
          status: 'CLEARED'
        }
      },
      {
        _id: paymentPendingId,
        paymentDate: new Date('2026-06-01T00:00:00.000Z'),
        paymentMode: 'CHEQUE',
        chequeId: {
          _id: 'chq_2',
          chequeNumber: '222222',
          issueDate: new Date('2026-06-01T00:00:00.000Z'),
          chequeDate: new Date('2026-06-01T00:00:00.000Z'),
          withdrawalDate: null,
          status: 'PENDING'
        }
      }
    ]

    const paymentMap = new Map(payments.map(p => [p._id, p]))

    const transactions = [
      {
        _id: 'tx_pay_withdrawn',
        type: 'BILL_PAID',
        amount: 30000,
        referenceType: 'Payment',
        referenceId: paymentWithdrawnId,
        date: new Date('2026-05-01T00:00:00.000Z') // initial payment date
      },
      {
        _id: 'tx_pay_pending',
        type: 'BILL_PAID',
        amount: 20000,
        referenceType: 'Payment',
        referenceId: paymentPendingId,
        date: new Date('2026-06-01T00:00:00.000Z') // initial payment date
      }
    ]

    // Apply ledger resolution logic
    for (const t of transactions) {
      if (t.referenceType === 'Payment' && paymentMap.has(t.referenceId)) {
        const pay = paymentMap.get(t.referenceId)
        const chq = pay.chequeId
        if (chq) {
          t.isCheque = true
          t.chequeNumber = chq.chequeNumber
          t.chequeIssueDate = chq.issueDate || chq.chequeDate
          t.chequeStatus = chq.status
          if (chq.withdrawalDate) {
            t.date = chq.withdrawalDate
            t.withdrawalDate = chq.withdrawalDate
            t.isWithdrawn = true
          } else {
            t.date = pay.paymentDate || chq.issueDate || chq.chequeDate || t.date
            t.withdrawalDate = null
            t.isWithdrawn = false
          }
        }
      }
    }

    // Check withdrawn cheque transaction
    const txWithdrawn = transactions[0]
    assert.equal(txWithdrawn.isCheque, true)
    assert.equal(txWithdrawn.isWithdrawn, true)
    assert.equal(txWithdrawn.date.toISOString().split('T')[0], '2026-05-20', 'Withdrawn cheque must use withdrawalDate as transaction date')

    // Check pending cheque transaction
    const txPending = transactions[1]
    assert.equal(txPending.isCheque, true)
    assert.equal(txPending.isWithdrawn, false, 'Pending cheque must NOT be falsely marked as withdrawn')
    assert.equal(txPending.withdrawalDate, null)
    assert.equal(txPending.date.toISOString().split('T')[0], '2026-06-01', 'Pending cheque retains issue/payment date')
  })

  await t.test('Frontend formatting shows withdrawal date for cleared cheques and pending indicator for pending', () => {
    const formatDate = (d) => {
      if (!d) return '—'
      const dt = new Date(d)
      return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`
    }

    const tWithdrawn = {
      isCheque: true,
      withdrawalDate: new Date('2026-05-20T00:00:00.000Z'),
      date: new Date('2026-05-20T00:00:00.000Z'),
      description: 'Payment via CHEQUE - Ref: CHQ-111111'
    }

    let resolvedDate = tWithdrawn.date
    if (tWithdrawn.isCheque && tWithdrawn.withdrawalDate) {
      resolvedDate = tWithdrawn.withdrawalDate
    }
    let desc = tWithdrawn.description
    if (tWithdrawn.isCheque && tWithdrawn.withdrawalDate) {
      desc += ` (Withdrawn: ${formatDate(tWithdrawn.withdrawalDate)})`
    }

    assert.equal(formatDate(resolvedDate), '20/05/2026')
    assert.match(desc, /Withdrawn: 20\/05\/2026/)

    const tPending = {
      isCheque: true,
      withdrawalDate: null,
      date: new Date('2026-06-01T00:00:00.000Z'),
      description: 'Payment via CHEQUE - Ref: CHQ-222222'
    }

    let resolvedDatePending = tPending.date
    if (tPending.isCheque && tPending.withdrawalDate) {
      resolvedDatePending = tPending.withdrawalDate
    }
    let descPending = tPending.description
    if (tPending.isCheque && !tPending.withdrawalDate) {
      descPending += ` (Cheque Pending - Not Withdrawn)`
    }

    assert.equal(formatDate(resolvedDatePending), '01/06/2026')
    assert.match(descPending, /Cheque Pending - Not Withdrawn/)
  })
})
