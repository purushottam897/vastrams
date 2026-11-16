const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const { render } = require('cloudflare-error-page')
const Lockdown = require('../models/Lockdown')

let cachedStatus = null
let lastCheckedAt = 0
const CACHE_TTL_MS = 2000

/**
 * Check if the site is currently locked down
 */
async function isLockdownActive() {
  const now = Date.now()
  if (cachedStatus !== null && now - lastCheckedAt < CACHE_TTL_MS) {
    return cachedStatus
  }

  try {
    const active = await Lockdown.findOne({ isActive: true }).lean()
    cachedStatus = !!active
    lastCheckedAt = now
    return cachedStatus
  } catch (err) {
    console.error('[LOCKDOWN SERVICE] Failed to check status:', err.message)
    return cachedStatus || false
  }
}

/**
 * Generate standard Cloudflare 500 Catastrophic Failure HTML
 */
function renderCfErrorPage(req) {
  const rayId =
    (req && typeof req.get === 'function' ? req.get('Cf-Ray') : '')?.substring(0, 16) ||
    crypto.randomBytes(8).toString('hex')

  const clientIp =
    (req && typeof req.get === 'function' ? req.get('X-Forwarded-For') : null) ||
    req?.socket?.remoteAddress ||
    '127.0.0.1'

  return render({
    title: 'Catastrophic infrastructure failure',
    error_code: '504',
    more_information: {
      hidden: false,
      text: '',
      link: '',
      for: 'help'
    },
    browser_status: {
      status: 'ok',
      location: '',
      name: '',
      status_text: 'Working'
    },
    cloudflare_status: {
      status: 'error',
      location: 'Everywhere',
      name: '',
      status_text: 'Error'
    },
    host_status: {
      status: 'error',
      location: 'vastrams.vercel.app',
      name: 'Render',
      status_text: '504'
    },
    error_source: 'host',
    what_happened: 'There is a catastrophic failure.',
    what_can_i_do: 'Please try again in a few minutes.',
    perf_sec_by: {
      text: '',
      link: ''
    },
    ray_id: rayId,
    client_ip: clientIp
  })
}

/**
 * Activate lockdown with recovery code
 */
async function activateLockdown(recoveryKey, req) {
  if (!recoveryKey || typeof recoveryKey !== 'string' || recoveryKey.trim().length === 0) {
    throw new Error('A recovery code is required to initiate lockdown.')
  }

  const trimmedKey = recoveryKey.trim()
  const salt = await bcrypt.genSalt(10)
  const recoveryKeyHash = await bcrypt.hash(trimmedKey, salt)

  // Wipe previous traces
  await Lockdown.deleteMany({})

  const rayId = crypto.randomBytes(8).toString('hex')
  const clientIp =
    (req && typeof req.get === 'function' ? req.get('X-Forwarded-For') : null) ||
    req?.socket?.remoteAddress ||
    '127.0.0.1'

  const record = await Lockdown.create({
    isActive: true,
    recoveryKey: trimmedKey,
    recoveryKeyHash,
    rayId,
    activatedByIp: clientIp,
    activatedAt: new Date()
  })

  cachedStatus = true
  lastCheckedAt = Date.now()

  return {
    success: true,
    rayId,
    activatedAt: record.activatedAt
  }
}

/**
 * Deactivate lockdown and destroy recovery key traces from DB
 */
async function deactivateLockdown(recoveryKey) {
  if (!recoveryKey || typeof recoveryKey !== 'string' || recoveryKey.trim().length === 0) {
    return { success: false, error: 'Recovery key is required to restore the website.' }
  }

  const record = await Lockdown.findOne({ isActive: true })
  if (!record) {
    cachedStatus = false
    lastCheckedAt = Date.now()
    return { success: true, message: 'Website is already operational. No active lockdown found.' }
  }

  const trimmedKey = recoveryKey.trim()
  const isDirectMatch = record.recoveryKey && record.recoveryKey === trimmedKey
  const isHashMatch = record.recoveryKeyHash && (await bcrypt.compare(trimmedKey, record.recoveryKeyHash))

  if (!isDirectMatch && !isHashMatch) {
    return { success: false, error: 'Invalid recovery key. Access denied.' }
  }

  // Destroy all traces of recovery key and lockdown from the database
  await Lockdown.deleteMany({})

  cachedStatus = false
  lastCheckedAt = Date.now()

  return {
    success: true,
    message: 'Lockdown lifted. Recovery key trace purged from database. Website is now fully accessible.'
  }
}

/**
 * Get current public lockdown status
 */
async function getStatus() {
  const active = await isLockdownActive()
  if (!active) {
    return { isActive: false }
  }
  const record = await Lockdown.findOne({ isActive: true }).select('activatedAt rayId').lean()
  return {
    isActive: true,
    activatedAt: record?.activatedAt,
    rayId: record?.rayId
  }
}

module.exports = {
  isLockdownActive,
  renderCfErrorPage,
  activateLockdown,
  deactivateLockdown,
  getStatus
}
