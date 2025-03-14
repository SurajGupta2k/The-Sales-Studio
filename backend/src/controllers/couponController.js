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

// Helper function to update tracker (moved outside the controller object)
async function updateTracker(identifier, type, currentTime) {
  try {
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
  } catch (error) {
    console.error('Error updating tracker:', error);
    throw error;
  }
}

const couponController = {
  // Claim a coupon
  claimCoupon: async (req, res) => {
    try {
      const ipAddress = req.ip;
      const currentTime = new Date();
      const sessionId = req.cookies[COOKIE_NAME];

      console.log('Claim attempt:', { ipAddress, sessionId, currentTime });

      // Check IP address cooldown
      const ipTracker = await ClaimTracker.findOne({ 
        identifier: ipAddress,
        type: 'ip',
        nextClaimTime: { $gt: currentTime }
      });

      // Only check session if IP is not in cooldown
      if (!ipTracker && sessionId) {
        const sessionTracker = await ClaimTracker.findOne({
          identifier: sessionId,
          type: 'session',
          nextClaimTime: { $gt: currentTime }
        });

        if (sessionTracker) {
          const remainingMs = sessionTracker.nextClaimTime.getTime() - currentTime.getTime();
          return res.status(429).json({
            message: `Please wait ${formatTimeRemaining(remainingMs)} before claiming another coupon in this browser.`,
            nextClaimTime: sessionTracker.nextClaimTime,
            remainingTime: {
              total: remainingMs,
              formatted: formatTimeRemaining(remainingMs)
            },
            trackerType: 'Browser Session'
          });
        }
      } else if (ipTracker) {
        const remainingMs = ipTracker.nextClaimTime.getTime() - currentTime.getTime();
        return res.status(429).json({
          message: `Please wait ${formatTimeRemaining(remainingMs)} before claiming another coupon from this IP.`,
          nextClaimTime: ipTracker.nextClaimTime,
          remainingTime: {
            total: remainingMs,
            formatted: formatTimeRemaining(remainingMs)
          },
          trackerType: 'IP Address'
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
          updateTracker(ipAddress, 'ip', currentTime),
          sessionId ? updateTracker(sessionId, 'session', currentTime) : null
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
        updateTracker(ipAddress, 'ip', currentTime),
        sessionId ? updateTracker(sessionId, 'session', currentTime) : null
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
      res.status(500).json({ 
        message: 'Error claiming coupon',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // Check eligibility
  checkEligibility: async (req, res) => {
    try {
      const ipAddress = req.ip;
      const currentTime = new Date();
      const sessionId = req.cookies[COOKIE_NAME];
      
      console.log('Checking eligibility:', { ipAddress, sessionId, currentTime });

      // Check both IP and session trackers
      const [ipTracker, sessionTracker] = await Promise.all([
        ClaimTracker.findOne({ 
          identifier: ipAddress, 
          type: 'ip',
          nextClaimTime: { $gt: currentTime }
        }),
        sessionId ? ClaimTracker.findOne({ 
          identifier: sessionId, 
          type: 'session',
          nextClaimTime: { $gt: currentTime }
        }) : null
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
      
      // If no active cooldowns exist, user can claim
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

      // Return the specific cooldown that's preventing the claim
      if (ipTracker) {
        const remainingMs = ipTracker.nextClaimTime.getTime() - currentTime.getTime();
        return res.json({
          canClaim: false,
          remainingTime: {
            total: remainingMs,
            formatted: formatTimeRemaining(remainingMs)
          },
          lastClaimAt: ipTracker.lastClaimAt.toISOString(),
          nextClaimTime: ipTracker.nextClaimTime.toISOString(),
          totalClaims: ipTracker.claimCount,
          trackerType: 'IP Address',
          availableCoupons,
          nextSequenceNumber: nextCoupon?.sequenceNumber,
          timestamp: currentTime.toISOString()
        });
      }

      if (sessionTracker) {
        const remainingMs = sessionTracker.nextClaimTime.getTime() - currentTime.getTime();
        return res.json({
          canClaim: false,
          remainingTime: {
            total: remainingMs,
            formatted: formatTimeRemaining(remainingMs)
          },
          lastClaimAt: sessionTracker.lastClaimAt.toISOString(),
          nextClaimTime: sessionTracker.nextClaimTime.toISOString(),
          totalClaims: sessionTracker.claimCount,
          trackerType: 'Browser Session',
          availableCoupons,
          nextSequenceNumber: nextCoupon?.sequenceNumber,
          timestamp: currentTime.toISOString()
        });
      }

      // If no cooldown is active, allow claim
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
    } catch (error) {
      console.error('Error checking eligibility:', error);
      return res.status(500).json({ 
        message: 'Error checking eligibility',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
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