const { body } = require('express-validator')
const validate = require('../middleware/validate')
const Cheque = require('../models/Cheque')
const Vendor = require('../models/Vendor')
const Financier = require('../models/Financier')

exports.validateCheque = [
  body('chequeNumber')
    .matches(/^\d{6}$/)
    .withMessage('Cheque number must be exactly 6 digits')
    .custom(async (value) => {
      const duplicate = await Cheque.findOne({ chequeNumber: value, isDeleted: false })
      if (duplicate) {
        throw new Error(`Cheque number ${value} is already in use by an active cheque record`)
      }
      return true
    }),

  body('type')
    .isIn(['ISSUED_VENDOR', 'ISSUED_FINANCIER', 'RECEIVED_FINANCIER', 'OTHER'])
    .withMessage('Invalid cheque type'),

  body('partyName')
    .trim()
    .notEmpty()
    .withMessage('Party name is required'),

  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be a positive number'),

  body('chequeDate')
    .custom((val, { req }) => {
      const dateVal = val || req.body.issueDate
      if (!dateVal) throw new Error('Cheque date is required')
      if (!/^\d{4}-\d{2}-\d{2}/.test(dateVal) && isNaN(Date.parse(dateVal))) {
        throw new Error('Invalid cheque date format')
      }
      if (!req.body.chequeDate) req.body.chequeDate = dateVal
      return true
    }),

  body('issueDate')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Invalid issue date format'),

  body('withdrawalDate')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Invalid withdrawal date format'),

  body('vendorId')
    .optional({ checkFalsy: true })
    .isMongoId()
    .withMessage('Invalid Vendor ID format')
    .custom(async (value) => {
      const vendor = await Vendor.findOne({ _id: value, isDeleted: false })
      if (!vendor) {
        throw new Error('Associated Vendor does not exist')
      }
      return true
    }),

  body('financierId')
    .optional({ checkFalsy: true })
    .isMongoId()
    .withMessage('Invalid Financier ID format')
    .custom(async (value) => {
      const financier = await Financier.findOne({ _id: value, isDeleted: false })
      if (!financier) {
        throw new Error('Associated Financier does not exist')
      }
      return true
    }),

  validate
]
