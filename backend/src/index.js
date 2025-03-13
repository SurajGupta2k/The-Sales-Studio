require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const couponRoutes = require('./routes/couponRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Explicitly set CORS headers for all responses
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://the-sales-studio.vercel.app');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Additional CORS configuration
app.use(cors({
  origin: 'https://the-sales-studio.vercel.app',
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON payloads and handle cookies
app.use(express.json());
app.use(cookieParser());

// Apply rate limiting to all requests
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100
});
app.use(limiter);

// Establish a connection to MongoDB, handling any connection errors.
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/coupon-system')
  .then(() => console.log('Successfully connected to MongoDB.'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define routes for handling API requests.
app.use('/api/coupons', couponRoutes);

// Simple health check endpoint to verify server status.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Centralized error handling middleware for logging and responding to unexpected issues.
app.use((err, req, res, next) => {
  console.error('Unexpected error:', err.stack);
  res.status(500).json({ message: 'Internal server error. Please try again later.' });
});

// Start the server on the configured port.
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}. Ready to handle requests.`);
}); 