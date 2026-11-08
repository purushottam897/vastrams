const Transaction = require('../models/Transaction')
const Vendor = require('../models/Vendor')
const Financier = require('../models/Financier')

class LedgerService {
  /**
   * Posts a new transaction entry to the unified ledger and recalculates cached outstandings.
   * @param {object} params - Transaction parameters
   * @param {string} params.type - Transaction type (BILL_POSTED, BILL_PAID, etc.)
   * @param {number} params.amount - Money amount involved
   * @param {string} [params.vendorId] - Vendor ID if associated
   * @param {string} [params.financierId] - Financier ID if associated
   * @param {string} params.referenceType - Source model name ('Bill', 'Payment', etc.)
   * @param {string} params.referenceId - Source document ID
   * @param {string} [params.description] - Summary narration text
   * @param {object} [session] - Optional transaction session
   */
  async postTransaction({
    type,
    amount,
    vendorId = null,
    financierId = null,
    referenceType,
    referenceId,
    description = ''
  }, session = null) {
    
    let runningBalance = 0

    // Case 1: Vendor payables update
    if (vendorId) {
      const vendor = await Vendor.findById(vendorId).session(session)
      if (!vendor) throw new Error('Vendor not found')

      if (vendor.outstandingBalance === 0 && (Number(vendor.openingBalance) || 0) > 0) {
        vendor.outstandingBalance = Number(vendor.openingBalance) || 0
      }

      // Add or subtract depending on transaction type
      if (type === 'BILL_POSTED') {
        vendor.outstandingBalance += amount
      } else if (type === 'BILL_PAID') {
        vendor.outstandingBalance = Math.max(0, vendor.outstandingBalance - amount)
      } else if (type === 'CHEQUE_BOUNCED_REVERSAL') {
        vendor.outstandingBalance += amount
      }

      await vendor.save({ session })
      runningBalance = vendor.outstandingBalance
    }

    // Case 2: Financier loan outstanding update
    if (financierId) {
      const financier = await Financier.findById(financierId).session(session)
      if (!financier) throw new Error('Financier not found')

      if (type === 'LOAN_DRAWDOWN') {
        financier.outstandingBalance += amount
      } else if (type === 'LOAN_REPAYMENT' || type === 'REPAYMENT_PRINCIPAL') {
        financier.outstandingBalance = Math.max(0, financier.outstandingBalance - amount)
      } else if (type === 'INTEREST_ACCRUED') {
        financier.outstandingBalance += amount
      }

      await financier.save({ session })
      runningBalance = financier.outstandingBalance
    }

    // Post to unified transaction log
    const tx = new Transaction({
      type,
      amount,
      runningBalance,
      vendorId,
      financierId,
      referenceType,
      referenceId,
      description
    })

    await tx.save({ session })
    return tx
  }
}

module.exports = new LedgerService()
