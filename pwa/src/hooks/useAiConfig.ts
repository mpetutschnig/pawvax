import { useState, useEffect } from 'react'
import { getMe, getBillingMe } from '../api/rest'
import { DEFAULT_AVAILABLE_MODELS, DEFAULT_MODEL_BY_PROVIDER } from '../utils/documentAnalysis'

export interface AiConfigState {
  hasGemini: boolean
  hasAnthropic: boolean
  hasOpenai: boolean
  hasMistral: boolean
  hasSystemGemini: boolean
  hasSystemAnthropic: boolean
  hasSystemOpenai: boolean
  hasSystemMistral: boolean
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
  const [hasSystemGemini, setHasSystemGemini] = useState(false)
  const [hasSystemAnthropic, setHasSystemAnthropic] = useState(false)
  const [hasSystemOpenai, setHasSystemOpenai] = useState(false)
  const [hasSystemMistral, setHasSystemMistral] = useState(false)
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
      setHasSystemGemini(!!me.has_system_gemini)
      setHasSystemAnthropic(!!me.has_system_anthropic)
      setHasSystemOpenai(!!me.has_system_openai)
      setHasSystemMistral(!!me.has_system_mistral)
      setHasSystemAi(!!me.has_system_ai)
      setSystemFallbackEnabled(!!(me.system_fallback_enabled ?? 1))
      setBillingConsentAccepted(!!billingRes.data.consentAcceptedAt)
      setBillingPricePerPage(billingRes.data.pricePerPage ?? 0)

      // Auto-select first provider that has a key configured (own key OR system key),
      // cheapest first: google → anthropic → openai → mistral
      const fallbackEnabled = !!(me.system_fallback_enabled ?? 1)
      const available = (own: boolean, sys: boolean) => own || (sys && fallbackEnabled)
      const candidates: Array<[string, keyof typeof DEFAULT_MODEL_BY_PROVIDER, boolean]> = [
        ['google', 'google', available(!!me.has_gemini_token, !!me.has_system_gemini)],
        ['anthropic', 'anthropic', available(!!me.has_anthropic_token, !!me.has_system_anthropic)],
        ['openai', 'openai', available(!!me.has_openai_token, !!me.has_system_openai)],
        ['mistral', 'mistral', available(!!me.has_mistral_token, !!me.has_system_mistral)]
      ]
      const first = candidates.find(([, , ok]) => ok)
      if (first) {
        setRetryProvider(first[0])
        setRetryModel(DEFAULT_MODEL_BY_PROVIDER[first[1]])
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
    hasGemini, hasAnthropic, hasOpenai, hasMistral,
    hasSystemGemini, hasSystemAnthropic, hasSystemOpenai, hasSystemMistral,
    hasSystemAi, systemFallbackEnabled,
    billingConsentAccepted, billingPricePerPage,
    availableModels, retryProvider, retryModel,
    hasOwnKey, usingFallback, hasAnyKey,
    handleProviderChange, setRetryModel, setBillingConsentAccepted,
    loading
  }
}
