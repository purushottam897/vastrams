import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const documentController = require('../controllers/document.controller')

test('Document PDF Storage and Public QR Code Access Tests', async (t) => {
  const dummyToken = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'

  await t.test('getAccessibleHost returns accessible IP or domain', () => {
    const mockReq = {
      get: (header) => (header.toLowerCase() === 'host' ? 'localhost:5001' : null),
      headers: {},
      secure: false
    }

    const host = documentController.getAccessibleHost(mockReq)
    assert.ok(host, 'Host should be resolved')
    assert.ok(typeof host === 'string', 'Host should be a string')
    // Should contain either port 5001 or IP/domain
    assert.ok(host.includes('5001') || host.length > 5, 'Should include host with port')
  })

  await t.test('getToken returns valid token and public QR URL', async () => {
    let responseData = null
    const mockReq = {
      body: { type: 'payment', id: 'pay_test_123' },
      get: () => '10.123.11.237:5001',
      headers: {},
      secure: false
    }
    const mockRes = {
      status: (code) => {
        assert.equal(code, 200)
        return {
          json: (data) => {
            responseData = data
          }
        }
      }
    }

    await documentController.getToken(mockReq, mockRes, () => {})

    assert.ok(responseData, 'Response data must be returned')
    assert.equal(responseData.success, true)
    assert.equal(typeof responseData.token, 'string')
    assert.equal(responseData.token.length, 32, 'Token should be 32-character hex string')
    assert.ok(responseData.publicUrl.includes('/api/documents/public/'), 'URL must point to public document endpoint')
    assert.ok(responseData.publicUrl.includes(responseData.token), 'URL must contain the secure token')
  })

  await t.test('saveDocument persists PDF file to disk', async () => {
    const dummyPdfContent = '%PDF-1.4 sample pdf content for unit test testing purposes'
    const pdfBase64 = Buffer.from(dummyPdfContent).toString('base64')

    let responseData = null
    const mockReq = {
      body: {
        token: dummyToken,
        pdfBase64: `data:application/pdf;base64,${pdfBase64}`,
        filename: 'Payment_Voucher_TSR_Textiles_2026-11-08.pdf'
      },
      get: () => '10.123.11.237:5001',
      headers: {},
      secure: false
    }
    const mockRes = {
      status: (code) => {
        assert.equal(code, 200)
        return {
          json: (data) => {
            responseData = data
          }
        }
      }
    }

    await documentController.saveDocument(mockReq, mockRes, () => {})

    assert.ok(responseData, 'Must receive save confirmation')
    assert.equal(responseData.success, true)
    assert.equal(responseData.token, dummyToken)

    // Verify physical file was written to disk
    const targetDir = documentController.getDocumentsDir()
    const filePath = path.join(targetDir, `${dummyToken}.pdf`)
    assert.ok(fs.existsSync(filePath), 'Saved PDF file must exist on disk')

    // Clean up test file
    fs.unlinkSync(filePath)
  })

  await t.test('getPublicDocument rejects invalid tokens with 400', () => {
    let statusCode = null
    let responseBody = null
    const mockReq = { params: { token: 'invalid-token-with-special-chars!' } }
    const mockRes = {
      status: (code) => {
        statusCode = code
        return {
          send: (body) => { responseBody = body }
        }
      }
    }

    documentController.getPublicDocument(mockReq, mockRes)
    assert.equal(statusCode, 400)
    assert.equal(responseBody, 'Invalid document token')
  })
})
