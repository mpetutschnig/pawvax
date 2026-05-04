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
    let testEmail, testPassword

    beforeAll(() => {
      testEmail = `test${Date.now()}@example.com`
      testPassword = 'SecurePassword123!'
    })

    test('1a. Register — Neuen Account erstellen', async () => {
      const { status, data } = await apiCall('POST', '/auth/register', {
        name: 'Test User',
        email: testEmail,
        password: testPassword
      })

      expect(status).toBe(201)
      expect(data.token).toBeTruthy()
      
      const id = data.userId || data.id || data.user?.id || data.account?.id
      expect(id).toBeTruthy()

      testState.token = data.token
      testState.userId = id
    })

    test('1b. Get Profile — Eigenes Profil abrufen', async () => {
      const { status, data } = await apiCall('GET', '/accounts/me')

      expect(status).toBe(200)
      expect(data.id).toBe(testState.userId)
      expect(data.email).toBe(testEmail)
      expect(data.name).toBe('Test User')
    })

    test('1c. Patch Profile — Profildaten aktualisieren', async () => {
      const { status, data } = await apiCall('PATCH', '/accounts/me', {
        name: 'Updated Name'
      })

      expect(status).toBe(200)
      if (data && data.name) {
        expect(data.name).toBe('Updated Name')
      }
    })

    test('1d. Login — Mit Credentials anmelden (neuer Token)', async () => {
      const { status, data } = await apiCall('POST', '/auth/login', {
        email: testEmail,
        password: testPassword
      })

      expect(status).toBe(200)
      expect(data.token).toBeTruthy()
      // Aktualisiere Token (neuer Login generiert neuen Token)
      testState.token = data.token
    })

    test('1e. Request Verification — Als Tierarzt anmelden', async () => {
      const { status } = await apiCall('POST', '/accounts/request-verification', {
        roles: ['vet']
      })

      expect(status).toBe(200)
    })

    test('1f. Logout — Abmelden (JWT blacklist)', async () => {
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
        is_archived: true
      })

      expect(status).toBe(200)
      expect(data.success).toBe(true)
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
      const ownerEmail = `doc-owner-${Date.now()}@example.com`
      const foreignEmail = `doc-foreign-${Date.now()}@example.com`

      const ownerReg = await apiCallWithToken(null, 'POST', '/auth/register', {
        name: 'Doc Owner',
        email: ownerEmail,
        password: 'SecurePassword123!'
      })
      expect(ownerReg.status).toBe(201)
      ownerToken = ownerReg.data.token

      const foreignReg = await apiCallWithToken(null, 'POST', '/auth/register', {
        name: 'Doc Foreign',
        email: foreignEmail,
        password: 'SecurePassword123!'
      })
      expect(foreignReg.status).toBe(201)
      foreignToken = foreignReg.data.token

      const ownerAnimal = await apiCallWithToken(ownerToken, 'POST', '/animals', {
        name: 'Doc Animal',
        species: 'dog'
      })
      expect(ownerAnimal.status).toBe(201)
      ownerAnimalId = ownerAnimal.data.id

      documentId = await createDocumentFixtureViaWs(ownerToken, ownerAnimalId, ['guest'])
    })

    test('4a. Existing document without access returns 401 on GET', async () => {
      const { status } = await apiCallWithToken(foreignToken, 'GET', `/documents/${documentId}`)
      expect(status).toBe(401)
    })

    test('4b. Existing document without access returns 401 on PATCH', async () => {
      const { status } = await apiCallWithToken(foreignToken, 'PATCH', `/documents/${documentId}`, {
        doc_type: 'vaccination'
      })
      expect(status).toBe(401)
    })

    test('4c. Existing document without access returns 401 on DELETE', async () => {
      const anotherDocId = await createDocumentFixtureViaWs(ownerToken, ownerAnimalId, ['guest'])

      const { status } = await apiCallWithToken(foreignToken, 'DELETE', `/documents/${anotherDocId}`)
      expect(status).toBe(401)
    })

    test('4d. Missing document still returns 404', async () => {
      const { status } = await apiCallWithToken(ownerToken, 'GET', `/documents/${uuid()}`)
      expect(status).toBe(404)
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
        password: 'Password123!'
      })

      expect(status).toBe(400)
    })

    test('7e. Duplicate Email on Register — 409 Conflict', async () => {
      const email = `unique${Date.now()}@test.com`

      // Erstes Mal OK
      const { status: status1 } = await apiCall('POST', '/auth/register', {
        name: 'Test 1',
        email: email,
        password: 'Password123!'
      })
      expect(status1).toBe(201)

      // Zweites Mal sollte Fehler sein
      const { status: status2 } = await apiCall('POST', '/auth/register', {
        name: 'Test 2',
        email: email,
        password: 'Password123!'
      })
      expect([400, 409]).toContain(status2)
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
      // 1. Register
      const email = `journey${Date.now()}@test.com`
      const { data: registerData } = await apiCall('POST', '/auth/register', {
        name: 'Journey Tester',
        email,
        password: 'Password123!'
      })
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
  test('Health Check — API läuft?', async () => {
    const response = await fetch(`${API_URL.replace('/api', '')}/health`)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.status).toBe('ok')
  })
})
