import crypto from 'crypto'

// Derive AES-256 key from JWT_SECRET using scryptSync (more secure than SHA-256)
function getEncryptionKey() {
  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) throw new Error('JWT_SECRET not set')
  // scryptSync: N=16384 (2^14), r=8, p=1 — standard parameters for password-based key derivation
  return crypto.scryptSync(jwtSecret, 'paw-salt', 32, { N: 16384, r: 8, p: 1 })
}

// Encrypt plaintext to iv:authTag:ciphertext (hex)
export function encrypt(plaintext) {
  if (!plaintext) return null
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  const authTag = cipher.getAuthTag()

  // Return format: iv:authTag:ciphertext
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

// Decrypt iv:authTag:ciphertext (hex) to plaintext
export function decrypt(ciphertext) {
  if (!ciphertext) return null

  // Handle legacy plaintext (no colons) — throw error to force migration
  if (!ciphertext.includes(':')) {
    throw new Error('Legacy plaintext token detected - database migration required. Contact admin.')
  }

  const key = getEncryptionKey()
  const parts = ciphertext.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format - expected iv:authTag:ciphertext')
  }

  try {
    const iv = Buffer.from(parts[0], 'hex')
    const authTag = Buffer.from(parts[1], 'hex')
    const encrypted = parts[2]

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  } catch (err) {
    throw new Error('Decryption failed - invalid token or corrupted data')
  }
}

// Helper: Re-encrypt legacy plaintext tokens (for migration)
export function reencryptLegacy(plaintextToken) {
  if (!plaintextToken || plaintextToken.includes(':')) {
    return plaintextToken // Already encrypted or empty
  }
  return encrypt(plaintextToken)
}
