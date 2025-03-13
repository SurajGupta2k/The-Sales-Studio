require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const couponRoutes = require('./routes/couponRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Configure CORS specifically for your frontend
app.use(cors({
  origin: 'https://the-sales-studio.vercel.app',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));

// Handle OPTIONS preflight requests
app.options('*', cors());

// Parse JSON payloads and handle cookies
app.use(express.json());
app.use(cookieParser());

// Apply rate limiting to all requests
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100
});
app.use(limiter);

// Enhanced MongoDB connection with detailed error logging
console.log('Attempting to connect to MongoDB...');
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds
  socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
})
.then(() => {
  console.log('Successfully connected to MongoDB.');
  console.log('Connection Details:', {
    host: mongoose.connection.host,
    port: mongoose.connection.port,
    name: mongoose.connection.name
  });
})
.catch(err => {
  console.error('MongoDB connection error details:', {
    name: err.name,
    message: err.message,
    code: err.code,
    stack: err.stack
  });
  // Don't exit the process, let the application continue to serve the health endpoint
  console.log('Application will continue running without MongoDB connection');
});

// Health check endpoint with MongoDB connection status
app.get('/api/health', (req, res) => {
  const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({ 
    status: 'ok',
    mongodb: mongoStatus,
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api/coupons', couponRoutes);

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error('Unexpected error:', {
    name: err.name,
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  res.status(500).json({ 
    message: 'Internal server error. Please try again later.',
    type: err.name,
    path: req.path
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}. Ready to handle requests.`);
  console.log('Environment:', process.env.NODE_ENV);
  console.log('CORS origin:', 'https://the-sales-studio.vercel.app');
}); 