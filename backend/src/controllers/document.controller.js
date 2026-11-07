const crypto = require('crypto')
const path = require('path')
const fs = require('fs')
const os = require('os')

function getAccessibleHost(req) {
  if (process.env.PUBLIC_URL) {
    return process.env.PUBLIC_URL.replace(/^https?:\/\//, '').replace(/\/$/, '')
  }

  const hostHeader = (req && typeof req.get === 'function' ? req.get('host') : '') || ''
  const isLocal = hostHeader.includes('localhost') || hostHeader.includes('127.0.0.1')

  if (!isLocal && hostHeader) {
    return hostHeader
  }

  // Look for a non-internal IPv4 address on the local network (e.g. 192.168.x.x / 10.x.x.x)
  // so mobile devices on the same Wi-Fi can scan and load the PDF
  try {
    const interfaces = os.networkInterfaces()
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          const port = hostHeader.split(':')[1] || process.env.PORT || 5001
          return `${iface.address}:${port}`
        }
      }
    }
  } catch {}

  return hostHeader || `localhost:${process.env.PORT || 5001}`
}

function getDocumentsDir() {
  const dir = path.join(__dirname, '../../upload/documents')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

// Generate or retrieve public access token for a given document
exports.getToken = async (req, res, next) => {
  try {
    const { type, id } = req.body
    if (!type || !id) {
      return res.status(400).json({ success: false, message: 'Type and ID are required' })
    }

    const secret = process.env.JWT_SECRET || 'vastrams_secret'
    const docIdentifier = `${type}_${id}_${secret}`
    const token = crypto.createHash('sha256').update(docIdentifier).digest('hex').substring(0, 32)

    const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http')
    const host = getAccessibleHost(req)
    const publicUrl = `${protocol}://${host}/api/documents/public/${token}`

    res.status(200).json({
      success: true,
      token,
      publicUrl,
      downloadUrl: `/uploads/documents/${token}.pdf`
    })
  } catch (err) {
    next(err)
  }
}

// Save uploaded PDF buffer
exports.saveDocument = async (req, res, next) => {
  try {
    const { token, pdfBase64, filename } = req.body
    if (!token || !/^[a-f0-9]{16,64}$/i.test(token)) {
      return res.status(400).json({ success: false, message: 'Valid 32-char hex token is required' })
    }
    if (!pdfBase64) {
      return res.status(400).json({ success: false, message: 'PDF base64 data is required' })
    }

    const dir = getDocumentsDir()
    const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '')
    const buffer = Buffer.from(cleanBase64, 'base64')
    if (buffer.length < 50) {
      return res.status(400).json({ success: false, message: 'Corrupted or empty PDF data' })
    }

    const filePath = path.join(dir, `${token}.pdf`)
    fs.writeFileSync(filePath, buffer)

    const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http')
    const host = getAccessibleHost(req)
    const publicUrl = `${protocol}://${host}/api/documents/public/${token}`

    res.status(200).json({
      success: true,
      token,
      publicUrl,
      downloadUrl: `/uploads/documents/${token}.pdf`,
      filename: filename || `${token}.pdf`,
      size: buffer.length
    })
  } catch (err) {
    next(err)
  }
}

// Serve public PDF to customer without authentication
exports.getPublicDocument = (req, res) => {
  const { token } = req.params
  if (!token || !/^[a-f0-9]{16,64}$/i.test(token)) {
    return res.status(400).send('Invalid document token')
  }

  const dir = path.join(__dirname, '../../upload/documents')
  const filePath = path.join(dir, `${token}.pdf`)

  if (!fs.existsSync(filePath)) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Document Not Found</title></head>
        <body style="font-family:sans-serif;text-align:center;padding:50px;">
          <h2>Document Not Found or Not Yet Generated</h2>
          <p>Please ensure the invoice or payment voucher has been exported from Vastrams.</p>
        </body>
      </html>
    `)
  }

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', 'inline; filename="vastrams_document.pdf"')
  fs.createReadStream(filePath).pipe(res)
}

module.exports.getAccessibleHost = getAccessibleHost
module.exports.getDocumentsDir = getDocumentsDir
