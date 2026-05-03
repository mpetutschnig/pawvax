import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getSharing, updateSharing, createTempShare } from '../api/rest'
import { PageHeader } from '../components/PageHeader'
import { Eye, Landmark, Stethoscope, Syringe, Pill, FileText, User, PawPrint, Cake } from 'lucide-react'

interface SharingRow {
  id: string
  role: string
  share_vaccination: number
  share_medication: number
  share_other_docs: number
  share_contact: number
  share_breed: number
  share_birthdate: number
}

export default function SharingSettingsPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const [sharing, setSharing] = useState<SharingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [tempLink, setTempLink] = useState('')
  const [generatingLink, setGeneratingLink] = useState(false)

  const roleConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    readonly: { label: t('docScan.readonlyAccess'), icon: <Eye size={18} />, color: 'var(--primary-600)' },
    authority: { label: t('docScan.authority'), icon: <Landmark size={18} />, color: 'var(--info-600)' },
    vet: { label: t('docScan.vet'), icon: <Stethoscope size={18} />, color: 'var(--success-600)' },
  }

  useEffect(() => {
    if (!id) return
    getSharing(id)
      .then(res => setSharing(res.data))
      .catch(() => setError(t('common.error')))
      .finally(() => setLoading(false))
  }, [id])

  async function handleSave(role: string, changes: object) {
    if (!id) return
    setSaving(true)
    try {
      const updated = await updateSharing(id, role, changes)
      setSharing(s => s.map(row => row.role === role ? updated.data : row))
    } catch {
      setError(t('profile.saveError'))
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerateLink() {
    if (!id) return
    setGeneratingLink(true)
    try {
      const res = await createTempShare(id)
      setTempLink(`${window.location.origin}/share/${res.data.shareId}`)
    } catch {
      setError(t('common.error'))
    } finally {
      setGeneratingLink(false)
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(tempLink)
  }

  if (loading) return <div className="container page" style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}><div className="spinner spinner-lg"></div></div>
  if (error) return <div className="container page"><div className="error-card"><p>{error}</p></div></div>

  return (
    <div className="container page">
      <PageHeader title={t('animal.sharing')} backTo={`/animals/${id}`} showThemeToggle />

      <div className="card animate-slide-up" style={{ marginBottom: 'var(--space-6)' }}>
        <p className="text-muted" style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>
          {t('sharing.desc')}
        </p>
      </div>

      <div className="card animate-fade-in" style={{ animationDelay: '100ms' }}>
        <h3 style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {t('sharing.tempLink')}
        </h3>
        {!tempLink ? (
          <button className="btn btn-secondary" onClick={handleGenerateLink} disabled={generatingLink}>
            {generatingLink ? t('common.loading') : t('sharing.generateLink')}
          </button>
        ) : (
          <div>
            <p className="text-muted" style={{ margin: 0, fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-2)' }}>
              {t('sharing.expiresIn')} 14 {t('sharing.days')}.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <input type="text" className="form-input" value={tempLink} readOnly />
              <button className="btn btn-primary" onClick={copyLink}>
                {t('sharing.copyLink')}
              </button>
            </div>
          </div>
        )}
      </div>


      <div className="animate-fade-in" style={{ display: 'grid', gap: 'var(--space-4)' }}>
        {sharing.map(row => {
          const config = roleConfig[row.role] || { label: row.role, icon: <Eye size={18} />, color: 'var(--text-primary)' }
          return (
            <div key={row.role} className="card">
              <h3 style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: config.color }}>
                {config.icon} {config.label}
              </h3>

              <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                <label style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!row.share_vaccination}
                    onChange={e => handleSave(row.role, { share_vaccination: e.target.checked ? 1 : 0 })}
                    disabled={saving}
                    style={{ width: 18, height: 18, accentColor: 'var(--primary-500)' }}
                  />
                  <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}><Syringe size={16} className="text-tertiary" /> {t('sharing.vaccination')}</span>
                </label>

                <label style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!row.share_medication}
                    onChange={e => handleSave(row.role, { share_medication: e.target.checked ? 1 : 0 })}
                    disabled={saving}
                    style={{ width: 18, height: 18, accentColor: 'var(--primary-500)' }}
                  />
                  <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}><Pill size={16} className="text-tertiary" /> {t('sharing.medication')}</span>
                </label>

                <label style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!row.share_other_docs}
                    onChange={e => handleSave(row.role, { share_other_docs: e.target.checked ? 1 : 0 })}
                    disabled={saving}
                    style={{ width: 18, height: 18, accentColor: 'var(--primary-500)' }}
                  />
                  <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}><FileText size={16} className="text-tertiary" /> {t('sharing.otherDocs')}</span>
                </label>

                <hr className="divider" style={{ margin: 'var(--space-2) 0' }} />

                <label style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!row.share_contact}
                    onChange={e => handleSave(row.role, { share_contact: e.target.checked ? 1 : 0 })}
                    disabled={saving}
                    style={{ width: 18, height: 18, accentColor: 'var(--primary-500)' }}
                  />
                  <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}><User size={16} className="text-tertiary" /> {t('sharing.contact')}</span>
                </label>

                <label style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!row.share_breed}
                    onChange={e => handleSave(row.role, { share_breed: e.target.checked ? 1 : 0 })}
                    disabled={saving}
                    style={{ width: 18, height: 18, accentColor: 'var(--primary-500)' }}
                  />
                  <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}><PawPrint size={16} className="text-tertiary" /> {t('sharing.breed')}</span>
                </label>

                <label style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!row.share_birthdate}
                    onChange={e => handleSave(row.role, { share_birthdate: e.target.checked ? 1 : 0 })}
                    disabled={saving}
                    style={{ width: 18, height: 18, accentColor: 'var(--primary-500)' }}
                  />
                  <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}><Cake size={16} className="text-tertiary" /> {t('sharing.birthdate')}</span>
                </label>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
