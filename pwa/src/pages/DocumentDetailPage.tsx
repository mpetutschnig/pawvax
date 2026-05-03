import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getDocument, deleteDocument, patchDocument, getAnimalDocuments, getMe } from '../api/rest'
import { generateICS, downloadBlob } from '../utils/ics'
import { PageHeader } from '../components/PageHeader'
import { Shield, Pill, FileText, PawPrint, Landmark, Calendar, Download, Mail, Tag, Save, X, Edit2, Trash2, CheckCircle } from 'lucide-react'
import { TagCombobox } from '../components/TagCombobox'

export default function DocumentDetailPage() {
  const { id: animalId, docId } = useParams<{ id: string; docId: string }>()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const [doc, setDoc] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reminderMode, setReminderMode] = useState(false)
  const [reminderTitle, setReminderTitle] = useState('')
  const [reminderDate, setReminderDate] = useState('')
  const [reminderNotes, setReminderNotes] = useState('')
  
  const [tags, setTags] = useState<string[]>([])
  const [allExistingTags, setAllExistingTags] = useState<string[]>([])
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [visibility, setVisibility] = useState<string[]>([])
  const [showJsonDetails, setShowJsonDetails] = useState(false)
  
  const [showRetryModal, setShowRetryModal] = useState(false)
  const [retryProvider, setRetryProvider] = useState('google')
  const [retryModel, setRetryModel] = useState('gemini-3.1-flash-lite-preview')

  const [hasGemini, setHasGemini] = useState(false)
  const [hasAnthropic, setHasAnthropic] = useState(false)
  const [hasOpenai, setHasOpenai] = useState(false)
  const [hasSystemAi, setHasSystemAi] = useState(true)
  const hasAnyKey = hasGemini || hasAnthropic || hasOpenai || hasSystemAi
  const [availableModels] = useState<any>({
    google: [
      { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash-Lite' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' }
    ],
    anthropic: [
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' }
    ],
    openai: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4o', name: 'GPT-4o' }
    ]
  })

  const docTypeConfig: Record<string, { label: string; icon: React.ReactNode }> = {
    vaccination: { label: t('animal.docTypeVaccination'), icon: <Shield size={20} /> },
    medication: { label: t('animal.docTypeMedication'), icon: <Pill size={20} /> },
    other: { label: t('animal.docTypeOther'), icon: <FileText size={20} /> }
  }

  useEffect(() => {
    if (docId) loadDocument()
  }, [docId])

  useEffect(() => {
    getMe().then(res => {
      setHasGemini(res.data.has_gemini_token)
      setHasAnthropic(res.data.has_anthropic_token)
      setHasOpenai(res.data.has_openai_token)
      
      let prio = ['system', 'google', 'anthropic', 'openai']
      try { if (res.data.ai_provider_priority) prio = typeof res.data.ai_provider_priority === 'string' ? JSON.parse(res.data.ai_provider_priority) : res.data.ai_provider_priority } catch {}
      setHasSystemAi(prio.includes('system'))

      if (res.data.has_gemini_token) {
        setRetryProvider('google')
        setRetryModel('gemini-3.1-flash-lite-preview')
      } else if (res.data.has_anthropic_token) {
        setRetryProvider('anthropic')
        setRetryModel('claude-3-5-sonnet-20241022')
      } else if (res.data.has_openai_token) {
        setRetryProvider('openai')
        setRetryModel('gpt-4o-mini')
      }
    }).catch(err => console.error(err))
  }, [])

  const loadDocument = async () => {
    try {
      const res = await getDocument(docId!)
      setDoc(res.data)
      setTags(res.data.extracted_json?.suggested_tags || [])
      try {
        setVisibility(res.data.allowed_roles ? JSON.parse(res.data.allowed_roles) : [])
      } catch { setVisibility([]) }
      setError(null)
    } catch (err) {
      setError(t('common.error'))
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (animalId) {
      getAnimalDocuments(animalId)
        .then((res: any) => {
          const tagSet = new Set<string>()
          res.data.forEach((d: any) => {
            const suggestedTags = d.extracted_json?.suggested_tags || []
            suggestedTags.forEach((t: string) => tagSet.add(t))
          })
          setAllExistingTags(Array.from(tagSet))
        })
        .catch(() => {})
    }
  }, [animalId])

  const handleCreateReminder = () => {
    const json = doc?.extracted_json || {}
    let title = docTypeConfig[doc?.doc_type]?.label ?? doc?.doc_type ?? 'Dokument'
    let date = json.document_date || ''
    
    if (doc?.doc_type === 'vaccination' && json.vaccinations?.[0]) {
      title += `: ${json.vaccinations[0].vaccine}`
      if (json.vaccinations[0].nextDue) date = json.vaccinations[0].nextDue
    } else if (doc?.doc_type === 'medication' && json.medications?.[0]) {
      title += `: ${json.medications[0].name}`
      if (json.medications[0].endDate) date = json.medications[0].endDate
    }

    if (json.animal?.name) {
      title = `${json.animal.name} - ${title}`
    }

    const isoDateRegex = /^\d{4}-\d{2}-\d{2}/
    if (date && isoDateRegex.test(date)) {
      date = date.substring(0, 10)
    } else {
      date = ''
    }

    setReminderTitle(title)
    setReminderDate(date)
    setReminderMode(true)
  }

  const handleDownloadReminder = () => {
    const ics = generateICS({
      title: reminderTitle,
      date: reminderDate,
      description: reminderNotes
    })
    downloadBlob(ics, 'reminder.ics', 'text/calendar')
    setReminderMode(false)
    setReminderTitle('')
    setReminderDate('')
    setReminderNotes('')
  }

  const handleEmailReminder = () => {
    const userEmail = localStorage.getItem('userEmail') || 'selbst'
    const subject = encodeURIComponent(`PAW Reminder: ${reminderTitle}`)
    const body = encodeURIComponent(`Titel: ${reminderTitle}\nDatum: ${reminderDate}\n\n${reminderNotes}`)
    window.open(`mailto:${userEmail}?subject=${subject}&body=${body}`)
  }

  const handleSaveDoc = async () => {
    setSaving(true)
    try {
      const updates: any = {}
      if (doc.isOwner) updates.allowed_roles = visibility
      if (canEditTags) updates.extracted_json = { ...doc.extracted_json, suggested_tags: tags }

      await patchDocument(docId!, updates)
      setEditMode(false)
      loadDocument()
    } catch (err: any) {
      setError(err.response?.data?.error || t('profile.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteDoc = async () => {
    if (!confirm(t('docDetail.deleteConfirm'))) return
    setSaving(true)
    try {
      await deleteDocument(docId!)
      navigate(`/animals/${animalId}`)
    } catch (err: any) {
      setError(err.response?.data?.error || t('docDetail.deleteError'))
      setSaving(false)
    }
  }
  
  const handleRetryAnalysis = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/documents/${docId}/retry-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ provider: retryProvider, model: retryModel })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || t('animal.documentFailed'))
      }
      setShowRetryModal(false)
      loadDocument()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }


  const removeTag = (t: string) => {
    setTags(tags.filter(x => x !== t))
  }

  const handleProviderChange = (prov: string) => {
    setRetryProvider(prov)
    if (prov === 'google') setRetryModel('gemini-3.1-flash-lite-preview')
    else if (prov === 'anthropic') setRetryModel('claude-3-5-sonnet-20241022')
    else if (prov === 'openai') setRetryModel('gpt-4o-mini')
  }

  if (loading) return <div className="container page" style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}><div className="spinner spinner-lg"></div></div>
  if (!doc && error) return <div className="container page"><div className="error-card"><p>{error}</p></div></div>
  if (!doc) return <div className="container page"><div className="error-card"><p>{t('error.notFound')}</p></div></div>

  const extracted = doc.extracted_json || {}
  const rawText = extracted.rawText || extracted.raw_text || ''
  const config = docTypeConfig[doc.doc_type] || docTypeConfig.other

  const canEditTags = doc.isUploader || doc.added_by_role !== 'vet'
  const canEditVisibility = doc.isOwner

  // Eigener "Screen" für die Analyse, der die Detailansicht komplett überlagert
  if (showRetryModal) {
    return (
      <div className="container page">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)', marginTop: 'var(--space-2)' }}>
          <button className="btn btn-ghost" style={{ padding: '8px', margin: '-8px' }} onClick={() => { setShowRetryModal(false); setError(null); }}>
            <X size={24} />
          </button>
          <h1 style={{ margin: 0, fontSize: 'var(--font-size-xl)' }}>{t('docDetail.aiAnalysis')}</h1>
        </div>
        
        {error && <div className="error-card" style={{ marginBottom: 'var(--space-4)' }}><p>{error}</p></div>}

        <div className="card animate-slide-up" style={{ borderColor: 'var(--primary-200)' }}>
          <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>
            {t('docDetail.aiSelectProvider')}
          </p>
          
          {!hasAnyKey ? (
            <div className="error-card" style={{ marginBottom: 'var(--space-4)' }}>
              <p style={{ margin: 0 }}>{t('docDetail.noProvidersConfigured')}</p>
            </div>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label">{t('docDetail.provider')}</label>
                <select className="form-select" value={retryProvider} onChange={e => handleProviderChange(e.target.value)}>
                  {(hasGemini || hasSystemAi) && <option value="google">Google Gemini</option>}
                  {(hasAnthropic || hasSystemAi) && <option value="anthropic">Anthropic Claude</option>}
                  {(hasOpenai || hasSystemAi) && <option value="openai">OpenAI</option>}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t('docDetail.model')}</label>
                <select className="form-select" value={retryModel} onChange={e => setRetryModel(e.target.value)}>
                  {retryProvider === 'google' && (
                    availableModels.google.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)
                  )}
                  {retryProvider === 'anthropic' && (
                    availableModels.anthropic.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)
                  )}
                  {retryProvider === 'openai' && (
                    availableModels.openai.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)
                  )}
                </select>
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
            {hasAnyKey && (
              <button className="btn btn-primary flex-1" onClick={handleRetryAnalysis} disabled={saving}>
                {saving ? t('animal.retrying') : t('animal.analyzeBtn')}
              </button>
            )}
            <button className="btn btn-ghost flex-1" onClick={() => { setShowRetryModal(false); setError(null); }} disabled={saving}>
              {t('docScan.saveForLater')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container page">
      <PageHeader title={doc.extracted_json?.title || config.label} backTo={`/animals/${animalId}`} showThemeToggle />
      {error && <div className="error-card" style={{ marginBottom: 'var(--space-4)' }}><p>{error}</p></div>}

      <div className="card animate-slide-up">
        {doc.added_by_role === 'vet' && (
          <div style={{
            background: 'var(--success-50)', border: '1px solid var(--success-200)',
            borderRadius: 'var(--radius-md)', padding: 'var(--space-3)',
            marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)'
          }}>
            <div style={{ background: 'var(--success-100)', padding: '8px', borderRadius: '50%' }}>
              <CheckCircle size={24} color="var(--success-600)" />
            </div>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--success-800)', fontSize: 'var(--font-size-sm)' }}>
                {t('docDetail.vetVerified')}
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--success-700)' }}>
                {t('docDetail.vetVerifiedDesc')}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
          <span className="badge badge-primary">
            {doc.ocr_provider || t('common.error')}
          </span>
          {doc.added_by_role === 'vet' && (
            <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <PawPrint size={12} /> {t('animal.vet')}
            </span>
          )}
          {doc.added_by_role === 'authority' && (
            <span className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Landmark size={12} /> {t('animal.authority')}
            </span>
          )}
        </div>

        <p className="text-tertiary" style={{ fontSize: 'var(--font-size-xs)', marginBottom: 'var(--space-4)' }}>
          {t('docDetail.addedAt')} {new Date(doc.created_at).toLocaleString(i18n.language === 'de' ? 'de-AT' : 'en-GB')}
        </p>

        {doc.image_path && (
          <div style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 'var(--space-6)', border: '1px solid var(--border)' }}>
            <img
              src={`/uploads/${doc.image_path.split('/').pop()}`}
              alt="Dokument"
              style={{ width: '100%', display: 'block' }}
            />
          </div>
        )}

        {extracted.summary && (
          <div style={{ background: 'var(--primary-50)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-6)', borderLeft: '4px solid var(--primary-500)' }}>
            <h4 style={{ margin: '0 0 var(--space-2) 0', color: 'var(--primary-700)' }}>{t('docDetail.summary')}</h4>
            <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--primary-900)' }}>{extracted.summary}</p>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
          <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, margin: 0, display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Tag size={18} /> {t('docDetail.sharedWith')}
          </h3>
          {!editMode && (canEditTags || canEditVisibility) && (
            <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => setEditMode(true)}>
              <Edit2 size={14} /> {t('docDetail.edit')}
            </button>
          )}
        </div>

        {editMode ? (
          <div style={{ background: 'var(--surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-6)' }}>
            {canEditTags && (
              <div className="form-group">
                <label className="form-label">{t('docDetail.tagAdd')}</label>
                <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', flexWrap: 'wrap' }}>
                  {tags.map(t => (
                    <span key={t} className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {t} <X size={12} style={{ cursor: 'pointer' }} onClick={() => removeTag(t)} />
                    </span>
                  ))}
                </div>
                <TagCombobox
                  existingTags={allExistingTags}
                  currentTags={tags}
                  placeholder={t('docDetail.tagPlaceholder')}
                  addLabel={t('docDetail.tagAdd')}
                  onAdd={(tag) => setTags(prev => [...prev, tag])}
                />
              </div>
            )}

            {canEditVisibility && (
              <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                <label className="form-label">{t('docScan.whoCanSee')}</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {[{ id: 'vet', label: t('docScan.vet') }, { id: 'authority', label: t('docScan.authority') }, { id: 'guest', label: t('docScan.guestAccess') }].map(r => (
                    <label key={r.id} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={visibility.includes(r.id)} 
                        onChange={(e) => {
                          if (e.target.checked) setVisibility([...visibility, r.id])
                          else setVisibility(visibility.filter(role => role !== r.id))
                        }} 
                        style={{ width: 16, height: 16, accentColor: 'var(--primary-500)' }}
                      />
                      <span style={{ fontSize: 'var(--font-size-sm)' }}>{r.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
              <button className="btn btn-primary" onClick={handleSaveDoc} disabled={saving}><Save size={16} /> {t('docDetail.save')}</button>
              <button className="btn btn-ghost" onClick={() => { setEditMode(false); loadDocument(); }} disabled={saving}>{t('docDetail.cancel')}</button>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 'var(--space-6)' }}>
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <h4 style={{ fontSize: 'var(--font-size-sm)', margin: '0 0 var(--space-2) 0', color: 'var(--text-secondary)' }}>{t('docDetail.tagAdd')}</h4>
              {tags.length > 0 ? (
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  {tags.map(t => <span key={t} className="badge badge-info">{t}</span>)}
                </div>
              ) : (
                <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)', margin: 0 }}>{t('docDetail.noTags')}</p>
              )}
            </div>

            <div>
              <h4 style={{ fontSize: 'var(--font-size-sm)', margin: '0 0 var(--space-2) 0', color: 'var(--text-secondary)' }}>{t('docDetail.sharedWith')}</h4>
              {visibility.length > 0 ? (
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  {visibility.map(r => (
                    <span key={r} className="badge" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                      {r === 'vet' ? t('docDetail.vetDoc') : r === 'authority' ? t('docDetail.authorityDoc') : t('docDetail.guestDoc')}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)', margin: 0 }}>{t('docDetail.onlyMe')}</p>
              )}
            </div>
          </div>
        )}

        {rawText && (
          <>
            <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>{t('docDetail.ocrText')}</h3>
            <pre
              style={{
                background: 'var(--surface)',
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--font-size-xs)',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '300px',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)'
              }}
            >
              {rawText}
            </pre>
          </>
        )}

        <div style={{ marginTop: 'var(--space-4)' }}>
          <button className="btn btn-ghost btn-full" onClick={() => setShowJsonDetails(!showJsonDetails)}>
            {showJsonDetails ? t('docDetail.jsonHide') : t('docDetail.jsonDetails')}
          </button>
          {showJsonDetails && (
             <pre style={{
                background: 'var(--surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)',
                fontSize: 'var(--font-size-xs)', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                maxHeight: '400px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 'var(--space-2)'
             }}>
               {JSON.stringify(extracted, null, 2)}
             </pre>
          )}
        </div>

        {!rawText && doc.analysis_status === 'pending_analysis' ? (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <button className="btn btn-primary btn-full" onClick={() => setShowRetryModal(true)}>
              {t('animal.retry')}
            </button>
          </div>
        ) : !rawText && (
          <p className="text-muted" style={{ marginTop: 'var(--space-4)', fontStyle: 'italic' }}>{t('docDetail.noOcr')}</p>
        )}

        {!reminderMode && (
          <button className="btn btn-primary btn-full" onClick={handleCreateReminder} style={{ marginTop: 'var(--space-6)' }}>
            <Calendar size={18} /> {t('docDetail.reminder')}
          </button>
        )}

        {(doc.isOwner || doc.isUploader) && !(doc.added_by_role === 'vet' && !doc.isUploader) && (
          <button
            className="btn btn-delete btn-full"
            onClick={handleDeleteDoc}
            disabled={saving}
            style={{ marginTop: 'var(--space-4)' }}
          >
            <Trash2 size={18} /> {t('docDetail.delete')}
          </button>
        )}

        {(doc.added_by_role === 'vet' && !doc.isUploader) && (
          <div style={{ marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--warning-50)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--warning-500)' }}>
            <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--warning-900)' }}>
              {t('docDetail.vetLock')}
            </p>
          </div>
        )}
      </div>

      {reminderMode && (
        <div className="card animate-slide-up" style={{ marginTop: 'var(--space-4)', borderColor: 'var(--primary-200)', background: 'var(--primary-50)' }}>
          <h3 style={{ marginTop: 0, marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Calendar size={20} color="var(--primary-600)" /> {t('docDetail.reminderTitle')}
          </h3>

          <div className="form-group">
            <label className="form-label">{t('docDetail.reminderTitleLabel')}</label>
            <input className="form-input" value={reminderTitle} onChange={e => setReminderTitle(e.target.value)} placeholder={t('docDetail.reminderTitlePlaceholder')} />
          </div>

          <div className="form-group">
            <label className="form-label">{t('docDetail.reminderDate')}</label>
            <input className="form-input" type="date" value={reminderDate} onChange={e => setReminderDate(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">{t('docDetail.reminderNotes')}</label>
            <textarea
              className="form-input"
              value={reminderNotes}
              onChange={e => setReminderNotes(e.target.value)}
              placeholder={t('docDetail.reminderNotesPlaceholder')}
              style={{ minHeight: '80px', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'grid', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
            <button className="btn btn-primary" onClick={handleDownloadReminder} disabled={!reminderDate}>
              <Download size={18} /> {t('docDetail.reminderDownload')}
            </button>
            <button className="btn btn-secondary" onClick={handleEmailReminder} disabled={!reminderDate}>
              <Mail size={18} /> {t('docDetail.reminderEmail')}
            </button>
            <button className="btn btn-ghost" onClick={() => setReminderMode(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
