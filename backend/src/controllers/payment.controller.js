const mongoose = require('mongoose')
const { createNotification } = require('../utils/notificationHelper')
const { broadcastEvent } = require('../utils/sse')
const Payment = require('../models/Payment')
const Cheque = require('../models/Cheque')
const FifoService = require('../services/fifo.service')
const LedgerService = require('../services/ledger.service')
const Vendor = require('../models/Vendor')
const Bill = require('../models/Bill')
const Transaction = require('../models/Transaction')

const normalizePaymentMode = (mode) => {
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

exports.createPayment = async (req, res, next) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const { vendorId, amount, paymentDate, paymentMode, chequeNumber, referenceNumber } = req.body
    const targetMode = normalizePaymentMode(paymentMode)

    // Validate Vendor
    const vendor = await Vendor.findOne({ _id: vendorId, isDeleted: false }).session(session)
    if (!vendor) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Vendor not found' })
    }

    // 1. Run FIFO allocation engine
    const { allocations } = await FifoService.allocatePayment(vendorId, amount, session)

    // 2. If targetMode is CHEQUE, create Cheque Registry item
    let chequeId = null
    let refNum = referenceNumber

    if (targetMode === 'CHEQUE') {
      if (!chequeNumber) {
        await session.abortTransaction()
        session.endSession()
        return res.status(400).json({ success: false, message: 'Cheque number is required for CHEQUE payment mode.' })
      }

      // Create a pending Issued Cheque in Registry
      const cheque = new Cheque({
        chequeNumber,
        type: 'ISSUED_VENDOR',
        partyName: vendor.name,
        vendorId,
        amount,
        chequeDate: paymentDate || new Date(),
        status: 'PENDING'
      })
      await cheque.save({ session })
      chequeId = cheque._id
      refNum = chequeNumber // Cheque number serves as reference
    }

    // 3. Create Payment record
    const payment = new Payment({
      vendorId,
      amount,
      paymentDate,
      paymentMode: targetMode,
      chequeId,
      referenceNumber: refNum,
      allocations
    })
    await payment.save({ session })

    // 4. Update the Unified Transaction Ledger (recomputes vendor.outstandingBalance internally)
    await LedgerService.postTransaction({
      type: 'BILL_PAID',
      amount,
      vendorId,
      referenceType: 'Payment',
      referenceId: payment._id,
      description: `Payment via ${targetMode} - Ref: ${refNum}`
    }, session)

    await session.commitTransaction()
    session.endSession()

    await createNotification({
      userId: req.user.id,
      type: 'success',
      title: 'Payment Recorded',
      message: `Payment of ₹${amount.toLocaleString('en-IN')} to ${vendor.name} has been successfully recorded.`,
      link: '/payments'
    })

    broadcastEvent('data-changed', { entity: 'payment', action: 'create' })

    res.status(201).json({ success: true, data: payment })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    next(error)
  }
}

exports.getPayments = async (req, res, next) => {
  try {
    const { vendorId } = req.query
    const filter = { isDeleted: false }

    if (vendorId) filter.vendorId = vendorId

    const payments = await Payment.find(filter)
      .populate('vendorId', 'name email')
      .populate('chequeId', 'chequeNumber status')
      .populate('allocations.billId', 'billNumber amount paidAmount outstandingAmount')
      .sort({ paymentDate: -1, createdAt: -1 })

    res.status(200).json(payments)
  } catch (error) {
    next(error)
  }
}

exports.deletePayment = async (req, res, next) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const payment = await Payment.findOne({ _id: req.params.id, isDeleted: false }).session(session)
    if (!payment) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Payment not found' })
    }

    payment.isDeleted = true
    await payment.save({ session })

    for (const alloc of payment.allocations) {
      const bill = await Bill.findById(alloc.billId).session(session)
      if (bill) {
        bill.paidAmount = Math.max(0, bill.paidAmount - alloc.allocatedAmount)
        bill.outstandingAmount = Math.min(bill.amount, bill.outstandingAmount + alloc.allocatedAmount)
        bill.status = bill.paidAmount <= 0 ? 'UNPAID' : 'PARTIALLY_PAID'
        await bill.save({ session })
      }
    }

    const transaction = await Transaction.findOne({
      referenceType: 'Payment',
      referenceId: payment._id,
      isDeleted: false
    }).session(session)

    if (transaction) {
      transaction.isDeleted = true
      await transaction.save({ session })
    }

    const vendor = await Vendor.findById(payment.vendorId).session(session)
    if (vendor) {
      vendor.outstandingBalance = Math.max(0, vendor.outstandingBalance + payment.amount)
      await vendor.save({ session })
    }

    await session.commitTransaction()
    session.endSession()
    res.status(200).json({ success: true, message: 'Payment deleted and outstanding balances reverted successfully' })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    next(error)
  }
}

exports.getPaymentById = async (req, res, next) => {
  try {
    const payment = await Payment.findOne({ _id: req.params.id, isDeleted: false })
      .populate('vendorId')
      .populate('chequeId')
      .populate('allocations.billId')

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' })
    }
    res.status(200).json(payment)
  } catch (error) {
    next(error)
  }
}

exports.updatePayment = async (req, res, next) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const { id } = req.params
    const { vendorId, amount, paymentDate, paymentMode, chequeNumber, referenceNumber } = req.body

    // 1. Find existing payment
    const payment = await Payment.findOne({ _id: id, isDeleted: false }).session(session)
    if (!payment) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Payment not found' })
    }

    // 2. Validate target Vendor
    const targetVendorId = vendorId || payment.vendorId
    const vendor = await Vendor.findOne({ _id: targetVendorId, isDeleted: false }).session(session)
    if (!vendor) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Vendor not found' })
    }

    const targetMode = paymentMode !== undefined ? normalizePaymentMode(paymentMode) : payment.paymentMode

    // 3. Revert old bill allocations
    for (const alloc of payment.allocations) {
      const bill = await Bill.findById(alloc.billId).session(session)
      if (bill) {
        bill.paidAmount = Math.max(0, bill.paidAmount - alloc.allocatedAmount)
        bill.outstandingAmount = Math.min(bill.amount, bill.outstandingAmount + alloc.allocatedAmount)
        bill.status = bill.paidAmount <= 0 ? 'UNPAID' : 'PARTIALLY_PAID'
        await bill.save({ session })
      }
    }

    // 4. Revert old vendor balance change
    const oldVendor = await Vendor.findById(payment.vendorId).session(session)
    if (oldVendor) {
      oldVendor.outstandingBalance = Math.max(0, oldVendor.outstandingBalance + payment.amount)
      await oldVendor.save({ session })
    }

    // 5. Handle old cheque if mode changed away from CHEQUE
    if (payment.chequeId && targetMode !== 'CHEQUE') {
      const oldCheque = await Cheque.findById(payment.chequeId).session(session)
      if (oldCheque) {
        oldCheque.isDeleted = true
        await oldCheque.save({ session })
      }
      payment.chequeId = null
    }

    const newAmount = amount !== undefined ? Number(amount) : payment.amount

    // 6. Run new FIFO allocation engine for target vendor & new amount
    const { allocations } = await FifoService.allocatePayment(targetVendorId, newAmount, session)

    // 7. Handle cheque if targetMode is CHEQUE
    let chequeId = payment.chequeId
    let refNum = referenceNumber || payment.referenceNumber

    if (targetMode === 'CHEQUE') {
      if (!chequeNumber && !payment.chequeId) {
        await session.abortTransaction()
        session.endSession()
        return res.status(400).json({ success: false, message: 'Cheque number is required for CHEQUE payment mode.' })
      }
      if (chequeNumber) {
        if (payment.chequeId) {
          const chq = await Cheque.findById(payment.chequeId).session(session)
          if (chq) {
            chq.chequeNumber = chequeNumber
            chq.amount = newAmount
            chq.chequeDate = paymentDate || payment.paymentDate
            await chq.save({ session })
          }
        } else {
          const cheque = new Cheque({
            chequeNumber,
            type: 'ISSUED_VENDOR',
            partyName: vendor.name,
            vendorId: targetVendorId,
            amount: newAmount,
            chequeDate: paymentDate || payment.paymentDate || new Date(),
            status: 'PENDING'
          })
          await cheque.save({ session })
          chequeId = cheque._id
        }
        refNum = chequeNumber
      }
    }

    // 8. Update payment fields
    payment.vendorId = targetVendorId
    payment.amount = newAmount
    if (paymentDate) payment.paymentDate = paymentDate
    payment.paymentMode = targetMode
    payment.chequeId = chequeId
    if (refNum) payment.referenceNumber = refNum
    payment.allocations = allocations

    await payment.save({ session })

    // 9. Update Transaction Ledger
    const transaction = await Transaction.findOne({
      referenceType: 'Payment',
      referenceId: payment._id,
      isDeleted: false
    }).session(session)

    if (transaction) {
      transaction.vendorId = targetVendorId
      transaction.amount = newAmount
      transaction.description = `Payment via ${payment.paymentMode} - Ref: ${payment.referenceNumber}`
      await transaction.save({ session })
    } else {
      await LedgerService.postTransaction({
        type: 'BILL_PAID',
        amount: newAmount,
        vendorId: targetVendorId,
        referenceType: 'Payment',
        referenceId: payment._id,
        description: `Payment via ${payment.paymentMode} - Ref: ${payment.referenceNumber}`
      }, session)
    }

    // Recompute target vendor balance
    const updatedVendor = await Vendor.findById(targetVendorId).session(session)
    if (updatedVendor) {
      updatedVendor.outstandingBalance = Math.max(0, updatedVendor.outstandingBalance - newAmount)
      await updatedVendor.save({ session })
    }

    await session.commitTransaction()
    session.endSession()

    broadcastEvent('data-changed', { entity: 'payment', action: 'update' })

    const updatedPayment = await Payment.findById(payment._id)
      .populate('vendorId', 'name email')
      .populate('chequeId', 'chequeNumber status')
      .populate('allocations.billId', 'billNumber amount paidAmount outstandingAmount')

    res.status(200).json({ success: true, data: updatedPayment || payment })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    next(error)
  }
}
