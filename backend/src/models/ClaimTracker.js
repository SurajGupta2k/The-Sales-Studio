const mongoose = require('mongoose');

const claimTrackerSchema = new mongoose.Schema({
  identifier: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: ['ip', 'session']
  },
  lastClaimAt: {
    type: Date,
    required: true,
    index: true
  },
  claimCount: {
    type: Number,
    default: 1
  },
  nextClaimTime: {
    type: Date,
    required: true
  }
}, { timestamps: true });

// Create compound indexes for better query performance
claimTrackerSchema.index({ identifier: 1, type: 1 });
claimTrackerSchema.index({ nextClaimTime: 1 });

module.exports = mongoose.model('ClaimTracker', claimTrackerSchema); 