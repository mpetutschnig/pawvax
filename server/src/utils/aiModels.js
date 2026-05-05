export const AI_MODEL_OPTIONS = {
  google: [
    { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite Preview' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' }
  ],
  anthropic: [
    { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' }
  ],
  openai: [
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' }
  ]
}

export const ALLOWED_GEMINI_MODELS = AI_MODEL_OPTIONS.google.map((model) => model.id)
export const ALLOWED_CLAUDE_MODELS = AI_MODEL_OPTIONS.anthropic.map((model) => model.id)
export const ALLOWED_OPENAI_MODELS = AI_MODEL_OPTIONS.openai.map((model) => model.id)

export const DEFAULT_MODEL_BY_PROVIDER = {
  google: 'gemini-3.1-flash-lite-preview',
  anthropic: 'claude-3-5-sonnet-20241022',
  openai: 'gpt-4o-mini'
}

export function isAllowedModel(provider, model) {
  if (!provider || !model) return false

  const allowedModels = provider === 'google'
    ? ALLOWED_GEMINI_MODELS
    : provider === 'anthropic'
      ? ALLOWED_CLAUDE_MODELS
      : provider === 'openai'
        ? ALLOWED_OPENAI_MODELS
        : []

  return allowedModels.includes(model)
}

export function resolveModel(provider, preferredModel = null) {
  if (isAllowedModel(provider, preferredModel)) {
    return preferredModel
  }

  return DEFAULT_MODEL_BY_PROVIDER[provider] || preferredModel || null
}