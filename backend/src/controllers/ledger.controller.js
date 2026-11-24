const Transaction = require('../models/Transaction')
const Payment = require('../models/Payment')
const Bill = require('../models/Bill')

exports.getLedger = async (req, res, next) => {
  try {
    const { vendorId, financierId, type, showDeleted } = req.query
    const filter = {}

    if (showDeleted !== 'true') {
      filter.isDeleted = false
    }

    if (vendorId) filter.vendorId = vendorId
    if (financierId) filter.financierId = financierId
    if (type) filter.type = type

    const transactions = await Transaction.find(filter)
      .populate('vendorId', 'name')
      .populate('financierId', 'name')
      .lean()

    // Resolve exact payment received dates and bill dates from underlying records
    const paymentIds = transactions
      .filter(t => t.referenceType === 'Payment' && t.referenceId)
      .map(t => t.referenceId)
    const billIds = transactions
      .filter(t => t.referenceType === 'Bill' && t.referenceId)
      .map(t => t.referenceId)

    const [payments, bills] = await Promise.all([
      paymentIds.length ? Payment.find({ _id: { $in: paymentIds } }).select('_id paymentDate').lean() : [],
      billIds.length ? Bill.find({ _id: { $in: billIds } }).select('_id billDate').lean() : []
    ])

    const paymentDateMap = new Map(payments.map(p => [p._id.toString(), p.paymentDate]))
    const billDateMap = new Map(bills.map(b => [b._id.toString(), b.billDate]))

    for (const t of transactions) {
      if (t.referenceType === 'Payment' && paymentDateMap.has(t.referenceId?.toString())) {
        const actualDate = paymentDateMap.get(t.referenceId.toString())
        t.date = actualDate
        t.paymentDate = actualDate
      } else if (t.referenceType === 'Bill' && billDateMap.has(t.referenceId?.toString())) {
        const actualDate = billDateMap.get(t.referenceId.toString())
        t.date = actualDate
        t.billDate = actualDate
      }
    }

    // Sort newest to oldest for ledger overview
    transactions.sort((a, b) => {
      const da = new Date(a.date).getTime()
      const db = new Date(b.date).getTime()
      if (da !== db) return db - da
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    })

    res.status(200).json(transactions)
  } catch (error) {
    next(error)
  }
}

exports.getVendorStatement = async (req, res, next) => {
  try {
    const { vendorId } = req.params
    const transactions = await Transaction.find({
      vendorId,
      isDeleted: false
    }).lean()

    // Resolve exact saved payment received dates and bill dates
    const paymentIds = transactions
      .filter(t => t.referenceType === 'Payment' && t.referenceId)
      .map(t => t.referenceId)
    const billIds = transactions
      .filter(t => t.referenceType === 'Bill' && t.referenceId)
      .map(t => t.referenceId)

    const [payments, bills] = await Promise.all([
      paymentIds.length ? Payment.find({ _id: { $in: paymentIds } }).select('_id paymentDate').lean() : [],
      billIds.length ? Bill.find({ _id: { $in: billIds } }).select('_id billDate').lean() : []
    ])

    const paymentDateMap = new Map(payments.map(p => [p._id.toString(), p.paymentDate]))
    const billDateMap = new Map(bills.map(b => [b._id.toString(), b.billDate]))

    const bulkOps = []
    for (const t of transactions) {
      let resolvedDate = null
      if (t.referenceType === 'Payment' && paymentDateMap.has(t.referenceId?.toString())) {
        resolvedDate = paymentDateMap.get(t.referenceId.toString())
        t.paymentDate = resolvedDate
      } else if (t.referenceType === 'Bill' && billDateMap.has(t.referenceId?.toString())) {
        resolvedDate = billDateMap.get(t.referenceId.toString())
        t.billDate = resolvedDate
      }

      if (resolvedDate) {
        const originalTime = new Date(t.date).getTime()
        const newTime = new Date(resolvedDate).getTime()
        if (originalTime !== newTime) {
          t.date = resolvedDate
          bulkOps.push({
            updateOne: {
              filter: { _id: t._id },
              update: { $set: { date: resolvedDate } }
            }
          })
        } else {
          t.date = resolvedDate
        }
      }
    }

    if (bulkOps.length > 0) {
      await Transaction.bulkWrite(bulkOps).catch(err => {
        console.warn('Transaction date sync notice:', err.message)
      })
    }

    // Sort chronologically (oldest to newest) to accurately build running ledger statement
    transactions.sort((a, b) => {
      const da = new Date(a.date).getTime()
      const db = new Date(b.date).getTime()
      if (da !== db) return da - db
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
    })

    res.status(200).json(transactions)
  } catch (error) {
    next(error)
  }
}

exports.getFinancierStatement = async (req, res, next) => {
  try {
    const { financierId } = req.params
    const transactions = await Transaction.find({
      financierId,
      isDeleted: false
    })
    .sort({ date: 1, createdAt: 1 }) // Chronological order to build running statement

    res.status(200).json(transactions)
  } catch (error) {
    next(error)
  }
}
