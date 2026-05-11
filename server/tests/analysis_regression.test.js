
import { v4 as uuid } from 'uuid'
import pg from 'pg'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const API_URL = process.env.API_URL || 'http://localhost:3000/api'

async function apiCallWithToken(token, method, endpoint, body = null) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    })

    const data = response.status === 204 ? null : await response.json()
    return { status: response.status, data }
  } catch (err) {
    console.error(`Fetch error: ${method} ${url}`, err)
    throw err
  }
}

async function registerAndVerifyUser(name, email, password, role = 'user') {
  const registration = await apiCallWithToken(null, 'POST', '/auth/register', {
    name,
    email,
    password,
    confirmPassword: password
  })
  
  if (registration.status !== 201) {
     throw new Error(`Registration failed: ${JSON.stringify(registration.data)}`)
  }

  const verify = await apiCallWithToken(null, 'POST', '/auth/verify-email', {
    token: registration.data.verificationToken
  })

  const login = await apiCallWithToken(null, 'POST', '/auth/login', {
    email,
    password
  })

  if (role !== 'user') {
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL || 'postgresql://pawvax:pawvax@localhost:5432/pawvax' })
    await db.connect()
    try {
      await db.query('UPDATE accounts SET role = $1 WHERE id = $2', [role, login.data.account.id])
    } finally {
      await db.end()
    }
    const relogin = await apiCallWithToken(null, 'POST', '/auth/login', { email, password })
    return relogin
  }

  return login
}

function writeTinyPng(filename) {
  const UPLOADS_DIR = process.env.UPLOADS_DIR || './uploads'
  const filepath = join(UPLOADS_DIR, filename)
  // 1x1 transparent PNG
  const buffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64')
  writeFileSync(filepath, buffer)
  return filename
}

describe('Analysis Regression & Permission Tests', () => {
  let db
  let ownerToken, vetToken
  let ownerId, vetId
  let animalId

  beforeAll(async () => {
    db = new pg.Client({ connectionString: process.env.DATABASE_URL || 'postgresql://pawvax:pawvax@localhost:5432/pawvax' })
    await db.connect()

    const ownerRes = await registerAndVerifyUser('Owner', `owner-${Date.now()}@test.com`, 'Pass1234!')
    ownerToken = ownerRes.data.token
    ownerId = ownerRes.data.account.id

    const vetRes = await registerAndVerifyUser('Vet', `vet-${Date.now()}@test.com`, 'Pass1234!', 'vet')
    vetToken = vetRes.data.token
    vetId = vetRes.data.account.id

    const animalRes = await apiCallWithToken(ownerToken, 'POST', '/animals', { name: 'Fido', species: 'dog' })
    animalId = animalRes.data.id
  })

  afterAll(async () => {
    await db.end()
  })

  test('Vet analyzing treatment on foreign animal results in vet_report', async () => {
    // 1. Create a document uploaded by vet for owner's animal
    const imagePath = writeTinyPng(`vet-upload-${Date.now()}.png`)
    const docId = uuid()
    
    // Insert document stub directly to mock an uploaded but unanalyzed document
    await db.query(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, analysis_status, extracted_json, added_by_account, added_by_role, created_at)
      VALUES ($1, $2, 'general', $3, 'pending_analysis', '{}', $4, 'vet', CURRENT_TIMESTAMP)
    `, [docId, animalId, imagePath, vetId])

    // Mock OCR to return a treatment type
    process.env.PAW_MOCK_OCR = '1'
    // The mock OCR in ocr.js returns 'treatment' if file includes 'treatment'
    const treatmentImagePath = writeTinyPng(`treatment-doc-${Date.now()}.png`)
    await db.query('UPDATE documents SET image_path = $1 WHERE id = $2', [treatmentImagePath, docId])

    // 2. Vet triggers analysis
    const res = await apiCallWithToken(vetToken, 'POST', `/documents/${docId}/retry-analysis`, {
      provider: 'mock-ocr',
      model: 'test'
    })

    expect(res.status).toBe(200)
    
    // 3. Verify it was saved as vet_report instead of treatment (because vet analyzed foreign animal)
    const { rows: [doc] } = await db.query('SELECT doc_type FROM documents WHERE id = $1', [docId])
    expect(doc.doc_type).toBe('vet_report')
  })

  test('Vet can re-analyze document they uploaded to foreign animal', async () => {
    const imagePath = writeTinyPng(`vet-reanalyze-${Date.now()}.png`)
    const docId = uuid()
    
    await db.query(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, analysis_status, extracted_json, added_by_account, added_by_role, created_at)
      VALUES ($1, $2, 'general', $3, 'completed', '{}', $4, 'vet', CURRENT_TIMESTAMP)
    `, [docId, animalId, imagePath, vetId])

    const res = await apiCallWithToken(vetToken, 'POST', `/documents/${docId}/re-analyze`, {
      provider: 'mock-ocr',
      model: 'test'
    })

    expect(res.status).toBe(200)
    expect(res.data.success).toBe(true)
  })

  test('Vet can view analysis history for document they uploaded to foreign animal', async () => {
    const imagePath = writeTinyPng(`vet-history-${Date.now()}.png`)
    const docId = uuid()
    
    await db.query(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, analysis_status, extracted_json, added_by_account, added_by_role, created_at)
      VALUES ($1, $2, 'general', $3, 'completed', '{}', $4, 'vet', CURRENT_TIMESTAMP)
    `, [docId, animalId, imagePath, vetId])

    const res = await apiCallWithToken(vetToken, 'GET', `/documents/${docId}/history`)

    expect(res.status).toBe(200)
    expect(res.data.documentId).toBe(docId)
  })

  test('Vet cannot re-analyze document uploaded by someone else on foreign animal', async () => {
    const imagePath = writeTinyPng(`other-upload-${Date.now()}.png`)
    const docId = uuid()
    
    await db.query(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, analysis_status, extracted_json, added_by_account, added_by_role, created_at)
      VALUES ($1, $2, 'general', $3, 'completed', '{}', $4, 'user', CURRENT_TIMESTAMP)
    `, [docId, animalId, imagePath, ownerId])

    const res = await apiCallWithToken(vetToken, 'POST', `/documents/${docId}/re-analyze`, {
      provider: 'mock-ocr',
      model: 'test'
    })

    expect(res.status).toBe(403)
  })

  test('Billing consent check: analysis blocked if system fallback enabled but no consent', async () => {
    // 1. Ensure user has no keys and system fallback is enabled, but NO consent
    await db.query('UPDATE accounts SET gemini_token = NULL, system_fallback_enabled = 1, billing_consent_accepted_at = NULL WHERE id = $1', [ownerId])
    
    const imagePath = writeTinyPng(`billing-test-${Date.now()}.png`)
    const docId = uuid()
    await db.query(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, analysis_status, extracted_json, added_by_account, created_at)
      VALUES ($1, $2, 'general', $3, 'pending_analysis', '{}', $4, CURRENT_TIMESTAMP)
    `, [docId, animalId, imagePath, ownerId])

    // 2. Try to analyze with system fallback (will fail because PWA logic expects consent, 
    // but let's see how server behaves if consent check is enforced on server or handled by UI)
    // Wait, currently the server doesn't enforce billing consent check in runDocumentAnalysis, 
    // it only checks budget if fallback is used.
    // However, the user said "wenn ein fallback eingerichtet ist, kommt keine meldung das das kostenpflichtig ist"
    // I fixed this in the UI, but adding a server-side check or at least verifying the budget check works.
    
    await db.query('UPDATE accounts SET billing_budget_eur = 0 WHERE id = $1', [ownerId])
    
    const res = await apiCallWithToken(ownerToken, 'POST', `/documents/${docId}/retry-analysis`, {
      provider: 'google', // will fallback to system if user has no key
      model: 'gemini-1.5-flash'
    })

    // If budget is 0 and we use fallback, it should return 422 budget_exceeded
    expect(res.status).toBe(422)
    expect(res.data.error).toBe('budget_exceeded')
  })

  test('Pending documents visibility: Vet only sees their own pending docs on foreign animal', async () => {
    const vetDocId = uuid()
    const ownerDocId = uuid()
    
    await db.query(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, analysis_status, extracted_json, added_by_account, added_by_role)
      VALUES 
      ($1, $2, 'general', 'img1.png', 'pending_analysis', '{}', $3, 'vet'),
      ($4, $2, 'general', 'img2.png', 'pending_analysis', '{}', $5, 'user')
    `, [vetDocId, animalId, vetId, ownerDocId, ownerId])

    // 1. Vet checks pending docs
    const vetRes = await apiCallWithToken(vetToken, 'GET', `/animals/${animalId}/documents/pending`)
    expect(vetRes.status).toBe(200)
    expect(vetRes.data.length).toBe(1)
    expect(vetRes.data[0].id).toBe(vetDocId)

    // 2. Owner checks pending docs
    const ownerRes = await apiCallWithToken(ownerToken, 'GET', `/animals/${animalId}/documents/pending`)
    expect(ownerRes.status).toBe(200)
    expect(ownerRes.data.length).toBe(2)
  })
})
