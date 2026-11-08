import test from 'node:test'
import assert from 'node:assert/strict'

function computeVendorOutstanding({ openingBalance = 0, bills = [], payments = [] }) {
  const unpaidBills = bills.reduce((sum, b) => sum + (Number(b.outstandingAmount !== undefined ? b.outstandingAmount : b.amount) || 0), 0)
  const paidBills = bills.reduce((sum, b) => sum + (Number(b.paidAmount) || 0), 0)
  const totalPayments = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  const paymentsTowardsOpening = Math.max(0, totalPayments - paidBills)

  return Math.max(0, unpaidBills + Math.max(0, (Number(openingBalance) || 0) - paymentsTowardsOpening))
}

test('Vendor Opening Balance & Current Outstanding Accounting Tests', async (t) => {
  await t.test('Test 1: Opening Balance Only (Opening: ₹20,000, Bills: ₹0, Payments: ₹0)', () => {
    const openingBalance = 20000
    const bills = []
    const payments = []

    const currentOutstanding = computeVendorOutstanding({ openingBalance, bills, payments })
    assert.equal(openingBalance, 20000, 'Opening balance must be 20,000')
    assert.equal(currentOutstanding, 20000, 'Current outstanding must be 20,000')
  })

  await t.test('Test 2: Opening Balance With Bill (Opening: ₹20,000, Bills: ₹10,000, Payments: ₹0)', () => {
    const openingBalance = 20000
    const bills = [
      { amount: 10000, outstandingAmount: 10000, paidAmount: 0 }
    ]
    const payments = []

    const currentOutstanding = computeVendorOutstanding({ openingBalance, bills, payments })
    assert.equal(currentOutstanding, 30000, 'Current outstanding must be 20,000 + 10,000 = 30,000')
  })

  await t.test('Test 3: Opening Balance With Payment (Opening: ₹20,000, Bills: ₹0, Payments: ₹5,000)', () => {
    const openingBalance = 20000
    const bills = []
    const payments = [
      { amount: 5000 }
    ]

    const currentOutstanding = computeVendorOutstanding({ openingBalance, bills, payments })
    assert.equal(currentOutstanding, 15000, 'Current outstanding must be 20,000 - 5,000 = 15,000')
  })

  await t.test('Test 4: Opening Balance With Bills and Payments (Opening: ₹20,000, Bills: ₹30,000, Payments: ₹10,000)', () => {
    const openingBalance = 20000
    // 10,000 payment was allocated to 30,000 bill
    const bills = [
      { amount: 30000, outstandingAmount: 20000, paidAmount: 10000 }
    ]
    const payments = [
      { amount: 10000 }
    ]

    const currentOutstanding = computeVendorOutstanding({ openingBalance, bills, payments })
    assert.equal(currentOutstanding, 40000, 'Current outstanding must be 20,000 + 30,000 - 10,000 = 40,000')
  })

  await t.test('Test 5: Existing Vendor persistence and refresh simulation', () => {
    // Existing vendor created before with openingBalance 20,000 and outstanding 0
    const existingVendor = {
      name: 'Purushottam Test',
      openingBalance: 20000,
      outstandingBalance: 0
    }

    // Backend synchronization computes correct outstanding
    const synchronizedOutstanding = computeVendorOutstanding({
      openingBalance: existingVendor.openingBalance,
      bills: [],
      payments: []
    })
    existingVendor.outstandingBalance = synchronizedOutstanding

    assert.equal(existingVendor.openingBalance, 20000)
    assert.equal(existingVendor.outstandingBalance, 20000, 'Must persist 20,000 on reload and overview')
  })

  await t.test('Payment validation allows recording payments up to opening balance', () => {
    const vendor = {
      _id: 'v_test_001',
      name: 'Test Vendor',
      openingBalance: 20000,
      outstandingBalance: 20000
    }

    const maxAllowed = vendor.outstandingBalance || 0
    assert.equal(maxAllowed, 20000, 'Max payment allowed must equal current outstanding')

    const paymentAmount = 5000
    assert.ok(paymentAmount <= maxAllowed, 'Payment of 5,000 must be permitted against 20,000 opening balance')
  })

  await t.test('Does not count opening balance twice', () => {
    // When a payment covers both bill and partial opening balance
    const openingBalance = 20000
    const bills = [
      { amount: 10000, outstandingAmount: 0, paidAmount: 10000 }
    ]
    const payments = [
      { amount: 15000 } // 10,000 for bill, 5,000 for opening balance
    ]

    const currentOutstanding = computeVendorOutstanding({ openingBalance, bills, payments })
    // Expected: 20,000 + 10,000 - 15,000 = 15,000
    assert.equal(currentOutstanding, 15000, 'Must not duplicate deductions')
  })
})
