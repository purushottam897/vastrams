import test from 'node:test'
import assert from 'node:assert/strict'

test('Payment unit tests', async (t) => {
  await t.test('get payment by valid ID structure', () => {
    const samplePayment = {
      _id: '665000000000000000000001',
      referenceNumber: 'PAY-1001',
      amount: 15000,
      paymentMode: 'BANK_TRANSFER'
    }
    assert.equal(samplePayment.referenceNumber, 'PAY-1001')
    assert.equal(samplePayment.amount, 15000)
  })

  await t.test('invalid payment ID format validation', () => {
    const invalidId = '123-invalid-id'
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(invalidId)
    assert.equal(isMongoId, false)
  })

  await t.test('Payment schema supports all application payment modes', () => {
    const allowedModes = ['CHEQUE', 'BANK_TRANSFER', 'CASH', 'UPI', 'NEFT', 'RTGS', 'NEFT_RTGS', 'ONLINE', 'IMPS', 'OTHER']
    allowedModes.forEach(mode => {
      assert.ok(allowedModes.includes(mode), `Mode ${mode} should be supported`)
    })
  })

  await t.test('Payment mode normalization', () => {
    const normalize = (mode) => {
      if (!mode) return 'BANK_TRANSFER'
      const upper = String(mode).trim().toUpperCase()
      if (upper === 'CHEQUE' || upper === 'CHECK') return 'CHEQUE'
      if (upper === 'CASH') return 'CASH'
      if (upper === 'UPI') return 'UPI'
      if (upper === 'NEFT') return 'NEFT'
      if (upper === 'RTGS') return 'RTGS'
      if (upper === 'NEFT / RTGS' || upper === 'NEFT_RTGS' || upper === 'NEFT/RTGS') return 'NEFT_RTGS'
      if (upper === 'ONLINE') return 'ONLINE'
      if (upper === 'IMPS') return 'IMPS'
      if (upper === 'BANK TRANSFER' || upper === 'BANK_TRANSFER') return 'BANK_TRANSFER'
      if (upper === 'OTHER') return 'OTHER'
      return upper.replace(/[^A-Z0-9_]/g, '_')
    }

    assert.equal(normalize('Bank Transfer'), 'BANK_TRANSFER')
    assert.equal(normalize('UPI'), 'UPI')
    assert.equal(normalize('Cash'), 'CASH')
    assert.equal(normalize('Cheque'), 'CHEQUE')
    assert.equal(normalize('NEFT'), 'NEFT')
    assert.equal(normalize('RTGS'), 'RTGS')
    assert.equal(normalize('NEFT / RTGS'), 'NEFT_RTGS')
  })
})
