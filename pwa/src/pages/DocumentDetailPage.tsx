import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getDocument, deleteDocument, patchDocument, getAnimalDocuments, createReminder, getDocumentHistory, patchDocumentRecord, getAnimal, updateAnimal } from '../api/rest'
import { generateICS, downloadBlob } from '../utils/ics'
import { normalizeVaccinationRecord } from '../utils/vaccination'


import { PageHeader } from '../components/PageHeader'
import { Shield, Pill, FileText, PawPrint, Landmark, Calendar, Download, Mail, Tag, Save, X, Edit2, Trash2, CheckCircle, Award, GraduationCap, ChevronLeft, ChevronRight, Bell, AlertTriangle, Stethoscope } from 'lucide-react'
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
  const [roles] = useState<string[]>([])
  const [analysisHistory, setAnalysisHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  // Per-record permissions
  const [updatingRecordKey, setUpdatingRecordKey] = useState<string | null>(null)

  // Image sharing with guests
  const [shareImageWithGuest, setShareImageWithGuest] = useState(false)

  // Profile suggestion banner
  const [animalProfile, setAnimalProfile] = useState<any>(null)
  const [suggestionDismissed, setSuggestionDismissed] = useState(false)

  // Determine effective role for image visibility
  const effectiveRole: 'user' | 'vet' | 'authority' | 'guest' = (() => {
    if (doc?.isOwner) return 'user'
    const token = localStorage.getItem('token')
    if (!token) return 'guest'
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      const r = (payload.role || '').split(',').map((r: string) => r.trim())
      if (r.includes('vet')) return 'vet'
      if (r.includes('authority')) return 'authority'
    } catch { /* */ }
    return 'guest'
  })()

  const canSeeImage = doc?.isOwner || effectiveRole === 'vet' || effectiveRole === 'authority' || !!doc?.share_image_with_guest

  const profileSuggestions = useMemo(() => {
    if (!doc?.isOwner || !animalProfile || suggestionDismissed) return []
    if (!['vaccination', 'pet_passport', 'pedigree', 'treatment', 'vet_report'].includes(doc.doc_type)) return []
    const ext = doc.extracted_json || {}
    const docAnimal = ext.animal || (doc.doc_type === 'pedigree' ? { name: ext.animal_name, breed: ext.breed, birthdate: ext.birth_date } : null)
    if (!docAnimal) return []
    const suggestions: { field: string; label: string; value: string }[] = []
    if (docAnimal.name && docAnimal.name !== animalProfile.name)
      suggestions.push({ field: 'name', label: 'Name', value: docAnimal.name })
    if (docAnimal.breed && docAnimal.breed !== animalProfile.breed)
      suggestions.push({ field: 'breed', label: 'Rasse', value: docAnimal.breed })
    if (docAnimal.birthdate && docAnimal.birthdate !== animalProfile.birthdate)
      suggestions.push({ field: 'birthdate', label: 'Geburtsdatum', value: docAnimal.birthdate })
    return suggestions
  }, [doc, animalProfile, suggestionDismissed])

  const handleApplySuggestions = async () => {
    if (!animalId || profileSuggestions.length === 0) return
    const patch = Object.fromEntries(profileSuggestions.map(s => [s.field, s.value]))
    try {
      await updateAnimal(animalId, patch)
      setAnimalProfile((prev: any) => ({ ...prev, ...patch }))
    } catch { /* silent */ }
    setSuggestionDismissed(true)
  }

  const getRecordPerms = (key: string): string[] => {
    if (!doc) return ['vet', 'authority', 'guest']
    const perRecord = doc.record_permissions?.[key]
    if (perRecord !== undefined) return perRecord
    try { return Array.isArray(doc.allowed_roles) ? doc.allowed_roles : JSON.parse(doc.allowed_roles || '[]') } catch { return ['vet', 'authority', 'guest'] }
  }

  const handleToggleRecordRole = async (key: string, role: string) => {
    const current = getRecordPerms(key)
    const newRoles = current.includes(role) ? current.filter(r => r !== role) : [...current, role]
    setUpdatingRecordKey(key)
    try {
      const res = await patchDocumentRecord(doc.id, key, newRoles)
      setDoc((prev: any) => ({ ...prev, record_permissions: res.data.record_permissions }))
    } catch { /* silent */ } finally { setUpdatingRecordKey(null) }
  }

  const docTypeConfig: Record<string, { label: string; icon: React.ReactNode }> = {
    vaccination: { label: t('animal.docTypeVaccination'), icon: <Shield size={20} /> },
    pet_passport: { label: t('animal.docTypePetPassport'), icon: <Landmark size={20} /> },
    pedigree: { label: t('animal.docTypePedigree'), icon: <Award size={20} /> },
    dog_certificate: { label: t('animal.docTypeDogCertificate'), icon: <GraduationCap size={20} /> },
    medical_product: { label: t('animal.docTypeMedicalProduct'), icon: <Pill size={20} /> },
    treatment: { label: t('animal.docTypeTreatment'), icon: <Pill size={20} /> },
    vet_report: { label: t('animal.docTypeVetReport'), icon: <Stethoscope size={20} /> },
    general: { label: t('animal.docTypeGeneral'), icon: <FileText size={20} /> },
    // Legacy fallbacks
    medication: { label: t('animal.docTypeMedicalProduct'), icon: <Pill size={20} /> },
    other: { label: t('animal.docTypeGeneral'), icon: <FileText size={20} /> }
  }

  useEffect(() => {
    if (docId) loadDocument()
  }, [docId])

  useEffect(() => {
    if (animalId && doc?.isOwner) {
      getAnimal(animalId).then(res => setAnimalProfile(res.data)).catch(() => {})
    }
  }, [animalId, doc?.isOwner])

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
      setShareImageWithGuest(!!docRes.data.share_image_with_guest)
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
    let title = docTypeConfig[doc?.doc_type]?.label ?? doc?.doc_type ?? t('common.document')
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
      if (doc.isOwner) updates.share_image_with_guest = shareImageWithGuest ? 1 : 0
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
  
  const removeTag = (t: string) => {
    setTags(tags.filter(x => x !== t))
  }

  if (loading) return <div className="container page" style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}><div className="spinner spinner-lg"></div></div>
  if (!doc && error) return <div className="container page"><div className="error-card"><p>{error}</p></div></div>
  if (!doc) return <div className="container page"><div className="error-card"><p>{t('error.notFound')}</p></div></div>

  const extracted = doc.extracted_json || {}
  const rawText = extracted.rawText || extracted.raw_text || ''
  const config = docTypeConfig[doc.doc_type] || docTypeConfig.other
  const documentImages = Array.from(new Set([doc.image_path, ...(doc.pages || [])].filter(Boolean)))
  const currentImage = documentImages[currentImageIndex] || null
  const canReanalyze = (doc.isOwner || doc.isUploader || roles.includes('admin')) && doc.analysis_status === 'completed'

  const canEditTags = doc.isUploader || doc.added_by_role !== 'vet'
  const canEditVisibility = doc.isOwner

  // Removed showRetryModal block

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

        {currentImage && canSeeImage && (
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

        {currentImage && !canSeeImage && (
          <div style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-4)', background: 'var(--warning-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--warning-200)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div style={{ color: 'var(--warning-600)', fontSize: '24px' }}>🔒</div>
            <div>
              <p style={{ margin: '0 0 4px 0', fontWeight: 600, color: 'var(--warning-900)' }}>Bild nicht freigegeben</p>
              <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--warning-700)' }}>Der Besitzer hat dieses Bild nicht für deinen Zugang freigegeben.</p>
            </div>
          </div>
        )}

        {extracted.summary && (
          <div style={{ background: 'var(--primary-50)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-6)', borderLeft: '4px solid var(--primary-500)' }}>
            <h4 style={{ margin: '0 0 var(--space-2) 0', color: 'var(--primary-700)' }}>{t('docDetail.summary')}</h4>
            <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--primary-900)' }}>{extracted.summary}</p>
          </div>
        )}

        {doc.extraction_quality && (
          <div style={{ marginBottom: 'var(--space-6)' }}>
            <h4 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-3)', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              {t('docDetail.qualityMetrics')}
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              {doc.extraction_quality.type_confidence !== undefined && (
                <div className="card" style={{ padding: 'var(--space-3)', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                    {t('docDetail.typeConfidence')}
                  </p>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--primary-600)' }}>
                    {Math.round((doc.extraction_quality.type_confidence || 0) * 100)}%
                  </p>
                  <div style={{ marginTop: 'var(--space-2)', height: '4px', background: 'var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--primary-500)', width: `${(doc.extraction_quality.type_confidence || 0) * 100}%` }} />
                  </div>
                </div>
              )}
              {doc.extraction_quality.model_confidence !== undefined && (
                <div className="card" style={{ padding: 'var(--space-3)', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                    {t('docDetail.modelConfidence')}
                  </p>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--success-600)' }}>
                    {Math.round((doc.extraction_quality.model_confidence || 0) * 100)}%
                  </p>
                  <div style={{ marginTop: 'var(--space-2)', height: '4px', background: 'var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--success-500)', width: `${(doc.extraction_quality.model_confidence || 0) * 100}%` }} />
                  </div>
                </div>
              )}
              {doc.extraction_quality.completeness_score !== undefined && (
                <div className="card" style={{ padding: 'var(--space-3)', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                    {t('docDetail.completeness')}
                  </p>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--info-600)' }}>
                    {Math.round((doc.extraction_quality.completeness_score || 0) * 100)}%
                  </p>
                  <div style={{ marginTop: 'var(--space-2)', height: '4px', background: 'var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--info-500)', width: `${(doc.extraction_quality.completeness_score || 0) * 100}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 'var(--space-6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
            <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, margin: 0 }}>{t('docDetail.analysisHistory')}</h3>
            {canReanalyze && (
              <button className="btn btn-secondary" onClick={() => navigate(`/animals/${animalId}/scan`, { state: { documentId: doc.id, action: 'reanalyze', previews: [doc.image_path, ...(doc.pages || [])].filter(Boolean) } })} disabled={saving}>
                {t('docDetail.reanalyze')}
              </button>            )}
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

        {/* Profile suggestion banner */}
        {profileSuggestions.length > 0 && (
          <div className="card" style={{ marginBottom: 'var(--space-4)', borderLeft: '4px solid var(--primary-500)', background: 'var(--primary-50)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--primary-700)', marginBottom: 'var(--space-2)' }}>
                  Tierprofil aus Dokument übernehmen?
                </div>
                <div style={{ display: 'grid', gap: 4, marginBottom: 'var(--space-3)' }}>
                  {profileSuggestions.map(s => (
                    <div key={s.field} style={{ fontSize: 'var(--font-size-sm)', color: 'var(--primary-800)' }}>
                      {s.label}: <strong>{s.value}</strong>
                    </div>
                  ))}
                </div>
                <button className="btn btn-primary" style={{ fontSize: 'var(--font-size-xs)', padding: '6px 12px' }} onClick={handleApplySuggestions}>
                  Übernehmen
                </button>
              </div>
              <button onClick={() => setSuggestionDismissed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                <X size={16} />
              </button>
            </div>
          </div>
        )}

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
                  const recIdx = allRecords.indexOf(record)
                  const recordKey = `vax-${recIdx}`
                  const dbKey = `vaccinations.${recIdx}`
                  const recPerms = getRecordPerms(dbKey)
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
                      {doc.isOwner && (
                        <div style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Freigabe:</span>
                          {(['guest', 'vet', 'authority'] as const).map(r => (
                            <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', cursor: 'pointer' }}>
                              <input type="checkbox" checked={recPerms.includes(r)} disabled={updatingRecordKey === dbKey}
                                onChange={() => handleToggleRecordRole(dbKey, r)} />
                              {r}
                            </label>
                          ))}
                          {updatingRecordKey === dbKey && <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1 }} />}
                        </div>
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

        {(doc.doc_type === 'treatment' || doc.doc_type === 'vet_report') && (() => {
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
                  const treatIdx = allRecords.indexOf(record)
                  const recordKey = `treatment-${treatIdx}`
                  const dbKey = `treatments.${treatIdx}`
                  const recPerms = getRecordPerms(dbKey)
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
                      {doc.isOwner && (
                        <div style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Freigabe:</span>
                          {(['guest', 'vet', 'authority'] as const).map(r => (
                            <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', cursor: 'pointer' }}>
                              <input type="checkbox" checked={recPerms.includes(r)} disabled={updatingRecordKey === dbKey}
                                onChange={() => handleToggleRecordRole(dbKey, r)} />
                              {r}
                            </label>
                          ))}
                          {updatingRecordKey === dbKey && <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1 }} />}
                        </div>
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

        {doc.doc_type === 'pet_passport' && (() => {
          const passport = extracted
          return passport && (
            <div style={{ marginBottom: 'var(--space-6)' }}>
              <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, margin: 0, display: 'flex', gap: '8px', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                <Landmark size={18} /> {passport.title || 'Heimtierausweis'}
              </h3>
              {passport.animal && (
                <div style={{ background: 'var(--surface)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)' }}>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>{passport.animal.name} {passport.animal.species ? `(${passport.animal.species})` : ''}</p>
                  {passport.animal.breed && <p style={{ margin: '4px 0 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{passport.animal.breed}</p>}
                </div>
              )}
              {passport.identification && (
                <div style={{ background: 'var(--surface)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)' }}>
                  <h4 style={{ margin: '0 0 var(--space-2) 0', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>Identifikation</h4>
                  {passport.identification.chip_code && <p style={{ margin: '4px 0', fontSize: 'var(--font-size-sm)' }}><span style={{ color: 'var(--text-secondary)' }}>Chip:</span> {passport.identification.chip_code}</p>}
                  {passport.identification.chip_date && <p style={{ margin: '4px 0', fontSize: 'var(--font-size-sm)' }}><span style={{ color: 'var(--text-secondary)' }}>Chip-Datum:</span> {passport.identification.chip_date}</p>}
                  {passport.identification.tattoo_code && <p style={{ margin: '4px 0', fontSize: 'var(--font-size-sm)' }}><span style={{ color: 'var(--text-secondary)' }}>Tätowierung:</span> {passport.identification.tattoo_code}</p>}
                </div>
              )}
              {passport.issuing_authority && (
                <div style={{ background: 'var(--surface)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)' }}>
                  <h4 style={{ margin: '0 0 var(--space-2) 0', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>Ausstellende Behörde</h4>
                  {passport.issuing_authority.name && <p style={{ margin: '4px 0', fontSize: 'var(--font-size-sm)' }}>{passport.issuing_authority.name}</p>}
                  {passport.issuing_authority.address && <p style={{ margin: '4px 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>{passport.issuing_authority.address}</p>}
                </div>
              )}
              {passport.passport_number && <p style={{ margin: 'var(--space-3) 0 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Reisepass-Nr.: {passport.passport_number}</p>}
            </div>
          )
        })()}

        {doc.doc_type === 'medical_product' && (() => {
          const product = extracted
          return product && (
            <div style={{ marginBottom: 'var(--space-6)' }}>
              <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, margin: 0, display: 'flex', gap: '8px', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                <Pill size={18} /> {product.title || 'Medizinisches Produkt'}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                {product.active_ingredient && (
                  <div style={{ background: 'var(--surface)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
                    <p style={{ margin: '0 0 4px 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Wirkstoff</p>
                    <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>{product.active_ingredient}</p>
                  </div>
                )}
                {product.dosage && (
                  <div style={{ background: 'var(--surface)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
                    <p style={{ margin: '0 0 4px 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Dosierung</p>
                    <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>{product.dosage}</p>
                  </div>
                )}
                {product.batch_number && (
                  <div style={{ background: 'var(--surface)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
                    <p style={{ margin: '0 0 4px 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Chargennummer</p>
                    <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>{product.batch_number}</p>
                  </div>
                )}
                {product.manufacturer && (
                  <div style={{ background: 'var(--surface)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
                    <p style={{ margin: '0 0 4px 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Hersteller</p>
                    <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>{product.manufacturer}</p>
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {doc.doc_type === 'pedigree' && (() => {
          const pedigree = extracted
          return pedigree && (
            <div style={{ marginBottom: 'var(--space-6)' }}>
              <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, margin: 0, display: 'flex', gap: '8px', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                <Award size={18} /> {pedigree.title || 'Stammbaum'}
              </h3>
              {pedigree.document_date && <p style={{ margin: '0 0 var(--space-3) 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>Datum: {pedigree.document_date}</p>}
              {pedigree.summary && <p style={{ margin: 'var(--space-3) 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>{pedigree.summary}</p>}
            </div>
          )
        })()}

        {doc.doc_type === 'dog_certificate' && (() => {
          const cert = extracted
          return cert && (
            <div style={{ marginBottom: 'var(--space-6)' }}>
              <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, margin: 0, display: 'flex', gap: '8px', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                <GraduationCap size={18} /> {cert.title || 'Hundeführerschein'}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                {cert.result && (
                  <div style={{ background: 'var(--surface)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
                    <p style={{ margin: '0 0 4px 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Ergebnis</p>
                    <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>{cert.result}</p>
                  </div>
                )}
                {(cert.exam_date || cert.document_date) && (
                  <div style={{ background: 'var(--surface)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
                    <p style={{ margin: '0 0 4px 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Datum</p>
                    <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>{cert.exam_date || cert.document_date}</p>
                  </div>
                )}
              </div>
              {cert.summary && <p style={{ margin: 'var(--space-3) 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>{cert.summary}</p>}
            </div>
          )
        })()}

        {doc.doc_type === 'general' && (() => {
          const general = extracted
          return general && (
            <div style={{ marginBottom: 'var(--space-6)' }}>
              <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, margin: 0, display: 'flex', gap: '8px', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                <FileText size={18} /> {general.title || 'Dokument'}
              </h3>
              {general.document_date && <p style={{ margin: '0 0 var(--space-3) 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>Datum: {general.document_date}</p>}
              {general.summary && <p style={{ margin: 'var(--space-3) 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>{general.summary}</p>}
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

            {doc?.isOwner && (
              <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                <label style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={shareImageWithGuest}
                    onChange={(e) => setShareImageWithGuest(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: 'var(--primary-500)' }}
                  />
                  <span style={{ fontSize: 'var(--font-size-sm)' }}>Bild für Gäste freigeben</span>
                </label>
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
            <button className="btn btn-primary btn-full" onClick={() => navigate(`/animals/${animalId}/scan`, { state: { documentId: doc.id, action: 'retry', previews: [doc.image_path, ...(doc.pages || [])].filter(Boolean) } })}>
              {t('animal.retry')}
            </button>
          </div>
        ) : !rawText && (          <p className="text-muted" style={{ marginTop: 'var(--space-4)', fontStyle: 'italic' }}>{t('docDetail.noOcr')}</p>
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
