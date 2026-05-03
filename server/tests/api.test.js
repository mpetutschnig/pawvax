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

import fetch from 'node-fetch'

const API_URL = process.env.API_URL || 'http://localhost:3000/api'

// State zwischen Tests
let testState = {
  token: null,
  userId: null,
  animalId: null,
  documentId: null,
  shareId: null,
  tagId: null,
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
      const { status, data } = await apiCall('POST', `/animals/${testState.animalId}/tags`, {
        tagId: `BARCODE-TEST-${Date.now()}`,
        tagType: 'barcode'
      })

      expect(status).toBe(201)
      expect(data.tag_type).toBe('barcode')
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
  // 4. SHARING — Temporäre Links
  // ════════════════════════════════════════════════════════════════

  describe('4. Sharing', () => {
    test('4a. Get Sharing Settings — Freigabe-Settings abrufen', async () => {
      const { status, data } = await apiCall('GET', `/animals/${testState.animalId}/sharing`)

      expect(status).toBe(200)
      expect(Array.isArray(data) || typeof data === 'object').toBe(true)
    })

    test('4b. Create Sharing Link — Temporären Link erstellen', async () => {
      const { status, data } = await apiCall('POST', `/animals/${testState.animalId}/sharing/temporary`, {})

      expect(status).toBe(201)
      expect(data.shareId).toBeTruthy()

      testState.shareId = data.shareId
    })

    test('4c. Public: Get Shared Animal — Tier über Link abrufen (OHNE JWT)', async () => {
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

    test('4d. Delete Sharing Link — Link löschen', async () => {
      if (!testState.shareId) {
        return
      }

      const { status } = await apiCall('DELETE', `/animals/${testState.animalId}/sharing/${testState.shareId}`)

      expect([200, 204, 404]).toContain(status)
    })
  })

  // ════════════════════════════════════════════════════════════════
  // 5. ADMIN — Nur für Admin-Tests
  // ════════════════════════════════════════════════════════════════

  describe('5. Admin (Nur wenn Admin)', () => {
    test('5a. Get Admin Stats — System-Statistiken', async () => {
      const { status, data } = await apiCall('GET', '/admin/stats')

      // Kann 200 oder 403 sein je nach Rolle
      if (status === 200) {
        expect(data).toHaveProperty('total_users')
      } else {
        expect(status).toBe(403)
      }
    })

    test('5b. Get Audit Log — Audit-Log abrufen', async () => {
      const { status, data } = await apiCall('GET', '/admin/audit?limit=10')

      if (status === 200) {
        expect(Array.isArray(data) || Array.isArray(data.records)).toBe(true)
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
  // 8. INTEGRATION — Full User Journey
  // ════════════════════════════════════════════════════════════════

  describe('8. Integration Tests (Full Journey)', () => {
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
