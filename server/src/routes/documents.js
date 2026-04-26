import { getDb } from '../db/index.js'

export default async function documentRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate)

  // Einzelnes Dokument abrufen
  fastify.get('/api/documents/:id', async (req, reply) => {
    const db = getDb()
    const { accountId, role, roles, verified } = req.user

    const doc = db.prepare(`
      SELECT d.*, a.account_id AS owner_id FROM documents d
      JOIN animals a ON a.id = d.animal_id
      WHERE d.id = ?
    `).get(req.params.id)

    if (!doc) return reply.code(404).send({ error: 'Dokument nicht gefunden' })

    const isOwner = doc.owner_id === accountId
    let hasAccess = isOwner

    if (!isOwner) {
      const rolesArray = roles ?? [role]
      const requestRole = (rolesArray.includes('vet') && verified) ? 'vet' : rolesArray.includes('authority') ? 'authority' : null
      
      if (requestRole) {
        const sharing = db.prepare('SELECT * FROM animal_sharing WHERE animal_id = ? AND role = ?').get(doc.animal_id, requestRole)
        if (sharing) {
          const typeAllowed = (doc.doc_type === 'vaccination' && sharing.share_vaccination) ||
                              (doc.doc_type === 'medication' && sharing.share_medication) ||
                              (doc.doc_type === 'other' && sharing.share_other_docs)
          
          let roleAllowed = true
          if (doc.allowed_roles) {
            try {
              const parsedRoles = JSON.parse(doc.allowed_roles)
              roleAllowed = parsedRoles.includes(requestRole)
            } catch {}
          }
          hasAccess = typeAllowed && roleAllowed
        }
      }
    }

    if (!hasAccess) return reply.code(403).send({ error: 'Kein Zugriff auf dieses Dokument' })

    const isUploader = doc.added_by_account === accountId

    return {
      ...doc,
      extracted_json: JSON.parse(doc.extracted_json),
      added_by_role: doc.added_by_role || 'user',
      isOwner,
      isUploader
    }
  })

  // Dokument aktualisieren
  fastify.patch('/api/documents/:id', async (req, reply) => {
    const db = getDb()
    const { accountId } = req.user
    const { allowed_roles, extracted_json } = req.body

    const doc = db.prepare(`
      SELECT d.*, a.account_id AS owner_id FROM documents d
      JOIN animals a ON a.id = d.animal_id
      WHERE d.id = ?
    `).get(req.params.id)

    if (!doc) return reply.code(404).send({ error: 'Dokument nicht gefunden' })

    const isOwner = doc.owner_id === accountId
    const isUploader = doc.added_by_account === accountId

    if (!isOwner && !isUploader) {
      return reply.code(403).send({ error: 'Keine Berechtigung dieses Dokument zu bearbeiten' })
    }

    if (allowed_roles !== undefined) {
      if (!isOwner) return reply.code(403).send({ error: 'Nur der Besitzer kann die Sichtbarkeit ändern' })
      db.prepare('UPDATE documents SET allowed_roles = ? WHERE id = ?')
        .run(JSON.stringify(allowed_roles), doc.id)
    }

    if (extracted_json !== undefined) {
      if (doc.added_by_role === 'vet' && !isUploader) {
        return reply.code(403).send({ error: 'Dieses verifizierte Dokument kann nur vom Tierarzt geändert werden' })
      }
      db.prepare('UPDATE documents SET extracted_json = ? WHERE id = ?')
        .run(JSON.stringify(extracted_json), doc.id)
    }

    return { success: true }
  })

  // Dokument löschen
  fastify.delete('/api/documents/:id', async (req, reply) => {
    const db = getDb()
    const { accountId } = req.user

    const doc = db.prepare(`
      SELECT d.*, a.account_id AS owner_id FROM documents d
      JOIN animals a ON a.id = d.animal_id
      WHERE d.id = ?
    `).get(req.params.id)

    if (!doc) return reply.code(404).send({ error: 'Dokument nicht gefunden' })

    const isOwner = doc.owner_id === accountId
    const isUploader = doc.added_by_account === accountId

    if (doc.added_by_role === 'vet' && !isUploader) {
      return reply.code(403).send({ error: 'Dieses verifizierte Dokument kann nur vom Tierarzt gelöscht werden' })
    }

    if (!isOwner && !isUploader) {
      return reply.code(403).send({ error: 'Keine Berechtigung dieses Dokument zu löschen' })
    }

    db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id)
    return reply.code(204).send()
  })
}
