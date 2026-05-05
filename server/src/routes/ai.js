import { getDb } from '../db/index.js'
import { decrypt } from '../utils/crypto.js'
import { AI_MODEL_OPTIONS } from '../utils/aiModels.js'

export default async function aiRoutes(fastify) {
  fastify.get('/api/ai/models', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const db = getDb()
    const { accountId } = req.user

    const acc = db.prepare('SELECT gemini_token, anthropic_token, openai_token, ai_provider_priority FROM accounts WHERE id = ?').get(accountId)
    
    let geminiModels = []
    let openaiModels = []
    const anthropicModels = AI_MODEL_OPTIONS.anthropic

    let priority = ['system', 'google', 'anthropic', 'openai']
    try { if (acc?.ai_provider_priority) priority = JSON.parse(acc.ai_provider_priority) } catch {}
    const useSystem = priority.includes('system')

    try {
      let key = null; try { key = acc?.gemini_token ? decrypt(acc.gemini_token) : null } catch {}
      if (!key && useSystem) key = process.env.GEMINI_API_KEY || null
      if (key) {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`)
        if (res.ok) {
          const data = await res.json()
          geminiModels = data.models
            .filter(m => m.supportedGenerationMethods.includes('generateContent'))
            .map(m => ({ id: m.name.replace('models/', ''), name: m.displayName }))
        }
      }
    } catch (e) { req.log.error({ err: e }, 'Gemini models fetch error') }

    try {
      let key = null; try { key = acc?.openai_token ? decrypt(acc.openai_token) : null } catch {}
      if (!key && useSystem) key = process.env.OPENAI_API_KEY || null
      if (key) {
        const res = await fetch('https://api.openai.com/v1/models', { headers: { 'Authorization': `Bearer ${key}` } })
        if (res.ok) {
          const data = await res.json()
          openaiModels = data.data
            .filter(m => m.id.startsWith('gpt-4') || m.id.startsWith('o1') || m.id.startsWith('o3'))
            .sort((a, b) => b.created - a.created)
            .map(m => ({ id: m.id, name: m.id }))
        }
      }
    } catch (e) { req.log.error({ err: e }, 'OpenAI models fetch error') }

    return {
      google: geminiModels.length > 0 ? geminiModels : null,
      anthropic: anthropicModels,
      openai: openaiModels.length > 0 ? openaiModels : null
    }
  })
}