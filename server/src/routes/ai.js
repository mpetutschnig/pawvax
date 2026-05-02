import { getDb } from '../db/index.js'
import { decrypt } from '../utils/crypto.js'

export default async function aiRoutes(fastify) {
  fastify.get('/api/ai/models', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const db = getDb()
    const { accountId } = req.user

    const acc = db.prepare('SELECT gemini_token, anthropic_token, openai_token FROM accounts WHERE id = ?').get(accountId)
    
    let geminiModels = []
    let openaiModels = []
    let anthropicModels = [
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' }
    ]

    try {
      if (acc?.gemini_token) {
        const key = decrypt(acc.gemini_token)
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`)
        if (res.ok) {
          const data = await res.json()
          geminiModels = data.models
            .filter(m => m.supportedGenerationMethods.includes('generateContent'))
            .map(m => ({ id: m.name.replace('models/', ''), name: m.displayName }))
        }
      }
    } catch (e) { console.error('Gemini models fetch error:', e.message) }

    try {
      if (acc?.openai_token) {
        const key = decrypt(acc.openai_token)
        const res = await fetch('https://api.openai.com/v1/models', { headers: { 'Authorization': `Bearer ${key}` } })
        if (res.ok) {
          const data = await res.json()
          openaiModels = data.data
            .filter(m => m.id.startsWith('gpt-4') || m.id.startsWith('o1') || m.id.startsWith('o3'))
            .sort((a, b) => b.created - a.created)
            .map(m => ({ id: m.id, name: m.id }))
        }
      }
    } catch (e) { console.error('OpenAI models fetch error:', e.message) }

    return {
      google: geminiModels.length > 0 ? geminiModels : null,
      anthropic: anthropicModels,
      openai: openaiModels.length > 0 ? openaiModels : null
    }
  })
}