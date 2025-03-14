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
  // Helper function to update tracker
  async updateTracker(identifier, type, currentTime) {
    const nextClaimTime = new Date(currentTime.getTime() + CLAIM_COOLDOWN);
    
    const tracker = await ClaimTracker.findOne({ identifier, type });
    if (tracker) {
      await ClaimTracker.updateOne(
        { identifier, type },
        { 
          lastClaimAt: currentTime,
          nextClaimTime,
          $inc: { claimCount: 1 }
        }
      );
    } else {
      await ClaimTracker.create({
        identifier,
        type,
        lastClaimAt: currentTime,
        nextClaimTime,
        claimCount: 1
      });
    }
  },

  // Claim a coupon
  claimCoupon: async (req, res) => {
    try {
      const ipAddress = req.ip;
      const currentTime = new Date();
      const sessionId = req.cookies[COOKIE_NAME];

      // Check IP address cooldown
      const ipTracker = await ClaimTracker.findOne({ 
        identifier: ipAddress,
        type: 'ip',
        nextClaimTime: { $gt: currentTime }
      });

      // Check session cooldown
      const sessionTracker = sessionId ? await ClaimTracker.findOne({
        identifier: sessionId,
        type: 'session',
        nextClaimTime: { $gt: currentTime }
      }) : null;

      // If either tracker is in cooldown, return the appropriate message
      if (ipTracker || sessionTracker) {
        const tracker = ipTracker || sessionTracker;
        const remainingMs = tracker.nextClaimTime.getTime() - currentTime.getTime();
        return res.status(429).json({
          message: `Please wait ${formatTimeRemaining(remainingMs)} before claiming another coupon.`,
          nextClaimTime: tracker.nextClaimTime,
          remainingTime: {
            total: remainingMs,
            formatted: formatTimeRemaining(remainingMs)
          },
          trackerType: ipTracker ? 'IP Address' : 'Browser Session'
        });
      }

      // Set session cookie if not exists
      if (!sessionId) {
        const newSessionId = Date.now().toString();
        res.cookie(COOKIE_NAME, newSessionId, {
          maxAge: COOKIE_MAX_AGE,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production'
        });
      }

      // Check available coupons
      const availableCoupons = await Coupon.countDocuments({ isActive: true });
      if (availableCoupons === 0) {
        await checkAndReplenishCoupons();
      }

      // Find next available coupon
      const coupon = await Coupon.findOneAndUpdate(
        { isActive: true, claimedBy: null },
        { 
          claimedBy: ipAddress,
          claimedAt: currentTime,
          isActive: false
        },
        { 
          new: true,
          sort: { sequenceNumber: 1 }
        }
      );

      if (!coupon) {
        await checkAndReplenishCoupons();
        const retryCoupon = await Coupon.findOneAndUpdate(
          { isActive: true, claimedBy: null },
          { 
            claimedBy: ipAddress,
            claimedAt: currentTime,
            isActive: false
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

        // Update trackers
        await Promise.all([
          this.updateTracker(ipAddress, 'ip', currentTime),
          sessionId ? this.updateTracker(sessionId, 'session', currentTime) : null
        ].filter(Boolean));

        return res.json({
          message: 'Coupon claimed successfully!',
          coupon: retryCoupon.code,
          sequenceNumber: retryCoupon.sequenceNumber,
          claimTime: currentTime,
          nextClaimTime: new Date(currentTime.getTime() + CLAIM_COOLDOWN),
          cooldownPeriod: {
            total: CLAIM_COOLDOWN,
            formatted: formatTimeRemaining(CLAIM_COOLDOWN)
          }
        });
      }

      // Update trackers
      await Promise.all([
        this.updateTracker(ipAddress, 'ip', currentTime),
        sessionId ? this.updateTracker(sessionId, 'session', currentTime) : null
      ].filter(Boolean));

      res.json({
        message: 'Coupon claimed successfully!',
        coupon: coupon.code,
        sequenceNumber: coupon.sequenceNumber,
        claimTime: currentTime,
        nextClaimTime: new Date(currentTime.getTime() + CLAIM_COOLDOWN),
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

  // Check eligibility
  checkEligibility: async (req, res) => {
    try {
      const ipAddress = req.ip;
      const currentTime = new Date();
      const sessionId = req.cookies[COOKIE_NAME];
      
      // Check both IP and session trackers
      const [ipTracker, sessionTracker] = await Promise.all([
        ClaimTracker.findOne({ identifier: ipAddress, type: 'ip' }),
        sessionId ? ClaimTracker.findOne({ identifier: sessionId, type: 'session' }) : null
      ]);

      const availableCoupons = await Coupon.countDocuments({ isActive: true });
      
      // Get next sequence number
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

      // Calculate remaining time for both trackers
      const ipRemainingMs = ipTracker && ipTracker.nextClaimTime > currentTime
        ? ipTracker.nextClaimTime.getTime() - currentTime.getTime()
        : 0;

      const sessionRemainingMs = sessionTracker && sessionTracker.nextClaimTime > currentTime
        ? sessionTracker.nextClaimTime.getTime() - currentTime.getTime()
        : 0;

      // Use the longer remaining time
      const remainingMs = Math.max(ipRemainingMs, sessionRemainingMs);
      const canClaim = remainingMs === 0;

      // Determine which tracker is causing the wait
      const activeTracker = remainingMs === ipRemainingMs ? ipTracker : sessionTracker;

      return res.json({
        canClaim,
        remainingTime: {
          total: remainingMs,
          formatted: canClaim ? "You can claim now" : formatTimeRemaining(remainingMs)
        },
        lastClaimAt: activeTracker.lastClaimAt.toISOString(),
        nextClaimTime: activeTracker.nextClaimTime.toISOString(),
        totalClaims: Math.max(ipTracker?.claimCount || 0, sessionTracker?.claimCount || 0),
        trackerType: remainingMs === ipRemainingMs ? 'IP Address' : 'Browser Session',
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

  // Tells us how many coupons are left to claim
  getRemainingCoupons: async (req, res) => {
    try {
      const count = await Coupon.countDocuments({ isActive: true });
      const nextCoupon = await Coupon.findOne(
        { isActive: true, claimedBy: null },
        { sequenceNumber: 1 },
        { sort: { sequenceNumber: 1 } }
      );
      
      // Make more if we're running low
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

  // Shows all coupons, with pagination so we don't overload things
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