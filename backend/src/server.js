require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const helmet = require('helmet')
const mongoSanitize = require('express-mongo-sanitize')
const rateLimit = require('express-rate-limit')
const passport = require('passport')
const path = require('path')

const connectDB = require('./config/db')
const errorHandler = require('./middleware/errorHandler')

// Loud validation of basic environment variables
const PORT = process.env.PORT || 5001

// Initialize Express App
const app = express()

// Trust the first reverse proxy hop (Render cloud load balancer / reverse proxy)
// Allows Express and express-rate-limit to accurately resolve the client IP from X-Forwarded-For
// and prevents ERR_ERL_UNEXPECTED_X_FORWARDED_FOR validation errors.
app.set('trust proxy', 1)

// 1. Helmet HTTP Security Headers
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for local dev assets / inline styles
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}))

// 2. NoSQL Injection Prevention (express-mongo-sanitize)
// Strips keys beginning with '$' or '.' to neutralize NoSQL injection attacks
app.use(mongoSanitize({
  replaceWith: '_'
}))

// 3. Passport.js Authentication Strategy Initialization
require('./config/passport')(passport)
app.use(passport.initialize())

// 4. Initialize SMTP Transporter Verification
require('./config/mailer')

// Connect to Database and seed initial data
connectDB().then(() => {
  const seedAdminUser = require('./config/seed')
  seedAdminUser()
})

// 4. Strict CORS configuration with dynamic Vastrams Vercel preview domain support
const { corsOptions } = require('./config/cors')
app.use(cors(corsOptions))
app.options('*', cors(corsOptions))

// 5. Rate Limiting Protection
// Dedicated strict rate limiter for login endpoint to prevent brute-forcing
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 10, // Max 10 login attempts per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 15 minutes.'
  }
})
app.use('/api/auth/login', loginLimiter)

// General API rate limiter to prevent mass database scraping
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 500, // Max 500 requests per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/events' || req.path === '/health',
  message: {
    success: false,
    message: 'Too many API requests. Please slow down.'
  }
})
app.use('/api/', apiLimiter)

// Parsing middleware
app.use(express.json({ limit: '5mb' }))
app.use(express.urlencoded({ extended: true, limit: '5mb' }))
app.use(cookieParser())

// Request ID tracking middleware
const requestId = require('./middleware/requestId.middleware')
app.use(requestId)

// Serve static uploads
app.use('/uploads', express.static(path.join(__dirname, '../upload')))

// Base Health Check & Root Endpoints (before auth/setup middleware)
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    success: true,
    message: 'Vastrams API Server is operational',
    database: require('mongoose').connection.readyState === 1 ? 'connected' : 'connecting',
    timestamp: new Date().toISOString()
  })
})

app.get('/health', (req, res) => {
  const isConnected = require('mongoose').connection.readyState === 1
  res.status(200).json({
    status: 'ok',
    success: true,
    database: isConnected ? 'connected' : 'connecting',
    timestamp: new Date().toISOString()
  })
})

app.get('/api/health', (req, res) => {
  const isConnected = require('mongoose').connection.readyState === 1
  res.status(200).json({
    status: 'ok',
    success: true,
    database: isConnected ? 'connected' : 'connecting',
    timestamp: new Date().toISOString()
  })
})

// Global Setup Verification Middleware
const requiresSetupComplete = require('./middleware/requiresSetupComplete')
app.use(requiresSetupComplete)

// Route definitions
app.use('/api/auth/setup', require('./routes/auth/setup'))
app.use('/api/auth', require('./routes/auth.routes'))
app.use('/api/users', require('./routes/auth.routes'))
app.use('/api/dashboard', require('./routes/dashboard.routes'))
app.use('/api/vendors', require('./routes/vendor.routes'))
app.use('/api/bills', require('./routes/bill.routes'))
app.use('/api/payments', require('./routes/payment.routes'))
app.use('/api/financiers', require('./routes/financier.routes'))
app.use('/api/loans', require('./routes/loan.routes'))
app.use('/api/cheques', require('./routes/cheque.routes'))
app.use('/api/ledger', require('./routes/ledger.routes'))
app.use('/api/reports', require('./routes/reports.routes'))
app.use('/api/settings', require('./routes/settings.routes'))
app.use('/api/notifications', require('./routes/notification.routes'))

const { sseHandler } = require('./utils/sse')
app.get('/api/events', sseHandler)
app.use('/api', require('./routes/backup.routes'))

// Global Error Handler
app.use(errorHandler)

// Prevent unhandled promise rejections from crashing the process
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason)
})

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err)
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\x1b[32m%s\x1b[0m`, `Server running on port ${PORT} (0.0.0.0)`)
})
