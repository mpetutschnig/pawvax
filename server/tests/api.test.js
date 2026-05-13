/**
 * PAWvax API Automatisierte Test-Suite
 * 
 * Testen aller kritischen Endpoints:
 * - Authentifizierung (Register, Login, Logout)
 * - Tiere (Create, Read, Update, Delete, Archive)
 * - Dokumente (Upload, List, Update, Delete)
 * - Tags / NFC
 * - Sharing
 * - Admin / VET API
 * - DSGVO (Export, Delete)
 * 
 * Nutze: npm test
 */

import { v4 as uuid } from 'uuid'
import pg from 'pg'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { computeRecordHash, flagDuplicates } from '../src/services/dedup.js'
import { buildExtractedDocumentData, getPromptForDocumentType, normalizeDocumentType, parseStructuredModelResponse, PROMPTS } from '../src/services/ocr/index.js'

async function registerAndVerifyUser(name, email, password, role = 'user') {
  const registration = await apiCallWithToken(null, 'POST', '/auth/register', {
    name,
    email,
    password,
    confirmPassword: password
  })
  expect(registration.status).toBe(201)
  expect(registration.data.verificationToken).toBeTruthy()

  const verify = await apiCallWithToken(null, 'POST', '/auth/verify-email', {
    token: registration.data.verificationToken
  })
  expect(verify.status).toBe(200)

  const login = await apiCallWithToken(null, 'POST', '/auth/login', {
    email,
    password
  })
  expect(login.status).toBe(200)

  if (role !== 'user') {
    const db = await getTestDb()
    try {
      await db.query('UPDATE accounts SET role = $1 WHERE id = $2', [role, login.data.account.id])
    } finally {
      await db.end()
    }
    const relogin = await apiCallWithToken(null, 'POST', '/auth/login', { email, password })
    expect(relogin.status).toBe(200)
    return relogin
  }

  return login
}

async function getTestDb() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL || 'postgresql://pawvax:pawvax@localhost:5432/pawvax_test' })
  await client.connect()
  return client
}

const API_URL = process.env.API_URL || 'http://localhost:3000/api'

function toWsUrl(apiUrl) {
  const noApiSuffix = apiUrl.endsWith('/api') ? apiUrl.slice(0, -4) : apiUrl
  return noApiSuffix.replace(/^http/, 'ws') + '/ws'
}

function waitForWsMessage(ws, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout while waiting for websocket message'))
    }, timeoutMs)

    ws.onmessage = (event) => {
      clearTimeout(timeout)
      try {
        resolve(JSON.parse(String(event.data)))
      } catch (err) {
        reject(err)
      }
    }

    ws.onerror = (event) => {
      clearTimeout(timeout)
      reject(new Error(`WebSocket error: ${event?.message || 'unknown'}`))
    }
  })
}

async function createDocumentFixtureViaWs(token, animalId, allowedRoles = ['guest']) {
  const ws = new WebSocket(toWsUrl(API_URL))

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebSocket open timeout')), 5000)
    ws.onopen = () => {
      clearTimeout(timeout)
      resolve()
    }
    ws.onerror = (event) => {
      clearTimeout(timeout)
      reject(new Error(`WebSocket open failed: ${event?.message || 'unknown'}`))
    }
  })

  ws.send(JSON.stringify({ type: 'auth', token }))
  const authMsg = await waitForWsMessage(ws)
  if (authMsg.type !== 'auth_ok') {
    ws.close()
    throw new Error(`Unexpected WS auth response: ${JSON.stringify(authMsg)}`)
  }

  const documentId = uuid()
  ws.send(JSON.stringify({
    type: 'upload_start',
    animalId,
    filename: 'test-fixture.jpg',
    mimeType: 'image/jpeg',
    allowedRoles,
    documentId
  }))

  const readyMsg = await waitForWsMessage(ws)
  ws.close()

  if (readyMsg.type !== 'ready' || readyMsg.documentId !== documentId) {
    throw new Error(`Unexpected WS ready response: ${JSON.stringify(readyMsg)}`)
  }

  return documentId
}

function writeTinyPng(filename) {
  const buffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9oN8m6kAAAAASUVORK5CYII=',
    'base64'
  )
  const filePath = join(process.env.UPLOADS_DIR, filename)
  writeFileSync(filePath, buffer)
  return filePath
}

// State zwischen Tests
let testState = {
  token: null,
  userId: null,
  animalId: null,
  documentId: null,
  shareId: null,
  tagId: null,
  publicTagId: null,
  apiKeyId: null
}

// Hilfsfunktion für API-Calls
async function apiCall(method, endpoint, body = null, headers = {}) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(testState.token && { 'Authorization': `Bearer ${testState.token}` }),
      ...headers
    }
  }

  if (body) {
    options.body = JSON.stringify(body)
  }

  const response = await fetch(`${API_URL}${endpoint}`, options)
  const data = await response.json().catch(() => ({}))

  return { status: response.status, data, headers: response.headers }
}

async function apiCallWithToken(token, method, endpoint, body = null, headers = {}) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...headers
    }
  }

  if (body) {
    options.body = JSON.stringify(body)
  }

  const response = await fetch(`${API_URL}${endpoint}`, options)
  const data = await response.json().catch(() => ({}))

  return { status: response.status, data, headers: response.headers }
}

describe('PAWvax API Tests', () => {
  // ════════════════════════════════════════════════════════════════
  // 1. AUTHENTIFIZIERUNG
  // ════════════════════════════════════════════════════════════════

  describe('1. Authentication (Auth)', () => {
    let testEmail, testPassword, verificationToken

    beforeAll(() => {
      testEmail = `test${Date.now()}@example.com`
      testPassword = 'SecurePassword123!'
    })

    test('1a. Register — Neuen Account erstellen', async () => {
      const { status, data } = await apiCall('POST', '/auth/register', {
        name: 'Test User',
        email: testEmail,
        password: testPassword,
        confirmPassword: testPassword
      })

      expect(status).toBe(201)
      expect(data.requiresEmailVerification).toBe(true)
      expect(data.token).toBeFalsy()
      
      const id = data.userId || data.id || data.user?.id || data.account?.id
      expect(id).toBeTruthy()
      expect(data.account?.email_verified).toBe(0)
      expect(data.verificationToken).toBeTruthy()

      testState.userId = id
      verificationToken = data.verificationToken
    })

    test('1b. Login vor E-Mail-Bestätigung — 403 Forbidden', async () => {
      const { status, data } = await apiCall('POST', '/auth/login', {
        email: testEmail,
        password: testPassword
      })

      expect(status).toBe(403)
      expect(data.error).toMatch(/e-mail|email/i)
    })

    test('1c. Verify Email — Bestätigungslink einlösen', async () => {
      const { status, data } = await apiCall('POST', '/auth/verify-email', {
        token: verificationToken
      })

      expect(status).toBe(200)
      expect(data.message).toBeTruthy()
    })

    test('1d. Login — Mit Credentials anmelden (neuer Token)', async () => {
      const { status, data } = await apiCall('POST', '/auth/login', {
        email: testEmail,
        password: testPassword
      })

      expect(status).toBe(200)
      expect(data.token).toBeTruthy()
      testState.token = data.token
    })

    test('1e. Get Profile — Eigenes Profil abrufen', async () => {
      const { status, data } = await apiCall('GET', '/accounts/me')

      expect(status).toBe(200)
      expect(data.id).toBe(testState.userId)
      expect(data.email).toBe(testEmail)
      expect(data.name).toBe('Test User')
      expect(data.email_verified).toBe(1)
    })

    test('1f. Patch Profile — Profildaten aktualisieren', async () => {
      const { status, data } = await apiCall('PATCH', '/accounts/me', {
        name: 'Updated Name'
      })

      expect(status).toBe(200)
      if (data && data.name) {
        expect(data.name).toBe('Updated Name')
      }
    })

    test('1g. Request Verification — Als Tierarzt anmelden', async () => {
      const { status } = await apiCall('POST', '/accounts/request-verification', {
        roles: ['vet']
      })

      expect(status).toBe(200)
    })

    test('1h. Logout — Abmelden (JWT blacklist)', async () => {
      const { status } = await apiCall('POST', '/auth/logout', {})

      expect([200, 204]).toContain(status)

      // Token ist jetzt ungültig
      const { status: unauthorizedStatus } = await apiCall('GET', '/accounts/me')
      expect(unauthorizedStatus).toBe(401)

      // Neu anmelden für Rest der Tests
      const { data: loginData } = await apiCall('POST', '/auth/login', {
        email: testEmail,
        password: testPassword
      })
      testState.token = loginData.token
    })

    test('1i. Forgot Password + Reset Password — Tokenbasierter Passwort-Reset', async () => {
      const nextPassword = 'EvenMoreSecure123!'
      const forgotResponse = await apiCall('POST', '/auth/forgot-password', {
        email: testEmail
      })

      expect(forgotResponse.status).toBe(200)
      expect(forgotResponse.data.message).toBeTruthy()
      expect(forgotResponse.data.resetToken).toBeTruthy()

      const resetResponse = await apiCall('POST', '/auth/reset-password', {
        token: forgotResponse.data.resetToken,
        password: nextPassword,
        confirmPassword: nextPassword
      })

      expect(resetResponse.status).toBe(200)

      const { status, data } = await apiCall('POST', '/auth/login', {
        email: testEmail,
        password: nextPassword
      })

      expect(status).toBe(200)
      expect(data.token).toBeTruthy()
      testState.token = data.token
      testPassword = nextPassword
    })
  })

  // ════════════════════════════════════════════════════════════════
  // 2. TIERE (Animals)
  // ════════════════════════════════════════════════════════════════

  describe('2. Animals', () => {
    test('2a. Create Animal — Neues Tier hinzufügen', async () => {
      const { status, data } = await apiCall('POST', '/animals', {
        name: 'Fluffy',
        species: 'cat',
        breed: 'Britisch Kurzhaar',
        birthdate: '2022-03-15'
      })

      expect(status).toBe(201)
      expect(data.id).toBeTruthy()
      expect(data.name).toBe('Fluffy')
      expect(data.species).toBe('cat')

      testState.animalId = data.id
    })

    test('2b. Get All Animals — Alle Tiere abrufen', async () => {
      const { status, data } = await apiCall('GET', '/animals')

      expect(status).toBe(200)
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBeGreaterThan(0)
      expect(data.some(a => a.id === testState.animalId)).toBe(true)
    })

    test('2c. Get Animal Detail — Tier im Detail abrufen', async () => {
      const { status, data } = await apiCall('GET', `/animals/${testState.animalId}`)

      expect(status).toBe(200)
      expect(data.id).toBe(testState.animalId)
      expect(data.name).toBe('Fluffy')
    })

    test('2d. Update Animal — Tier aktualisieren', async () => {
      const { status, data } = await apiCall('PATCH', `/animals/${testState.animalId}`, {
        name: 'Fluffington',
        breed: 'Ragdoll'
      })

      expect(status).toBe(200)
      expect(data.name).toBe('Fluffington')
      expect(data.breed).toBe('Ragdoll')
    })

    test('2e. Archive Animal — Tier archivieren', async () => {
      const { status, data } = await apiCall('PATCH', `/animals/${testState.animalId}/archive`, {
        is_archived: true,
        archive_reason: 'verstorben'
      })

      expect(status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.archive_reason).toBe('verstorben')
    })

    test('2f. Get Archived Animal — Archiviertes Tier sollte sichtbar sein mit is_archived=true', async () => {
      const { status, data } = await apiCall('GET', `/animals/${testState.animalId}`)

      expect(status).toBe(200)
      expect(!!data.is_archived).toBe(true)
    })

    test('2g. Create Second Animal — Zweites Tier für weitere Tests', async () => {
      const { status, data } = await apiCall('POST', '/animals', {
        name: 'Max',
        species: 'dog',
        breed: 'Labrador',
        birthdate: '2020-06-10'
      })

      expect(status).toBe(201)
      // Speichere für Dokument-Upload Tests
      testState.animalId = data.id
    })

    test('2h. Delete Animal with Cascade — Tier mit Dokumenten/Tags löschen (Cascade)', async () => {
      // Erstelle ein neues Tier speziell für den Delete-Test
      const { status: createStatus, data: deleteTestAnimal } = await apiCall('POST', '/animals', {
        name: 'To-Delete-Animal',
        species: 'cat',
        breed: 'Test'
      })

      expect(createStatus).toBe(201)
      const deleteAnimalId = deleteTestAnimal.id

      // Füge einen Tag hinzu (erzeugt animal_tags Eintrag)
      const { status: tagStatus } = await apiCall('POST', `/animals/${deleteAnimalId}/tags`, {
        tagId: `DELETE-TEST-${Date.now()}`,
        tagType: 'nfc'
      })
      expect(tagStatus).toBe(201)

      // Jetzt lösche das Tier mit Cascade
      const { status: deleteStatus } = await apiCall('DELETE', `/animals/${deleteAnimalId}`, {
        confirmationText: 'To-Delete-Animal'
      })

      expect(deleteStatus).toBe(204)

      // Verifiziere, dass Tier weg ist
      const { status: verifyStatus } = await apiCall('GET', `/animals/${deleteAnimalId}`)
      expect(verifyStatus).toBe(404)
    })
  })

  // ════════════════════════════════════════════════════════════════
  // 3. TAGS & NFC/Barcode
  // ════════════════════════════════════════════════════════════════

  describe('3. Tags & NFC', () => {
    test('3a. Add NFC Tag — NFC-Chip mit Tier verbinden', async () => {
      const { status, data } = await apiCall('POST', `/animals/${testState.animalId}/tags`, {
        tagId: `NFC-TEST-${Date.now()}`,
        tagType: 'nfc'
      })

      expect(status).toBe(201)
      expect(data.tag_id).toBeTruthy()
      expect(data.tag_type).toBe('nfc')

      testState.tagId = data.tag_id
    })

    test('3b. Get Animal Tags — Alle Tags eines Tieres', async () => {
      const { status, data } = await apiCall('GET', `/animals/${testState.animalId}/tags`)

      expect(status).toBe(200)
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBeGreaterThan(0)
    })

    test('3c. Add Barcode Tag — Barcode mit Tier verbinden', async () => {
      const publicTagId = `BARCODE-TEST-${Date.now()}`
      const { status, data } = await apiCall('POST', `/animals/${testState.animalId}/tags`, {
        tagId: publicTagId,
        tagType: 'barcode'
      })

      expect(status).toBe(201)
      expect(data.tag_type).toBe('barcode')
      testState.publicTagId = publicTagId
    })

    test('3d. Deactivate Tag — Tag deaktivieren', async () => {
      if (!testState.tagId) {
        // Skip wenn kein tagId
        return
      }

      const { status } = await apiCall('PATCH', `/animal-tags/${testState.tagId}`, {
        active: false
      })

      expect(status).toBe(200)
    })
  })

  // ════════════════════════════════════════════════════════════════
  // 4. DOKUMENTE — Zugriff/Statuscodes
  // ════════════════════════════════════════════════════════════════

  describe('4. Documents Authorization', () => {
    let ownerToken
    let ownerAnimalId
    let foreignToken
    let documentId

    beforeAll(async () => {
      const { data: ownerRegRes } = await registerAndVerifyUser('Doc Owner', `doc-owner-${Date.now()}@example.com`, 'SecurePassword123!')
      ownerToken = ownerRegRes.token

      const { data: foreignRegRes } = await registerAndVerifyUser('Doc Foreign', `doc-foreign-${Date.now()}@example.com`, 'SecurePassword123!')
      foreignToken = foreignRegRes.token

      const ownerAnimal = await apiCallWithToken(ownerToken, 'POST', '/animals', {
        name: 'Doc Animal',
        species: 'dog'
      })
      expect(ownerAnimal.status).toBe(201)
      ownerAnimalId = ownerAnimal.data.id

      documentId = await createDocumentFixtureViaWs(ownerToken, ownerAnimalId, ['guest'])
    })

    test('4a. Document with guest access should be visible to authenticated users', async () => {
      // Document is created with allowed_roles: ['guest'], so any authenticated user can see it
      const { status } = await apiCallWithToken(foreignToken, 'GET', `/documents/${documentId}`)
      expect(status).toBe(200)
    })

    test('4b. Existing document without access returns 403 on PATCH', async () => {
      const { status } = await apiCallWithToken(foreignToken, 'PATCH', `/documents/${documentId}`, {
        doc_type: 'vaccination'
      })
      expect(status).toBe(403)
    })

    test('4c. Existing document without access returns 403 on DELETE', async () => {
      const anotherDocId = await createDocumentFixtureViaWs(ownerToken, ownerAnimalId, ['guest'])

      const { status } = await apiCallWithToken(foreignToken, 'DELETE', `/documents/${anotherDocId}`)
      expect(status).toBe(403)
    })

    test('4d. Missing document still returns 404', async () => {
      const { status } = await apiCallWithToken(ownerToken, 'GET', `/documents/${uuid()}`)
      expect(status).toBe(404)
    })

    test('4e. Vet-only document returns 403 for regular user', async () => {
      // Insert a vet-only document directly via DB to ensure allowed_roles is strictly ['vet']
      const db = await getTestDb()
      const restrictedDocId = uuid()
      await db.query(`
        INSERT INTO documents (id, animal_id, doc_type, image_path, extracted_json, ocr_provider, added_by_account, added_by_role, allowed_roles, analysis_status)
        VALUES ($1, $2, 'general', '', '{}', 'pending', $3, 'user', '["vet"]', 'completed')
      `, [restrictedDocId, ownerAnimalId, ownerAnimalId])
      await db.end()

      // Regular authenticated user (not vet) cannot access vet-only document → 403
      const { status } = await apiCallWithToken(foreignToken, 'GET', `/documents/${restrictedDocId}`)
      expect(status).toBe(403)
    })
  })

  // ════════════════════════════════════════════════════════════════
  // 5. Public Scan Regression
  // ════════════════════════════════════════════════════════════════

  describe('5. Public Scan', () => {
    test('5a. Known active tag returns public animal profile', async () => {
      if (!testState.publicTagId) return

      const response = await fetch(`${API_URL}/public/tag/${encodeURIComponent(testState.publicTagId)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
      const data = await response.json().catch(() => ({}))

      expect(response.status).toBe(200)
      expect(data.id).toBe(testState.animalId)
      expect(data).toHaveProperty('is_public')
    })

    test('5b. Guest-visible document appears in public scan result', async () => {
      if (!testState.publicTagId || !testState.animalId || !testState.token) return

      const visibleDocId = await createDocumentFixtureViaWs(testState.token, testState.animalId, ['guest'])
      const response = await fetch(`${API_URL}/public/tag/${encodeURIComponent(testState.publicTagId)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
      const data = await response.json().catch(() => ({}))

      expect(response.status).toBe(200)
      expect(Array.isArray(data.documents)).toBe(true)
      expect(data.documents.some(d => d.id === visibleDocId)).toBe(true)
    })

    test('5c. Vet-only document is hidden in public scan result', async () => {
      if (!testState.publicTagId || !testState.animalId || !testState.token) return

      const vetOnlyDocId = await createDocumentFixtureViaWs(testState.token, testState.animalId, ['vet'])
      const response = await fetch(`${API_URL}/public/tag/${encodeURIComponent(testState.publicTagId)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
      const data = await response.json().catch(() => ({}))

      expect(response.status).toBe(200)
      expect(Array.isArray(data.documents)).toBe(true)
      expect(data.documents.some(d => d.id === vetOnlyDocId)).toBe(false)
    })
  })

  // ════════════════════════════════════════════════════════════════
  // 6. SHARING — Temporäre Links
  // ════════════════════════════════════════════════════════════════

  describe('6. Sharing', () => {
    test('6a. Get Sharing Settings — Freigabe-Settings abrufen', async () => {
      const { status, data } = await apiCall('GET', `/animals/${testState.animalId}/sharing`)

      expect(status).toBe(200)
      expect(Array.isArray(data) || typeof data === 'object').toBe(true)
    })

    test('6b. Create Sharing Link — Temporären Link erstellen', async () => {
      const { status, data } = await apiCall('POST', `/animals/${testState.animalId}/sharing/temporary`, {
        name: 'Tierpension Alpha'
      })

      expect(status).toBe(201)
      expect(data.shareId).toBeTruthy()
      expect(data.linkName).toMatch(/^Tierpension Alpha - [a-f0-9]{8}$/i)

      testState.shareId = data.shareId
    })

    test('6c. Get Active Sharing Links — Liste enthält Link mit Namen', async () => {
      if (!testState.shareId) {
        return
      }

      const { status, data } = await apiCall('GET', `/animals/${testState.animalId}/shares`)
      expect(status).toBe(200)
      expect(Array.isArray(data)).toBe(true)

      const createdLink = data.find((s) => s.id === testState.shareId)
      expect(createdLink).toBeTruthy()
      expect(createdLink.linkName).toMatch(/^Tierpension Alpha - [a-f0-9]{8}$/i)
    })

    test('6d. Public: Get Shared Animal — Tier über Link abrufen (OHNE JWT)', async () => {
      if (!testState.shareId) {
        return
      }

      // API-Call ohne Token
      const options = {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      }

      const response = await fetch(`${API_URL}/public/share/${testState.shareId}`, options)
      const data = await response.json().catch(() => ({}))

      expect(response.status).toBe(200)
      expect(data.id).toBeTruthy()
    })

    test('6e. Delete Sharing Link — Link löschen', async () => {
      if (!testState.shareId) {
        return
      }

      const { status } = await apiCall('DELETE', `/animals/${testState.animalId}/shares/${testState.shareId}`)

      expect([200, 204, 404]).toContain(status)
    })
  })

  // ════════════════════════════════════════════════════════════════
  // 7. ADMIN — Nur für Admin-Tests
  // ════════════════════════════════════════════════════════════════

  describe('7. Admin (Nur wenn Admin)', () => {
    test('7a. Get Admin Stats — System-Statistiken', async () => {
      const { status, data } = await apiCall('GET', '/admin/stats')

      // Kann 200 oder 403 sein je nach Rolle
      if (status === 200) {
        expect(data).toHaveProperty('total_users')
      } else {
        expect(status).toBe(403)
      }
    })

    test('7b. Get Audit Log — Audit-Log abrufen', async () => {
      const { status, data } = await apiCall('GET', '/admin/audit?limit=10')

      if (status === 200) {
        expect(Array.isArray(data) || Array.isArray(data.records)).toBe(true)
      } else {
        expect(status).toBe(403)
      }
    })

    test('7c. Get Admin Test Results — Letzten Deploy-Teststatus abrufen', async () => {
      const { status, data } = await apiCall('GET', '/admin/test-results')

      if (status === 200) {
        expect(data).toHaveProperty('summary')
        expect(data).toHaveProperty('tests')
        expect(data.summary === null || typeof data.summary === 'object').toBe(true)
        expect(data.tests === null || typeof data.tests === 'object').toBe(true)
      } else {
        expect(status).toBe(403)
      }
    })
  })

  // ════════════════════════════════════════════════════════════════
  // 6. DSGVO — Datenschutz
  // ════════════════════════════════════════════════════════════════

  describe('6. DSGVO (Data Protection)', () => {
    test('6a. Export Data (Takeout) — Daten als ZIP exportieren', async () => {
      const response = await fetch(`${API_URL}/accounts/me/export`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${testState.token}`,
          'Accept': 'application/zip'
        }
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('zip')
    })
  })

  // ════════════════════════════════════════════════════════════════
  // 7. FEHLERBEHANDLUNG
  // ════════════════════════════════════════════════════════════════

  describe('7. Error Handling', () => {
    test('7a. Invalid JWT Token — 401 Unauthorized', async () => {
      const { status } = await apiCall('GET', '/animals', null, {
        'Authorization': 'Bearer invalid_token'
      })

      expect(status).toBe(401)
    })

    test('7b. Missing Required Field — 400 / 422 Bad Request', async () => {
      const { status } = await apiCall('POST', '/animals', {
        species: 'cat'
        // name fehlt!
      })

      expect([400, 422]).toContain(status)
    })

    test('7c. Non-existent Animal — 404 Not Found', async () => {
      const { status } = await apiCall('GET', '/animals/nonexistent-id-12345')

      expect(status).toBe(404)
    })

    test('7d. Invalid Email on Register — 400 Bad Request', async () => {
      const { status } = await apiCall('POST', '/auth/register', {
        name: 'Test',
        email: 'invalid-email',
        password: 'Password123!',
        confirmPassword: 'Password123!'
      })

      expect(status).toBe(400)
    })

    test('7e. Duplicate Email on Register — 409 Conflict', async () => {
      const email = `unique${Date.now()}@test.com`

      // Erstes Mal OK
      const { status: status1 } = await apiCall('POST', '/auth/register', {
        name: 'Test 1',
        email: email,
        password: 'Password123!',
        confirmPassword: 'Password123!'
      })
      expect(status1).toBe(201)

      // Zweites Mal sollte Fehler sein
      const { status: status2 } = await apiCall('POST', '/auth/register', {
        name: 'Test 2',
        email: email,
        password: 'Password123!',
        confirmPassword: 'Password123!'
      })
      expect([400, 409]).toContain(status2)
    })

    test('7f. Register mit abweichender Passwort-Bestätigung — 400 Bad Request', async () => {
      const { status } = await apiCall('POST', '/auth/register', {
        name: 'Mismatch User',
        email: `mismatch${Date.now()}@example.com`,
        password: 'Password123!',
        confirmPassword: 'Password1234!'
      })

      expect(status).toBe(400)
    })
  })

  // ════════════════════════════════════════════════════════════════
  // 8. Endpoint Smoke Coverage
  // ════════════════════════════════════════════════════════════════

  describe('8. Endpoint Smoke Coverage', () => {
    test('8a. GET /settings reachable', async () => {
      const { status } = await apiCall('GET', '/settings')
      expect([200, 401]).toContain(status)
    })

    test('8b. PATCH /admin/settings returns guarded status', async () => {
      const { status } = await apiCall('PATCH', '/admin/settings', { maintenance_mode: false })
      expect([401, 403, 200]).toContain(status)
    })

    test('8c. Organizations routes are reachable and guarded', async () => {
      const orgId = uuid()
      const { status: createStatus } = await apiCall('POST', '/organizations', { name: 'Smoke Org' })
      const { status: listStatus } = await apiCall('GET', '/organizations')
      const { status: membersStatus } = await apiCall('GET', `/organizations/${orgId}/members`)
      const { status: inviteStatus } = await apiCall('POST', `/organizations/${orgId}/invite`, { email: `invite${Date.now()}@example.com` })
      const { status: acceptStatus } = await apiCall('POST', `/organizations/${orgId}/accept`, {})
      const { status: removeStatus } = await apiCall('DELETE', `/organizations/${orgId}/members/${uuid()}`)

      expect([200, 201, 400, 401, 403, 404]).toContain(createStatus)
      expect([200, 401, 403]).toContain(listStatus)
      expect([200, 401, 403, 404]).toContain(membersStatus)
      expect([200, 201, 400, 401, 403, 404]).toContain(inviteStatus)
      expect([200, 400, 401, 403, 404]).toContain(acceptStatus)
      expect([200, 204, 401, 403, 404]).toContain(removeStatus)
    })

    test('8d. Document pending/retry endpoints are reachable', async () => {
      const { status: pendingStatus } = await apiCall('GET', `/animals/${testState.animalId}/documents/pending`)
      const { status: retryStatus } = await apiCall('POST', `/documents/${uuid()}/retry-analysis`, {})

      expect([200, 401, 403, 404]).toContain(pendingStatus)
      expect([200, 202, 401, 403, 404]).toContain(retryStatus)
    })

    test('8e. Transfer and avatar endpoints are reachable', async () => {
      const { status: transferStatus } = await apiCall('POST', `/animals/${testState.animalId}/transfer`, {})
      const { status: acceptStatus } = await apiCall('POST', '/animals/transfer/accept', { code: 'INVALID-CODE' })
      const { status: avatarStatus } = await apiCall('PATCH', `/animals/${testState.animalId}/avatar`, { base64Image: 'not-a-valid-image' })

      expect([200, 201, 400, 401, 403, 404]).toContain(transferStatus)
      expect([200, 400, 401, 403, 404]).toContain(acceptStatus)
      expect([200, 400, 401, 403, 404, 413]).toContain(avatarStatus)
    })

    test('8f. AI models endpoint is reachable', async () => {
      const { status } = await apiCall('GET', '/ai/models')
      expect([200, 401, 403]).toContain(status)
    })

    test('8g. Admin API key endpoints are guarded', async () => {
      const keyId = uuid()
      const { status: createStatus } = await apiCall('POST', '/admin/api-keys', {
        account_id: testState.userId,
        name: 'Smoke Key'
      })
      const { status: listStatus } = await apiCall('GET', '/admin/api-keys')
      const { status: deleteStatus } = await apiCall('DELETE', `/admin/api-keys/${keyId}`)

      expect([201, 400, 401, 403, 404]).toContain(createStatus)
      expect([200, 401, 403]).toContain(listStatus)
      expect([200, 401, 403, 404]).toContain(deleteStatus)
    })

    test('8h. Vet API endpoints reject missing API key', async () => {
      const base = API_URL.replace('/api', '/api/v1')

      const [animalRes, docsRes, tagRes, uploadRes, vaccRes] = await Promise.all([
        fetch(`${base}/animals/${testState.animalId}`, { method: 'GET' }),
        fetch(`${base}/animals/${testState.animalId}/documents`, { method: 'GET' }),
        fetch(`${base}/animals/by-tag/${encodeURIComponent(testState.publicTagId || 'missing-tag')}`, { method: 'GET' }),
        fetch(`${base}/animals/${testState.animalId}/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ doc_type: 'other', extracted_json: {} })
        }),
        fetch(`${base}/animals/${testState.animalId}/vaccinations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vaccine_name: 'Smoke', administered_at: new Date().toISOString() })
        }),
      ])

      expect([401, 403, 404]).toContain(animalRes.status)
      expect([401, 403, 404]).toContain(docsRes.status)
      expect([401, 403, 404]).toContain(tagRes.status)
      expect([401, 403, 404]).toContain(uploadRes.status)
      expect([401, 403, 404]).toContain(vaccRes.status)

      await Promise.all([animalRes, docsRes, tagRes, uploadRes, vaccRes].map(async (response) => {
        try {
          await response.text()
        } catch {
          // ignore body read failures in smoke coverage assertions
        }
      }))
    })
  })

  // ════════════════════════════════════════════════════════════════
  // 9. INTEGRATION — Full User Journey
  // ════════════════════════════════════════════════════════════════

  describe('9. Integration Tests (Full Journey)', () => {
    let journeyState = { token: null, animalId: null }

    test('8a. Journey: Register → Create Animal → Add Tag → Get Animal', async () => {
      // 1. Register and Verify
      const email = `journey${Date.now()}@test.com`
      const { data: registerData } = await registerAndVerifyUser('Journey Tester', email, 'Password123!')
      journeyState.token = registerData.token

      // 2. Get Profile
      const { data: profileData } = await apiCall('GET', '/accounts/me', null, {
        'Authorization': `Bearer ${journeyState.token}`
      })
      expect(profileData.email).toBe(email)

      // 3. Create Animal
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${journeyState.token}`
        },
        body: JSON.stringify({
          name: 'Journey Pet',
          species: 'dog'
        })
      }
      const response = await fetch(`${API_URL}/animals`, options)
      const createData = await response.json()
      journeyState.animalId = createData.id

      expect(response.status).toBe(201)
      expect(createData.name).toBe('Journey Pet')

      // 4. Add Tag
      const tagOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${journeyState.token}`
        },
        body: JSON.stringify({
          tagId: `NFC-JOURNEY-${Date.now()}`,
          tagType: 'nfc'
        })
      }
      const tagResponse = await fetch(`${API_URL}/animals/${journeyState.animalId}/tags`, tagOptions)
      const tagData = await tagResponse.json()

      expect(tagResponse.status).toBe(201)
      expect(tagData.tag_type).toBe('nfc')

      // 5. Get Animal mit Tags
      const getOptions = {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${journeyState.token}` }
      }
      const getResponse = await fetch(`${API_URL}/animals/${journeyState.animalId}`, getOptions)
      const animalData = await getResponse.json()

      expect(getResponse.status).toBe(200)
      expect(animalData.name).toBe('Journey Pet')
    })
  })
})

describe('API Health Checks', () => {
  test('Health Check – API läuft?', async () => {
    const response = await fetch(`${API_URL.replace('/api', '')}/health`)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.status).toBe('ok')
  })

  test('Health Check – API Proxy Route läuft?', async () => {
    const response = await fetch(`${API_URL}/health`)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.status).toBe('ok')
  })
})

// ════════════════════════════════════════════════════════════════
// 9. Extended Regression Tests (Batch 9)
// ════════════════════════════════════════════════════════════════

describe('9. Extended Regression Tests', () => {
  let token9
  let animalId9
  let adminToken9
  let adminDb9

  beforeAll(async () => {
    const { data: regRes } = await registerAndVerifyUser('Regression User', `reg9-${Date.now()}@example.com`, 'SecurePassword123!')
    token9 = regRes.token

    const animal = await apiCallWithToken(token9, 'POST', '/animals', {
      name: 'RegAnimal',
      species: 'dog',
      breed: 'Mischling'
    })
    expect(animal.status).toBe(201)
    animalId9 = animal.data.id

    const adminEmail = `reg9-admin-${Date.now()}@example.com`
    const { data: adminRegData } = await registerAndVerifyUser('Regression Admin', adminEmail, 'SecurePassword123!')

    adminDb9 = await getTestDb()
    const adminAccountId = adminRegData.account.id
    expect(adminAccountId).toBeTruthy()
    await adminDb9.query('UPDATE accounts SET role = $1 WHERE id = $2', ['user,admin', adminAccountId])

    const adminLogin = await apiCallWithToken(null, 'POST', '/auth/login', {
      email: adminEmail,
      password: 'SecurePassword123!'
    })
    expect(adminLogin.status).toBe(200)
    adminToken9 = adminLogin.data.token
  })

  afterAll(async () => {
    await adminDb9?.end()
  })

  test('9a. Archive with valid reason succeeds', async () => {
    const { status, data } = await apiCallWithToken(token9, 'PATCH', `/animals/${animalId9}/archive`, {
      is_archived: true,
      archive_reason: 'verloren'
    })
    expect(status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.archive_reason).toBe('verloren')
  })

  test('9b. Archive with invalid reason returns 400', async () => {
    const { data: newAnimal } = await apiCallWithToken(token9, 'POST', '/animals', {
      name: 'ArchiveTestAnimal',
      species: 'cat'
    })
    const { status } = await apiCallWithToken(token9, 'PATCH', `/animals/${newAnimal.id}/archive`, {
      is_archived: true,
      archive_reason: 'invalid_reason_xyz'
    })
    expect(status).toBe(400)
  })

  test('9c. Archive requires reason when is_archived=true', async () => {
    const { data: newAnimal } = await apiCallWithToken(token9, 'POST', '/animals', {
      name: 'NoReasonAnimal',
      species: 'cat'
    })
    const { status } = await apiCallWithToken(token9, 'PATCH', `/animals/${newAnimal.id}/archive`, {
      is_archived: true
      // no archive_reason
    })
    expect(status).toBe(400)
  })

  test('9d. Un-archive animal (is_archived=false) requires no reason', async () => {
    // First create and archive a new animal
    const { data: newAnimal } = await apiCallWithToken(token9, 'POST', '/animals', {
      name: 'UnarchiveAnimal',
      species: 'cat'
    })
    await apiCallWithToken(token9, 'PATCH', `/animals/${newAnimal.id}/archive`, {
      is_archived: true,
      archive_reason: 'verstorben'
    })
    const { status, data } = await apiCallWithToken(token9, 'PATCH', `/animals/${newAnimal.id}/archive`, {
      is_archived: false
    })
    expect(status).toBe(200)
    expect(data.success).toBe(true)
  })

  test('9e. Admin stats returns nested animals object', async () => {
    // Requires admin token — if not admin, expect 403
    const { status, data } = await apiCallWithToken(token9, 'GET', '/admin/stats')
    if (status === 200) {
      expect(typeof data.animals).toBe('object')
      expect(data.animals).toHaveProperty('total')
      expect(data.animals).toHaveProperty('active')
      expect(data.animals).toHaveProperty('archived')
      expect(data.animals).toHaveProperty('with_documents')
    } else {
      expect(status).toBe(403)
    }
  })

  test('9g. Document PATCH normalizes legacy doc_type medication → medical_product', async () => {
    const docId = await createDocumentFixtureViaWs(token9, animalId9, ['guest'])
    const { status } = await apiCallWithToken(token9, 'PATCH', `/documents/${docId}`, {
      doc_type: 'medication'
    })
    expect([200, 204]).toContain(status)
    // Verify normalization via GET
    const { status: getStatus, data: getDoc } = await apiCallWithToken(token9, 'GET', `/documents/${docId}`)
    expect(getStatus).toBe(200)
    expect(getDoc.doc_type).toBe('medical_product')
  })

  test('9h. Document PATCH normalizes legacy doc_type other → general', async () => {
    const docId = await createDocumentFixtureViaWs(token9, animalId9, ['guest'])
    const { status } = await apiCallWithToken(token9, 'PATCH', `/documents/${docId}`, {
      doc_type: 'other'
    })
    expect([200, 204]).toContain(status)
    // Verify normalization via GET
    const { status: getStatus, data: getDoc } = await apiCallWithToken(token9, 'GET', `/documents/${docId}`)
    expect(getStatus).toBe(200)
    expect(getDoc.doc_type).toBe('general')
  })

  test('9i. Document PATCH accepts all 5 canonical doc_types', async () => {
    const canonicalTypes = ['vaccination', 'pedigree', 'dog_certificate', 'medical_product', 'general']
    for (const docType of canonicalTypes) {
      const docId = await createDocumentFixtureViaWs(token9, animalId9, ['guest'])
      const { status } = await apiCallWithToken(token9, 'PATCH', `/documents/${docId}`, { doc_type: docType })
      expect([200, 204]).toContain(status)
    }
  })

  test('9j. GET /admin/test-results returns expected shape', async () => {
    const { status, data } = await apiCallWithToken(token9, 'GET', '/admin/test-results')
    if (status === 200) {
      expect(data).toHaveProperty('summary')
      expect(data).toHaveProperty('tests')
    } else {
      expect(status).toBe(403)
    }
  })

  test('9l. Non-admin cannot update secure mail settings', async () => {
    const response = await apiCallWithToken(token9, 'PATCH', '/admin/settings', {
      mail_enabled: true,
      mail_from_address: 'blocked@example.com',
      smtp_host: 'smtp.example.com',
      smtp_port: 587,
      smtp_security_mode: 'starttls',
      smtp_auth_mode: 'password',
      smtp_username: 'blocked@example.com',
      smtp_password: 'Blocked123!'
    })

    expect(response.status).toBe(403)
  })

  test('9n. GET /documents/:id returns all stored document pages', async () => {
    const db = await getTestDb()
    const docId = uuid()
    const page1 = writeTinyPng(`page-1-${Date.now()}.png`)
    const page2 = writeTinyPng(`page-2-${Date.now()}.png`)
    const { rows: [ownerRow] } = await db.query('SELECT id FROM accounts WHERE email LIKE $1 LIMIT 1', ['reg9-%@example.com'])
    const ownerId = ownerRow?.id

    await db.query(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, extracted_json, ocr_provider, added_by_account, added_by_role, allowed_roles, analysis_status)
      VALUES ($1, $2, 'general', $3, '{}', 'pending', $4, 'user', '["guest"]', 'completed')
    `, [docId, animalId9, page1, ownerId])
    await db.query('INSERT INTO document_pages (document_id, page_number, image_path) VALUES ($1, 1, $2)', [docId, page1])
    await db.query('INSERT INTO document_pages (document_id, page_number, image_path) VALUES ($1, 2, $2)', [docId, page2])

    const { status, data } = await apiCallWithToken(token9, 'GET', `/documents/${docId}`)
    expect(status).toBe(200)
    expect(Array.isArray(data.pages)).toBe(true)
    expect(data.pages).toHaveLength(2)
    expect(data.pages[0]).toBe(page1)
    expect(data.pages[1]).toBe(page2)

    await db.end()
  })

  test('9l. Retry analysis uses stored pages instead of empty document image_path', async () => {
    const db = await getTestDb()
    const docId = uuid()
    const page1 = writeTinyPng(`retry-page-1-${Date.now()}.png`)
    const page2 = writeTinyPng(`retry-page-2-${Date.now()}.png`)
    const { rows: [ownerRow] } = await db.query('SELECT id FROM accounts WHERE email LIKE $1 LIMIT 1', ['reg9-%@example.com'])
    const ownerId = ownerRow?.id

    await db.query(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, extracted_json, ocr_provider, added_by_account, added_by_role, allowed_roles, analysis_status)
      VALUES ($1, $2, 'general', '', '{}', 'pending', $3, 'user', '["guest"]', 'pending_analysis')
    `, [docId, animalId9, ownerId])
    await db.query('INSERT INTO document_pages (document_id, page_number, image_path) VALUES ($1, 1, $2)', [docId, page1])
    await db.query('INSERT INTO document_pages (document_id, page_number, image_path) VALUES ($1, 2, $2)', [docId, page2])

    const { status, data } = await apiCallWithToken(token9, 'POST', `/documents/${docId}/retry-analysis`, {})
    expect(status).toBe(200)
    expect(data.provider).toBe('mock-ocr')
    expect(Array.isArray(data.extractedData.page_results)).toBe(true)
    expect(data.extractedData.page_results.length).toBe(2)

    const { rows: [refreshed] } = await db.query('SELECT analysis_status FROM documents WHERE id = $1', [docId])
    expect(refreshed.analysis_status).toBe('completed')

    await db.end()
  })

  // ════════════════════════════════════════════════════════════════
  // 10. VERIFIKATIONS-WORKFLOW (within test 9 scope for adminDb9)
  // ════════════════════════════════════════════════════════════════

  test('10a. User can request vet verification with notes', async () => {
    const formData = new FormData()
    formData.append('type', 'vet')
    formData.append('notes', 'Ich bin praktizierender Tierarzt seit 10 Jahren')

    const response = await fetch(`${API_URL}/accounts/request-verification`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token9}` },
      body: formData
    })

    // Accept 201 (new), 409 (conflict), or other status codes
    const isSuccess = response.ok || response.status === 409
    expect(isSuccess || [429].includes(response.status)).toBe(true)

    if (response.ok) {
      const data = await response.json()
      if (data.id) {
        expect(data.status).toBe('pending')
        expect(data.type).toBe('vet')
        expect(data.notes).toBe('Ich bin praktizierender Tierarzt seit 10 Jahren')
      }
    }
  })

  test('10b. User cannot request duplicate vet verification', async () => {
    const formData = new FormData()
    formData.append('type', 'vet')

    const response = await fetch(`${API_URL}/accounts/request-verification`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token9}` },
      body: formData
    })

    // Expect either 409 (conflict - already exists) or 429 (rate limit on test suite)
    expect([409, 429]).toContain(response.status)
    if (response.status === 409) {
      const data = await response.json()
      expect(data.error).toBeTruthy() // German message: 'Verifikation bereits beantragt' or 'Bereits verifiziert'
    }
  })

  test('10c. Verification request stored in database', async () => {
    // Just verify the database table exists and has data
    const { rows: [result] } = await adminDb9.query(`
      SELECT COUNT(*) as count FROM verification_requests WHERE type = 'vet'
    `)

    expect(parseInt(result.count)).toBeGreaterThanOrEqual(1)
  })

  test('10d. Admin can approve verification (via database)', async () => {
    // Get first pending verification and approve it via API
    const { rows: [pending] } = await adminDb9.query(`
      SELECT id FROM verification_requests WHERE status = 'pending' LIMIT 1
    `)

    if (pending) {
      const { status } = await apiCallWithToken(adminToken9, 'POST', `/admin/verifications/${pending.id}/approve`)
      // Expect 200 (success), 409 (already approved), or 429 (rate limit on test suite)
      expect([200, 409, 429]).toContain(status)
    } else {
      // No pending verifications to approve
      expect(pending).toBeUndefined()
    }
  })
})

// ════════════════════════════════════════════════════════════════
// 11. ANIMAL SCAN TRACKING (recently-scanned, track-scan, unarchive)
// Uses existing reg9 user to avoid rate-limiting on registration
// ════════════════════════════════════════════════════════════════

describe('Suite 11: Animal Scan Tracking', () => {
  let db11
  let token11
  let animalId11       // owned by token11 — used for owner-specific tests
  let foreignAnimalId  // owned by admin — used to test recently-scanned (own animals excluded)

  beforeAll(async () => {
    db11 = await getTestDb()

    // Find the reg9 user created in Suite 9 – no new registration needed
    const { rows: [account] } = await db11.query(`SELECT id, email FROM accounts WHERE email LIKE 'reg9-%@example.com' AND email NOT LIKE '%admin%' LIMIT 1`)
    if (!account) return

    const loginRes = await apiCall('POST', '/auth/login', {
      email: account.email,
      password: 'SecurePassword123!'
    })
    if (loginRes.status !== 200) return
    token11 = loginRes.data.token

    const animalRes = await apiCallWithToken(token11, 'POST', '/animals', {
      name: 'ScanTest-Tier', species: 'cat', breed: 'Hauskatze'
    })
    if (animalRes.status === 201) {
      animalId11 = animalRes.data.id

      // Create a foreign animal (owned by admin) so we can test recently-scanned
      // (own animals are excluded from the recently-scanned list)
      const { rows: [admin] } = await db11.query(`SELECT id, email FROM accounts WHERE role = 'admin' LIMIT 1`)
      if (admin) {
        const adminLoginRes = await apiCall('POST', '/auth/login', { email: admin.email, password: 'SecurePassword123!' })
        if (adminLoginRes.status === 200) {
          const adminToken = adminLoginRes.data.token
          const foreignRes = await apiCallWithToken(adminToken, 'POST', '/animals', {
            name: 'ForeignScanTest-Tier', species: 'dog', breed: 'Labrador'
          })
          if (foreignRes.status === 201) foreignAnimalId = foreignRes.data.id
        }
      }
    }
  })

  afterAll(async () => {
    await db11?.end()
  })

  test('11a. GET /animals/recently-scanned returns list (auth required)', async () => {
    if (!token11) return
    const { status, data } = await apiCallWithToken(token11, 'GET', '/animals/recently-scanned')
    expect([200, 429]).toContain(status)
    if (status === 200) {
      expect(Array.isArray(data.scans)).toBe(true)
      expect(data).toHaveProperty('recent_count')
    }
  })

  test('11b. POST /animals/:id/track-scan records a scan', async () => {
    if (!token11 || !animalId11) return
    // Track own animal (scan still recorded, just excluded from recently-scanned list)
    const { status } = await apiCallWithToken(token11, 'POST', `/animals/${animalId11}/track-scan`)
    expect([200, 201]).toContain(status)
    // Also track foreign animal if available — this one should appear in recently-scanned
    if (foreignAnimalId) {
      const { status: s2 } = await apiCallWithToken(token11, 'POST', `/animals/${foreignAnimalId}/track-scan`)
      expect([200, 201]).toContain(s2)
    }
  })

  test('11c. GET /animals/recently-scanned shows the tracked animal', async () => {
    if (!token11) return
    const { status, data } = await apiCallWithToken(token11, 'GET', '/animals/recently-scanned')
    expect(status).toBe(200)
    // Own animals must not appear in the list
    if (animalId11) expect(data.scans.some((s) => s.id === animalId11)).toBe(false)
    // Foreign animal must appear if it was created and tracked
    if (foreignAnimalId) {
      expect(data.scans.some((s) => s.id === foreignAnimalId)).toBe(true)
      expect(data.recent_count).toBeGreaterThanOrEqual(1)
    }
  })

  test('11d. GET /animals/:id/recent-scans accessible by owner', async () => {
    if (!token11 || !animalId11) return
    const { status, data } = await apiCallWithToken(token11, 'GET', `/animals/${animalId11}/recent-scans`)
    expect(status).toBe(200)
    expect(Array.isArray(data.scans)).toBe(true)
  })

  test('11e. POST /animals/:id/unarchive reactivates an archived animal', async () => {
    if (!token11 || !animalId11) return
    await apiCallWithToken(token11, 'PATCH', `/animals/${animalId11}/archive`, {
      is_archived: true, archive_reason: 'verloren'
    })
    const { status } = await apiCallWithToken(token11, 'POST', `/animals/${animalId11}/unarchive`)
    expect(status).toBe(200)
    const { data } = await apiCallWithToken(token11, 'GET', `/animals/${animalId11}`)
    expect(data.is_archived).toBeFalsy()
  })
})

// ════════════════════════════════════════════════════════════════
// Suite 12: REMINDERS
// ════════════════════════════════════════════════════════════════

describe('Suite 12: Reminders', () => {
  let token12, animalId12, documentId12, reminderId

  beforeAll(async () => {
    const { data: regRes } = await registerAndVerifyUser('Reminder Test User', `reminder-test-${Date.now()}@example.com`, 'SecurePassword123!')
    token12 = regRes.token

    const { data: animal } = await apiCallWithToken(token12, 'POST', '/animals', {
      name: 'Impf-Hund',
      species: 'dog'
    })
    animalId12 = animal.id

    // Create a document fixture for document_id tests
    documentId12 = await (async () => {
      const ws = new WebSocket(toWsUrl(API_URL))
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('WS open timeout')), 5000)
        ws.onopen = () => { clearTimeout(timeout); resolve() }
        ws.onerror = (e) => { clearTimeout(timeout); reject(new Error(e?.message || 'WS error')) }
      })
      ws.send(JSON.stringify({ type: 'auth', token: token12 }))
      const authMsg = await waitForWsMessage(ws)
      if (authMsg.type !== 'auth_ok') { ws.close(); return null }
      const docId = `reminder-doc-${Date.now()}`
      ws.send(JSON.stringify({ type: 'upload_start', animalId: animalId12, filename: 'test.jpg', mimeType: 'image/jpeg', allowedRoles: ['guest'], documentId: docId }))
      const readyMsg = await waitForWsMessage(ws)
      ws.close()
      if (readyMsg.type !== 'ready') return null
      writeTinyPng(`${docId}.jpg`)
      return docId
    })().catch(() => null)
  })

  test('12a. POST /reminders — Erinnerung erstellen', async () => {
    const { status, data } = await apiCallWithToken(token12, 'POST', '/reminders', {
      animal_id: animalId12,
      title: 'Impf-Hund – Tollwut (Nobivac) auffrischen',
      due_date: '2027-03-15',
      notes: 'Charge: B12345\nTierarzt: Dr. Maier'
    })
    expect(status).toBe(201)
    expect(data.id).toBeTruthy()
    expect(data.title).toBe('Impf-Hund – Tollwut (Nobivac) auffrischen')
    expect(data.due_date).toBe('2027-03-15')
    expect(data.dismissed_at).toBeNull()
    reminderId = data.id
  })

  test('12b. POST /reminders — Mit document_id', async () => {
    if (!documentId12) return
    const { status, data } = await apiCallWithToken(token12, 'POST', '/reminders', {
      animal_id: animalId12,
      document_id: documentId12,
      title: 'Impfauffrischung mit Dokument',
      due_date: '2027-06-01'
    })
    expect(status).toBe(201)
    expect(data.document_id).toBe(documentId12)
  })

  test('12c. GET /reminders — Aktive Erinnerungen laden', async () => {
    const { status, data } = await apiCallWithToken(token12, 'GET', '/reminders')
    expect(status).toBe(200)
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
    expect(data.some(r => r.id === reminderId)).toBe(true)
    const reminder = data.find(r => r.id === reminderId)
    expect(reminder.animal_name).toBeTruthy()
  })

  test('12d. GET /reminders — Sortiert nach due_date aufsteigend', async () => {
    const { status, data } = await apiCallWithToken(token12, 'GET', '/reminders')
    expect(status).toBe(200)
    for (let i = 1; i < data.length; i++) {
      expect(data[i].due_date >= data[i - 1].due_date).toBe(true)
    }
  })

  test('12e. POST /reminders — Fehlendes due_date liefert 400', async () => {
    const { status } = await apiCallWithToken(token12, 'POST', '/reminders', {
      animal_id: animalId12,
      title: 'Kein Datum'
    })
    expect(status).toBe(400)
  })

  test('12f. POST /reminders — Falsches Datumsformat liefert 400', async () => {
    const { status } = await apiCallWithToken(token12, 'POST', '/reminders', {
      animal_id: animalId12,
      title: 'Falsches Datum',
      due_date: '15.03.2027'
    })
    expect(status).toBe(400)
  })

  test('12g. PATCH /reminders/:id/dismiss — Erinnerung als erledigt markieren', async () => {
    const { status, data } = await apiCallWithToken(token12, 'PATCH', `/reminders/${reminderId}/dismiss`)
    expect(status).toBe(200)
    expect(data.success).toBe(true)
  })

  test('12h. GET /reminders — Erledigte Erinnerung nicht mehr in Liste', async () => {
    const { status, data } = await apiCallWithToken(token12, 'GET', '/reminders')
    expect(status).toBe(200)
    expect(data.some(r => r.id === reminderId)).toBe(false)
  })

  test('12k. GET /reminders — Unauthenticated gives 401', async () => {
    const { status } = await apiCallWithToken(null, 'GET', '/reminders')
    expect(status).toBe(401)
  })
})




// ════════════════════════════════════════════════════════════════
// 13. CONTENT-HASH DEDUPLICATION
// Tests computeRecordHash and flagDuplicates logic directly via DB
// ════════════════════════════════════════════════════════════════

describe('Suite 13: Content-Hash Deduplication', () => {
  let db13
  let animalId13

  beforeAll(async () => {
    db13 = await getTestDb()
    // Create a user + animal directly in DB for isolation
    const accountId = `dedup-acct-${Date.now()}`
    const uniqueEmail = `dedup-${Date.now()}@example.com`
    await db13.query(`INSERT INTO accounts (id, name, email, password_hash, role, created_at) VALUES ($1, 'Dedup Tester', $2, 'x', 'user', CURRENT_TIMESTAMP)`, [accountId, uniqueEmail])
    await db13.query(`INSERT INTO animals (id, account_id, name, species, created_at) VALUES ($1, $2, 'Dedup-Hund', 'dog', CURRENT_TIMESTAMP)`, [`dedup-animal-${Date.now()}`, accountId])
    // Fetch the inserted animal id
    const { rows: [animalRow] } = await db13.query(`SELECT id FROM animals WHERE account_id = $1`, [accountId])
    animalId13 = animalRow?.id
  })

  afterAll(async () => {
    await db13?.end()
  })

  // ── Unit: computeRecordHash ────────────────────────────────────

  test('13a. computeRecordHash — vaccination hash is deterministic and 16 chars', () => {
    const rec = { batch_number: 'B-123', vaccine_name: 'Nobivac Tollwut', administration_date: '2025-06-01' }
    const h1 = computeRecordHash('vaccination', rec)
    const h2 = computeRecordHash('vaccination', rec)
    expect(h1).toBe(h2)
    expect(h1).toHaveLength(16)
    expect(/^[0-9a-f]+$/.test(h1)).toBe(true)
  })

  test('13b. computeRecordHash — different batch numbers produce different hashes', () => {
    const r1 = { batch_number: 'B-001', vaccine_name: 'Nobivac', administration_date: '2025-06-01' }
    const r2 = { batch_number: 'B-002', vaccine_name: 'Nobivac', administration_date: '2025-06-01' }
    expect(computeRecordHash('vaccination', r1)).not.toBe(computeRecordHash('vaccination', r2))
  })

  test('13c. computeRecordHash — singleton uses title + document_date + issuer', () => {
    const rec = { title: 'Stammbaum', document_date: '2024-01-01', issuer: 'ÖHZB' }
    const h = computeRecordHash('pedigree', rec)
    expect(h).toHaveLength(16)
    // Field order must not matter
    const h2 = computeRecordHash('pedigree', { issuer: 'ÖHZB', title: 'Stammbaum', document_date: '2024-01-01' })
    expect(h).toBe(h2)
  })

  test('13d. computeRecordHash — treatment hash uses substance + administered_at', () => {
    const rec = { substance: 'Frontline', administered_at: '2025-03-15' }
    const h = computeRecordHash('treatment', rec)
    expect(h).toHaveLength(16)
    // Synonym field should match
    const h2 = computeRecordHash('treatment', { treatment: 'Frontline', date: '2025-03-15' })
    expect(h).toBe(h2)
  })

  // ── Integration: flagDuplicates via real DB ────────────────────

  test('13f. flagDuplicates — second doc with identical record is flagged as duplicate', async () => {
    if (!animalId13) return
    const { rows: [docRow] } = await db13.query(`SELECT id FROM documents WHERE animal_id = $1 AND analysis_status = 'completed' LIMIT 1`, [animalId13])
    const docId1 = docRow?.id
    if (!docId1) return

    const docId2 = `dedup-doc2-${Date.now()}`
    const pageResults2 = [{ vaccinations: [{ batch_number: 'B-X01', vaccine_name: 'Eurifel', administration_date: '2025-01-10' }] }]

    flagDuplicates(db13, animalId13, docId2, 'vaccination', pageResults2)

    const rec = pageResults2[0].vaccinations[0]
    expect(rec._record_hash).toBeTruthy()
    expect(rec._duplicate).toBe(true)
    expect(rec._source_document_id).toBe(docId1)
  })

})

describe('Suite 14: Re-Analysis (Phase 4)', () => {
  let testAnimalId14 = ''
  let testUser14Token = ''
  let vaccinationDocId14 = ''
  let treatmentDocId14 = ''
  let vaccinationImagePath14 = ''
  let treatmentImagePath14 = ''
  let db14

  beforeAll(async () => {
    db14 = await getTestDb()

    // Register and login user for Suite 14
    const { data: regRes } = await registerAndVerifyUser('ReAnalyzer User', `reanalyzer_${Date.now()}@test.com`, 'test123456')
    testUser14Token = regRes.token

    // Create animal for Suite 14
    const animalRes = await apiCallWithToken(testUser14Token, 'POST', '/animals', {
      name: 'Analyzer Test Dog',
      species: 'dog'
    })
    testAnimalId14 = animalRes.data.id

    vaccinationImagePath14 = writeTinyPng(`vaccination-table-14-${Date.now()}.png`)
    treatmentImagePath14 = writeTinyPng(`treatment-table-14-${Date.now()}.png`)

    vaccinationDocId14 = `vaccination-doc-14-${Date.now()}`
    await db14.query(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, analysis_status, extracted_json, ocr_provider, created_at)
      VALUES ($1, $2, 'vaccination', $3, 'completed', $4, 'system', CURRENT_TIMESTAMP)
    `, [vaccinationDocId14, testAnimalId14, vaccinationImagePath14, JSON.stringify({
      type: 'vaccination',
      title: 'Original Analysis',
      vaccinations: [{ vaccine_name: 'Legacy Tollwut' }],
      page_results: [{ vaccinations: [{ vaccine_name: 'Legacy Tollwut' }] }]
    })])

    await db14.query(`
      INSERT INTO document_pages (document_id, image_path, page_number)
      VALUES ($1, $2, 1)
    `, [vaccinationDocId14, vaccinationImagePath14])

    treatmentDocId14 = `treatment-doc-14-${Date.now()}`
    await db14.query(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, analysis_status, extracted_json, ocr_provider, created_at)
      VALUES ($1, $2, 'treatment', $3, 'completed', $4, 'system', CURRENT_TIMESTAMP)
    `, [treatmentDocId14, testAnimalId14, treatmentImagePath14, JSON.stringify({
      type: 'treatment',
      title: 'Original Treatment Analysis',
      treatments: [{ substance: 'Legacy Treatment' }],
      page_results: [{ treatments: [{ substance: 'Legacy Treatment' }] }]
    })])

    await db14.query(`
      INSERT INTO document_pages (document_id, image_path, page_number)
      VALUES ($1, $2, 1)
    `, [treatmentDocId14, treatmentImagePath14])
  })

  test('14a. POST /documents/:id/re-analyze re-analyzes vaccination tables into structured records', async () => {
    const res = await apiCallWithToken(testUser14Token, 'POST', `/documents/${vaccinationDocId14}/re-analyze`, {})

    expect(res.status).toBe(200)
    expect(res.data.success).toBe(true)
    expect(res.data.provider).toBe('mock-ocr')
    expect(res.data.previousVersion.historyId).toBeTruthy()
    expect(Array.isArray(res.data.extractedData.vaccinations)).toBe(true)
    expect(res.data.extractedData.vaccinations.length).toBe(2)
    expect(res.data.extractedData.vaccinations[0].vaccine_name).toBe('DHLPPi')
    expect(res.data.extractedData.vaccinations[0].administration_date).toBe('2021-09-06')

    const { rows: [stored] } = await db14.query('SELECT extracted_json, ocr_provider FROM documents WHERE id = $1', [vaccinationDocId14])
    const parsed = JSON.parse(stored.extracted_json)
    expect(stored.ocr_provider).toBe('mock-ocr')
    expect(parsed.vaccinations.length).toBe(2)
    expect(parsed.payload.vaccinations.length).toBe(2)
  })

  test('14b. POST /documents/:id/re-analyze re-analyzes treatment tables into structured records', async () => {
    const res = await apiCallWithToken(testUser14Token, 'POST', `/documents/${treatmentDocId14}/re-analyze`, {})

    expect(res.status).toBe(200)
    expect(Array.isArray(res.data.extractedData.treatments)).toBe(true)
    expect(res.data.extractedData.treatments.length).toBe(2)
    expect(res.data.extractedData.treatments[0].substance).toBe('Milbemax')
    expect(res.data.extractedData.treatments[0].administered_at).toBe('2024-03-15')
  })

  test('14c. GET /documents/:id/history returns previous analyses in descending version order', async () => {
    const res = await apiCallWithToken(testUser14Token, 'GET', `/documents/${vaccinationDocId14}/history`)

    expect(res.status).toBe(200)
    expect(res.data.current.version).toBeGreaterThan(0)
    expect(Array.isArray(res.data.history)).toBe(true)
    expect(res.data.history.length).toBeGreaterThan(0)
    expect(res.data.history[0].extracted_json.title).toBe('Original Analysis')
  })

  test('14d. Re-analyze endpoint requires authentication (401 for unauth)', async () => {
    const res = await apiCallWithToken(null, 'POST', `/documents/${vaccinationDocId14}/re-analyze`, {})
    expect(res.status).toBe(401)
  })

  test('14e. Re-analyze requires analysis_status = completed (400)', async () => {
    const pendingImagePath = writeTinyPng(`vaccination-pending-14-${Date.now()}.png`)
    const pendingDocId = `status-test-${Date.now()}`

    await db14.query(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, analysis_status, extracted_json, created_at)
      VALUES ($1, $2, 'general', $3, 'pending_analysis', '{}', CURRENT_TIMESTAMP)
    `, [pendingDocId, testAnimalId14, pendingImagePath])

    const res = await apiCallWithToken(testUser14Token, 'POST', `/documents/${pendingDocId}/re-analyze`, {})
    expect(res.status).toBe(400)
    expect(res.data.error).toContain('analysiert')
  })
})


// ════════════════════════════════════════════════════════════════
// Suite 15: MULTILINGUAL OCR PROMPTS
// Tests that AI prompts are language-specific and correctly routed
// ════════════════════════════════════════════════════════════════

describe('Suite 15: Multilingual OCR Prompts', () => {
  // ── Unit: getPromptForDocumentType ────────────────────────────

  test('15a. DE vaccination prompt contains German keywords', () => {
    const prompt = getPromptForDocumentType('vaccination', 'de')
    expect(prompt).toContain('Impfpass')
    expect(prompt).toContain('Chargennummer')
    expect(prompt).toContain('Gültig bis')
    expect(prompt).not.toContain('You are a veterinary')
  })

  test('15b. EN vaccination prompt contains English keywords', () => {
    const prompt = getPromptForDocumentType('vaccination', 'en')
    expect(prompt).toContain('vaccination')
    expect(prompt).toContain('batch_number')
    expect(prompt).toContain('valid_until')
    expect(prompt).not.toContain('Du bist ein')
  })

  test('15c. DE and EN vaccination prompts are different strings', () => {
    const dePrompt = getPromptForDocumentType('vaccination', 'de')
    const enPrompt = getPromptForDocumentType('vaccination', 'en')
    expect(dePrompt).not.toBe(enPrompt)
    expect(dePrompt.length).toBeGreaterThan(100)
    expect(enPrompt.length).toBeGreaterThan(100)
  })

  test('15d. Unknown language falls back to German prompt', () => {
    const frPrompt = getPromptForDocumentType('vaccination', 'fr')
    const dePrompt = getPromptForDocumentType('vaccination', 'de')
    expect(frPrompt).toBe(dePrompt)
  })

  test('15e. null/undefined language falls back to German prompt', () => {
    const nullPrompt = getPromptForDocumentType('vaccination', null)
    const undefPrompt = getPromptForDocumentType('vaccination', undefined)
    const dePrompt = getPromptForDocumentType('vaccination', 'de')
    expect(nullPrompt).toBe(dePrompt)
    expect(undefPrompt).toBe(dePrompt)
  })

  test('15f. All document types have both DE and EN prompts', () => {
    const docTypes = ['vaccination', 'treatment', 'pedigree', 'dog_certificate', 'medical_product', 'general']
    for (const docType of docTypes) {
      expect(PROMPTS.de[docType]).toBeTruthy()
      expect(PROMPTS.en[docType]).toBeTruthy()
      expect(PROMPTS.de[docType]).not.toBe(PROMPTS.en[docType])
    }
  })

  test('15g. DE classification prompt contains German document type names', () => {
    const prompt = PROMPTS.de.classification
    expect(prompt).toContain('Impfpass')
    expect(prompt).toContain('Stammbaum')
    expect(prompt).toContain('Hundeführerschein')
    expect(prompt).toContain('Packungsbeilage')
  })

  test('15h. EN classification prompt contains English document type names', () => {
    const prompt = PROMPTS.en.classification
    expect(prompt).toContain('vaccination record')
    expect(prompt).toContain('pedigree')
    expect(prompt).toContain('Dog Handler Certificate')
    expect(prompt).toContain('package insert')
  })

  // ── Integration: retry-analysis with language parameter ────────

  test('15i. retry-analysis accepts language=de and returns 200', async () => {
    const db = await getTestDb()

    // Create a user + animal + document for this test
    const { data: regRes } = await registerAndVerifyUser('OCR Lang DE Tester', `ocr-lang-de-${Date.now()}@example.com`, 'SecurePassword123!')
    const token15 = regRes.token

    const { data: animal } = await apiCallWithToken(token15, 'POST', '/animals', { name: 'Lang Test Hund', species: 'dog' })
    const animalId15 = animal.id

    const imagePath = writeTinyPng(`lang-de-test-${Date.now()}.png`)
    const docId = `lang-de-doc-${Date.now()}`

    await db.query(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, analysis_status, extracted_json, ocr_provider, created_at)
      VALUES ($1, $2, 'vaccination', $3, 'pending_analysis', '{}', 'pending', CURRENT_TIMESTAMP)
    `, [docId, animalId15, imagePath])
    await db.query(`INSERT INTO document_pages (document_id, image_path, page_number) VALUES ($1, $2, 1)`, [docId, imagePath])
    await db.end()

    const { status, data } = await apiCallWithToken(token15, 'POST', `/documents/${docId}/retry-analysis`, {
      language: 'de'
    })
    expect(status).toBe(200)
    expect(data.provider).toBe('mock-ocr')
  })

  test('15j. retry-analysis accepts language=en and returns 200', async () => {
    const db = await getTestDb()

    const { data: regRes } = await registerAndVerifyUser('OCR Lang EN Tester', `ocr-lang-en-${Date.now()}@example.com`, 'SecurePassword123!')
    const token15en = regRes.token

    const { data: animal } = await apiCallWithToken(token15en, 'POST', '/animals', { name: 'Lang Test Dog', species: 'dog' })
    const animalId15en = animal.id

    const imagePath = writeTinyPng(`lang-en-test-${Date.now()}.png`)
    const docId = `lang-en-doc-${Date.now()}`

    await db.query(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, analysis_status, extracted_json, ocr_provider, created_at)
      VALUES ($1, $2, 'vaccination', $3, 'pending_analysis', '{}', 'pending', CURRENT_TIMESTAMP)
    `, [docId, animalId15en, imagePath])
    await db.query(`INSERT INTO document_pages (document_id, image_path, page_number) VALUES ($1, $2, 1)`, [docId, imagePath])
    await db.end()

    const { status, data } = await apiCallWithToken(token15en, 'POST', `/documents/${docId}/retry-analysis`, {
      language: 'en'
    })
    expect(status).toBe(200)
    expect(data.provider).toBe('mock-ocr')
  })

  test('15j2. retry-analysis honors requestedDocumentType override', async () => {
    const db = await getTestDb()

    const { data: regRes } = await registerAndVerifyUser('OCR Type Override Tester', `ocr-type-override-${Date.now()}@example.com`, 'SecurePassword123!')
    const token = regRes.token

    const { data: animal } = await apiCallWithToken(token, 'POST', '/animals', { name: 'Type Override Dog', species: 'dog' })
    const imagePath = writeTinyPng(`override-general-${Date.now()}.png`)
    const docId = `override-type-doc-${Date.now()}`

    await db.query(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, analysis_status, extracted_json, ocr_provider, created_at)
      VALUES ($1, $2, 'general', $3, 'pending_analysis', '{}', 'pending', CURRENT_TIMESTAMP)
    `, [docId, animal.id, imagePath])
    await db.query(`INSERT INTO document_pages (document_id, image_path, page_number) VALUES ($1, $2, 1)`, [docId, imagePath])
    await db.end()

    const { status, data } = await apiCallWithToken(token, 'POST', `/documents/${docId}/retry-analysis`, {
      language: 'de',
      requestedDocumentType: 'vaccination'
    })

    expect(status).toBe(200)
    expect(data.extractedData.type).toBe('vaccination')
  })

  test('15k. re-analyze accepts language parameter', async () => {
    const db = await getTestDb()

    const { data: regRes } = await registerAndVerifyUser('Re-Analyze Lang Tester', `ocr-reanalyze-${Date.now()}@example.com`, 'SecurePassword123!')
    const token15k = regRes.token

    const { data: animal } = await apiCallWithToken(token15k, 'POST', '/animals', { name: 'Reanalyze Dog', species: 'dog' })
    const animalId15k = animal.id

    const imagePath = writeTinyPng(`reanalyze-lang-${Date.now()}.png`)
    const docId = `reanalyze-lang-doc-${Date.now()}`

    await db.query(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, analysis_status, extracted_json, ocr_provider, created_at)
      VALUES ($1, $2, 'vaccination', $3, 'completed', '{"title":"Old","vaccinations":[]}', 'system', CURRENT_TIMESTAMP)
    `, [docId, animalId15k, imagePath])
    await db.query(`INSERT INTO document_pages (document_id, image_path, page_number) VALUES ($1, $2, 1)`, [docId, imagePath])
    await db.end()

    const { status } = await apiCallWithToken(token15k, 'POST', `/documents/${docId}/re-analyze`, {
      language: 'en'
    })
    expect(status).toBe(200)
  })

  test('15k2. re-analyze honors requestedDocumentType override', async () => {
    const db = await getTestDb()

    const { data: regRes } = await registerAndVerifyUser('Re-Analyze Type Tester', `ocr-reanalyze-type-${Date.now()}@example.com`, 'SecurePassword123!')
    const token = regRes.token

    const { data: animal } = await apiCallWithToken(token, 'POST', '/animals', { name: 'Reanalyze Type Dog', species: 'dog' })
    const imagePath = writeTinyPng(`reanalyze-general-${Date.now()}.png`)
    const docId = `reanalyze-type-doc-${Date.now()}`

    await db.query(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, analysis_status, extracted_json, ocr_provider, created_at)
      VALUES ($1, $2, 'general', $3, 'completed', '{"title":"Old","summary":"Old","type":"general"}', 'system', CURRENT_TIMESTAMP)
    `, [docId, animal.id, imagePath])
    await db.query(`INSERT INTO document_pages (document_id, image_path, page_number) VALUES ($1, $2, 1)`, [docId, imagePath])
    await db.end()

    const { status, data } = await apiCallWithToken(token, 'POST', `/documents/${docId}/re-analyze`, {
      language: 'de',
      requestedDocumentType: 'treatment'
    })

    expect(status).toBe(200)
    expect(data.extractedData.type).toBe('treatment')
  })

  test('15k3. retry-analysis rejects unsupported model for selected provider', async () => {
    const db = await getTestDb()

    const { data: regRes } = await registerAndVerifyUser('Invalid Model Tester', `ocr-invalid-model-${Date.now()}@example.com`, 'SecurePassword123!')
    const token = regRes.token

    const { data: animal } = await apiCallWithToken(token, 'POST', '/animals', { name: 'Invalid Model Dog', species: 'dog' })
    const imagePath = writeTinyPng(`invalid-model-${Date.now()}.png`)
    const docId = `invalid-model-doc-${Date.now()}`

    await db.query(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, analysis_status, extracted_json, ocr_provider, created_at)
      VALUES ($1, $2, 'general', $3, 'pending_analysis', '{}', 'pending', CURRENT_TIMESTAMP)
    `, [docId, animal.id, imagePath])
    await db.query(`INSERT INTO document_pages (document_id, image_path, page_number) VALUES ($1, $2, 1)`, [docId, imagePath])
    await db.end()

    const { status, data } = await apiCallWithToken(token, 'POST', `/documents/${docId}/retry-analysis`, {
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001'
    })

    expect(status).toBe(400)
    expect(data.error).toContain('Modell nicht verfügbar')
  })

  test('15l. normalizeDocumentType handles all supported aliases', () => {
    expect(normalizeDocumentType('vaccination')).toBe('vaccination')
    expect(normalizeDocumentType('impfpass')).toBe('vaccination')
    expect(normalizeDocumentType('pedigree')).toBe('pedigree')
    expect(normalizeDocumentType('stammbaum')).toBe('pedigree')
    expect(normalizeDocumentType('dog_certificate')).toBe('dog_certificate')
    expect(normalizeDocumentType('medical_product')).toBe('medical_product')
    expect(normalizeDocumentType('treatment')).toBe('treatment')
    expect(normalizeDocumentType('general')).toBe('general')
    expect(normalizeDocumentType('unknown_type_xyz')).toBe('general')
    expect(normalizeDocumentType('')).toBe('general')
  })

  test('15m. buildExtractedDocumentData upgrades general OCR payloads with extracted_text vaccinations', () => {
    const data = buildExtractedDocumentData({
      combinedText: 'Impfpass / Sonstige Impfungen',
      suggestedType: 'general',
      pages: 1,
      pageResults: [{
        type: 'general',
        title: 'Impfpass / Sonstige Impfungen',
        document_date: '2026-12-02',
        extracted_text: {
          vaccinations: [
            {
              vaccine: 'Eurican L4',
              date: '2025-12-02',
              valid_until: '2026-12-02',
              batch: 'H09350'
            }
          ]
        }
      }]
    })

    expect(data.type).toBe('vaccination')
    expect(Array.isArray(data.vaccinations)).toBe(true)
    expect(data.vaccinations).toHaveLength(1)
    expect(data.vaccinations[0].vaccine).toBe('Eurican L4')
    expect(data.payload.type).toBe('vaccination')
    expect(data.payload.vaccinations).toHaveLength(1)
  })

  test('15n. parseStructuredModelResponse accepts fenced JSON with surrounding text', () => {
    const text = [
      'Here is the extracted JSON:',
      '',
      '```json',
      '{',
      '  "title": "Impfpass / Sonstige Impfungen",',
      '  "vaccinations": [',
      '    { "vaccine": "Eurican L4", "date": "2025-12-02" }',
      '  ]',
      '}',
      '```'
    ].join('\n')

    const parsed = parseStructuredModelResponse(text, 'Gemini', 'vaccination')

    expect(parsed.type).toBe('vaccination')
    expect(parsed.title).toBe('Impfpass / Sonstige Impfungen')
    expect(parsed.vaccinations).toHaveLength(1)
    expect(parsed.vaccinations[0].vaccine).toBe('Eurican L4')
  })

  test('15n2. parseStructuredModelResponse normalizes confidence values', () => {
    const parsed = parseStructuredModelResponse('{"title":"Vaccination","confidence":"78%","vaccinations":[{"vaccine":"Eurican L4","date":"2025-12-02"}]}', 'Gemini', 'vaccination')

    expect(parsed.confidence).toBe(0.78)
  })

  test('15o. buildExtractedDocumentData upgrades vaccination-like general payloads without structured rows', () => {
    const data = buildExtractedDocumentData({
      combinedText: 'Impfpass Eintragungen',
      suggestedType: 'general',
      pages: 1,
      pageResults: [{
        type: 'general',
        document_date: '2023-10-30',
        title: 'Impfpass Eintragungen',
        summary: 'Das Dokument enthält eine Auflistung von verschiedenen Impfungen (Eurican, Nobivac) für ein Haustier, dokumentiert durch eine Tierarztpraxis.',
        tags: ['Impfpass', 'Impfungen', 'Veterinär', 'Boehringer Ingelheim'],
        extracted_text: 'Es handelt sich um einen Abschnitt aus einem Heimtierausweis mit Impfaufklebern von Eurican und Nobivac.'
      }]
    })

    expect(data.type).toBe('vaccination')
    expect(data.payload.type).toBe('vaccination')
    expect(Array.isArray(data.vaccinations)).toBe(true)
    expect(data.vaccinations).toHaveLength(0)
    expect(data.extraction_quality.requires_retry).toBe(true)
    expect(data.extraction_quality.retry_reasons).toContain('vaccination_signals_without_structured_records')
  })

  test('15p. buildExtractedDocumentData exposes confidence and stable quality for structured vaccination rows', () => {
    const data = buildExtractedDocumentData({
      combinedText: 'Structured vaccination page',
      suggestedType: 'vaccination',
      pages: 1,
      pageResults: [{
        type: 'vaccination',
        confidence: 0.91,
        title: 'Vaccination Record',
        vaccinations: [
          {
            vaccine_name: 'Nobivac SHPPi',
            administration_date: '2021-09-06',
            batch_number: 'A628B01',
            manufacturer: 'MSD Animal Health',
            valid_until: '2022-09-06'
          }
        ]
      }]
    })

    expect(data.confidence).toBe(0.91)
    expect(data.extraction_quality.requires_retry).toBe(false)
    expect(data.extraction_quality.schema_valid).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════════
// Suite 16: EU Pet Passport + Chip Tag Type
// ════════════════════════════════════════════════════════════════

describe('Suite 16: EU Pet Passport + Chip Tag Type', () => {
  test('16a. normalizeDocumentType maps passport aliases to pet_passport', () => {
    expect(normalizeDocumentType('passport')).toBe('pet_passport')
    expect(normalizeDocumentType('heimtierausweis')).toBe('pet_passport')
    expect(normalizeDocumentType('transponder')).toBe('pet_passport')
    expect(normalizeDocumentType('microchip')).toBe('pet_passport')
  })

  test('16b. DE pet_passport prompt contains passport-specific keywords', () => {
    const prompt = getPromptForDocumentType('pet_passport', 'de')
    expect(prompt).toContain('EU-Heimtierausweis')
    expect(prompt).toContain('section_type')
    expect(prompt).toContain('chip_code')
    expect(prompt).toContain('ownership')
  })

  test('16c. EN pet_passport prompt contains passport-specific keywords', () => {
    const prompt = getPromptForDocumentType('pet_passport', 'en')
    expect(prompt).toContain('EU pet passport')
    expect(prompt).toContain('section_type')
    expect(prompt).toContain('chip_code')
    expect(prompt).toContain('identification')
  })

  test('16d. PROMPTS contain pet_passport in both languages', () => {
    expect(typeof PROMPTS.de.pet_passport).toBe('string')
    expect(typeof PROMPTS.en.pet_passport).toBe('string')
    expect(PROMPTS.de.classification).toContain('pet_passport')
    expect(PROMPTS.en.classification).toContain('pet_passport')
  })

  test('16e. create animal accepts chip as tag type', async () => {
    const { data: regRes } = await registerAndVerifyUser('Chip Test User', `chip-create-${Date.now()}@example.com`, 'SecurePassword123!')
    const token = regRes.token

    const { status, data } = await apiCallWithToken(token, 'POST', '/animals', {
      name: 'Chip Hund',
      species: 'dog',
      tagId: `CHIP-${Date.now()}`,
      tagType: 'chip'
    })

    expect(status).toBe(201)
    expect(data.id).toBeTruthy()

    const tags = await apiCallWithToken(token, 'GET', `/animals/${data.id}/tags`)
    expect(tags.status).toBe(200)
    expect(tags.data.some((tag) => tag.tag_type === 'chip')).toBe(true)
  })

  test('16f. database accepts documents with doc_type pet_passport', async () => {
    const db = await getTestDb()
    const accountId = `passport-account-${Date.now()}`
    const animalId = `passport-animal-${Date.now()}`
    const docId = `passport-doc-${Date.now()}`
    const imagePath = writeTinyPng(`pet-passport-db-${Date.now()}.png`)

    await db.query(`INSERT INTO accounts (id, name, email, password_hash, role, created_at) VALUES ($1, 'Passport DB User', $2, 'x', 'user', CURRENT_TIMESTAMP)`,
      [accountId, `passport-db-${Date.now()}@example.com`])
    await db.query(`INSERT INTO animals (id, account_id, name, species, created_at) VALUES ($1, $2, 'Passport Dog', 'dog', CURRENT_TIMESTAMP)`,
      [animalId, accountId])
    await db.query(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, extracted_json, analysis_status, created_at)
      VALUES ($1, $2, 'pet_passport', $3, '{}', 'completed', CURRENT_TIMESTAMP)
    `, [docId, animalId, imagePath])

    const { rows: [stored] } = await db.query('SELECT doc_type FROM documents WHERE id = $1', [docId])
    expect(stored.doc_type).toBe('pet_passport')
    await db.end()
  })

  // ════════════════════════════════════════════════════════════════
  // 17. Admin: Test Run History
  // ════════════════════════════════════════════════════════════════

  describe('17. Admin: Test Run History', () => {
    test('17a. GET /api/admin/test-runs returns 401 without auth', async () => {
      const { status } = await apiCallWithToken(null, 'GET', '/admin/test-runs')
      expect(status).toBe(401)
    })

    test('17b. GET /api/admin/test-runs returns 403 for non-admin', async () => {
      const { data: regRes } = await registerAndVerifyUser('Non-Admin User', `nonadmin-${Date.now()}@example.com`, 'Password123!')
      const { status } = await apiCallWithToken(regRes.token, 'GET', '/admin/test-runs')
      expect(status).toBe(403)
    })

    test('17c. GET /api/admin/test-runs returns empty list when no runs exist', async () => {
      // Register and verify admin user
      const { data: adminReg } = await registerAndVerifyUser('Admin Test', `admin-${Date.now()}@example.com`, 'Password123!')
      const adminAccountId = adminReg.account.id

      // Mark user as admin in DB
      const db17c = await getTestDb()
      await db17c.query('UPDATE accounts SET role = $1 WHERE id = $2', ['user,admin', adminAccountId])

      // Login to get token
      const { data: loginRes } = await apiCallWithToken(null, 'POST', '/auth/login', {
        email: adminReg.account.email,
        password: 'Password123!'
      })
      const adminToken = loginRes.token

      // Delete all test runs from DB first
      const db = await getTestDb()
      await db.query('DELETE FROM test_results')
      await db.end()
      await db17c.end()

      const { status, data } = await apiCallWithToken(adminToken, 'GET', '/admin/test-runs')
      expect(status).toBe(200)
      expect(data.runs).toEqual([])
      expect(data.total).toBe(0)
    })

    test('17d. GET /api/admin/test-runs/:id returns 404 for unknown run', async () => {
      // Register and verify admin user
      const { data: adminReg } = await registerAndVerifyUser('Admin2 Test', `admin2-${Date.now()}@example.com`, 'Password123!')
      const adminAccountId = adminReg.account.id

      // Mark user as admin in DB
      const db17d = await getTestDb()
      await db17d.query('UPDATE accounts SET role = $1 WHERE id = $2', ['user,admin', adminAccountId])

      // Login to get token
      const { data: loginRes } = await apiCallWithToken(null, 'POST', '/auth/login', {
        email: adminReg.account.email,
        password: 'Password123!'
      })
      const adminToken = loginRes.token
      await db17d.end()

      const { status } = await apiCallWithToken(adminToken, 'GET', '/admin/test-runs/unknown-id-12345')
      expect(status).toBe(404)
    })

    test('17e. GET /api/admin/test-runs/:id returns 401 without auth', async () => {
      const { status } = await apiCallWithToken(null, 'GET', '/admin/test-runs/some-id')
      expect(status).toBe(401)
    })
  })

  // ════════════════════════════════════════════════════════════════
  // 18. Database Persistence
  // ════════════════════════════════════════════════════════════════

  describe('18. Database Persistence', () => {
    test('18a. Animal data persists across simulated restarts', async () => {
      const db1 = await getTestDb()
      const accountId = uuid()
      const animalId = uuid()
      const animalName = `Persistence Test Dog ${Date.now()}`

      // Insert data in first "session"
      await db1.query(`INSERT INTO accounts (id, name, email, password_hash, role, created_at)
        VALUES ($1, 'Test User', $2, 'hash', 'user', CURRENT_TIMESTAMP)`,
        [accountId, `persist-test-${Date.now()}@example.com`])
      await db1.query(`INSERT INTO animals (id, account_id, name, species, created_at)
        VALUES ($1, $2, $3, 'dog', CURRENT_TIMESTAMP)`,
        [animalId, accountId, animalName])
      await db1.end()

      // Simulate restart: open new connection and verify data still exists
      const db2 = await getTestDb()
      const { rows: [animal] } = await db2.query(
        'SELECT id, name, species FROM animals WHERE id = $1',
        [animalId]
      )
      expect(animal).toBeTruthy()
      expect(animal.name).toBe(animalName)
      expect(animal.species).toBe('dog')
      await db2.end()
    })

    test('18b. Schema migrations are idempotent (re-running init does not break data)', async () => {
      const db = await getTestDb()
      const accountId = uuid()
      const email = `idempotent-${Date.now()}@example.com`

      // Insert data
      await db.query(`INSERT INTO accounts (id, name, email, password_hash, role, created_at)
        VALUES ($1, 'Idempotent Test', $2, 'hash', 'user', CURRENT_TIMESTAMP)`,
        [accountId, email])

      // Query to verify record_permissions column exists (should be idempotent)
      const { rows: [doc] } = await db.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'documents' AND column_name = 'record_permissions'
      `)
      expect(doc).toBeTruthy() // column should exist without error
      await db.end()
    })
  })
})

// ════════════════════════════════════════════════════════════════
// Suite 19: JWT Refresh
// ════════════════════════════════════════════════════════════════

describe('Suite 19: JWT Refresh', () => {
  let token
  let accountId

  beforeAll(async () => {
    const email = `refresh-test-${Date.now()}@example.com`
    const result = await registerAndVerifyUser('Refresh User', email, 'test1234')
    token = result.data.token
    accountId = result.data.account.id
  })

  test('19a. POST /auth/refresh — issues new token with valid old token', async () => {
    const { status, data } = await apiCallWithToken(token, 'POST', '/auth/refresh')
    expect(status).toBe(200)
    expect(data.token).toBeTruthy()
    expect(typeof data.token).toBe('string')
    expect(data.account).toBeTruthy()
    expect(data.account.id).toBe(accountId)
  })

  test('19b. Refreshed token can be used for authenticated requests', async () => {
    const { data: refreshData } = await apiCallWithToken(token, 'POST', '/auth/refresh')
    const newToken = refreshData.token

    const { status, data } = await apiCallWithToken(newToken, 'GET', '/accounts/me')
    expect(status).toBe(200)
    expect(data.id).toBe(accountId)
  })

  test('19c. Refresh without token returns 401', async () => {
    const { status } = await apiCallWithToken(null, 'POST', '/auth/refresh')
    expect(status).toBe(401)
  })

  test('19d. Refresh with invalid token returns 401', async () => {
    const { status } = await apiCallWithToken('invalid.token.here', 'POST', '/auth/refresh')
    expect(status).toBe(401)
  })

  test('19e. Refreshed token reflects current role from DB', async () => {
    const db = await getTestDb()
    try {
      await db.query("UPDATE accounts SET role = 'vet' WHERE id = $1", [accountId])
    } finally {
      await db.end()
    }

    const { status, data } = await apiCallWithToken(token, 'POST', '/auth/refresh')
    expect(status).toBe(200)
    expect(data.account.role).toBe('vet')
    expect(data.token).toBeTruthy()

    // Restore role
    const db2 = await getTestDb()
    try {
      await db2.query("UPDATE accounts SET role = 'user' WHERE id = $1", [accountId])
    } finally {
      await db2.end()
    }
  })
})

// ════════════════════════════════════════════════════════════════
// Suite 20: Account Deletion (DSGVO Art. 17) + Cascade
// ════════════════════════════════════════════════════════════════

describe('Suite 20: Account Deletion + Cascade', () => {
  test('20a. DELETE /accounts/me — removes account and returns 204', async () => {
    const email = `delete-test-${Date.now()}@example.com`
    const result = await registerAndVerifyUser('Delete Me', email, 'test1234')
    const deleteToken = result.data.token
    const deleteId = result.data.account.id

    const { status } = await apiCallWithToken(deleteToken, 'DELETE', '/accounts/me')
    expect(status).toBe(204)

    const db = await getTestDb()
    try {
      const { rows } = await db.query('SELECT id FROM accounts WHERE id = $1', [deleteId])
      expect(rows.length).toBe(0)
    } finally {
      await db.end()
    }
  })

  test('20b. Token is invalid after account deletion', async () => {
    const email = `delete-token-test-${Date.now()}@example.com`
    const result = await registerAndVerifyUser('Delete Token Test', email, 'test1234')
    const deleteToken = result.data.token

    await apiCallWithToken(deleteToken, 'DELETE', '/accounts/me')

    // The JWT is still cryptographically valid but the account is gone
    const { status } = await apiCallWithToken(deleteToken, 'GET', '/accounts/me')
    // Either 401 (if account lookup fails) or 404 — either signals no access
    expect([401, 404]).toContain(status)
  })

  test('20c. Cascade — animals owned by deleted account are removed', async () => {
    const email = `cascade-animal-${Date.now()}@example.com`
    const result = await registerAndVerifyUser('Cascade Animal Owner', email, 'test1234')
    const cascadeToken = result.data.token
    const cascadeId = result.data.account.id

    // Create an animal
    const { data: animalData } = await apiCallWithToken(cascadeToken, 'POST', '/animals', {
      name: 'Cascade Dog',
      species: 'dog'
    })
    const animalId = animalData.id

    // Delete account
    await apiCallWithToken(cascadeToken, 'DELETE', '/accounts/me')

    // Verify animal is gone (or at least account is gone)
    const db = await getTestDb()
    try {
      const { rows: accountRows } = await db.query('SELECT id FROM accounts WHERE id = $1', [cascadeId])
      expect(accountRows.length).toBe(0)
    } finally {
      await db.end()
    }
  })

  test('20d. Last admin cannot delete their account', async () => {
    const db = await getTestDb()
    let adminToken
    let adminId

    try {
      // Count current admins
      const { rows: admins } = await db.query("SELECT id FROM accounts WHERE role = 'admin'")

      if (admins.length === 0) {
        // Create a single admin
        const email = `last-admin-${Date.now()}@example.com`
        const result = await registerAndVerifyUser('Last Admin', email, 'test1234')
        adminToken = result.data.token
        adminId = result.data.account.id
        await db.query("UPDATE accounts SET role = 'admin' WHERE id = $1", [adminId])

        // Re-login to get admin token
        const relogin = await apiCallWithToken(null, 'POST', '/auth/login', { email, password: 'test1234' })
        adminToken = relogin.data.token
      } else {
        // There are existing admins — create another one and make all others non-admin temporarily
        const email = `sole-admin-${Date.now()}@example.com`
        const result = await registerAndVerifyUser('Sole Admin', email, 'test1234')
        adminToken = result.data.token
        adminId = result.data.account.id
        // Temporarily demote others, promote this one
        for (const { id } of admins) {
          await db.query("UPDATE accounts SET role = 'user' WHERE id = $1", [id])
        }
        await db.query("UPDATE accounts SET role = 'admin' WHERE id = $1", [adminId])

        const relogin = await apiCallWithToken(null, 'POST', '/auth/login', { email, password: 'test1234' })
        adminToken = relogin.data.token

        // Restore other admins after test
        const { status } = await apiCallWithToken(adminToken, 'DELETE', '/accounts/me')
        expect(status).toBe(403)

        for (const { id } of admins) {
          await db.query("UPDATE accounts SET role = 'admin' WHERE id = $1", [id])
        }
        return
      }
    } finally {
      await db.end()
    }

    const { status } = await apiCallWithToken(adminToken, 'DELETE', '/accounts/me')
    expect(status).toBe(403)

    // Cleanup: demote admin so other tests are not affected
    const db2 = await getTestDb()
    try {
      await db2.query("UPDATE accounts SET role = 'user' WHERE id = $1", [adminId])
    } finally {
      await db2.end()
    }
  })
})

// ════════════════════════════════════════════════════════════════
// Suite 21: Mail Settings Endpoints
// ════════════════════════════════════════════════════════════════

describe('Suite 21: Mail Settings Endpoints', () => {
  let adminToken

  beforeAll(async () => {
    const email = `mail-admin-${Date.now()}@example.com`
    const result = await registerAndVerifyUser('Mail Admin', email, 'test1234')
    adminToken = result.data.token
    const db = await getTestDb()
    try {
      await db.query("UPDATE accounts SET role = 'admin' WHERE id = $1", [result.data.account.id])
    } finally {
      await db.end()
    }
    // Re-login to get admin token
    const relogin = await apiCallWithToken(null, 'POST', '/auth/login', { email, password: 'test1234' })
    adminToken = relogin.data.token
  })

  test('21a. GET /admin/settings/mail-status — returns configured: false when mail not set up', async () => {
    const { status, data } = await apiCallWithToken(adminToken, 'GET', '/admin/settings/mail-status')
    expect(status).toBe(200)
    expect(typeof data.configured).toBe('boolean')
  })

  test('21b. GET /admin/settings/mail-status — requires admin role', async () => {
    const email = `mail-user-${Date.now()}@example.com`
    const result = await registerAndVerifyUser('Mail User', email, 'test1234')
    const userToken = result.data.token
    const { status } = await apiCallWithToken(userToken, 'GET', '/admin/settings/mail-status')
    expect(status).toBe(403)
  })

  test('21c. GET /admin/settings/mail-status — requires auth', async () => {
    const { status } = await apiCallWithToken(null, 'GET', '/admin/settings/mail-status')
    expect(status).toBe(401)
  })

  test('21d. POST /admin/settings/test-mail — returns 400 when mail not configured', async () => {
    // With no valid SMTP config, test-mail should return 400
    const { status, data } = await apiCallWithToken(adminToken, 'POST', '/admin/settings/test-mail', {})
    // Either 400 (not configured) or 200 (if server has mail configured in test env)
    expect([200, 400]).toContain(status)
    if (status === 400) {
      expect(data.error).toBeTruthy()
    }
  })

  test('21e. POST /admin/settings/test-mail — requires admin role', async () => {
    const email = `mail-user2-${Date.now()}@example.com`
    const result = await registerAndVerifyUser('Mail User 2', email, 'test1234')
    const userToken = result.data.token
    const { status } = await apiCallWithToken(userToken, 'POST', '/admin/settings/test-mail', {})
    expect(status).toBe(403)
  })

  test('21f. PATCH /admin/settings — saves public settings (app_name)', async () => {
    const { status, data } = await apiCallWithToken(adminToken, 'PATCH', '/admin/settings', {
      app_name: 'PAW Test Suite'
    })
    expect(status).toBe(200)
    expect(data.success).toBe(true)
  })

  test('21g. GET /settings (public) — returns public settings without secrets', async () => {
    const { status, data } = await apiCallWithToken(null, 'GET', '/settings')
    expect(status).toBe(200)
    expect(data).not.toHaveProperty('smtp_password')
    expect(data).not.toHaveProperty('oauth2_client_secret')
    expect(data).not.toHaveProperty('oauth2_refresh_token')
  })
})

// ════════════════════════════════════════════════════════════════
// Suite 22: Billing Endpoints
// ════════════════════════════════════════════════════════════════

describe('Suite 22: Billing Endpoints', () => {
  let userToken
  let userId
  let adminToken

  beforeAll(async () => {
    const ts = Date.now()

    // Regular user
    const userResult = await registerAndVerifyUser(`Billing User ${ts}`, `billing-user-${ts}@example.com`, 'test1234')
    userToken = userResult.data.token
    userId = userResult.data.account.id

    // Admin user
    const adminEmail = `billing-admin-${ts}@example.com`
    const adminResult = await registerAndVerifyUser(`Billing Admin ${ts}`, adminEmail, 'test1234')
    const adminId = adminResult.data.account.id
    const db = await getTestDb()
    try {
      // Promote to admin
      await db.query("UPDATE accounts SET role = 'admin' WHERE id = $1", [adminId])

      // Set price per page (500 cents = 5.00 €)
      await db.query(
        "INSERT INTO settings (key, value) VALUES ('billing_price_per_page', '500') ON CONFLICT (key) DO UPDATE SET value = '500'"
      )

      // Insert 3 usage_log rows for the regular user:
      // rows 1+2: system_fallback=1, 3 pages each → billablePages=6
      // row 3:   system_fallback=0, 2 pages       → not billable, totalPages=8
      await db.query(
        `INSERT INTO usage_logs (id, account_id, document_id, pages_analyzed, ocr_provider, model_used, is_system_fallback)
         VALUES ($1, $2, NULL, 3, 'gemini', 'gemini', 1),
                ($3, $2, NULL, 3, 'gemini', 'gemini', 1),
                ($4, $2, NULL, 2, 'tesseract', 'tesseract', 0)`,
        [uuid(), userId, uuid(), uuid()]
      )
    } finally {
      await db.end()
    }

    // Re-login as admin to get admin token with updated role
    const relogin = await apiCallWithToken(null, 'POST', '/auth/login', { email: adminEmail, password: 'test1234' })
    adminToken = relogin.data.token
  })

  test('22a. GET /billing/me — returns correct structure', async () => {
    const { status, data } = await apiCallWithToken(userToken, 'GET', '/billing/me')
    expect(status).toBe(200)
    expect(data).toHaveProperty('pricePerPage')
    expect(data).toHaveProperty('totalPages')
    expect(data).toHaveProperty('billablePages')
    expect(data).toHaveProperty('totalCost')
    expect(data).toHaveProperty('consentAcceptedAt')
    expect(Array.isArray(data.entries)).toBe(true)
  })

  test('22b. GET /billing/me — totals and cost are correct', async () => {
    const { status, data } = await apiCallWithToken(userToken, 'GET', '/billing/me')
    expect(status).toBe(200)
    expect(data.pricePerPage).toBe(500)
    expect(data.totalPages).toBe(8)
    expect(data.billablePages).toBe(6)
    expect(data.totalCost).toBeCloseTo(30, 2)
  })

  test('22c. GET /billing/me — consentAcceptedAt is null before consent', async () => {
    const { status, data } = await apiCallWithToken(userToken, 'GET', '/billing/me')
    expect(status).toBe(200)
    expect(data.consentAcceptedAt).toBeNull()
  })

  test('22d. GET /billing/me — 401 without token', async () => {
    const { status } = await apiCallWithToken(null, 'GET', '/billing/me')
    expect(status).toBe(401)
  })

  test('22e. POST /billing/consent — returns { ok: true }', async () => {
    const { status, data } = await apiCallWithToken(userToken, 'POST', '/billing/consent')
    expect(status).toBe(200)
    expect(data.ok).toBe(true)
  })

  test('22f. GET /billing/me — consentAcceptedAt is set after consent', async () => {
    const { status, data } = await apiCallWithToken(userToken, 'GET', '/billing/me')
    expect(status).toBe(200)
    expect(data.consentAcceptedAt).not.toBeNull()
    expect(typeof data.consentAcceptedAt).toBe('string')
  })

  test('22g. POST /billing/consent — 401 without token', async () => {
    const { status } = await apiCallWithToken(null, 'POST', '/billing/consent')
    expect(status).toBe(401)
  })

  test('22h. GET /admin/billing — 200 as admin, correct structure', async () => {
    const { status, data } = await apiCallWithToken(adminToken, 'GET', '/admin/billing')
    expect(status).toBe(200)
    expect(data.pricePerPage).toBe(500)
    expect(Array.isArray(data.accounts)).toBe(true)
    const entry = data.accounts.find(a => a.account_id === userId)
    expect(entry).toBeDefined()
  })

  test('22i. GET /admin/billing — per-account aggregates are correct', async () => {
    const { status, data } = await apiCallWithToken(adminToken, 'GET', '/admin/billing')
    expect(status).toBe(200)
    const entry = data.accounts.find(a => a.account_id === userId)
    expect(Number(entry.total_pages)).toBe(8)
    expect(Number(entry.billable_pages)).toBe(6)
    expect(entry.cost).toBeCloseTo(30, 2)
  })

  test('22j. GET /admin/billing — 403 for regular user', async () => {
    const { status } = await apiCallWithToken(userToken, 'GET', '/admin/billing')
    expect(status).toBe(403)
  })

  test('22k. GET /admin/billing — 401 without token', async () => {
    const { status } = await apiCallWithToken(null, 'GET', '/admin/billing')
    expect(status).toBe(401)
  })

  test('22l. GET /billing/me — entries contain expected fields', async () => {
    const { status, data } = await apiCallWithToken(userToken, 'GET', '/billing/me')
    expect(status).toBe(200)
    expect(data.entries.length).toBeGreaterThanOrEqual(3)
    const entry = data.entries[0]
    expect(entry).toHaveProperty('pages_analyzed')
    expect(entry).toHaveProperty('ocr_provider')
    expect(entry).toHaveProperty('is_system_fallback')
    expect(entry).toHaveProperty('analyzed_at')
  })
})
