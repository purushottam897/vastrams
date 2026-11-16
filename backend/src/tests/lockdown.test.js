const test = require('node:test')
const assert = require('node:assert/strict')
const mongoose = require('mongoose')
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') })

const lockdownService = require('../services/lockdownService')
const Lockdown = require('../models/Lockdown')

test('Lockdown Service & Database Trace Destruction Tests', async (t) => {
  // Connect to DB if not connected
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI)
  }

  // Ensure clean slate before tests
  await Lockdown.deleteMany({})

  await t.test('1. Initial state is not locked down', async () => {
    const isLocked = await lockdownService.isLockdownActive()
    assert.equal(isLocked, false)
  })

  await t.test('2. activateLockdown requires a recovery code', async () => {
    await assert.rejects(
      async () => {
        await lockdownService.activateLockdown('', {})
      },
      /recovery code is required/i
    )
  })

  await t.test('3. activateLockdown activates lockdown and hashes recovery key', async () => {
    const secret = 'TEST-KEY-' + Date.now()
    const result = await lockdownService.activateLockdown(secret, { ip: '127.0.0.1' })

    assert.equal(result.success, true)
    assert.ok(result.rayId)

    const isLocked = await lockdownService.isLockdownActive()
    assert.equal(isLocked, true)

    // Verify in MongoDB
    const doc = await Lockdown.findOne({ isActive: true })
    assert.ok(doc)
    assert.equal(doc.isActive, true)
    assert.equal(doc.recoveryKey, secret, 'Recovery key is stored directly in MongoDB')
    assert.ok(doc.recoveryKeyHash.startsWith('$2'))
  })

  await t.test('4. renderCfErrorPage renders Cloudflare 504 page matching user specification', () => {
    const html = lockdownService.renderCfErrorPage({
      get: () => '1234567890abcdef',
      socket: { remoteAddress: '127.0.0.1' }
    })

    assert.ok(html.includes('Catastrophic infrastructure failure'))
    assert.ok(html.includes('Error code 504'))
    assert.ok(html.includes('vastrams.vercel.app'))
    assert.ok(html.includes('Render'))
    assert.ok(html.includes('504'))
    assert.ok(html.includes('Working'))
    assert.ok(html.includes('There is a catastrophic failure.'))
    assert.ok(html.includes('Please try again in a few minutes.'))
  })

  await t.test('5. deactivateLockdown rejects invalid recovery key', async () => {
    const result = await lockdownService.deactivateLockdown('INCORRECT-KEY')
    assert.equal(result.success, false)
    assert.match(result.error, /invalid recovery key/i)

    // Lockdown must still be active
    const isLocked = await lockdownService.isLockdownActive()
    assert.equal(isLocked, true)
  })

  await t.test('6. deactivateLockdown with correct key lifts lockdown and PURGES trace from DB', async () => {
    // Re-lock with known key
    const secret = 'CORRECT-SECRET-2026'
    await lockdownService.activateLockdown(secret, {})

    const restoreResult = await lockdownService.deactivateLockdown(secret)
    assert.equal(restoreResult.success, true)

    // Check lockdown is inactive
    const isLocked = await lockdownService.isLockdownActive()
    assert.equal(isLocked, false)

    // Check DB: MUST be zero documents, all traces destroyed!
    const remainingCount = await Lockdown.countDocuments({})
    assert.equal(remainingCount, 0, 'Database must contain 0 lockdown records, destroying all traces!')
  })
})
