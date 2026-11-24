import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fmtNumber,
  fmtCurrency,
  sanitizeFilename,
  getTodayDateString,
  buildFinanceSummaryHtml,
  buildFinancierProfileHtml,
  buildLoansRegisterHtml,
  buildFinancierRepaymentsHtml
} from '../utils/financePdf.js'

test('Finance Section PDF Generator Tests', async (t) => {
  await t.test('1. Formatting Utilities: numbers, currencies, dates, and filename sanitation', () => {
    assert.equal(fmtNumber(150000), '1,50,000')
    assert.equal(fmtCurrency(275000), '₹2,75,000')
    assert.equal(fmtCurrency(0), '₹0')
    assert.equal(fmtCurrency(null), '₹0')

    assert.equal(sanitizeFilename('Apex Capital (Pvt) Ltd.'), 'Apex_Capital_Pvt_Ltd_')
    assert.equal(sanitizeFilename('ABC/Finance\\2026'), 'ABC_Finance_2026')
    assert.match(getTodayDateString(), /^\d{4}-\d{2}-\d{2}$/)
  })

  await t.test('2. Finance Summary PDF HTML correctly reflects displayed financiers and totals', () => {
    const mockFinanciers = [
      {
        id: 'fin_1',
        name: 'Apex Finance Corp',
        phone: '9876543210',
        address: '101 Commercial St, Bangalore',
        defaultInterestRate: 12.5,
        loansCount: 2,
        outstanding: 350000,
        status: 'Active'
      },
      {
        id: 'fin_2',
        name: 'Shree Ganesh Credit',
        phone: '9123456780',
        address: '42 Ring Road, Surat',
        defaultInterestRate: 14,
        loansCount: 1,
        outstanding: 150000,
        status: 'Active'
      }
    ]

    const html = buildFinanceSummaryHtml({
      financiers: mockFinanciers,
      companyProfile: {
        businessName: 'Vastrams Apparels',
        phone: '9998887776',
        gstin: '29ABCDE1234F1Z5'
      },
      search: '',
      statusFilter: 'ALL'
    })

    assert.match(html, /VASTRAMS APPARELS/i, 'Company name should be present in header')
    assert.match(html, /Finance Statement/i, 'Document title should be Finance Statement')
    assert.match(html, /Apex Finance Corp/, 'Financier name should be in table')
    assert.match(html, /Shree Ganesh Credit/, 'Second financier name should be in table')
    assert.match(html, /12\.5% p\.a\./, 'Interest rate should be formatted')
    assert.match(html, /₹3,50,000/, 'First financier balance should match')
    assert.match(html, /₹1,50,000/, 'Second financier balance should match')
    // Total exposure sum = 350000 + 150000 = 500000
    assert.match(html, /₹5,00,000/, 'Total outstanding exposure should sum correctly')
    // Total active facilities = 2 + 1 = 3
    assert.match(html, />3</, 'Total active loans count should be 3')
    assert.match(html, /Authorized Signatory/i, 'Signatory footer must be present')
  })

  await t.test('3. Financier Profile PDF HTML displays loan details, rates, and correct balances', () => {
    const mockProfile = {
      name: 'Southern Capital Ltd',
      phone: '9845012345',
      address: 'Industrial Estate, Tirupur',
      status: 'Active',
      defaultInterestRate: 11
    }

    const mockLoans = [
      {
        noteNo: 'LN-2026-001',
        date: '2026-04-10',
        maturityDate: '2027-04-10',
        interestRate: 11,
        amount: 500000,
        paid: 200000,
        outstanding: 300000,
        status: 'Active'
      },
      {
        noteNo: 'LN-2026-002',
        date: '2026-06-01',
        maturityDate: '2027-06-01',
        interestRate: 11,
        amount: 250000,
        paid: 250000,
        outstanding: 0,
        status: 'Closed'
      }
    ]

    const html = buildFinancierProfileHtml({
      profile: mockProfile,
      loans: mockLoans,
      companyProfile: { businessName: 'Vastrams' }
    })

    assert.match(html, /Southern Capital Ltd/, 'Financier name in statement header')
    assert.match(html, /LN-2026-001/, 'First loan note reference')
    assert.match(html, /LN-2026-002/, 'Second loan note reference')
    assert.match(html, /10 Apr 2026/, 'Drawdown date formatted correctly')
    assert.match(html, /₹5,00,000/, 'Loan 1 principal amount')
    assert.match(html, /₹2,00,000/, 'Loan 1 paid amount')
    assert.match(html, /₹3,00,000/, 'Loan 1 outstanding amount')
    // Totals: Disbursed = 750,000, Paid = 450,000, Outstanding = 300,000
    assert.match(html, /₹7,50,000/, 'Total disbursed amount sum')
    assert.match(html, /₹4,50,000/, 'Total paid amount sum')
    assert.match(html, /Active/, 'Active status pill')
    assert.match(html, /Closed/, 'Closed status pill')
  })

  await t.test('4. Loans Register PDF HTML includes transaction dates, interest rates, and exposure', () => {
    const mockLoans = [
      {
        noteNo: 'NOTE-101',
        financier: 'Apex Finance Corp',
        loanDate: '2026-03-15',
        maturityDate: '2027-03-15',
        rate: '13',
        amount: 400000,
        repaid: 100000,
        pending: 300000,
        status: 'Active'
      }
    ]

    const html = buildLoansRegisterHtml({
      loans: mockLoans,
      companyProfile: { businessName: 'Vastrams' },
      search: '',
      statusFilter: 'ALL',
      sortBy: 'newest'
    })

    assert.match(html, /Loans Register/i, 'Document title')
    assert.match(html, /NOTE-101/, 'Loan note number')
    assert.match(html, /Apex Finance Corp/, 'Financier name')
    assert.match(html, /15 Mar 2026/, 'Drawdown date')
    assert.match(html, /13% p\.a\./, 'Interest rate')
    assert.match(html, /₹4,00,000/, 'Principal amount')
    assert.match(html, /₹1,00,000/, 'Repaid amount')
    assert.match(html, /₹3,00,000/, 'Pending exposure')
  })

  await t.test('5. Financier Repayments PDF HTML includes transaction dates, payment modes, amounts', () => {
    const mockRepayments = [
      {
        ref: 'REP-7788',
        financier: 'Apex Finance Corp',
        date: '25-05-2026',
        mode: 'Cheque',
        amount: 75000,
        remarks: 'Part payment via Cheque #123456'
      },
      {
        ref: 'REP-7789',
        financier: 'Shree Ganesh Credit',
        date: '28-05-2026',
        mode: 'Bank Transfer',
        amount: 50000,
        remarks: 'NEFT transfer Ref UTR998877'
      }
    ]

    const html = buildFinancierRepaymentsHtml({
      repayments: mockRepayments,
      companyProfile: { businessName: 'Vastrams' }
    })

    assert.match(html, /Financier Repayments/i, 'Title')
    assert.match(html, /REP-7788/, 'First repayment voucher ref')
    assert.match(html, /REP-7789/, 'Second repayment voucher ref')
    assert.match(html, /25 May 2026/, 'First repayment date')
    assert.match(html, /28 May 2026/, 'Second repayment date')
    assert.match(html, /Cheque/, 'Payment mode Cheque')
    assert.match(html, /Bank Transfer/, 'Payment mode Bank Transfer')
    assert.match(html, /Part payment via Cheque #123456/, 'Remarks description')
    assert.match(html, /₹75,000/, 'First payment amount')
    assert.match(html, /₹50,000/, 'Second payment amount')
    // Total sum = 75000 + 50000 = 125000
    assert.match(html, /₹1,25,000/, 'Total repaid sum')
  })
})
