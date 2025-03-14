// Load our environment variables from .env file
require('dotenv').config();

// Import all the packages we need
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const couponRoutes = require('./routes/couponRoutes');

// Create our Express app and set the port
const app = express();
const PORT = process.env.PORT || 5000;

// Set up CORS to control which websites can access our API
const corsOptions = {
  origin: [
    'https://the-sales-studio.vercel.app',
    'https://the-sales-studio-pl7as4ncp-surajs-projects-6ee14365.vercel.app',
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

// Set up security and basic app settings
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// Prevent people from spamming our API (max 100 requests per 15 minutes)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// Connect to our database
console.log('Attempting to connect to MongoDB...');
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
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
    code: err.code
  });
  console.log('Application will continue running without MongoDB connection');
});

// Set up our API endpoints
app.get('/api/health', (req, res) => {
  const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({ 
    status: 'ok',
    mongodb: mongoStatus,
    timestamp: new Date().toISOString(),
    cors: {
      origin: req.headers.origin,
      method: req.method
    }
  });
});

// Hook up our coupon-related routes
app.use('/api/coupons', couponRoutes);

// Handle any errors that occur in our app
app.use((err, req, res, next) => {
  console.error('Error:', {
    name: err.name,
    message: err.message,
    path: req.path,
    method: req.method,
    origin: req.headers.origin
  });
  res.status(500).json({ 
    message: 'Internal server error. Please try again later.',
    type: err.name,
    path: req.path
  });
});

// Start our server and log some helpful info
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Allowed Origin:', 'https://the-sales-studio.vercel.app');
}); 