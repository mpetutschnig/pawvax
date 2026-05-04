// Test Setup — Wird vor allen Tests ausgeführt
import dotenv from 'dotenv'
import { jest } from '@jest/globals'

dotenv.config({ path: '.env.test' })

function assertSafeApiTarget() {
  const rawApiUrl = process.env.API_URL || 'http://localhost:3000/api'
  let parsed

  try {
    parsed = new URL(rawApiUrl)
  } catch {
    throw new Error(`Unsafe test setup: API_URL is invalid (${rawApiUrl})`)
  }

  const allowedHosts = new Set(['localhost', '127.0.0.1', '::1'])
  const isLocalTarget = allowedHosts.has(parsed.hostname)
  const allowRemote = process.env.ALLOW_REMOTE_API_TESTS === '1'
    && process.env.CONFIRM_REMOTE_API_TESTS === 'I_UNDERSTAND_THIS_CAN_MODIFY_REAL_DATA'

  if (!isLocalTarget && !allowRemote) {
    throw new Error(
      `Unsafe test target blocked: API_URL points to ${rawApiUrl}. ` +
      'API tests may create, modify, or delete real data. ' +
      'Only localhost targets are allowed by default. ' +
      'If you intentionally need a remote target, set ALLOW_REMOTE_API_TESTS=1 and ' +
      'CONFIRM_REMOTE_API_TESTS=I_UNDERSTAND_THIS_CAN_MODIFY_REAL_DATA.'
    )
  }
}

function assertSafeDbPath() {
  const rawDbPath = process.env.DB_PATH
  if (!rawDbPath) return

  const normalized = rawDbPath.replace(/\\/g, '/').toLowerCase()
  const looksLikeRealDb = /(^|\/)paw\.db$/.test(normalized) && !normalized.includes('test')
  const knownDangerousPaths = new Set([
    'e:/tmp/paw.db',
    './paw.db',
    'paw.db',
  ])

  if (looksLikeRealDb || knownDangerousPaths.has(normalized)) {
    throw new Error(
      `Unsafe test database blocked: DB_PATH points to ${rawDbPath}. ` +
      'Use an isolated test database path such as ./paw.test.db or a temp file.'
    )
  }
}

assertSafeApiTarget()
assertSafeDbPath()

// Globale Timeout für alle Tests
jest.setTimeout(Number(process.env.TEST_TIMEOUT || 10000))

// Global test utilities
global.testUtils = {
  // Hilfsfunktionen für Tests
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  randomEmail: () => `test${Math.random().toString(36).slice(2, 8)}@example.com`,
  randomInt: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
}
