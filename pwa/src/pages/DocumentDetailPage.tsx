import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getDocument, deleteDocument, patchDocument, getAnimalDocuments, getMe, createReminder, reanalyzeDocument, getDocumentHistory } from '../api/rest'
import { generateICS, downloadBlob } from '../utils/ics'
import { normalizeVaccinationRecord } from '../utils/vaccination'
import { PageHeader } from '../components/PageHeader'
import { Shield, Pill, FileText, PawPrint, Landmark, Calendar, Download, Mail, Tag, Save, X, Edit2, Trash2, CheckCircle, Award, GraduationCap, ChevronLeft, ChevronRight, Bell, AlertTriangle } from 'lucide-react'
import { TagCombobox } from '../components/TagCombobox'

export default function DocumentDetailPage() {
  const { id: animalId, docId } = useParams<{ id: string; docId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { t, i18n } = useTranslation()
  const [doc, setDoc] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reminderMode, setReminderMode] = useState(false)
  const [reminderTitle, setReminderTitle] = useState('')
  const [reminderDate, setReminderDate] = useState('')
  const [reminderNotes, setReminderNotes] = useState('')
  const [savedReminders, setSavedReminders] = useState<Set<string>>(new Set())
  const [savingReminder, setSavingReminder] = useState<string | null>(null)
  const [hideDuplicates, setHideDuplicates] = useState(true)
  
  const [tags, setTags] = useState<string[]>([])
  const [allExistingTags, setAllExistingTags] = useState<string[]>([])
  const [editMode, setEditMode] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [visibility, setVisibility] = useState<string[]>([])
  const [showJsonDetails, setShowJsonDetails] = useState(false)
  const [roles, setRoles] = useState<string[]>([])
  const [analysisHistory, setAnalysisHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  
  const [showRetryModal, setShowRetryModal] = useState(false)
  const [analysisAction, setAnalysisAction] = useState<'retry' | 'reanalyze'>('retry')
  const [retryProvider, setRetryProvider] = useState('google')
  const [retryModel, setRetryModel] = useState('gemini-3.1-flash-lite-preview')
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

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
    pet_passport: { label: t('animal.docTypePetPassport'), icon: <Landmark size={20} /> },
    pedigree: { label: t('animal.docTypePedigree'), icon: <Award size={20} /> },
    dog_certificate: { label: t('animal.docTypeDogCertificate'), icon: <GraduationCap size={20} /> },
    medical_product: { label: t('animal.docTypeMedicalProduct'), icon: <Pill size={20} /> },
    treatment: { label: t('animal.docTypeTreatment'), icon: <Pill size={20} /> },
    general: { label: t('animal.docTypeGeneral'), icon: <FileText size={20} /> },
    // Legacy fallbacks
    medication: { label: t('animal.docTypeMedicalProduct'), icon: <Pill size={20} /> },
    other: { label: t('animal.docTypeGeneral'), icon: <FileText size={20} /> }
  }

  useEffect(() => {
    if (docId) loadDocument()
  }, [docId])

  useEffect(() => {
    setCurrentImageIndex(0)
  }, [docId, doc?.id])

  useEffect(() => {
    const redirectedError = (location.state as { analysisError?: string } | null)?.analysisError
    if (redirectedError) {
      setError(redirectedError)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.pathname, location.state, navigate])

  useEffect(() => {
    getMe().then(res => {
      setRoles(res.data.roles || [])
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
    setHistoryLoading(true)
    try {
      const [docRes, historyRes] = await Promise.all([
        getDocument(docId!),
        getDocumentHistory(docId!).catch(() => null)
      ])
      setDoc(docRes.data)
      setTags(docRes.data.extracted_json?.suggested_tags || [])
      setEditedTitle(docRes.data.extracted_json?.title || '')
      try {
        setVisibility(docRes.data.allowed_roles ? JSON.parse(docRes.data.allowed_roles) : [])
      } catch { setVisibility([]) }
      setAnalysisHistory(historyRes?.data?.history || [])
      setError(null)
    } catch (err) {
      setError(t('common.error'))
      console.error(err)
    } finally {
      setHistoryLoading(false)
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

  const handleCreateInAppReminder = async (record: any, recordKey: string) => {
    const json = doc?.extracted_json || {}
    const animalName = json.animal?.name || ''
    const vaccination = normalizeVaccinationRecord(record)
    const targetDisease = vaccination.targetDisease
    const vaccineName = vaccination.vaccineName
    const dueDate = vaccination.validUntil

    if (!dueDate || !animalId) return
    const isoDate = /^\d{4}-\d{2}-\d{2}/.test(dueDate) ? dueDate.substring(0, 10) : ''
    if (!isoDate) return

    const titleParts: string[] = []
    if (animalName) titleParts.push(animalName)
    if (targetDisease) titleParts.push(targetDisease)
    if (vaccineName) titleParts.push(`(${vaccineName})`)
    titleParts.push('auffrischen')
    const title = titleParts.join(' \u2013 ')

    const notesParts: string[] = []
  if (vaccination.batchNumber) notesParts.push(`Charge: ${vaccination.batchNumber}`)
  if (vaccination.administrationDate) notesParts.push(`Verabreicht: ${vaccination.administrationDate}`)
  if (vaccination.veterinarianName) notesParts.push(`Tierarzt: ${vaccination.veterinarianName}`)
    const notes = notesParts.join('\n')

    setSavingReminder(recordKey)
    try {
      await createReminder({
        animal_id: animalId,
        document_id: docId,
        title,
        due_date: isoDate,
        notes: notes || undefined
      })
      setSavedReminders(prev => new Set([...prev, recordKey]))
    } catch {
      // ignore silently
    } finally {
      setSavingReminder(null)
    }
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
      if (canEditTags) updates.extracted_json = { ...doc.extracted_json, suggested_tags: tags, title: editedTitle }

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

  const handleReanalyze = async () => {
    setSaving(true)
    setError(null)
    try {
      await reanalyzeDocument(docId!, { provider: retryProvider, model: retryModel })
      setShowRetryModal(false)
      await loadDocument()
    } catch (err: any) {
      setError(err.response?.data?.error || t('common.error'))
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
  const documentImages = Array.from(new Set([doc.image_path, ...(doc.pages || [])].filter(Boolean)))
  const currentImage = documentImages[currentImageIndex] || null
  const canReanalyze = (doc.isOwner || roles.includes('admin')) && doc.analysis_status === 'completed'

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
          <h1 style={{ margin: 0, fontSize: 'var(--font-size-xl)' }}>{analysisAction === 'reanalyze' ? t('docDetail.reanalyze') : t('docDetail.aiAnalysis')}</h1>
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
              <button className="btn btn-primary flex-1" onClick={analysisAction === 'reanalyze' ? handleReanalyze : handleRetryAnalysis} disabled={saving}>
                {saving ? (analysisAction === 'reanalyze' ? t('docDetail.reanalyzing') : t('animal.retrying')) : (analysisAction === 'reanalyze' ? t('docDetail.reanalyze') : t('animal.analyzeBtn'))}
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
                {t('docDetail.vetVerified')} {doc.added_by_verified ? '✓' : ''}
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--success-700)' }}>
                {doc.added_by_name || t('common.unknown')}
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
              <PawPrint size={12} /> {doc.added_by_name || t('animal.vet')}
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

        {currentImage && (
          <div style={{ marginBottom: 'var(--space-6)' }}>
            <div style={{ position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <img
                src={`/uploads/${currentImage.split('/').pop()}`}
                alt={`Dokumentseite ${currentImageIndex + 1}`}
                style={{ width: '100%', display: 'block', maxHeight: '540px', objectFit: 'contain', background: 'var(--surface)' }}
              />

              {documentImages.length > 1 && (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setCurrentImageIndex(index => (index === 0 ? documentImages.length - 1 : index - 1))}
                    style={{ position: 'absolute', left: 'var(--space-3)', top: '50%', transform: 'translateY(-50%)', borderRadius: '999px', padding: '10px', minWidth: 0 }}
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setCurrentImageIndex(index => (index === documentImages.length - 1 ? 0 : index + 1))}
                    style={{ position: 'absolute', right: 'var(--space-3)', top: '50%', transform: 'translateY(-50%)', borderRadius: '999px', padding: '10px', minWidth: 0 }}
                    aria-label="Next page"
                  >
                    <ChevronRight size={18} />
                  </button>
                  <div style={{ position: 'absolute', right: 'var(--space-3)', bottom: 'var(--space-3)', background: 'rgba(15, 23, 42, 0.72)', color: 'white', borderRadius: '999px', padding: '4px 10px', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>
                    {currentImageIndex + 1} / {documentImages.length}
                  </div>
                </>
              )}
            </div>

            {documentImages.length > 1 && (
              <div style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto', paddingTop: 'var(--space-3)' }}>
                {documentImages.map((imagePath, index) => (
                  <button
                    key={imagePath}
                    type="button"
                    onClick={() => setCurrentImageIndex(index)}
                    style={{ border: index === currentImageIndex ? '2px solid var(--primary-500)' : '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 0, overflow: 'hidden', background: 'var(--surface)', cursor: 'pointer', flex: '0 0 72px', opacity: index === currentImageIndex ? 1 : 0.7 }}
                    aria-label={`Page ${index + 1}`}
                  >
                    <img src={`/uploads/${imagePath.split('/').pop()}`} alt={`Seite ${index + 1}`} style={{ width: '72px', height: '72px', objectFit: 'cover', display: 'block' }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {extracted.summary && (
          <div style={{ background: 'var(--primary-50)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-6)', borderLeft: '4px solid var(--primary-500)' }}>
            <h4 style={{ margin: '0 0 var(--space-2) 0', color: 'var(--primary-700)' }}>{t('docDetail.summary')}</h4>
            <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--primary-900)' }}>{extracted.summary}</p>
          </div>
        )}

        <div style={{ marginBottom: 'var(--space-6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
            <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, margin: 0 }}>{t('docDetail.analysisHistory')}</h3>
            {canReanalyze && (
              <button className="btn btn-secondary" onClick={() => { setAnalysisAction('reanalyze'); setShowRetryModal(true); setError(null) }} disabled={saving}>
                {t('docDetail.reanalyze')}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div className="card" style={{ padding: 'var(--space-4)', borderLeft: '4px solid var(--primary-400)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <strong>{t('docDetail.currentAnalysis')}</strong>
                <span className="text-muted">{doc.ocr_provider || 'unknown'}</span>
              </div>
              <p style={{ margin: '8px 0 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                {new Date(doc.created_at).toLocaleString(i18n.language === 'de' ? 'de-AT' : 'en-GB')}
              </p>
            </div>
            {analysisHistory.map((entry: any) => (
              <div key={entry.id} className="card" style={{ padding: 'var(--space-4)', borderLeft: '4px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <strong>{t('docDetail.previousVersion', { version: entry.version })}</strong>
                  <span className="text-muted">{entry.ocr_provider || 'unknown'}</span>
                </div>
                <p style={{ margin: '8px 0 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                  {new Date(entry.created_at).toLocaleString(i18n.language === 'de' ? 'de-AT' : 'en-GB')}
                </p>
                {(entry.extracted_json?.summary || entry.extracted_json?.title) && (
                  <p style={{ margin: '8px 0 0 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
                    {entry.extracted_json?.title || entry.extracted_json?.summary}
                  </p>
                )}
              </div>
            ))}
            {!analysisHistory.length && !historyLoading && (
              <p className="text-muted" style={{ margin: 0 }}>{t('docDetail.noPreviousVersions')}</p>
            )}
          </div>
        </div>

        {/* Singleton duplicate warning */}
        {doc.doc_type !== 'vaccination' && doc.doc_type !== 'treatment' && (() => {
          const dupeDocId = extracted.page_results?.find((p: any) => p._duplicate)?._source_document_id
          if (!dupeDocId) return null
          return (
            <div style={{ background: 'var(--warning-50)', border: '1px solid var(--warning-200)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
              <AlertTriangle size={18} color="var(--warning-600)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 'var(--font-size-sm)' }}>
                <strong style={{ color: 'var(--warning-800)' }}>{t('docDetail.duplicateWarning')}</strong>
                <br />
                <span style={{ color: 'var(--warning-700)' }}>{t('docDetail.duplicateHint')} </span>
                <a href={`/animals/${animalId}/documents/${dupeDocId}`} style={{ color: 'var(--primary-600)', textDecoration: 'underline' }}>{t('docDetail.duplicateViewOriginal')}</a>
              </div>
            </div>
          )
        })()}

        {doc.doc_type === 'pet_passport' && (() => {
          const identification = extracted.identification || extracted.payload?.identification || {}
          const owner = extracted.owner || extracted.payload?.owner || {}
          const breeder = extracted.breeder || extracted.payload?.breeder || {}
          const issuingAuthority = extracted.issuing_authority || extracted.payload?.issuing_authority || {}
          const animal = extracted.animal || extracted.payload?.animal || {}
          return (
            <div style={{ marginBottom: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div className="card" style={{ padding: 'var(--space-4)' }}>
                <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, margin: '0 0 var(--space-3) 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Landmark size={18} /> {t('animal.docTypePetPassport')}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', fontSize: 'var(--font-size-xs)' }}>
                  {extracted.passport_number && <div><span style={{ color: 'var(--text-tertiary)' }}>{t('docDetail.passportNumber')}</span><br /><strong>{extracted.passport_number}</strong></div>}
                  {extracted.section_type && <div><span style={{ color: 'var(--text-tertiary)' }}>{t('docDetail.sectionType')}</span><br /><strong>{extracted.section_type}</strong></div>}
                  {identification.chip_code && <div><span style={{ color: 'var(--text-tertiary)' }}>{t('docDetail.chipCode')}</span><br /><strong>{identification.chip_code}</strong></div>}
                  {identification.chip_location && <div><span style={{ color: 'var(--text-tertiary)' }}>{t('docDetail.chipLocation')}</span><br /><strong>{identification.chip_location}</strong></div>}
                </div>
              </div>
              {Object.keys(animal).length > 0 && (
                <div className="card" style={{ padding: 'var(--space-4)' }}>
                  <strong style={{ display: 'block', marginBottom: 'var(--space-2)' }}>{t('docDetail.passportAnimal')}</strong>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', fontSize: 'var(--font-size-xs)' }}>
                    {animal.name && <div><span style={{ color: 'var(--text-tertiary)' }}>{t('animals.name')}</span><br /><strong>{animal.name}</strong></div>}
                    {animal.breed && <div><span style={{ color: 'var(--text-tertiary)' }}>{t('animal.breed')}</span><br /><strong>{animal.breed}</strong></div>}
                    {animal.birthdate && <div><span style={{ color: 'var(--text-tertiary)' }}>{t('animal.birthdate')}</span><br /><strong>{animal.birthdate}</strong></div>}
                    {animal.color && <div><span style={{ color: 'var(--text-tertiary)' }}>Color</span><br /><strong>{animal.color}</strong></div>}
                  </div>
                </div>
              )}
              {Object.keys(owner).length > 0 && (
                <div className="card" style={{ padding: 'var(--space-4)' }}>
                  <strong style={{ display: 'block', marginBottom: 'var(--space-2)' }}>{t('docDetail.owner')}</strong>
                  <div style={{ fontSize: 'var(--font-size-sm)' }}>{[owner.first_name, owner.surname].filter(Boolean).join(' ') || '—'}</div>
                  <div className="text-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{[owner.address, owner.postcode, owner.city, owner.country].filter(Boolean).join(', ')}</div>
                </div>
              )}
              {Object.keys(breeder).length > 0 && (
                <div className="card" style={{ padding: 'var(--space-4)' }}>
                  <strong style={{ display: 'block', marginBottom: 'var(--space-2)' }}>{t('docDetail.breeder')}</strong>
                  <div style={{ fontSize: 'var(--font-size-sm)' }}>{breeder.name || breeder.contact_person || '—'}</div>
                  <div className="text-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{[breeder.address, breeder.postcode, breeder.city, breeder.country].filter(Boolean).join(', ')}</div>
                </div>
              )}
              {Object.keys(issuingAuthority).length > 0 && (
                <div className="card" style={{ padding: 'var(--space-4)' }}>
                  <strong style={{ display: 'block', marginBottom: 'var(--space-2)' }}>{t('docDetail.issuingAuthority')}</strong>
                  <div style={{ fontSize: 'var(--font-size-sm)' }}>{issuingAuthority.name || '—'}</div>
                  <div className="text-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{[issuingAuthority.address, issuingAuthority.postcode, issuingAuthority.city, issuingAuthority.country].filter(Boolean).join(', ')}</div>
                </div>
              )}
            </div>
          )
        })()}

        {doc.doc_type === 'vaccination' && (() => {
          const allRecords: any[] = extracted.payload?.vaccinations || extracted.vaccinations || []
          if (allRecords.length === 0) return null
          const duplicateCount = allRecords.filter((r: any) => r._duplicate).length
          const visibleRecords = hideDuplicates ? allRecords.filter((r: any) => !r._duplicate) : allRecords
          return (
            <div style={{ marginBottom: 'var(--space-6)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Shield size={18} /> {t('animal.vaccinations')}
                </h3>
                {duplicateCount > 0 && (
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 'var(--font-size-xs)', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    onClick={() => setHideDuplicates(h => !h)}
                  >
                    <AlertTriangle size={12} color="var(--warning-600)" />
                    {hideDuplicates ? t('docDetail.showDuplicates', { count: duplicateCount }) : t('docDetail.hideDuplicates')}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {visibleRecords.map((record: any) => {
                  const recordKey = `vax-${allRecords.indexOf(record)}`
                  const vaccination = normalizeVaccinationRecord(record)
                  const vaccineName = vaccination.vaccineName || '–'
                  const targetDisease = vaccination.targetDisease
                  const validUntil = vaccination.validUntil
                  const today = new Date()
                  today.setHours(0, 0, 0, 0)
                  const dueDate = validUntil ? new Date(validUntil) : null
                  const diffDays = dueDate ? Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null
                  const dateColor = diffDays === null ? 'var(--text-secondary)' : diffDays < 0 ? 'var(--error-600)' : diffDays <= 30 ? 'var(--warning-600)' : 'var(--text-secondary)'
                  const isSaved = savedReminders.has(recordKey)
                  const canSetReminder = !!(animalId && validUntil && /^\d{4}-\d{2}-\d{2}/.test(validUntil) && !record._duplicate)
                  return (
                    <div key={recordKey} className="card" style={{ padding: 'var(--space-4)', borderLeft: `4px solid ${record._duplicate ? 'var(--warning-300)' : 'var(--primary-200)'}`, opacity: record._duplicate ? 0.75 : 1 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-2)', marginBottom: '4px' }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 'var(--font-size-base)' }}>{vaccineName}</p>
                        {record._duplicate && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--font-size-xs)', color: 'var(--warning-700)', background: 'var(--warning-50)', border: '1px solid var(--warning-200)', borderRadius: 'var(--radius-sm)', padding: '2px 6px', flexShrink: 0 }}>
                            <AlertTriangle size={11} /> {t('docDetail.duplicate')}
                            {record._source_document_id && <a href={`/animals/${animalId}/documents/${record._source_document_id}`} style={{ color: 'var(--primary-600)', marginLeft: 4 }}>{t('docDetail.duplicateViewOriginal')}</a>}
                          </span>
                        )}
                      </div>
                      {targetDisease && <p style={{ margin: '0 0 var(--space-3) 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>{targetDisease}</p>}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', fontSize: 'var(--font-size-xs)', marginBottom: 'var(--space-3)' }}>
                        {vaccination.administrationDate && <div><span style={{ color: 'var(--text-tertiary)' }}>{t('vaccine.administrationDate')}</span><br /><strong>{vaccination.administrationDate}</strong></div>}
                        {record.valid_from && <div><span style={{ color: 'var(--text-tertiary)' }}>{t('docDetail.validFrom')}</span><br /><strong>{record.valid_from}</strong></div>}
                        {validUntil && <div><span style={{ color: 'var(--text-tertiary)' }}>{t('vaccine.validUntil')}</span><br /><strong style={{ color: dateColor }}>{validUntil}</strong></div>}
                        {vaccination.batchNumber && <div><span style={{ color: 'var(--text-tertiary)' }}>{t('vaccine.batchNumber')}</span><br /><strong>{vaccination.batchNumber}</strong></div>}
                        {vaccination.expiryDate && <div><span style={{ color: 'var(--text-tertiary)' }}>{t('vaccine.expiryDate')}</span><br /><strong>{vaccination.expiryDate}</strong></div>}
                        {vaccination.manufacturer && <div><span style={{ color: 'var(--text-tertiary)' }}>{t('vaccine.manufacturer')}</span><br /><strong>{vaccination.manufacturer}</strong></div>}
                        {vaccination.veterinarianName && <div><span style={{ color: 'var(--text-tertiary)' }}>{t('vaccine.vetName')}</span><br /><strong>{vaccination.veterinarianName}</strong></div>}
                      </div>
                      {vaccination.components.length > 0 && <p style={{ margin: '0 0 var(--space-2) 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}><strong>{t('docDetail.components')}:</strong> {vaccination.components.join(', ')}</p>}
                      {vaccination.purpose && <p style={{ margin: '0 0 var(--space-2) 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}><strong>{t('docDetail.summary')}:</strong> {vaccination.purpose}</p>}
                      {vaccination.veterinarianClinic && <p style={{ margin: '0 0 var(--space-2) 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}><strong>{t('docDetail.practice')}:</strong> {vaccination.veterinarianClinic}</p>}
                      {vaccination.veterinarianAddress && <p style={{ margin: '0 0 var(--space-2) 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}><strong>{t('docDetail.address')}:</strong> {vaccination.veterinarianAddress}</p>}
                      {vaccination.veterinarianContact && <p style={{ margin: '0 0 var(--space-2) 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}><strong>{t('docDetail.contact')}:</strong> {vaccination.veterinarianContact}</p>}
                      {canSetReminder && (
                        <button
                          className={`btn ${isSaved ? 'btn-ghost' : 'btn-secondary'} btn-full`}
                          style={{ fontSize: 'var(--font-size-sm)', padding: '8px' }}
                          onClick={() => handleCreateInAppReminder(record, recordKey)}
                          disabled={isSaved || savingReminder === recordKey}
                        >
                          {savingReminder === recordKey
                            ? <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                            : isSaved
                              ? <><CheckCircle size={14} /> Erinnerung gesetzt</>
                              : <><Bell size={14} /> Erinnerung setzen</>
                          }
                        </button>
                      )}
                      {record._duplicate && (
                        <p style={{ margin: '8px 0 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--warning-700)', fontStyle: 'italic' }}>
                          {t('docDetail.duplicateNoReminder')}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {doc.doc_type === 'treatment' && (() => {
          const allRecords: any[] = extracted.payload?.treatments || extracted.treatments || []
          if (allRecords.length === 0) return null
          const duplicateCount = allRecords.filter((r: any) => r._duplicate).length
          const visibleRecords = hideDuplicates ? allRecords.filter((r: any) => !r._duplicate) : allRecords
          return (
            <div style={{ marginBottom: 'var(--space-6)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Pill size={18} /> {t('animal.treatments')}
                </h3>
                {duplicateCount > 0 && (
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 'var(--font-size-xs)', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    onClick={() => setHideDuplicates(h => !h)}
                  >
                    <AlertTriangle size={12} color="var(--warning-600)" />
                    {hideDuplicates ? t('docDetail.showDuplicates', { count: duplicateCount }) : t('docDetail.hideDuplicates')}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {visibleRecords.map((record: any) => {
                  const recordKey = `treatment-${allRecords.indexOf(record)}`
                  const substance = record.substance || '–'
                  const nextDue = record.next_due || ''
                  const today = new Date()
                  today.setHours(0, 0, 0, 0)
                  const dueDate = nextDue ? new Date(nextDue) : null
                  const diffDays = dueDate ? Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null
                  const dateColor = diffDays === null ? 'var(--text-secondary)' : diffDays < 0 ? 'var(--error-600)' : diffDays <= 30 ? 'var(--warning-600)' : 'var(--text-secondary)'
                  const canSetReminder = !!(animalId && nextDue && /^\d{4}-\d{2}-\d{2}/.test(nextDue) && !record._duplicate)
                  const isSaved = savedReminders.has(recordKey)
                  return (
                    <div key={recordKey} className="card" style={{ padding: 'var(--space-4)', borderLeft: `4px solid ${record._duplicate ? 'var(--warning-300)' : 'var(--primary-200)'}`, opacity: record._duplicate ? 0.75 : 1 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-2)', marginBottom: '4px' }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 'var(--font-size-base)' }}>{substance}</p>
                        {record._duplicate && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--font-size-xs)', color: 'var(--warning-700)', background: 'var(--warning-50)', border: '1px solid var(--warning-200)', borderRadius: 'var(--radius-sm)', padding: '2px 6px', flexShrink: 0 }}>
                            <AlertTriangle size={11} /> {t('docDetail.duplicate')}
                            {record._source_document_id && <a href={`/animals/${animalId}/documents/${record._source_document_id}`} style={{ color: 'var(--primary-600)', marginLeft: 4 }}>{t('docDetail.duplicateViewOriginal')}</a>}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', fontSize: 'var(--font-size-xs)', marginBottom: 'var(--space-3)' }}>
                        {record.administered_at && <div><span style={{ color: 'var(--text-tertiary)' }}>Verabreicht</span><br /><strong>{record.administered_at}</strong></div>}
                        {record.dosage && <div><span style={{ color: 'var(--text-tertiary)' }}>Dosierung</span><br /><strong>{record.dosage}</strong></div>}
                        {record.vet_name && <div><span style={{ color: 'var(--text-tertiary)' }}>Tierarzt</span><br /><strong>{record.vet_name}</strong></div>}
                        {nextDue && <div><span style={{ color: 'var(--text-tertiary)' }}>Nächste Behandlung</span><br /><strong style={{ color: dateColor }}>{nextDue}</strong></div>}
                      </div>
                      {record.active_ingredient && <p style={{ margin: '0 0 var(--space-2) 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}><strong>{t('docDetail.activeIngredient')}:</strong> {record.active_ingredient}</p>}
                      {record.veterinarian?.practice && <p style={{ margin: '0 0 var(--space-2) 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}><strong>{t('docDetail.practice')}:</strong> {record.veterinarian.practice}</p>}
                      {record.notes && <p style={{ margin: '0 0 var(--space-2) 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}><strong>Notizen:</strong> {record.notes}</p>}
                      {canSetReminder && (
                        <button
                          className={`btn ${isSaved ? 'btn-ghost' : 'btn-secondary'} btn-full`}
                          style={{ fontSize: 'var(--font-size-sm)', padding: '8px' }}
                          onClick={() => handleCreateInAppReminder(record, recordKey)}
                          disabled={isSaved || savingReminder === recordKey}
                        >
                          {savingReminder === recordKey
                            ? <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                            : isSaved
                              ? <><CheckCircle size={14} /> Erinnerung gesetzt</>
                              : <><Bell size={14} /> Erinnerung setzen</>
                          }
                        </button>
                      )}
                      {record._duplicate && (
                        <p style={{ margin: '8px 0 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--warning-700)', fontStyle: 'italic' }}>
                          {t('docDetail.duplicateNoReminder')}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

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
                <label className="form-label">{t('docDetail.title')}</label>
                <input
                  className="form-input"
                  type="text"
                  value={editedTitle}
                  onChange={e => setEditedTitle(e.target.value)}
                  placeholder={t('docDetail.titlePlaceholder')}
                />
              </div>
            )}
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
            <button className="btn btn-primary btn-full" onClick={() => { setAnalysisAction('retry'); setShowRetryModal(true) }}>
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
