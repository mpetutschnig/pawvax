import { v4 as uuid } from 'uuid'

export async function logAudit(db, { accountId, role, action, resource, resourceId, details, ip } = {}) {
  await db.query(`
    INSERT INTO audit_log (id, account_id, account_role, action, resource, resource_id, details, ip_address)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [
    uuid(),
    accountId ?? null,
    role ?? null,
    action,
    resource,
    resourceId,
    details ? JSON.stringify(details) : null,
    ip ?? null
  ])
}
