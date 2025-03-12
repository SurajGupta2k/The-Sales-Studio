const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');

// Keep only two essential endpoints
router.get('/check-eligibility', couponController.checkEligibility);
router.post('/claim', couponController.claimCoupon);

module.exports = router; 