import { randomBytes, createHash } from 'crypto'

const KEY_PREFIX = 'pvx_live_'

/**
 * Generate a new API key with prefix, raw value, hash, and display prefix.
 * @returns {{ raw: string, hash: string, prefix: string }}
 */
export function generateApiKey() {
  const bytes = randomBytes(32)
  const raw = KEY_PREFIX + bytes.toString('hex')
  const hash = hashApiKey(raw)
  const prefix = raw.substring(0, KEY_PREFIX.length + 8)
  return { raw, hash, prefix }
}

/**
 * SHA-256 hash of the raw API key for storage.
 * @param {string} raw
 * @returns {string}
 */
export function hashApiKey(raw) {
  return createHash('sha256').update(raw).digest('hex')
}

/**
 * Validate that a key has the correct format.
 * @param {string} key
 * @returns {boolean}
 */
export function validateKeyFormat(key) {
  if (!key || typeof key !== 'string') return false
  if (!key.startsWith(KEY_PREFIX)) return false
  // prefix (9 chars) + 64 hex chars = 73 total
  if (key.length !== KEY_PREFIX.length + 64) return false
  const hexPart = key.substring(KEY_PREFIX.length)
  return /^[0-9a-f]{64}$/.test(hexPart)
}
