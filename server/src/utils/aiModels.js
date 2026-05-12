export const AI_MODEL_OPTIONS = {
  google: [
    { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite Preview' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' }
  ],
  anthropic: [
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (günstig)' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' }
  ],
  openai: [
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' }
  ],
  'mock-ocr': [
    { id: 'test', name: 'Mock OCR Test' }
  ]
}

// Pre-calculate allowed model IDs for fast lookup
export const ALLOWED_GEMINI_MODELS = ['gemini-3.1-flash-lite-preview', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']
export const ALLOWED_CLAUDE_MODELS = ['claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022', 'claude-3-7-sonnet-20250219', 'claude-3-opus-20240229']
export const ALLOWED_OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4-turbo']
export const ALLOWED_MOCK_MODELS = ['test']

export const DEFAULT_MODEL_BY_PROVIDER = {
  google: 'gemini-3.1-flash-lite-preview',
  anthropic: 'claude-3-5-haiku-20241022',
  openai: 'gpt-4o-mini',
  'mock-ocr': 'test'
}

/**
 * Validates if a model is allowed for a given provider.
 * @param {string} provider - 'google', 'anthropic', 'openai' or 'mock-ocr'
 * @param {string} model - The model ID to check
 * @returns {boolean}
 */
export function isAllowedModel(provider, model) {
  if (!provider || !model) return false
  
  // Case-insensitive provider check
  const p = String(provider).toLowerCase()

  if (p === 'google') return ALLOWED_GEMINI_MODELS.includes(model)
  if (p === 'anthropic') return ALLOWED_CLAUDE_MODELS.includes(model)
  if (p === 'openai') return ALLOWED_OPENAI_MODELS.includes(model)
  if (p === 'mock-ocr') return ALLOWED_MOCK_MODELS.includes(model)
  
  return false
}

export function resolveModel(provider, preferredModel = null) {
  if (isAllowedModel(provider, preferredModel)) {
    return preferredModel
  }

  return DEFAULT_MODEL_BY_PROVIDER[provider] || preferredModel || null
}
