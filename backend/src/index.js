require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const couponRoutes = require('./routes/couponRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Setup CORS to allow requests from the frontend URL, ensuring secure cross-origin access.
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));

// Parse JSON payloads and handle cookies
app.use(express.json());
app.use(cookieParser());

// Apply rate limiting to all requests to protect against brute-force attacks.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // Limit each IP to 100 requests per window to prevent abuse
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