import { getDb } from '../db/index.js'
import { logAudit } from '../services/audit.js'
import {
  getAdminSettings,
  getMailTransportConfig,
  getPublicSettings,
  isMailConfigured,
  AI_SETTINGS_KEYS,
  MAIL_SETTINGS_KEYS,
  PUBLIC_SETTINGS_KEYS,
  GOVERNANCE_SETTINGS_KEYS,
  sanitizeSettingsForAudit,
  saveSettings,
  validateMailSettingsInput
} from '../services/appSettings.js'
import { sendTestEmail } from '../services/authMail.js'

export default async function settingsRoutes(fastify) {
  fastify.get('/api/settings', async () => {
    const db = getDb()
    return getPublicSettings(db)
  })

  fastify.get('/api/admin/settings', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { role } = req.user
    if (!role.includes('admin')) return reply.code(403).send({ error: 'Nur Admins können Einstellungen lesen' })

    const db = getDb()
    return getAdminSettings(db)
  })

  fastify.patch('/api/admin/settings', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { accountId, role } = req.user
    if (!role.includes('admin')) return reply.code(403).send({ error: 'Nur Admins können Einstellungen ändern' })

    const db = getDb()
    const incoming = req.body || {}
    const updates = {}
    for (const [key, value] of Object.entries(incoming)) {
      if (
        PUBLIC_SETTINGS_KEYS.has(key) || 
        MAIL_SETTINGS_KEYS.includes(key) || 
        AI_SETTINGS_KEYS.includes(key) ||
        GOVERNANCE_SETTINGS_KEYS.includes(key)
      ) {
        updates[key] = value
      }
    }

    const existingSettings = await getAdminSettings(db)
    const validationErrors = validateMailSettingsInput({
      ...existingSettings,
      ...updates
    })
    if (validationErrors.length > 0) {
      return reply.code(400).send({ error: validationErrors.join(' | ') })
    }

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await saveSettings(updates, client, existingSettings)
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

    await logAudit(db, {
      accountId,
      role,
      action: 'update_settings',
      resource: 'settings',
      resourceId: 'global',
      details: sanitizeSettingsForAudit(updates),
      ip: req.ip
    })

    return { success: true }
  })

  fastify.post('/api/admin/settings/test-mail', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { role } = req.user
    if (!role.includes('admin')) return reply.code(403).send({ error: 'Nur Admins können Mail-Einstellungen testen' })

    const db = getDb()
    const currentSettings = await getAdminSettings(db)
    const merged = { ...currentSettings, ...(req.body || {}) }
    const errors = validateMailSettingsInput(merged)
    if (errors.length > 0) {
      return reply.code(400).send({ error: errors.join(' | ') })
    }

    const result = await sendTestEmail({
      to: merged.mail_from_address,
      fastify,
      overrides: {
        enabled: merged.mail_enabled,
        fromAddress: merged.mail_from_address,
        fromName: merged.mail_from_name,
        replyTo: merged.mail_reply_to,
        host: merged.smtp_host,
        port: merged.smtp_port,
        securityMode: merged.smtp_security_mode,
        authMode: merged.smtp_auth_mode,
        username: merged.smtp_username,
        smtp_password: merged.smtp_password,
        oauth2Provider: merged.oauth2_provider,
        oauth2ClientId: merged.oauth2_client_id,
        oauth2_client_secret: merged.oauth2_client_secret,
        oauth2_refresh_token: merged.oauth2_refresh_token,
        oauth2Tenant: merged.oauth2_tenant
      }
    })

    if (result.skipped) {
      return reply.code(400).send({ error: 'Mail-Konfiguration unvollständig oder deaktiviert. Bitte Einstellungen prüfen und speichern.' })
    }
    return { success: true, message: 'Testmail erfolgreich versendet.' }
  })

  fastify.get('/api/admin/settings/mail-status', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (!req.user.role.includes('admin')) return reply.code(403).send({ error: 'Forbidden' })
    const db = getDb()
    const config = await getMailTransportConfig(db)
    return { configured: isMailConfigured(config) }
  })
}