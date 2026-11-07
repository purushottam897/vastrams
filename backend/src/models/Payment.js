const mongoose = require('mongoose')

const PaymentAllocationSchema = new mongoose.Schema({
  billId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bill',
    required: true
  },
  allocatedAmount: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: false })

const PaymentSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  paymentDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  paymentMode: {
    type: String,
    required: true,
    enum: ['CHEQUE', 'BANK_TRANSFER', 'CASH', 'UPI', 'NEFT', 'RTGS', 'NEFT_RTGS', 'ONLINE', 'IMPS', 'OTHER'],
    default: 'BANK_TRANSFER'
  },
  chequeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cheque',
    default: null
  },
  referenceNumber: {
    type: String,
    required: true,
    trim: true
  },
  // Detailed mapping of which bills were settled by this payment (FIFO allocation record)
  allocations: [PaymentAllocationSchema],
  isDeleted: {
    type: Boolean,
    default: false,
    required: true
  }
}, {
  timestamps: true
})

module.exports = mongoose.model('Payment', PaymentSchema)
