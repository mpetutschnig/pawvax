
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
     throw new Error(`Registration failed for ${email}: ${JSON.stringify(registration.data)}`)
  }

  await apiCallWithToken(null, 'POST', '/auth/verify-email', {
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
    // Re-login to get token with new role
    return await apiCallWithToken(null, 'POST', '/auth/login', { email, password })
  }

  return login
}

function writeTinyPng(filename) {
  const UPLOADS_DIR = process.env.UPLOADS_DIR || join(process.cwd(), 'uploads')
  const filepath = join(UPLOADS_DIR, filename)
  const buffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64')
  writeFileSync(filepath, buffer)
  return filename
}

describe('Analysis Regression & Permission Tests', () => {
  let db
  let ownerToken, vetToken
  let ownerId, vetId

  beforeAll(async () => {
    db = new pg.Client({ connectionString: process.env.DATABASE_URL || 'postgresql://pawvax:pawvax@localhost:5432/pawvax' })
    await db.connect()

    const salt = Math.random().toString(36).substring(7)
    const ownerRes = await registerAndVerifyUser(`Owner-${salt}`, `owner-${salt}@test.com`, 'Pass1234!')
    ownerToken = ownerRes.data.token
    ownerId = ownerRes.data.account.id

    const vetRes = await registerAndVerifyUser(`Vet-${salt}`, `vet-${salt}@test.com`, 'Pass1234!', 'vet')
    vetToken = vetRes.data.token
    vetId = vetRes.data.account.id
    
    console.log(`[Diagnostic] ownerId: ${ownerId}, vetId: ${vetId}`)
  })

  afterAll(async () => {
    await db.end()
  })

  async function createTestAnimal(token, name = 'Fido') {
    const salt = Math.random().toString(36).substring(7)
    const res = await apiCallWithToken(token, 'POST', '/animals', { name: `${name}-${salt}`, species: 'dog' })
    return res.data.id
  }

  test('Diagnostic: isAllowedModel check', async () => {
     const res = await apiCallWithToken(ownerToken, 'GET', '/ai/models')
     expect(res.status).toBe(200)
     // Diagnostic check - if gemini-1.5-flash is not allowed, it will fail analysis tests
  })

  test('Vet analyzing treatment on foreign animal results in vet_report', async () => {
    const animalId = await createTestAnimal(ownerToken)
    const imagePath = writeTinyPng(`vet-upload-${Date.now()}.png`)
    const docId = uuid()
    
    await db.query(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, analysis_status, extracted_json, added_by_account, added_by_role, created_at)
      VALUES ($1, $2, 'general', $3, 'pending_analysis', '{}', $4, 'vet', CURRENT_TIMESTAMP)
    `, [docId, animalId, imagePath, vetId])

    process.env.PAW_MOCK_OCR = '1'
    const treatmentImagePath = writeTinyPng(`treatment-doc-${Date.now()}.png`)
    await db.query('UPDATE documents SET image_path = $1 WHERE id = $2', [treatmentImagePath, docId])

    const res = await apiCallWithToken(vetToken, 'POST', `/documents/${docId}/retry-analysis`, {
      provider: 'google',
      model: 'gemini-1.5-flash'
    })

    if (res.status !== 200) {
      console.error(`[Diagnostic] retry-analysis failed: ${JSON.stringify(res.data)}`)
    }
    expect(res.status).toBe(200)
    
    const { rows: [doc] } = await db.query('SELECT doc_type FROM documents WHERE id = $1', [docId])
    expect(doc.doc_type).toBe('vet_report')
  })

  test('Vet can re-analyze document they uploaded to foreign animal', async () => {
    const animalId = await createTestAnimal(ownerToken)
    const imagePath = writeTinyPng(`vet-reanalyze-${Date.now()}.png`)
    const docId = uuid()
    
    await db.query(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, analysis_status, extracted_json, added_by_account, added_by_role, created_at)
      VALUES ($1, $2, 'general', $3, 'completed', '{}', $4, 'vet', CURRENT_TIMESTAMP)
    `, [docId, animalId, imagePath, vetId])

    const res = await apiCallWithToken(vetToken, 'POST', `/documents/${docId}/re-analyze`, {
      provider: 'google',
      model: 'gemini-1.5-flash'
    })

    if (res.status !== 200) {
      console.error(`[Diagnostic] re-analyze failed: ${JSON.stringify(res.data)}`)
    }
    expect(res.status).toBe(200)
    expect(res.data.success).toBe(true)
  })

  test('Vet can view analysis history for document they uploaded to foreign animal', async () => {
    const animalId = await createTestAnimal(ownerToken)
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
    const animalId = await createTestAnimal(ownerToken)
    const imagePath = writeTinyPng(`other-upload-${Date.now()}.png`)
    const docId = uuid()
    
    await db.query(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, analysis_status, extracted_json, added_by_account, added_by_role, created_at)
      VALUES ($1, $2, 'general', $3, 'completed', '{}', $4, 'user', CURRENT_TIMESTAMP)
    `, [docId, animalId, imagePath, ownerId])

    const res = await apiCallWithToken(vetToken, 'POST', `/documents/${docId}/re-analyze`, {
      provider: 'google',
      model: 'gemini-1.5-flash'
    })

    expect(res.status).toBe(403)
  })

  test('Billing consent check: analysis blocked if system fallback enabled but no consent', async () => {
    const animalId = await createTestAnimal(ownerToken)
    await db.query('UPDATE accounts SET gemini_token = NULL, system_fallback_enabled = 1, billing_consent_accepted_at = NULL WHERE id = $1', [ownerId])
    
    const imagePath = writeTinyPng(`billing-test-${Date.now()}.png`)
    const docId = uuid()
    await db.query(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, analysis_status, extracted_json, added_by_account, created_at)
      VALUES ($1, $2, 'general', $3, 'pending_analysis', '{}', $4, CURRENT_TIMESTAMP)
    `, [docId, animalId, imagePath, ownerId])

    await db.query('UPDATE accounts SET billing_budget_eur = 0 WHERE id = $1', [ownerId])
    await db.query("INSERT INTO settings (key, value) VALUES ('billing_price_per_page', '50') ON CONFLICT (key) DO UPDATE SET value = '50'")
    
    const res = await apiCallWithToken(ownerToken, 'POST', `/documents/${docId}/retry-analysis`, {
      provider: 'google',
      model: 'gemini-1.5-flash'
    })

    expect(res.status).toBe(422)
    expect(res.data.error).toBe('budget_exceeded')
  })

  test('Pending documents visibility: Vet only sees their own pending docs on foreign animal', async () => {
    const animalId = await createTestAnimal(ownerToken)
    const vetDocId = uuid()
    const ownerDocId = uuid()
    
    await db.query(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, analysis_status, extracted_json, added_by_account, added_by_role)
      VALUES 
      ($1, $2, 'general', 'img1.png', 'pending_analysis', '{}', $3, 'vet'),
      ($4, $2, 'general', 'img2.png', 'pending_analysis', '{}', $5, 'user')
    `, [vetDocId, animalId, vetId, ownerDocId, ownerId])

    const vetRes = await apiCallWithToken(vetToken, 'GET', `/animals/${animalId}/documents/pending`)
    if (vetRes.data.length !== 1) {
       console.error(`[Diagnostic] visibility test failed. docs: ${JSON.stringify(vetRes.data)}`)
       console.error(`[Diagnostic] vetId: ${vetId}, animal owner: ${ownerId}`)
    }
    expect(vetRes.status).toBe(200)
    expect(vetRes.data.length).toBe(1)
    expect(vetRes.data[0].id).toBe(vetDocId)

    const ownerRes = await apiCallWithToken(ownerToken, 'GET', `/animals/${animalId}/documents/pending`)
    expect(ownerRes.status).toBe(200)
    expect(ownerRes.data.length).toBe(2)
  })
})
