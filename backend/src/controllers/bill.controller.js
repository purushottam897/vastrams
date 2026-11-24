const mongoose = require('mongoose')
const { broadcastEvent } = require('../utils/sse')
const Bill = require('../models/Bill')
const Vendor = require('../models/Vendor')
const LedgerService = require('../services/ledger.service')

exports.createBill = async (req, res, next) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const { billNumber, vendorId, amount, billDate, dueDate, paymentType, remarks } = req.body

    // Check if vendor exists
    const vendor = await Vendor.findOne({ _id: vendorId, isDeleted: false }).session(session)
    if (!vendor) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Vendor not found' })
    }

    // Check duplicate bill number for this vendor
    const duplicate = await Bill.findOne({ billNumber, vendorId, isDeleted: false }).session(session)
    if (duplicate) {
      await session.abortTransaction()
      session.endSession()
      return res.status(400).json({ success: false, message: `Bill number '${billNumber}' already exists for this vendor.` })
    }

    // Create and save bill
    const bill = new Bill({
      billNumber,
      vendorId,
      amount,
      outstandingAmount: amount,
      billDate,
      dueDate,
      paymentType: paymentType || 'Credit',
      remarks: remarks || '',
      status: 'UNPAID'
    })
    await bill.save({ session })

    // Post to unified transaction ledger
    await LedgerService.postTransaction({
      type: 'BILL_POSTED',
      amount,
      date: billDate,
      vendorId,
      referenceType: 'Bill',
      referenceId: bill._id,
      description: `Bill #${billNumber} posted`
    }, session)

    await session.commitTransaction()
    session.endSession()

    broadcastEvent('data-changed', { entity: 'bill', action: 'create' })

    res.status(201).json({ success: true, data: bill })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    next(error)
  }
}

exports.getBills = async (req, res, next) => {
  try {
    const { vendorId, status } = req.query
    const filter = { isDeleted: false }

    if (vendorId) filter.vendorId = vendorId
    if (status) filter.status = status

    const bills = await Bill.find(filter)
      .populate('vendorId', 'name email')
      .sort({ dueDate: 1, billDate: 1 })

    res.status(200).json(bills)
  } catch (error) {
    next(error)
  }
}

exports.getBillById = async (req, res, next) => {
  try {
    const bill = await Bill.findOne({ _id: req.params.id, isDeleted: false })
      .populate('vendorId', 'name contactPerson email phone address gstin')

    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' })
    }
    res.status(200).json(bill)
  } catch (error) {
    next(error)
  }
}

exports.updateBill = async (req, res, next) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction()
      session.endSession()
      return res.status(400).json({ success: false, message: 'Invalid Bill ID' })
    }

    const { billNumber, vendorId, amount, billDate, dueDate, paymentType, remarks } = req.body

    // 1. Find existing bill
    const bill = await Bill.findOne({ _id: id, isDeleted: false }).session(session)
    if (!bill) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Bill not found' })
    }

    // 2. Validate target vendor
    const targetVendor = await Vendor.findOne({ _id: vendorId, isDeleted: false }).session(session)
    if (!targetVendor) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Vendor not found' })
    }

    // 3. Check duplicate bill number for target vendor
    const duplicate = await Bill.findOne({
      _id: { $ne: id },
      billNumber,
      vendorId,
      isDeleted: false
    }).session(session)
    if (duplicate) {
      await session.abortTransaction()
      session.endSession()
      return res.status(400).json({ success: false, message: `Bill number '${billNumber}' already exists for this vendor.` })
    }

    const newAmount = Number(amount)
    const oldAmount = bill.amount
    const oldVendorId = bill.vendorId.toString()
    const targetVendorId = vendorId.toString()

    // 4. Accounting constraints when payments have already been made to this bill
    if (bill.paidAmount > 0) {
      if (targetVendorId !== oldVendorId) {
        await session.abortTransaction()
        session.endSession()
        return res.status(400).json({
          success: false,
          message: 'Cannot change vendor on a bill that has already received payments.'
        })
      }

      if (newAmount < bill.paidAmount) {
        await session.abortTransaction()
        session.endSession()
        return res.status(400).json({
          success: false,
          message: `Bill amount cannot be less than the already paid amount (₹${bill.paidAmount}).`
        })
      }
    }

    // 5. Update ledger & vendor outstanding balance
    if (targetVendorId === oldVendorId) {
      const amountDiff = newAmount - oldAmount
      if (amountDiff !== 0) {
        if (amountDiff > 0) {
          await LedgerService.postTransaction({
            type: 'BILL_POSTED',
            amount: amountDiff,
            date: billDate,
            vendorId: targetVendorId,
            referenceType: 'Bill',
            referenceId: bill._id,
            description: `Adjustment: Bill #${billNumber} amount increased by ₹${amountDiff}`
          }, session)
        } else {
          await LedgerService.postTransaction({
            type: 'BILL_PAID', // Reduces vendor outstanding balance
            amount: Math.abs(amountDiff),
            date: billDate,
            vendorId: targetVendorId,
            referenceType: 'Bill',
            referenceId: bill._id,
            description: `Adjustment: Bill #${billNumber} amount decreased by ₹${Math.abs(amountDiff)}`
          }, session)
        }
      }
    } else {
      // Vendor changed (only permitted when paidAmount === 0)
      // Reverse from old vendor
      await LedgerService.postTransaction({
        type: 'BILL_PAID',
        amount: oldAmount,
        date: billDate,
        vendorId: oldVendorId,
        referenceType: 'Bill',
        referenceId: bill._id,
        description: `Reversal of Bill #${bill.billNumber} transferred to new vendor`
      }, session)

      // Post to new vendor
      await LedgerService.postTransaction({
        type: 'BILL_POSTED',
        amount: newAmount,
        date: billDate,
        vendorId: targetVendorId,
        referenceType: 'Bill',
        referenceId: bill._id,
        description: `Bill #${billNumber} transferred from previous vendor`
      }, session)
    }

    // 6. Update bill document fields
    bill.billNumber = billNumber
    bill.vendorId = vendorId
    bill.amount = newAmount
    bill.outstandingAmount = newAmount - bill.paidAmount
    bill.billDate = billDate
    bill.dueDate = dueDate
    if (paymentType) bill.paymentType = paymentType
    if (remarks !== undefined) bill.remarks = remarks

    // Update status
    if (bill.outstandingAmount === 0 && bill.amount > 0) {
      bill.status = 'PAID'
    } else if (bill.paidAmount > 0) {
      bill.status = 'PARTIALLY_PAID'
    } else {
      bill.status = 'UNPAID'
    }

    await bill.save({ session })

    await session.commitTransaction()
    session.endSession()

    broadcastEvent('data-changed', { entity: 'bill', action: 'update' })

    res.status(200).json({
      success: true,
      message: 'Bill updated successfully',
      data: bill
    })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    next(error)
  }
}

exports.deleteBill = async (req, res, next) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const bill = await Bill.findOne({ _id: req.params.id, isDeleted: false }).session(session)
    if (!bill) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Bill not found' })
    }

    if (bill.paidAmount > 0) {
      await session.abortTransaction()
      session.endSession()
      return res.status(400).json({ success: false, message: 'Cannot delete a bill that has received payments.' })
    }

    // Soft delete
    bill.isDeleted = true
    await bill.save({ session })

    // Reverse ledger payable entry by posting reverse transaction
    await LedgerService.postTransaction({
      type: 'BILL_PAID', // Reduces payable by the bill amount to negate the previous bill posted
      amount: bill.amount,
      vendorId: bill.vendorId,
      referenceType: 'Bill',
      referenceId: bill._id,
      description: `Reversal of deleted bill #${bill.billNumber}`
    }, session)

    await session.commitTransaction()
    session.endSession()

    broadcastEvent('data-changed', { entity: 'bill', action: 'delete' })

    res.status(200).json({ success: true, message: 'Bill deleted and payable ledger reversed' })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    next(error)
  }
}
