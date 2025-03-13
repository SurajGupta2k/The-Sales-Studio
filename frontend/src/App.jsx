import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [eligibility, setEligibility] = useState({ 
    canClaim: false, 
    remainingTime: { total: 0, formatted: '' },
    availableCoupons: 0
  });
  const [countdown, setCountdown] = useState('');
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyStatus, setCopyStatus] = useState('Copy');

  // Using useRef to store interval ID
  const countdownRef = useRef(null);

  const formatTime = (ms) => {
    if (ms <= 0) return "You can claim now";
    
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);

    return parts.join(' ');
  };

  const checkEligibility = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/coupons/check-eligibility`, { withCredentials: true });
      setEligibility(response.data);
  
      if (response.data.remainingTime.total > 0) {
        startCountdown(response.data.remainingTime.total);
      }
    } catch (err) {
      console.error('Error checking eligibility:', err);
    }
  }, []);
  
  const startCountdown = useCallback((totalMs) => {
    if (countdownRef.current) clearInterval(countdownRef.current); // Clear any existing interval
  
    setCountdown(formatTime(totalMs));
  
    countdownRef.current = setInterval(() => {
      totalMs -= 1000;
      if (totalMs <= 0) {
        clearInterval(countdownRef.current);
        setCountdown("You can claim now");
        checkEligibility(); // Ensure eligibility check runs when countdown ends
      } else {
        setCountdown(formatTime(totalMs));
      }
    }, 1000);
  }, [checkEligibility]);  

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(success?.coupon);
      setCopyStatus('Copied!');
      setTimeout(() => {
        setCopyStatus('Copy');
        setShowCopyModal(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      setCopyStatus('Failed to copy');
    }
  };

  useEffect(() => {
    checkEligibility();
    const interval = setInterval(checkEligibility, 60000);
    
    return () => {
      clearInterval(interval);
      if (countdownRef.current) clearInterval(countdownRef.current); // Clear countdown timer on unmount
    };
  }, [checkEligibility]);

  const claimCoupon = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    setShowCopyModal(false);

    try {
      const response = await axios.post(`${API_URL}/coupons/claim`, {}, { withCredentials: true });
      setSuccess(response.data);
      setShowCopyModal(true);
      checkEligibility();
    } catch (err) {
      setError(err.response?.data?.message || 'Error claiming coupon');
      if (err.response?.data?.remainingTime?.total) {
        startCountdown(err.response.data.remainingTime.total);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-6 flex flex-col justify-center sm:py-12">
      <div className="relative py-3 sm:max-w-xl sm:mx-auto">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-light-blue-500 shadow-lg transform -skew-y-6 sm:skew-y-0 sm:-rotate-6 sm:rounded-3xl"></div>
        <div className="relative px-4 py-10 bg-white shadow-lg sm:rounded-3xl sm:p-20">
          <div className="max-w-md mx-auto">
            <div className="divide-y divide-gray-200">
              <div className="py-8 text-base leading-6 space-y-4 text-gray-700 sm:text-lg sm:leading-7">
                <h2 className="text-3xl font-extrabold text-gray-900 mb-8">Coupon Distribution System</h2>
                
                {error && (
                  <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
                    <p className="text-red-700">{error}</p>
                    {countdown && (
                      <p className="text-red-600 mt-2">Time remaining: {countdown}</p>
                    )}
                  </div>
                )}

                {!eligibility.canClaim && !showCopyModal && (
                  <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                    <p className="text-yellow-700">
                      Time until next claim: {countdown || eligibility.remainingTime.formatted}
                    </p>
                  </div>
                )}

                {eligibility.canClaim && !showCopyModal && (
                  <button
                    onClick={claimCoupon}
                    disabled={loading}
                    className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                      loading
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                    }`}
                  >
                    {loading ? 'Claiming...' : 'Claim Coupon'}
                  </button>
                )}

                {showCopyModal && success && (
                  <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center">
                    <div className="bg-white rounded-lg p-8 max-w-sm mx-auto">
                      <div className="text-center">
                        <h3 className="text-xl font-semibold mb-4">Your Coupon Code</h3>
                        <div className="bg-gray-100 p-4 rounded-lg mb-4">
                          <p className="text-2xl font-mono">{success.coupon}</p>
                        </div>
                        <button
                          onClick={handleCopy}
                          className={`w-full py-2 px-4 rounded-md text-white font-medium ${
                            copyStatus === 'Copied!' 
                              ? 'bg-green-500'
                              : copyStatus === 'Failed to copy'
                              ? 'bg-red-500'
                              : 'bg-blue-600 hover:bg-blue-700'
                          }`}
                        >
                          {copyStatus}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {eligibility.availableCoupons !== undefined && (
                  <div className="mt-4 text-sm text-gray-600">
                    Available coupons: {eligibility.availableCoupons}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
