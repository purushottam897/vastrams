const lockdownService = require('../services/lockdownService')

const EXEMPT_PATHS = [
  '/down-town',
  '/litt-up',
  '/api/down-town',
  '/api/litt-up',
  '/api/system/lockdown-status'
]

async function lockdownGuard(req, res, next) {
  // Normalize path
  const normalizedPath = req.path.replace(/\/+$/, '') || '/'

  // Always allow the secret emergency toggle endpoints
  for (const exempt of EXEMPT_PATHS) {
    if (normalizedPath === exempt || normalizedPath.startsWith(exempt + '/')) {
      return next()
    }
  }

  try {
    const isLocked = await lockdownService.isLockdownActive()
    if (!isLocked) {
      return next()
    }

    // Site is in lockdown - simulate upstream host timeout before rolling out Cloudflare 504 page
    const acceptsHtml = req.accepts('html') && !req.xhr && !req.path.startsWith('/api')

    if (acceptsHtml) {
      // Allow browser loading arc / tab spinner to simulate authentic gateway timeout
      await new Promise(r => setTimeout(r, 2200))
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      return res.status(504).send(lockdownService.renderCfErrorPage(req))
    }

    // API or AJAX request
    await new Promise(r => setTimeout(r, 1200))
    return res.status(504).json({
      success: false,
      status: 504,
      error: 'Catastrophic infrastructure failure (Gateway time-out)',
      lockdown: true,
      html: lockdownService.renderCfErrorPage(req)
    })
  } catch (err) {
    console.error('[LOCKDOWN GUARD ERROR]', err)
    return next()
  }
}

module.exports = lockdownGuard
