import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Mic, Trash2, RefreshCw } from 'lucide-react'
import { api, getVoiceMemo, deleteVoiceMemo, retryVoiceMemo, reanalyzeMemo, patchVoiceMemo } from '../api/rest'
import { VerifiedBadge } from '../components/VerifiedBadge'

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()
  const map: Record<string, { label: string; color: string }> = {
    pending_transcription: { label: t('voiceMemo.statusPendingTranscription'), color: 'var(--warning-500)' },
    transcribing:          { label: t('voiceMemo.statusTranscribing'),          color: 'var(--primary-500)' },
    pending_analysis:      { label: t('voiceMemo.statusPendingAnalysis'),        color: 'var(--warning-500)' },
    analyzing:             { label: t('voiceMemo.statusAnalyzing'),              color: 'var(--primary-500)' },
    completed:             { label: t('voiceMemo.statusCompleted'),              color: 'var(--success-500)' },
    failed:                { label: t('voiceMemo.statusFailed'),                 color: 'var(--danger-500)' },
  }
  const cfg = map[status] ?? { label: status, color: 'var(--text-tertiary)' }
  return <span style={{ color: cfg.color, fontWeight: 500, fontSize: 'var(--font-size-sm)' }}>{cfg.label}</span>
}

function formatDate(s: string) {
  if (!s) return ''
  return new Date(s).toLocaleString()
}

export default function VoiceMemoDetailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id, memoId } = useParams<{ id: string; memoId: string }>()
  const [memo, setMemo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [reanalyzeLang, setReanalyzeLang] = useState<string>('')
  const [error, setError] = useState('')
  const [audioSrc, setAudioSrc] = useState<string>('')

  const load = async () => {
    if (!memoId) return
    try {
      const res = await getVoiceMemo(memoId)
      setMemo(res.data)
    } catch {
      setError('Sprachnotiz nicht gefunden')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [memoId])

  useEffect(() => {
    if (!memoId) return
    let objectUrl = ''
    api.get(`/voice-memos/${memoId}/audio`, { responseType: 'blob' })
      .then((res: any) => {
        objectUrl = URL.createObjectURL(res.data)
        setAudioSrc(objectUrl)
      })
      .catch(() => {})
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [memoId])

  useEffect(() => {
    if (!memo) return
    const pending = ['pending_transcription', 'transcribing', 'pending_analysis', 'analyzing']
    if (!pending.includes(memo.analysis_status)) return
    const timer = setTimeout(load, 4000)
    return () => clearTimeout(timer)
  }, [memo])

  const handleDelete = async () => {
    if (!window.confirm(t('voiceMemo.deleteConfirm'))) return
    setDeleting(true)
    try {
      await deleteVoiceMemo(memoId!)
      navigate(`/animals/${id}`)
    } catch {
      setError('Löschen fehlgeschlagen')
      setDeleting(false)
    }
  }

  const handleRetry = async () => {
    setRetrying(true)
    try {
      await retryVoiceMemo(memoId!)
      await load()
    } catch {
      setError('Erneut analysieren fehlgeschlagen')
    } finally {
      setRetrying(false)
    }
  }

  const handleReanalyze = async () => {
    setReanalyzing(true)
    try {
      const lang = reanalyzeLang || memo?.language_mode || 'de'
      await reanalyzeMemo(memoId!, lang)
      setMemo((m: any) => ({ ...m, language_mode: lang }))
      await load()
    } catch {
      setError('KI-Analyse fehlgeschlagen')
    } finally {
      setReanalyzing(false)
    }
  }

  const savePermissions = async (field: string, roles: string[]) => {
    setError('')
    try {
      const res = await patchVoiceMemo(memoId!, { [field]: roles })
      // Server may enforce roles (e.g. keep 'vet' on vet records); use what it saved
      const saved = (res.data as any)?.[field] ?? roles
      setMemo((m: any) => ({ ...m, [field]: saved }))
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Speichern fehlgeschlagen')
    }
  }

  if (loading) return <div style={{ padding: 'var(--space-6)' }}>{t('common.loading')}</div>
  if (error || !memo) return <div style={{ padding: 'var(--space-6)' }} className="error-card">{error || 'Fehler'}</div>

  const extracted = memo.extracted_json || {}
  const isBoth = memo.language_mode === 'both'

  return (
    <div style={{ maxWidth: 720, width: '100%', boxSizing: 'border-box', margin: '0 auto', padding: 'var(--space-4)', paddingBottom: 'calc(var(--bottom-nav-height) + var(--space-6))', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <button className="btn btn-ghost" onClick={() => navigate(`/animals/${id}`)} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          <ArrowLeft size={18} /> {t('common.back')}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
            <Mic size={20} color="var(--primary-500)" />
            <h1 style={{ margin: 0, fontSize: 'var(--font-size-xl)' }}>
              {extracted.title || extracted.title_de || formatDate(memo.created_at)}
            </h1>
          </div>
          <p className="text-muted" style={{ margin: '0 0 var(--space-2)' }}>{formatDate(memo.created_at)}</p>
          <StatusBadge status={memo.analysis_status} />
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {memo.analysis_status === 'failed' && (
            <button className="btn btn-outline" onClick={handleRetry} disabled={retrying} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
              <RefreshCw size={16} /> {retrying ? t('common.loading') : t('common.retry')}
            </button>
          )}
          {memo.transcription_text && ['completed', 'failed'].includes(memo.analysis_status) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{t('voiceMemo.reanalyzeLang')}:</span>
              <select
                value={reanalyzeLang || memo.language_mode || 'de'}
                onChange={e => setReanalyzeLang(e.target.value)}
                disabled={reanalyzing}
                style={{ fontSize: 'var(--font-size-sm)', padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}
              >
                <option value="de">{t('voiceMemo.languageDe')}</option>
                <option value="en">{t('voiceMemo.languageEn')}</option>
                <option value="both">{t('voiceMemo.languageBoth')}</option>
              </select>
              <button className="btn btn-outline" onClick={handleReanalyze} disabled={reanalyzing} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', whiteSpace: 'nowrap' }}>
                <RefreshCw size={16} /> {reanalyzing ? t('common.loading') : t('voiceMemo.reanalyzeAi')}
              </button>
            </div>
          )}
          {memo.analysis_status === 'failed' && memo.error_message && (
            <div className="error-card" style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-sm)', padding: 'var(--space-2) var(--space-3)' }}>
              {memo.error_message}
            </div>
          )}
          {memo.analysis_status === 'completed' && memo.error_message && (
            <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-sm)', padding: 'var(--space-2) var(--space-3)', background: 'var(--warning-50, #fffbeb)', border: '1px solid var(--warning-200, #fde68a)', borderRadius: 'var(--radius-sm)', color: 'var(--warning-700, #92400e)' }}>
              {memo.error_message}
            </div>
          )}
          {memo.can_delete && (
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleting} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
              <Trash2 size={16} /> {deleting ? t('common.loading') : t('common.delete')}
            </button>
          )}
        </div>
      </div>

      {/* Added by */}
      <div className="card" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span className="text-muted" style={{ fontSize: 'var(--font-size-sm)' }}>{t('voiceMemo.addedBy')}:</span>
        <VerifiedBadge name={memo.added_by_name || 'Tierarzt'} verified={memo.added_by_verified === 1} role="vet" />
        {!memo.added_by_verified && <span style={{ fontSize: 'var(--font-size-sm)' }}>{memo.added_by_name || 'Tierarzt'}</span>}
        {memo.ai_provider && (
          <span className="badge" style={{ marginLeft: 'auto', fontSize: 10 }}>{memo.ai_provider}</span>
        )}
      </div>

      {/* Audio player */}
      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <h3 style={{ margin: '0 0 var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Mic size={16} /> {t('voiceMemo.playAudio')}
        </h3>
        {audioSrc
          ? <audio controls src={audioSrc} style={{ width: '100%' }} />
          : <p className="text-muted" style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>{t('common.loading')}</p>
        }
        {memo.allowed_roles !== undefined && (
          <PermissionRow label={t('voiceMemo.permAllowedRoles')} field="allowed_roles" current={memo.allowed_roles} onSave={savePermissions} lockVet={String(memo.added_by_role || '').includes('vet')} />
        )}
      </div>

      {/* AI Memo */}
      {memo.extracted_json && (
        <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
          <h3 style={{ margin: '0 0 var(--space-3)' }}>{t('voiceMemo.memo')}</h3>
          {isBoth ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>
              {(['de', 'en'] as const).map(lang => (
                <div key={lang}>
                  <p className="text-muted" style={{ margin: '0 0 var(--space-1)', fontSize: 'var(--font-size-xs)', fontWeight: 600, textTransform: 'uppercase' }}>{lang === 'de' ? 'Deutsch' : 'English'}</p>
                  {extracted[`title_${lang}`] && <p style={{ margin: '0 0 var(--space-2)', fontWeight: 600 }}>{extracted[`title_${lang}`]}</p>}
                  {extracted[`summary_${lang}`] && <p className="text-muted" style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--font-size-sm)' }}>{extracted[`summary_${lang}`]}</p>}
                  {extracted[`content_${lang}`] && <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', whiteSpace: 'pre-wrap' }}>{extracted[`content_${lang}`]}</p>}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ marginBottom: 'var(--space-3)' }}>
              {extracted.summary && <p className="text-muted" style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--font-size-sm)' }}>{extracted.summary}</p>}
              {extracted.content && <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 'var(--font-size-sm)' }}>{extracted.content}</p>}
            </div>
          )}

          {/* Structured details table */}
          {extracted.details && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)', marginTop: 'var(--space-1)' }}>
              <p style={{ margin: '0 0 var(--space-2)', fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{t('voiceMemo.details')}</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)', tableLayout: 'fixed', wordBreak: 'break-word' }}>
                <tbody>
                  {extracted.details.diagnose && (
                    <tr>
                      <td style={{ padding: '4px 8px 4px 0', fontWeight: 500, verticalAlign: 'top', color: 'var(--text-secondary)', width: '30%' }}>{t('voiceMemo.detailDiagnose')}</td>
                      <td style={{ padding: '4px 0' }}>{extracted.details.diagnose}</td>
                    </tr>
                  )}
                  {extracted.details.befunde && (
                    <tr>
                      <td style={{ padding: '4px 8px 4px 0', fontWeight: 500, verticalAlign: 'top', color: 'var(--text-secondary)' }}>{t('voiceMemo.detailBefunde')}</td>
                      <td style={{ padding: '4px 0' }}>{extracted.details.befunde}</td>
                    </tr>
                  )}
                  {extracted.details.vorgehen?.length > 0 && (
                    <tr>
                      <td style={{ padding: '4px 8px 4px 0', fontWeight: 500, verticalAlign: 'top', color: 'var(--text-secondary)' }}>{t('voiceMemo.detailVorgehen')}</td>
                      <td style={{ padding: '4px 0' }}><ul style={{ margin: 0, paddingLeft: 'var(--space-3)' }}>{extracted.details.vorgehen.map((v: string, i: number) => <li key={i}>{v}</li>)}</ul></td>
                    </tr>
                  )}
                  {extracted.details.medikamente?.length > 0 && (
                    <tr>
                      <td style={{ padding: '4px 8px 4px 0', fontWeight: 500, verticalAlign: 'top', color: 'var(--text-secondary)' }}>{t('voiceMemo.detailMedikamente')}</td>
                      <td style={{ padding: '4px 0' }}><ul style={{ margin: 0, paddingLeft: 'var(--space-3)' }}>{extracted.details.medikamente.map((m: string, i: number) => <li key={i}>{m}</li>)}</ul></td>
                    </tr>
                  )}
                  {extracted.details.termine?.length > 0 && (
                    <tr>
                      <td style={{ padding: '4px 8px 4px 0', fontWeight: 500, verticalAlign: 'top', color: 'var(--text-secondary)' }}>{t('voiceMemo.detailTermine')}</td>
                      <td style={{ padding: '4px 0' }}><ul style={{ margin: 0, paddingLeft: 'var(--space-3)' }}>{extracted.details.termine.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {extracted.action_items?.length > 0 && (
            <div style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border)' }}>
              <p style={{ margin: '0 0 var(--space-2)', fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{t('voiceMemo.actionItems')}</p>
              <ul style={{ margin: 0, paddingLeft: 'var(--space-4)' }}>
                {extracted.action_items.map((item: string, i: number) => <li key={i} style={{ fontSize: 'var(--font-size-sm)' }}>{item}</li>)}
              </ul>
            </div>
          )}
          {extracted.tags?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)', marginTop: 'var(--space-3)' }}>
              {extracted.tags.map((tag: string) => <span key={tag} className="badge" style={{ fontSize: 10 }}>{tag}</span>)}
            </div>
          )}
          {memo.summary_roles !== undefined && (
            <PermissionRow label={t('voiceMemo.permSummaryRoles')} field="summary_roles" current={memo.summary_roles} onSave={savePermissions} lockVet={String(memo.added_by_role || '').includes('vet')} />
          )}
        </div>
      )}

      {/* Transcription */}
      {memo.transcription_text && (
        <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
          <h3 style={{ margin: '0 0 var(--space-3)' }}>{t('voiceMemo.transcription')}</h3>
          <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>{memo.transcription_text}</p>
          {memo.transcription_roles !== undefined && (
            <PermissionRow label={t('voiceMemo.permTranscriptionRoles')} field="transcription_roles" current={memo.transcription_roles} onSave={savePermissions} lockVet={String(memo.added_by_role || '').includes('vet')} />
          )}
        </div>
      )}


      {/* AI Debug — vet/creator only */}
      {memo.ai_debug_json && (
        <DebugPanel rawJson={memo.ai_debug_json} label="KI Debug" />
      )}

      {/* Gladia Debug — vet/creator only */}
      {memo.gladia_debug_json && (
        <DebugPanel rawJson={memo.gladia_debug_json} label="Gladia Debug" />
      )}
    </div>
  )
}

function PermissionRow({ label, field, current, onSave, lockVet }: { label: string; field: string; current: string[]; onSave: (f: string, r: string[]) => void; lockVet?: boolean }) {
  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
      <p style={{ margin: '0 0 var(--space-1)', fontWeight: 500, fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{label}</p>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {(['vet', 'authority', 'guest'] as const).map(role => {
          const checked = (current || []).includes(role)
          // Vet-created records stay visible to vets; that can't be toggled off.
          const locked = role === 'vet' && lockVet
          return (
            <label key={role} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', cursor: locked ? 'not-allowed' : 'pointer', fontSize: 'var(--font-size-sm)', opacity: locked ? 0.6 : 1 }}>
              <input type="checkbox" checked={locked ? true : checked} disabled={locked} onChange={() => {
                const next = checked ? (current || []).filter(r => r !== role) : [...(current || []), role]
                onSave(field, next)
              }} />
              {role}
            </label>
          )
        })}
      </div>
    </div>
  )
}

function DebugPanel({ rawJson, label }: { rawJson: string; label: string }) {
  const [open, setOpen] = useState(false)
  let parsed: any = null
  try { parsed = JSON.parse(rawJson) } catch { parsed = rawJson }

  return (
    <div className="card" style={{ marginBottom: 'var(--space-4)', border: '1px solid var(--warning-300)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 0, fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--warning-700)' }}
      >
        {label}
        <span style={{ fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <pre style={{ marginTop: 'var(--space-3)', fontSize: 11, background: 'var(--surface-muted)', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', overflowWrap: 'break-word' }}>
          {JSON.stringify(parsed, null, 2)}
        </pre>
      )}
    </div>
  )
}
