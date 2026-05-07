import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getBillingMe, adminGetBilling } from '../api/rest'
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

  useEffect(() => {
    const fetches: Promise<any>[] = [getBillingMe().then(r => setMyBilling(r.data))]
    if (isAdmin) fetches.push(adminGetBilling().then(r => setAdminBilling(r.data)))
    Promise.all(fetches).finally(() => setLoading(false))
  }, [isAdmin])

  if (loading) return (
    <div className="container page" style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}>
      <div className="spinner spinner-lg"></div>
    </div>
  )

  const priceFormatted = (n: number) => (n / 100).toFixed(2).replace('.', ',') + ' €'

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
              <div style={{ fontWeight: 700, fontSize: '1.5rem' }}>{myBilling.billablePages}</div>
            </div>
            <div>
              <div className="text-muted" style={{ fontSize: 'var(--font-size-xs)', marginBottom: 4 }}>{t('billing.totalCost')}</div>
              <div style={{ fontWeight: 700, fontSize: '1.5rem' }}>{priceFormatted(myBilling.totalCost * 100)}</div>
            </div>
          </div>

          {!myBilling.consentAcceptedAt && myBilling.billablePages === 0 && (
            <div className="card" style={{ marginBottom: 'var(--space-4)', background: 'var(--info-50)', border: '1px solid var(--info-200)' }}>
              <p className="text-muted" style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>{t('billing.noConsentYet')}</p>
            </div>
          )}

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
