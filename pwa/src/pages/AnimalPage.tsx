import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getAnimal, getAnimalDocuments, getAnimalTags, updateAnimal, deleteAnimal, uploadAnimalAvatar, deleteDocument, getMe } from '../api/rest'
import { PageHeader } from '../components/PageHeader' 
import { PawPrint, Cat, Edit2, Trash2, Camera, Search, Radio, ShieldAlert, AlertTriangle, RefreshCw, X, Syringe, FileText, CheckCircle, ArrowDownAZ, ArrowUpAZ, SlidersHorizontal, ArrowRightLeft, Share2 } from 'lucide-react'
import { AnimalDTO } from '../types/animal'
interface AnimalTag {
  tag_id: string; tag_type: string; active: number; added_at: string
}
interface Document {
  id: string; doc_type: string; created_at: string; ocr_provider: string; added_by_role?: string; analysis_status?: string; extracted_json?: any
}

export default function AnimalPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const docTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      vaccination: t('animal.docTypeVaccination'),
      medication: t('animal.docTypeMedication'),
      other: t('animal.docTypeOther')
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
  const [filterType, setFilterType] = useState<'all' | 'vaccination' | 'medication' | 'other'>('all')
  const [filterTag, setFilterTag] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferCode, setTransferCode] = useState('')
  const [showShare, setShowShare] = useState(false)
  const [shareLink, setShareLink] = useState('')
  const [generatingShare, setGeneratingShare] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const avatarInputRef = useRef<HTMLInputElement>(null)
  
  const [showRetryModal, setShowRetryModal] = useState(false)
  const [retryDocId, setRetryDocId] = useState<string | null>(null)
  const [retryProvider, setRetryProvider] = useState('google')
  const [retryModel, setRetryModel] = useState('gemini-3.1-flash-lite-preview')
  const [hasGemini, setHasGemini] = useState(false)
  const [hasAnthropic, setHasAnthropic] = useState(false)
  const [hasOpenai, setHasOpenai] = useState(false)
  const [hasSystemAi, setHasSystemAi] = useState(true)
  const hasAnyKey = hasGemini || hasAnthropic || hasOpenai || hasSystemAi
  const [availableModels, setAvailableModels] = useState<any>({
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

  useEffect(() => {
    getMe().then(res => {
      setHasGemini(res.data.has_gemini_token)
      setHasAnthropic(res.data.has_anthropic_token)
      setHasOpenai(res.data.has_openai_token)

      let prio = ['system', 'google', 'anthropic', 'openai']
      try { if (res.data.ai_provider_priority) prio = typeof res.data.ai_provider_priority === 'string' ? JSON.parse(res.data.ai_provider_priority) : res.data.ai_provider_priority } catch {}
      setHasSystemAi(prio.includes('system'))

      if (res.data.has_gemini_token) { setRetryProvider('google'); setRetryModel('gemini-3.1-flash-lite-preview') }
      else if (res.data.has_anthropic_token) { setRetryProvider('anthropic'); setRetryModel('claude-3-5-sonnet-20241022') }
      else if (res.data.has_openai_token) { setRetryProvider('openai'); setRetryModel('gpt-4o-mini') }

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
    if (prov === 'google') setRetryModel('gemini-3.1-flash-lite-preview')
    else if (prov === 'anthropic') setRetryModel('claude-3-5-sonnet-20241022')
    else if (prov === 'openai') setRetryModel('gpt-4o-mini')
  }

  const handleRetryAnalysisAPI = async () => {
    if (!retryDocId) return
    setRetrying(retryDocId)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(`/api/documents/${retryDocId}/retry-analysis`, { 
        method: 'POST', 
        headers,
        body: JSON.stringify({ provider: retryProvider, model: retryModel })
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || t('animal.documentFailed'))
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

  const handleDeletePendingDoc = async (docId: string) => {
    if (!confirm(t('docDetail.deleteConfirm'))) return
    try {
      await deleteDocument(docId)
      setPendingDocuments(prev => prev.filter(d => d.id !== docId))
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
        // Load pending documents with JWT token
        const token = localStorage.getItem('token')
        const headers: Record<string, string> = {}
        if (token) headers['Authorization'] = `Bearer ${token}`
        fetch(`/api/animals/${id}/documents/pending`, { headers })
          .then(r => r.json())
          .then(pendingDocs => {
            console.log('Pending documents loaded:', pendingDocs)
            setPendingDocuments(Array.isArray(pendingDocs) ? pendingDocs : [])
          })
          .catch(err => {
            console.error('Fehler beim Laden von pending Dokumenten:', err)
            setPendingDocuments([])
          })
      })
      .catch(() => setError(t('error.notFound')))
      .finally(() => setLoading(false))
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
    if (!window.confirm(t('animal.archiveConfirm'))) return
    try {
      setSubmitting(true)
      const token = localStorage.getItem('token')
      await fetch(`/api/animals/${id}/archive`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${token}` } })
      setAnimal(prev => prev ? { ...prev, is_archived: 1 } : null)
    } catch (err: any) {
      setError(err.response?.data?.error || t('common.error'))
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
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setShareLink(`${window.location.origin}/share/${data.shareId}`)
    } catch (err) {
      setError(t('common.error'))
    } finally {
      setGeneratingShare(false)
    }
  }

  const copyShareLink = () => {
    navigator.clipboard.writeText(shareLink)
  }

  if (loading) return <div className="container page" style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}><div className="spinner spinner-lg"></div></div>
  if (!animal) return <div className="container page"><div className="error-card"><p>{error || t('error.notFound')}</p></div></div>

  const isOwner = animal.is_owner !== false
  const isVet = animal.request_role === 'vet'

  const hasNfcTag = tags.some(t => t.tag_type === 'nfc' && t.active === 1)
  const isVetVerified = false // Placeholder for future implementation

  if (showRetryModal) {
    return (
      <div className="container page">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)', marginTop: 'var(--space-2)' }}>
          <button className="btn-ghost" style={{ padding: '8px', margin: '-8px' }} onClick={() => { setShowRetryModal(false); setError(null); }}>
            <X size={24} />
          </button>
          <h1 style={{ margin: 0, fontSize: 'var(--font-size-xl)' }}>{t('docDetail.aiAnalysis')}</h1>
        </div>
        
        {error && <div className="error-card" style={{ marginBottom: 'var(--space-4)' }}><p>{error}</p></div>}

        <div className="card animate-slide-up" style={{ borderColor: 'var(--primary-200)' }}>
          <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>{t('docDetail.aiSelectProvider')}</p>
          {!hasAnyKey ? (
            <div className="error-card" style={{ marginBottom: 'var(--space-4)' }}><p style={{ margin: 0 }}>{t('docDetail.noProvidersConfigured')}</p></div>
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
              <button className="btn btn-primary flex-1" onClick={handleRetryAnalysisAPI} disabled={retrying !== null}>
                {retrying !== null ? t('animal.retrying') : t('animal.analyzeBtn')}
              </button>
            )}
            <button className="btn btn-ghost flex-1" onClick={() => { setShowRetryModal(false); setError(null); }} disabled={retrying !== null}>{t('common.cancel')}</button>
          </div>
        </div>
      </div>
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
      (d.created_at ? new Date(d.created_at).toLocaleString('de-AT').includes(documentSearch) : false)
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
    for (const type of ['vaccination', 'medication', 'other'] as const) {
      const group = filteredDocs.filter(d => d.doc_type === type)
      if (group.length > 0) map.set(type, group)
    }
    return map
  })() : null

  return (
    <div className="container page">
      <PageHeader title={animal.name} backTo="/animals" showThemeToggle />

      {error && <div className="error-card"><p>{error}</p></div>}

      <div className="content-grid">
        <div>
          {!isOwner && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3)', background: 'var(--info-50)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', border: '1px solid var(--info-200)' }}>
              <ShieldAlert size={18} color="var(--info-600)" />
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--info-800)' }}>
                {t('scan.sharedAccess')}: <strong style={{ textTransform: 'capitalize' }}>{animal.request_role === 'vet' ? t('docScan.vet') : animal.request_role === 'authority' ? t('docScan.authority') : t('docScan.guestAccess')}</strong>
              </span>
            </div>
          )}

          {animal.is_archived ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3)', background: 'var(--surface-alt)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', border: '1px solid var(--border)' }}>
              <Trash2 size={18} color="var(--text-secondary)" />
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', fontWeight: 600 }}>{t('animal.archived')}</span>
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
                    <p style={{ color: 'oklch(100% 0 0 / 0.70)', margin: 0, fontSize: 'var(--font-size-sm)' }}>
                      {animal.breed} {animal.birthdate ? `· ${new Date().getFullYear() - new Date(animal.birthdate).getFullYear()} ${t('animal.yearsOld')}` : ''}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: animal.dynamic_fields ? 'var(--space-3)' : 0 }}>
                  {isVetVerified && (
                    <span style={{ background: 'oklch(100% 0 0 / 0.15)', border: '1px solid oklch(100% 0 0 / 0.22)', borderRadius: 'var(--radius-full)', padding: '3px 10px', fontSize: 11, fontWeight: 600, color: 'white' }}>
                      {t('animal.vetVerified')}
                    </span>
                  )}
                  {hasNfcTag && (
                    <span style={{ background: 'oklch(100% 0 0 / 0.15)', border: '1px solid oklch(100% 0 0 / 0.22)', borderRadius: 'var(--radius-full)', padding: '3px 10px', fontSize: 11, fontWeight: 600, color: 'white' }}>
                      {t('animal.nfcActive')}
                    </span>
                  )}
                </div>
                
                {animal.dynamic_fields && (() => {
                  try {
                    const df = JSON.parse(animal.dynamic_fields);
                    return Object.entries(df).map(([k, v]) => (
                      <div key={k} style={{ color: 'white', fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-1)' }}>
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
                  <button className="btn btn-ghost" onClick={() => setShowShare(true)}>
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
                    <div style={{ background: 'var(--surface-alt)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                      <input type="text" className="form-input" value={shareLink} readOnly style={{ marginBottom: 'var(--space-2)', textAlign: 'center' }} />
                      <button className="btn btn-primary btn-full" onClick={copyShareLink}>
                        {t('sharing.copyLink')}
                      </button>
                      <p className="text-muted" style={{ margin: 'var(--space-2) 0 0 0', fontSize: 'var(--font-size-xs)' }}>{t('sharing.expiresIn')} 14 {t('sharing.days')}</p>
                    </div>
                  ) : (
                    <button className="btn btn-primary btn-full" onClick={handleGenerateShare} disabled={generatingShare}>
                      {generatingShare ? t('common.loading') : t('sharing.generateLink')}
                    </button>
                  )}
                  <button className="btn btn-ghost btn-full mt-4" onClick={() => { setShowShare(false); setShareLink(''); }}>{t('common.cancel')}</button>
                </div>
              )}

              {isOwner && animal.is_archived && (
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

          {tags.length > 0 && (
            <div style={{ marginBottom: 'var(--space-6)' }}>
              <h3 style={{ marginBottom: 'var(--space-3)' }}>{t('animal.chips')} ({tags.length})</h3>
              {tags.map(tag => (
                <div key={tag.tag_id} className="card card-sm" style={{ marginBottom: 'var(--space-2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: '4px' }}>
                        {tag.tag_type === 'nfc' ? <Radio size={16} color="var(--primary-500)" /> : <Camera size={16} color="var(--primary-500)" />}
                        <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', wordBreak: 'break-all' }}>
                          {tag.tag_id}
                        </span>
                      </div>
                      <p className="text-muted" style={{ margin: 0, fontSize: '12px' }}>
                        {tag.tag_type === 'barcode' ? t('chip.barcode') : t('chip.nfc')}
                      </p>
                    </div>
                    {tag.active === 1 ? (
                      <span className="badge badge-success"><span className="badge-dot"></span>{t('chip.active')}</span>
                    ) : (
                      <span className="badge badge-danger">{t('chip.inactive')}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
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
                {(['all', 'vaccination', 'medication', 'other'] as const).map(type => (
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
                            <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>{doc.extracted_json?.title || (doc.doc_type ? docTypeLabel(doc.doc_type) : 'Dokument')}</div>
                            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
                              {doc.created_at ? new Date(doc.created_at).toLocaleString(i18n.language === 'de' ? 'de-AT' : 'en-GB') : '—'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '4px', flexDirection: 'column', alignItems: 'flex-end' }}>
                            {doc.added_by_role === 'vet' && <span className="badge badge-vet" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><CheckCircle size={10} /> {t('animal.vet')}</span>}
                            {doc.added_by_role === 'authority' && <span className="badge badge-authority" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><ShieldAlert size={10} /> {t('animal.authority')}</span>}
                            {!['vet', 'authority'].includes(doc.added_by_role ?? '') && <span className="badge" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px' }}>{t('animal.owner')}</span>}
                            <span className="text-muted" style={{ fontSize: '10px' }}>{doc.ocr_provider || '—'}</span>
                          </div>
                        </div>
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
                        <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>{doc.extracted_json?.title || (doc.doc_type ? docTypeLabel(doc.doc_type) : 'Dokument')}</div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
                          {doc.created_at ? new Date(doc.created_at).toLocaleString(i18n.language === 'de' ? 'de-AT' : 'en-GB') : '—'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexDirection: 'column', alignItems: 'flex-end' }}>
                        {doc.added_by_role === 'vet' && <span className="badge badge-vet" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><CheckCircle size={10} /> {t('animal.vet')}</span>}
                        {doc.added_by_role === 'authority' && <span className="badge badge-authority" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><ShieldAlert size={10} /> {t('animal.authority')}</span>}
                        {!['vet', 'authority'].includes(doc.added_by_role ?? '') && <span className="badge" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px' }}>{t('animal.owner')}</span>}
                        <span className="text-muted" style={{ fontSize: '10px' }}>{doc.ocr_provider || '—'}</span>
                      </div>
                    </div>
                  </Link>
                ))
              )}

              {filteredDocs.length === 0 && documents.filter(d => d.analysis_status !== 'pending_analysis').length > 0 && (
                <p className="text-muted text-center" style={{ padding: 'var(--space-4) 0' }}>{t('animal.noDocsFiltered')}</p>
              )}
            </>
          )}

          {(isOwner || isVet) && !animal.is_archived && (
            <Link to={`/animals/${id}/scan`} className="btn btn-primary btn-full" style={{ marginBottom: 'var(--space-4)', marginTop: documents.length === 0 ? 'var(--space-4)' : 0 }}>
              <Camera size={18} /> {t('animal.addDocument')}
            </Link>
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
                  {new Date(doc.created_at).toLocaleString(i18n.language === 'de' ? 'de-AT' : 'en-GB')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => { setRetryDocId(doc.id); setShowRetryModal(true); }}
                  disabled={retrying !== null}
                  style={{
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
        </div>
      </div>
    </div>
  )
}
