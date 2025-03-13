const Coupon = require('../models/Coupon');
const ClaimTracker = require('../models/ClaimTracker');
const { checkAndReplenishCoupons } = require('../utils/couponGenerator');

// Set cooldown time to 30 seconds (in milliseconds)
const CLAIM_COOLDOWN = 30 * 1000; // 30 seconds
const COOKIE_NAME = 'claim_session';
const COOKIE_MAX_AGE = 30 * 1000; // Match cooldown time exactly

// Helper function to format remaining time
const formatTimeRemaining = (milliseconds) => {
  const seconds = Math.floor((milliseconds / 1000) % 60);
  const minutes = Math.floor((milliseconds / (1000 * 60)) % 60);
  const hours = Math.floor(milliseconds / (1000 * 60 * 60));

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);

  return parts.join(' ');
};

const couponController = {
  // Helper function to update both IP and session trackers
  async updateTrackers(ipAddress, sessionId, currentTime) {
    // Update IP tracker
    const ipTracker = await ClaimTracker.findOne({ ipAddress });
    if (ipTracker) {
      await ClaimTracker.updateOne(
        { ipAddress },
        { 
          lastClaimAt: currentTime,
          $inc: { claimCount: 1 }
        }
      );
    } else {
      await ClaimTracker.create({
        ipAddress,
        lastClaimAt: currentTime,
        sessionId: null // Don't link session to IP
      });
    }

    // Update session tracker if exists
    if (sessionId) {
      const sessionTracker = await ClaimTracker.findOne({ sessionId });
      if (sessionTracker) {
        await ClaimTracker.updateOne(
          { sessionId },
          { 
            lastClaimAt: currentTime,
            $inc: { claimCount: 1 }
          }
        );
      } else {
        await ClaimTracker.create({
          sessionId,
          lastClaimAt: currentTime,
          ipAddress: null // Don't link IP to session
        });
      }
    }
  },

  // Claim a coupon using sequential distribution
  claimCoupon: async (req, res) => {
    try {
      const ipAddress = req.ip;
      const currentTime = new Date();
      const sessionId = req.cookies[COOKIE_NAME];

      // Check IP address first
      const ipTracker = await ClaimTracker.findOne({ ipAddress });
      if (ipTracker) {
        const timeSinceLastClaim = currentTime.getTime() - ipTracker.lastClaimAt.getTime();
        if (timeSinceLastClaim < CLAIM_COOLDOWN) {
          const remainingMs = CLAIM_COOLDOWN - timeSinceLastClaim;
          return res.status(429).json({
            message: `Please wait ${formatTimeRemaining(remainingMs)} before claiming another coupon from this IP.`,
            nextClaimTime: new Date(ipTracker.lastClaimAt.getTime() + CLAIM_COOLDOWN),
            remainingTime: {
              total: remainingMs,
              formatted: formatTimeRemaining(remainingMs)
            }
          });
        }
      }

      // Check cookie session separately
      if (sessionId) {
        const sessionTracker = await ClaimTracker.findOne({ sessionId });
        if (sessionTracker) {
          const timeSinceLastClaim = currentTime.getTime() - sessionTracker.lastClaimAt.getTime();
          if (timeSinceLastClaim < CLAIM_COOLDOWN) {
            const remainingMs = CLAIM_COOLDOWN - timeSinceLastClaim;
            return res.status(429).json({
              message: `Please wait ${formatTimeRemaining(remainingMs)} before claiming another coupon from this browser.`,
              nextClaimTime: new Date(sessionTracker.lastClaimAt.getTime() + CLAIM_COOLDOWN),
              remainingTime: {
                total: remainingMs,
                formatted: formatTimeRemaining(remainingMs)
              }
            });
          }
        }
      } else {
        // Set a new session cookie if none exists
        res.cookie(COOKIE_NAME, Date.now().toString(), {
          maxAge: COOKIE_MAX_AGE,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production'
        });
      }

      // Check available coupons count
      const availableCoupons = await Coupon.countDocuments({ isActive: true });
      
      // If no coupons available or running low, replenish first
      if (availableCoupons === 0) {
        await checkAndReplenishCoupons();
      }

      // Find the next available coupon in sequence
      const coupon = await Coupon.findOneAndUpdate(
        { isActive: true, claimedBy: null },
        { 
          claimedBy: ipAddress,
          claimedAt: currentTime,
          isActive: false,
          sessionId: req.cookies[COOKIE_NAME]
        },
        { 
          new: true,
          sort: { sequenceNumber: 1 }
        }
      );

      // Double check if we still don't have a coupon
      if (!coupon) {
        await checkAndReplenishCoupons();
        
        const retryCoupon = await Coupon.findOneAndUpdate(
          { isActive: true, claimedBy: null },
          { 
            claimedBy: ipAddress,
            claimedAt: currentTime,
            isActive: false,
            sessionId: req.cookies[COOKIE_NAME]
          },
          { 
            new: true,
            sort: { sequenceNumber: 1 }
          }
        );

        if (!retryCoupon) {
          return res.status(404).json({ 
            message: 'No coupons available. Please try again later.',
            shouldRetry: false
          });
        }

        // Update or create trackers
        await couponController.updateTrackers(ipAddress, req.cookies[COOKIE_NAME], currentTime);

        return res.json({
          message: 'Coupon claimed successfully!',
          coupon: retryCoupon.code,
          sequenceNumber: retryCoupon.sequenceNumber,
          claimTime: currentTime,
          nextClaimAllowed: new Date(currentTime.getTime() + CLAIM_COOLDOWN),
          cooldownPeriod: {
            total: CLAIM_COOLDOWN,
            formatted: formatTimeRemaining(CLAIM_COOLDOWN)
          }
        });
      }

      // Update or create trackers
      await couponController.updateTrackers(ipAddress, req.cookies[COOKIE_NAME], currentTime);

      res.json({
        message: 'Coupon claimed successfully!',
        coupon: coupon.code,
        sequenceNumber: coupon.sequenceNumber,
        claimTime: currentTime,
        nextClaimAllowed: new Date(currentTime.getTime() + CLAIM_COOLDOWN),
        cooldownPeriod: {
          total: CLAIM_COOLDOWN,
          formatted: formatTimeRemaining(CLAIM_COOLDOWN)
        }
      });
    } catch (error) {
      console.error('Error claiming coupon:', error);
      res.status(500).json({ message: 'Error claiming coupon' });
    }
  },

  // Verify if a user can claim a coupon
  checkEligibility: async (req, res) => {
    try {
      const ipAddress = req.ip;
      const currentTime = new Date();
      const sessionId = req.cookies[COOKIE_NAME];
      
      // Check both IP and session trackers independently
      const [ipTracker, sessionTracker] = await Promise.all([
        ClaimTracker.findOne({ ipAddress }),
        sessionId ? ClaimTracker.findOne({ sessionId }) : null
      ]);

      const availableCoupons = await Coupon.countDocuments({ isActive: true });
      
      // Get the next sequence number that would be assigned
      const nextCoupon = await Coupon.findOne(
        { isActive: true, claimedBy: null },
        { sequenceNumber: 1 },
        { sort: { sequenceNumber: 1 } }
      );

      // Set proper response headers
      res.setHeader('Content-Type', 'application/json');
      
      // If no trackers exist, user can claim
      if (!ipTracker && !sessionTracker) {
        return res.json({ 
          canClaim: true,
          remainingTime: {
            total: 0,
            formatted: "You can claim now"
          },
          totalClaims: 0,
          availableCoupons,
          nextSequenceNumber: nextCoupon?.sequenceNumber,
          timestamp: currentTime.toISOString()
        });
      }

      // Check cooldown for both IP and session
      let ipRemainingMs = 0;
      let sessionRemainingMs = 0;

      if (ipTracker) {
        const timeSinceLastClaim = currentTime.getTime() - ipTracker.lastClaimAt.getTime();
        ipRemainingMs = Math.max(0, CLAIM_COOLDOWN - timeSinceLastClaim);
      }

      if (sessionTracker) {
        const timeSinceLastClaim = currentTime.getTime() - sessionTracker.lastClaimAt.getTime();
        sessionRemainingMs = Math.max(0, CLAIM_COOLDOWN - timeSinceLastClaim);
      }

      // Use the longer remaining time
      const remainingMs = Math.max(ipRemainingMs, sessionRemainingMs);
      const canClaim = remainingMs === 0;

      return res.json({
        canClaim,
        remainingTime: {
          total: remainingMs,
          formatted: canClaim ? "You can claim now" : formatTimeRemaining(remainingMs)
        },
        lastClaimAt: ipTracker?.lastClaimAt.toISOString() || sessionTracker?.lastClaimAt.toISOString(),
        nextClaimTime: new Date(currentTime.getTime() + remainingMs).toISOString(),
        totalClaims: Math.max(ipTracker?.claimCount || 0, sessionTracker?.claimCount || 0),
        availableCoupons,
        nextSequenceNumber: nextCoupon?.sequenceNumber,
        timestamp: currentTime.toISOString()
      });
    } catch (error) {
      console.error('Error checking eligibility:', error);
      return res.status(500).json({ 
        message: 'Error checking eligibility',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  },

  // Get remaining coupon count and next sequence number
  getRemainingCoupons: async (req, res) => {
    try {
      const count = await Coupon.countDocuments({ isActive: true });
      const nextCoupon = await Coupon.findOne(
        { isActive: true, claimedBy: null },
        { sequenceNumber: 1 },
        { sort: { sequenceNumber: 1 } }
      );
      
      // Check and replenish if running low
      const wasReplenished = await checkAndReplenishCoupons();
      
      res.json({ 
        remainingCoupons: count,
        nextSequenceNumber: nextCoupon?.sequenceNumber,
        wasReplenished,
        message: wasReplenished ? 'Coupons were automatically replenished' : null
      });
    } catch (error) {
      console.error('Error getting remaining coupons:', error);
      res.status(500).json({ message: 'Error getting remaining coupons' });
    }
  },

  // Get list of all coupons with pagination
  getAllCoupons: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const coupons = await Coupon.find({})
        .sort({ sequenceNumber: 1 })
        .skip(skip)
        .limit(limit);

      const total = await Coupon.countDocuments();
      const activeCoupons = await Coupon.countDocuments({ isActive: true });
      const claimedCoupons = await Coupon.countDocuments({ isActive: false });

      res.json({
        coupons,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalCoupons: total,
          activeCoupons,
          claimedCoupons
        },
        stats: {
          totalCoupons: total,
          activeCoupons,
          claimedCoupons,
          usagePercentage: ((claimedCoupons / total) * 100).toFixed(2) + '%'
        }
      });
    } catch (error) {
      console.error('Error getting all coupons:', error);
      res.status(500).json({ message: 'Error getting coupons' });
    }
  }
};

module.exports = couponController; 