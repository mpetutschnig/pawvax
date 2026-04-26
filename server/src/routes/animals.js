import { v4 as uuid } from 'uuid'
import { getDb } from '../db/index.js'
import { logAudit } from '../services/audit.js'

function ensureDefaultSharing(db, animalId) {
  const defaults = [
    { role: 'readonly',  v: 1, m: 0, o: 0, c: 0, b: 1, d: 1 },
    { role: 'authority', v: 1, m: 1, o: 0, c: 1, b: 1, d: 1 },
    { role: 'vet',       v: 1, m: 1, o: 1, c: 1, b: 1, d: 1 },
  ]
  for (const d of defaults) {
    try {
      db.prepare(`INSERT INTO animal_sharing (id, animal_id, role, share_vaccination, share_medication, share_other_docs, share_contact, share_breed, share_birthdate)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(uuid(), animalId, d.role, d.v, d.m, d.o, d.c, d.b, d.d)
    } catch { /* already exists */ }
  }
}

function applySharing(db, animal, requestRole, ownerName, ownerEmail) {
  const sharing = db.prepare('SELECT * FROM animal_sharing WHERE animal_id = ? AND role = ?').get(animal.id, requestRole)
  if (!sharing) return null

  const result = { id: animal.id, name: animal.name, species: animal.species }
  if (sharing.share_breed) result.breed = animal.breed
  if (sharing.share_birthdate) result.birthdate = animal.birthdate
  if (sharing.share_contact) result.contact = { name: ownerName, email: ownerEmail }
  return result
}

export default async function animalRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate)

  // Tier per Tag-ID suchen (inkl. Rollenfilter für Vets/Behörden)
  fastify.get('/api/animals/by-tag/:tagId', async (req, reply) => {
    const db = getDb()
    const { tagId } = req.params
    const { accountId, role, roles, verified } = req.user

    // Eigenes Tier?
    const ownRow = db.prepare(`
      SELECT a.* FROM animals a
      JOIN animal_tags t ON t.animal_id = a.id
      WHERE t.tag_id = ? AND t.active = 1 AND a.account_id = ?
    `).get(tagId, accountId)

    if (ownRow) return ownRow

    // Fremdes Tier — prüfe Rolle
    const userRoles = roles ?? [role]
    const requestRole = (userRoles.includes('vet') && verified) ? 'vet' : userRoles.includes('authority') ? 'authority' : null
    if (!requestRole) return reply.code(404).send({ error: 'Tag nicht gefunden oder nicht in deinem Konto' })

    const row = db.prepare(`
      SELECT a.*, ac.name AS owner_name, ac.email AS owner_email
      FROM animals a
      JOIN animal_tags t ON t.animal_id = a.id
      JOIN accounts ac ON ac.id = a.account_id
      WHERE t.tag_id = ? AND t.active = 1
    `).get(tagId)

    if (!row) return reply.code(404).send({ error: 'Tag nicht gefunden' })

    const filtered = applySharing(db, row, requestRole, row.owner_name, row.owner_email)
    if (!filtered) return reply.code(403).send({ error: 'Kein Zugriff auf diese Tierdaten' })
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
          tagId: { type: 'string' },
          tagType: { type: 'string', enum: ['barcode', 'nfc'] }
        }
      }
    }
  }, async (req, reply) => {
    const db = getDb()
    const { name, species, breed, birthdate, tagId, tagType } = req.body
    const { accountId, role } = req.user
    const animalId = uuid()

    const insert = db.transaction(() => {
      db.prepare('INSERT INTO animals (id, account_id, name, species, breed, birthdate) VALUES (?, ?, ?, ?, ?, ?)')
        .run(animalId, accountId, name, species, breed ?? null, birthdate ?? null)

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
    const animal = db.prepare('SELECT * FROM animals WHERE id = ? AND account_id = ?')
      .get(req.params.id, req.user.accountId)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })
    return animal
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
          birthdate: { type: 'string' }
        }
      }
    }
  }, async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId, role } = req.user

    const animal = db.prepare('SELECT * FROM animals WHERE id = ? AND account_id = ?').get(id, accountId)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    const updated = { ...animal, ...req.body }
    db.prepare('UPDATE animals SET name=?, species=?, breed=?, birthdate=? WHERE id=?')
      .run(updated.name, updated.species, updated.breed, updated.birthdate, id)

    logAudit(db, { accountId, role, action: 'update_animal', resource: 'animal', resourceId: id,
      details: { before: animal, after: updated }, ip: req.ip })

    return db.prepare('SELECT * FROM animals WHERE id = ?').get(id)
  })

  // Tier löschen
  fastify.delete('/api/animals/:id', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId, role } = req.user

    const animal = db.prepare('SELECT * FROM animals WHERE id = ? AND account_id = ?').get(id, accountId)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    db.prepare('DELETE FROM animals WHERE id = ?').run(id)

    logAudit(db, { accountId, role, action: 'delete_animal', resource: 'animal', resourceId: id,
      details: animal, ip: req.ip })

    return reply.code(204).send()
  })

  // Alle Tiere des Kontos
  fastify.get('/api/animals', async (req) => {
    const db = getDb()
    return db.prepare('SELECT * FROM animals WHERE account_id = ? ORDER BY name').all(req.user.accountId)
  })

  // Dokumentliste eines Tieres (mit Rollenfilter)
  fastify.get('/api/animals/:id/documents', async (req, reply) => {
    const db = getDb()
    const { accountId, role, roles, verified } = req.user
    const { id } = req.params

    const animal = db.prepare('SELECT * FROM animals WHERE id = ?').get(id)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    // Eigentümer: voller Zugriff
    if (animal.account_id === accountId) {
      return db.prepare('SELECT * FROM documents WHERE animal_id = ? ORDER BY created_at DESC').all(id)
    }

    // Rollenbasiert für Vet/Behörde
    const rolesArray = roles ?? [role]
    const requestRole = (rolesArray.includes('vet') && verified) ? 'vet' : rolesArray.includes('authority') ? 'authority' : null
    if (!requestRole) return reply.code(403).send({ error: 'Kein Zugriff' })

    const sharing = db.prepare('SELECT * FROM animal_sharing WHERE animal_id = ? AND role = ?').get(id, requestRole)
    if (!sharing) return reply.code(403).send({ error: 'Kein Zugriff' })

    const allowed = []
    if (sharing.share_vaccination) allowed.push('vaccination')
    if (sharing.share_medication) allowed.push('medication')
    if (sharing.share_other_docs) allowed.push('other')

    if (allowed.length === 0) return []

    const ph = allowed.map(() => '?').join(',')
    return db.prepare(`SELECT * FROM documents WHERE animal_id = ? AND doc_type IN (${ph}) ORDER BY created_at DESC`)
      .all(id, ...allowed)
  })

  // Tag-Liste eines Tieres
  fastify.get('/api/animals/:id/tags', async (req, reply) => {
    const db = getDb()
    const animal = db.prepare('SELECT id FROM animals WHERE id = ? AND account_id = ?')
      .get(req.params.id, req.user.accountId)
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

    const animal = db.prepare('SELECT id FROM animals WHERE id = ? AND account_id = ?')
      .get(id, accountId)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    const existing = db.prepare('SELECT tag_id FROM animal_tags WHERE tag_id = ?').get(tagId)
    if (existing) return reply.code(409).send({ error: 'Tag bereits vergeben' })

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

    const row = db.prepare(`
      SELECT t.tag_id FROM animal_tags t
      JOIN animals a ON a.id = t.animal_id
      WHERE t.tag_id = ? AND a.account_id = ?
    `).get(tagId, accountId)

    if (!row) return reply.code(404).send({ error: 'Tag nicht gefunden' })

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
    return db.prepare('SELECT * FROM animal_sharing WHERE animal_id = ? ORDER BY role').all(req.params.id)
  })

  // Freigabe-Einstellungen setzen (UPSERT per Rolle)
  fastify.put('/api/animals/:id/sharing', {
    schema: {
      body: {
        type: 'object',
        required: ['role'],
        properties: {
          role: { type: 'string', enum: ['readonly', 'authority', 'vet'] },
          share_vaccination: { type: 'integer' },
          share_medication: { type: 'integer' },
          share_other_docs: { type: 'integer' },
          share_contact: { type: 'integer' },
          share_breed: { type: 'integer' },
          share_birthdate: { type: 'integer' }
        }
      }
    }
  }, async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId, role: userRole } = req.user

    const animal = db.prepare('SELECT id FROM animals WHERE id = ? AND account_id = ?').get(id, accountId)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    const { role, share_vaccination, share_medication, share_other_docs, share_contact, share_breed, share_birthdate } = req.body

    const existing = db.prepare('SELECT * FROM animal_sharing WHERE animal_id = ? AND role = ?').get(id, role)

    if (existing) {
      const merged = {
        v: share_vaccination ?? existing.share_vaccination,
        m: share_medication ?? existing.share_medication,
        o: share_other_docs ?? existing.share_other_docs,
        c: share_contact ?? existing.share_contact,
        b: share_breed ?? existing.share_breed,
        d: share_birthdate ?? existing.share_birthdate,
      }
      db.prepare(`UPDATE animal_sharing SET share_vaccination=?, share_medication=?, share_other_docs=?, share_contact=?, share_breed=?, share_birthdate=?
                  WHERE animal_id=? AND role=?`)
        .run(merged.v, merged.m, merged.o, merged.c, merged.b, merged.d, id, role)
    } else {
      db.prepare(`INSERT INTO animal_sharing (id, animal_id, role, share_vaccination, share_medication, share_other_docs, share_contact, share_breed, share_birthdate)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(uuid(), id, role,
          share_vaccination ?? 1, share_medication ?? 0, share_other_docs ?? 0,
          share_contact ?? 0, share_breed ?? 1, share_birthdate ?? 1)
    }

    logAudit(db, { accountId, role: userRole, action: 'update_sharing', resource: 'sharing', resourceId: id,
      details: req.body, ip: req.ip })

    return db.prepare('SELECT * FROM animal_sharing WHERE animal_id = ? AND role = ?').get(id, role)
  })
}
