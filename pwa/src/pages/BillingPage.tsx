import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getBillingMe, adminGetBilling, patchBillingSettings } from '../api/rest'
import { PageHeader } from '../components/PageHeader'
import { formatDate } from '../utils/date'

interface UsageEntry {
  id: string
  pages_analyzed: number
  ocr_provider: string
  model_used: string
  is_system_fallback: number
  analyzed_at: string
  doc_type: string | null
  document_id: string | null
  animal_name: string | null
}

interface BillingMe {
  pricePerPage: number
  totalPages: number
  billablePages: number
  totalCost: number
  consentAcceptedAt: string | null
  systemFallbackEnabled: number
  pageLimit: number | null
  entries: UsageEntry[]
}

interface AdminAccount {
  account_id: string
  account_name: string
  email: string
  total_pages: number
  billable_pages: number
  cost: number
  last_analyzed: string
}

interface AdminBilling {
  pricePerPage: number
  accounts: AdminAccount[]
}

export default function BillingPage() {
  const { t } = useTranslation()
  const role = localStorage.getItem('role') || 'user'
  const isAdmin = role === 'admin'

  const [myBilling, setMyBilling] = useState<BillingMe | null>(null)
  const [adminBilling, setAdminBilling] = useState<AdminBilling | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'me' | 'admin'>('me')

  const [fallbackEnabled, setFallbackEnabled] = useState(true)
  const [pageLimitInput, setPageLimitInput] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

  const fetchMyBilling = () => getBillingMe().then(r => {
    setMyBilling(r.data)
    setFallbackEnabled(!!r.data.systemFallbackEnabled)
    setPageLimitInput(r.data.pageLimit != null ? String(r.data.pageLimit) : '')
  })

  useEffect(() => {
    const fetches: Promise<any>[] = [fetchMyBilling()]
    if (isAdmin) fetches.push(adminGetBilling().then(r => setAdminBilling(r.data)))
    Promise.all(fetches).finally(() => setLoading(false))
  }, [isAdmin])

  if (loading) return (
    <div className="container page" style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}>
      <div className="spinner spinner-lg"></div>
    </div>
  )

  const priceFormatted = (n: number) => (n / 100).toFixed(2).replace('.', ',') + ' €'

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    setSettingsSaved(false)
    try {
      const pageLimit = pageLimitInput.trim() === '' ? null : Number(pageLimitInput)
      await patchBillingSettings({ systemFallbackEnabled: fallbackEnabled, pageLimit })
      await fetchMyBilling()
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 3000)
    } finally {
      setSavingSettings(false)
    }
  }

  const pageLimit = myBilling?.pageLimit ?? null
  const billablePages = myBilling?.billablePages ?? 0
  const limitNear = pageLimit !== null && billablePages >= pageLimit * 0.9 && billablePages < pageLimit
  const limitReached = pageLimit !== null && billablePages >= pageLimit

  return (
    <div className="container page">
      <PageHeader title={t('billing.title')} backTo="/animals" showThemeToggle />

      {isAdmin && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          <button className={`btn ${tab === 'me' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('me')}>
            {t('billing.myUsage')}
          </button>
          <button className={`btn ${tab === 'admin' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('admin')}>
            {t('billing.adminOverview')}
          </button>
        </div>
      )}

      {tab === 'me' && myBilling && (
        <div className="animate-fade-in">
          <div className="card" style={{ marginBottom: 'var(--space-4)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-4)' }}>
            <div>
              <div className="text-muted" style={{ fontSize: 'var(--font-size-xs)', marginBottom: 4 }}>{t('billing.totalPages')}</div>
              <div style={{ fontWeight: 700, fontSize: '1.5rem' }}>{myBilling.totalPages}</div>
            </div>
            <div>
              <div className="text-muted" style={{ fontSize: 'var(--font-size-xs)', marginBottom: 4 }}>{t('billing.billablePages')}</div>
              <div style={{ fontWeight: 700, fontSize: '1.5rem' }}>
                {myBilling.billablePages}
                {pageLimit !== null && <span className="text-muted" style={{ fontSize: 'var(--font-size-sm)', fontWeight: 400 }}> / {pageLimit}</span>}
              </div>
            </div>
            <div>
              <div className="text-muted" style={{ fontSize: 'var(--font-size-xs)', marginBottom: 4 }}>{t('billing.totalCost')}</div>
              <div style={{ fontWeight: 700, fontSize: '1.5rem' }}>{priceFormatted(myBilling.totalCost * 100)}</div>
            </div>
          </div>

          {limitReached && (
            <div className="error-card" style={{ marginBottom: 'var(--space-4)' }}>
              <p style={{ margin: 0 }}>{t('billing.limitReached')}</p>
            </div>
          )}
          {limitNear && !limitReached && (
            <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--warning-50)', border: '1px solid var(--warning-200)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-sm)', color: 'var(--warning-700)' }}>
              ⚠️ {t('billing.limitWarning')}
            </div>
          )}
          {!myBilling.systemFallbackEnabled && (
            <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--info-50)', border: '1px solid var(--info-200)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-sm)', color: 'var(--info-700)' }}>
              ℹ️ {t('billing.fallbackDisabledInfo')}
            </div>
          )}
          {!myBilling.consentAcceptedAt && myBilling.billablePages === 0 && (
            <div className="card" style={{ marginBottom: 'var(--space-4)', background: 'var(--info-50)', border: '1px solid var(--info-200)' }}>
              <p className="text-muted" style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>{t('billing.noConsentYet')}</p>
            </div>
          )}

          <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
            <h3 style={{ marginBottom: 'var(--space-4)' }}>{t('billing.settings')}</h3>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={fallbackEnabled}
                  onChange={e => setFallbackEnabled(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                <span>{t('billing.fallbackEnabled')}</span>
              </label>
              <p className="text-muted" style={{ margin: '4px 0 0 30px', fontSize: 'var(--font-size-xs)' }}>{t('billing.fallbackEnabledHint')}</p>
            </div>
            <div className="form-group">
              <label className="form-label">{t('billing.pageLimit')}</label>
              <input
                type="number"
                className="form-input"
                min={1}
                placeholder={t('billing.pageLimitHint')}
                value={pageLimitInput}
                onChange={e => setPageLimitInput(e.target.value)}
                style={{ maxWidth: 200 }}
              />
              <p className="text-muted" style={{ margin: '4px 0 0', fontSize: 'var(--font-size-xs)' }}>{t('billing.pageLimitHint')}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
              <button className="btn btn-primary" onClick={handleSaveSettings} disabled={savingSettings}>
                {savingSettings ? '...' : t('common.save')}
              </button>
              {settingsSaved && <span style={{ color: 'var(--success-600)', fontSize: 'var(--font-size-sm)' }}>✓ {t('billing.settingsSaved')}</span>}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 'var(--space-4)' }}>{t('billing.history')}</h3>
            {myBilling.entries.length === 0 ? (
              <p className="text-muted">{t('billing.noEntries')}</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: 'var(--space-2)', fontWeight: 600 }}>{t('billing.date')}</th>
                      <th style={{ textAlign: 'left', padding: 'var(--space-2)', fontWeight: 600 }}>{t('billing.animal')}</th>
                      <th style={{ textAlign: 'right', padding: 'var(--space-2)', fontWeight: 600 }}>{t('billing.pages')}</th>
                      <th style={{ textAlign: 'left', padding: 'var(--space-2)', fontWeight: 600 }}>{t('billing.provider')}</th>
                      <th style={{ textAlign: 'right', padding: 'var(--space-2)', fontWeight: 600 }}>{t('billing.cost')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myBilling.entries.map(e => (
                      <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: 'var(--space-2)', color: 'var(--text-secondary)' }}>{formatDate(e.analyzed_at)}</td>
                        <td style={{ padding: 'var(--space-2)' }}>{e.animal_name ?? '—'}</td>
                        <td style={{ padding: 'var(--space-2)', textAlign: 'right' }}>{e.pages_analyzed}</td>
                        <td style={{ padding: 'var(--space-2)' }}>
                          {e.ocr_provider}
                          {!!e.is_system_fallback && (
                            <span className="badge badge-warning" style={{ marginLeft: 4, fontSize: '10px' }}>System</span>
                          )}
                        </td>
                        <td style={{ padding: 'var(--space-2)', textAlign: 'right' }}>
                          {e.is_system_fallback ? priceFormatted(e.pages_analyzed * myBilling.pricePerPage) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'admin' && adminBilling && (
        <div className="animate-fade-in">
          <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
            <div className="text-muted" style={{ fontSize: 'var(--font-size-xs)', marginBottom: 4 }}>{t('billing.pricePerPage')}</div>
            <div style={{ fontWeight: 700 }}>{priceFormatted(adminBilling.pricePerPage)}</div>
          </div>
          <div className="card">
            <h3 style={{ marginBottom: 'var(--space-4)' }}>{t('billing.allUsers')}</h3>
            {adminBilling.accounts.length === 0 ? (
              <p className="text-muted">{t('billing.noEntries')}</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: 'var(--space-2)', fontWeight: 600 }}>{t('billing.user')}</th>
                      <th style={{ textAlign: 'right', padding: 'var(--space-2)', fontWeight: 600 }}>{t('billing.totalPages')}</th>
                      <th style={{ textAlign: 'right', padding: 'var(--space-2)', fontWeight: 600 }}>{t('billing.billablePages')}</th>
                      <th style={{ textAlign: 'right', padding: 'var(--space-2)', fontWeight: 600 }}>{t('billing.totalCost')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminBilling.accounts.map(a => (
                      <tr key={a.account_id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: 'var(--space-2)' }}>
                          <div>{a.account_name}</div>
                          <div className="text-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{a.email}</div>
                        </td>
                        <td style={{ padding: 'var(--space-2)', textAlign: 'right' }}>{a.total_pages}</td>
                        <td style={{ padding: 'var(--space-2)', textAlign: 'right' }}>{a.billable_pages}</td>
                        <td style={{ padding: 'var(--space-2)', textAlign: 'right' }}>{priceFormatted(a.cost * 100)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
