export const DEFAULT_AVAILABLE_MODELS = {
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
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' }
  ]
}

export const DEFAULT_MODEL_BY_PROVIDER = {
  google: 'gemini-3.1-flash-lite-preview',
  anthropic: 'claude-3-5-sonnet-20241022',
  openai: 'gpt-4o-mini'
}

export const DOCUMENT_TYPE_OPTIONS = ['auto', 'vaccination', 'treatment', 'pet_passport', 'medical_product', 'pedigree', 'dog_certificate', 'general'] as const

export type RequestedDocumentType = typeof DOCUMENT_TYPE_OPTIONS[number]

export const DOCUMENT_TYPE_PLACEHOLDER = '__placeholder__' as const

export type DocumentTypeSelectValue = RequestedDocumentType | typeof DOCUMENT_TYPE_PLACEHOLDER