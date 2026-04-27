import crypto from 'crypto'

// Derive AES-256 key from JWT_SECRET
export function getEncryptionKey(jwtSecret) {
  return crypto.createHash('sha256').update(jwtSecret).digest()
}

// Encrypt plaintext to iv:authTag:ciphertext (hex)
export function encrypt(plaintext, encryptionKey) {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  const authTag = cipher.getAuthTag()

  // Return format: iv:authTag:ciphertext
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

// Decrypt iv:authTag:ciphertext (hex) to plaintext
export function decrypt(ciphertext, encryptionKey) {
  // Handle legacy plaintext (no colons)
  if (!ciphertext.includes(':')) {
    return ciphertext
  }

  const parts = ciphertext.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format')
  }

  const iv = Buffer.from(parts[0], 'hex')
  const authTag = Buffer.from(parts[1], 'hex')
  const encrypted = parts[2]

  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}
