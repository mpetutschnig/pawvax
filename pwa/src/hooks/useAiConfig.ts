import { useState, useEffect } from 'react'
import { getMe, getBillingMe } from '../api/rest'
import { DEFAULT_AVAILABLE_MODELS, DEFAULT_MODEL_BY_PROVIDER } from '../utils/documentAnalysis'

export interface AiConfigState {
  hasGemini: boolean
  hasAnthropic: boolean
  hasOpenai: boolean
  hasMistral: boolean
  hasSystemAi: boolean
  systemFallbackEnabled: boolean
  billingConsentAccepted: boolean
  billingPricePerPage: number
  availableModels: typeof DEFAULT_AVAILABLE_MODELS
  retryProvider: string
  retryModel: string
  hasOwnKey: boolean
  usingFallback: boolean
  hasAnyKey: boolean
  handleProviderChange: (provider: string) => void
  setRetryModel: (model: string) => void
  setBillingConsentAccepted: (accepted: boolean) => void
  loading: boolean
}

export function useAiConfig(): AiConfigState {
  const [hasGemini, setHasGemini] = useState(false)
  const [hasAnthropic, setHasAnthropic] = useState(false)
  const [hasOpenai, setHasOpenai] = useState(false)
  const [hasMistral, setHasMistral] = useState(false)
  const [hasSystemAi, setHasSystemAi] = useState(true)
  const [systemFallbackEnabled, setSystemFallbackEnabled] = useState(true)
  const [billingConsentAccepted, setBillingConsentAccepted] = useState(false)
  const [billingPricePerPage, setBillingPricePerPage] = useState(0)
  const [availableModels, setAvailableModels] = useState(DEFAULT_AVAILABLE_MODELS)
  const [retryProvider, setRetryProvider] = useState('google')
  const [retryModel, setRetryModel] = useState(DEFAULT_MODEL_BY_PROVIDER.google)
  const [loading, setLoading] = useState(true)

  const hasOwnKey = hasGemini || hasAnthropic || hasOpenai || hasMistral
  const usingFallback = !hasOwnKey && hasSystemAi && systemFallbackEnabled
  const hasAnyKey = hasOwnKey || usingFallback

  useEffect(() => {
    Promise.all([
      getMe(),
      getBillingMe()
    ]).then(([meRes, billingRes]) => {
      const me = meRes.data
      setHasGemini(!!me.has_gemini_token)
      setHasAnthropic(!!me.has_anthropic_token)
      setHasOpenai(!!me.has_openai_token)
      setHasMistral(!!me.has_mistral_token)
      setHasSystemAi(!!me.has_system_ai)
      setSystemFallbackEnabled(!!(me.system_fallback_enabled ?? 1))
      setBillingConsentAccepted(!!billingRes.data.consentAcceptedAt)
      setBillingPricePerPage(billingRes.data.pricePerPage ?? 0)

      // Auto-select first available provider (cheapest first: google → anthropic → openai)
      if (me.has_gemini_token) {
        setRetryProvider('google')
        setRetryModel(DEFAULT_MODEL_BY_PROVIDER.google)
      } else if (me.has_anthropic_token) {
        setRetryProvider('anthropic')
        setRetryModel(DEFAULT_MODEL_BY_PROVIDER.anthropic)
      } else if (me.has_openai_token) {
        setRetryProvider('openai')
        setRetryModel(DEFAULT_MODEL_BY_PROVIDER.openai)
      } else if (me.has_mistral_token) {
        setRetryProvider('mistral')
        setRetryModel(DEFAULT_MODEL_BY_PROVIDER.mistral)
      }
      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })

    fetch('/api/ai/models', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json())
      .then(data => setAvailableModels({
        google: data.google || DEFAULT_AVAILABLE_MODELS.google,
        anthropic: data.anthropic || DEFAULT_AVAILABLE_MODELS.anthropic,
        openai: data.openai || DEFAULT_AVAILABLE_MODELS.openai,
        mistral: data.mistral || DEFAULT_AVAILABLE_MODELS.mistral
      }))
      .catch(() => {})
  }, [])

  function handleProviderChange(provider: string) {
    setRetryProvider(provider)
    if (provider === 'google') setRetryModel(DEFAULT_MODEL_BY_PROVIDER.google)
    else if (provider === 'anthropic') setRetryModel(DEFAULT_MODEL_BY_PROVIDER.anthropic)
    else if (provider === 'openai') setRetryModel(DEFAULT_MODEL_BY_PROVIDER.openai)
    else if (provider === 'mistral') setRetryModel(DEFAULT_MODEL_BY_PROVIDER.mistral)
  }

  return {
    hasGemini, hasAnthropic, hasOpenai, hasMistral, hasSystemAi, systemFallbackEnabled,
    billingConsentAccepted, billingPricePerPage,
    availableModels, retryProvider, retryModel,
    hasOwnKey, usingFallback, hasAnyKey,
    handleProviderChange, setRetryModel, setBillingConsentAccepted,
    loading
  }
}
