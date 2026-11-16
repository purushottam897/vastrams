const express = require('express')
const router = express.Router()
const lockdownService = require('../services/lockdownService')

// Helper for sleek standalone emergency UI in Vastrams Theme
function renderEmergencyConsoleHtml({ title, mode, isActive, errorMessage, successMessage }) {
  const isDowntown = mode === 'downtown'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | Vastrams</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --canvas: #f8fafc;
      --surface: #ffffff;
      --border: #e2e8f0;
      --text-primary: #0f172a;
      --text-secondary: #475569;
      --text-muted: #94a3b8;
      --primary: #00c896;
      --primary-hover: #00a87e;
      --danger: #e84545;
      --danger-hover: #dc2626;
      --danger-light: #fef2f2;
      --success-light: #ecfdf5;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --canvas: #0b0f17;
        --surface: #121826;
        --border: #1e293b;
        --text-primary: #f8fafc;
        --text-secondary: #cbd5e1;
        --text-muted: #64748b;
        --danger-light: rgba(232, 69, 69, 0.12);
        --success-light: rgba(0, 200, 150, 0.12);
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--canvas);
      color: var(--text-primary);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .brand-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      margin-bottom: 1.75rem;
    }
    .brand-logo {
      width: 3.5rem;
      height: 3.5rem;
      border-radius: 1rem;
      background: linear-gradient(135deg, #10b981 0%, #047857 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 1.75rem;
      font-weight: 900;
      box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.3);
      border: 1px solid rgba(52, 211, 153, 0.4);
      margin-bottom: 0.75rem;
    }
    .brand-title {
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 1.5rem;
      font-weight: 900;
      letter-spacing: -0.025em;
    }
    .brand-subtitle {
      font-size: 0.8125rem;
      color: var(--text-muted);
      font-weight: 500;
      margin-top: 0.125rem;
    }
    .panel {
      width: 100%;
      max-width: 480px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      padding: 2rem;
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.08);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.25rem 0.75rem;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      border-radius: 9999px;
      margin-bottom: 1rem;
    }
    .badge-down {
      background: rgba(232, 69, 69, 0.1);
      color: var(--danger);
      border: 1px solid rgba(232, 69, 69, 0.2);
    }
    .badge-lit {
      background: rgba(0, 200, 150, 0.1);
      color: #059669;
      border: 1px solid rgba(0, 200, 150, 0.2);
    }
    @media (prefers-color-scheme: dark) {
      .badge-lit { color: #34d399; }
    }
    h2 {
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 1.25rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin-bottom: 0.5rem;
    }
    p {
      color: var(--text-secondary);
      font-size: 0.875rem;
      line-height: 1.5;
      margin-bottom: 1.5rem;
    }
    .status-box {
      background: var(--canvas);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 0.875rem 1rem;
      margin-bottom: 1.5rem;
      font-size: 0.8125rem;
    }
    .status-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.375rem;
    }
    .status-row:last-child { margin-bottom: 0; }
    .status-label { color: var(--text-muted); font-size: 0.75rem; }
    .status-value { font-weight: 700; font-size: 0.75rem; }
    .status-value.active { color: var(--danger); }
    .status-value.normal { color: #059669; }
    @media (prefers-color-scheme: dark) {
      .status-value.normal { color: #34d399; }
    }
    .alert {
      padding: 0.875rem 1rem;
      border-radius: 0.75rem;
      font-size: 0.8125rem;
      margin-bottom: 1.25rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .alert-error {
      background: var(--danger-light);
      border: 1px solid rgba(232, 69, 69, 0.3);
      color: #dc2626;
    }
    .alert-success {
      background: var(--success-light);
      border: 1px solid rgba(0, 200, 150, 0.3);
      color: #059669;
    }
    @media (prefers-color-scheme: dark) {
      .alert-error { color: #fca5a5; }
      .alert-success { color: #6ee7b7; }
    }
    .form-group { margin-bottom: 1.25rem; }
    label {
      display: block;
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--text-secondary);
      margin-bottom: 0.5rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    input[type="text"], input[type="password"] {
      width: 100%;
      background: var(--canvas);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      color: var(--text-primary);
      padding: 0.875rem 1rem;
      font-size: 0.9375rem;
      font-family: inherit;
      outline: none;
      transition: all 0.2s;
    }
    input[type="text"]:focus, input[type="password"]:focus {
      border-color: ${isDowntown ? 'var(--danger)' : 'var(--primary)'};
      box-shadow: 0 0 0 3px ${isDowntown ? 'rgba(232, 69, 69, 0.15)' : 'rgba(0, 200, 150, 0.15)'};
    }
    .btn-row {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-top: 1.25rem;
    }
    button, .btn-link {
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: none;
      border-radius: 0.75rem;
      padding: 0.875rem 1.25rem;
      font-size: 0.875rem;
      font-weight: 700;
      font-family: inherit;
      text-decoration: none;
      transition: all 0.15s;
    }
    .btn-danger {
      background: var(--danger);
      color: white;
      box-shadow: 0 4px 14px 0 rgba(232, 69, 69, 0.35);
    }
    .btn-danger:hover { background: var(--danger-hover); }
    .btn-success {
      background: #059669;
      color: white;
      box-shadow: 0 4px 14px 0 rgba(5, 150, 105, 0.35);
    }
    .btn-success:hover { background: #047857; }
    .btn-secondary {
      background: var(--canvas);
      color: var(--text-secondary);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover { background: var(--border); }
    .helper-text {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 0.375rem;
    }
    .nav-links {
      margin-top: 1.75rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
    }
    .nav-links a { color: var(--text-muted); text-decoration: none; }
    .nav-links a:hover { color: var(--text-primary); text-decoration: underline; }
  </style>
</head>
<body>
  <div class="brand-header">
    <div class="brand-logo">V</div>
    <div class="brand-title">VASTRAMS</div>
    <div class="brand-subtitle">Emergency Infrastructure Control</div>
  </div>

  <div class="panel">
    ${
      isDowntown
        ? `<span class="badge badge-down">Protocol // Down-Town</span>
           <h2>Initiate Emergency Lockdown</h2>
           <p>Roll out the <strong>504 Gateway time-out</strong> Cloudflare error page across the entire website, rendering it completely inaccessible to the public.</p>`
        : `<span class="badge badge-lit">Protocol // Litt-Up</span>
           <h2>System Recovery Console</h2>
           <p>Restore the website to full operation by submitting your recovery key. All traces of the recovery key in the database will be permanently purged.</p>`
    }

    <div class="status-box">
      <div class="status-row">
        <span class="status-label">Current Status:</span>
        <span class="status-value ${isActive ? 'active' : 'normal'}">${isActive ? 'LOCKED DOWN (504 ACTIVE)' : 'ONLINE & OPERATIONAL'}</span>
      </div>
      <div class="status-row">
        <span class="status-label">Target Infrastructure:</span>
        <span class="status-value">vastrams.vercel.app / Render</span>
      </div>
    </div>

    ${errorMessage ? `<div class="alert alert-error">⚠ ${errorMessage}</div>` : ''}
    ${successMessage ? `<div class="alert alert-success">✓ ${successMessage}</div>` : ''}

    ${
      isDowntown
        ? (isActive
            ? `<div class="alert alert-error">
                 The site is <strong>already locked down</strong>. All visitors are seeing the Cloudflare 504 error page.
               </div>
               <div class="btn-row">
                 <a href="/litt-up" class="btn-success">Go to /litt-up to Restore</a>
                 <a href="/error/500" class="btn-secondary">Preview Public 504 View</a>
               </div>`
            : `<form method="POST" action="/down-town">
                 <div class="form-group">
                   <label for="recoveryCode">Set Emergency Recovery Code</label>
                   <input type="text" id="recoveryCode" name="recoveryCode" placeholder="Enter recovery key (e.g. VASTRAMS-KEY-2026)" required autocomplete="off" />
                   <div class="helper-text">You MUST save this code. It is required on <code>/litt-up</code> to revive the site.</div>
                 </div>
                 <div class="btn-row">
                   <button type="button" class="btn-secondary" onclick="generateKey()">Generate Random Key</button>
                   <button type="submit" class="btn-danger">Trigger Down-Town (Roll Out 504)</button>
                 </div>
               </form>
               <script>
                 function generateKey() {
                   const key = 'RCV-' + Math.random().toString(36).substring(2, 8).toUpperCase() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
                   const inp = document.getElementById('recoveryCode');
                   inp.value = key;
                   inp.focus();
                 }
               </script>`)
        : (!isActive
            ? `<div class="alert alert-success">
                 Website is currently <strong>fully operational</strong>. No lockdown is active.
               </div>
               <div class="btn-row">
                 <a href="/" class="btn-secondary">Return to Website</a>
                 <a href="/down-town" class="btn-danger">Go to /down-town</a>
               </div>`
            : `<form method="POST" action="/litt-up">
                 <div class="form-group">
                   <label for="recoveryKey">Enter Recovery Key</label>
                   <input type="password" id="recoveryKey" name="recoveryKey" placeholder="Enter the code set during lockdown" required autocomplete="off" />
                   <div class="helper-text">Validating this key will unlock the site and delete all key traces from the database.</div>
                 </div>
                 <div class="btn-row">
                   <button type="submit" class="btn-success">Execute Litt-Up (Restore Site)</button>
                 </div>
               </form>`)
    }

    <div class="nav-links">
      <a href="/down-town">/down-town</a>
      <a href="/litt-up">/litt-up</a>
    </div>
  </div>
</body>
</html>`
}

// -------------------------------------------------------------
// GET /down-town & /down-town/ - Invisible console to initiate lockdown
// -------------------------------------------------------------
router.get(['/down-town', '/down-town/'], async (req, res) => {
  const isActive = await lockdownService.isLockdownActive()
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.json({ isActive, mode: 'down-town' })
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(renderEmergencyConsoleHtml({
    title: 'Down-Town Emergency Console',
    mode: 'downtown',
    isActive
  }))
})

// -------------------------------------------------------------
// POST /down-town & POST /api/down-town - Activate lockdown
// -------------------------------------------------------------
const handleDowntownActivation = async (req, res) => {
  const recoveryCode = req.body?.recoveryCode || req.query?.recoveryCode

  if (!recoveryCode || !recoveryCode.trim()) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(400).json({ success: false, error: 'A recovery code is required.' })
    }
    const isActive = await lockdownService.isLockdownActive()
    return res.status(400).send(renderEmergencyConsoleHtml({
      title: 'Down-Town Emergency Console',
      mode: 'downtown',
      isActive,
      errorMessage: 'A recovery code is required to execute lockdown.'
    }))
  }

  try {
    const result = await lockdownService.activateLockdown(recoveryCode, req)
    
    // If request wants JSON (e.g. from React Frontend)
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(200).json({
        success: true,
        message: 'Down-town executed. Cloudflare 504 error page deployed.',
        rayId: result.rayId
      })
    }

    // Direct browser form submission: simulate gateway delay then render Cloudflare 504 page
    await new Promise(r => setTimeout(r, 2200))
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.status(504).send(lockdownService.renderCfErrorPage(req))
  } catch (err) {
    console.error('[DOWN-TOWN ERROR]', err)
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ success: false, error: err.message })
    }
    const isActive = await lockdownService.isLockdownActive()
    return res.status(500).send(renderEmergencyConsoleHtml({
      title: 'Down-Town Emergency Console',
      mode: 'downtown',
      isActive,
      errorMessage: err.message
    }))
  }
}

router.post(['/down-town', '/down-town/'], handleDowntownActivation)
router.post(['/api/down-town', '/api/down-town/'], handleDowntownActivation)

// -------------------------------------------------------------
// GET /litt-up & /litt-up/ - Invisible console to lift lockdown
// -------------------------------------------------------------
router.get(['/litt-up', '/litt-up/'], async (req, res) => {
  const isActive = await lockdownService.isLockdownActive()
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.json({ isActive, mode: 'litt-up' })
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(renderEmergencyConsoleHtml({
    title: 'Litt-Up Recovery Console',
    mode: 'littup',
    isActive
  }))
})

// -------------------------------------------------------------
// POST /litt-up & POST /api/litt-up - Deactivate lockdown & destroy trace
// -------------------------------------------------------------
const handleLittupRestoration = async (req, res) => {
  const recoveryKey = req.body?.recoveryKey || req.query?.recoveryKey

  if (!recoveryKey || !recoveryKey.trim()) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(400).json({ success: false, error: 'Recovery key is required.' })
    }
    const isActive = await lockdownService.isLockdownActive()
    return res.status(400).send(renderEmergencyConsoleHtml({
      title: 'Litt-Up Recovery Console',
      mode: 'littup',
      isActive,
      errorMessage: 'Recovery key is required.'
    }))
  }

  try {
    const result = await lockdownService.deactivateLockdown(recoveryKey)

    if (!result.success) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(401).json({ success: false, error: result.error })
      }
      const isActive = await lockdownService.isLockdownActive()
      return res.status(401).send(renderEmergencyConsoleHtml({
        title: 'Litt-Up Recovery Console',
        mode: 'littup',
        isActive,
        errorMessage: result.error
      }))
    }

    // Success! Lockdown lifted, key trace destroyed in DB
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(200).json({
        success: true,
        message: result.message
      })
    }

    return res.send(renderEmergencyConsoleHtml({
      title: 'Litt-Up Recovery Console',
      mode: 'littup',
      isActive: false,
      successMessage: result.message
    }))
  } catch (err) {
    console.error('[LITT-UP ERROR]', err)
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ success: false, error: err.message })
    }
    const isActive = await lockdownService.isLockdownActive()
    return res.status(500).send(renderEmergencyConsoleHtml({
      title: 'Litt-Up Recovery Console',
      mode: 'littup',
      isActive,
      errorMessage: err.message
    }))
  }
}

router.post(['/litt-up', '/litt-up/'], handleLittupRestoration)
router.post(['/api/litt-up', '/api/litt-up/'], handleLittupRestoration)

// -------------------------------------------------------------
// GET /api/system/lockdown-status - Public/client status check
// -------------------------------------------------------------
router.get(['/api/system/lockdown-status', '/api/system/lockdown-status/'], async (req, res) => {
  const status = await lockdownService.getStatus()
  res.json(status)
})

module.exports = router
