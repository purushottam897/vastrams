const mongoose = require('mongoose')
const { createNotification } = require('../utils/notificationHelper')
const { broadcastEvent } = require('../utils/sse')
const Cheque = require('../models/Cheque')
const Payment = require('../models/Payment')
const Repayment = require('../models/Repayment')
const Bill = require('../models/Bill')
const Loan = require('../models/Loan')
const LedgerService = require('../services/ledger.service')

exports.createCheque = async (req, res, next) => {
  try {
    const { chequeNumber, type, partyName, amount, chequeDate, vendorId, financierId, bankName } = req.body
    const cheque = new Cheque({
      chequeNumber,
      type: type || 'ISSUED_VENDOR',
      partyName,
      amount,
      chequeDate,
      bankName: bankName || '',
      vendorId: vendorId || null,
      financierId: financierId || null,
      status: 'PENDING'
    })
    await cheque.save()
    broadcastEvent('data-changed', { entity: 'cheque', action: 'create' })
    res.status(201).json({ success: true, data: cheque })
  } catch (error) {
    next(error)
  }
}

exports.getCheques = async (req, res, next) => {
  try {
    const { status, type } = req.query
    const filter = { isDeleted: false }

    if (status) filter.status = status
    if (type) filter.type = type

    const cheques = await Cheque.find(filter)
      .populate('vendorId', 'name bankName')
      .populate('financierId', 'name')
      .sort({ chequeDate: 1, createdAt: -1 })

    res.status(200).json(cheques)
  } catch (error) {
    next(error)
  }
}

exports.updateChequeStatus = async (req, res, next) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const { id } = req.params
    const { status, bounceReason, bounceDate } = req.body

    const cheque = await Cheque.findById(id).session(session)
    if (!cheque) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Cheque not found' })
    }

    const previousStatus = cheque.status

    if (previousStatus === status) {
      await session.abortTransaction()
      session.endSession()
      return res.status(400).json({ success: false, message: `Cheque status is already ${status}` })
    }

    // Update cheque status first
    cheque.status = status
    if (status === 'BOUNCED') {
      cheque.bounceDate = bounceDate || new Date()
      cheque.bounceReason = bounceReason || 'Insufficient Funds'
    }
    await cheque.save({ session })

    // If cheque transitions to BOUNCED or CANCELLED from PENDING, trigger balance/ledger reversal
    if ((status === 'BOUNCED' || status === 'CANCELLED') && previousStatus === 'PENDING') {
      
      // Case A: Vendor Payment Cheque Bounced
      if (cheque.type === 'ISSUED_VENDOR') {
        const payment = await Payment.findOne({ chequeId: cheque._id }).session(session)
        if (payment) {
          // 1. Post a ledger reversal (adds payable balance back)
          await LedgerService.postTransaction({
            type: 'CHEQUE_BOUNCED_REVERSAL',
            amount: payment.amount,
            vendorId: cheque.vendorId,
            referenceType: 'Cheque',
            referenceId: cheque._id,
            description: `Payment cheque #${cheque.chequeNumber} bounced. Reverting settlement.`
          }, session)

          // 2. Unwind FIFO allocations (increase outstanding bills back)
          for (const alloc of payment.allocations) {
            const bill = await Bill.findById(alloc.billId).session(session)
            if (bill) {
              bill.paidAmount = Math.max(0, bill.paidAmount - alloc.allocatedAmount)
              bill.outstandingAmount += alloc.allocatedAmount
              
              if (bill.outstandingAmount === bill.amount) {
                bill.status = 'UNPAID'
              } else {
                bill.status = 'PARTIALLY_PAID'
              }
              await bill.save({ session })
            }
          }
        }
      }

      // Case B: Financier Loan Repayment Cheque Bounced
      if (cheque.type === 'ISSUED_FINANCIER') {
        const repayment = await Repayment.findOne({ chequeId: cheque._id }).session(session)
        if (repayment) {
          const loan = await Loan.findById(repayment.loanId).session(session)
          if (loan) {
            // 1. Revert loan outstanding parameters
            loan.paidPrincipal = Math.max(0, loan.paidPrincipal - repayment.principalPaid)
            loan.paidInterest = Math.max(0, loan.paidInterest - repayment.interestPaid)
            loan.outstandingPrincipal += repayment.principalPaid
            loan.status = 'ACTIVE'
            await loan.save({ session })

            // 2. Post ledger reversal (adds outstanding financier loan balance back)
            await LedgerService.postTransaction({
              type: 'LOAN_DRAWDOWN', // Drawdown increases outstanding financier balance, negating repayment
              amount: repayment.principalPaid,
              financierId: cheque.financierId,
              referenceType: 'Cheque',
              referenceId: cheque._id,
              description: `Repayment cheque #${cheque.chequeNumber} bounced. Reverting loan reduction.`
            }, session)

            if (repayment.interestPaid > 0) {
              // Post offset transaction for interest reversal
              await LedgerService.postTransaction({
                type: 'LOAN_DRAWDOWN',
                amount: repayment.interestPaid,
                financierId: cheque.financierId,
                referenceType: 'Cheque',
                referenceId: cheque._id,
                description: `Repayment cheque #${cheque.chequeNumber} bounced. Reverting interest payment.`
              }, session)
            }
          }
        }
      }
    }

    await session.commitTransaction()
    session.endSession()

    if (status === 'BOUNCED') {
      await createNotification({
        userId: req.user.id,
        type: 'alert',
        title: 'Cheque Bounced',
        message: `Cheque #${cheque.chequeNumber} for ${cheque.partyName || 'Party'} of ₹${cheque.amount.toLocaleString('en-IN')} has bounced.`,
        link: '/cheques'
      })
    }

    broadcastEvent('data-changed', { entity: 'cheque', action: 'update' })

    res.status(200).json({ success: true, data: cheque })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    next(error)
  }
}

exports.updateCheque = async (req, res, next) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const { id } = req.params
    const { chequeNumber, type, partyName, amount, chequeDate, vendorId, financierId, bankName, status, bounceReason, bounceDate } = req.body

    const cheque = await Cheque.findById(id).session(session)
    if (!cheque) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Cheque not found' })
    }

    const previousStatus = cheque.status
    const targetStatus = status || previousStatus

    // If cheque transitions to BOUNCED or CANCELLED from PENDING, trigger balance/ledger reversal
    if ((targetStatus === 'BOUNCED' || targetStatus === 'CANCELLED') && previousStatus === 'PENDING') {
      if (cheque.type === 'ISSUED_VENDOR') {
        const payment = await Payment.findOne({ chequeId: cheque._id }).session(session)
        if (payment) {
          await LedgerService.postTransaction({
            type: 'CHEQUE_BOUNCED_REVERSAL',
            amount: payment.amount,
            vendorId: cheque.vendorId,
            referenceType: 'Cheque',
            referenceId: cheque._id,
            description: `Payment cheque #${cheque.chequeNumber} bounced. Reverting settlement.`
          }, session)

          for (const alloc of payment.allocations) {
            const bill = await Bill.findById(alloc.billId).session(session)
            if (bill) {
              bill.paidAmount = Math.max(0, bill.paidAmount - alloc.allocatedAmount)
              bill.outstandingAmount += alloc.allocatedAmount
              bill.status = bill.outstandingAmount === bill.amount ? 'UNPAID' : 'PARTIALLY_PAID'
              await bill.save({ session })
            }
          }
        }
      } else if (cheque.type === 'ISSUED_FINANCIER') {
        const repayment = await Repayment.findOne({ chequeId: cheque._id }).session(session)
        if (repayment) {
          const loan = await Loan.findById(repayment.loanId).session(session)
          if (loan) {
            loan.paidPrincipal = Math.max(0, loan.paidPrincipal - repayment.principalPaid)
            loan.paidInterest = Math.max(0, loan.paidInterest - repayment.interestPaid)
            loan.outstandingPrincipal += repayment.principalPaid
            loan.status = 'ACTIVE'
            await loan.save({ session })

            await LedgerService.postTransaction({
              type: 'LOAN_DRAWDOWN',
              amount: repayment.principalPaid,
              financierId: cheque.financierId,
              referenceType: 'Cheque',
              referenceId: cheque._id,
              description: `Repayment cheque #${cheque.chequeNumber} bounced. Reverting loan reduction.`
            }, session)

            if (repayment.interestPaid > 0) {
              await LedgerService.postTransaction({
                type: 'LOAN_DRAWDOWN',
                amount: repayment.interestPaid,
                financierId: cheque.financierId,
                referenceType: 'Cheque',
                referenceId: cheque._id,
                description: `Repayment cheque #${cheque.chequeNumber} bounced. Reverting interest payment.`
              }, session)
            }
          }
        }
      }
    }

    if (chequeNumber) cheque.chequeNumber = chequeNumber
    if (type) cheque.type = type
    if (partyName) cheque.partyName = partyName
    if (amount !== undefined) cheque.amount = Number(amount)
    if (chequeDate) cheque.chequeDate = chequeDate
    if (vendorId !== undefined) cheque.vendorId = vendorId || null
    if (financierId !== undefined) cheque.financierId = financierId || null
    if (bankName !== undefined) cheque.bankName = bankName
    cheque.status = targetStatus
    if (targetStatus === 'BOUNCED') {
      cheque.bounceDate = bounceDate || new Date()
      cheque.bounceReason = bounceReason || 'Insufficient Funds'
    }

    await cheque.save({ session })
    await session.commitTransaction()
    session.endSession()

    broadcastEvent('data-changed', { entity: 'cheque', action: 'update' })
    res.status(200).json({ success: true, data: cheque })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    next(error)
  }
}

exports.deleteCheque = async (req, res, next) => {
  try {
    const { id } = req.params
    const cheque = await Cheque.findByIdAndUpdate(id, { isDeleted: true }, { new: true })
    if (!cheque) return res.status(404).json({ success: false, message: 'Cheque not found' })

    broadcastEvent('data-changed', { entity: 'cheque', action: 'delete' })

    res.status(200).json({ success: true, data: cheque })
  } catch (error) {
    next(error)
  }
}
