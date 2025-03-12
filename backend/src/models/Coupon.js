const mongoose = require('mongoose');

// Define the schema for the Coupon model. This includes all necessary fields that describe a coupon,
// as well as additional metadata like timestamps for creation and updates.
const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true // Ensure each coupon code is unique to avoid redemption issues.
  },
  sequenceNumber: {
    type: Number,
    required: true,
    unique: true // Unique sequence numbers help in orderly distribution of coupons.
  },
  isActive: {
    type: Boolean,
    default: true // Coupons are active by default and can be deactivated after being claimed.
  },
  claimedBy: {
    type: String,  // Stores the IP address of the claimant.
    default: null
  },
  sessionId: {
    type: String,  // Browser session ID to track claims within the same session.
    default: null
  },
  claimedAt: {
    type: Date,
    default: null // The date and time when the coupon was claimed.
  }
}, { timestamps: true });

// Indexes to improve query performance for frequently accessed fields.
couponSchema.index({ sequenceNumber: 1, isActive: 1 });
couponSchema.index({ sessionId: 1 });

module.exports = mongoose.model('Coupon', couponSchema); 