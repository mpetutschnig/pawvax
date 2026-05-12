import React, { useRef, useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18next from 'i18next'
import { CheckCircle, AlertCircle, Syringe, FileText, BookOpen, Camera, RefreshCw, Plus, X, Stethoscope } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { DocumentAnalysisForm } from '../components/DocumentAnalysisForm'
import { uploadMultiPageDocument } from '../api/ws'
import { analyzeDocument, getMe, getBillingMe } from '../api/rest'
import { BillingConsentModal } from '../components/BillingConsentModal'
import { DEFAULT_AVAILABLE_MODELS, DEFAULT_MODEL_BY_PROVIDER, DOCUMENT_TYPE_OPTIONS, DOCUMENT_TYPE_PLACEHOLDER, type DocumentTypeSelectValue } from '../utils/documentAnalysis'

type Phase = 'capture' | 'uploading' | 'analysing' | 'done' | 'error'

function getAnalysisErrorMessage(rawError: unknown, fallback: string) {
  let userMessage = fallback
  let techMessage = ''

  if (!rawError) return { userMessage, techMessage }

  if (typeof rawError === 'string') {
    return { userMessage: rawError, techMessage: '' }
  }

  if (rawError instanceof Error) {
    userMessage = rawError.message || fallback
    const errAny = rawError as any
    if (errAny.details) techMessage = errAny.details
    if (errAny.response) {
      // It's an axios error
      const status = errAny.response.status
      const data = errAny.response.data || {}
      techMessage = `HTTP ${status}: ${JSON.stringify(data)}`
      if (data.error && typeof data.error === 'string') userMessage = data.error
      else if (data.message && typeof data.message === 'string') userMessage = data.message
    }
    return { userMessage, techMessage: techMessage || (rawError.stack ? String(rawError.stack) : '') }
  }

  if (typeof rawError === 'object' && rawError !== null) {
    const candidate = rawError as any
    const response = candidate.response
    
    if (response) {
      const status = response.status
      const data = response.data || {}
      
      techMessage = `HTTP ${status}: ${JSON.stringify(data)}`
      
      if (data.error && typeof data.error === 'string') {
        userMessage = data.error
      } else if (data.message && typeof data.message === 'string') {
        userMessage = data.message
      }
    } else if (candidate.message) {
      userMessage = candidate.message
      techMessage = candidate.details || candidate.message
    }
  }

  return { userMessage, techMessage }
}
export default function DocumentScanPage() {
  const { id: animalId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const routeState = location.state as { documentId?: string; action?: 'retry' | 'reanalyze'; previews?: string[] } | null
  const { t } = useTranslation()

  // Guest-User dürfen keine Dokumente hochladen
  const roleStr = localStorage.getItem('role') || ''
  const myRoles = roleStr.split(',').map(r => r.trim()).filter(Boolean)
  const isGuest = myRoles.length > 0 && myRoles.every(r => r === 'guest')
  if (isGuest) {
    return (
      <div className="container page">
        <div className="error-card" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
          <p style={{ fontWeight: 600 }}>{t('common.noAccess')}</p>
          <p className="text-muted">{t('docScan.noAccessDesc')}</p>
          <button className="btn btn-ghost" onClick={() => navigate(-1)}>{t('common.back')}</button>
        </div>
      </div>
    )
  }

  type Group = { pages: File[]; previews: string[] }

  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [groups, setGroups] = useState<Group[]>([{ pages: [], previews: [] }])
  const [activeGroupIdx, setActiveGroupIdx] = useState(0)
  const [activePageIdx, setActivePageIdx] = useState(0)
  const hasPages = groups.some(g => g.pages.length > 0)
  const totalPages = groups.reduce((s, g) => s + g.pages.length, 0)
  const activePreview = groups[activeGroupIdx]?.previews[activePageIdx]
  const [phase, setPhase] = useState<Phase>('capture')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [ocrProvider, setOcrProvider] = useState<string | null>(null)
  const [currentStatusMsg, setCurrentStatusMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [techErrorMsg, setTechErrorMsg] = useState<string | null>(null)
  const [allowedRoles, setAllowedRoles] = useState<string[]>(['vet', 'authority', 'guest'])
  const [documentId, setDocumentId] = useState<string | null>(null)
  const [showModelSelection, setShowModelSelection] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [retryProvider, setRetryProvider] = useState('google')
  const [retryModel, setRetryModel] = useState(DEFAULT_MODEL_BY_PROVIDER.google)
  const [requestedDocumentType, setRequestedDocumentType] = useState<DocumentTypeSelectValue>('general')
  const [groupTypes, setGroupTypes] = useState<DocumentTypeSelectValue[]>([])

  const [hasGemini, setHasGemini] = useState(false)
  const [hasAnthropic, setHasAnthropic] = useState(false)
  const [hasOpenai, setHasOpenai] = useState(false)
  const [hasSystemAi, setHasSystemAi] = useState(true)
  const [systemFallbackEnabled, setSystemFallbackEnabled] = useState(true)
  const hasOwnKey = hasGemini || hasAnthropic || hasOpenai
  const hasAnyKey = hasOwnKey || (hasSystemAi && systemFallbackEnabled)
  const usingFallback = !hasOwnKey && hasSystemAi && systemFallbackEnabled
  const [billingConsentAccepted, setBillingConsentAccepted] = useState(false)
  const [billingPricePerPage, setBillingPricePerPage] = useState(0)
  const [showConsentModal, setShowConsentModal] = useState(false)
  const [pendingUploadTypes, setPendingUploadTypes] = useState<DocumentTypeSelectValue[] | undefined>(undefined)
  const [availableModels, setAvailableModels] = useState<any>(DEFAULT_AVAILABLE_MODELS)
  const docTypes = [
    { id: 'vaccination', label: t('animal.docTypeVaccination'), icon: <Syringe size={16} /> },
    { id: 'treatment', label: t('animal.docTypeTreatment'), icon: <BookOpen size={16} /> },
    { id: 'vet_report', label: t('animal.docTypeVetReport'), icon: <Stethoscope size={16} /> },
    { id: 'medical_product', label: t('animal.docTypeMedicalProduct'), icon: <FileText size={16} /> },
    { id: 'pet_passport', label: t('animal.docTypePetPassport'), icon: <Camera size={16} /> },
    { id: 'pedigree', label: t('animal.docTypePedigree'), icon: <BookOpen size={16} /> },
    { id: 'dog_certificate', label: t('animal.docTypeDogCertificate'), icon: <FileText size={16} /> },
    { id: 'general', label: t('animal.docTypeGeneral'), icon: <FileText size={16} /> }
  ]

  useEffect(() => {
    if (routeState?.documentId) {
      setDocumentId(routeState.documentId)
      if (routeState.previews && routeState.previews.length > 0) {
        const normalizedPreviews = routeState.previews.map(p => {
          if (!p || p.startsWith('blob:') || p.startsWith('data:')) return p
          
          // Take only the filename part if it's an absolute path
          const filename = p.split(/[\\/]/).pop()
          if (!filename) return p
          
          return `/uploads/${filename}`
        })
        setGroups([{ pages: [], previews: normalizedPreviews }])
      }
      setShowModelSelection(true)
    }
  }, [routeState])

  useEffect(() => {
    if (phase !== 'analysing') return
    setElapsedTime(0)
    const startTime = Date.now()
    const interval = setInterval(() => setElapsedTime(Math.floor((Date.now() - startTime) / 1000)), 1000)
    return () => clearInterval(interval)
  }, [phase])

  useEffect(() => {
    getBillingMe().then(r => {
      setBillingConsentAccepted(!!r.data.consentAcceptedAt)
      setBillingPricePerPage(r.data.pricePerPage ?? 0)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    getMe().then(res => {
      setHasGemini(res.data.has_gemini_token)
      setHasAnthropic(res.data.has_anthropic_token)
      setHasOpenai(res.data.has_openai_token)
      setHasSystemAi(!!res.data.has_system_ai)
      setSystemFallbackEnabled(!!(res.data.system_fallback_enabled ?? 1))

      if (res.data.has_gemini_token) {
        setRetryProvider('google')
        setRetryModel(DEFAULT_MODEL_BY_PROVIDER.google)
      } else if (res.data.has_anthropic_token) {
        setRetryProvider('anthropic')
        setRetryModel(DEFAULT_MODEL_BY_PROVIDER.anthropic)
      } else if (res.data.has_openai_token) {
        setRetryProvider('openai')
        setRetryModel(DEFAULT_MODEL_BY_PROVIDER.openai)
      }

      fetch('/api/ai/models', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } })
        .then(r => r.json())
        .then(data => setAvailableModels({
          google: data.google || DEFAULT_AVAILABLE_MODELS.google,
          anthropic: data.anthropic || DEFAULT_AVAILABLE_MODELS.anthropic,
          openai: data.openai || DEFAULT_AVAILABLE_MODELS.openai
        }))
        .catch(console.error)
    }).catch(err => console.error(err))
  }, [])

  const allPreviews = groups.flatMap(g => g.previews)

  if (showModelSelection) {
    const filledGroups = groups.filter(g => g.pages.length > 0)
    
    if (filledGroups.length > 1 && !documentId) {
      return (
        <div className="container page">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)', marginTop: 'var(--space-2)' }}>
            <button className="btn btn-ghost" style={{ padding: '8px', margin: '-8px' }} onClick={() => setShowModelSelection(false)}>
              {t('common.cancel')}
            </button>
            <h1 style={{ margin: 0, fontSize: 'var(--font-size-xl)' }}>Batch-Upload</h1>
          </div>

          <div className="card animate-slide-up">
            <h3 style={{ marginTop: 0, marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-base)' }}>{filledGroups.length} Dokumente kategorisieren</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
              {filledGroups.map((group, i) => (
                <div key={i} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', padding: 'var(--space-3)', background: 'var(--surface-alt)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <img src={group.previews[0]} alt="Vorschau" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '4px' }}>DOKUMENT {i+1} ({group.pages.length} SEITEN)</div>
                    <select 
                      className="form-select" 
                      style={{ padding: '4px 8px', fontSize: 'var(--font-size-sm)' }}
                      value={groupTypes[i] || DOCUMENT_TYPE_PLACEHOLDER}
                      onChange={e => {
                        const newTypes = [...groupTypes]
                        newTypes[i] = e.target.value as DocumentTypeSelectValue
                        setGroupTypes(newTypes)
                      }}
                    >
                      <option value={DOCUMENT_TYPE_PLACEHOLDER} disabled>{t('docScan.docTypePlaceholder')}</option>
                      {DOCUMENT_TYPE_OPTIONS.map(type => {
                        // Dynamisches Label aus i18n
                        const labels: Record<string, string> = {
                          vaccination: t('animal.docTypeVaccination'),
                          treatment: t('animal.docTypeTreatment'),
                          vet_report: t('animal.docTypeVetReport'),
                          pet_passport: t('animal.docTypePetPassport'),
                          medical_product: t('animal.docTypeMedicalProduct'),
                          pedigree: t('animal.docTypePedigree'),
                          dog_certificate: t('animal.docTypeDogCertificate'),
                          general: t('animal.docTypeGeneral')
                        }
                        return <option key={type} value={type}>{labels[type] || type}</option>
                      })}
                    </select>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '11px', color: 'var(--text-secondary)' }}>
              <strong>Haftungsausschluss:</strong> Die KI kann Fehler machen. Wir übernehmen keine Haftung für fehlerhaft erkannte Daten.
            </div>

            <div className="form-group" style={{ opacity: usingFallback ? 0.6 : 1 }}>
              <label className="form-label">{t('docDetail.provider')}</label>
              <select className="form-select" value={hasOwnKey ? retryProvider : ''} onChange={e => handleProviderChange(e.target.value)} disabled={!hasOwnKey}>
                {hasOwnKey ? (
                  <>
                    {(hasGemini || hasSystemAi) && <option value="google">Google Gemini</option>}
                    {(hasAnthropic || hasSystemAi) && <option value="anthropic">Anthropic Claude</option>}
                    {(hasOpenai || hasSystemAi) && <option value="openai">OpenAI</option>}
                  </>
                ) : usingFallback ? (
                  <option value="">{t('profile.systemAiFallback')}</option>
                ) : (
                  <option value="">{t('docScan.noProviderAvailable')}</option>
                )}
              </select>
            </div>

            {usingFallback && (
              <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--info-50)', border: '1px solid var(--info-200)', borderRadius: 'var(--radius-sm)', fontSize: '11px', color: 'var(--info-700)' }}>
                <strong>{t('docScan.usingSystemFallback')}</strong><br/>
                {t('docScan.providerDisabledInfo')}
                {billingPricePerPage > 0 && <div style={{ fontWeight: 600, marginTop: '2px' }}>Kosten: {billingPricePerPage} Cent / Seite</div>}
              </div>
            )}

            <button 
              className="btn btn-primary btn-full" 
              disabled={groupTypes.length < filledGroups.length || groupTypes.some(t => t === DOCUMENT_TYPE_PLACEHOLDER)}
              onClick={() => maybeUpload(groupTypes)}
            >
              Alle {filledGroups.length} Dokumente analysieren
            </button>
          </div>
        </div>
      )
    }

    return (
      <DocumentAnalysisForm
        title={t('docDetail.aiAnalysis')}
        description={t('docDetail.aiSelectProvider')}
        previews={allPreviews as string[]}
        errorMessage={errorMsg}
        hasAnyKey={hasAnyKey}
        hasGemini={hasGemini}
        hasAnthropic={hasAnthropic}
        hasOpenai={hasOpenai}
        hasSystemAi={hasSystemAi}
        systemFallbackEnabled={systemFallbackEnabled}
        pricePerPage={billingPricePerPage}
        retryProvider={retryProvider}
        retryModel={retryModel}
        requestedDocumentType={requestedDocumentType}
        availableModels={availableModels}
        submitLabel={documentId ? t('animal.analyzeBtn') : t('docScan.uploadAndAnalyze')}
        cancelLabel={documentId ? t('docScan.saveForLater') : t('common.cancel')}
        isSubmitting={isAnalyzing}
        hideDocumentType={false}
        onProviderChange={handleProviderChange}
        onModelChange={setRetryModel}
        onRequestedDocumentTypeChange={setRequestedDocumentType}
        onSubmit={documentId ? handleRetryAnalysisAPI : () => maybeUpload()}
        onCancel={() => {
          setErrorMsg(null)
          if (documentId) navigate(`/animals/${animalId}`)
          else setShowModelSelection(false)
        }}
      />
    )
  }
  async function processImage(f: File): Promise<{ file: File; preview: string }> {
    return new Promise((resolve, reject) => {
      try {
        createImageBitmap(f).then((bmp) => {
            const canvas = document.createElement('canvas')
            const MAX_WIDTH = 1200
            const MAX_HEIGHT = 1200
            let width = bmp.width
            let height = bmp.height

            if (width > height) {
              if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width
                width = MAX_WIDTH
              }
            } else {
              if (height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height
                height = MAX_HEIGHT
              }
            }

            canvas.width = width
            canvas.height = height
            const ctx = canvas.getContext('2d')
            ctx?.drawImage(bmp, 0, 0, width, height)

            canvas.toBlob((blob) => {
              if (blob) {
                const resizedFile = new File([blob], f.name, { type: 'image/jpeg', lastModified: Date.now() })
                resolve({ file: resizedFile, preview: URL.createObjectURL(resizedFile) })
              }
              bmp.close()
            }, 'image/jpeg', 0.8)
          }).catch(reject)
      } catch (err) {
        reject(err)
      }
    })
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      const { file, preview } = await processImage(f)
      setGroups([{ pages: [file], previews: [preview] }])
      setActiveGroupIdx(0)
      setActivePageIdx(0)
    } catch (err) {
      console.error(err)
      setErrorMsg(t('docScan.imageProcessError'))
    }
  }

  async function handleAddPage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      const { file, preview } = await processImage(f)
      const newGroups = groups.map(g => ({ pages: [...g.pages], previews: [...g.previews] }))
      const lastIdx = newGroups.length - 1
      newGroups[lastIdx].pages.push(file)
      newGroups[lastIdx].previews.push(preview)
      setGroups(newGroups)
      setActiveGroupIdx(lastIdx)
      setActivePageIdx(newGroups[lastIdx].pages.length - 1)
    } catch (err) {
      console.error(err)
      setErrorMsg(t('docScan.pageAddError'))
    }
  }

  function handleRemovePage(groupIdx: number, pageIdx: number) {
    const newGroups = groups.map((g, gi) =>
      gi !== groupIdx ? g : {
        pages: g.pages.filter((_, i) => i !== pageIdx),
        previews: g.previews.filter((_, i) => i !== pageIdx)
      }
    ).filter((g, _, arr) => g.pages.length > 0 || arr.length === 1)
    const safeGroupIdx = Math.min(activeGroupIdx, newGroups.length - 1)
    const safePageIdx = Math.min(activePageIdx, Math.max(0, (newGroups[safeGroupIdx]?.pages.length || 1) - 1))
    setActiveGroupIdx(safeGroupIdx)
    setActivePageIdx(safePageIdx)
    setGroups(newGroups)
  }

  function insertGroupDivider(afterGlobalIdx: number) {
    let offset = 0
    const newGroups: Group[] = []
    for (const g of groups) {
      const local = afterGlobalIdx - offset
      if (local > 0 && local < g.pages.length) {
        newGroups.push({ pages: g.pages.slice(0, local), previews: g.previews.slice(0, local) })
        newGroups.push({ pages: g.pages.slice(local), previews: g.previews.slice(local) })
      } else {
        newGroups.push(g)
      }
      offset += g.pages.length
    }
    setGroups(newGroups)
  }

  function removeGroupDivider(groupIdx: number) {
    if (groupIdx >= groups.length - 1) return
    const newGroups = [...groups]
    newGroups.splice(groupIdx, 2, {
      pages: [...newGroups[groupIdx].pages, ...newGroups[groupIdx + 1].pages],
      previews: [...newGroups[groupIdx].previews, ...newGroups[groupIdx + 1].previews]
    })
    setGroups(newGroups)
    if (activeGroupIdx > groupIdx) setActiveGroupIdx(activeGroupIdx - 1)
  }

  async function handleRotate() {
    const g = groups[activeGroupIdx]
    if (!g?.previews[activePageIdx] || !g?.pages[activePageIdx]) return
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.height
      canvas.height = img.width
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.translate(canvas.width / 2, canvas.height / 2)
        ctx.rotate((90 * Math.PI) / 180)
        ctx.drawImage(img, -img.width / 2, -img.height / 2)
      }
      canvas.toBlob((blob) => {
        if (blob) {
          const rotatedFile = new File([blob], g.pages[activePageIdx].name, { type: 'image/jpeg', lastModified: Date.now() })
          setGroups(prev => prev.map((pg, gi) => {
            if (gi !== activeGroupIdx) return pg
            const np = [...pg.pages]; np[activePageIdx] = rotatedFile
            const nv = [...pg.previews]; nv[activePageIdx] = URL.createObjectURL(rotatedFile)
            return { pages: np, previews: nv }
          }))
        }
      }, 'image/jpeg', 0.8)
    }
    img.src = g.previews[activePageIdx]
  }

  function handleProviderChange(prov: string) {
    setRetryProvider(prov)
    if (prov === 'google') setRetryModel(DEFAULT_MODEL_BY_PROVIDER.google)
    else if (prov === 'anthropic') setRetryModel(DEFAULT_MODEL_BY_PROVIDER.anthropic)
    else if (prov === 'openai') setRetryModel(DEFAULT_MODEL_BY_PROVIDER.openai)
  }

  function maybeUpload(types?: DocumentTypeSelectValue[]) {
    const hasOwnKey = hasGemini || hasAnthropic || hasOpenai
    // Consent nur nötig wenn System-KI verwendet wird (kein eigener Key & Fallback aktiv)
    const needsConsent = !hasOwnKey && systemFallbackEnabled && !billingConsentAccepted
    
    if (needsConsent) {
      setPendingUploadTypes(types)
      setShowConsentModal(true)
    } else {
      handleUpload(types)
    }
  }

  async function handleRetryAnalysisAPI(ignoreConsent = false) {
    if (!documentId) return
    if (requestedDocumentType === DOCUMENT_TYPE_PLACEHOLDER) return

    const hasOwnKey = hasGemini || hasAnthropic || hasOpenai
    const needsConsent = !ignoreConsent && !hasOwnKey && systemFallbackEnabled && !billingConsentAccepted
    
    if (needsConsent) {
      setShowConsentModal(true)
      return
    }

    setIsAnalyzing(true)
    setErrorMsg(null)
    setShowModelSelection(false)
    setPhase('analysing')
    setCurrentStatusMsg(t('docScan.sendingToAi'))
    setOcrProvider(null)
    setUploadProgress(100) // mock upload progress so the UI looks consistent

    try {
      const action = routeState?.action || 'retry'
      await analyzeDocument(documentId, action, { 
        provider: hasOwnKey ? retryProvider : null, 
        model: hasOwnKey ? retryModel : null, 
        language: i18next.language || 'de', 
        requestedDocumentType 
      })
      
      if (documentId) {
        navigate(`/animals/${animalId}/documents/${documentId}`, { replace: true })
      } else {
        navigate(`/animals/${animalId}`, { replace: true })
      }
    } catch (err: any) {
      const parsed = getAnalysisErrorMessage(err, t('animal.documentFailed'))
      setErrorMsg(parsed.userMessage)
      setTechErrorMsg(parsed.techMessage)
      setPhase('error')
    } finally {
      setIsAnalyzing(false)
    }
  }

  async function handleUpload(types?: DocumentTypeSelectValue[], ignoreConsent = false) {
    const filledGroups = groups.filter(g => g.pages.length > 0)
    if (filledGroups.length === 0 || !animalId) return
    if (!types && requestedDocumentType === DOCUMENT_TYPE_PLACEHOLDER) return

    const hasOwnKey = hasGemini || hasAnthropic || hasOpenai
    const needsConsent = !ignoreConsent && !hasOwnKey && systemFallbackEnabled && !billingConsentAccepted
    
    if (needsConsent) {
      setPendingUploadTypes(types)
      setShowConsentModal(true)
      return
    }

    setPhase('uploading')
    setUploadProgress(0)
    setElapsedTime(0)
    setOcrProvider(null)
    setErrorMsg(null)
    setShowModelSelection(false)

    const collectedIds: string[] = []

    try {
      for (let i = 0; i < filledGroups.length; i++) {
        const docLabel = filledGroups.length > 1 ? `Dok. ${i + 1}/${filledGroups.length}: ` : ''
        await new Promise<void>((resolve, reject) => {
          uploadMultiPageDocument(animalId!, filledGroups[i].pages, {
            onProgress: (percent: number) => setUploadProgress(Math.round(percent)),
            onStatus: (msg: string) => {
              setPhase('analysing')
              setCurrentStatusMsg(docLabel + msg)
              if (msg.includes('Tesseract') || msg.includes('tesseract')) setOcrProvider(t('docScan.tesseractLocal'))
              if (msg.includes('Gemini') || msg.includes('gemini') || msg.includes('Google API')) setOcrProvider(t('docScan.geminiApi'))
              if (msg.includes('Quota') || msg.includes('quota')) setOcrProvider(t('docScan.quotaFallback'))
            },
            onResult: (data: any) => {
              const nextDocumentId = data.data.documentId
              collectedIds.push(nextDocumentId)
              setDocumentId(nextDocumentId)
              setOcrProvider(data.data.ocrProvider || 'unknown')
              if (data.data.analysisStatus === 'pending_analysis') {
                const err = new Error(data.data.analysisError || t('docScan.analyzeFailedRetry')) as any
                err.details = data.data.analysisError
                reject(err)
                return
              }
              resolve()
            },
            onError: (msg: string, details?: string) => {
              const err = new Error(msg) as any
              err.details = details
              reject(err)
            },
            metadata: { 
              allowedRoles, 
              language: i18next.language || 'de', 
              requestedDocumentType: types?.[i] ?? requestedDocumentType,
              provider: hasOwnKey ? retryProvider : null,
              model: hasOwnKey ? retryModel : null
            }
          }).catch(reject)
        })
      }
    } catch (err) {
      const parsed = getAnalysisErrorMessage(err, t('common.unknownError'))
      setErrorMsg(parsed.userMessage)
      setTechErrorMsg(parsed.techMessage)
      setPhase('error')
      return
    }

    if (collectedIds.length === 1) {
      navigate(`/animals/${animalId}/documents/${collectedIds[0]}`, { replace: true })
    } else {
      navigate(`/animals/${animalId}`, { replace: true })
    }
  }

  const totalPagesToUpload = groups.filter(g => g.pages.length > 0).reduce((s, g) => s + g.pages.length, 0)

  return (
    <div className="container page">
      {showConsentModal && (
        <BillingConsentModal
          pricePerPage={billingPricePerPage}
          pageCount={totalPagesToUpload || 1}
          onAccept={() => { 
            setBillingConsentAccepted(true)
            setShowConsentModal(false)
            if (documentId) handleRetryAnalysisAPI(true)
            else handleUpload(pendingUploadTypes, true)
          }}
          onCancel={() => setShowConsentModal(false)}
        />
      )}
      <PageHeader title={t('docScan.title')} backTo={`/animals/${animalId}`} showThemeToggle />

      {phase === 'capture' && (
        <div className="card animate-slide-up">
          <p className="text-muted" style={{ marginBottom: 'var(--space-6)' }}>{t('docScan.uploadMethod')}</p>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          {!hasPages ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <button
                type="button"
                className="btn btn-primary btn-full"
                onClick={() => cameraRef.current?.click()}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }}
              >
                <Camera size={20} />
                {t('docScan.camera')}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-full"
                onClick={() => fileRef.current?.click()}
              >
                {t('docScan.file')}
              </button>
            </div>
          ) : (
            <>
              <div style={{ position: 'relative', marginBottom: 'var(--space-4)' }}>
                <img src={activePreview} alt="Vorschau" style={{ width: '100%', borderRadius: 'var(--radius-md)', display: 'block' }} />
                <button
                  className="btn-secondary"
                  onClick={handleRotate}
                  style={{
                    position: 'absolute', top: 'var(--space-2)', right: 'var(--space-2)',
                    padding: '8px', borderRadius: '50%', background: 'rgba(255,255,255,0.9)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)', border: 'none', cursor: 'pointer'
                  }}
                  title={t('docScan.rotateImage')}
                >
                  <RefreshCw size={20} color="var(--primary-600)" />
                </button>
              </div>

              <div style={{ marginBottom: 'var(--space-4)', textAlign: 'left' }}>
                <label className="form-label">{t('docScan.whoCanSee')}</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {[{ id: 'vet', label: t('docScan.vet') }, { id: 'authority', label: t('docScan.authority') }, { id: 'guest', label: t('docScan.guestAccess') }].map(r => (
                    <label key={r.id} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={allowedRoles.includes(r.id)}
                        onChange={(e) => {
                          if (e.target.checked) setAllowedRoles([...allowedRoles, r.id])
                          else setAllowedRoles(allowedRoles.filter(role => role !== r.id))
                        }}
                        style={{ width: 16, height: 16, accentColor: 'var(--primary-500)' }}
                      />
                      <span style={{ fontSize: 'var(--font-size-sm)' }}>{r.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Thumbnail-Leiste mit Gruppen */}
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-2)', color: 'var(--text-secondary)' }}>
                  {t('docScan.pages')}: {totalPages}
                  {groups.length > 1 && <span style={{ marginLeft: 'var(--space-2)', color: 'var(--primary-600)' }}>· {groups.length} Dokumente</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {(() => {
                    const groupItems: React.ReactNode[] = []
                    let globalIdx = 0
                    groups.forEach((group, groupIdx) => {
                      // Thumbnails einer Gruppe
                      const thumbRow: React.ReactNode[] = []
                      group.previews.forEach((preview, pageIdx) => {
                        const myGlobalIdx = globalIdx
                        const isActive = groupIdx === activeGroupIdx && pageIdx === activePageIdx
                        // Trenn-Button zwischen Seiten (gleiche Gruppe)
                        if (pageIdx > 0) {
                          thumbRow.push(
                            <button
                              key={`split-${myGlobalIdx}`}
                              onClick={() => insertGroupDivider(myGlobalIdx)}
                              title={t('docScan.splitDocument')}
                              style={{
                                background: 'var(--surface-2)', border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                                color: 'var(--text-secondary)', fontSize: '16px', fontWeight: 700,
                                padding: '0 6px', minHeight: '44px', minWidth: '32px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0, lineHeight: 1
                              }}
                              aria-label="Seite trennen"
                            >÷</button>
                          )
                        }
                        thumbRow.push(
                          <div
                            key={`thumb-${groupIdx}-${pageIdx}`}
                            onClick={() => { setActiveGroupIdx(groupIdx); setActivePageIdx(pageIdx) }}
                            style={{
                              position: 'relative', width: '64px', height: '64px',
                              borderRadius: 'var(--radius-sm)', overflow: 'visible',
                              border: `3px solid ${isActive ? 'var(--primary-500)' : 'var(--border)'}`,
                              cursor: 'pointer', opacity: isActive ? 1 : 0.7,
                              transition: 'all var(--t-fast)', flexShrink: 0
                            }}
                          >
                            <img src={preview} alt={`Seite ${pageIdx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'calc(var(--radius-sm) - 2px)', display: 'block' }} />
                            {/* Seitennummer-Badge */}
                            {group.pages.length > 1 && (
                              <span style={{
                                position: 'absolute', bottom: '2px', left: '2px',
                                background: 'rgba(0,0,0,0.55)', color: 'white',
                                fontSize: '10px', fontWeight: 700, lineHeight: 1,
                                padding: '2px 4px', borderRadius: '3px'
                              }}>{pageIdx + 1}</span>
                            )}
                            {totalPages > 1 && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRemovePage(groupIdx, pageIdx) }}
                                style={{
                                  position: 'absolute', top: '-8px', right: '-8px',
                                  width: '22px', height: '22px', background: 'var(--danger-600)',
                                  border: '2px solid var(--surface)', borderRadius: '50%', color: 'white',
                                  cursor: 'pointer', padding: 0, display: 'flex',
                                  alignItems: 'center', justifyContent: 'center'
                                }}
                                aria-label="Seite entfernen"
                              ><X size={12} /></button>
                            )}
                          </div>
                        )
                        globalIdx++
                      })

                      groupItems.push(
                        <div key={`group-${groupIdx}`}>
                          {groups.length > 1 && (
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary-600)', background: 'var(--primary-50)', borderRadius: '4px', padding: '2px 6px', display: 'inline-block', marginBottom: 'var(--space-2)' }}>
                              Dok. {groupIdx + 1}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                            {thumbRow}
                          </div>
                          {/* Zusammenführen-Button zwischen Gruppen */}
                            <button
                              onClick={() => removeGroupDivider(groupIdx)}
                              style={{
                                marginTop: 'var(--space-2)', width: '100%',
                                padding: 'var(--space-2) var(--space-3)', minHeight: '44px',
                                background: 'var(--danger-50)', border: '1px solid var(--danger-200)',
                                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                                color: 'var(--danger-600)', fontSize: 'var(--font-size-sm)',
                                fontWeight: 600, display: 'flex', alignItems: 'center',
                                justifyContent: 'center', gap: 'var(--space-2)'
                              }}
                              aria-label="Trennung entfernen"
                            >
                              {t('docScan.mergeDocuments')}
                            </button>
                        </div>
                      )
                    })
                    return groupItems
                  })()}
                </div>

                {/* Seite hinzufügen — eigene Buttons unterhalb der Leiste */}
                <input type="file" id="addPageCameraInput" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleAddPage} />
                <input type="file" id="addPageFileInput" accept="image/*" style={{ display: 'none' }} onChange={handleAddPage} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                  <label htmlFor="addPageCameraInput" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
                    minHeight: '44px', padding: 'var(--space-2) var(--space-3)',
                    border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface)', cursor: 'pointer',
                    fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', fontWeight: 500
                  }}>
                    <Camera size={18} /> {t('docScan.addPageCamera')}
                  </label>
                  <label htmlFor="addPageFileInput" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
                    minHeight: '44px', padding: 'var(--space-2) var(--space-3)',
                    border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface)', cursor: 'pointer',
                    fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', fontWeight: 500
                  }}>
                    <Plus size={18} /> {t('docScan.addPageFile')}
                  </label>
                </div>
              </div>

              <button className="btn btn-primary btn-full" onClick={() => {
                const filled = groups.filter(g => g.pages.length > 0)
                setRequestedDocumentType('general')
                setGroupTypes(new Array(filled.length).fill('general'))
                setShowModelSelection(true)
              }}>
                {groups.filter(g => g.pages.length > 0).length > 1
                  ? t('docScan.uploadMultiAndAnalyze', { count: groups.filter(g => g.pages.length > 0).length })
                  : t('docScan.uploadAndAnalyze')}
              </button>
              <button className="btn btn-ghost btn-full" style={{ marginTop: 'var(--space-2)' }} onClick={() => { setGroups([{ pages: [], previews: [] }]); setActiveGroupIdx(0); setActivePageIdx(0) }}>
                {t('docScan.chooseAnother')}
              </button>
            </>
          )}
        </div>
      )}

      {phase !== 'capture' && (
        <div className="card animate-slide-up" style={{ textAlign: 'center', padding: 'var(--space-6) var(--space-4)' }}>
          <div className="stepper" style={{ marginBottom: 'var(--space-6)' }}>
            <div className={`stepper-step ${phase === 'uploading' || phase === 'analysing' || phase === 'done' ? 'active' : ''}`}>
              <div className="stepper-number">1</div>
              <div className="stepper-label">{t('docScan.camera')}</div>
            </div>
            <div className={`stepper-step ${['analysing', 'done'].includes(phase) ? 'active' : ''}`}>
              <div className="stepper-number">{phase === 'done' ? <CheckCircle size={16} color="white" /> : '2'}</div>
              <div className="stepper-label">{t('docScan.analyzing')}</div>
            </div>
            <div className={`stepper-step ${phase === 'done' ? 'active' : ''}`}>
              <div className="stepper-number">{phase === 'done' ? <CheckCircle size={16} color="white" /> : '3'}</div>
              <div className="stepper-label">{t('docScan.analyzeComplete')}</div>
            </div>
          </div>

          {phase === 'uploading' && (
            <div>
              <h3 style={{ marginBottom: 'var(--space-4)' }}>{t('docScan.uploading')}...</h3>
              <div className="progress-bar" style={{ width: '100%', maxWidth: '240px', margin: '0 auto var(--space-3)' }}>
                <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }} />
              </div>
              <div className="text-muted" style={{ fontWeight: 600 }}>{uploadProgress}%</div>
            </div>
          )}

          {phase === 'analysing' && (
            <div>
              <h3 style={{ marginBottom: 'var(--space-4)' }}>{t('docScan.analyzing')}...</h3>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                <div className="spinner"></div>
                {ocrProvider && <span className="badge badge-info">{ocrProvider}</span>}
              </div>
              <div className="text-muted" style={{ fontSize: 'var(--font-size-sm)', padding: '0 var(--space-4)', wordBreak: 'break-word', minHeight: '40px' }}>
                {currentStatusMsg || t('common.loading')}
              </div>
              <div className="text-tertiary" style={{ fontSize: 'var(--font-size-xs)', marginTop: 'var(--space-2)' }}>{elapsedTime}s</div>
            </div>
          )}

          {phase === 'error' && (
            <div>
              {documentId ? (
                <>
                  <div style={{ color: 'var(--danger-500)', marginBottom: 'var(--space-3)', display: 'flex', justifyContent: 'center' }}>
                    <AlertCircle size={48} strokeWidth={1.5} />
                  </div>
                  <h3 style={{ marginBottom: 'var(--space-2)' }}>{t('docScan.analyzeFailed')}</h3>
                  <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>{errorMsg || t('common.error')}</p>
                  
                  {techErrorMsg && (
                    <div style={{ marginBottom: 'var(--space-4)', textAlign: 'left' }}>
                      <p style={{ margin: '0 0 4px 0', fontSize: '11px', fontWeight: 600, color: 'var(--danger-600)' }}>Technical Details (Debugging):</p>
                      <pre style={{ margin: 0, padding: 'var(--space-2)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '10px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text-secondary)', maxHeight: '120px' }}>
                        {techErrorMsg}
                      </pre>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                    {hasAnyKey && (
                      <button className="btn btn-primary flex-1" onClick={() => { setRequestedDocumentType('general'); setShowModelSelection(true) }} type="button">
                        {t('animal.retry')}
                      </button>
                    )}
                    <button className="btn btn-ghost flex-1" onClick={() => navigate(`/animals/${animalId}`)} type="button">
                      {t('docScan.saveForLater')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ color: 'var(--danger-500)', marginBottom: 'var(--space-3)', display: 'flex', justifyContent: 'center' }}>
                    <AlertCircle size={48} strokeWidth={1.5} />
                  </div>
                  <h3 style={{ marginBottom: 'var(--space-2)' }}>{t('docScan.analyzeFailed')}</h3>
                  <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>{errorMsg || t('common.error')}</p>
                  
                  {techErrorMsg && (
                    <div style={{ marginBottom: 'var(--space-4)', textAlign: 'left' }}>
                      <p style={{ margin: '0 0 4px 0', fontSize: '11px', fontWeight: 600, color: 'var(--danger-600)' }}>Technical Details (Debugging):</p>
                      <pre style={{ margin: 0, padding: 'var(--space-2)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '10px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text-secondary)', maxHeight: '120px' }}>
                        {techErrorMsg}
                      </pre>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                    <button className="btn btn-primary flex-1" onClick={() => navigate(`/animals/${animalId}`)} type="button">
                      {t('docScan.saveForLater')}
                    </button>
                    <button className="btn btn-ghost flex-1" onClick={() => { setPhase('capture'); setErrorMsg(null); setTechErrorMsg(null); setGroups([{ pages: [], previews: [] }]); setActiveGroupIdx(0); setActivePageIdx(0) }} type="button">
                      {t('docScan.retry')}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
      {showModelSelection && !documentId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)' }}>
          <div className="card" style={{ maxWidth: '400px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: 'var(--space-4)' }}>{t('docScan.chooseModel')}</h3>
            
            {groups.filter(g => g.pages.length > 0).length > 1 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {groups.filter(g => g.pages.length > 0).map((group, i) => (
                  <div key={i} style={{ padding: 'var(--space-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: 'var(--space-2)' }}>
                      {group.previews.slice(0, 3).map((p, j) => (
                        <img key={j} src={p} style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} alt="" />
                      ))}
                    </div>
                    <label className="form-label" style={{ fontSize: '11px' }}>{t('docDetail.title')} {i + 1} {t('docDetail.type')}</label>
                    <select 
                      className="form-select" 
                      value={groupTypes[i]} 
                      onChange={e => {
                        const newTypes = [...groupTypes]
                        newTypes[i] = e.target.value as DocumentTypeSelectValue
                        setGroupTypes(newTypes)
                      }}
                    >
                      <option value={DOCUMENT_TYPE_PLACEHOLDER} disabled>{t('docScan.docTypePlaceholder')}</option>
                      {DOCUMENT_TYPE_OPTIONS.map(t => <option key={t} value={t}>{docTypes.find(dt => dt.id === t)?.label || t}</option>)}
                    </select>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                  <button className="btn btn-primary flex-1" onClick={() => maybeUpload(groupTypes)} disabled={groupTypes.includes(DOCUMENT_TYPE_PLACEHOLDER)}>
                    {t('docScan.upload')}
                  </button>
                  <button className="btn btn-ghost flex-1" onClick={() => setShowModelSelection(false)}>{t('common.cancel')}</button>
                </div>
              </div>
            ) : (
              <DocumentAnalysisForm
                title={t('docScan.aiAnalysis')}
                description={t('docDetail.aiSelectProvider')}
                previews={groups[0].previews}
                hasAnyKey={hasAnyKey}
                hasGemini={hasGemini}
                hasAnthropic={hasAnthropic}
                hasOpenai={hasOpenai}
                hasSystemAi={hasSystemAi}
                systemFallbackEnabled={systemFallbackEnabled}
                pricePerPage={billingPricePerPage}
                retryProvider={retryProvider}
                retryModel={retryModel}
                requestedDocumentType={requestedDocumentType}
                availableModels={availableModels}
                submitLabel={t('docScan.uploadAndAnalyze')}
                cancelLabel={t('common.cancel')}
                isSubmitting={isAnalyzing}
                onProviderChange={setRetryProvider}
                onModelChange={setRetryModel}
                onRequestedDocumentTypeChange={setRequestedDocumentType}
                onSubmit={() => maybeUpload()}
                onCancel={() => setShowModelSelection(false)}
              />
            )}
          </div>
        </div>
      )}

      {showModelSelection && documentId && (
        <DocumentAnalysisForm
          title={t('docDetail.aiAnalysis')}
          description={t('docDetail.aiSelectProvider')}
          previews={groups[0].previews}
          hasAnyKey={hasAnyKey}
          hasGemini={hasGemini}
          hasAnthropic={hasAnthropic}
          hasOpenai={hasOpenai}
          hasSystemAi={hasSystemAi}
          systemFallbackEnabled={systemFallbackEnabled}
          pricePerPage={billingPricePerPage}
          retryProvider={retryProvider}
          retryModel={retryModel}
          requestedDocumentType={requestedDocumentType}
          availableModels={availableModels}
          submitLabel={t('animal.analyzeBtn')}
          cancelLabel={t('common.cancel')}
          isSubmitting={isAnalyzing}
          onProviderChange={setRetryProvider}
          onModelChange={setRetryModel}
          onRequestedDocumentTypeChange={setRequestedDocumentType}
          onSubmit={handleRetryAnalysisAPI}
          onCancel={() => {
            setErrorMsg(null)
            if (routeState?.documentId) navigate(`/animals/${animalId}/documents/${documentId}`)
            else setShowModelSelection(false)
          }}
        />
      )}
    </div>
  )
}
