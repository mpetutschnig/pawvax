import { getDb } from '../db/index.js'
import { logAudit } from '../services/audit.js'

export default async function settingsRoutes(fastify) {
  // Public Route: Wird beim Start der App geladen
  fastify.get('/api/settings', async (req, reply) => {
    const db = getDb()
    const { rows } = await db.query('SELECT key, value FROM settings')
    
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
    
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      for (const [key, value] of Object.entries(updates)) {
        await client.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, String(value)])
      }
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }

    await logAudit(db, { accountId, role, action: 'update_settings', resource: 'settings', resourceId: 'global', details: updates, ip: req.ip })
    return { success: true }
  })
}