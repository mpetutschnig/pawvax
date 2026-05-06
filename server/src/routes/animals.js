import { v4 as uuid } from 'uuid'
import { getDb } from '../db/index.js'
import { logAudit } from '../services/audit.js'
import { saveBase64Image, saveAvatarImage } from '../services/storage.js'

function normalizeRole(role) {
  return role === 'readonly' ? 'guest' : role
}

function buildShareLinkName(inputName, shareId) {
  const base = typeof inputName === 'string'
    ? inputName.trim().replace(/\s+/g, ' ').slice(0, 80)
    : ''
  const prefix = base || 'Link'
  return `${prefix} - ${shareId.slice(0, 8)}`
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
  if (!rawRoles) return true
  const roles = parseAllowedRoles(rawRoles)
  if (!roles) return false

  const normalizedRequestRole = normalizeRole(requestRole)
  if (roles.includes(normalizedRequestRole)) return true

  // Backward compatibility for not-yet-migrated rows.
  if (normalizedRequestRole === 'guest' && roles.includes('readonly')) return true

  return false
}

async function getSharingForRole(db, animalId, requestRole) {
  const normalizedRequestRole = normalizeRole(requestRole)
  const { rows: [sharing] } = await db.query('SELECT * FROM animal_sharing WHERE animal_id = $1 AND role = $2', [animalId, normalizedRequestRole])

  // Backward compatibility for not-yet-migrated rows.
  if (!sharing && normalizedRequestRole === 'guest') {
    const { rows: [fallback] } = await db.query('SELECT * FROM animal_sharing WHERE animal_id = $1 AND role = $2', [animalId, 'readonly'])
    return fallback
  }

  return sharing
}

function getPublicSharingRole() {
  return 'guest'
}

async function ensureDefaultSharing(db, animalId, logger = null) {
  const publicRole = getPublicSharingRole()
  const defaults = [
    { role: publicRole, c: 0, b: 1, d: 1, a: 0, df: 0 },
    { role: 'authority', c: 1, b: 1, d: 1, a: 1, df: 1 },
    { role: 'vet', c: 1, b: 1, d: 1, a: 1, df: 1 },
  ]
  for (const d of defaults) {
    try {
      await db.query(`INSERT INTO animal_sharing (id, animal_id, role, share_contact, share_breed, share_birthdate, share_address, share_dynamic_fields)
                  VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
        [uuid(), animalId, d.role, d.c, d.b, d.d, d.a, d.df])
    } catch (err) {
      logger?.warn({ err: err?.message, animalId, role: d.role }, 'ensureDefaultSharing failed')
    }
  }
}

async function applySharing(db, animal, requestRole, ownerName, ownerEmail, effectiveRoles = null) {
  const sharing = await getSharingForRole(db, animal.id, requestRole)
  if (!sharing) return null

  const result = { id: animal.id, name: animal.name, species: animal.species, avatar_path: animal.avatar_path, account_id: animal.account_id }
  if (sharing.share_breed) result.breed = animal.breed
  if (sharing.share_birthdate) result.birthdate = animal.birthdate
  if (sharing.share_contact) result.contact = { name: ownerName, email: ownerEmail }
  if (sharing.share_address) result.address = animal.address
  if (sharing.share_dynamic_fields) result.dynamic_fields = animal.dynamic_fields

  const { rows: docs } = await db.query(`
    SELECT d.*, uploader.name AS added_by_name, uploader.verified AS added_by_verified
    FROM documents d
    LEFT JOIN accounts uploader ON uploader.id = d.added_by_account
    WHERE d.animal_id = $1
    ORDER BY d.created_at DESC
  `, [animal.id])

  const docRoles = effectiveRoles || [requestRole]
  result.documents = docs.filter(d => docRoles.some(r => canRoleSeeDocument(d.allowed_roles, r)))

  for (const d of result.documents) {
    try { d.extracted_json = JSON.parse(d.extracted_json) } catch { d.extracted_json = {} }
    try { d.record_permissions = d.record_permissions ? JSON.parse(d.record_permissions) : {} } catch { d.record_permissions = {} }
    const { rows: pages } = await db.query('SELECT image_path FROM document_pages WHERE document_id = $1 ORDER BY id ASC', [d.id])
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

    let { rows: [row] } = await db.query(`
      SELECT a.*, ac.name AS owner_name
      FROM animals a
      JOIN animal_tags t ON t.animal_id = a.id
      JOIN accounts ac ON ac.id = a.account_id
      WHERE t.tag_id = $1 AND t.active = 1
    `, [tagId])

    // Fallback: Falls nichts gefunden und tagId != originalTagId, ursprüngliche ID versuchen
    // Dies behebt Tags, die als volle URL gespeichert wurden
    if (!row && tagId !== originalTagId) {
      ({ rows: [row] } = await db.query(`
        SELECT a.*, ac.name AS owner_name
        FROM animals a
        JOIN animal_tags t ON t.animal_id = a.id
        JOIN accounts ac ON ac.id = a.account_id
        WHERE t.tag_id = $1 AND t.active = 1
      `, [originalTagId]))
    }

    if (!row) return reply.code(404).send({ error: 'Tag nicht gefunden' })

    // Optional JWT für rollenbasierte Dokumentsichtbarkeit
    const decoded = tryDecodeJwt(fastify, req)
    const effectiveRoles = getEffectiveRoles(decoded)
    const primaryRole = effectiveRoles.includes('vet') ? 'vet' : effectiveRoles.includes('authority') ? 'authority' : 'guest'

    // Stelle sicher, dass default sharing existiert (für alte Tiere ohne Sharing-Zeile)
    await ensureDefaultSharing(db, row.id, fastify.log)

    // Metadaten-Freigabe: beste Rolle verwenden (vet/authority sehen mehr), Fallback auf guest
    const publicRole = getPublicSharingRole()
    let sharing = await getSharingForRole(db, row.id, primaryRole) || await getSharingForRole(db, row.id, publicRole)

    // Retry once if sharing rows are unexpectedly missing
    if (!sharing) {
      await ensureDefaultSharing(db, row.id, fastify.log)
      sharing = await getSharingForRole(db, row.id, primaryRole) || await getSharingForRole(db, row.id, publicRole)
    }

    // Wenn immer noch kein sharing existiert, create es jetzt
    if (!sharing) {
      try {
        await db.query(`INSERT INTO animal_sharing (id, animal_id, role, share_contact, share_breed, share_birthdate, share_address, share_dynamic_fields)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [uuid(), row.id, publicRole, 0, 1, 1, 0, 0])
        sharing = await getSharingForRole(db, row.id, publicRole)
      } catch (err) {
        fastify.log.warn({ err: err?.message, animalId: row.id, role: publicRole }, 'public sharing fallback insert failed')
      }
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

    const { rows: docs } = await db.query(`
      SELECT d.*, uploader.name AS added_by_name, uploader.verified AS added_by_verified
      FROM documents d
      LEFT JOIN accounts uploader ON uploader.id = d.added_by_account
      WHERE d.animal_id = $1
      ORDER BY d.created_at DESC
    `, [row.id])

    result.documents = docs.filter(d => {
      if (d.allowed_roles && !parseAllowedRoles(d.allowed_roles)) {
        fastify.log.warn({ documentId: d.id, animalId: row.id }, 'Malformed allowed_roles; document hidden in public scan')
      }
      return effectiveRoles.some(r => canRoleSeeDocument(d.allowed_roles, r))
    })

    for (const d of result.documents) {
      try { d.extracted_json = JSON.parse(d.extracted_json) } catch { d.extracted_json = {} }
      try { d.record_permissions = d.record_permissions ? JSON.parse(d.record_permissions) : {} } catch { d.record_permissions = {} }
      const { rows: pages } = await db.query('SELECT image_path FROM document_pages WHERE document_id = $1 ORDER BY id ASC', [d.id])
      d.pages = pages.map(p => p.image_path)
    }

    return result
  })

  fastify.get('/api/public/share/:shareId', async (req, reply) => {
    const db = getDb()
    const { shareId } = req.params

    const { rows: [share] } = await db.query('SELECT * FROM animal_public_shares WHERE id = $1', [shareId])
    if (!share) return reply.code(404).send({ error: 'Freigabe nicht gefunden' })

    if (share.expires_at < Math.floor(Date.now() / 1000)) {
      return reply.code(410).send({ error: 'Diese Freigabe ist abgelaufen' })
    }

    const { rows: [animal] } = await db.query(`
      SELECT a.*, ac.name AS owner_name, ac.email AS owner_email
      FROM animals a
      JOIN accounts ac ON a.account_id = ac.id
      WHERE a.id = $1
    `, [share.animal_id])

    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    await ensureDefaultSharing(db, animal.id)

    // Verify guest sharing exists, create if missing
    const publicRole = getPublicSharingRole()
    const { rows: [guestSharing] } = await db.query('SELECT * FROM animal_sharing WHERE animal_id = $1 AND role = $2', [animal.id, publicRole])
    if (!guestSharing) {
      await db.query(`INSERT INTO animal_sharing (id, animal_id, role, share_contact, share_breed, share_birthdate, share_address, share_dynamic_fields)
                  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [uuid(), animal.id, publicRole, 0, 1, 1, 0, 0])
    }

    // Optional JWT für rollenbasierte Dokumentsichtbarkeit
    const decoded = tryDecodeJwt(fastify, req)
    const effectiveRoles = getEffectiveRoles(decoded)
    const primaryRole = effectiveRoles.includes('vet') ? 'vet' : effectiveRoles.includes('authority') ? 'authority' : 'guest'

    return await applySharing(db, animal, primaryRole, animal.owner_name, animal.owner_email, effectiveRoles)
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
    let { rows: [ownRow] } = await db.query(`
      SELECT a.* FROM animals a
      JOIN animal_tags t ON t.animal_id = a.id
      WHERE t.tag_id = $1 AND t.active = 1 AND a.account_id = $2
    `, [tagId, accountId])

    // Fallback: Falls nichts gefunden, als URL gespeicherte Version versuchen
    if (!ownRow) {
      ({ rows: [ownRow] } = await db.query(`
        SELECT a.* FROM animals a
        JOIN animal_tags t ON t.animal_id = a.id
        WHERE t.tag_id = $1 AND t.active = 1 AND a.account_id = $2
      `, [originalTagId, accountId]))
    }

    if (ownRow) {
      ownRow.is_owner = true
      return ownRow
    }

    // Fremdes Tier — prüfe Rolle
    const userRoles = (role || '').split(',').map(r => r.trim())
    const requestRole = userRoles.includes('vet') ? 'vet' : userRoles.includes('authority') ? 'authority' : 'guest'

    let { rows: [row] } = await db.query(`
      SELECT a.*, ac.name AS owner_name, ac.email AS owner_email
      FROM animals a
      JOIN animal_tags t ON t.animal_id = a.id
      JOIN accounts ac ON ac.id = a.account_id
      WHERE t.tag_id = $1 AND t.active = 1
    `, [tagId])

    // Fallback: Falls nichts gefunden und als URL gespeichert sein könnte
    if (!row) {
      ({ rows: [row] } = await db.query(`
        SELECT a.*, ac.name AS owner_name, ac.email AS owner_email
        FROM animals a
        JOIN animal_tags t ON t.animal_id = a.id
        JOIN accounts ac ON ac.id = a.account_id
        WHERE t.tag_id = $1 AND t.active = 1
      `, [originalTagId]))
    }

    if (!row) return reply.code(404).send({ error: 'Tag nicht gefunden' })

    let filtered = await applySharing(db, row, requestRole, row.owner_name, row.owner_email)
    
    // Fallback auf public (guest) falls vet/authority keine speziellen Freigaben haben
    if (!filtered && requestRole !== 'guest') {
      filtered = await applySharing(db, row, 'guest', row.owner_name, row.owner_email)
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
          tagType: { type: 'string', enum: ['barcode', 'nfc', 'chip'] }
        }
      }
    }
  }, async (req, reply) => {
    const db = getDb()
    const { name, species, breed, birthdate, address, tagId, tagType } = req.body
    const { accountId, role } = req.user
    const animalId = uuid()

    if (tagId) {
      const { rows: [existingTag] } = await db.query('SELECT animal_id FROM animal_tags WHERE tag_id = $1', [tagId])
      if (existingTag) {
        return reply.code(409).send({ error: 'Tag bereits vergeben', conflict: { animalId: existingTag.animal_id } })
      }
    }

    const client = await db.connect()
    try {
      await client.query('BEGIN')

      await client.query('INSERT INTO animals (id, account_id, name, species, breed, birthdate, address) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [animalId, accountId, name, species, breed ?? null, birthdate ?? null, address ?? null])

      if (tagId && tagType) {
        await client.query('INSERT INTO animal_tags (tag_id, animal_id, tag_type) VALUES ($1, $2, $3)',
          [tagId, animalId, tagType])
      }

      await ensureDefaultSharing(client, animalId)

      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }

    await logAudit(db, { accountId, role, action: 'create_animal', resource: 'animal', resourceId: animalId, ip: req.ip })

    const { rows: [animal] } = await db.query('SELECT * FROM animals WHERE id = $1', [animalId])
    return reply.code(201).send(animal)
  })

  // Tierprofil
  fastify.get('/api/animals/:id', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId, role, roles, verified } = req.user

    const { rows: [animal] } = await db.query(`
      SELECT a.*, ac.name AS owner_name, ac.email AS owner_email 
      FROM animals a
      JOIN accounts ac ON a.account_id = ac.id
      WHERE a.id = $1
    `, [id])

    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    if (animal.account_id === accountId) {
      animal.is_owner = true
      return animal
    }

    const userRoles = (role || '').split(',').map(r => r.trim())
    const requestRole = userRoles.includes('vet') ? 'vet' : userRoles.includes('authority') ? 'authority' : 'guest'
    let filtered = await applySharing(db, animal, requestRole, animal.owner_name, animal.owner_email)
    if (!filtered && requestRole !== 'guest') filtered = await applySharing(db, animal, 'guest', animal.owner_name, animal.owner_email)
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

    const { rows: [animal] } = await db.query('SELECT * FROM animals WHERE id = $1 AND account_id = $2', [id, accountId])
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    if (animal.is_archived) return reply.code(403).send({ error: 'Archivierte Tiere können nicht bearbeitet werden.' })

    const updated = { ...animal, ...req.body }
    let avatarPath = animal.avatar_path

    if (req.body.avatar_base64) {
      const ext = req.body.avatar_base64.substring(0, 20).includes('png') ? 'png' : 'jpg'
      const filename = `${uuid()}_avatar.${ext}`
      avatarPath = saveBase64Image(filename, req.body.avatar_base64)
    }

    await db.query('UPDATE animals SET name=$1, species=$2, breed=$3, birthdate=$4, address=$5, dynamic_fields=$6, avatar_path=$7 WHERE id=$8',
      [updated.name, updated.species, updated.breed, updated.birthdate, updated.address, updated.dynamic_fields ?? animal.dynamic_fields, avatarPath, id])

    await logAudit(db, { accountId, role, action: 'update_animal', resource: 'animal', resourceId: id,
      details: { before: animal, after: updated }, ip: req.ip })

    const { rows: [result] } = await db.query('SELECT * FROM animals WHERE id = $1', [id])
    return result
  })

  // Tier archivieren / de-archivieren (mit optionalem Grund)
  fastify.patch('/api/animals/:id/archive', {
    schema: {
      body: {
        type: 'object',
        properties: {
          is_archived: { type: 'boolean' },
          archive_reason: {
            type: 'string',
            enum: ['verstorben', 'verloren', 'verkauft', 'abgegeben', 'sonstiges']
          }
        }
      }
    }
  }, async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId, role } = req.user
    const { is_archived, archive_reason } = req.body || {}

    const { rows: [animal] } = await db.query('SELECT id, is_archived FROM animals WHERE id = $1 AND account_id = $2', [id, accountId])
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden oder keine Berechtigung' })

    // Determine new state: toggle if is_archived undefined, otherwise use provided value
    const newState = is_archived !== undefined ? is_archived : !animal.is_archived

    // When archiving, archive_reason is required
    if (newState && !archive_reason) {
      return reply.code(400).send({ error: 'Archivierungsgrund erforderlich' })
    }

    // Valid archive reasons (enforced by schema CHECK constraint)
    const validReasons = ['verstorben', 'verloren', 'verkauft', 'abgegeben', 'sonstiges']
    if (newState && archive_reason && !validReasons.includes(archive_reason)) {
      return reply.code(400).send({ error: `Ungültiger Archivierungsgrund: ${archive_reason}` })
    }

    const now = new Date().toISOString()
    await db.query('UPDATE animals SET is_archived = $1, archive_reason = $2, archived_at = $3 WHERE id = $4',
      [newState ? 1 : 0, newState ? archive_reason : null, newState ? now : null, id])

    const action = newState ? 'archive_animal' : 'unarchive_animal'
    await logAudit(db, {
      accountId,
      role,
      action,
      resource: 'animal',
      resourceId: id,
      details: { archive_reason: newState ? archive_reason : null },
      ip: req.ip
    })

    return { success: true, is_archived: newState, archive_reason: newState ? archive_reason : null }
  })

  // Tier reaktivieren (Archivierung aufheben)
  fastify.post('/api/animals/:id/unarchive', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId, role } = req.user

    const { rows: [animal] } = await db.query('SELECT id, is_archived FROM animals WHERE id = $1 AND account_id = $2', [id, accountId])
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden oder keine Berechtigung' })
    if (!animal.is_archived) return reply.code(400).send({ error: 'Tier ist nicht archiviert' })

    await db.query('UPDATE animals SET is_archived = 0, archive_reason = NULL, archived_at = NULL WHERE id = $1', [id])

    await logAudit(db, {
      accountId,
      role,
      action: 'unarchive_animal',
      resource: 'animal',
      resourceId: id,
      ip: req.ip
    })

    return { success: true }
  })

  // Tier löschen (mit Sicherheitsbestätigung)
  fastify.delete('/api/animals/:id', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId, role } = req.user
    const { confirmationText } = req.body || {}

    const { rows: [animal] } = await db.query('SELECT * FROM animals WHERE id = $1 AND account_id = $2', [id, accountId])
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    // Sicherheitsabfrage: Namen oder Geburtsdatum muss eingegeben werden
    const nameMatches = confirmationText && confirmationText.toLowerCase() === animal.name.toLowerCase()
    const birthdateMatches = confirmationText && confirmationText === animal.birthdate

    if (!nameMatches && !birthdateMatches) {
      return reply.code(400).send({ error: 'Sicherheitsbestätigung erforderlich: Gib den Namen oder das Geburtsdatum des Tieres ein' })
    }

    await db.query('DELETE FROM document_pages WHERE document_id IN (SELECT id FROM documents WHERE animal_id = $1)', [id])
    await db.query('DELETE FROM documents WHERE animal_id = $1', [id])
    await db.query('DELETE FROM animal_tags WHERE animal_id = $1', [id])
    await db.query('DELETE FROM animal_sharing WHERE animal_id = $1', [id])
    await db.query('DELETE FROM animal_public_shares WHERE animal_id = $1', [id])
    await db.query('DELETE FROM animals WHERE id = $1', [id])

    await logAudit(db, { accountId, role, action: 'delete_animal', resource: 'animal', resourceId: id,
      details: animal, ip: req.ip })

    return reply.code(204).send()
  })

  // Alle Tiere des Kontos
  fastify.get('/api/animals', async (req) => {
    const db = getDb()
    const { rows } = await db.query('SELECT * FROM animals WHERE account_id = $1 ORDER BY is_archived ASC, name ASC', [req.user.accountId])
    return rows
  })

  // Tier-Statistiken für den aktuellen Nutzer
  fastify.get('/api/animals/stats', async (req) => {
    const db = getDb()
    const { accountId } = req.user
    const { rows: [{ cnt: total }] } = await db.query('SELECT COUNT(*) as cnt FROM animals WHERE account_id = $1', [accountId])
    const { rows: [{ cnt: active }] } = await db.query('SELECT COUNT(*) as cnt FROM animals WHERE account_id = $1 AND is_archived = 0', [accountId])
    const { rows: [{ cnt: archived }] } = await db.query('SELECT COUNT(*) as cnt FROM animals WHERE account_id = $1 AND is_archived = 1', [accountId])
    const { rows: [{ cnt: with_docs }] } = await db.query(`
      SELECT COUNT(DISTINCT a.id) as cnt FROM animals a
      JOIN documents d ON d.animal_id = a.id
      WHERE a.account_id = $1
    `, [accountId])
    return { total, active, archived, with_documents: with_docs }
  })

  // Dokumentliste eines Tieres (mit Rollenfilter)
  fastify.get('/api/animals/:id/documents', async (req, reply) => {
    // Prevent caching — document list can change (uploads, deletes, analysis status)
    reply.header('Cache-Control', 'no-cache, no-store, must-revalidate')
    reply.header('Pragma', 'no-cache')
    reply.header('Expires', '0')

    const db = getDb()
    const { accountId, role, roles, verified } = req.user
    const { id } = req.params

    const { rows: [animal] } = await db.query('SELECT * FROM animals WHERE id = $1', [id])
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    const parseDocs = (docs) => docs.map(d => {
      try { d.extracted_json = JSON.parse(d.extracted_json) } catch { d.extracted_json = {} }
      try { d.record_permissions = d.record_permissions ? JSON.parse(d.record_permissions) : {} } catch { d.record_permissions = {} }
      return d
    })

    // Eigentümer: voller Zugriff
    if (animal.account_id === accountId) {
      const { rows } = await db.query(`
        SELECT d.*, uploader.name AS added_by_name, uploader.verified AS added_by_verified 
        FROM documents d
        LEFT JOIN accounts uploader ON uploader.id = d.added_by_account
        WHERE d.animal_id = $1 
        ORDER BY d.created_at DESC
      `, [id])
      return parseDocs(rows)
    }

    // Rollenbasiert für Vet/Behörde
    const userRoles = (role || '').split(',').map(r => r.trim())
    const requestRole = userRoles.includes('vet') ? 'vet' : userRoles.includes('authority') ? 'authority' : 'guest'

    let sharing = await getSharingForRole(db, id, requestRole)
    if (!sharing && requestRole !== 'guest') sharing = await getSharingForRole(db, id, 'guest')

    if (!sharing) return []

    const { rows: docs } = await db.query(`
      SELECT d.*, uploader.name AS added_by_name, uploader.verified AS added_by_verified
      FROM documents d
      LEFT JOIN accounts uploader ON uploader.id = d.added_by_account
      WHERE d.animal_id = $1 
      ORDER BY d.created_at DESC
    `, [id])

    return parseDocs(docs.filter(d => {
      return canRoleSeeDocument(d.allowed_roles, requestRole)
    }))
  })

  // Tag-Liste eines Tieres
  fastify.get('/api/animals/:id/tags', async (req, reply) => {
    const db = getDb()
    const { rows: [animal] } = await db.query('SELECT id FROM animals WHERE id = $1', [req.params.id])
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    const { rows } = await db.query('SELECT * FROM animal_tags WHERE animal_id = $1 ORDER BY added_at DESC', [req.params.id])
    return rows
  })

  // Neuen Tag zuordnen
  fastify.post('/api/animals/:id/tags', {
    schema: {
      body: {
        type: 'object',
        required: ['tagId', 'tagType'],
        properties: {
          tagId: { type: 'string', minLength: 1 },
          tagType: { type: 'string', enum: ['barcode', 'nfc', 'chip'] }
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

    const { rows: [animal] } = await db.query('SELECT id, account_id, is_archived FROM animals WHERE id = $1', [id])
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })
    if (animal.is_archived) return reply.code(403).send({ error: 'Tags können nicht zu archivierten Tieren hinzugefügt werden.' })

    if (animal.account_id !== accountId) {
      // Zero-Trust: Live-Check der DB, nicht nur des JWT
      const { rows: [liveUser] } = await db.query('SELECT role, verified FROM accounts WHERE id = $1', [accountId])
      const liveRoles = (liveUser.role || '').split(',').map(r => r.trim())
      if (!liveRoles.includes('vet') || !liveUser.verified) {
        return reply.code(403).send({ error: 'Nur verifizierte Tierärzte dürfen Tags zu fremden Tieren hinzufügen.' })
      }
    }

    const { rows: [existing] } = await db.query('SELECT animal_id FROM animal_tags WHERE tag_id = $1', [tagId])
    if (existing) {
      return reply.code(409).send({ error: 'Tag bereits vergeben', conflict: { animalId: existing.animal_id } })
    }

    await db.query('INSERT INTO animal_tags (tag_id, animal_id, tag_type) VALUES ($1, $2, $3)',
      [tagId, id, tagType])

    await logAudit(db, { accountId, role, action: 'add_tag', resource: 'tag', resourceId: tagId, ip: req.ip })

    const { rows: [newTag] } = await db.query('SELECT * FROM animal_tags WHERE tag_id = $1', [tagId])
    return reply.code(201).send(newTag)
  })

  // Tag deaktivieren
  fastify.patch('/api/animal-tags/:tagId', async (req, reply) => {
    const db = getDb()
    const { tagId } = req.params
    const { accountId, role } = req.user

    const userRoles = (role || '').split(',').map(r => r.trim())
    const isVet = userRoles.includes('vet')

    const { rows: [row] } = await db.query(`
      SELECT t.tag_id, a.account_id FROM animal_tags t
      JOIN animals a ON a.id = t.animal_id
      WHERE t.tag_id = $1
    `, [tagId])

    if (!row) return reply.code(404).send({ error: 'Tag nicht gefunden' })
    if (row.account_id !== accountId && !isVet) {
      return reply.code(403).send({ error: 'Keine Berechtigung' })
    }

    const { active } = req.body ?? {}
    await db.query('UPDATE animal_tags SET active = $1 WHERE tag_id = $2',
      [active === true ? 1 : 0, tagId])

    await logAudit(db, { accountId, role, action: active ? 'activate_tag' : 'deactivate_tag', resource: 'tag', resourceId: tagId, ip: req.ip })

    const { rows: [updatedTag] } = await db.query('SELECT * FROM animal_tags WHERE tag_id = $1', [tagId])
    return updatedTag
  })

  // Freigabe-Einstellungen lesen
  fastify.get('/api/animals/:id/sharing', async (req, reply) => {
    const db = getDb()
    const { rows: [animal] } = await db.query('SELECT id FROM animals WHERE id = $1 AND account_id = $2',
      [req.params.id, req.user.accountId])
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    await ensureDefaultSharing(db, req.params.id)
    const { rows: sharingRows } = await db.query('SELECT * FROM animal_sharing WHERE animal_id = $1 ORDER BY role', [req.params.id])
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

    const { rows: [animal] } = await db.query('SELECT id FROM animals WHERE id = $1 AND account_id = $2', [id, accountId])
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    const { role, share_contact, share_breed, share_birthdate, share_address, share_dynamic_fields } = req.body
    const targetRole = normalizeRole(role)

    const { rows: [existing] } = await db.query('SELECT * FROM animal_sharing WHERE animal_id = $1 AND role = $2', [id, targetRole])

    if (existing) {
      const merged = {
        c: share_contact ?? existing.share_contact,
        b: share_breed ?? existing.share_breed,
        d: share_birthdate ?? existing.share_birthdate,
        a: share_address ?? existing.share_address,
        df: share_dynamic_fields ?? existing.share_dynamic_fields,
      }
      await db.query(`UPDATE animal_sharing SET share_contact=$1, share_breed=$2, share_birthdate=$3, share_address=$4, share_dynamic_fields=$5
                  WHERE animal_id=$6 AND role=$7`,
        [merged.c, merged.b, merged.d, merged.a, merged.df, id, targetRole])
    } else {
      await db.query(`INSERT INTO animal_sharing (id, animal_id, role, share_contact, share_breed, share_birthdate, share_address, share_dynamic_fields)
                  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [uuid(), id, targetRole,
          share_contact ?? 0, share_breed ?? 1, share_birthdate ?? 1, share_address ?? 0, share_dynamic_fields ?? 0])
    }

    await logAudit(db, { accountId, role: userRole, action: 'update_sharing', resource: 'sharing', resourceId: id,
      details: req.body, ip: req.ip })

    const { rows: [updatedRow] } = await db.query('SELECT * FROM animal_sharing WHERE animal_id = $1 AND role = $2', [id, targetRole])
    return updatedRow ? { ...updatedRow, role: normalizeRole(updatedRow.role) } : updatedRow
  })

  // Temporären Share-Link erzeugen
  fastify.post('/api/animals/:id/sharing/temporary', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId, role } = req.user
    const name = req.body?.name

    const { rows: [animal] } = await db.query('SELECT id FROM animals WHERE id = $1 AND account_id = $2', [id, accountId])
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden oder keine Berechtigung' })

    const shareId = uuid()
    const linkName = buildShareLinkName(name, shareId)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 14) // 14 Tage gültig

    await db.query('INSERT INTO animal_public_shares (id, animal_id, link_name, expires_at) VALUES ($1, $2, $3, $4)',
      [shareId, id, linkName, Math.floor(expiresAt.getTime() / 1000)])

    await logAudit(db, { accountId, role, action: 'create_temp_share', resource: 'sharing', resourceId: id, ip: req.ip })

    return reply.code(201).send({ shareId, linkName })
  })

  // Liste aktive Sharing-Links für ein Tier
  fastify.get('/api/animals/:id/shares', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId } = req.user

    // Verify ownership
    const { rows: [animal] } = await db.query('SELECT id FROM animals WHERE id = $1 AND account_id = $2', [id, accountId])
    if (!animal) return reply.code(403).send({ error: 'Keine Berechtigung' })

    const now = Math.floor(Date.now() / 1000)
    const { rows: shares } = await db.query(`
      SELECT id, link_name, created_at, expires_at, (expires_at - $1) as seconds_remaining
      FROM animal_public_shares
      WHERE animal_id = $2 AND expires_at > $3
      ORDER BY created_at DESC
    `, [now, id, now])

    return reply.code(200).send(shares.map(s => ({
      id: s.id,
      linkName: s.link_name || `Legacy-${String(s.id).slice(0, 8)}`,
      createdAt: new Date(s.created_at * 1000).toISOString(),
      expiresAt: new Date(s.expires_at * 1000).toISOString(),
      secondsRemaining: s.seconds_remaining,
      isExpiringSoon: s.seconds_remaining < 3600 // Less than 1 hour
    })))
  })

  // Sharing-Link widerrufen (sofort)
  fastify.delete('/api/animals/:id/shares/:shareId', async (req, reply) => {
    const db = getDb()
    const { id, shareId } = req.params
    const { accountId, role } = req.user

    // Verify ownership
    const { rows: [animal] } = await db.query('SELECT id FROM animals WHERE id = $1 AND account_id = $2', [id, accountId])
    if (!animal) return reply.code(403).send({ error: 'Keine Berechtigung' })

    // Verify share belongs to this animal
    const { rows: [share] } = await db.query('SELECT id FROM animal_public_shares WHERE id = $1 AND animal_id = $2', [shareId, id])
    if (!share) return reply.code(404).send({ error: 'Sharing-Link nicht gefunden' })

    // Soft delete: set expires_at to now
    const now = Math.floor(Date.now() / 1000)
    await db.query('UPDATE animal_public_shares SET expires_at = $1 WHERE id = $2', [now, shareId])

    await logAudit(db, { accountId, role, action: 'revoke_share', resource: 'sharing', resourceId: shareId,
      details: { animal_id: id },
      ip: req.ip })

    return reply.code(200).send({ success: true })
  })

  fastify.post('/api/animals/:id/transfer', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId, role } = req.user

    const { rows: [animal] } = await db.query('SELECT id FROM animals WHERE id = $1 AND account_id = $2', [id, accountId])
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden oder keine Berechtigung' })

    await db.query('DELETE FROM animal_transfers WHERE animal_id = $1', [id])

    const code = Math.random().toString().substring(2, 8) // 6 Ziffern
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24) // 24 Stunden gültig

    await db.query('INSERT INTO animal_transfers (code, animal_id, expires_at) VALUES ($1, $2, $3)', [code, id, expiresAt.toISOString()])
    await logAudit(db, { accountId, role, action: 'create_transfer_code', resource: 'animal', resourceId: id, ip: req.ip })

    return reply.code(201).send({ code })
  })

  // Tier per Transfer-Code übernehmen
  fastify.post('/api/animals/transfer/accept', {
    schema: { body: { type: 'object', required: ['code'], properties: { code: { type: 'string' } } } }
  }, async (req, reply) => {
    const db = getDb()
    const { code } = req.body
    const { accountId, role } = req.user

    const { rows: [transfer] } = await db.query('SELECT * FROM animal_transfers WHERE code = $1', [code])
    if (!transfer) return reply.code(404).send({ error: 'Ungültiger oder abgelaufener Code' })
    if (new Date(transfer.expires_at) < new Date()) {
      await db.query('DELETE FROM animal_transfers WHERE code = $1', [code])
      return reply.code(400).send({ error: 'Dieser Code ist abgelaufen' })
    }

    await db.query('UPDATE animals SET account_id = $1 WHERE id = $2', [accountId, transfer.animal_id])
    await db.query('DELETE FROM animal_transfers WHERE animal_id = $1', [transfer.animal_id])
    await logAudit(db, { accountId, role, action: 'accept_transfer', resource: 'animal', resourceId: transfer.animal_id, ip: req.ip })
    return { success: true, animalId: transfer.animal_id }
  })

  // Upload animal avatar
  fastify.patch('/api/animals/:id/avatar', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { base64Image, image } = req.body
    const imageData = base64Image || image
    const { accountId, role } = req.user

    const { rows: [animal] } = await db.query('SELECT * FROM animals WHERE id = $1 AND account_id = $2', [id, accountId])
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    if (animal.is_archived) return reply.code(403).send({ error: 'Avatar kann für archivierte Tiere nicht geändert werden.' })

    if (!imageData) return reply.code(400).send({ error: 'Base64 Image erforderlich' })

    try {
      const filename = `avatar_${id}_${Date.now()}.webp`
      const filepath = await saveAvatarImage(filename, imageData)

      await db.query('UPDATE animals SET avatar_path = $1 WHERE id = $2', [filepath, id])

      await logAudit(db, {
        accountId, role, action: 'upload_avatar', resource: 'animal', resourceId: id,
        ip: req.ip
      })

      return { avatar_path: filepath }
    } catch (err) {
      req.log.error({ err }, 'Avatar upload failed')
      if (/unsupported image format|input buffer/i.test(String(err?.message || ''))) {
        return reply.code(400).send({ error: 'Ungültiges Bildformat' })
      }
      return reply.code(500).send({ error: 'Fehler beim Speichern des Avatars' })
    }
  })

  // Get all recently scanned animals by current user (no time limit, last 20)
  fastify.get('/api/animals/recently-scanned', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const db = getDb()
    const { accountId } = req.user

    const { rows: scans } = await db.query(`
      SELECT DISTINCT a.*, ast.scanned_at
      FROM animal_scans ast
      JOIN animals a ON a.id = ast.animal_id
      WHERE ast.account_id = $1
      ORDER BY ast.scanned_at DESC
      LIMIT 20
    `, [accountId])

    return { scans, recent_count: scans.length }
  })

  // Get recent scans of an animal (last 12 hours)
  fastify.get('/api/animals/:id/recent-scans', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId, role } = req.user

    const { rows: [animal] } = await db.query('SELECT account_id FROM animals WHERE id = $1', [id])
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    // Only owner can see recent scans
    if (animal.account_id !== accountId) {
      return reply.code(403).send({ error: 'Keine Berechtigung' })
    }

    // Get scans from last 12 hours
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
    const { rows: scans } = await db.query(`
      SELECT ast.id, ast.animal_id, ast.account_id, ast.scanned_at, a.name as scanner_name
      FROM animal_scans ast
      JOIN accounts a ON a.id = ast.account_id
      WHERE ast.animal_id = $1 AND ast.scanned_at > $2
      ORDER BY ast.scanned_at DESC
    `, [id, twelveHoursAgo])

    return { scans, animal_id: id }
  })

  // Track an animal scan (called when document is scanned/uploaded)
  fastify.post('/api/animals/:id/track-scan', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId, role } = req.user

    const { rows: [animal] } = await db.query('SELECT id FROM animals WHERE id = $1', [id])
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    const scanId = uuid()
    await db.query(`
      INSERT INTO animal_scans (id, animal_id, account_id, scanned_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    `, [scanId, id, accountId])

    return { success: true, scanId }
  })

  // Manuelle Impfung eintragen (kein Bild nötig)
  fastify.post('/api/animals/:id/vaccinations', {
    schema: {
      body: {
        type: 'object',
        required: ['vaccine_name', 'date'],
        properties: {
          vaccine_name: { type: 'string', minLength: 1 },
          date: { type: 'string' },
          batch_number: { type: 'string' },
          valid_until: { type: 'string' },
          target_disease: { type: 'string' },
          vet_name: { type: 'string' },
          notes: { type: 'string' },
          allowed_roles: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }, async (req, reply) => {
    const db = getDb()
    const { accountId, role } = req.user
    const { id } = req.params
    const { vaccine_name, date, batch_number, valid_until, target_disease, vet_name, notes, allowed_roles } = req.body

    const userRoles = (role || '').split(',').map(r => r.trim())
    const isVet = userRoles.includes('vet')

    const { rows: [animal] } = await db.query('SELECT id, account_id FROM animals WHERE id = $1', [id])
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    // Owner can always add vaccinations; vet must have scanned the animal first
    if (animal.account_id !== accountId) {
      if (!isVet) {
        return reply.code(403).send({ error: 'Keine Berechtigung' })
      }
      const { rows: [scanHistory] } = await db.query('SELECT id FROM animal_scans WHERE animal_id = $1 AND account_id = $2 LIMIT 1', [id, accountId])
      if (!scanHistory) {
        return reply.code(403).send({ error: 'Sie müssen dieses Tier zuerst scannen, um Daten hinzuzufügen' })
      }
    }

    const docId = uuid()
    const extractedJson = {
      type: 'vaccination',
      payload: {
        vaccinations: [{
          vaccine: vaccine_name,
          administration_date: date,
          batch_number: batch_number || null,
          valid_until: valid_until || null,
          target_disease: target_disease || null,
          veterinarian_name: vet_name || null,
          notes: notes || null,
          components: [],
          purpose: null,
          manufacturer: null,
          expiry_date: null,
          valid_from: date
        }]
      },
      title: vaccine_name,
      summary: `Manuelle Eingabe: ${vaccine_name} am ${date}`,
      document_date: date
    }

    const docAllowedRoles = Array.isArray(allowed_roles) ? allowed_roles : ['vet', 'authority', 'guest']

    await db.query(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, extracted_json, ocr_provider, added_by_role, added_by_account, allowed_roles, analysis_status)
      VALUES ($1, $2, 'vaccination', '', $3, 'manual', $4, $5, $6, 'completed')
    `, [docId, id, JSON.stringify(extractedJson), isVet ? 'vet' : 'user', accountId, JSON.stringify(docAllowedRoles)])

    await logAudit(db, { accountId, role, action: 'manual_vaccination_entry', resource: 'document', resourceId: docId, details: { vaccine_name, date }, ip: req.ip })

    return reply.code(201).send({ id: docId, doc_type: 'vaccination', extracted_json: extractedJson })
  })

  // Manuelle Behandlung eintragen (kein Bild nötig)
  fastify.post('/api/animals/:id/treatments', {
    schema: {
      body: {
        type: 'object',
        required: ['substance', 'date'],
        properties: {
          substance: { type: 'string', minLength: 1 },
          date: { type: 'string' },
          dosage: { type: 'string' },
          vet_name: { type: 'string' },
          notes: { type: 'string' },
          next_due: { type: 'string' },
          active_ingredient: { type: 'string' },
          allowed_roles: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }, async (req, reply) => {
    const db = getDb()
    const { accountId, role } = req.user
    const { id } = req.params
    const { substance, date, dosage, vet_name, notes, next_due, active_ingredient, allowed_roles } = req.body

    const userRoles = (role || '').split(',').map(r => r.trim())
    const isVet = userRoles.includes('vet')

    const { rows: [animal] } = await db.query('SELECT id, account_id FROM animals WHERE id = $1', [id])
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    // Owner can always add treatments; vet must have scanned the animal first
    if (animal.account_id !== accountId) {
      if (!isVet) {
        return reply.code(403).send({ error: 'Keine Berechtigung' })
      }
      const { rows: [scanHistory] } = await db.query('SELECT id FROM animal_scans WHERE animal_id = $1 AND account_id = $2 LIMIT 1', [id, accountId])
      if (!scanHistory) {
        return reply.code(403).send({ error: 'Sie müssen dieses Tier zuerst scannen, um Daten hinzuzufügen' })
      }
    }

    const docId = uuid()
    const extractedJson = {
      type: 'treatment',
      payload: {
        treatments: [{
          substance,
          administered_at: date,
          dosage: dosage || null,
          vet_name: vet_name || null,
          notes: notes || null,
          next_due: next_due || null,
          active_ingredient: active_ingredient || null
        }]
      },
      title: substance,
      summary: `Manuelle Eingabe: ${substance} am ${date}`,
      document_date: date
    }

    const docAllowedRoles = Array.isArray(allowed_roles) ? allowed_roles : ['vet', 'authority', 'guest']

    await db.query(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, extracted_json, ocr_provider, added_by_role, added_by_account, allowed_roles, analysis_status)
      VALUES ($1, $2, 'treatment', '', $3, 'manual', $4, $5, $6, 'completed')
    `, [docId, id, JSON.stringify(extractedJson), isVet ? 'vet' : 'user', accountId, JSON.stringify(docAllowedRoles)])

    await logAudit(db, { accountId, role, action: 'manual_treatment_entry', resource: 'document', resourceId: docId, details: { substance, date }, ip: req.ip })

    return reply.code(201).send({ id: docId, doc_type: 'treatment', extracted_json: extractedJson })
  })
}
