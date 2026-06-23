import webpush from 'web-push'
import { getDb } from '../db/index.js'

// Web-Push (VAPID). No-op unless VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY are set.
const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || null
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || null
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:vetzsucht@oxs.at'

let configured = false
if (PUBLIC_KEY && PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY)
    configured = true
  } catch {
    configured = false
  }
}

export function isPushConfigured() {
  return configured
}

export function getVapidPublicKey() {
  return PUBLIC_KEY
}

/**
 * Send a push notification to every registered device of an account.
 * Expired subscriptions (404/410) are pruned. Never throws.
 * @param {string} accountId
 * @param {{ title: string, body: string, url?: string }} payload
 */
export async function sendToAccount(accountId, payload, log = console) {
  if (!configured || !accountId) return
  const db = getDb()
  let rows = []
  try {
    ({ rows } = await db.query('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE account_id = $1', [accountId]))
  } catch (err) {
    log.warn?.({ err: err.message }, 'push: could not load subscriptions')
    return
  }
  await Promise.all(rows.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      )
      await db.query('UPDATE push_subscriptions SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1', [sub.id]).catch(() => {})
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await db.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]).catch(() => {})
      } else {
        log.warn?.({ err: err.message, statusCode: err.statusCode }, 'push: send failed')
      }
    }
  }))
}
