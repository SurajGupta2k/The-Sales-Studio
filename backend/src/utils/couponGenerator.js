const Coupon = require('../models/Coupon');

// Configuration
const CONFIG = {
  MINIMUM_COUPONS: 20,    // Minimum number of coupons to maintain
  REPLENISH_COUNT: 50,    // Number of coupons to generate when running low
  INITIAL_SEED_COUNT: 100 // Number of coupons to generate during initial seeding
};

// Function to generate a random coupon code
const generateCouponCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// Function to get the next sequence number
const getNextSequenceNumber = async () => {
  const lastCoupon = await Coupon.findOne({}, { sequenceNumber: 1 })
    .sort({ sequenceNumber: -1 })
    .limit(1);
  return lastCoupon ? lastCoupon.sequenceNumber + 1 : 1;
};

// Function to generate multiple coupons
const generateCoupons = async (count) => {
  try {
    let nextSeq = await getNextSequenceNumber();
    
    const coupons = await Promise.all(
      Array.from({ length: count }, async (_, index) => ({
        code: generateCouponCode(),
        sequenceNumber: nextSeq + index,
        isActive: true
      }))
    );

    await Coupon.insertMany(coupons);
    console.log(`Successfully generated ${count} new coupons starting from sequence ${nextSeq}`);
    return true;
  } catch (error) {
    console.error('Error generating coupons:', error);
    return false;
  }
};

// Function to check and replenish coupons if needed
const checkAndReplenishCoupons = async () => {
  try {
    const remainingCoupons = await Coupon.countDocuments({ isActive: true });
    
    if (remainingCoupons < CONFIG.MINIMUM_COUPONS) {
      console.log(`Coupons running low (${remainingCoupons} remaining). Generating more...`);
      await generateCoupons(CONFIG.REPLENISH_COUNT);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error checking/replenishing coupons:', error);
    return false;
  }
};

// Function to seed initial coupons (clears existing ones)
const seedInitialCoupons = async (count = CONFIG.INITIAL_SEED_COUNT) => {
  try {
    // Clear existing coupons
    await Coupon.deleteMany({});
    console.log('Cleared existing coupons');

    // Generate new coupons
    const success = await generateCoupons(count);
    if (success) {
      console.log(`Database seeded with ${count} coupons`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error seeding coupons:', error);
    return false;
  }
};

// If this file is run directly (node couponGenerator.js), seed the database
if (require.main === module) {
  // Load environment variables
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/coupon-system';
  
  console.log('Connecting to MongoDB...');
  console.log('Using database:', MONGODB_URI.split('@')[1]); // Log the database URL (excluding credentials)

  const mongoose = require('mongoose');
  mongoose.connect(MONGODB_URI)
    .then(() => {
      console.log('Connected to MongoDB successfully');
      return seedInitialCoupons();
    })
    .then(() => {
      console.log('Seeding completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}

module.exports = {
  generateCouponCode,
  generateCoupons,
  checkAndReplenishCoupons,
  seedInitialCoupons,
  CONFIG
}; 