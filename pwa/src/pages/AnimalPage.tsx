import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getAnimal, getAnimalDocuments, getAnimalTags, updateAnimal, deleteAnimal, uploadAnimalAvatar, deleteDocument, getMe, patchDocumentRecord, patchDocument, addVaccination, addTreatment } from '../api/rest'
import { PageHeader } from '../components/PageHeader' 
import { DocumentAnalysisForm } from '../components/DocumentAnalysisForm'
import { PawPrint, Cat, Edit2, Trash2, Camera, Search, Radio, ShieldAlert, AlertTriangle, RefreshCw, X, Syringe, FileText, CheckCircle, ArrowDownAZ, ArrowUpAZ, SlidersHorizontal, ArrowRightLeft, Share2, Plus, Pill, ChevronDown, ChevronUp, Landmark, Award, GraduationCap } from 'lucide-react'
import { AnimalDTO } from '../types/animal'
import { normalizeVaccinationRecord } from '../utils/vaccination'
import { formatDate, formatDateOnly } from '../utils/date'
import { DEFAULT_AVAILABLE_MODELS, DEFAULT_MODEL_BY_PROVIDER, DOCUMENT_TYPE_PLACEHOLDER, type DocumentTypeSelectValue } from '../utils/documentAnalysis'
import { VerifiedBadge } from '../components/VerifiedBadge'

interface AnimalTag {
  tag_id: string; tag_type: string; active: number; added_at: string
}
interface Document {
  id: string; doc_type: string; created_at: string; ocr_provider: string; added_by_role?: string; added_by_name?: string; added_by_verified?: number; analysis_status?: string; extracted_json?: any; record_permissions?: Record<string, string[]>; allowed_roles?: string; image_path?: string; pages?: string[]
}

function extractProviderError(data: any, fallback: string): string {
  const main = data?.error || fallback
  const details: string | undefined = data?.details
  if (!details) return main
  const jsonStart = details.indexOf('{')
  if (jsonStart >= 0) {
    try {
      const inner = JSON.parse(details.slice(jsonStart))
      const msg = inner?.error?.message || inner?.message
      if (msg && msg !== main) return `${main}\n${msg}`
    } catch {}
  }
  return main
}

export default function AnimalPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const docTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      vaccination: t('animal.docTypeVaccination'),
      treatment: t('animal.docTypeTreatment'),
      pet_passport: t('animal.docTypePetPassport'),
      medical_product: t('animal.docTypeMedicalProduct'),
      pedigree: t('animal.docTypePedigree'),
      dog_certificate: t('animal.docTypeDogCertificate'),
      general: t('animal.docTypeGeneral'),
      medication: t('animal.docTypeMedicalProduct'),
      other: t('animal.docTypeGeneral')
    }
    return labels[type] || type
  }

  const [animal, setAnimal] = useState<(AnimalDTO & { is_archived?: number }) | null>(null)
  const [tags, setTags] = useState<AnimalTag[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [pendingDocuments, setPendingDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<(AnimalDTO & { is_archived?: number }) | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [documentSearch, setDocumentSearch] = useState('')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [documentTab, setDocumentTab] = useState<'all' | 'pending'>('all')
  const [retrying, setRetrying] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<'all' | 'vaccination' | 'treatment' | 'pet_passport' | 'medical_product' | 'pedigree' | 'dog_certificate' | 'general'>('all')
  const [filterTag, setFilterTag] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferCode, setTransferCode] = useState('')
  const [showShare, setShowShare] = useState(false)
  const [shareLink, setShareLink] = useState('')
  const [shareName, setShareName] = useState('')
  const [shareRole, setShareRole] = useState<'guest' | 'vet' | 'authority'>('guest')
  const [generatingShare, setGeneratingShare] = useState(false)
  const [activeShares, setActiveShares] = useState<any[]>([])
  const [loadingShares, setLoadingShares] = useState(false)
  const [revokingShare, setRevokingShare] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const avatarInputRef = useRef<HTMLInputElement>(null)
  
  const [showRetryModal, setShowRetryModal] = useState(false)
  const [retryDocId, setRetryDocId] = useState<string | null>(null)
  const [retryDoc, setRetryDoc] = useState<Document | null>(null)
  const [retryProvider, setRetryProvider] = useState('google')
  const [retryModel, setRetryModel] = useState(DEFAULT_MODEL_BY_PROVIDER.google)
  const [requestedDocumentType, setRequestedDocumentType] = useState<DocumentTypeSelectValue>(DOCUMENT_TYPE_PLACEHOLDER)
  const [hasGemini, setHasGemini] = useState(false)
  const [hasAnthropic, setHasAnthropic] = useState(false)
  const [hasOpenai, setHasOpenai] = useState(false)
  const [hasSystemAi, setHasSystemAi] = useState(true)
  const [showArchiveDialog, setShowArchiveDialog] = useState(false)
  const [archiveReason, setArchiveReason] = useState<'verstorben' | 'verloren' | 'verkauft' | 'abgegeben' | 'sonstiges' | ''>('')
  const hasAnyKey = hasGemini || hasAnthropic || hasOpenai || hasSystemAi
  const [availableModels, setAvailableModels] = useState<any>(DEFAULT_AVAILABLE_MODELS)

  // Manual entry modals
  const [showVaxModal, setShowVaxModal] = useState(false)
  const [showTreatModal, setShowTreatModal] = useState(false)
  const [manualVax, setManualVax] = useState({ vaccine_name: '', date: '', batch_number: '', valid_until: '', target_disease: '', vet_name: '', notes: '' })
  const [manualTreat, setManualTreat] = useState({ substance: '', date: '', dosage: '', vet_name: '', notes: '', next_due: '' })
  const [savingManual, setSavingManual] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)

  // Per-record permissions UI
  const [expandedRecord, setExpandedRecord] = useState<string | null>(null)
  const [updatingRecord, setUpdatingRecord] = useState<string | null>(null)

  useEffect(() => {
    getMe().then(res => {
      setHasGemini(res.data.has_gemini_token)
      setHasAnthropic(res.data.has_anthropic_token)
      setHasOpenai(res.data.has_openai_token)
      setHasSystemAi(!!res.data.has_system_ai)

      if (res.data.has_gemini_token) { setRetryProvider('google'); setRetryModel(DEFAULT_MODEL_BY_PROVIDER.google) }
      else if (res.data.has_anthropic_token) { setRetryProvider('anthropic'); setRetryModel(DEFAULT_MODEL_BY_PROVIDER.anthropic) }
      else if (res.data.has_openai_token) { setRetryProvider('openai'); setRetryModel(DEFAULT_MODEL_BY_PROVIDER.openai) }

      fetch('/api/ai/models', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } })
        .then(r => r.json())
        .then(data => {
          setAvailableModels((prev: any) => ({
            google: data.google || prev.google,
            anthropic: data.anthropic || prev.anthropic,
            openai: data.openai || prev.openai
          }))
        }).catch(console.error)
    }).catch(err => console.error(err))
  }, [])

  const handleProviderChange = (prov: string) => {
    setRetryProvider(prov)
    if (prov === 'google') setRetryModel(DEFAULT_MODEL_BY_PROVIDER.google)
    else if (prov === 'anthropic') setRetryModel(DEFAULT_MODEL_BY_PROVIDER.anthropic)
    else if (prov === 'openai') setRetryModel(DEFAULT_MODEL_BY_PROVIDER.openai)
  }

  const getRecordPermissions = (doc: Document, key: string): string[] => {
    const perRecord = doc.record_permissions?.[key]
    if (perRecord !== undefined) return perRecord
    try {
      const dr = doc.allowed_roles !== undefined ? doc.allowed_roles : null
      if (!dr) return ['vet', 'authority', 'guest']
      return JSON.parse(dr as any) as string[]
    } catch { return ['vet', 'authority', 'guest'] }
  }

  const handleToggleRecordRole = async (docId: string, key: string, currentRoles: string[], role: string) => {
    const newRoles = currentRoles.includes(role) ? currentRoles.filter(r => r !== role) : [...currentRoles, role]
    setUpdatingRecord(`${docId}-${key}`)
    try {
      await patchDocumentRecord(docId, key, newRoles)
      setDocuments(prev => prev.map(d => {
        if (d.id !== docId) return d
        return { ...d, record_permissions: { ...(d.record_permissions || {}), [key]: newRoles } }
      }))
    } catch { /* silent */ } finally {
      setUpdatingRecord(null)
    }
  }

  const handleSaveManualVax = async () => {
    if (!id || !manualVax.vaccine_name || !manualVax.date) return
    setSavingManual(true); setManualError(null)
    try {
      await addVaccination(id, manualVax)
      const res = await getAnimalDocuments(id)
      setDocuments(res.data)
      setShowVaxModal(false)
      setManualVax({ vaccine_name: '', date: '', batch_number: '', valid_until: '', target_disease: '', vet_name: '', notes: '' })
    } catch { setManualError('Fehler beim Speichern') } finally { setSavingManual(false) }
  }

  const handleSaveManualTreat = async () => {
    if (!id || !manualTreat.substance || !manualTreat.date) return
    setSavingManual(true); setManualError(null)
    try {
      await addTreatment(id, manualTreat)
      const res = await getAnimalDocuments(id)
      setDocuments(res.data)
      setShowTreatModal(false)
      setManualTreat({ substance: '', date: '', dosage: '', vet_name: '', notes: '', next_due: '' })
    } catch { setManualError('Fehler beim Speichern') } finally { setSavingManual(false) }
  }

  const handleRetryAnalysisAPI = async () => {
    if (!retryDocId) return
    if (requestedDocumentType === DOCUMENT_TYPE_PLACEHOLDER) return
    setRetrying(retryDocId)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(`/api/documents/${retryDocId}/retry-analysis`, { 
        method: 'POST', 
        headers,
        body: JSON.stringify({ provider: retryProvider, model: retryModel, requestedDocumentType, language: i18n.language || 'de' })
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(extractProviderError(errData, t('animal.documentFailed')))
      }

      setPendingDocuments(prev => prev.filter(d => d.id !== retryDocId))
      const docsRes = await fetch(`/api/animals/${id}/documents`, { headers })
      const newDocs = await docsRes.json()
      setDocuments(newDocs)
      setShowRetryModal(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setRetrying(null)
    }
  }

  const loadPendingDocuments = async (animalId: string) => {
    try {
      const token = localStorage.getItem('token')
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      const response = await fetch(`/api/animals/${animalId}/documents/pending`, { headers })
      const pendingDocs = await response.json()
      setPendingDocuments(Array.isArray(pendingDocs) ? pendingDocs : [])
    } catch (err) {
      console.error('Fehler beim Laden von pending Dokumenten:', err)
      setPendingDocuments([])
    }
  }

  const handleDeletePendingDoc = async (docId: string) => {
    if (!confirm(t('docDetail.deleteConfirm'))) return
    try {
      await deleteDocument(docId)
      // Reload pending documents to ensure consistency with DB
      if (id) await loadPendingDocuments(id)
    } catch (err: any) {
      setError(err.response?.data?.error || t('common.deleteError'))
    }
  }

  useEffect(() => {
    if (!id) return
    Promise.all([getAnimal(id), getAnimalDocuments(id), getAnimalTags(id)])
      .then(([a, d, t]) => {
        setAnimal(a.data as any)
        setEditData(a.data as any)
        setDocuments(Array.isArray(d.data) ? d.data : [])
        setTags(Array.isArray(t.data) ? t.data : [])
        // Load pending documents
        loadPendingDocuments(id)
      })
      .catch(() => setError(t('error.notFound')))
      .finally(() => setLoading(false))
  }, [id])

  // Auto-refresh pending documents when page is visible
  // On focus: immediate refresh + 30s polling
  // On blur: stop polling (preserve bandwidth)
  useEffect(() => {
    if (!id) return

    const handleVisibilityChange = async () => {
      if (document.hidden) {
        // Page went to background — stop polling
        return
      }
      // Page came back to foreground — immediate refresh
      await loadPendingDocuments(id)
    }

    // Immediate refresh on mount
    loadPendingDocuments(id)

    // Listen for page visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Slow poll (30s) while page is visible
    let pollInterval: number | null = null
    const startPolling = () => {
      if (document.hidden) return
      pollInterval = setInterval(() => {
        if (!document.hidden) {
          loadPendingDocuments(id)
        }
      }, 30000)
    }
    startPolling()

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (pollInterval) clearInterval(pollInterval)
    }
  }, [id])

  const handleEdit = async () => {
    if (!editData || !id) return
    try {
      setSubmitting(true)
      await updateAnimal(id, {
        name: editData.name,
        species: editData.species,
        breed: editData.breed || null,
        birthdate: editData.birthdate || null
      })
      setAnimal(editData)
      setEditing(false)
    } catch (err: any) {
      setError(err.response?.data?.error || t('profile.saveError'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!id || !animal) return
    try {
      setSubmitting(true)
      await deleteAnimal(id, deleteConfirmText)
      navigate('/animals')
    } catch (err: any) {
      setError(err.response?.data?.error || t('common.deleteError'))
      setSubmitting(false)
    }
  }

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = (event) => {
        const img = new Image()
        img.src = event.target?.result as string
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const maxSize = 512
          let width = img.width
          let height = img.height

          if (width > height) {
            if (width > maxSize) {
              height *= maxSize / width
              width = maxSize
            }
          } else {
            if (height > maxSize) {
              width *= maxSize / height
              height = maxSize
            }
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx?.drawImage(img, 0, 0, width, height)

          // Compress to JPEG with quality 0.75
          const compressed = canvas.toDataURL('image/jpeg', 0.75)
          resolve(compressed)
        }
        img.onerror = () => reject(new Error(t('common.imageLoadError')))
      }
      reader.onerror = () => reject(new Error(t('common.fileReadError')))
    })
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !id) return

    setUploadingAvatar(true)
    try {
      const compressed = await compressImage(file)
      await uploadAnimalAvatar(id, compressed)
      const res = await getAnimal(id)
      setAnimal(res.data as any)
      setError(null)
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || t('animal.avatarUploadError'))
    } finally {
      setUploadingAvatar(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
  }

  const handleArchive = async () => {
    if (!id || !animal || !isOwner) return
    setShowArchiveDialog(true)
  }

  const handleArchiveConfirm = async () => {
    if (!id || !animal || !isOwner || !archiveReason) {
      setError(t('animal.archiveRequired'))
      return
    }
    try {
      setSubmitting(true)
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/animals/${id}/archive`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_archived: true, archive_reason: archiveReason })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Archive failed')
      }
      setAnimal(prev => prev ? { ...prev, is_archived: 1, archive_reason: archiveReason } : null)
      setShowArchiveDialog(false)
      setArchiveReason('')
    } catch (err: any) {
      setError(err.message || t('common.error'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleUnarchive = async () => {
    if (!id || !animal || !isOwner) return
    try {
      setSubmitting(true)
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/animals/${id}/unarchive`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Unarchive failed')
      }
      setAnimal(prev => prev ? { ...prev, is_archived: 0, archive_reason: undefined } : null)
    } catch (err: any) {
      setError(err.message || t('common.error'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleGenerateTransfer = async () => {
    try {
      setSubmitting(true)
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/animals/${id}/transfer`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      setTransferCode(data.code)
    } catch (err) {
      setError(t('common.error'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleGenerateShare = async () => {
    try {
      setGeneratingShare(true)
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/animals/${id}/sharing/temporary`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: shareName.trim() || undefined, role: shareRole }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setShareLink(`${window.location.origin}/share/${data.shareId}`)
      await loadActiveShares()
    } catch (err) {
      setError(t('common.error'))
    } finally {
      setGeneratingShare(false)
    }
  }

  const copyShareLink = () => {
    navigator.clipboard.writeText(shareLink)
  }

  const loadActiveShares = async () => {
    try {
      setLoadingShares(true)
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/animals/${id}/shares`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to load shares')
      const shares = await res.json()
      setActiveShares(shares)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingShares(false)
    }
  }

  const handleRevokeShare = async (shareId: string) => {
    if (!confirm(t('sharing.confirmRevoke'))) return
    try {
      setRevokingShare(shareId)
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/animals/${id}/shares/${shareId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to revoke share')
      await loadActiveShares()
    } catch (err) {
      setError(t('common.error'))
    } finally {
      setRevokingShare(null)
    }
  }

  const handleOpenShare = () => {
    setShowShare(true)
    setShareLink('')
    loadActiveShares()
  }

  if (loading) return <div className="container page" style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}><div className="spinner spinner-lg"></div></div>
  if (!animal) return <div className="container page"><div className="error-card"><p>{error || t('error.notFound')}</p></div></div>

  const isOwner = animal.is_owner !== false
  const isVet = animal.request_role === 'vet'

  const hasNfcTag = tags.some(t => t.tag_type === 'nfc' && t.active === 1)
  const isVetVerified = false // Placeholder for future implementation

  if (showRetryModal) {
    const docImages = retryDoc ? [retryDoc.image_path, ...(retryDoc.pages || [])].filter(Boolean) : []
    return (
      <DocumentAnalysisForm
        title={t('docDetail.aiAnalysis')}
        description={t('docDetail.aiSelectProvider')}
        previews={docImages}
        errorMessage={error}
        hasAnyKey={hasAnyKey}
        hasGemini={hasGemini}
        hasAnthropic={hasAnthropic}
        hasOpenai={hasOpenai}
        hasSystemAi={hasSystemAi}
        retryProvider={retryProvider}
        retryModel={retryModel}
        requestedDocumentType={requestedDocumentType}
        availableModels={availableModels}
        submitLabel={t('animal.analyzeBtn')}
        cancelLabel={t('common.cancel')}
        isSubmitting={retrying !== null}
        hideDocumentType={false}
        onProviderChange={handleProviderChange}
        onModelChange={setRetryModel}
        onRequestedDocumentTypeChange={setRequestedDocumentType}
        onSubmit={handleRetryAnalysisAPI}
        onCancel={() => { setShowRetryModal(false); setRetryDoc(null); setError(null) }}
      />
    )
  }

  // All unique tags across documents
  const allTags = Array.from(new Set(
    documents.flatMap(d => d.extracted_json?.suggested_tags ?? [])
  )).sort()

  // Filtered + sorted flat list
  const filteredDocs = documents
    .filter(d => d && d.analysis_status !== 'pending_analysis')
    .filter(d => !d.doc_type || filterType === 'all' || d.doc_type === filterType)
    .filter(d => !filterTag || (d.extracted_json?.suggested_tags ?? []).includes(filterTag))
    .filter(d => {
      if (!filterDateFrom && !filterDateTo) return true
      const docDate = d.extracted_json?.document_date || d.created_at
      if (!docDate) return true
      const date = typeof docDate === 'string' ? docDate.slice(0, 10) : docDate
      if (filterDateFrom && date < filterDateFrom) return false
      if (filterDateTo && date > filterDateTo) return false
      return true
    })
    .filter(d => !documentSearch ||
      (d.doc_type ? docTypeLabel(d.doc_type).toLowerCase().includes(documentSearch) : false) ||
      (d.extracted_json?.title ?? '').toLowerCase().includes(documentSearch) ||
      (d.extracted_json?.suggested_tags ?? []).some((t: string) => t.toLowerCase().includes(documentSearch)) ||
      (d.created_at ? formatDate(d.created_at).includes(documentSearch) : false)
    )
    .sort((a, b) => {
      const da = a.extracted_json?.document_date || a.created_at || ''
      const db = b.extracted_json?.document_date || b.created_at || ''
      if (!da || !db) return 0
      return sortOrder === 'desc' ? String(db).localeCompare(String(da)) : String(da).localeCompare(String(db))
    })

  // Grouped: Map<doc_type, Document[]> — only when showing all types
  const groupedDocs = filterType === 'all' ? (() => {
    const map = new Map<string, Document[]>()
    for (const type of ['vaccination', 'treatment', 'pet_passport', 'medical_product', 'pedigree', 'dog_certificate', 'general'] as const) {
      const group = filteredDocs.filter(d => d.doc_type === type)
      if (group.length > 0) map.set(type, group)
    }
    return map
  })() : null

  const vaccinationRecords = documents
    .filter(d => d.analysis_status !== 'pending_analysis' && d.doc_type === 'vaccination')
    .flatMap((doc) => {
      const records = doc.extracted_json?.payload?.vaccinations || doc.extracted_json?.vaccinations || []
      if (!Array.isArray(records)) return []
      return records.map((record: any, index: number) => ({
        id: `${doc.id}-${index}`,
        documentId: doc.id,
        doc: doc,
        recordKey: `vaccinations.${index}`,
        ...normalizeVaccinationRecord(record)
      }))
    })
    .sort((a, b) => String(b.administrationDate || b.validUntil || '').localeCompare(String(a.administrationDate || a.validUntil || '')))

  const treatmentRecords = documents
    .filter(d => d.analysis_status !== 'pending_analysis' && d.doc_type === 'treatment')
    .flatMap((doc) => {
      const records = doc.extracted_json?.payload?.treatments || doc.extracted_json?.treatments || []
      if (!Array.isArray(records)) return []
      return records.map((record: any, index: number) => ({
        id: `${doc.id}-t${index}`,
        documentId: doc.id,
        doc: doc,
        recordKey: `treatments.${index}`,
        substance: record.substance || record.medication || '—',
        administeredAt: record.administered_at || record.date || null,
        dosage: record.dosage || null,
        vetName: record.vet_name || null,
        nextDue: record.next_due || null,
        notes: record.notes || null
      }))
    })
    .sort((a, b) => String(b.administeredAt || '').localeCompare(String(a.administeredAt || '')))

  // Helfer: Parse allowed_roles eines Dokuments
  const getDocumentRoles = (doc: any): string[] => {
    try {
      return Array.isArray(doc.allowed_roles) ? doc.allowed_roles : JSON.parse(doc.allowed_roles || '["vet","authority","guest"]')
    } catch {
      return ['vet', 'authority', 'guest']
    }
  }

  // Handler für Dokumentebenen-Rollen (nicht Record-Ebene)
  const handleToggleDocumentRole = async (docId: string, currentRoles: string[], roleToToggle: string) => {
    const newRoles = currentRoles.includes(roleToToggle)
      ? currentRoles.filter(r => r !== roleToToggle)
      : [...currentRoles, roleToToggle]
    setUpdatingRecord(`${docId}-doc`)
    try {
      await patchDocument(docId, { allowed_roles: newRoles })
      setDocuments(prev =>
        prev.map(d =>
          d.id === docId ? { ...d, allowed_roles: JSON.stringify(newRoles) } : d
        )
      )
    } catch { /* silent */ } finally {
      setUpdatingRecord(null)
    }
  }

  // Datenaggregation für alle anderen Dokumenttypen
  const petPassportDocs = documents.filter(d => d.analysis_status !== 'pending_analysis' && d.doc_type === 'pet_passport')
  const medicalProductDocs = documents.filter(d => d.analysis_status !== 'pending_analysis' && d.doc_type === 'medical_product')
  const pedigreeDocs = documents.filter(d => d.analysis_status !== 'pending_analysis' && d.doc_type === 'pedigree')
  const dogCertificateDocs = documents.filter(d => d.analysis_status !== 'pending_analysis' && d.doc_type === 'dog_certificate')
  const generalDocs = documents.filter(d => d.analysis_status !== 'pending_analysis' && d.doc_type === 'general')

  return (
    <div className="container page">
      <PageHeader title={animal.name} backTo="/animals" showThemeToggle />

      {error && <div className="error-card"><p>{error}</p></div>}

      <div className="content-grid">
        <div>
          {!isOwner && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3)', background: 'var(--info-100)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', border: '1px solid var(--info-300)' }}>
              <ShieldAlert size={18} color="var(--info-700)" />
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--info-900)', fontWeight: 500 }}>
                {t('scan.sharedAccess')}: <strong style={{ textTransform: 'capitalize' }}>{animal.request_role === 'vet' ? t('docScan.vet') : animal.request_role === 'authority' ? t('docScan.authority') : t('docScan.guestAccess')}</strong>
              </span>
            </div>
          )}

          {animal.is_archived ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3)', background: 'var(--surface-alt)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Trash2 size={18} color="var(--text-secondary)" />
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', fontWeight: 600 }}>{t('animal.archived')}</span>
              </div>
              {isOwner && (
                <button className="btn btn-outline" style={{ fontSize: 'var(--font-size-sm)', padding: '4px 12px' }} onClick={handleUnarchive} disabled={submitting}>
                  {t('animal.unarchive')}
                </button>
              )}
            </div>
          ) : null}

          {!editing ? (
            <>
              <div style={{
                borderRadius: 'var(--radius-xl)',
                background: 'linear-gradient(135deg, var(--primary-500), var(--primary-700))',
                padding: 'var(--space-5)',
                marginBottom: 'var(--space-4)',
                boxShadow: 'var(--shadow-lg)',
              }}>
                <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                  <div style={{ position: 'relative' }}>
                    <div style={{
                      width: 56, height: 56, borderRadius: 'var(--radius-lg)',
                      background: 'oklch(100% 0 0 / 0.18)',
                      border: '1.5px solid oklch(100% 0 0 / 0.28)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                      cursor: isOwner && !animal.is_archived ? 'pointer' : 'default', transition: 'opacity 0.2s'
                    }} onClick={isOwner && !animal.is_archived ? () => avatarInputRef.current?.click() : undefined}>
                      {animal.avatar_path ? (
                        <img src={`/uploads/${animal.avatar_path.split('/').pop()}`} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        animal.species === 'cat' ? <Cat size={28} color="white" strokeWidth={1.6} /> : <PawPrint size={28} color="white" strokeWidth={1.6} />
                      )}
                    </div>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={!animal.is_archived ? handleAvatarUpload : undefined}
                      disabled={uploadingAvatar}
                    />
                    {uploadingAvatar && (
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div className="spinner spinner-sm" style={{ width: 20, height: 20 }}></div>
                      </div>
                    )}
                  </div>
                  <div>
                    <h2 style={{ color: 'white', margin: 0, fontFamily: 'var(--font-display)' }}>{animal.name}</h2>
                    {animal.pedigree_name && (
                      <p style={{ color: 'oklch(100% 0 0 / 0.55)', margin: 0, fontSize: 'var(--font-size-xs)', fontStyle: 'italic' }}>
                        {t('animal.pedigreeName')}: {animal.pedigree_name}
                      </p>
                    )}
                    <p style={{ color: 'oklch(100% 0 0 / 0.70)', margin: 0, fontSize: 'var(--font-size-sm)' }}>
                      {animal.breed} {animal.birthdate ? `· ${new Date().getFullYear() - new Date(animal.birthdate).getFullYear()} ${t('animal.yearsOld')}` : ''}
                    </p>
                    {animal.unique_id && (
                      <p style={{ color: 'oklch(100% 0 0 / 0.60)', margin: 0, fontSize: 'var(--font-size-xs)', marginTop: 'var(--space-1)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }} onClick={() => {
                        navigator.clipboard.writeText(animal.unique_id || '');
                        alert(t('common.copied'));
                      }}>
                        <span>ID: <code style={{ background: 'oklch(100% 0 0 / 0.12)', padding: '2px 6px', borderRadius: 'var(--radius-xs)', fontFamily: 'var(--font-mono)' }}>{animal.unique_id}</code></span>
                      </p>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: animal.dynamic_fields ? 'var(--space-3)' : 0 }}>
                  {isVetVerified && (
                    <span style={{ background: 'var(--primary-100)', border: '1px solid var(--primary-200)', borderRadius: 'var(--radius-full)', padding: '3px 10px', fontSize: 11, fontWeight: 600, color: 'var(--primary-700)' }}>
                      {t('animal.vetVerified')}
                    </span>
                  )}
                  {hasNfcTag && (
                    <span style={{ background: 'var(--primary-100)', border: '1px solid var(--primary-200)', borderRadius: 'var(--radius-full)', padding: '3px 10px', fontSize: 11, fontWeight: 600, color: 'var(--primary-700)' }}>
                      {t('animal.nfcActive')}
                    </span>
                  )}
                </div>
                
                {animal.dynamic_fields && (() => {
                  try {
                    const df = JSON.parse(animal.dynamic_fields);
                    return Object.entries(df).map(([k, v]) => (
                      <div key={k} style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-1)' }}>
                        <strong>{k}:</strong> {String(v)}
                      </div>
                    ))
                  } catch { return null; }
                })()}
              </div>

              {!isOwner && animal.contact && (
                <div style={{ background: 'var(--surface)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', border: '1px solid var(--border)' }}>
                  <div className="text-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{t('publicScan.contact')}</div>
                  <div style={{ fontWeight: 600 }}>{animal.contact.name}</div>
                </div>
              )}

              {isOwner && !animal.is_archived && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                  <button className="btn btn-secondary" onClick={() => setEditing(true)}><Edit2 size={16} /> {t('animal.edit')}</button>
                  <button className="btn btn-outline" onClick={handleArchive} disabled={submitting} style={{ borderColor: 'var(--text-tertiary)', color: 'var(--text-secondary)' }}>
                    <Trash2 size={16} /> {t('animal.archiveAnimal')}
                  </button>

                  <Link to={`/animals/${id}/tags`} className="btn btn-ghost" style={{ textDecoration: 'none', gridColumn: 'span 2' }}>
                    <Radio size={16} /> {t('animal.chips')}
                  </Link>
                  <button className="btn btn-ghost" onClick={handleOpenShare}>
                    <Share2 size={16} /> {t('animal.sharing')}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setShowTransfer(true)}>
                    <ArrowRightLeft size={16} /> {t('animal.transferBtn')}
                  </button>
                </div>
              )}

              {showTransfer && (
                <div className="card animate-slide-up">
                  <h3 style={{ marginBottom: 'var(--space-2)' }}>{t('animal.transferTitle')}</h3>
                  <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>{t('animal.transferDesc')}</p>
                  {transferCode ? (
                    <div style={{ background: 'var(--surface-alt)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                      <p style={{ margin: '0 0 var(--space-2) 0' }}>{t('animal.transferCode')}</p>
                      <h2 style={{ fontSize: '2rem', letterSpacing: '0.2em', color: 'var(--primary-600)', margin: 0 }}>{transferCode}</h2>
                      <p className="text-muted" style={{ margin: 'var(--space-2) 0 0 0', fontSize: 'var(--font-size-xs)' }}>{t('animal.transferExpires')}</p>
                    </div>
                  ) : (
                    <button className="btn btn-primary btn-full" onClick={handleGenerateTransfer} disabled={submitting}>
                      {submitting ? t('common.loading') : t('animal.transferGenerate')}
                    </button>
                  )}
                  <button className="btn btn-ghost btn-full mt-4" onClick={() => { setShowTransfer(false); setTransferCode(''); }}>{t('common.cancel')}</button>
                </div>
              )}

              {showShare && (
                <div className="card animate-slide-up">
                  <h3 style={{ marginBottom: 'var(--space-2)' }}>{t('sharing.tempLink')}</h3>
                  <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>{t('sharing.tempLinkDesc')}</p>

                  {shareLink ? (
                    <div style={{ background: 'var(--surface-alt)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', textAlign: 'center', marginBottom: 'var(--space-4)' }}>
                      <input type="text" className="form-input" value={shareLink} readOnly style={{ marginBottom: 'var(--space-2)', textAlign: 'center' }} />
                      <button className="btn btn-primary btn-full" onClick={copyShareLink}>
                        {t('sharing.copyLink')}
                      </button>
                      <p className="text-muted" style={{ margin: 'var(--space-2) 0 0 0', fontSize: 'var(--font-size-xs)' }}>{t('sharing.expiresIn')} 14 {t('sharing.days')}</p>
                    </div>
                  ) : (
                    <div style={{ marginBottom: 'var(--space-4)' }}>
                      <label className="form-label" style={{ marginBottom: 'var(--space-2)' }}>{t('sharing.linkName')}</label>
                      <input
                        className="form-input"
                        placeholder={t('sharing.linkNamePlaceholder')}
                        value={shareName}
                        onChange={e => setShareName(e.target.value)}
                        style={{ marginBottom: 'var(--space-3)' }}
                        onKeyDown={e => e.key === 'Enter' && !generatingShare && handleGenerateShare()}
                      />
                      <label className="form-label" style={{ marginBottom: 'var(--space-2)' }}>{t('sharing.linkRole')}</label>
                      <select
                        className="form-input"
                        value={shareRole}
                        onChange={e => setShareRole(e.target.value as 'guest' | 'vet' | 'authority')}
                        style={{ marginBottom: 'var(--space-3)' }}
                      >
                        <option value="guest">{t('sharing.roleGuest')}</option>
                        <option value="vet">{t('sharing.roleVet')}</option>
                        <option value="authority">{t('sharing.roleAuthority')}</option>
                      </select>
                      <button className="btn btn-primary btn-full" onClick={handleGenerateShare} disabled={generatingShare}>
                        {generatingShare ? t('common.loading') : t('sharing.generateLink')}
                      </button>
                    </div>
                  )}

                  {/* Active Shares List */}
                  <div style={{ marginBottom: 'var(--space-4)' }}>
                    <h4 style={{ marginBottom: 'var(--space-2)', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>{t('sharing.activeLinks')}</h4>
                    {loadingShares ? (
                      <div className="spinner" style={{ margin: 'var(--space-2) auto' }}></div>
                    ) : activeShares.length === 0 ? (
                      <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)', margin: 0 }}>{t('sharing.noActiveLinks')}</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                        {activeShares.map(share => {
                          const shareUrl = `${window.location.origin}/share/${share.id}`
                          return (
                          <div key={share.id} style={{
                            padding: 'var(--space-2) var(--space-3)', background: 'var(--surface)', borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-subtle)', fontSize: 'var(--font-size-xs)'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', overflow: 'hidden', flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{share.linkName}</div>
                                {share.allowedRole && share.allowedRole !== 'guest' && (
                                  <span style={{ flexShrink: 0, fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
                                    padding: '1px 5px', borderRadius: 'var(--radius-full)',
                                    background: share.allowedRole === 'vet' ? 'var(--primary-100)' : 'var(--warning-100)',
                                    color: share.allowedRole === 'vet' ? 'var(--primary-700)' : 'var(--warning-700)' }}>
                                    {share.allowedRole}
                                  </span>
                                )}
                              </div>
                              <button
                                className="btn btn-outline btn-sm"
                                onClick={() => handleRevokeShare(share.id)}
                                disabled={revokingShare === share.id}
                                style={{ marginLeft: 'var(--space-2)', borderColor: 'var(--danger-500)', color: 'var(--danger-500)', flexShrink: 0,
                                  opacity: revokingShare === share.id ? 0.5 : 1
                                }}
                              >
                                {revokingShare === share.id ? t('common.loading') : t('sharing.revoke')}
                              </button>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: '4px' }}>
                              <span style={{ color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0, fontFamily: 'monospace', fontSize: '10px' }}>{shareUrl}</span>
                              <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: '10px', flexShrink: 0 }} onClick={() => navigator.clipboard.writeText(shareUrl)}>
                                {t('profile.copy')}
                              </button>
                            </div>
                            <div style={{
                              color: share.isExpiringSoon ? 'var(--warning-500)' : 'var(--text-tertiary)',
                              fontWeight: share.isExpiringSoon ? 600 : 400
                            }}>
                              {t('sharing.expiresIn')} {Math.ceil(share.secondsRemaining / 3600)}h
                            </div>
                          </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <button className="btn btn-ghost btn-full" onClick={() => { setShowShare(false); setShareLink(''); setShareName(''); setShareRole('guest') }}>{t('common.cancel')}</button>
                </div>
              )}

              {isOwner && !!animal.is_archived && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                  {!showDeleteConfirm ? (
                    <button className="btn btn-outline" onClick={() => { setShowDeleteConfirm(true); setDeleteConfirmText('') }} disabled={submitting} style={{ borderColor: 'var(--danger-500)', color: 'var(--danger-500)' }}>
                      <Trash2 size={16} /> {t('animal.delete')}
                    </button>
                  ) : (
                    <div className="card" style={{ border: '1px solid var(--danger-500)', padding: 'var(--space-4)' }}>
                      <p style={{ margin: '0 0 var(--space-2) 0', fontWeight: 600, color: 'var(--danger-600)' }}>{t('animal.deleteConfirmTitle')}</p>
                      <p className="text-muted" style={{ margin: '0 0 var(--space-3) 0', fontSize: 'var(--font-size-sm)' }}>
                        {t('animal.deleteConfirmPrompt')} <strong>{animal.name}</strong> {t('animal.deleteConfirmPromptSuffix')}
                      </p>
                      <input
                        className="form-input"
                        style={{ marginBottom: 'var(--space-3)' }}
                        placeholder={t('animal.deleteConfirmPlaceholder')}
                        value={deleteConfirmText}
                        onChange={e => setDeleteConfirmText(e.target.value)}
                        autoFocus
                      />
                      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        <button
                          className="btn btn-danger flex-1"
                          onClick={handleDelete}
                          disabled={submitting || (deleteConfirmText.toLowerCase() !== animal.name?.toLowerCase() && deleteConfirmText !== animal.birthdate)}
                        >
                          <Trash2 size={16} /> {t('animal.deleteConfirmButton')}
                        </button>
                        <button className="btn btn-ghost" onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText('') }} disabled={submitting}>
                          {t('common.cancel')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              
              
              {!isOwner && isVet && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                  <Link to={`/animals/${id}/tags`} className="btn btn-ghost" style={{ textDecoration: 'none', border: '1px solid var(--border)' }}>
                    <Radio size={16} /> {t('animal.chips')}
                  </Link>
                </div>
              )}
            </>
          ) : (
            <div className="card animate-slide-up">
              <h3 style={{ marginBottom: 'var(--space-4)' }}>{t('animalEdit.title')}</h3>
              <form>
                <div className="form-group">
                  <label className="form-label">{t('animalEdit.name')}</label>
                  <input
                    className="form-input"
                    type="text"
                    value={editData?.name || ''}
                    onChange={(e) => setEditData({ ...editData!, name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{t('animalEdit.species')}</label>
                  <select
                    className="form-select"
                    value={editData?.species || 'dog'}
                    onChange={(e) => setEditData({ ...editData!, species: e.target.value as 'dog' | 'cat' | 'other' })}
                  >
                    <option value="dog">{t('animals.dog')}</option>
                    <option value="cat">{t('animals.cat')}</option>
                    <option value="other">{t('animals.other')}</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">{t('animalEdit.breed')}</label>
                  <input
                    className="form-input"
                    type="text"
                    value={editData?.breed || ''}
                    onChange={(e) => setEditData({ ...editData!, breed: e.target.value })}
                    placeholder={t('animals.breedPlaceholder')}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{t('animal.pedigreeName')}</label>
                  <input
                    className="form-input"
                    type="text"
                    value={(editData as any)?.pedigree_name || ''}
                    onChange={(e) => setEditData({ ...editData!, pedigree_name: e.target.value } as any)}
                    placeholder="z.B. Out of Control vom Waldhaus"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{t('animalEdit.birthdate')}</label>
                  <input
                    type="date"
                    className="form-input"
                    value={editData?.birthdate || ''}
                    onChange={(e) => setEditData({ ...editData!, birthdate: e.target.value })}
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">{t('animals.optional')} Avatar</label>
                  <input
                    type="file"
                    accept="image/*"
                    className="form-input"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => setEditData({ ...editData!, avatar_base64: ev.target?.result as string });
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{t('animalEdit.dynamicFields')}</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    placeholder={'{"Instagram": "@bella", "Chip": "1234"}'}
                    value={editData?.dynamic_fields || ''}
                    onChange={(e) => setEditData({ ...editData!, dynamic_fields: e.target.value })}
                  />
                  <p className="text-muted" style={{ fontSize: '11px', marginTop: 'var(--space-1)' }}>{t('animalEdit.customFieldsDesc')}</p>
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
                  <button type="button" className="btn btn-primary flex-1" onClick={handleEdit} disabled={submitting}>
                    {submitting ? `${t('animalEdit.saving')}...` : t('animalEdit.save')}
                  </button>
                  <button type="button" className="btn btn-ghost flex-1" onClick={() => { setEditing(false); setEditData(animal) }} disabled={submitting}>
                    {t('animalEdit.cancel')}
                  </button>
                </div>
              </form>
            </div>
          )}

        </div>

        <div>
          {vaccinationRecords.length > 0 && (
            <div className="card" style={{ marginBottom: 'var(--space-4)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                <Syringe size={18} color="var(--primary-600)" />
                <h3 style={{ margin: 0 }}>{t('animal.vaccinations')}</h3>
                <span className="badge">{vaccinationRecords.length}</span>
                {isOwner && (
                  <button className="btn btn-outline" style={{ marginLeft: 'auto', fontSize: 'var(--font-size-xs)', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => setShowVaxModal(true)}>
                    <Plus size={14} /> Eintragen
                  </button>
                )}
              </div>
              <div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)', minWidth: 0 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '0 0 var(--space-2) 0', whiteSpace: 'nowrap' }}>{t('animal.vaccinations')}</th>
                      <th style={{ textAlign: 'left', padding: '0 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>{t('vaccine.administrationDate')}</th>
                      <th style={{ textAlign: 'left', padding: '0 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>{t('vaccine.validUntil')}</th>
                      <th className="col-mobile-hidden" style={{ textAlign: 'left', padding: '0 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>{t('vaccine.batchNumber')}</th>
                      {isOwner && <th className="col-mobile-hidden" style={{ textAlign: 'left', padding: '0 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>Rollen</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {vaccinationRecords.map((record) => {
                      const recPerms = getRecordPermissions(record.doc, record.recordKey)
                      const isExpanded = expandedRecord === record.id
                      return (
                        <>
                          <tr key={record.id} style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--border-subtle)', cursor: 'pointer' }} onClick={() => setExpandedRecord(isExpanded ? null : record.id)}>
                            <td style={{ padding: 'var(--space-2) 0' }}>
                              <span style={{ fontWeight: 600 }}>{record.vaccineName || '—'}</span>
                              {record.manufacturer && <div className="text-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{record.manufacturer}</div>}
                            </td>
                            <td style={{ padding: 'var(--space-2) 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>{record.administrationDate || '—'}</td>
                            <td style={{ padding: 'var(--space-2) 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>{record.validUntil || '—'}</td>
                            <td className="col-mobile-hidden" style={{ padding: 'var(--space-2) 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>{record.batchNumber || '—'}</td>
                            {isOwner && (
                              <td className="col-mobile-hidden" style={{ padding: 'var(--space-2) 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  {['guest', 'vet', 'authority'].map(r => (
                                    <span key={r} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, border: '1px solid', borderColor: recPerms.includes(r) ? 'var(--primary-500)' : 'var(--border)', background: recPerms.includes(r) ? 'var(--primary-50)' : 'transparent', color: recPerms.includes(r) ? 'var(--primary-700)' : 'var(--text-tertiary)' }}>{r}</span>
                                  ))}
                                  {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </div>
                              </td>
                            )}
                          </tr>
                          {isExpanded && (
                            <tr key={`${record.id}-expand`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                              <td colSpan={6} style={{ padding: 'var(--space-2) 0 var(--space-3) 0' }}>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
                                  <Link to={`/animals/${id}/documents/${record.documentId}`} className="btn btn-outline" style={{ fontSize: 'var(--font-size-xs)', padding: '3px 10px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <FileText size={12} /> {t('animal.openDocument')}
                                  </Link>
                                  {record.batchNumber && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{t('vaccine.batchNumber')}: <strong>{record.batchNumber}</strong></span>}
                                  {record.manufacturer && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{t('vaccine.manufacturer')}: <strong>{record.manufacturer}</strong></span>}
                                </div>
                                {isOwner && (
                                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Freigabe:</span>
                                    {(['guest', 'vet', 'authority'] as const).map(r => (
                                      <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={recPerms.includes(r)} disabled={updatingRecord === `${record.documentId}-${record.recordKey}`}
                                          onChange={() => handleToggleRecordRole(record.documentId, record.recordKey, recPerms, r)} />
                                        {r}
                                      </label>
                                    ))}
                                    {updatingRecord === `${record.documentId}-${record.recordKey}` && <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1 }} />}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(treatmentRecords.length > 0 || isOwner) && (
            <div className="card" style={{ marginBottom: 'var(--space-4)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                <Pill size={18} color="var(--success-600)" />
                <h3 style={{ margin: 0 }}>Behandlungen</h3>
                {treatmentRecords.length > 0 && <span className="badge">{treatmentRecords.length}</span>}
                {isOwner && (
                  <button className="btn btn-outline" style={{ marginLeft: 'auto', fontSize: 'var(--font-size-xs)', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => setShowTreatModal(true)}>
                    <Plus size={14} /> Eintragen
                  </button>
                )}
              </div>
              {treatmentRecords.length === 0 ? (
                <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)', margin: 0 }}>Noch keine Behandlungen eingetragen.</p>
              ) : (
                <div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)', minWidth: 0 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '0 0 var(--space-2) 0', whiteSpace: 'nowrap' }}>Substanz</th>
                        <th style={{ textAlign: 'left', padding: '0 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>Datum</th>
                        <th className="col-mobile-hidden" style={{ textAlign: 'left', padding: '0 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>Dosierung</th>
                        <th style={{ textAlign: 'left', padding: '0 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>Nächste Fälligkeit</th>
                        {isOwner && <th className="col-mobile-hidden" style={{ textAlign: 'left', padding: '0 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>Rollen</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {treatmentRecords.map((record) => {
                        const recPerms = getRecordPermissions(record.doc, record.recordKey)
                        const isExpanded = expandedRecord === record.id
                        return (
                          <>
                            <tr key={record.id} style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--border-subtle)', cursor: 'pointer' }} onClick={() => setExpandedRecord(isExpanded ? null : record.id)}>
                              <td style={{ padding: 'var(--space-2) 0' }}>
                                <span style={{ fontWeight: 600 }}>{record.substance}</span>
                              </td>
                              <td style={{ padding: 'var(--space-2) 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>{record.administeredAt || '—'}</td>
                              <td className="col-mobile-hidden" style={{ padding: 'var(--space-2) 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>{record.dosage || '—'}</td>
                              <td style={{ padding: 'var(--space-2) 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>{record.nextDue || '—'}</td>
                              {isOwner && (
                                <td className="col-mobile-hidden" style={{ padding: 'var(--space-2) 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>
                                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                    {['guest', 'vet', 'authority'].map(r => (
                                      <span key={r} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, border: '1px solid', borderColor: recPerms.includes(r) ? 'var(--success-500)' : 'var(--border)', background: recPerms.includes(r) ? 'oklch(97% 0.05 145)' : 'transparent', color: recPerms.includes(r) ? 'var(--success-700)' : 'var(--text-tertiary)' }}>{r}</span>
                                    ))}
                                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                  </div>
                                </td>
                              )}
                            </tr>
                            {isExpanded && (
                              <tr key={`${record.id}-expand`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                <td colSpan={6} style={{ padding: 'var(--space-2) 0 var(--space-3) 0' }}>
                                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
                                    <Link to={`/animals/${id}/documents/${record.documentId}`} className="btn btn-outline" style={{ fontSize: 'var(--font-size-xs)', padding: '3px 10px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                      <FileText size={12} /> {t('animal.openDocument')}
                                    </Link>
                                    {record.dosage && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Dosierung: <strong>{record.dosage}</strong></span>}
                                    {record.vetName && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Tierarzt: <strong>{record.vetName}</strong></span>}
                                    {record.notes && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Notiz: <strong>{record.notes}</strong></span>}
                                  </div>
                                  {isOwner && (
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Freigabe:</span>
                                      {(['guest', 'vet', 'authority'] as const).map(r => (
                                        <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', cursor: 'pointer' }}>
                                          <input type="checkbox" checked={recPerms.includes(r)} disabled={updatingRecord === `${record.documentId}-${record.recordKey}`}
                                            onChange={() => handleToggleRecordRole(record.documentId, record.recordKey, recPerms, r)} />
                                          {r}
                                        </label>
                                      ))}
                                      {updatingRecord === `${record.documentId}-${record.recordKey}` && <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1 }} />}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Pet Passport Table */}
          {petPassportDocs.length > 0 && (
            <div className="card" style={{ marginBottom: 'var(--space-4)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                <Landmark size={18} color="var(--info-600)" />
                <h3 style={{ margin: 0 }}>Heimtierausweis</h3>
                <span className="badge">{petPassportDocs.length}</span>
              </div>
              <div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)', minWidth: 0 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '0 0 var(--space-2) 0', whiteSpace: 'nowrap' }}>Titel</th>
                      <th style={{ textAlign: 'left', padding: '0 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>Reisepass-Nr.</th>
                      <th className="col-mobile-hidden" style={{ textAlign: 'left', padding: '0 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>Abschnitt</th>
                      <th className="col-mobile-hidden" style={{ textAlign: 'left', padding: '0 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>Chip-Nr.</th>
                      <th style={{ textAlign: 'left', padding: '0 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>Datum</th>
                      {isOwner && <th className="col-mobile-hidden" style={{ textAlign: 'left', padding: '0 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>Rollen</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {petPassportDocs.map((doc) => {
                      const docRoles = getDocumentRoles(doc)
                      const isExpanded = expandedRecord === doc.id
                      const extracted = doc.extracted_json || {}
                      return (
                        <>
                          <tr key={doc.id} style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--border-subtle)', cursor: 'pointer' }} onClick={() => setExpandedRecord(isExpanded ? null : doc.id)}>
                            <td style={{ padding: 'var(--space-2) 0' }}>
                              <span style={{ fontWeight: 600 }}>{extracted.title || 'Heimtierausweis'}</span>
                            </td>
                            <td style={{ padding: 'var(--space-2) 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>{extracted.passport_number || '—'}</td>
                            <td className="col-mobile-hidden" style={{ padding: 'var(--space-2) 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>{extracted.section_type || '—'}</td>
                            <td className="col-mobile-hidden" style={{ padding: 'var(--space-2) 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>{extracted.identification?.chip_code || '—'}</td>
                            <td style={{ padding: 'var(--space-2) 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>{extracted.document_date || formatDateOnly(doc.created_at, i18n.language === 'de' ? 'de-AT' : 'en-GB')}</td>
                            {isOwner && (
                              <td className="col-mobile-hidden" style={{ padding: 'var(--space-2) 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  {['guest', 'vet', 'authority'].map(r => (
                                    <span key={r} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, border: '1px solid', borderColor: docRoles.includes(r) ? 'var(--info-500)' : 'var(--border)', background: docRoles.includes(r) ? 'var(--info-50)' : 'transparent', color: docRoles.includes(r) ? 'var(--info-700)' : 'var(--text-tertiary)' }}>{r}</span>
                                  ))}
                                  {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </div>
                              </td>
                            )}
                          </tr>
                          {isExpanded && (
                            <tr key={`${doc.id}-expand`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                              <td colSpan={7} style={{ padding: 'var(--space-2) 0 var(--space-3) 0' }}>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
                                  <Link to={`/animals/${id}/documents/${doc.id}`} className="btn btn-outline" style={{ fontSize: 'var(--font-size-xs)', padding: '3px 10px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <FileText size={12} /> {t('animal.openDocument')}
                                  </Link>
                                  {extracted.section_type && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Abschnitt: <strong>{extracted.section_type}</strong></span>}
                                  {extracted.identification?.chip_code && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Chip: <strong>{extracted.identification.chip_code}</strong></span>}
                                </div>
                                {isOwner && (
                                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Freigabe:</span>
                                    {(['guest', 'vet', 'authority'] as const).map(r => (
                                      <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={docRoles.includes(r)} disabled={updatingRecord === `${doc.id}-doc`}
                                          onChange={() => handleToggleDocumentRole(doc.id, docRoles, r)} />
                                        {r}
                                      </label>
                                    ))}
                                    {updatingRecord === `${doc.id}-doc` && <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1 }} />}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Medical Product Table */}
          {medicalProductDocs.length > 0 && (
            <div className="card" style={{ marginBottom: 'var(--space-4)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                <Pill size={18} color="var(--warning-600)" />
                <h3 style={{ margin: 0 }}>Medizinische Produkte</h3>
                <span className="badge">{medicalProductDocs.length}</span>
              </div>
              <div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)', minWidth: 0 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '0 0 var(--space-2) 0', whiteSpace: 'nowrap' }}>Produkt</th>
                      <th style={{ textAlign: 'left', padding: '0 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>Wirkstoff</th>
                      <th className="col-mobile-hidden" style={{ textAlign: 'left', padding: '0 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>Charge</th>
                      <th style={{ textAlign: 'left', padding: '0 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>Datum</th>
                      {isOwner && <th className="col-mobile-hidden" style={{ textAlign: 'left', padding: '0 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>Rollen</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {medicalProductDocs.map((doc) => {
                      const docRoles = getDocumentRoles(doc)
                      const isExpanded = expandedRecord === doc.id
                      const extracted = doc.extracted_json || {}
                      return (
                        <>
                          <tr key={doc.id} style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--border-subtle)', cursor: 'pointer' }} onClick={() => setExpandedRecord(isExpanded ? null : doc.id)}>
                            <td style={{ padding: 'var(--space-2) 0' }}>
                              <span style={{ fontWeight: 600 }}>{extracted.title || 'Medizinisches Produkt'}</span>
                            </td>
                            <td style={{ padding: 'var(--space-2) 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>{extracted.active_ingredient || '—'}</td>
                            <td className="col-mobile-hidden" style={{ padding: 'var(--space-2) 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>{extracted.batch_number || '—'}</td>
                            <td style={{ padding: 'var(--space-2) 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>{extracted.document_date || formatDateOnly(doc.created_at, i18n.language === 'de' ? 'de-AT' : 'en-GB')}</td>
                            {isOwner && (
                              <td className="col-mobile-hidden" style={{ padding: 'var(--space-2) 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  {['guest', 'vet', 'authority'].map(r => (
                                    <span key={r} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, border: '1px solid', borderColor: docRoles.includes(r) ? 'var(--warning-500)' : 'var(--border)', background: docRoles.includes(r) ? 'oklch(97% 0.08 70)' : 'transparent', color: docRoles.includes(r) ? 'var(--warning-700)' : 'var(--text-tertiary)' }}>{r}</span>
                                  ))}
                                  {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </div>
                              </td>
                            )}
                          </tr>
                          {isExpanded && (
                            <tr key={`${doc.id}-expand`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                              <td colSpan={6} style={{ padding: 'var(--space-2) 0 var(--space-3) 0' }}>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
                                  <Link to={`/animals/${id}/documents/${doc.id}`} className="btn btn-outline" style={{ fontSize: 'var(--font-size-xs)', padding: '3px 10px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <FileText size={12} /> {t('animal.openDocument')}
                                  </Link>
                                  {extracted.active_ingredient && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Wirkstoff: <strong>{extracted.active_ingredient}</strong></span>}
                                  {extracted.batch_number && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Charge: <strong>{extracted.batch_number}</strong></span>}
                                </div>
                                {isOwner && (
                                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Freigabe:</span>
                                    {(['guest', 'vet', 'authority'] as const).map(r => (
                                      <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={docRoles.includes(r)} disabled={updatingRecord === `${doc.id}-doc`}
                                          onChange={() => handleToggleDocumentRole(doc.id, docRoles, r)} />
                                        {r}
                                      </label>
                                    ))}
                                    {updatingRecord === `${doc.id}-doc` && <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1 }} />}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pedigree Table */}
          {pedigreeDocs.length > 0 && (
            <div className="card" style={{ marginBottom: 'var(--space-4)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                <Award size={18} color="var(--primary-600)" />
                <h3 style={{ margin: 0 }}>Stammbaum</h3>
                <span className="badge">{pedigreeDocs.length}</span>
              </div>
              <div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)', minWidth: 0 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '0 0 var(--space-2) 0', whiteSpace: 'nowrap' }}>Titel</th>
                      <th style={{ textAlign: 'left', padding: '0 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>Datum</th>
                      {isOwner && <th className="col-mobile-hidden" style={{ textAlign: 'left', padding: '0 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>Rollen</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pedigreeDocs.map((doc) => {
                      const docRoles = getDocumentRoles(doc)
                      const isExpanded = expandedRecord === doc.id
                      const extracted = doc.extracted_json || {}
                      return (
                        <>
                          <tr key={doc.id} style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--border-subtle)', cursor: isOwner ? 'pointer' : undefined }} onClick={isOwner ? () => setExpandedRecord(isExpanded ? null : doc.id) : undefined}>
                            <td style={{ padding: 'var(--space-2) 0' }}>
                              <Link to={`/animals/${id}/documents/${doc.id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600 }} onClick={e => e.stopPropagation()}>
                                {extracted.title || 'Stammbaum'}
                              </Link>
                            </td>
                            <td style={{ padding: 'var(--space-2) 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>{extracted.document_date || formatDateOnly(doc.created_at, i18n.language === 'de' ? 'de-AT' : 'en-GB')}</td>
                            {isOwner && (
                              <td className="col-mobile-hidden" style={{ padding: 'var(--space-2) 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  {['guest', 'vet', 'authority'].map(r => (
                                    <span key={r} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, border: '1px solid', borderColor: docRoles.includes(r) ? 'var(--primary-500)' : 'var(--border)', background: docRoles.includes(r) ? 'var(--primary-50)' : 'transparent', color: docRoles.includes(r) ? 'var(--primary-700)' : 'var(--text-tertiary)' }}>{r}</span>
                                  ))}
                                  {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </div>
                              </td>
                            )}
                          </tr>
                          {isOwner && isExpanded && (
                            <tr key={`${doc.id}-expand`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                              <td colSpan={3} style={{ padding: 'var(--space-1) 0 var(--space-2) 0' }}>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Freigabe:</span>
                                  {(['guest', 'vet', 'authority'] as const).map(r => (
                                    <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', cursor: 'pointer' }}>
                                      <input type="checkbox" checked={docRoles.includes(r)} disabled={updatingRecord === `${doc.id}-doc`}
                                        onChange={() => handleToggleDocumentRole(doc.id, docRoles, r)} />
                                      {r}
                                    </label>
                                  ))}
                                  {updatingRecord === `${doc.id}-doc` && <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1 }} />}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Dog Certificate Table */}
          {dogCertificateDocs.length > 0 && (
            <div className="card" style={{ marginBottom: 'var(--space-4)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                <GraduationCap size={18} color="var(--success-600)" />
                <h3 style={{ margin: 0 }}>Hundeführerschein</h3>
                <span className="badge">{dogCertificateDocs.length}</span>
              </div>
              <div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)', minWidth: 0 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '0 0 var(--space-2) 0', whiteSpace: 'nowrap' }}>Titel</th>
                      <th style={{ textAlign: 'left', padding: '0 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>Ergebnis</th>
                      <th style={{ textAlign: 'left', padding: '0 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>Datum</th>
                      {isOwner && <th className="col-mobile-hidden" style={{ textAlign: 'left', padding: '0 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>Rollen</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {dogCertificateDocs.map((doc) => {
                      const docRoles = getDocumentRoles(doc)
                      const isExpanded = expandedRecord === doc.id
                      const extracted = doc.extracted_json || {}
                      return (
                        <>
                          <tr key={doc.id} style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--border-subtle)', cursor: isOwner ? 'pointer' : undefined }} onClick={isOwner ? () => setExpandedRecord(isExpanded ? null : doc.id) : undefined}>
                            <td style={{ padding: 'var(--space-2) 0' }}>
                              <Link to={`/animals/${id}/documents/${doc.id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600 }} onClick={e => e.stopPropagation()}>
                                {extracted.title || 'Hundeführerschein'}
                              </Link>
                            </td>
                            <td style={{ padding: 'var(--space-2) 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>{extracted.result || '—'}</td>
                            <td style={{ padding: 'var(--space-2) 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>{extracted.exam_date || extracted.document_date || formatDateOnly(doc.created_at, i18n.language === 'de' ? 'de-AT' : 'en-GB')}</td>
                            {isOwner && (
                              <td className="col-mobile-hidden" style={{ padding: 'var(--space-2) 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  {['guest', 'vet', 'authority'].map(r => (
                                    <span key={r} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, border: '1px solid', borderColor: docRoles.includes(r) ? 'var(--success-500)' : 'var(--border)', background: docRoles.includes(r) ? 'oklch(97% 0.05 145)' : 'transparent', color: docRoles.includes(r) ? 'var(--success-700)' : 'var(--text-tertiary)' }}>{r}</span>
                                  ))}
                                  {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </div>
                              </td>
                            )}
                          </tr>
                          {isOwner && isExpanded && (
                            <tr key={`${doc.id}-expand`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                              <td colSpan={4} style={{ padding: 'var(--space-1) 0 var(--space-2) 0' }}>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Freigabe:</span>
                                  {(['guest', 'vet', 'authority'] as const).map(r => (
                                    <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', cursor: 'pointer' }}>
                                      <input type="checkbox" checked={docRoles.includes(r)} disabled={updatingRecord === `${doc.id}-doc`}
                                        onChange={() => handleToggleDocumentRole(doc.id, docRoles, r)} />
                                      {r}
                                    </label>
                                  ))}
                                  {updatingRecord === `${doc.id}-doc` && <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1 }} />}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* General Document Table */}
          {generalDocs.length > 0 && (
            <div className="card" style={{ marginBottom: 'var(--space-4)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                <FileText size={18} color="var(--text-secondary)" />
                <h3 style={{ margin: 0 }}>Sonstige Dokumente</h3>
                <span className="badge">{generalDocs.length}</span>
              </div>
              <div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)', minWidth: 0 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '0 0 var(--space-2) 0', whiteSpace: 'nowrap' }}>Titel</th>
                      <th className="col-mobile-hidden" style={{ textAlign: 'left', padding: '0 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>Zusammenfassung</th>
                      <th style={{ textAlign: 'left', padding: '0 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>Datum</th>
                      {isOwner && <th className="col-mobile-hidden" style={{ textAlign: 'left', padding: '0 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>Rollen</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {generalDocs.map((doc) => {
                      const docRoles = getDocumentRoles(doc)
                      const isExpanded = expandedRecord === doc.id
                      const extracted = doc.extracted_json || {}
                      const summary = extracted.summary || ''
                      return (
                        <>
                          <tr key={doc.id} style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--border-subtle)', cursor: isOwner ? 'pointer' : undefined }} onClick={isOwner ? () => setExpandedRecord(isExpanded ? null : doc.id) : undefined}>
                            <td style={{ padding: 'var(--space-2) 0' }}>
                              <Link to={`/animals/${id}/documents/${doc.id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600 }} onClick={e => e.stopPropagation()}>
                                {extracted.title || 'Dokument'}
                              </Link>
                            </td>
                            <td className="col-mobile-hidden" style={{ padding: 'var(--space-2) 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }}>{summary || '—'}</td>
                            <td style={{ padding: 'var(--space-2) 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>{extracted.document_date || formatDateOnly(doc.created_at, i18n.language === 'de' ? 'de-AT' : 'en-GB')}</td>
                            {isOwner && (
                              <td className="col-mobile-hidden" style={{ padding: 'var(--space-2) 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  {['guest', 'vet', 'authority'].map(r => (
                                    <span key={r} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, border: '1px solid', borderColor: docRoles.includes(r) ? 'var(--primary-500)' : 'var(--border)', background: docRoles.includes(r) ? 'var(--primary-50)' : 'transparent', color: docRoles.includes(r) ? 'var(--primary-700)' : 'var(--text-tertiary)' }}>{r}</span>
                                  ))}
                                  {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </div>
                              </td>
                            )}
                          </tr>
                          {isOwner && isExpanded && (
                            <tr key={`${doc.id}-expand`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                              <td colSpan={4} style={{ padding: 'var(--space-1) 0 var(--space-2) 0' }}>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Freigabe:</span>
                                  {(['guest', 'vet', 'authority'] as const).map(r => (
                                    <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', cursor: 'pointer' }}>
                                      <input type="checkbox" checked={docRoles.includes(r)} disabled={updatingRecord === `${doc.id}-doc`}
                                        onChange={() => handleToggleDocumentRole(doc.id, docRoles, r)} />
                                      {r}
                                    </label>
                                  ))}
                                  {updatingRecord === `${doc.id}-doc` && <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1 }} />}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(isOwner || isVet) && !animal.is_archived && (
            <Link to={`/animals/${id}/scan`} className="btn btn-primary btn-full" style={{ marginBottom: 'var(--space-3)' }}>
              <Camera size={18} /> {t('animal.addDocument')}
            </Link>
          )}

          {/* Document Tabs */}
          <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', borderBottom: '1px solid var(--border)' }}>
        <button
          onClick={() => setDocumentTab('all')}
          style={{
            padding: '12px 16px',
            background: 'none',
            border: 'none',
            borderBottom: documentTab === 'all' ? '2px solid var(--primary-500)' : 'none',
            cursor: 'pointer',
            color: documentTab === 'all' ? 'var(--primary-500)' : 'var(--text-tertiary)',
            fontWeight: documentTab === 'all' ? 600 : 400,
            fontSize: 'var(--font-size-sm)'
          }}
        >
          {t('animal.docsTab')} ({documents.filter(d => d.analysis_status !== 'pending_analysis').length})
        </button>
        <button
          onClick={() => setDocumentTab('pending')}
          style={{
            padding: '12px 16px',
            background: 'none',
            border: 'none',
            borderBottom: documentTab === 'pending' ? '2px solid var(--danger-500)' : 'none',
            cursor: 'pointer',
            color: documentTab === 'pending' ? 'var(--danger-500)' : (pendingDocuments.length > 0 ? 'var(--danger-500)' : 'var(--text-tertiary)'),
            fontWeight: documentTab === 'pending' ? 600 : (pendingDocuments.length > 0 ? 600 : 400),
            fontSize: 'var(--font-size-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <AlertTriangle size={16} />
          {t('animal.pendingTab')} ({pendingDocuments.length})
        </button>
      </div>

      {/* All Documents Tab */}
      {documentTab === 'all' && (
        <>
          <h3 style={{ marginBottom: 'var(--space-3)', marginTop: 0 }}>{t('animal.docsTab')} ({documents.filter(d => d.analysis_status !== 'pending_analysis').length})</h3>
          {documents.length === 0 && <p className="text-muted text-center" style={{ padding: 'var(--space-4) 0' }}>{t('animal.noDocs')}</p>}

          {documents.length > 0 && (
            <>
              {/* Type filter chips + sort toggle */}
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
                {(['all', 'vaccination', 'treatment', 'pet_passport', 'medical_product', 'pedigree', 'dog_certificate', 'general'] as const).map(type => (
                  <button
                    key={type}
                    className={`btn ${filterType === type ? 'btn-primary' : 'btn-outline'}`}
                    style={{ fontSize: 'var(--font-size-xs)', padding: '4px 12px' }}
                    onClick={() => setFilterType(type)}
                  >
                    {type === 'all' ? t('animal.filterAll') : docTypeLabel(type)}
                  </button>
                ))}
                <button
                  className="btn btn-ghost"
                  style={{ marginLeft: 'auto', fontSize: 'var(--font-size-xs)', display: 'flex', alignItems: 'center', gap: '4px' }}
                  onClick={() => setSortOrder(o => o === 'desc' ? 'asc' : 'desc')}
                >
                  {sortOrder === 'desc' ? <ArrowDownAZ size={14} /> : <ArrowUpAZ size={14} />}
                  {t('animal.sortDate')}
                </button>
              </div>

              {/* Search + filter toggle */}
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                  <input
                    className="form-input"
                    style={{ paddingLeft: 38 }}
                    type="text"
                    placeholder={t('animal.searchDocs')}
                    value={documentSearch}
                    onChange={e => setDocumentSearch(e.target.value.toLowerCase())}
                  />
                </div>
                <button
                  className={`btn ${showAdvancedFilter ? 'btn-primary' : 'btn-outline'}`}
                  style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }}
                  onClick={() => setShowAdvancedFilter(f => !f)}
                >
                  <SlidersHorizontal size={16} />
                </button>
              </div>

              {/* Advanced filter panel */}
              {showAdvancedFilter && (
                <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', marginBottom: 'var(--space-3)', display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <label className="form-label" style={{ fontSize: 'var(--font-size-xs)', marginBottom: '4px' }}>{t('animal.filterByTag')}</label>
                    <select className="form-select" value={filterTag} onChange={e => setFilterTag(e.target.value)}>
                      <option value="">{t('animal.filterAll')}</option>
                      {allTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <label className="form-label" style={{ fontSize: 'var(--font-size-xs)', marginBottom: '4px' }}>{t('animal.filterFrom')}</label>
                    <input type="date" className="form-input" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
                  </div>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <label className="form-label" style={{ fontSize: 'var(--font-size-xs)', marginBottom: '4px' }}>{t('animal.filterTo')}</label>
                    <input type="date" className="form-input" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
                  </div>
                  {(filterTag || filterDateFrom || filterDateTo) && (
                    <button className="btn btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--font-size-xs)' }}
                      onClick={() => { setFilterTag(''); setFilterDateFrom(''); setFilterDateTo(''); }}>
                      <X size={14} /> {t('animal.filterReset')}
                    </button>
                  )}
                </div>
              )}

              {/* Grouped or flat document list */}
              {groupedDocs ? (
                Array.from(groupedDocs.entries()).map(([type, docs]) => (
                  <div key={type} style={{ marginBottom: 'var(--space-4)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', paddingBottom: 'var(--space-1)', borderBottom: '1px solid var(--border-subtle)' }}>
                      {type === 'vaccination' ? <Syringe size={14} color="var(--primary-600)" /> : <FileText size={14} color="var(--primary-600)" />}
                      <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{docTypeLabel(type)}</span>
                      <span className="badge">{docs.length}</span>
                    </div>
                    {docs.map(doc => (
                      <Link key={doc.id} to={`/animals/${id}/documents/${doc.id}`} style={{ textDecoration: 'none' }}>
                        <div className="card card-sm" style={{
                          display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)',
                          border: doc.added_by_role === 'vet' ? '1.5px solid var(--success-500)' : undefined,
                          background: doc.added_by_role === 'vet' ? 'var(--success-50)' : 'var(--bg-elevated)',
                          boxShadow: doc.added_by_role === 'vet' ? '0 4px 12px rgba(16, 185, 129, 0.1)' : undefined
                        }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: 'var(--radius-sm)', flexShrink: 0,
                            background: doc.added_by_role === 'vet' ? 'var(--success-100)' : 'var(--primary-50)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {doc.doc_type === 'vaccination' ? <Syringe size={16} color={doc.added_by_role === 'vet' ? "var(--success-600)" : "var(--primary-600)"} strokeWidth={2} /> : <FileText size={16} color={doc.added_by_role === 'vet' ? "var(--success-600)" : "var(--primary-600)"} strokeWidth={2} />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                              {doc.extracted_json?.title || (doc.doc_type ? docTypeLabel(doc.doc_type) : 'Dokument')}
                              {doc.added_by_role === 'vet' && doc.added_by_verified && (
                                <VerifiedBadge name={doc.added_by_name || 'Tierarzt'} verified={!!doc.added_by_verified} role="vet" />
                              )}
                            </div>
                            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
                              {doc.created_at ? formatDate(doc.created_at, i18n.language === 'de' ? 'de-AT' : 'en-GB') : '—'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '4px', flexDirection: 'column', alignItems: 'flex-end' }}>
                            {doc.added_by_role === 'vet' && <span className="badge badge-vet" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><CheckCircle size={10} /> {t('animal.vet')}</span>}
                            {doc.added_by_role === 'authority' && <span className="badge badge-authority" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><ShieldAlert size={10} /> {t('animal.authority')}</span>}
                            {!['vet', 'authority'].includes(doc.added_by_role ?? '') && <span className="badge" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px' }}>{t('animal.owner')}</span>}
                            {doc.ocr_provider === 'none' && (
                              <span className="badge badge-danger" style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', background: 'var(--danger-50)', color: 'var(--danger-600)', borderColor: 'var(--danger-500)' }}>
                                <AlertTriangle size={10} /> Nicht analysiert
                              </span>
                            )}                            <span className="text-muted" style={{ fontSize: '10px' }}>{doc.ocr_provider || '—'}</span>
                          </div>                        </div>
                      </Link>
                    ))}
                  </div>
                ))
              ) : (
                filteredDocs.map(doc => (
                  <Link key={doc.id} to={`/animals/${id}/documents/${doc.id}`} style={{ textDecoration: 'none' }}>
                    <div className="card card-sm" style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)',
                      border: doc.added_by_role === 'vet' ? '1.5px solid var(--success-500)' : undefined,
                      background: doc.added_by_role === 'vet' ? 'var(--success-50)' : 'var(--bg-elevated)',
                      boxShadow: doc.added_by_role === 'vet' ? '0 4px 12px rgba(16, 185, 129, 0.1)' : undefined
                    }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 'var(--radius-sm)', flexShrink: 0,
                        background: doc.added_by_role === 'vet' ? 'var(--success-100)' : 'var(--primary-50)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {doc.doc_type === 'vaccination' ? <Syringe size={16} color={doc.added_by_role === 'vet' ? "var(--success-600)" : "var(--primary-600)"} strokeWidth={2} /> : <FileText size={16} color={doc.added_by_role === 'vet' ? "var(--success-600)" : "var(--primary-600)"} strokeWidth={2} />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                          {doc.extracted_json?.title || (doc.doc_type ? docTypeLabel(doc.doc_type) : 'Dokument')}
                          {doc.added_by_role === 'vet' && doc.added_by_verified && (
                            <VerifiedBadge name={doc.added_by_name || 'Tierarzt'} verified={!!doc.added_by_verified} role="vet" />
                          )}
                        </div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
                          {doc.created_at ? formatDate(doc.created_at, i18n.language === 'de' ? 'de-AT' : 'en-GB') : '—'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexDirection: 'column', alignItems: 'flex-end' }}>
                        {doc.added_by_role === 'vet' && <span className="badge badge-vet" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><CheckCircle size={10} /> {t('animal.vet')}</span>}
                        {doc.added_by_role === 'authority' && <span className="badge badge-authority" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><ShieldAlert size={10} /> {t('animal.authority')}</span>}
                        {!['vet', 'authority'].includes(doc.added_by_role ?? '') && <span className="badge" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px' }}>{t('animal.owner')}</span>}
                        {doc.ocr_provider === 'none' && (
                          <span className="badge badge-danger" style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', background: 'var(--danger-50)', color: 'var(--danger-600)', borderColor: 'var(--danger-500)' }}>
                            <AlertTriangle size={10} /> Nicht analysiert
                          </span>
                        )}                        <span className="text-muted" style={{ fontSize: '10px' }}>{doc.ocr_provider || '—'}</span>
                      </div>                    </div>
                  </Link>
                ))
              )}

              {filteredDocs.length === 0 && documents.filter(d => d.analysis_status !== 'pending_analysis').length > 0 && (
                <p className="text-muted text-center" style={{ padding: 'var(--space-4) 0' }}>{t('animal.noDocsFiltered')}</p>
              )}
            </>
          )}

          <p className="text-muted" style={{ fontSize: '11px', textAlign: 'center', marginTop: 'var(--space-2)', paddingBottom: 'var(--space-4)' }}>
            {t('docDetail.ocrDisclaimer')}
          </p>
        </>
      )}

      {/* Pending Documents Tab */}
      {documentTab === 'pending' && (
        <>
          <h3 style={{ marginBottom: 'var(--space-3)', marginTop: 0 }}>{t('animal.pendingTab')} ({pendingDocuments.length})</h3>
          {pendingDocuments.length === 0 && <p className="text-muted text-center" style={{ padding: 'var(--space-4) 0' }}>{t('animal.pendingNone')}</p>}

          {pendingDocuments.map(doc => (
            <div key={doc.id} className="card card-sm" style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)',
              border: '1.5px solid var(--danger-500)',
              background: 'color-mix(in oklch, var(--danger-500) 12%, var(--surface-1))',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 'var(--radius-sm)', flexShrink: 0,
                background: 'color-mix(in oklch, var(--danger-500) 20%, var(--surface-1))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <AlertTriangle size={16} color="var(--danger-500)" strokeWidth={2} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
                  {t('animal.waitGemini')}
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
                  {formatDate(doc.created_at, i18n.language === 'de' ? 'de-AT' : 'en-GB')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => { setRetryDocId(doc.id); setRetryDoc(doc); setRequestedDocumentType((doc.doc_type as DocumentTypeSelectValue) ?? DOCUMENT_TYPE_PLACEHOLDER); setShowRetryModal(true); }}
                  disabled={retrying !== null}                  style={{
                    padding: '8px 12px',
                    background: 'var(--primary-500)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    cursor: retrying !== null ? 'not-allowed' : 'pointer',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    opacity: retrying !== null ? 0.6 : 1
                  }}
                >
                  <RefreshCw size={12} />
                  {retrying === doc.id ? `${t('animal.retrying')}...` : t('animal.analyzeBtn')}
                </button>
                <button
                  onClick={() => handleDeletePendingDoc(doc.id)}
                  style={{
                    padding: '8px 12px',
                    background: 'transparent',
                    color: 'var(--danger-500)',
                    border: '1px solid var(--danger-500)',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Trash2 size={12} />
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {showArchiveDialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 'var(--space-4)'
          }}
          onClick={() => {
            setShowArchiveDialog(false)
            setArchiveReason('')
            setError(null)
          }}
        >
          <div
            className="card animate-slide-up"
            style={{
              maxWidth: '400px',
              width: '100%',
              padding: 'var(--space-6)',
              position: 'relative'
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="btn-ghost"
              style={{
                position: 'absolute',
                top: 'var(--space-3)',
                right: 'var(--space-3)',
                padding: '8px',
                margin: 0
              }}
              onClick={() => {
                setShowArchiveDialog(false)
                setArchiveReason('')
                setError(null)
              }}
            >
              <X size={20} />
            </button>

            <h3 style={{ marginTop: 0, marginBottom: 'var(--space-2)' }}>{t('animal.archiveDialog')}</h3>
            <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>{t('animal.archiveConfirm')}</p>

            <div className="form-group" style={{ marginBottom: 'var(--space-6)' }}>
              <label className="form-label" style={{ marginBottom: 'var(--space-2)' }}>{t('animal.archiveReason')} *</label>
              <select
                className="form-select"
                value={archiveReason}
                onChange={(event) => {
                  setArchiveReason(event.target.value as typeof archiveReason)
                  setError(null)
                }}
                style={{ borderColor: !archiveReason && error ? 'var(--danger-500)' : 'var(--border)' }}
              >
                <option value="">{t('common.select')}</option>
                <option value="verstorben">{t('animal.archiveReason_verstorben')}</option>
                <option value="verloren">{t('animal.archiveReason_verloren')}</option>
                <option value="verkauft">{t('animal.archiveReason_verkauft')}</option>
                <option value="abgegeben">{t('animal.archiveReason_abgegeben')}</option>
                <option value="sonstiges">{t('animal.archiveReason_sonstiges')}</option>
              </select>
              {!archiveReason && error && (
                <p style={{ color: 'var(--danger-500)', fontSize: 'var(--font-size-xs)', margin: 'var(--space-1) 0 0 0' }}>{error}</p>
              )}
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <button className="btn btn-primary flex-1" onClick={handleArchiveConfirm} disabled={submitting || !archiveReason}>
                {submitting ? `${t('common.loading')}...` : t('animal.archiveAnimal')}
              </button>
              <button
                className="btn btn-ghost flex-1"
                onClick={() => {
                  setShowArchiveDialog(false)
                  setArchiveReason('')
                  setError(null)
                }}
                disabled={submitting}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Vaccination Entry Modal */}
      {showVaxModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'oklch(0% 0 0 / 0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)' }}>
          <div className="card" style={{ width: '100%', maxWidth: 480, maxHeight: '90dvh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><Syringe size={18} /> Impfung eintragen</h3>
              <button className="btn btn-ghost" onClick={() => setShowVaxModal(false)}><X size={18} /></button>
            </div>
            {manualError && <div className="error-card" style={{ marginBottom: 'var(--space-3)' }}><p>{manualError}</p></div>}
            <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
              <div className="form-group"><label className="form-label">Impfstoff *</label><input className="form-input" value={manualVax.vaccine_name} onChange={e => setManualVax(p => ({ ...p, vaccine_name: e.target.value }))} placeholder="z.B. Nobivac Puppy DP" /></div>
              <div className="form-group"><label className="form-label">Datum *</label><input className="form-input" type="date" value={manualVax.date} onChange={e => setManualVax(p => ({ ...p, date: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Zielkrankheit</label><input className="form-input" value={manualVax.target_disease} onChange={e => setManualVax(p => ({ ...p, target_disease: e.target.value }))} placeholder="z.B. Staupe, Parvo" /></div>
              <div className="form-group"><label className="form-label">Chargennummer</label><input className="form-input" value={manualVax.batch_number} onChange={e => setManualVax(p => ({ ...p, batch_number: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Gültig bis</label><input className="form-input" type="date" value={manualVax.valid_until} onChange={e => setManualVax(p => ({ ...p, valid_until: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Tierarzt</label><input className="form-input" value={manualVax.vet_name} onChange={e => setManualVax(p => ({ ...p, vet_name: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Notizen</label><textarea className="form-input" value={manualVax.notes} onChange={e => setManualVax(p => ({ ...p, notes: e.target.value }))} rows={2} /></div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setShowVaxModal(false)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={handleSaveManualVax} disabled={savingManual || !manualVax.vaccine_name || !manualVax.date}>
                {savingManual ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Treatment Entry Modal */}
      {showTreatModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'oklch(0% 0 0 / 0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)' }}>
          <div className="card" style={{ width: '100%', maxWidth: 480, maxHeight: '90dvh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><Pill size={18} /> Behandlung eintragen</h3>
              <button className="btn btn-ghost" onClick={() => setShowTreatModal(false)}><X size={18} /></button>
            </div>
            {manualError && <div className="error-card" style={{ marginBottom: 'var(--space-3)' }}><p>{manualError}</p></div>}
            <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
              <div className="form-group"><label className="form-label">Substanz / Medikament *</label><input className="form-input" value={manualTreat.substance} onChange={e => setManualTreat(p => ({ ...p, substance: e.target.value }))} placeholder="z.B. Frontline Spot-on" /></div>
              <div className="form-group"><label className="form-label">Datum *</label><input className="form-input" type="date" value={manualTreat.date} onChange={e => setManualTreat(p => ({ ...p, date: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Dosierung</label><input className="form-input" value={manualTreat.dosage} onChange={e => setManualTreat(p => ({ ...p, dosage: e.target.value }))} placeholder="z.B. 1 Pipette" /></div>
              <div className="form-group"><label className="form-label">Tierarzt</label><input className="form-input" value={manualTreat.vet_name} onChange={e => setManualTreat(p => ({ ...p, vet_name: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Nächste Fälligkeit</label><input className="form-input" type="date" value={manualTreat.next_due} onChange={e => setManualTreat(p => ({ ...p, next_due: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Notizen</label><textarea className="form-input" value={manualTreat.notes} onChange={e => setManualTreat(p => ({ ...p, notes: e.target.value }))} rows={2} /></div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setShowTreatModal(false)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={handleSaveManualTreat} disabled={savingManual || !manualTreat.substance || !manualTreat.date}>
                {savingManual ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}

        </div>
      </div>
    </div>
  )
}
