const jwt = require('jsonwebtoken')
const User = require('../models/User')
const ACCESS_SECRET = process.env.JWT_SECRET || 'vastrams_access_secret_key'

// Paths that bypass the setup check
const bypassPaths = [
  '/api/auth/login',
  '/api/auth/setup',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/events'
]

module.exports = async (req, res, next) => {
  try {
    // Only intercept API calls
    if (!req.path.startsWith('/api')) {
      return next()
    }

    const isBypassed = bypassPaths.some(path => req.path.startsWith(path))
    if (isBypassed) {
      return next()
    }

    // 1. If req.user is already populated by authenticateJWT
    if (req.user) {
      if (req.user.setupBypassed) {
        return next()
      }
      if (req.user.isDefaultCredential) {
        return res.status(403).json({
          success: false,
          requiresSetup: true,
          message: 'Account setup required before accessing this resource'
        })
      }
      return next()
    }

    // 2. Otherwise, check Authorization header manually
    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1]
      try {
        const decoded = jwt.verify(token, ACCESS_SECRET)
        
        if (decoded.setupBypassed) {
          return next()
        }

        const user = await User.findById(decoded.id)
        if (user && user.isDefaultCredential) {
          return res.status(403).json({
            success: false,
            requiresSetup: true,
            message: 'Account setup required before accessing this resource'
          })
        }
      } catch (err) {
        // Let authenticateJWT handle token validation errors later
      }
    }

    next()
  } catch (error) {
    next(error)
  }
}
