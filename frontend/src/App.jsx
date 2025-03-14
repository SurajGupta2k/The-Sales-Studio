// Import necessary React hooks and axios for API calls
import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

// API endpoint for our backend service
const API_URL = 'https://the-sales-studio.onrender.com/api';
console.log('Environment Variables:', {
  API_URL: API_URL,
  NODE_ENV: process.env.NODE_ENV,
  ORIGIN: window.location.origin
});

// Set up axios with our preferred settings for API calls
const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  timeout: 30000,
  validateStatus: function (status) {
    return status >= 200 && status < 500; // We want to handle errors ourselves
  }
});

// Log all outgoing API requests for debugging
api.interceptors.request.use(
  config => {
    console.log('Making request to:', config.baseURL + config.url, {
      method: config.method,
      headers: config.headers,
      data: config.data
    });
    return config;
  },
  error => {
    console.error('Request setup error:', error.message);
    return Promise.reject(error);
  }
);

// Log all API responses for debugging
api.interceptors.response.use(
  response => {
    console.log('Received response:', {
      status: response.status,
      url: response.config.url,
      data: response.data,
      headers: response.headers
    });
    return response;
  },
  error => {
    console.error('API Error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      headers: error.response?.headers,
      url: error.config?.url
    });
    return Promise.reject(error);
  }
);

function App() {
  // State variables to manage the app's behavior
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
  const [apiHealth, setApiHealth] = useState(null);

  // Refs to keep track of timers and countdown
  const countdownRef = useRef(null);
  const remainingTimeRef = useRef(0);

  // Helper function to format milliseconds into human readable time
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

  // Start countdown timer for next available coupon
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
        // Check if user can claim again
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

  // Check if user is eligible to claim a coupon
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
      // Reset eligibility on error
      setEligibility({
        canClaim: false,
        remainingTime: { total: 0, formatted: '' },
        availableCoupons: 0
      });
    }
  }, [startCountdown]);

  // Handle copying coupon code to clipboard
  const handleCopy = useCallback(async () => {
    try {
      if (!success?.coupon) {
        throw new Error('No coupon to copy');
      }
      await navigator.clipboard.writeText(success.coupon);
      setCopyStatus('Copying...');
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
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

  // Check eligibility periodically
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

  // Handle claiming a new coupon
  const claimCoupon = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    setShowCopyModal(false);

    try {
      const response = await api.post('/coupons/claim');
      console.log('Claim response:', response.data);
      
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

  // Check if API is healthy on component mount
  useEffect(() => {
    const checkApiHealth = async () => {
      try {
        const response = await api.get('/health');
        console.log('API Health Check:', response.data);
        setApiHealth(response.data);
      } catch (err) {
        console.error('API Health Check Failed:', err);
        setApiHealth({ status: 'error', message: err.message });
      }
    };
    checkApiHealth();
  }, []);

  // Main app UI with gradient background and card layout
  return (
    <div className="min-h-screen bg-gray-100 py-6 flex flex-col justify-center sm:py-12">
      <div className="relative py-3 sm:max-w-xl sm:mx-auto">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-light-blue-500 shadow-lg transform -skew-y-6 sm:skew-y-0 sm:-rotate-6 sm:rounded-3xl"></div>
        <div className="relative px-4 py-10 bg-white shadow-lg sm:rounded-3xl sm:p-20">
          <div className="max-w-md mx-auto">
            <div className="divide-y divide-gray-200">
              <div className="py-8 text-base leading-6 space-y-4 text-gray-700 sm:text-lg sm:leading-7">
                <h2 className="text-3xl font-extrabold text-gray-900 mb-8">Coupon Distribution System</h2>
                
                {/* Show error messages if any */}
                {error && (
                  <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
                    <p className="text-red-700">{error}</p>
                    {countdown && (
                      <p className="text-red-600 mt-2">Time remaining: {countdown}</p>
                    )}
                  </div>
                )}

                {/* Show countdown if user can't claim yet */}
                {!eligibility.canClaim && !showCopyModal && (
                  <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                    <p className="text-yellow-700">
                      Time until next claim: {countdown || eligibility.remainingTime.formatted}
                    </p>
                  </div>
                )}

                {/* Show claim button if user is eligible */}
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

                {/* Modal to show claimed coupon */}
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

                {/* Show number of available coupons */}
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
