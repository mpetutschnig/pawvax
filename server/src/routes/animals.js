import { v4 as uuid } from 'uuid'
import { getDb } from '../db/index.js'
import { logAudit } from '../services/audit.js'
import { saveBase64Image, saveAvatarImage } from '../services/storage.js'

function normalizeRole(role) {
  return role === 'readonly' ? 'guest' : role
}

function parseAllowedRoles(rawRoles) {
  if (!rawRoles) return null
  try {
    const parsed = JSON.parse(rawRoles)
    if (!Array.isArray(parsed)) return null
    return parsed.map(normalizeRole)
  } catch {
    return null
  }
}

function canRoleSeeDocument(rawRoles, requestRole) {
  const roles = parseAllowedRoles(rawRoles)
  if (!roles) return true

  const normalizedRequestRole = normalizeRole(requestRole)
  if (roles.includes(normalizedRequestRole)) return true

  // Backward compatibility for not-yet-migrated rows.
  if (normalizedRequestRole === 'guest' && roles.includes('readonly')) return true

  return false
}

function getSharingForRole(db, animalId, requestRole) {
  const normalizedRequestRole = normalizeRole(requestRole)
  let sharing = db.prepare('SELECT * FROM animal_sharing WHERE animal_id = ? AND role = ?').get(animalId, normalizedRequestRole)

  // Backward compatibility for not-yet-migrated rows.
  if (!sharing && normalizedRequestRole === 'guest') {
    sharing = db.prepare('SELECT * FROM animal_sharing WHERE animal_id = ? AND role = ?').get(animalId, 'readonly')
  }

  return sharing
}

function getPublicSharingRole(db) {
  try {
    const animalSharingTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'animal_sharing'").get()?.sql || ''
    return animalSharingTableSql.includes("'guest'") ? 'guest' : 'readonly'
  } catch {
    return 'guest'
  }
}

function ensureDefaultSharing(db, animalId) {
  const publicRole = getPublicSharingRole(db)
  const defaults = [
    { role: publicRole, c: 0, b: 1, d: 1, a: 0, df: 0 },
    { role: 'authority', c: 1, b: 1, d: 1, a: 1, df: 1 },
    { role: 'vet', c: 1, b: 1, d: 1, a: 1, df: 1 },
  ]
  for (const d of defaults) {
    try {
      db.prepare(`INSERT INTO animal_sharing (id, animal_id, role, share_contact, share_breed, share_birthdate, share_address, share_dynamic_fields)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(uuid(), animalId, d.role, d.c, d.b, d.d, d.a, d.df)
    } catch { /* already exists */ }
  }
}

function applySharing(db, animal, requestRole, ownerName, ownerEmail, effectiveRoles = null) {
  const sharing = getSharingForRole(db, animal.id, requestRole)
  if (!sharing) return null

  const result = { id: animal.id, name: animal.name, species: animal.species, avatar_path: animal.avatar_path, account_id: animal.account_id }
  if (sharing.share_breed) result.breed = animal.breed
  if (sharing.share_birthdate) result.birthdate = animal.birthdate
  if (sharing.share_contact) result.contact = { name: ownerName, email: ownerEmail }
  if (sharing.share_address) result.address = animal.address
  if (sharing.share_dynamic_fields) result.dynamic_fields = animal.dynamic_fields

  const docs = db.prepare(`
    SELECT * FROM documents
    WHERE animal_id = ?
    ORDER BY created_at DESC
  `).all(animal.id)

  const docRoles = effectiveRoles || [requestRole]
  result.documents = docs.filter(d => docRoles.some(r => canRoleSeeDocument(d.allowed_roles, r)))

  for (const d of result.documents) {
    try { d.extracted_json = JSON.parse(d.extracted_json) } catch { d.extracted_json = {} }
    const pages = db.prepare('SELECT image_path FROM document_pages WHERE document_id = ? ORDER BY id ASC').all(d.id)
    d.pages = pages.map(p => p.image_path)
  }

  return result
}

function tryDecodeJwt(fastify, req) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null
    return fastify.jwt.verify(authHeader.slice(7))
  } catch {
    return null
  }
}

function getEffectiveRoles(decoded) {
  if (!decoded) return ['guest']
  const userRoles = (decoded.role || '').split(',').map(r => r.trim())
  if (userRoles.includes('vet')) return ['guest', 'vet']
  if (userRoles.includes('authority')) return ['guest', 'authority']
  return ['guest']
}

export default async function animalRoutes(fastify) {

  // ──── ÖFFENTLICHER Endpunkt (kein Login nötig) ────────────────────────────
  fastify.get('/api/public/tag/:tagId', async (req, reply) => {
    const db = getDb()
    const originalTagId = req.params.tagId
    let tagId = originalTagId

    // URL-Parsing falls jemand die volle URL scannt
    try {
      const url = new URL(tagId)
      const parts = url.pathname.split('/')
      tagId = parts[parts.length - 1]
    } catch { /* war keine URL */ }

    let row = db.prepare(`
      SELECT a.*, ac.name AS owner_name
      FROM animals a
      JOIN animal_tags t ON t.animal_id = a.id
      JOIN accounts ac ON ac.id = a.account_id
      WHERE t.tag_id = ? AND t.active = 1
    `).get(tagId)

    // Fallback: Falls nichts gefunden und tagId != originalTagId, ursprüngliche ID versuchen
    // Dies behebt Tags, die als volle URL gespeichert wurden
    if (!row && tagId !== originalTagId) {
      row = db.prepare(`
        SELECT a.*, ac.name AS owner_name
        FROM animals a
        JOIN animal_tags t ON t.animal_id = a.id
        JOIN accounts ac ON ac.id = a.account_id
        WHERE t.tag_id = ? AND t.active = 1
      `).get(originalTagId)
    }

    if (!row) return reply.code(404).send({ error: 'Tag nicht gefunden' })

    // Optional JWT für rollenbasierte Dokumentsichtbarkeit
    const decoded = tryDecodeJwt(fastify, req)
    const effectiveRoles = getEffectiveRoles(decoded)
    const primaryRole = effectiveRoles.includes('vet') ? 'vet' : effectiveRoles.includes('authority') ? 'authority' : 'guest'

    // Stelle sicher, dass default sharing existiert (für alte Tiere ohne Sharing-Zeile)
    ensureDefaultSharing(db, row.id)

    // Metadaten-Freigabe: beste Rolle verwenden (vet/authority sehen mehr), Fallback auf guest
    const publicRole = getPublicSharingRole(db)
    let sharing = getSharingForRole(db, row.id, primaryRole) || getSharingForRole(db, row.id, publicRole)

    // Wenn immer noch kein sharing existiert, create es jetzt
    if (!sharing) {
      try {
        db.prepare(`INSERT INTO animal_sharing (id, animal_id, role, share_contact, share_breed, share_birthdate, share_address, share_dynamic_fields)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(uuid(), row.id, publicRole, 0, 1, 1, 0, 0)
        sharing = getSharingForRole(db, row.id, publicRole)
      } catch { /* already exists */ }
    }

    const result = {
      id: row.id,
      name: row.name,
      species: row.species,
      avatar_path: row.avatar_path,
      is_public: !!sharing  // Flag ob öffentlich freigegeben
    }

    if (!sharing) return result  // Tier existiert, aber keine öffentlichen Daten

    if (sharing.share_breed) result.breed = row.breed
    if (sharing.share_birthdate) result.birthdate = row.birthdate
    if (sharing.share_contact) result.contact = { name: row.owner_name }
    if (sharing.share_address) result.address = row.address

    const docs = db.prepare(`
      SELECT * FROM documents
      WHERE animal_id = ?
      ORDER BY created_at DESC
    `).all(row.id)

    result.documents = docs.filter(d => effectiveRoles.some(r => canRoleSeeDocument(d.allowed_roles, r)))

    for (const d of result.documents) {
      try { d.extracted_json = JSON.parse(d.extracted_json) } catch { d.extracted_json = {} }
      const pages = db.prepare('SELECT image_path FROM document_pages WHERE document_id = ? ORDER BY id ASC').all(d.id)
      d.pages = pages.map(p => p.image_path)
    }

    return result
  })

  fastify.get('/api/public/share/:shareId', async (req, reply) => {
    const db = getDb()
    const { shareId } = req.params

    const share = db.prepare('SELECT * FROM animal_public_shares WHERE id = ?').get(shareId)
    if (!share) return reply.code(404).send({ error: 'Freigabe nicht gefunden' })

    if (share.expires_at < Math.floor(Date.now() / 1000)) {
      return reply.code(410).send({ error: 'Diese Freigabe ist abgelaufen' })
    }

    const animal = db.prepare(`
      SELECT a.*, ac.name AS owner_name, ac.email AS owner_email
      FROM animals a
      JOIN accounts ac ON a.account_id = ac.id
      WHERE a.id = ?
    `).get(share.animal_id)

    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    ensureDefaultSharing(db, animal.id)

    // Verify guest sharing exists, create if missing
    const publicRole = getPublicSharingRole(db)
    let guestSharing = db.prepare('SELECT * FROM animal_sharing WHERE animal_id = ? AND role = ?').get(animal.id, publicRole)
    if (!guestSharing) {
      db.prepare(`INSERT INTO animal_sharing (id, animal_id, role, share_contact, share_breed, share_birthdate, share_address, share_dynamic_fields)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(uuid(), animal.id, publicRole, 0, 1, 1, 0, 0)
    }

    // Optional JWT für rollenbasierte Dokumentsichtbarkeit
    const decoded = tryDecodeJwt(fastify, req)
    const effectiveRoles = getEffectiveRoles(decoded)
    const primaryRole = effectiveRoles.includes('vet') ? 'vet' : effectiveRoles.includes('authority') ? 'authority' : 'guest'

    return applySharing(db, animal, primaryRole, animal.owner_name, animal.owner_email, effectiveRoles)
  })

  // ──── Alle weiteren Routen erfordern Auth ─────────────────────────────────
  fastify.addHook('onRequest', async (req, reply) => {
    // Skip public routes
    if (req.url.startsWith('/api/public/')) return
    await fastify.authenticate(req, reply)
  })

  // Tier per Tag-ID suchen (inkl. Rollenfilter für Vets/Behörden)
  fastify.get('/api/animals/by-tag/:tagId', async (req, reply) => {
    const db = getDb()
    const originalTagId = req.params.tagId
    let tagId = originalTagId
    const { accountId, role, roles, verified } = req.user

    // Eigenes Tier?
    let ownRow = db.prepare(`
      SELECT a.* FROM animals a
      JOIN animal_tags t ON t.animal_id = a.id
      WHERE t.tag_id = ? AND t.active = 1 AND a.account_id = ?
    `).get(tagId, accountId)

    // Fallback: Falls nichts gefunden, als URL gespeicherte Version versuchen
    if (!ownRow) {
      ownRow = db.prepare(`
        SELECT a.* FROM animals a
        JOIN animal_tags t ON t.animal_id = a.id
        WHERE t.tag_id = ? AND t.active = 1 AND a.account_id = ?
      `).get(originalTagId, accountId)
    }

    if (ownRow) {
      ownRow.is_owner = true
      return ownRow
    }

    // Fremdes Tier — prüfe Rolle
    const userRoles = (role || '').split(',').map(r => r.trim())
    const requestRole = userRoles.includes('vet') ? 'vet' : userRoles.includes('authority') ? 'authority' : 'guest'

    let row = db.prepare(`
      SELECT a.*, ac.name AS owner_name, ac.email AS owner_email
      FROM animals a
      JOIN animal_tags t ON t.animal_id = a.id
      JOIN accounts ac ON ac.id = a.account_id
      WHERE t.tag_id = ? AND t.active = 1
    `).get(tagId)

    // Fallback: Falls nichts gefunden und als URL gespeichert sein könnte
    if (!row) {
      row = db.prepare(`
        SELECT a.*, ac.name AS owner_name, ac.email AS owner_email
        FROM animals a
        JOIN animal_tags t ON t.animal_id = a.id
        JOIN accounts ac ON ac.id = a.account_id
        WHERE t.tag_id = ? AND t.active = 1
      `).get(originalTagId)
    }

    if (!row) return reply.code(404).send({ error: 'Tag nicht gefunden' })

    let filtered = applySharing(db, row, requestRole, row.owner_name, row.owner_email)
    
    // Fallback auf public (guest) falls vet/authority keine speziellen Freigaben haben
    if (!filtered && requestRole !== 'guest') {
      filtered = applySharing(db, row, 'guest', row.owner_name, row.owner_email)
    }

    if (!filtered) return reply.code(403).send({ error: 'Kein Zugriff auf diese Tierdaten' })
    
    filtered.is_owner = false
    filtered.request_role = requestRole
    return filtered
  })

  // Neues Tier anlegen
  fastify.post('/api/animals', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'species'],
        properties: {
          name: { type: 'string', minLength: 1 },
          species: { type: 'string', enum: ['dog', 'cat', 'other'] },
          breed: { type: 'string' },
          birthdate: { type: 'string' },
          address: { type: 'string' },
          tagId: { type: 'string' },
          tagType: { type: 'string', enum: ['barcode', 'nfc'] }
        }
      }
    }
  }, async (req, reply) => {
    const db = getDb()
    const { name, species, breed, birthdate, address, tagId, tagType } = req.body
    const { accountId, role } = req.user
    const animalId = uuid()

    if (tagId) {
      const existingTag = db.prepare('SELECT animal_id FROM animal_tags WHERE tag_id = ?').get(tagId)
      if (existingTag) {
        return reply.code(409).send({ error: 'Tag bereits vergeben', conflict: { animalId: existingTag.animal_id } })
      }
    }

    const insert = db.transaction(() => {
      db.prepare('INSERT INTO animals (id, account_id, name, species, breed, birthdate, address) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(animalId, accountId, name, species, breed ?? null, birthdate ?? null, address ?? null)

      if (tagId && tagType) {
        db.prepare('INSERT INTO animal_tags (tag_id, animal_id, tag_type) VALUES (?, ?, ?)')
          .run(tagId, animalId, tagType)
      }

      ensureDefaultSharing(db, animalId)
    })

    insert()
    logAudit(db, { accountId, role, action: 'create_animal', resource: 'animal', resourceId: animalId, ip: req.ip })

    const animal = db.prepare('SELECT * FROM animals WHERE id = ?').get(animalId)
    return reply.code(201).send(animal)
  })

  // Tierprofil
  fastify.get('/api/animals/:id', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId, role, roles, verified } = req.user

    const animal = db.prepare(`
      SELECT a.*, ac.name AS owner_name, ac.email AS owner_email 
      FROM animals a
      JOIN accounts ac ON a.account_id = ac.id
      WHERE a.id = ?
    `).get(id)

    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    if (animal.account_id === accountId) {
      animal.is_owner = true
      return animal
    }

    const userRoles = (role || '').split(',').map(r => r.trim())
    const requestRole = userRoles.includes('vet') ? 'vet' : userRoles.includes('authority') ? 'authority' : 'guest'
    let filtered = applySharing(db, animal, requestRole, animal.owner_name, animal.owner_email)
    if (!filtered && requestRole !== 'guest') filtered = applySharing(db, animal, 'guest', animal.owner_name, animal.owner_email)
    if (!filtered) return reply.code(403).send({ error: 'Kein Zugriff auf diese Tierdaten' })
    filtered.is_owner = false
    filtered.request_role = requestRole
    delete filtered.documents // Dokumente werden separat über /documents geladen
    return filtered
  })

  // Tier-Daten ändern
  fastify.patch('/api/animals/:id', {
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          species: { type: 'string', enum: ['dog', 'cat', 'other'] },
          breed: { type: 'string' },
          birthdate: { type: 'string' },
          address: { type: 'string' },
          dynamic_fields: { type: 'string' }, // JSON string
          avatar_base64: { type: 'string' }
        }
      }
    }
  }, async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId, role } = req.user

    const animal = db.prepare('SELECT * FROM animals WHERE id = ? AND account_id = ?').get(id, accountId)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    if (animal.is_archived) return reply.code(403).send({ error: 'Archivierte Tiere können nicht bearbeitet werden.' })

    const updated = { ...animal, ...req.body }
    let avatarPath = animal.avatar_path

    if (req.body.avatar_base64) {
      const ext = req.body.avatar_base64.substring(0, 20).includes('png') ? 'png' : 'jpg'
      const filename = `${uuid()}_avatar.${ext}`
      avatarPath = saveBase64Image(filename, req.body.avatar_base64)
    }

    db.prepare('UPDATE animals SET name=?, species=?, breed=?, birthdate=?, address=?, dynamic_fields=?, avatar_path=? WHERE id=?')
      .run(updated.name, updated.species, updated.breed, updated.birthdate, updated.address, updated.dynamic_fields ?? animal.dynamic_fields, avatarPath, id)

    logAudit(db, { accountId, role, action: 'update_animal', resource: 'animal', resourceId: id,
      details: { before: animal, after: updated }, ip: req.ip })

    return db.prepare('SELECT * FROM animals WHERE id = ?').get(id)
  })

  // Tier archivieren / de-archivieren (togglebar)
  fastify.patch('/api/animals/:id/archive', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId, role } = req.user
    const { is_archived } = req.body || {}

    const animal = db.prepare('SELECT id, is_archived FROM animals WHERE id = ? AND account_id = ?').get(id, accountId)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden oder keine Berechtigung' })

    // Toggle: wenn is_archived undefined, toggle; sonst setze auf den Wert
    const newState = is_archived !== undefined ? is_archived : !animal.is_archived
    db.prepare('UPDATE animals SET is_archived = ? WHERE id = ?').run(newState ? 1 : 0, id)

    const action = newState ? 'archive_animal' : 'unarchive_animal'
    logAudit(db, { accountId, role, action, resource: 'animal', resourceId: id, ip: req.ip })

    return { success: true }
  })

  // Tier löschen (mit Sicherheitsbestätigung)
  fastify.delete('/api/animals/:id', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId, role } = req.user
    const { confirmationText } = req.body || {}

    const animal = db.prepare('SELECT * FROM animals WHERE id = ? AND account_id = ?').get(id, accountId)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    // Sicherheitsabfrage: Namen oder Geburtsdatum muss eingegeben werden
    const nameMatches = confirmationText && confirmationText.toLowerCase() === animal.name.toLowerCase()
    const birthdateMatches = confirmationText && confirmationText === animal.birthdate

    if (!nameMatches && !birthdateMatches) {
      return reply.code(400).send({ error: 'Sicherheitsbestätigung erforderlich: Gib den Namen oder das Geburtsdatum des Tieres ein' })
    }

    db.prepare('DELETE FROM document_pages WHERE document_id IN (SELECT id FROM documents WHERE animal_id = ?)').run(id)
    db.prepare('DELETE FROM documents WHERE animal_id = ?').run(id)
    db.prepare('DELETE FROM animal_tags WHERE animal_id = ?').run(id)
    db.prepare('DELETE FROM animal_sharing WHERE animal_id = ?').run(id)
    db.prepare('DELETE FROM animal_public_shares WHERE animal_id = ?').run(id)
    db.prepare('DELETE FROM animals WHERE id = ?').run(id)

    logAudit(db, { accountId, role, action: 'delete_animal', resource: 'animal', resourceId: id,
      details: animal, ip: req.ip })

    return reply.code(204).send()
  })

  // Alle Tiere des Kontos
  fastify.get('/api/animals', async (req) => {
    const db = getDb()
    return db.prepare('SELECT * FROM animals WHERE account_id = ? ORDER BY is_archived ASC, name ASC').all(req.user.accountId)
  })

  // Dokumentliste eines Tieres (mit Rollenfilter)
  fastify.get('/api/animals/:id/documents', async (req, reply) => {
    const db = getDb()
    const { accountId, role, roles, verified } = req.user
    const { id } = req.params

    const animal = db.prepare('SELECT * FROM animals WHERE id = ?').get(id)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    const parseDocs = (docs) => docs.map(d => {
      try { d.extracted_json = JSON.parse(d.extracted_json) } catch { d.extracted_json = {} }
      return d
    })

    // Eigentümer: voller Zugriff
    if (animal.account_id === accountId) {
      return parseDocs(db.prepare('SELECT * FROM documents WHERE animal_id = ? ORDER BY created_at DESC').all(id))
    }

    // Rollenbasiert für Vet/Behörde
    const userRoles = (role || '').split(',').map(r => r.trim())
    const requestRole = userRoles.includes('vet') ? 'vet' : userRoles.includes('authority') ? 'authority' : 'guest'

    let sharing = getSharingForRole(db, id, requestRole)
    if (!sharing && requestRole !== 'guest') sharing = getSharingForRole(db, id, 'guest')

    if (!sharing) return []

    const docs = db.prepare('SELECT * FROM documents WHERE animal_id = ? ORDER BY created_at DESC').all(id)

    return parseDocs(docs.filter(d => {
      return canRoleSeeDocument(d.allowed_roles, requestRole)
    }))
  })

  // Tag-Liste eines Tieres
  fastify.get('/api/animals/:id/tags', async (req, reply) => {
    const db = getDb()
    const animal = db.prepare('SELECT id FROM animals WHERE id = ?')
      .get(req.params.id)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    return db.prepare('SELECT * FROM animal_tags WHERE animal_id = ? ORDER BY added_at DESC')
      .all(req.params.id)
  })

  // Neuen Tag zuordnen
  fastify.post('/api/animals/:id/tags', {
    schema: {
      body: {
        type: 'object',
        required: ['tagId', 'tagType'],
        properties: {
          tagId: { type: 'string', minLength: 1 },
          tagType: { type: 'string', enum: ['barcode', 'nfc'] }
        }
      }
    }
  }, async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { tagId, tagType } = req.body
    const { accountId, role } = req.user

    const userRoles = (role || '').split(',').map(r => r.trim())
    const isVet = userRoles.includes('vet')

    const animal = db.prepare('SELECT id, account_id, is_archived FROM animals WHERE id = ?').get(id)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })
    if (animal.is_archived) return reply.code(403).send({ error: 'Tags können nicht zu archivierten Tieren hinzugefügt werden.' })

    if (animal.account_id !== accountId) {
      // Zero-Trust: Live-Check der DB, nicht nur des JWT
      const liveUser = db.prepare('SELECT role, verified FROM accounts WHERE id = ?').get(accountId)
      const liveRoles = (liveUser.role || '').split(',').map(r => r.trim())
      if (!liveRoles.includes('vet') || !liveUser.verified) {
        return reply.code(403).send({ error: 'Nur verifizierte Tierärzte dürfen Tags zu fremden Tieren hinzufügen.' })
      }
    }

    const existing = db.prepare('SELECT animal_id FROM animal_tags WHERE tag_id = ?').get(tagId)
    if (existing) {
      return reply.code(409).send({ error: 'Tag bereits vergeben', conflict: { animalId: existing.animal_id } })
    }

    db.prepare('INSERT INTO animal_tags (tag_id, animal_id, tag_type) VALUES (?, ?, ?)')
      .run(tagId, id, tagType)

    logAudit(db, { accountId, role, action: 'add_tag', resource: 'tag', resourceId: tagId, ip: req.ip })

    return reply.code(201).send(db.prepare('SELECT * FROM animal_tags WHERE tag_id = ?').get(tagId))
  })

  // Tag deaktivieren
  fastify.patch('/api/animal-tags/:tagId', async (req, reply) => {
    const db = getDb()
    const { tagId } = req.params
    const { accountId, role } = req.user

    const userRoles = (role || '').split(',').map(r => r.trim())
    const isVet = userRoles.includes('vet')

    const row = db.prepare(`
      SELECT t.tag_id, a.account_id FROM animal_tags t
      JOIN animals a ON a.id = t.animal_id
      WHERE t.tag_id = ?
    `).get(tagId)

    if (!row) return reply.code(404).send({ error: 'Tag nicht gefunden' })
    if (row.account_id !== accountId && !isVet) {
      return reply.code(403).send({ error: 'Keine Berechtigung' })
    }

    const { active } = req.body ?? {}
    db.prepare('UPDATE animal_tags SET active = ? WHERE tag_id = ?')
      .run(active === true ? 1 : 0, tagId)

    logAudit(db, { accountId, role, action: active ? 'activate_tag' : 'deactivate_tag', resource: 'tag', resourceId: tagId, ip: req.ip })

    return db.prepare('SELECT * FROM animal_tags WHERE tag_id = ?').get(tagId)
  })

  // Freigabe-Einstellungen lesen
  fastify.get('/api/animals/:id/sharing', async (req, reply) => {
    const db = getDb()
    const animal = db.prepare('SELECT id FROM animals WHERE id = ? AND account_id = ?')
      .get(req.params.id, req.user.accountId)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    ensureDefaultSharing(db, req.params.id)
    const sharingRows = db.prepare('SELECT * FROM animal_sharing WHERE animal_id = ? ORDER BY role').all(req.params.id)
    return sharingRows.map(row => ({ ...row, role: normalizeRole(row.role) }))
  })

  // Freigabe-Einstellungen setzen (UPSERT per Rolle)
  fastify.put('/api/animals/:id/sharing', {
    schema: {
      body: {
        type: 'object',
        required: ['role'],
        properties: {
          role: { type: 'string', enum: ['guest', 'readonly', 'authority', 'vet'] },
          share_contact: { type: 'integer' },
          share_breed: { type: 'integer' },
          share_birthdate: { type: 'integer' },
          share_address: { type: 'integer' },
          share_dynamic_fields: { type: 'integer' }
        }
      }
    }
  }, async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId, role: userRole } = req.user

    const animal = db.prepare('SELECT id FROM animals WHERE id = ? AND account_id = ?').get(id, accountId)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    const { role, share_contact, share_breed, share_birthdate, share_address, share_dynamic_fields } = req.body
    const targetRole = normalizeRole(role)

    const existing = db.prepare('SELECT * FROM animal_sharing WHERE animal_id = ? AND role = ?').get(id, targetRole)

    if (existing) {
      const merged = {
        c: share_contact ?? existing.share_contact,
        b: share_breed ?? existing.share_breed,
        d: share_birthdate ?? existing.share_birthdate,
        a: share_address ?? existing.share_address,
        df: share_dynamic_fields ?? existing.share_dynamic_fields,
      }
      db.prepare(`UPDATE animal_sharing SET share_contact=?, share_breed=?, share_birthdate=?, share_address=?, share_dynamic_fields=?
                  WHERE animal_id=? AND role=?`)
        .run(merged.c, merged.b, merged.d, merged.a, merged.df, id, targetRole)
    } else {
      db.prepare(`INSERT INTO animal_sharing (id, animal_id, role, share_contact, share_breed, share_birthdate, share_address, share_dynamic_fields)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(uuid(), id, targetRole,
          share_contact ?? 0, share_breed ?? 1, share_birthdate ?? 1, share_address ?? 0, share_dynamic_fields ?? 0)
    }

    logAudit(db, { accountId, role: userRole, action: 'update_sharing', resource: 'sharing', resourceId: id,
      details: req.body, ip: req.ip })

    const updatedRow = db.prepare('SELECT * FROM animal_sharing WHERE animal_id = ? AND role = ?').get(id, targetRole)
    return updatedRow ? { ...updatedRow, role: normalizeRole(updatedRow.role) } : updatedRow
  })

  // Temporären Share-Link erzeugen
  fastify.post('/api/animals/:id/sharing/temporary', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId, role } = req.user

    const animal = db.prepare('SELECT id FROM animals WHERE id = ? AND account_id = ?').get(id, accountId)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden oder keine Berechtigung' })

    const shareId = uuid()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 14) // 14 Tage gültig

    db.prepare('INSERT INTO animal_public_shares (id, animal_id, expires_at) VALUES (?, ?, ?)')
      .run(shareId, id, Math.floor(expiresAt.getTime() / 1000))

    logAudit(db, { accountId, role, action: 'create_temp_share', resource: 'sharing', resourceId: id, ip: req.ip })

    return reply.code(201).send({ shareId })
  })

  // Temporären Transfer-Code erzeugen (Besitzerwechsel)
  fastify.post('/api/animals/:id/transfer', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId, role } = req.user

    const animal = db.prepare('SELECT id FROM animals WHERE id = ? AND account_id = ?').get(id, accountId)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden oder keine Berechtigung' })

    db.prepare('DELETE FROM animal_transfers WHERE animal_id = ?').run(id)

    const code = Math.random().toString().substring(2, 8) // 6 Ziffern
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24) // 24 Stunden gültig

    db.prepare('INSERT INTO animal_transfers (code, animal_id, expires_at) VALUES (?, ?, ?)').run(code, id, expiresAt.toISOString())
    logAudit(db, { accountId, role, action: 'create_transfer_code', resource: 'animal', resourceId: id, ip: req.ip })

    return reply.code(201).send({ code })
  })

  // Tier per Transfer-Code übernehmen
  fastify.post('/api/animals/transfer/accept', {
    schema: { body: { type: 'object', required: ['code'], properties: { code: { type: 'string' } } } }
  }, async (req, reply) => {
    const db = getDb()
    const { code } = req.body
    const { accountId, role } = req.user

    const transfer = db.prepare('SELECT * FROM animal_transfers WHERE code = ?').get(code)
    if (!transfer) return reply.code(404).send({ error: 'Ungültiger oder abgelaufener Code' })
    if (new Date(transfer.expires_at) < new Date()) {
      db.prepare('DELETE FROM animal_transfers WHERE code = ?').run(code)
      return reply.code(400).send({ error: 'Dieser Code ist abgelaufen' })
    }

    db.prepare('UPDATE animals SET account_id = ? WHERE id = ?').run(accountId, transfer.animal_id)
    db.prepare('DELETE FROM animal_transfers WHERE animal_id = ?').run(transfer.animal_id)
    logAudit(db, { accountId, role, action: 'accept_transfer', resource: 'animal', resourceId: transfer.animal_id, ip: req.ip })
    return { success: true, animalId: transfer.animal_id }
  })

  // Upload animal avatar
  fastify.patch('/api/animals/:id/avatar', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { base64Image, image } = req.body
    const imageData = base64Image || image
    const { accountId, role } = req.user

    const animal = db.prepare('SELECT * FROM animals WHERE id = ? AND account_id = ?').get(id, accountId)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    if (animal.is_archived) return reply.code(403).send({ error: 'Avatar kann für archivierte Tiere nicht geändert werden.' })

    if (!imageData) return reply.code(400).send({ error: 'Base64 Image erforderlich' })

    try {
      const filename = `avatar_${id}_${Date.now()}.webp`
      const filepath = await saveAvatarImage(filename, imageData)

      db.prepare('UPDATE animals SET avatar_path = ? WHERE id = ?').run(filepath, id)

      logAudit(db, {
        accountId, role, action: 'upload_avatar', resource: 'animal', resourceId: id,
        ip: req.ip
      })

      return { avatar_path: filepath }
    } catch (err) {
      req.log.error({ err }, 'Avatar upload failed')
      return reply.code(500).send({ error: 'Fehler beim Speichern des Avatars' })
    }
  })
}
