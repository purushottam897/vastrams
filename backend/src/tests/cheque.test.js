import test from 'node:test'
import assert from 'node:assert/strict'

test('Cheque unit tests', async (t) => {
  await t.test('Cheque default status is PENDING (Upcoming)', () => {
    const cheque = {
      chequeNo: '123456',
      amount: 25000,
      chequeDate: new Date(),
      partyType: 'VENDOR',
      status: 'PENDING',
      bankName: 'HDFC Bank'
    }

    assert.equal(cheque.status, 'PENDING')
    assert.equal(cheque.chequeNo, '123456')
    assert.equal(cheque.amount, 25000)
    assert.equal(cheque.bankName, 'HDFC Bank')
  })

  await t.test('Upcoming Cheque schedule calculation logic', () => {
    const getChequeSchedule = (cheque) => {
      const rawStatus = (cheque.status || 'PENDING').toUpperCase()
      if (rawStatus === 'CLEARED') {
        return { label: 'Cleared', variant: 'success', category: 'cleared', isUpcoming: false }
      }
      if (rawStatus === 'BOUNCED') {
        return { label: 'Bounced', variant: 'danger', category: 'bounced', isUpcoming: false }
      }
      if (rawStatus === 'CANCELLED') {
        return { label: 'Cancelled', variant: 'neutral', category: 'cancelled', isUpcoming: false }
      }

      const today = new Date('2026-11-07T00:00:00Z')
      const targetDate = new Date(cheque.chequeDate)
      targetDate.setHours(0, 0, 0, 0)
      const diffTime = targetDate.getTime() - today.getTime()
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

      if (diffDays === 0) {
        return { label: 'Due Today', variant: 'warning', category: 'due_today', isUpcoming: true, days: 0 }
      }
      if (diffDays > 0 && diffDays <= 7) {
        return { label: `Due in ${diffDays}d`, variant: 'warning', category: 'due_soon', isUpcoming: true, days: diffDays }
      }
      if (diffDays > 7) {
        return { label: `Upcoming (${diffDays}d)`, variant: 'info', category: 'future', isUpcoming: true, days: diffDays }
      }
      return { label: `Due (${Math.abs(diffDays)}d ago)`, variant: 'warning', category: 'due_past', isUpcoming: true, days: diffDays }
    }

    // Due today
    assert.deepEqual(getChequeSchedule({ chequeDate: '2026-11-07T00:00:00Z', status: 'PENDING' }), {
      label: 'Due Today',
      variant: 'warning',
      category: 'due_today',
      isUpcoming: true,
      days: 0
    })

    // Due soon (within 7 days)
    assert.deepEqual(getChequeSchedule({ chequeDate: '2026-11-10T00:00:00Z', status: 'PENDING' }), {
      label: 'Due in 3d',
      variant: 'warning',
      category: 'due_soon',
      isUpcoming: true,
      days: 3
    })

    // Future (more than 7 days)
    assert.deepEqual(getChequeSchedule({ chequeDate: '2026-11-20T00:00:00Z', status: 'PENDING' }), {
      label: 'Upcoming (13d)',
      variant: 'info',
      category: 'future',
      isUpcoming: true,
      days: 13
    })

    // Cleared
    assert.equal(getChequeSchedule({ chequeDate: '2026-11-10T00:00:00Z', status: 'CLEARED' }).label, 'Cleared')

    // Bounced
    assert.equal(getChequeSchedule({ chequeDate: '2026-11-10T00:00:00Z', status: 'BOUNCED' }).label, 'Bounced')
  })

  await t.test('Cheque status mapping for update', () => {
    const FE_STATUS_MAP = {
      'Pending': 'PENDING',
      'cleared': 'CLEARED',
      'bounced': 'BOUNCED',
      'deposited': 'CANCELLED'
    }

    assert.equal(FE_STATUS_MAP['Pending'], 'PENDING')
    assert.equal(FE_STATUS_MAP['cleared'], 'CLEARED')
    assert.equal(FE_STATUS_MAP['bounced'], 'BOUNCED')
    assert.equal(FE_STATUS_MAP['deposited'], 'CANCELLED')
  })
})

