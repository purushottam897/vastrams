const Vendor = require('../models/Vendor')
const Bill = require('../models/Bill')
const Payment = require('../models/Payment')
const { createNotification } = require('../utils/notificationHelper')
const { broadcastEvent } = require('../utils/sse')

/**
 * Calculates accurate current outstanding balance for a vendor:
 * Current Outstanding = Opening Balance + Total Bills - Total Payments
 * (Unpaid bills + Math.max(0, openingBalance - paymentsTowardsOpening))
 */
async function calculateVendorOutstanding(vendorId, openingBalance = 0, session = null) {
  const billsQuery = Bill.find({ vendorId, isDeleted: false })
  const paymentsQuery = Payment.find({ vendorId, isDeleted: false })
  if (session) {
    billsQuery.session(session)
    paymentsQuery.session(session)
  }

  const [bills, payments] = await Promise.all([billsQuery, paymentsQuery])
  const unpaidBills = bills.reduce((sum, b) => sum + (Number(b.outstandingAmount) || 0), 0)
  const paidBills = bills.reduce((sum, b) => sum + (Number(b.paidAmount) || 0), 0)
  const totalPayments = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  const paymentsTowardsOpening = Math.max(0, totalPayments - paidBills)

  return Math.max(0, unpaidBills + Math.max(0, (Number(openingBalance) || 0) - paymentsTowardsOpening))
}

exports.createVendor = async (req, res, next) => {
  try {
    const { name, contactPerson, email, phone, address, type, gstin, openingBalance, status, bankName, accountNo, ifsc, category } = req.body
    
    // Check if vendor already exists
    const existing = await Vendor.findOne({ name, isDeleted: false })
    if (existing) {
      return res.status(400).json({ success: false, message: 'Vendor name already exists' })
    }

    const initOpening = Number(openingBalance) || 0
    const vendor = new Vendor({
      name,
      contactPerson,
      email,
      phone,
      address,
      type,
      gstin,
      openingBalance: initOpening,
      outstandingBalance: initOpening,
      status,
      bankName,
      accountNo,
      ifsc,
      category
    })
    await vendor.save()

    // Generate event notification
    await createNotification({
      userId: req.user.id,
      type: 'info',
      title: 'Vendor Added',
      message: `New vendor "${name}" has been successfully added to the system.`,
      link: '/vendors'
    })

    broadcastEvent('data-changed', { entity: 'vendor', action: 'create' })

    res.status(201).json({ success: true, data: vendor })
  } catch (error) {
    next(error)
  }
}

exports.getVendors = async (req, res, next) => {
  try {
    const vendors = await Vendor.find({ isDeleted: false }).sort({ name: 1 })

    // Efficiently synchronize outstanding balances for any existing vendors
    const [bills, payments] = await Promise.all([
      Bill.find({ isDeleted: false }),
      Payment.find({ isDeleted: false })
    ])

    const unpaidBillsByVendor = new Map()
    const paidBillsByVendor = new Map()
    for (const b of bills) {
      const vid = String(b.vendorId)
      unpaidBillsByVendor.set(vid, (unpaidBillsByVendor.get(vid) || 0) + (Number(b.outstandingAmount) || 0))
      paidBillsByVendor.set(vid, (paidBillsByVendor.get(vid) || 0) + (Number(b.paidAmount) || 0))
    }

    const paymentsByVendor = new Map()
    for (const p of payments) {
      const vid = String(p.vendorId)
      paymentsByVendor.set(vid, (paymentsByVendor.get(vid) || 0) + (Number(p.amount) || 0))
    }

    const updateOps = []
    for (const v of vendors) {
      const vid = String(v._id)
      const unpaid = unpaidBillsByVendor.get(vid) || 0
      const paid = paidBillsByVendor.get(vid) || 0
      const totalPay = paymentsByVendor.get(vid) || 0
      const paymentsTowardsOpening = Math.max(0, totalPay - paid)
      const computedOutstanding = Math.max(0, unpaid + Math.max(0, (Number(v.openingBalance) || 0) - paymentsTowardsOpening))

      if (v.outstandingBalance !== computedOutstanding) {
        v.outstandingBalance = computedOutstanding
        updateOps.push(Vendor.updateOne({ _id: v._id }, { outstandingBalance: computedOutstanding }))
      }
    }

    if (updateOps.length > 0) {
      await Promise.all(updateOps)
    }

    res.status(200).json(vendors)
  } catch (error) {
    next(error)
  }
}

exports.getVendorById = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({ _id: req.params.id, isDeleted: false })
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' })
    }

    const computedOutstanding = await calculateVendorOutstanding(vendor._id, vendor.openingBalance)
    if (vendor.outstandingBalance !== computedOutstanding) {
      vendor.outstandingBalance = computedOutstanding
      await Vendor.updateOne({ _id: vendor._id }, { outstandingBalance: computedOutstanding })
    }

    res.status(200).json(vendor)
  } catch (error) {
    next(error)
  }
}

exports.updateVendor = async (req, res, next) => {
  try {
    const { name, contactPerson, email, phone, address, type, gstin, openingBalance, status, bankName, accountNo, ifsc, category } = req.body
    
    const vendor = await Vendor.findOne({ _id: req.params.id, isDeleted: false })
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' })
    }

    if (name && name !== vendor.name) {
      const existing = await Vendor.findOne({ name, _id: { $ne: vendor._id }, isDeleted: false })
      if (existing) {
        return res.status(400).json({ success: false, message: 'Vendor name already exists' })
      }
    }

    const newOpening = openingBalance !== undefined ? (Number(openingBalance) || 0) : (Number(vendor.openingBalance) || 0)
    const computedOutstanding = await calculateVendorOutstanding(vendor._id, newOpening)

    vendor.name = name !== undefined ? name : vendor.name
    vendor.contactPerson = contactPerson !== undefined ? contactPerson : vendor.contactPerson
    vendor.email = email !== undefined ? email : vendor.email
    vendor.phone = phone !== undefined ? phone : vendor.phone
    vendor.address = address !== undefined ? address : vendor.address
    vendor.type = type !== undefined ? type : vendor.type
    vendor.gstin = gstin !== undefined ? gstin : vendor.gstin
    vendor.openingBalance = newOpening
    vendor.outstandingBalance = computedOutstanding
    vendor.status = status !== undefined ? status : vendor.status
    vendor.bankName = bankName !== undefined ? bankName : vendor.bankName
    vendor.accountNo = accountNo !== undefined ? accountNo : vendor.accountNo
    vendor.ifsc = ifsc !== undefined ? ifsc : vendor.ifsc
    vendor.category = category !== undefined ? category : vendor.category

    await vendor.save()

    broadcastEvent('data-changed', { entity: 'vendor', action: 'update' })

    res.status(200).json({ success: true, data: vendor })
  } catch (error) {
    next(error)
  }
}

exports.deleteVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findByIdAndDelete(req.params.id)

    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' })
    }

    broadcastEvent('data-changed', { entity: 'vendor', action: 'delete' })

    res.status(200).json({ success: true, message: 'Vendor deleted successfully from database' })
  } catch (error) {
    next(error)
  }
}

module.exports.calculateVendorOutstanding = calculateVendorOutstanding
