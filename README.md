# Coupon Distribution System

## Overview
A secure, fair coupon distribution web application that prevents abuse through intelligent tracking mechanisms.

## Features
- 🎫 Round-robin coupon distribution
- 🔒 IP and cookie-based abuse prevention
- 🕒 Configurable claim cooldown
- 🌐 Guest-friendly, no login required
- 🔄 Automatic coupon replenishment
- 📊 Real-time availability tracking

## Abuse Prevention Strategies

### 1. IP Address Tracking
- Each coupon claim is associated with the user's IP address
- Prevents multiple claims from the same IP within a specified timeframe
- Cooldown period: Configurable (default 30 seconds)
- Works across different devices on the same network

### 2. Cookie Session Tracking
- Generates a unique session ID for each browser session
- Tracks and limits coupon claims within the same session
- Session lifetime matches claim cooldown

### 3. Sequential Distribution
- Coupons are assigned in strict sequential order
- Ensures fair and predictable distribution
- Prevents cherry-picking or gaming the system
- Automatic replenishment when running low

## Prerequisites
- Node.js (v14+)
- MongoDB (local or Atlas)
- npm

## Local Setup

1. Clone the repository
```bash
git clone https://github.com/yourusername/coupon-distribution-system.git
cd coupon-distribution-system
```

2. Install dependencies
```bash
npm run install:all
```

3. Configure Environment
Create `.env` files in `backend` and `frontend` directories:

Backend `.env`:
```
PORT=5000
MONGODB_URI=your_mongodb_connection_string
FRONTEND_URL=http://localhost:3000 # This is the URL of our frontend app
CLAIM_COOLDOWN_MINUTES=30  # 30 seconds for testing

```

Frontend `.env`:
```
REACT_APP_API_URL=http://localhost:3000/api # This is the URL of our backend API
REACT_APP_BACKEND_URL=http://localhost:5000/api/coupons # This is the URL of our backend API
```

4. Seed the database
```bash
cd backend
npm run seed
```

5. Run the application
```bash
npm run dev
```

## Deployment

### Vercel (Frontend) + Render (Backend)
1. Frontend Deployment (Vercel)
   - Connect GitHub repository
   - Set build command: `npm run build`
   - Set output directory: `build`
   - Add environment variables:
     ```
     REACT_APP_API_URL=https://your-backend-url.onrender.com/api
     REACT_APP_BACKEND_URL=https://your-backend-url.onrender.com/api/coupons
     ```

2. Backend Deployment (Render)
   - Choose Web Service
   - Connect GitHub repository
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Add environment variables from `.env`
   - Set NODE_ENV=production

## Security Considerations
- HTTPS enforced in production
- HTTP-only, secure cookies
- Rate limiting implemented
- No sensitive data stored
- IP and session-based claim restrictions
- CORS protection with whitelisted origins
- Input validation and sanitization

## Monitoring and Logging
- Console logs for coupon generation
- Error tracking in backend
- Request/response logging
- MongoDB connection status monitoring
- Recommend integrating:
  - Sentry for error tracking
  - Prometheus for metrics
  - MongoDB Atlas for database monitoring

## Database Schema

### Coupon Model
- code: String (unique)
- sequenceNumber: Number (unique)
- isActive: Boolean
- claimedBy: String (IP address)
- claimedAt: Date
- timestamps: createdAt, updatedAt

### ClaimTracker Model
- ipAddress: String (indexed)
- sessionId: String (indexed)
- lastClaimAt: Date
- claimCount: Number
- timestamps: createdAt, updatedAt

## Contributing
1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push and create Pull Request

## License
MIT License

## Contact
[Your Contact Information]

## API Endpoints

### Coupon Endpoints
- `POST /api/coupons/claim` - Claim a coupon
- `GET /api/coupons/check-eligibility` - Check if user can claim a coupon
- `GET /api/coupons/remaining` - Get remaining coupon count
- `GET /api/coupons/all` - Get all coupons (paginated)

### System Endpoints
- `GET /api/health` - Health check endpoint

## Troubleshooting

### Common Issues
1. CORS Errors
   - Check if frontend URL is in allowed origins
   - Verify CORS configuration in backend

2. Rate Limiting
   - Check rate limit settings
   - Monitor request frequency

3. Database Connection
   - Verify MongoDB connection string
   - Check network connectivity
   - Monitor connection pool settings

### Debug Mode
Enable debug logging by setting:
```
DEBUG=true
```
in your backend `.env` file. 