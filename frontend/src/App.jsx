import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
console.log('Deployed Frontend Origin:', window.location.origin);
console.log('API URL:', API_URL);

// Configure axios instance with proper settings
const api = axios.create({
  baseURL: API_URL,
  withCredentials: false, // Set to false since we're not using cookies
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// Add request interceptor for debugging
api.interceptors.request.use(
  config => {
    // Log the full request configuration
    console.log('Request Config:', {
      url: config.url,
      method: config.method,
      headers: config.headers,
      baseURL: config.baseURL,
      data: config.data
    });
    return config;
  },
  error => {
    console.error('Request Error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for better error handling
api.interceptors.response.use(
  response => {
    console.log('Response:', response);
    return response;
  },
  error => {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('Response Error:', {
        data: error.response.data,
        status: error.response.status,
        headers: error.response.headers
      });
    } else if (error.request) {
      // The request was made but no response was received
      console.error('Request Error:', error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error:', error.message);
    }
    return Promise.reject(error);
  }
);

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

  // Using useRef to store interval ID and mutable values
  const countdownRef = useRef(null);
  const remainingTimeRef = useRef(0);

  const formatTime = useCallback((ms) => {
    if (ms <= 0) return "You can claim now";
    
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);

    return parts.join(' ');
  }, []);

  const startCountdown = useCallback((totalMs) => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }

    remainingTimeRef.current = totalMs;
    setCountdown(formatTime(remainingTimeRef.current));

    countdownRef.current = setInterval(() => {
      remainingTimeRef.current -= 1000;
      
      if (remainingTimeRef.current <= 0) {
        clearInterval(countdownRef.current);
        setCountdown("You can claim now");
        // Use a new function to check eligibility to avoid circular dependency
        const checkCurrentEligibility = async () => {
          try {
            const response = await api.get('/coupons/check-eligibility');
            setEligibility(response.data);
          } catch (err) {
            console.error('Error checking eligibility:', err);
          }
        };
        checkCurrentEligibility();
      } else {
        setCountdown(formatTime(remainingTimeRef.current));
      }
    }, 1000);

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [formatTime]);

  const checkEligibility = useCallback(async () => {
    try {
      setError(null);
      console.log('Checking eligibility...');
      const response = await api.get('/coupons/check-eligibility');
      console.log('Eligibility response:', response.data);
      
      if (response.data) {
        setEligibility(response.data);
        if (response.data.remainingTime?.total > 0) {
          startCountdown(response.data.remainingTime.total);
        }
      } else {
        throw new Error('Invalid response format');
      }
    } catch (err) {
      console.error('Error checking eligibility:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status
      });
      const errorMessage = err.response?.data?.message || err.message || 'Failed to check eligibility. Please try again later.';
      setError(errorMessage);
      // Set default eligibility state on error
      setEligibility({
        canClaim: false,
        remainingTime: { total: 0, formatted: '' },
        availableCoupons: 0
      });
    }
  }, [startCountdown]);

  const handleCopy = useCallback(async () => {
    try {
      if (!success?.coupon) {
        throw new Error('No coupon to copy');
      }
      await navigator.clipboard.writeText(success.coupon);
      setCopyStatus('Copied!');
      setTimeout(() => {
        setCopyStatus('Copy');
        setShowCopyModal(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      setCopyStatus('Failed to copy');
    }
  }, [success]);

  useEffect(() => {
    checkEligibility();
    const eligibilityInterval = setInterval(checkEligibility, 60000);
    
    return () => {
      clearInterval(eligibilityInterval);
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [checkEligibility]);

  const claimCoupon = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    setShowCopyModal(false);

    try {
      const response = await api.post('/coupons/claim');
      console.log('Claim response:', response.data); // Add logging
      
      if (response.data) {
        setSuccess(response.data);
        setShowCopyModal(true);
        await checkEligibility();
      } else {
        throw new Error('Invalid response format');
      }
    } catch (err) {
      console.error('Error claiming coupon:', err.response || err);
      const errorMessage = err.response?.data?.message || err.message || 'Error claiming coupon';
      setError(errorMessage);
      
      if (err.response?.data?.remainingTime?.total) {
        startCountdown(err.response.data.remainingTime.total);
      }
    } finally {
      setLoading(false);
    }
  }, [checkEligibility, startCountdown]);

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
