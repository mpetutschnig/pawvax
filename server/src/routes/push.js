import { randomUUID } from 'node:crypto'
import { getDb } from '../db/index.js'
import { getVapidPublicKey, isPushConfigured } from '../services/pushService.js'
import { logAudit } from '../services/audit.js'

export default async function pushRoutes(fastify) {
  // Public: VAPID public key for the browser to subscribe (null if push disabled)
  fastify.get('/api/push/vapid-public-key', async () => {
    return { publicKey: isPushConfigured() ? getVapidPublicKey() : null }
  })

  // Register / update a push subscription for the current account
  fastify.post('/api/push/subscribe', { preHandler: fastify.authenticate }, async (req, reply) => {
    const { endpoint, keys } = req.body || {}
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return reply.code(400).send({ error: 'Ungültige Subscription' })
    }
    const db = getDb()
    const { accountId, role } = req.user
    const ua = String(req.headers['user-agent'] || '').slice(0, 255)
    // Upsert by endpoint (unique); rebind to current account if it moved
    await db.query(
      `INSERT INTO push_subscriptions (id, account_id, endpoint, p256dh, auth, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (endpoint) DO UPDATE SET account_id = excluded.account_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, last_used_at = CURRENT_TIMESTAMP`,
      [randomUUID(), accountId, endpoint, keys.p256dh, keys.auth, ua]
    )
    await logAudit(db, { accountId, role, action: 'push_subscribe', resource: 'push', resourceId: accountId, ip: req.ip })
    return { success: true }
  })

  // Remove a subscription (by endpoint) for the current account
  fastify.post('/api/push/unsubscribe', { preHandler: fastify.authenticate }, async (req, reply) => {
    const { endpoint } = req.body || {}
    if (!endpoint) return reply.code(400).send({ error: 'endpoint erforderlich' })
    const db = getDb()
    await db.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND account_id = $2', [endpoint, req.user.accountId])
    return { success: true }
  })
}
