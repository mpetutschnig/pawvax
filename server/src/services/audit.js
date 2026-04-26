import { v4 as uuid } from 'uuid'

export function logAudit(db, { accountId, role, action, resource, resourceId, details, ip } = {}) {
  db.prepare(`
    INSERT INTO audit_log (id, account_id, account_role, action, resource, resource_id, details, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuid(),
    accountId ?? null,
    role ?? null,
    action,
    resource,
    resourceId,
    details ? JSON.stringify(details) : null,
    ip ?? null
  )
}
