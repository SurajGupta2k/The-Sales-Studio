const mongoose = require('mongoose');

// This is our main coupon model - it handles all the coupon data in our database
const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true // Each coupon needs its own unique code, just like real coupons!
  },
  sequenceNumber: {
    type: Number, 
    required: true,
    unique: true // We give each coupon a number so we can keep track of the order
  },
  isActive: {
    type: Boolean,
    default: true // When someone claims a coupon, we'll mark it as not active anymore
  },
  claimedBy: {
    type: String,  // We store who claimed it using their IP address
    default: null
  },
  sessionId: {
    type: String,  // We also track which browser session claimed it
    default: null
  },
  claimedAt: {
    type: Date,
    default: null // We note down exactly when someone claimed the coupon
  }
}, { timestamps: true }); // This automatically adds created/updated timestamps

// These help our database search through coupons faster
couponSchema.index({ sequenceNumber: 1, isActive: 1 });
couponSchema.index({ sessionId: 1 });

module.exports = mongoose.model('Coupon', couponSchema);