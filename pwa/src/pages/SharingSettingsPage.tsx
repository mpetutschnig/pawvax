import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'
import { createTemporaryShare, getAnimalShares, getSharing, revokeAnimalShare, updateSharing } from '../api/rest'
import { PageHeader } from '../components/PageHeader'
import { Eye, Landmark, Stethoscope, User, PawPrint, Cake, Link as LinkIcon, QrCode } from 'lucide-react'

interface SharingRow {
  id: string
  role: string
  share_contact: number
  share_breed: number
  share_birthdate: number
}

interface ShareLink {
  id: string
  linkName: string
  createdAt: string
  expiresAt: string
  secondsRemaining: number
  isExpiringSoon: boolean
}

export default function SharingSettingsPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const [sharing, setSharing] = useState<SharingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [tempLink, setTempLink] = useState('')
  const [tempLinkName, setTempLinkName] = useState('')
  const [generatingLink, setGeneratingLink] = useState(false)
  const [shares, setShares] = useState<ShareLink[]>([])
  const [revokingShareId, setRevokingShareId] = useState<string | null>(null)
  const [qrOpenId, setQrOpenId] = useState<string | null>(null)

  const roleConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    guest: { label: t('docScan.guestAccess'), icon: <Eye size={18} />, color: 'var(--primary-600)' },
    authority: { label: t('docScan.authority'), icon: <Landmark size={18} />, color: 'var(--info-600)' },
    vet: { label: t('docScan.vet'), icon: <Stethoscope size={18} />, color: 'var(--success-600)' },
  }

  useEffect(() => {
    if (!id) return
    Promise.all([getSharing(id), getAnimalShares(id)])
      .then(([sharingRes, sharesRes]) => {
        setSharing(sharingRes.data)
        setShares(sharesRes.data)
      })
      .catch(() => setError(t('common.error')))
      .finally(() => setLoading(false))
  }, [id, t])

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
      const res = await createTemporaryShare(id, tempLinkName.trim() || undefined)
      const data = res.data
      setTempLink(`${window.location.origin}/share/${data.shareId}`)
      setTempLinkName(data.linkName || '')
      const updatedShares = await getAnimalShares(id)
      setShares(updatedShares.data)
    } catch {
      setError(t('common.error'))
    } finally {
      setGeneratingLink(false)
    }
  }

  function copyLink(url: string) {
    navigator.clipboard.writeText(url)
  }

  async function handleRevokeShare(shareId: string) {
    if (!id) return
    if (!window.confirm(t('sharing.confirmRevoke'))) return

    setRevokingShareId(shareId)
    try {
      await revokeAnimalShare(id, shareId)
      const updated = await getAnimalShares(id)
      setShares(updated.data)
    } catch {
      setError(t('common.error'))
    } finally {
      setRevokingShareId(null)
    }
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
        <label className="text-muted" style={{ display: 'block', marginBottom: 'var(--space-2)', fontSize: 'var(--font-size-sm)' }}>
          {t('sharing.linkName')}
        </label>
        <input
          type="text"
          className="form-input"
          value={tempLinkName}
          onChange={e => setTempLinkName(e.target.value)}
          placeholder={t('sharing.linkNamePlaceholder')}
          style={{ marginBottom: 'var(--space-3)' }}
        />
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
              <button className="btn btn-primary" onClick={() => copyLink(tempLink)}>
                {t('sharing.copyLink')}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card animate-fade-in" style={{ animationDelay: '120ms', marginTop: 'var(--space-4)' }}>
        <h3 style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <LinkIcon size={18} /> {t('sharing.activeLinks')}
        </h3>
        {shares.length === 0 ? (
          <p className="text-muted" style={{ margin: 0 }}>{t('sharing.noActiveLinks')}</p>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            {shares.map((share) => {
              const shareUrl = `${window.location.origin}/share/${share.id}`
              return (
                <div key={share.id} className="card" style={{ padding: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{share.linkName}</div>
                      <div className="text-muted" style={{ fontSize: 'var(--font-size-xs)' }}>
                        {t('sharing.createdAt')}: {new Date(share.createdAt).toLocaleString()}
                      </div>
                      <div className="text-muted" style={{ fontSize: 'var(--font-size-xs)' }}>
                        {t('sharing.expiresAt')}: {new Date(share.expiresAt).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button className="btn btn-secondary" onClick={() => copyLink(shareUrl)}>
                        {t('sharing.copyLink')}
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => setQrOpenId(qrOpenId === share.id ? null : share.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <QrCode size={16} /> QR
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => handleRevokeShare(share.id)}
                        disabled={revokingShareId === share.id}
                      >
                        {revokingShareId === share.id ? t('common.loading') : t('sharing.revoke')}
                      </button>
                    </div>
                  </div>
                  {qrOpenId === share.id && (
                    <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <QRCodeSVG value={shareUrl} size={200} />
                      <span className="text-muted" style={{ fontSize: 'var(--font-size-xs)', wordBreak: 'break-all', textAlign: 'center' }}>{shareUrl}</span>
                    </div>
                  )}
                </div>
              )
            })}
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
