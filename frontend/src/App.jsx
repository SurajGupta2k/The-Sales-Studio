// Import necessary React hooks and axios for API calls
import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Transition } from '@headlessui/react';
import { ClipboardDocumentIcon, ClockIcon, GiftIcon } from '@heroicons/react/24/outline';
import toast, { Toaster } from 'react-hot-toast';

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
      await new Promise(resolve => setTimeout(resolve, 1000));
      setCopyStatus('Copied!');
      toast.success('Coupon copied to clipboard!');
      setTimeout(() => {
        setCopyStatus('Copy');
        setShowCopyModal(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      setCopyStatus('Failed to copy');
      toast.error('Failed to copy coupon');
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
      if (response.data) {
        setSuccess(response.data);
        setShowCopyModal(true);
        toast.success('Coupon claimed successfully!');
        await checkEligibility();
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'Error claiming coupon';
      setError(errorMessage);
      toast.error(errorMessage);
      if (err.response?.data?.remainingTime?.total) {
        startCountdown(err.response.data.remainingTime.total);
      }
    } finally {
      setLoading(false);
    }
  }, [checkEligibility, startCountdown]);

  // Main app UI with gradient background and card layout
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 py-6 flex flex-col justify-center sm:py-12">
      <Toaster position="top-center" />
      
      <div className="relative py-3 sm:max-w-xl sm:mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative px-4 py-10 bg-white shadow-2xl rounded-3xl sm:p-20"
        >
          <div className="max-w-md mx-auto">
            <div className="divide-y divide-gray-200">
              <div className="py-8 text-base leading-6 space-y-4 text-gray-700 sm:text-lg sm:leading-7">
                <div className="flex items-center justify-center mb-8">
                  <GiftIcon className="h-12 w-12 text-indigo-500 mr-3" />
                  <h2 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-purple-500">
                    Coupon Distribution
                  </h2>
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="bg-red-50 border-l-4 border-red-400 p-4 mb-4 rounded-r-lg"
                    >
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <ClockIcon className="h-5 w-5 text-red-400" />
                        </div>
                        <div className="ml-3">
                          <p className="text-sm text-red-700">{error}</p>
                          {countdown && (
                            <p className="text-sm text-red-600 mt-2">Time remaining: {countdown}</p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {!eligibility.canClaim && !showCopyModal && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg"
                  >
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <ClockIcon className="h-5 w-5 text-yellow-400" />
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-yellow-700">
                          Time until next claim: {countdown || eligibility.remainingTime.formatted}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {eligibility.canClaim && !showCopyModal && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={claimCoupon}
                    disabled={loading}
                    className={`w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-lg font-medium text-white ${
                      loading
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700'
                    }`}
                  >
                    <GiftIcon className="h-6 w-6 mr-2" />
                    {loading ? 'Claiming...' : 'Claim Coupon'}
                  </motion.button>
                )}

                <Transition show={showCopyModal} as={React.Fragment}>
                  <div className="fixed inset-0 z-10 overflow-y-auto">
                    <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                      <Transition.Child
                        as={React.Fragment}
                        enter="ease-out duration-300"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="ease-in duration-200"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                      >
                        <div className="fixed inset-0 transition-opacity">
                          <div className="absolute inset-0 bg-gray-500 bg-opacity-75"></div>
                        </div>
                      </Transition.Child>

                      <Transition.Child
                        as={React.Fragment}
                        enter="ease-out duration-300"
                        enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                        enterTo="opacity-100 translate-y-0 sm:scale-100"
                        leave="ease-in duration-200"
                        leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                        leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                      >
                        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-sm sm:w-full sm:p-6">
                          <div>
                            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
                              <GiftIcon className="h-6 w-6 text-green-600" />
                            </div>
                            <div className="mt-3 text-center sm:mt-5">
                              <h3 className="text-lg leading-6 font-medium text-gray-900">
                                Your Coupon Code
                              </h3>
                              <div className="mt-4">
                                <div className="bg-gray-50 p-4 rounded-lg">
                                  <p className="text-2xl font-mono text-indigo-600">{success?.coupon}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="mt-5 sm:mt-6">
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={handleCopy}
                              className={`w-full flex justify-center items-center py-2 px-4 rounded-md text-white font-medium ${
                                copyStatus === 'Copied!' 
                                  ? 'bg-green-500'
                                  : copyStatus === 'Failed to copy'
                                  ? 'bg-red-500'
                                  : 'bg-indigo-600 hover:bg-indigo-700'
                              }`}
                            >
                              <ClipboardDocumentIcon className="h-5 w-5 mr-2" />
                              {copyStatus}
                            </motion.button>
                          </div>
                        </div>
                      </Transition.Child>
                    </div>
                  </div>
                </Transition>

                {eligibility.availableCoupons !== undefined && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-4 text-sm text-gray-600 text-center"
                  >
                    Available coupons: {eligibility.availableCoupons}
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default App;
