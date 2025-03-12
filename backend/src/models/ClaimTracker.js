const mongoose = require('mongoose');

const claimTrackerSchema = new mongoose.Schema({
  ipAddress: {
    type: String,
    sparse: true
  },
  sessionId: {
    type: String,
    sparse: true
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

// Ensure we can query efficiently by either IP or session ID
claimTrackerSchema.index({ ipAddress: 1 });
claimTrackerSchema.index({ sessionId: 1 });

// Ensure at least one identifier is present
claimTrackerSchema.pre('save', function(next) {
  if (!this.ipAddress && !this.sessionId) {
    next(new Error('Either ipAddress or sessionId must be provided'));
  }
  next();
});

module.exports = mongoose.model('ClaimTracker', claimTrackerSchema); 