import { useTranslation } from 'react-i18next'
import { DEFAULT_MODEL_BY_PROVIDER, DOCUMENT_TYPE_OPTIONS, DOCUMENT_TYPE_PLACEHOLDER, type DocumentTypeSelectValue, type RequestedDocumentType } from '../utils/documentAnalysis'

interface ModelOption {
  id: string
  name: string
}

interface DocumentAnalysisFormProps {
  title: string
  description: string
  previews?: string[]
  errorMessage?: string | null
  hasAnyKey: boolean
  hasGemini: boolean
  hasAnthropic: boolean
  hasOpenai: boolean
  hasSystemAi: boolean
  retryProvider: string
  retryModel: string
  requestedDocumentType: DocumentTypeSelectValue
  availableModels: {
    google: ModelOption[]
    anthropic: ModelOption[]
    openai: ModelOption[]
  }
  submitLabel: string
  cancelLabel: string
  isSubmitting: boolean
  hideDocumentType?: boolean
  onProviderChange: (provider: string) => void
  onModelChange: (model: string) => void
  onRequestedDocumentTypeChange: (documentType: DocumentTypeSelectValue) => void
  onSubmit: () => void
  onCancel: () => void
}

export function DocumentAnalysisForm({
  title,
  description,
  previews,
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
  hideDocumentType,
  onProviderChange,
  onModelChange,
  onRequestedDocumentTypeChange,
  onSubmit,
  onCancel
}: DocumentAnalysisFormProps) {
  const { t } = useTranslation()
  const isPlaceholderSelected = !hideDocumentType && requestedDocumentType === DOCUMENT_TYPE_PLACEHOLDER

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

      {errorMessage && <div className="error-card" style={{ marginBottom: 'var(--space-4)' }}><p style={{ margin: 0, whiteSpace: 'pre-line' }}>{errorMessage}</p></div>}

      <div className="card animate-slide-up" style={{ borderColor: 'var(--primary-200)' }}>
        {previews && previews.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'nowrap', overflowX: 'auto', marginBottom: 'var(--space-4)', paddingBottom: 'var(--space-2)', scrollbarWidth: 'none' }}>
            {previews.map((src, i) => (
              <img key={i} src={src} alt={`Vorschau ${i + 1}`} style={{ height: '100px', width: 'auto', minWidth: '80px', objectFit: 'cover', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', flexShrink: 0 }} />
            ))}
          </div>
        )}

        <p className="text-muted" style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-sm)' }}>{description}</p>

        {!hideDocumentType && (
          <div className="form-group">
            <label className="form-label">{t('docScan.docType')}</label>
            <select className="form-select" value={requestedDocumentType} onChange={e => onRequestedDocumentTypeChange(e.target.value as DocumentTypeSelectValue)}>
              <option value={DOCUMENT_TYPE_PLACEHOLDER} disabled>{t('docScan.docTypePlaceholder')}</option>
              {DOCUMENT_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>{docTypeLabel(type)}</option>
              ))}
            </select>
            {requestedDocumentType === 'auto' && hasAnyKey && (
              <div style={{ marginTop: 'var(--space-2)', padding: 'var(--space-3)', background: 'var(--warning-50)', border: '1px solid var(--warning-200)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-sm)', color: 'var(--warning-700)' }}>
                ⚠️ {t('docScan.autoCostWarning')}
              </div>
            )}
          </div>
        )}

        {!hasAnyKey ? (
          <div className="error-card" style={{ marginBottom: 'var(--space-4)', background: 'var(--warning-50)', border: '1px solid var(--warning-200)' }}>
            <p style={{ margin: 0, color: 'var(--warning-900)', fontSize: 'var(--font-size-sm)' }}>
              {t('docDetail.noProvidersConfigured')}
            </p>
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
          <button className="btn btn-primary flex-1" onClick={onSubmit} disabled={isSubmitting || isPlaceholderSelected}>
            {isSubmitting ? t('animal.retrying') : (hasAnyKey ? submitLabel : t('common.save'))}
          </button>
          <button className="btn btn-ghost flex-1" onClick={onCancel} disabled={isSubmitting}>{cancelLabel}</button>
        </div>
      </div>
    </div>
  )
}