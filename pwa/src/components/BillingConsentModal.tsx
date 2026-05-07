import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { postBillingConsent } from '../api/rest'

interface Props {
  pricePerPage: number
  pageCount: number
  onAccept: () => void
  onCancel: () => void
}

export function BillingConsentModal({ pricePerPage, pageCount, onAccept, onCancel }: Props) {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)

  async function handleAccept() {
    setSaving(true)
    try {
      await postBillingConsent()
    } catch { /* ignore */ }
    onAccept()
  }

  const totalCents = pricePerPage * pageCount
  const totalFormatted = (totalCents / 100).toFixed(2).replace('.', ',')
  const priceFormatted = (pricePerPage / 100).toFixed(2).replace('.', ',')

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)' }}>
      <div className="card" style={{ maxWidth: 440, width: '100%', padding: 'var(--space-6)' }}>
        <h3 style={{ marginBottom: 'var(--space-2)' }}>{t('billing.consentTitle')}</h3>
        <p className="text-muted" style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-sm)' }}>
          {t('billing.consentDesc')}
        </p>
        <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
            <span className="text-muted">{t('billing.pricePerPage')}</span>
            <span>{priceFormatted} €</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
            <span className="text-muted">{t('billing.pages')}</span>
            <span>{pageCount}</span>
          </div>
          <hr style={{ margin: 'var(--space-2) 0', border: 'none', borderTop: '1px solid var(--border)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
            <span>{t('billing.total')}</span>
            <span>{totalFormatted} €</span>
          </div>
        </div>
        <p className="text-muted" style={{ fontSize: 'var(--font-size-xs)', marginBottom: 'var(--space-4)' }}>
          {t('billing.consentNote')}
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button className="btn btn-ghost flex-1" onClick={onCancel} disabled={saving}>{t('common.cancel')}</button>
          <button className="btn btn-primary flex-1" onClick={handleAccept} disabled={saving}>
            {saving ? t('common.loading') : t('billing.consentAccept')}
          </button>
        </div>
      </div>
    </div>
  )
}
