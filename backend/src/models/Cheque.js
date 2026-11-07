const mongoose = require('mongoose')

const ChequeSchema = new mongoose.Schema({
  chequeNumber: {
    type: String,
    required: true,
    trim: true,
    set: function(v) {
      if (!v) return v;
      const digits = String(v).replace(/\D/g, '');
      if (digits.length > 0) {
        return digits.padStart(6, '0').slice(-6);
      }
      return v;
    },
    validate: {
      validator: function(v) {
        return /^\d{6}$/.test(v); // Standard Indian cheque numbers are 6 digits
      },
      message: props => `${props.value} is not a valid 6-digit cheque number!`
    }
  },
  type: {
    type: String,
    required: true,
    enum: ['ISSUED_VENDOR', 'ISSUED_FINANCIER', 'RECEIVED_FINANCIER', 'OTHER']
  },
  // Custom party description if not mapped to ID
  partyName: {
    type: String,
    required: true,
    trim: true
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    default: null
  },
  financierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Financier',
    default: null
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  chequeDate: {
    type: Date,
    required: true
  },
  bankName: {
    type: String,
    trim: true,
    default: ''
  },
  status: {
    type: String,
    required: true,
    enum: ['PENDING', 'CLEARED', 'BOUNCED', 'CANCELLED'],
    default: 'PENDING'
  },
  bounceDate: {
    type: Date,
    default: null
  },
  bounceReason: {
    type: String,
    trim: true,
    default: null
  },
  isDeleted: {
    type: Boolean,
    default: false,
    required: true
  }
}, {
  timestamps: true
})

module.exports = mongoose.model('Cheque', ChequeSchema)
