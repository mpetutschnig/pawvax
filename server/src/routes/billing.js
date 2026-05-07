import { getDb } from '../db/index.js'
import { getSettingsMap } from '../services/appSettings.js'

export default async function billingRoutes(fastify) {
  fastify.get('/api/billing/me', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const db = getDb()
    const accountId = req.user.accountId

    const settings = await getSettingsMap(db)
    const pricePerPage = Number(settings.billing_price_per_page ?? 0)

    const { rows } = await db.query(
      `SELECT ul.id, ul.pages_analyzed, ul.ocr_provider, ul.model_used, ul.is_system_fallback, ul.analyzed_at,
              d.doc_type, d.id AS document_id, a.name AS animal_name
       FROM usage_logs ul
       LEFT JOIN documents d ON d.id = ul.document_id
       LEFT JOIN animals a ON a.id = d.animal_id
       WHERE ul.account_id = $1
       ORDER BY ul.analyzed_at DESC
       LIMIT 200`,
      [accountId]
    )

    const { rows: [acc] } = await db.query(
      'SELECT billing_consent_accepted_at FROM accounts WHERE id = $1',
      [accountId]
    )

    const totalPages = rows.reduce((s, r) => s + r.pages_analyzed, 0)
    const billablePages = rows.filter(r => r.is_system_fallback).reduce((s, r) => s + r.pages_analyzed, 0)

    return reply.send({
      pricePerPage,
      totalPages,
      billablePages,
      totalCost: (billablePages * pricePerPage) / 100,
      consentAcceptedAt: acc?.billing_consent_accepted_at ?? null,
      entries: rows
    })
  })

  fastify.post('/api/billing/consent', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const db = getDb()
    const accountId = req.user.accountId
    await db.query(
      'UPDATE accounts SET billing_consent_accepted_at = CURRENT_TIMESTAMP WHERE id = $1',
      [accountId]
    )
    return reply.send({ ok: true })
  })

  fastify.get('/api/admin/billing', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (req.user.role !== 'admin') return reply.code(403).send({ error: 'Kein Zugriff' })
    const db = getDb()

    const settings = await getSettingsMap(db)
    const pricePerPage = Number(settings.billing_price_per_page ?? 0)

    const { rows } = await db.query(
      `SELECT ul.account_id, a.name AS account_name, a.email,
              SUM(ul.pages_analyzed) AS total_pages,
              SUM(CASE WHEN ul.is_system_fallback = 1 THEN ul.pages_analyzed ELSE 0 END) AS billable_pages,
              MAX(ul.analyzed_at) AS last_analyzed
       FROM usage_logs ul
       JOIN accounts a ON a.id = ul.account_id
       GROUP BY ul.account_id, a.name, a.email
       ORDER BY billable_pages DESC`
    )

    return reply.send({
      pricePerPage,
      accounts: rows.map(r => ({
        ...r,
        total_pages: Number(r.total_pages),
        billable_pages: Number(r.billable_pages),
        cost: (Number(r.billable_pages) * pricePerPage) / 100
      }))
    })
  })
}
