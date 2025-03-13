const mongoose = require('mongoose');

const claimTrackerSchema = new mongoose.Schema({
  ipAddress: {
    type: String,
    sparse: true,
    index: true
  },
  sessionId: {
    type: String,
    sparse: true,
    index: true
  },
  lastClaimAt: {
    type: Date,
    required: true
  },
  claimCount: {
    type: Number,
    default: 1
  }
}, { timestamps: true });

// Ensure either ipAddress or sessionId is present
claimTrackerSchema.pre('save', function(next) {
  if (!this.ipAddress && !this.sessionId) {
    next(new Error('Either ipAddress or sessionId must be provided'));
  }
  next();
});

// Create compound indexes for better query performance
claimTrackerSchema.index({ ipAddress: 1, lastClaimAt: -1 });
claimTrackerSchema.index({ sessionId: 1, lastClaimAt: -1 });

module.exports = mongoose.model('ClaimTracker', claimTrackerSchema); 