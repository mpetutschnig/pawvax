import { getDb } from '../db/index.js'
import { logAudit } from '../services/audit.js'

export default async function settingsRoutes(fastify) {
  // Public Route: Wird beim Start der App geladen
  fastify.get('/api/settings', async (req, reply) => {
    const db = getDb()
    const rows = db.prepare('SELECT key, value FROM settings').all()
    
    // Default Fallbacks, falls noch nichts gespeichert wurde
    const settings = {
      app_name: 'PAW',
      theme_color: '#0ea5e9',
      logo_data: ''
    }
    for (const row of rows) {
      settings[row.key] = row.value
    }
    return settings
  })

  // Admin Route: Einstellungen speichern
  fastify.patch('/api/admin/settings', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { accountId, role } = req.user
    if (!role.includes('admin')) return reply.code(403).send({ error: 'Nur Admins können Einstellungen ändern' })

    const db = getDb()
    const updates = req.body
    const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    
    db.transaction((entries) => {
      for (const [key, value] of Object.entries(entries)) {
         stmt.run(key, String(value))
      }
    })(updates)

    logAudit(db, { accountId, role, action: 'update_settings', resource: 'settings', resourceId: 'global', details: updates, ip: req.ip })
    return { success: true }
  })
}