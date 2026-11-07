const express = require('express')
const router = express.Router()
const documentController = require('../controllers/document.controller')
const { authenticateJWT } = require('../middleware/auth.middleware')

// Public access endpoint for scanning QR code (no auth required)
router.get('/public/:token', documentController.getPublicDocument)

// Authenticated endpoints for generation and storage
router.post('/token', authenticateJWT, documentController.getToken)
router.post('/save', authenticateJWT, documentController.saveDocument)

module.exports = router
