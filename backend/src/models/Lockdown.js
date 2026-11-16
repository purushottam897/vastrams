const mongoose = require('mongoose')

const LockdownSchema = new mongoose.Schema({
  isActive: {
    type: Boolean,
    default: true,
    required: true
  },
  recoveryKey: {
    type: String,
    required: true
  },
  recoveryKeyHash: {
    type: String,
    required: true
  },
  activatedAt: {
    type: Date,
    default: Date.now
  },
  rayId: {
    type: String,
    default: ''
  },
  activatedByIp: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
})

module.exports = mongoose.model('Lockdown', LockdownSchema)
