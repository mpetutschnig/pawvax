import {
  findAnimalByTagIdAndActive,
  findOwnAnimalByTagIdAndActive,
  findAnimalWithOwnerByTagIdAndActive,
  insertAnimalSharing,
  insertAnimalSharingFallback,
  updateAnimalSharing,
  findAnimalDocumentsWithUploader,
  findDocumentPages,
  findPublicShareById,
  findAnimalByIdWithOwner,
  findAnimalSharingByRole,
  findTagByTagId,
  findTagByTagIdCaseInsensitive,
  createAnimalWithTagTransaction,
  findAnimalById,
  findAnimalByIdAndAccount,
  updateAnimal,
  findAnimalArchiveState,
  updateAnimalArchiveState,
  unarchiveAnimal,
  deleteAnimalTransaction,
  findAnimalsByAccount,
  getAnimalStats,
  findTagsByAnimalId,
  findAnimalBasicInfo,
  findAnimalBasicInfoAndArchive,
  findAccountRoleAndVerified,
  insertAnimalTag,
  findTagWithAccount,
  updateTagActiveState,
  findTagById,
  deleteAnimalTag,
  findAllSharingForAnimal,
  insertAnimalPublicShare,
  findActivePublicShares,
  findAnimalPublicShare,
  updatePublicShareExpiresAt,
  deleteAnimalTransfers,
  insertAnimalTransfer,
  findAnimalTransferByCode,
  deleteAnimalTransferByCode,
  updateAnimalOwner,
  updateAnimalAvatar,
  findRecentlyScannedAnimals,
  findAnimalOwner,
  findRecentScans,
  insertAnimalScan,
  findScanHistoryLimit1,
  insertDocument
} from '../db/repositories/animalRepository.js'

import { v4 as uuid } from 'uuid'
import { randomBytes } from 'node:crypto'
import { getDb } from '../db/index.js'
import { logAudit } from '../services/audit.js'
import { saveBase64Image, saveAvatarImage } from '../services/storage.js'
import {
  normalizeRole,
  buildShareLinkName,
  parseAllowedRoles,
  canRoleSeeDocument,
  getSharingForRole,
  getPublicSharingRole,
  ensureDefaultSharing,
  applySharing,
  tryDecodeJwt,
  getEffectiveRoles,
  normalizeTagId
} from '../services/animalService.js'

export default async function animalRoutes(fastify) {

  // ──── Public endpoint (no login required) ────────────────────────────────
  fastify.get('/api/public/tag/:tagId', async (req, reply) => {
    const db = getDb()
    const originalTagId = req.params.tagId
    const tagId = normalizeTagId(originalTagId)

    let row = await findAnimalByTagIdAndActive(db, tagId)

    if (!row) return reply.code(404).send({ error: 'Tag nicht gefunden' })

    // Optional JWT for role-based document visibility
    const decoded = tryDecodeJwt(fastify, req)
    const effectiveRoles = getEffectiveRoles(decoded)
    const primaryRole = effectiveRoles.includes('vet') ? 'vet' : effectiveRoles.includes('authority') ? 'authority' : 'guest'

    // Ensure default sharing exists (for older animals without sharing rows)
    await ensureDefaultSharing(db, row.id, fastify.log)

    // Use best role for metadata sharing (vet/authority see more), fallback to guest
    const publicRole = getPublicSharingRole()
    let sharing = await getSharingForRole(db, row.id, primaryRole) || await getSharingForRole(db, row.id, publicRole)

    // Retry once if sharing rows are unexpectedly missing
    if (!sharing) {
      await ensureDefaultSharing(db, row.id, fastify.log)
      sharing = await getSharingForRole(db, row.id, primaryRole) || await getSharingForRole(db, row.id, publicRole)
    }

    // Still no sharing — insert fallback now
    if (!sharing) {
      try {
        await insertAnimalSharingFallback(db, uuid(), row.id, publicRole, 0, 1, 1, 0, 0)
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
      is_public: !!sharing  // whether public sharing is enabled
    }

    if (!sharing) return result  // animal exists but has no public data

    if (sharing.share_breed) result.breed = row.breed
    if (sharing.share_birthdate) result.birthdate = row.birthdate
    if (sharing.share_contact) result.contact = { name: row.owner_name }
    if (sharing.share_address) result.address = row.address

    const docs = await findAnimalDocumentsWithUploader(db, row.id)

    result.documents = docs.filter(d => {
      if (d.allowed_roles && !parseAllowedRoles(d.allowed_roles)) {
        fastify.log.warn({ documentId: d.id, animalId: row.id }, 'Malformed allowed_roles; document hidden in public scan')
      }
      return effectiveRoles.some(r => canRoleSeeDocument(d.allowed_roles, r))
    })

    for (const d of result.documents) {
      try { d.extracted_json = JSON.parse(d.extracted_json) } catch { d.extracted_json = {} }
      try { d.record_permissions = d.record_permissions ? JSON.parse(d.record_permissions) : {} } catch { d.record_permissions = {} }
      const pages = await findDocumentPages(db, d.id)
      d.pages = pages.map(p => p.image_path)
    }

    return result
  })

  fastify.get('/api/public/share/:shareId', async (req, reply) => {
    const db = getDb()
    const { shareId } = req.params

    const share = await findPublicShareById(db, shareId)
    if (!share) return reply.code(404).send({ error: 'Freigabe nicht gefunden' })

    if (share.expires_at < Math.floor(Date.now() / 1000)) {
      return reply.code(410).send({ error: 'Diese Freigabe ist abgelaufen' })
    }

    const animal = await findAnimalByIdWithOwner(db, share.animal_id)

    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    await ensureDefaultSharing(db, animal.id)

    // Verify guest sharing exists, create if missing
    const publicRole = getPublicSharingRole()
    const guestSharing = await findAnimalSharingByRole(db, animal.id, publicRole)
    if (!guestSharing) {
      await insertAnimalSharingFallback(db, uuid(), animal.id, publicRole, 0, 1, 1, 0, 0)
    }

    // Optional JWT for role-based document visibility
    const decoded = tryDecodeJwt(fastify, req)
    const visitorRoles = getEffectiveRoles(decoded)
    const visitorPrimaryRole = visitorRoles.includes('vet') ? 'vet' : visitorRoles.includes('authority') ? 'authority' : 'guest'

    // Link grants at least its allowed_role — take the "better" of visitor role vs link role
    const linkRole = share.allowed_role || 'guest'
    const rolePriority = { guest: 0, vet: 1, authority: 1, admin: 2 }
    const primaryRole = (rolePriority[linkRole] || 0) > (rolePriority[visitorPrimaryRole] || 0) ? linkRole : visitorPrimaryRole

    // Effective roles = union of visitor's roles + link's allowed_role
    const effectiveRoles = [...new Set([...visitorRoles, linkRole])]

    let shareResult = await applySharing(db, animal, primaryRole, animal.owner_name, animal.owner_email, effectiveRoles)
    if (!shareResult && primaryRole !== 'guest') {
      shareResult = await applySharing(db, animal, 'guest', animal.owner_name, animal.owner_email, ['guest'])
    }
    return shareResult
  })

  // ──── Alle weiteren Routen erfordern Auth ─────────────────────────────────
  fastify.addHook('onRequest', async (req, reply) => {
    // Skip public routes
    if (req.url.startsWith('/api/public/')) return
    await fastify.authenticate(req, reply)
  })

  // Look up animal by tag ID (including role filter for vets/authorities)
  fastify.get('/api/animals/by-tag/:tagId', async (req, reply) => {
    const db = getDb()
    const originalTagId = req.params.tagId
    const tagId = normalizeTagId(originalTagId)
    const { accountId, role, roles, verified } = req.user

    // Own animal?
    let ownRow = await findOwnAnimalByTagIdAndActive(db, tagId, accountId)

    if (ownRow) {
      ownRow.is_owner = true
      return ownRow
    }

    // Third-party animal — check role
    const userRoles = (role || '').split(',').map(r => r.trim())
    const requestRole = userRoles.includes('vet') ? 'vet' : userRoles.includes('authority') ? 'authority' : 'guest'

    let row = await findAnimalWithOwnerByTagIdAndActive(db, tagId)

    if (!row) return reply.code(404).send({ error: 'Tag nicht gefunden' })

    let filtered = await applySharing(db, row, requestRole, row.owner_name, row.owner_email)
    
    // Fallback to public (guest) if vet/authority has no specific sharing
    if (!filtered && requestRole !== 'guest') {
      filtered = await applySharing(db, row, 'guest', row.owner_name, row.owner_email)
    }

    if (!filtered) return reply.code(403).send({ error: 'Kein Zugriff auf diese Tierdaten' })
    
    filtered.is_owner = false
    filtered.request_role = requestRole
    return filtered
  })

  // Create new animal
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
    const { name, species, breed, pedigree_name, birthdate, address, tagId, tagType } = req.body
    const { accountId, role } = req.user
    const animalId = uuid()

    if (tagId) {
      const existingTag = await findTagByTagId(db, tagId)
      if (existingTag) {
        return reply.code(409).send({ error: 'Tag bereits vergeben', conflict: { animalId: existingTag.animal_id } })
      }
    }

    await createAnimalWithTagTransaction(db, animalId, accountId, name, species, breed, pedigree_name, birthdate, address, tagId, tagType, ensureDefaultSharing)

    await logAudit(db, { accountId, role, action: 'create_animal', resource: 'animal', resourceId: animalId, ip: req.ip })

    const animal = await findAnimalById(db, animalId)
    return reply.code(201).send(animal)
  })

  // Animal profile
  fastify.get('/api/animals/:id', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId, role, roles, verified } = req.user

    const animal = await findAnimalByIdWithOwner(db, id)

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
    delete filtered.documents // documents are loaded separately via /documents
    return filtered
  })

  // Update animal data
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

    const animal = await findAnimalByIdAndAccount(db, id, accountId)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    if (animal.is_archived) return reply.code(403).send({ error: 'Archivierte Tiere können nicht bearbeitet werden.' })

    const updated = { ...animal, ...req.body }
    let avatarPath = animal.avatar_path

    if (req.body.avatar_base64) {
      const ext = req.body.avatar_base64.substring(0, 20).includes('png') ? 'png' : 'jpg'
      const filename = `${uuid()}_avatar.${ext}`
      avatarPath = saveBase64Image(filename, req.body.avatar_base64)
    }

    await updateAnimal(db, updated.name, updated.species, updated.breed, updated.pedigree_name ?? animal.pedigree_name ?? null, updated.birthdate, updated.address, updated.dynamic_fields ?? animal.dynamic_fields, avatarPath, id)

    await logAudit(db, { accountId, role, action: 'update_animal', resource: 'animal', resourceId: id,
      details: { before: animal, after: updated }, ip: req.ip })

    const result = await findAnimalById(db, id)
    return result
  })

  // Archive / unarchive animal (with optional reason)
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

    const animal = await findAnimalArchiveState(db, id, accountId)
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
    await updateAnimalArchiveState(db, newState ? 1 : 0, newState ? archive_reason : null, newState ? now : null, id)

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

  // Reactivate animal (lift archive)
  fastify.post('/api/animals/:id/unarchive', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId, role } = req.user

    const animal = await findAnimalArchiveState(db, id, accountId)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden oder keine Berechtigung' })
    if (!animal.is_archived) return reply.code(400).send({ error: 'Tier ist nicht archiviert' })

    await unarchiveAnimal(db, id)

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

  // Delete animal (with safety confirmation)
  fastify.delete('/api/animals/:id', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId, role } = req.user
    const { confirmationText } = req.body || {}

    const animal = await findAnimalByIdAndAccount(db, id, accountId)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    // Safety check: name or birthdate must be entered
    const nameMatches = confirmationText && confirmationText.toLowerCase() === animal.name.toLowerCase()
    const birthdateMatches = confirmationText && confirmationText === animal.birthdate

    if (!nameMatches && !birthdateMatches) {
      return reply.code(400).send({ error: 'Sicherheitsbestätigung erforderlich: Gib den Namen oder das Geburtsdatum des Tieres ein' })
    }

    await deleteAnimalTransaction(db, id)

    await logAudit(db, { accountId, role, action: 'delete_animal', resource: 'animal', resourceId: id,
      details: animal, ip: req.ip })

    return reply.code(204).send()
  })

  // All animals for the account
  fastify.get('/api/animals', async (req) => {
    const db = getDb()
    const rows = await findAnimalsByAccount(db, req.user.accountId)
    return rows
  })

  // Animal statistics for the current user
  fastify.get('/api/animals/stats', async (req) => {
    const db = getDb()
    const { accountId } = req.user
    return await getAnimalStats(db, accountId)
  })

  // Document list for an animal (with role filter)
  fastify.get('/api/animals/:id/documents', async (req, reply) => {
    // Prevent caching — document list can change (uploads, deletes, analysis status)
    reply.header('Cache-Control', 'no-cache, no-store, must-revalidate')
    reply.header('Pragma', 'no-cache')
    reply.header('Expires', '0')

    const db = getDb()
    const { accountId, role, roles, verified } = req.user
    const { id } = req.params

    const animal = await findAnimalById(db, id)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    const parseDocs = (docs) => docs.map(d => {
      try { d.extracted_json = JSON.parse(d.extracted_json) } catch { d.extracted_json = {} }
      try { d.record_permissions = d.record_permissions ? JSON.parse(d.record_permissions) : {} } catch { d.record_permissions = {} }
      return d
    })

    // Owner: full access
    if (animal.account_id === accountId) {
      const rows = await findAnimalDocumentsWithUploader(db, id)
      return parseDocs(rows)
    }

    // Role-based access for vet/authority
    const userRoles = (role || '').split(',').map(r => r.trim())
    const requestRole = userRoles.includes('vet') ? 'vet' : userRoles.includes('authority') ? 'authority' : 'guest'

    let sharing = await getSharingForRole(db, id, requestRole)
    if (!sharing && requestRole !== 'guest') sharing = await getSharingForRole(db, id, 'guest')

    if (!sharing) return []

    const docs = await findAnimalDocumentsWithUploader(db, id)

    return parseDocs(docs.filter(d => {
      return canRoleSeeDocument(d.allowed_roles, requestRole)
    }))
  })

  // Tag list for an animal
  fastify.get('/api/animals/:id/tags', async (req, reply) => {
    const db = getDb()
    const animal = await findAnimalBasicInfo(db, req.params.id)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    const rows = await findTagsByAnimalId(db, req.params.id)
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
    const { tagId: rawTagId, tagType } = req.body
    const tagId = normalizeTagId(rawTagId)
    const { accountId, role } = req.user

    const userRoles = (role || '').split(',').map(r => r.trim())
    const isVet = userRoles.includes('vet')

    const animal = await findAnimalBasicInfoAndArchive(db, id)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })
    if (animal.is_archived) return reply.code(403).send({ error: 'Tags können nicht zu archivierten Tieren hinzugefügt werden.' })

    if (animal.account_id !== accountId) {
      // Zero-Trust: Live-Check der DB, nicht nur des JWT
      const liveUser = await findAccountRoleAndVerified(db, accountId)
      const liveRoles = (liveUser.role || '').split(',').map(r => r.trim())
      if (!liveRoles.includes('vet') || !liveUser.verified) {
        return reply.code(403).send({ error: 'Nur verifizierte Tierärzte dürfen Tags zu fremden Tieren hinzufügen.' })
      }
    }

    const existing = await findTagByTagIdCaseInsensitive(db, tagId)
    if (existing) {
      return reply.code(409).send({ error: 'Tag bereits vergeben', conflict: { animalId: existing.animal_id } })
    }

    await insertAnimalTag(db, tagId, id, tagType)

    await logAudit(db, { accountId, role, action: 'add_tag', resource: 'tag', resourceId: tagId, ip: req.ip })

    const newTag = await findTagById(db, tagId)
    return reply.code(201).send(newTag)
  })

  // Tag deaktivieren
  fastify.patch('/api/animal-tags/:tagId', async (req, reply) => {
    const db = getDb()
    const { tagId } = req.params
    const { accountId, role } = req.user

    const userRoles = (role || '').split(',').map(r => r.trim())
    const isVet = userRoles.includes('vet')

    const row = await findTagWithAccount(db, tagId)

    if (!row) return reply.code(404).send({ error: 'Tag nicht gefunden' })
    if (row.account_id !== accountId && !isVet) {
      return reply.code(403).send({ error: 'Keine Berechtigung' })
    }

    const { active } = req.body ?? {}
    await updateTagActiveState(db, active === true ? 1 : 0, tagId)

    await logAudit(db, { accountId, role, action: active ? 'activate_tag' : 'deactivate_tag', resource: 'tag', resourceId: tagId, ip: req.ip })

    const updatedTag = await findTagById(db, tagId)
    return updatedTag
  })

  fastify.delete('/api/animal-tags/:tagId', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const db = getDb()
    const { tagId } = req.params
    const { accountId, role } = req.user

    const row = await findTagWithAccount(db, tagId)

    if (!row) return reply.code(404).send({ error: 'Tag nicht gefunden' })
    if (row.account_id !== accountId) return reply.code(403).send({ error: 'Keine Berechtigung' })

    await deleteAnimalTag(db, tagId)
    await logAudit(db, { accountId, role, action: 'delete_tag', resource: 'tag', resourceId: tagId, ip: req.ip })

    return { success: true }
  })

  // Read sharing settings
  fastify.get('/api/animals/:id/sharing', async (req, reply) => {
    const db = getDb()
    const animal = await findAnimalByIdAndAccount(db, req.params.id, req.user.accountId)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    await ensureDefaultSharing(db, req.params.id)
    const sharingRows = await findAllSharingForAnimal(db, req.params.id)
    return sharingRows.map(row => ({ ...row, role: normalizeRole(row.role) }))
  })

  // Set sharing settings (UPSERT per role)
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
          share_dynamic_fields: { type: 'integer' },
          share_raw_images: { type: 'integer' }
        }
      }
    }
  }, async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId, role: userRole } = req.user

    const animal = await findAnimalByIdAndAccount(db, id, accountId)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    const { role, share_contact, share_breed, share_birthdate, share_address, share_dynamic_fields, share_raw_images } = req.body
    const targetRole = normalizeRole(role)

    const existing = await findAnimalSharingByRole(db, id, targetRole)

    if (existing) {
      const merged = {
        c: share_contact ?? existing.share_contact,
        b: share_breed ?? existing.share_breed,
        d: share_birthdate ?? existing.share_birthdate,
        a: share_address ?? existing.share_address,
        df: share_dynamic_fields ?? existing.share_dynamic_fields,
        ri: share_raw_images ?? existing.share_raw_images ?? 0,
      }
      await updateAnimalSharing(db, merged.c, merged.b, merged.d, merged.a, merged.df, merged.ri, id, targetRole)
    } else {
      await insertAnimalSharing(db, uuid(), id, targetRole, share_contact ?? 0, share_breed ?? 1, share_birthdate ?? 1, share_address ?? 0, share_dynamic_fields ?? 0, share_raw_images ?? 0)
    }

    await logAudit(db, { accountId, role: userRole, action: 'update_sharing', resource: 'sharing', resourceId: id,
      details: req.body, ip: req.ip })

    const updatedRow = await findAnimalSharingByRole(db, id, targetRole)
    return updatedRow ? { ...updatedRow, role: normalizeRole(updatedRow.role) } : updatedRow
  })

  // Create temporary share link
  fastify.post('/api/animals/:id/sharing/temporary', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId, role } = req.user
    const name = req.body?.name
    const allowedRoleRaw = req.body?.role || 'guest'
    const validRoles = ['guest', 'vet', 'authority']
    const allowedRole = validRoles.includes(allowedRoleRaw) ? allowedRoleRaw : 'guest'

    const animal = await findAnimalByIdAndAccount(db, id, accountId)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden oder keine Berechtigung' })

    const shareId = uuid()
    const linkName = buildShareLinkName(name, shareId)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 14) // valid for 14 days

    await insertAnimalPublicShare(db, shareId, id, linkName, Math.floor(expiresAt.getTime() / 1000), allowedRole)

    await logAudit(db, { accountId, role, action: 'create_temp_share', resource: 'sharing', resourceId: id, ip: req.ip })

    return reply.code(201).send({ shareId, linkName, allowedRole })
  })

  // List active sharing links for an animal
  fastify.get('/api/animals/:id/shares', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId } = req.user

    // Verify ownership
    const animal = await findAnimalByIdAndAccount(db, id, accountId)
    if (!animal) return reply.code(403).send({ error: 'Keine Berechtigung' })

    const now = Math.floor(Date.now() / 1000)
    const shares = await findActivePublicShares(db, id, now)

    return reply.code(200).send(shares.map(s => ({
      id: s.id,
      linkName: s.link_name || `Legacy-${String(s.id).slice(0, 8)}`,
      allowedRole: s.allowed_role || 'guest',
      createdAt: new Date(s.created_at * 1000).toISOString(),
      expiresAt: new Date(s.expires_at * 1000).toISOString(),
      secondsRemaining: s.seconds_remaining,
      isExpiringSoon: s.seconds_remaining < 3600 // Less than 1 hour
    })))
  })

  // Revoke sharing link (immediately)
  fastify.delete('/api/animals/:id/shares/:shareId', async (req, reply) => {
    const db = getDb()
    const { id, shareId } = req.params
    const { accountId, role } = req.user

    // Verify ownership
    const animal = await findAnimalByIdAndAccount(db, id, accountId)
    if (!animal) return reply.code(403).send({ error: 'Keine Berechtigung' })

    // Verify share belongs to this animal
    const share = await findAnimalPublicShare(db, shareId, id)
    if (!share) return reply.code(404).send({ error: 'Sharing-Link nicht gefunden' })

    // Soft delete: set expires_at to now
    const now = Math.floor(Date.now() / 1000)
    await updatePublicShareExpiresAt(db, now, shareId)

    await logAudit(db, { accountId, role, action: 'revoke_share', resource: 'sharing', resourceId: shareId,
      details: { animal_id: id },
      ip: req.ip })

    return reply.code(200).send({ success: true })
  })

  fastify.post('/api/animals/:id/transfer', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId, role } = req.user

    const animal = await findAnimalByIdAndAccount(db, id, accountId)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden oder keine Berechtigung' })

    await deleteAnimalTransfers(db, id)

    const code = randomBytes(3).toString('hex') // 6 cryptographically secure hex chars
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24) // valid for 24 hours

    await insertAnimalTransfer(db, code, id, expiresAt.toISOString())
    await logAudit(db, { accountId, role, action: 'create_transfer_code', resource: 'animal', resourceId: id, ip: req.ip })

    return reply.code(201).send({ code })
  })

  // Accept animal via transfer code
  fastify.post('/api/animals/transfer/accept', {
    schema: { body: { type: 'object', required: ['code'], properties: { code: { type: 'string' } } } }
  }, async (req, reply) => {
    const db = getDb()
    const { code } = req.body
    const { accountId, role } = req.user

    const transfer = await findAnimalTransferByCode(db, code)
    if (!transfer) return reply.code(404).send({ error: 'Ungültiger oder abgelaufener Code' })
    if (new Date(transfer.expires_at) < new Date()) {
      await deleteAnimalTransferByCode(db, code)
      return reply.code(400).send({ error: 'Dieser Code ist abgelaufen' })
    }

    await updateAnimalOwner(db, accountId, transfer.animal_id)
    await deleteAnimalTransfers(db, transfer.animal_id)
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

    const animal = await findAnimalByIdAndAccount(db, id, accountId)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    if (animal.is_archived) return reply.code(403).send({ error: 'Avatar kann für archivierte Tiere nicht geändert werden.' })

    if (!imageData) return reply.code(400).send({ error: 'Base64 Image erforderlich' })

    try {
      const filename = `avatar_${id}_${Date.now()}.webp`
      const filepath = await saveAvatarImage(filename, imageData)

      await updateAnimalAvatar(db, filepath, id)

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

    const scans = await findRecentlyScannedAnimals(db, accountId)
    scans.sort((a, b) => new Date(b.scanned_at).getTime() - new Date(a.scanned_at).getTime())

    return { scans, recent_count: scans.length }
  })

  // Get recent scans of an animal (last 12 hours)
  fastify.get('/api/animals/:id/recent-scans', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId, role } = req.user

    const animal = await findAnimalOwner(db, id)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    // Only owner can see recent scans
    if (animal.account_id !== accountId) {
      return reply.code(403).send({ error: 'Keine Berechtigung' })
    }

    // Get scans from last 12 hours
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
    const scans = await findRecentScans(db, id, twelveHoursAgo)

    return { scans, animal_id: id }
  })

  // Track an animal scan (called when document is scanned/uploaded)
  fastify.post('/api/animals/:id/track-scan', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId, role } = req.user

    const animal = await findAnimalBasicInfo(db, id)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    const scanId = uuid()
    await insertAnimalScan(db, scanId, id, accountId)

    return { success: true, scanId }
  })

  // Add manual vaccination entry (no image required)
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

    const animal = await findAnimalBasicInfoAndArchive(db, id)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    // Owner can always add vaccinations; vet must have scanned the animal first
    if (animal.account_id !== accountId) {
      if (!isVet) {
        return reply.code(403).send({ error: 'Keine Berechtigung' })
      }
      const scanHistory = await findScanHistoryLimit1(db, id, accountId)
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

    await insertDocument(db, docId, id, 'vaccination', '', JSON.stringify(extractedJson), 'manual', isVet ? 'vet' : 'user', accountId, JSON.stringify(docAllowedRoles), 'completed')

    await logAudit(db, { accountId, role, action: 'manual_vaccination_entry', resource: 'document', resourceId: docId, details: { vaccine_name, date }, ip: req.ip })

    return reply.code(201).send({ id: docId, doc_type: 'vaccination', extracted_json: extractedJson })
  })

  // Add manual treatment entry (no image required)
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

    const animal = await findAnimalBasicInfoAndArchive(db, id)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    // Owner can always add treatments; vet must have scanned the animal first
    if (animal.account_id !== accountId) {
      if (!isVet) {
        return reply.code(403).send({ error: 'Keine Berechtigung' })
      }
      const scanHistory = await findScanHistoryLimit1(db, id, accountId)
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

    await insertDocument(db, docId, id, 'treatment', '', JSON.stringify(extractedJson), 'manual', isVet ? 'vet' : 'user', accountId, JSON.stringify(docAllowedRoles), 'completed')

    await logAudit(db, { accountId, role, action: 'manual_treatment_entry', resource: 'document', resourceId: docId, details: { substance, date }, ip: req.ip })

    return reply.code(201).send({ id: docId, doc_type: 'treatment', extracted_json: extractedJson })
  })
}
