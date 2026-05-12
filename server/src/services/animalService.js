import { v4 as uuid } from 'uuid'

export function normalizeRole(role) {
  return role === 'readonly' ? 'guest' : role
}

export function buildShareLinkName(inputName, shareId) {
  const base = typeof inputName === 'string'
    ? inputName.trim().replace(/\s+/g, ' ').slice(0, 80)
    : ''
  const prefix = base || 'Link'
  return `${prefix} - ${shareId.slice(0, 8)}`
}

export function parseAllowedRoles(rawRoles) {
  if (!rawRoles) return null
  try {
    const parsed = JSON.parse(rawRoles)
    if (!Array.isArray(parsed)) return null
    return parsed.map(normalizeRole)
  } catch {
    return null
  }
}

export function canRoleSeeDocument(rawRoles, requestRole) {
  if (!rawRoles) return true
  const roles = parseAllowedRoles(rawRoles)
  if (!roles) return false

  const normalizedRequestRole = normalizeRole(requestRole)
  if (roles.includes(normalizedRequestRole)) return true

  // Backward compatibility for not-yet-migrated rows.
  if (normalizedRequestRole === 'guest' && roles.includes('readonly')) return true

  return false
}

export async function getSharingForRole(db, animalId, requestRole) {
  const normalizedRequestRole = normalizeRole(requestRole)
  const { rows: [sharing] } = await db.query('SELECT * FROM animal_sharing WHERE animal_id = $1 AND role = $2', [animalId, normalizedRequestRole])

  // Backward compatibility for not-yet-migrated rows.
  if (!sharing && normalizedRequestRole === 'guest') {
    const { rows: [fallback] } = await db.query('SELECT * FROM animal_sharing WHERE animal_id = $1 AND role = $2', [animalId, 'readonly'])
    return fallback
  }

  return sharing
}

export function getPublicSharingRole() {
  return 'guest'
}

export async function ensureDefaultSharing(db, animalId, logger = null) {
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

export async function applySharing(db, animal, requestRole, ownerName, ownerEmail, effectiveRoles = null) {
  const sharing = await getSharingForRole(db, animal.id, requestRole)
  if (!sharing) return null

  const result = { id: animal.id, name: animal.name, species: animal.species, avatar_path: animal.avatar_path, account_id: animal.account_id }
  if (sharing.share_breed) result.breed = animal.breed
  if (sharing.share_birthdate) result.birthdate = animal.birthdate
  if (sharing.share_contact) result.contact = { name: ownerName, email: ownerEmail }
  if (sharing.share_address) result.address = animal.address
  if (sharing.share_dynamic_fields) result.dynamic_fields = animal.dynamic_fields

  const includeRawImages = sharing.share_raw_images
  const { rows: docs } = await db.query(`
    SELECT d.*, uploader.name AS added_by_name, uploader.verified AS added_by_verified
    FROM documents d
    LEFT JOIN accounts uploader ON uploader.id = d.added_by_account
    WHERE d.animal_id = $1 ${includeRawImages ? '' : "AND d.analysis_status = 'completed'"}
    ORDER BY d.created_at DESC
  `, [animal.id])

  const docRoles = effectiveRoles || [requestRole]
  result.documents = docs.filter(d => docRoles.some(r => canRoleSeeDocument(d.allowed_roles, r)))

  for (const d of result.documents) {
    if (d.analysis_status !== 'completed') {
      // Raw image only — strip analysis data for unanalysed documents
      d.extracted_json = null
    } else {
      try { d.extracted_json = JSON.parse(d.extracted_json) } catch { d.extracted_json = {} }
    }
    try { d.record_permissions = d.record_permissions ? JSON.parse(d.record_permissions) : {} } catch { d.record_permissions = {} }
    const { rows: pages } = await db.query('SELECT image_path FROM document_pages WHERE document_id = $1 ORDER BY id ASC', [d.id])
    d.pages = pages.map(p => p.image_path)
  }

  return result
}

export function tryDecodeJwt(fastify, req) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null
    return fastify.jwt.verify(authHeader.slice(7))
  } catch {
    return null
  }
}

export function getEffectiveRoles(decoded) {
  if (!decoded) return ['guest']
  const userRoles = (decoded.role || '').split(',').map(r => r.trim())
  if (userRoles.includes('vet')) return ['guest', 'vet']
  if (userRoles.includes('authority')) return ['guest', 'authority']
  return ['guest']
}

export function normalizeTagId(tagId) {
  if (!tagId) return tagId
  let normalized = tagId.trim()
  try {
    const lower = normalized.toLowerCase()
    if (lower.startsWith('http://') || lower.startsWith('https://')) {
      const url = new URL(normalized)
      const parts = url.pathname.split('/').filter(Boolean)
      normalized = parts[parts.length - 1]
      if (url.searchParams.has('tag')) {
        normalized = url.searchParams.get('tag')
      }
    }
  } catch { /* not a URL */ }
  return normalized.replace(/:/g, '').toUpperCase()
}
