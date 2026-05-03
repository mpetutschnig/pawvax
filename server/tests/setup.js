// Test Setup — Wird vor allen Tests ausgeführt
import dotenv from 'dotenv'

dotenv.config({ path: '.env.test' })

// Globale Timeout für alle Tests
jest.setTimeout(10000)

// Global test utilities
global.testUtils = {
  // Hilfsfunktionen für Tests
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  randomEmail: () => `test${Math.random().toString(36).slice(2, 8)}@example.com`,
  randomInt: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
}
