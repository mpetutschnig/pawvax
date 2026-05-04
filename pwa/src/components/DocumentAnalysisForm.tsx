import { useTranslation } from 'react-i18next'
import { DEFAULT_MODEL_BY_PROVIDER, type RequestedDocumentType } from '../utils/documentAnalysis'

interface ModelOption {
  id: string
  name: string
}

interface DocumentAnalysisFormProps {
  title: string
  description: string
  errorMessage?: string | null
  hasAnyKey: boolean
  hasGemini: boolean
  hasAnthropic: boolean
  hasOpenai: boolean
  hasSystemAi: boolean
  retryProvider: string
  retryModel: string
  requestedDocumentType: RequestedDocumentType
  availableModels: {
    google: ModelOption[]
    anthropic: ModelOption[]
    openai: ModelOption[]
  }
  submitLabel: string
  cancelLabel: string
  isSubmitting: boolean
  onProviderChange: (provider: string) => void
  onModelChange: (model: string) => void
  onRequestedDocumentTypeChange: (documentType: RequestedDocumentType) => void
  onSubmit: () => void
  onCancel: () => void
}

export function DocumentAnalysisForm({
  title,
  description,
  errorMessage,
  hasAnyKey,
  hasGemini,
  hasAnthropic,
  hasOpenai,
  hasSystemAi,
  retryProvider,
  retryModel,
  requestedDocumentType,
  availableModels,
  submitLabel,
  cancelLabel,
  isSubmitting,
  onProviderChange,
  onModelChange,
  onRequestedDocumentTypeChange,
  onSubmit,
  onCancel
}: DocumentAnalysisFormProps) {
  const { t } = useTranslation()

  const docTypeLabel = (type: RequestedDocumentType) => {
    const labels: Record<RequestedDocumentType, string> = {
      auto: t('docScan.docTypeAuto'),
      vaccination: t('animal.docTypeVaccination'),
      treatment: t('animal.docTypeTreatment'),
      pet_passport: t('animal.docTypePetPassport'),
      medical_product: t('animal.docTypeMedicalProduct'),
      pedigree: t('animal.docTypePedigree'),
      dog_certificate: t('animal.docTypeDogCertificate'),
      general: t('animal.docTypeGeneral')
    }
    return labels[type]
  }

  const models = retryProvider === 'google'
    ? availableModels.google
    : retryProvider === 'anthropic'
      ? availableModels.anthropic
      : availableModels.openai

  return (
    <div className="container page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)', marginTop: 'var(--space-2)' }}>
        <button className="btn btn-ghost" style={{ padding: '8px', margin: '-8px' }} onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <h1 style={{ margin: 0, fontSize: 'var(--font-size-xl)' }}>{title}</h1>
      </div>

      {errorMessage && <div className="error-card" style={{ marginBottom: 'var(--space-4)' }}><p>{errorMessage}</p></div>}

      <div className="card animate-slide-up" style={{ borderColor: 'var(--primary-200)' }}>
        <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>{description}</p>

        <div className="form-group">
          <label className="form-label">{t('docScan.docType')}</label>
          <select className="form-select" value={requestedDocumentType} onChange={e => onRequestedDocumentTypeChange(e.target.value as RequestedDocumentType)}>
            {(['auto', 'vaccination', 'treatment', 'pet_passport', 'medical_product', 'pedigree', 'dog_certificate', 'general'] as RequestedDocumentType[]).map((type) => (
              <option key={type} value={type}>{docTypeLabel(type)}</option>
            ))}
          </select>
        </div>

        {!hasAnyKey ? (
          <div className="error-card" style={{ marginBottom: 'var(--space-4)' }}>
            <p style={{ margin: 0 }}>{t('docDetail.noProvidersConfigured')}</p>
          </div>
        ) : (
          <>
            <div className="form-group">
              <label className="form-label">{t('docDetail.provider')}</label>
              <select className="form-select" value={retryProvider} onChange={e => onProviderChange(e.target.value)}>
                {(hasGemini || hasSystemAi) && <option value="google">Google Gemini</option>}
                {(hasAnthropic || hasSystemAi) && <option value="anthropic">Anthropic Claude</option>}
                {(hasOpenai || hasSystemAi) && <option value="openai">OpenAI</option>}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{t('docDetail.model')}</label>
              <select className="form-select" value={retryModel} onChange={e => onModelChange(e.target.value)}>
                {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
                {models.length === 0 && <option value={DEFAULT_MODEL_BY_PROVIDER[retryProvider as keyof typeof DEFAULT_MODEL_BY_PROVIDER]}>{DEFAULT_MODEL_BY_PROVIDER[retryProvider as keyof typeof DEFAULT_MODEL_BY_PROVIDER]}</option>}
              </select>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
          {hasAnyKey && (
            <button className="btn btn-primary flex-1" onClick={onSubmit} disabled={isSubmitting}>
              {isSubmitting ? t('animal.retrying') : submitLabel}
            </button>
          )}
          <button className="btn btn-ghost flex-1" onClick={onCancel} disabled={isSubmitting}>{cancelLabel}</button>
        </div>
      </div>
    </div>
  )
}