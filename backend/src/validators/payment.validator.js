const { body } = require('express-validator')
const validate = require('../middleware/validate')
const Vendor = require('../models/Vendor')

exports.validatePayment = [
  body('vendorId')
    .isMongoId()
    .withMessage('Invalid Vendor ID format')
    .custom(async (value) => {
      const vendor = await Vendor.findOne({ _id: value, isDeleted: false })
      if (!vendor) {
        throw new Error('Vendor does not exist in the system')
      }
      return true
    }),

  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be a positive number')
    .custom(async (value, { req }) => {
      const vendor = await Vendor.findOne({ _id: req.body.vendorId, isDeleted: false })
      if (!vendor) {
        return true // Handled by vendorId validation
      }
      
      let maxAllowed = vendor.outstandingBalance || 0
      if (req.params && req.params.id) {
        const Payment = require('../models/Payment')
        const currentPayment = await Payment.findById(req.params.id)
        if (currentPayment && !currentPayment.isDeleted) {
          maxAllowed += (currentPayment.amount || 0)
        }
      }

      if (value > maxAllowed) {
        throw new Error(`Payment amount ₹${value.toLocaleString('en-IN')} exceeds available outstanding balance of ₹${maxAllowed.toLocaleString('en-IN')}`)
      }
      return true
    }),

  body('paymentDate')
    .notEmpty()
    .withMessage('Payment date is required')
    .isISO8601()
    .withMessage('Invalid payment date format'),

  body('paymentMode')
    .notEmpty()
    .withMessage('Payment mode is required')
    .custom(async (value) => {
      const allowedModes = [
        'CHEQUE', 'BANK_TRANSFER', 'CASH', 'UPI', 'NEFT', 'RTGS', 'NEFT_RTGS', 'ONLINE', 'IMPS', 'OTHER',
        'Cheque', 'Bank Transfer', 'Cash', 'UPI', 'NEFT', 'RTGS', 'NEFT / RTGS', 'Online', 'Other'
      ]
      if (allowedModes.includes(value)) return true
      const Settings = require('../models/Settings')
      const settings = await Settings.findOne()
      if (settings?.paymentModes?.some(m => m.name === value || m.name.toUpperCase().replace(/[^A-Z0-9_]/g, '_') === value)) {
        return true
      }
      throw new Error('Invalid payment mode')
    }),

  validate
]
