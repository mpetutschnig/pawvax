import React, { useRef, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18next from 'i18next'
import { CheckCircle, AlertCircle, Syringe, FileText, BookOpen, Camera, RefreshCw, Plus, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { DocumentAnalysisForm } from '../components/DocumentAnalysisForm'
import { uploadMultiPageDocument } from '../api/ws'
import { analyzeDocument, patchDocument, getMe, patchMe, getBillingMe } from '../api/rest'
import { BillingConsentModal } from '../components/BillingConsentModal'
import { DEFAULT_AVAILABLE_MODELS, DEFAULT_MODEL_BY_PROVIDER, DOCUMENT_TYPE_PLACEHOLDER, type DocumentTypeSelectValue } from '../utils/documentAnalysis'

type Phase = 'capture' | 'uploading' | 'analysing' | 'done' | 'error'

function getAnalysisErrorMessage(rawError: unknown, fallback: string) {
  if (!rawError) return fallback
  if (typeof rawError === 'string') return rawError
  if (rawError instanceof Error) return rawError.message || fallback
  if (typeof rawError === 'object') {
    const candidate = rawError as { response?: { data?: { error?: unknown } }, message?: string }
    const nestedError = candidate.response?.data?.error
    if (typeof nestedError === 'string') return nestedError
    if (nestedError && typeof nestedError === 'object') {
      const details = nestedError as { error_details?: string; error?: string; message?: string }
      if (details.error_details) return details.error_details
      if (details.error) return details.error
      if (details.message) return details.message
    }
    if (candidate.message) return candidate.message
  }
  return fallback
}
export default function DocumentScanPage() {
  const { id: animalId } = useParams<{ id: string }>()
  const navigate = useNavigate()
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
  const [result, setResult] = useState<unknown>(null)
  const [ocrProvider, setOcrProvider] = useState<string | null>(null)
  const [currentStatusMsg, setCurrentStatusMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [autoSavedAt, setAutoSavedAt] = useState<Date | null>(null)
  const [allowedRoles, setAllowedRoles] = useState<string[]>(['vet', 'authority', 'guest'])
  const [suggestedType, setSuggestedType] = useState<string | null>(null)
  const [documentId, setDocumentId] = useState<string | null>(null)
  const [savingDocType, setSavingDocType] = useState(false)
  const [showModelSelection, setShowModelSelection] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [retryProvider, setRetryProvider] = useState('google')
  const [retryModel, setRetryModel] = useState(DEFAULT_MODEL_BY_PROVIDER.google)
  const [requestedDocumentType, setRequestedDocumentType] = useState<DocumentTypeSelectValue>(DOCUMENT_TYPE_PLACEHOLDER)
  const [groupTypes, setGroupTypes] = useState<DocumentTypeSelectValue[]>([])
  const [typeWizardIdx, setTypeWizardIdx] = useState<number | null>(null)

  const [hasGemini, setHasGemini] = useState(false)
  const [hasAnthropic, setHasAnthropic] = useState(false)
  const [hasOpenai, setHasOpenai] = useState(false)
  const [hasSystemAi, setHasSystemAi] = useState(true)
  const hasAnyKey = hasGemini || hasAnthropic || hasOpenai || hasSystemAi
  const [billingConsentAccepted, setBillingConsentAccepted] = useState(true)
  const [billingPricePerPage, setBillingPricePerPage] = useState(0)
  const [showConsentModal, setShowConsentModal] = useState(false)
  const [pendingUploadTypes, setPendingUploadTypes] = useState<DocumentTypeSelectValue[] | undefined>(undefined)
  const [availableModels, setAvailableModels] = useState<any>(DEFAULT_AVAILABLE_MODELS)
  const docTypes = [
    { id: 'vaccination', label: t('animal.docTypeVaccination'), icon: <Syringe size={16} /> },
    { id: 'treatment', label: t('animal.docTypeTreatment'), icon: <BookOpen size={16} /> },
    { id: 'medical_product', label: t('animal.docTypeMedicalProduct'), icon: <FileText size={16} /> },
    { id: 'pet_passport', label: t('animal.docTypePetPassport'), icon: <Camera size={16} /> },
    { id: 'pedigree', label: t('animal.docTypePedigree'), icon: <BookOpen size={16} /> },
    { id: 'dog_certificate', label: t('animal.docTypeDogCertificate'), icon: <FileText size={16} /> },
    { id: 'general', label: t('animal.docTypeGeneral'), icon: <FileText size={16} /> }
  ]

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

  if (typeWizardIdx !== null) {
    const filledGroups = groups.filter(g => g.pages.length > 0)
    const currentGroup = filledGroups[typeWizardIdx]
    const isLast = typeWizardIdx === filledGroups.length - 1
    return (
      <div className="container page">
        <PageHeader title={t('docScan.title')} backTo={`/animals/${animalId}`} showThemeToggle />
        <div className="card animate-slide-up">
          {filledGroups.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
              <span className="badge badge-info">Dokument {typeWizardIdx + 1} von {filledGroups.length}</span>
              {(currentGroup?.pages.length ?? 0) > 1 && (
                <span className="text-muted" style={{ fontSize: 'var(--font-size-sm)' }}>{currentGroup?.pages.length} Seiten</span>
              )}
            </div>
          )}
          {currentGroup?.previews[0] && (
            <img src={currentGroup.previews[0]} alt="Vorschau" style={{ width: '100%', maxHeight: '180px', objectFit: 'contain', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', background: 'var(--surface-2)' }} />
          )}
          <h3 style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-base)' }}>Welcher Dokumenttyp?</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
            {docTypes.map(type => (
              <button
                key={type.id}
                onClick={() => setRequestedDocumentType(type.id as DocumentTypeSelectValue)}
                style={{
                  padding: 'var(--space-2)', borderRadius: 'var(--radius-md)',
                  border: requestedDocumentType === type.id ? '2px solid var(--primary-500)' : '1px solid var(--border)',
                  background: requestedDocumentType === type.id ? 'var(--primary-50)' : 'var(--surface)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                  fontSize: 'var(--font-size-sm)', fontWeight: requestedDocumentType === type.id ? 600 : 400,
                  transition: 'all 0.15s'
                }}
              >
                {type.icon}{type.label}
              </button>
            ))}
          </div>
          <button
            className="btn btn-primary btn-full"
            disabled={requestedDocumentType === DOCUMENT_TYPE_PLACEHOLDER}
            onClick={() => {
              const newTypes = [...groupTypes]
              newTypes[typeWizardIdx] = requestedDocumentType
              setGroupTypes(newTypes)
              if (isLast) {
                setTypeWizardIdx(null)
                setShowModelSelection(true)
              } else {
                setTypeWizardIdx(typeWizardIdx + 1)
                setRequestedDocumentType(DOCUMENT_TYPE_PLACEHOLDER)
              }
            }}
          >
            {isLast ? t('docScan.chooseModel') : `Weiter → Dok. ${typeWizardIdx + 2} von ${filledGroups.length}`}
          </button>
          <button className="btn btn-ghost btn-full" style={{ marginTop: 'var(--space-2)' }} onClick={() => { setTypeWizardIdx(null); setGroupTypes([]) }}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    )
  }

  if (showModelSelection) {
    return (
      <DocumentAnalysisForm
        title={t('docDetail.aiAnalysis')}
        description={t('docDetail.aiSelectProvider')}
        errorMessage={errorMsg}
        hasAnyKey={hasAnyKey}
        hasGemini={hasGemini}
        hasAnthropic={hasAnthropic}
        hasOpenai={hasOpenai}
        hasSystemAi={hasSystemAi}
        retryProvider={retryProvider}
        retryModel={retryModel}
        requestedDocumentType={requestedDocumentType}
        availableModels={availableModels}
        submitLabel={documentId ? t('animal.analyzeBtn') : t('docScan.uploadAndAnalyze')}
        cancelLabel={documentId ? t('docScan.saveForLater') : t('common.cancel')}
        isSubmitting={isAnalyzing}
        hideDocumentType={true}
        onProviderChange={handleProviderChange}
        onModelChange={setRetryModel}
        onRequestedDocumentTypeChange={setRequestedDocumentType}
        onSubmit={documentId ? handleRetryAnalysisAPI : startUploadWithModel}
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
    const willUseSystemFallback = !hasGemini && !hasAnthropic && !hasOpenai && hasSystemAi
    if (willUseSystemFallback && !billingConsentAccepted && billingPricePerPage > 0) {
      setPendingUploadTypes(types)
      setShowConsentModal(true)
      return
    }
    handleUpload(types)
  }

  async function startUploadWithModel() {
    setIsAnalyzing(true)
    try {
      const updates: any = {}
      if (retryProvider === 'google') updates.gemini_model = retryModel
      if (retryProvider === 'anthropic') updates.claude_model = retryModel
      if (retryProvider === 'openai') updates.openai_model = retryModel

      const res = await getMe()
      let currentPrio = ['google', 'anthropic', 'openai']
      try { if (res.data.ai_provider_priority) currentPrio = JSON.parse(res.data.ai_provider_priority) } catch {}

      const newPrio = [retryProvider, ...currentPrio.filter((p: string) => p !== retryProvider)]
      updates.ai_provider_priority = JSON.stringify(newPrio)

      await patchMe(updates)
      setShowModelSelection(false)
      maybeUpload(groupTypes.length > 0 ? groupTypes : undefined)
    } catch (err: any) {
      setErrorMsg(err.message || t('common.error'))
    } finally {
      setIsAnalyzing(false)
    }
  }

  async function handleRetryAnalysisAPI() {
    if (!documentId) return
    if (requestedDocumentType === DOCUMENT_TYPE_PLACEHOLDER) return
    setIsAnalyzing(true)
    setErrorMsg(null)
    try {
      await analyzeDocument(documentId, 'retry', { provider: retryProvider, model: retryModel, language: i18next.language || 'de', requestedDocumentType })
      setShowModelSelection(false)
      navigate(`/animals/${animalId}/documents/${documentId}`, { replace: true })
    } catch (err: any) {
      setShowModelSelection(false)
      setErrorMsg(getAnalysisErrorMessage(err, t('animal.documentFailed')))
      setPhase('error')
    } finally {
      setIsAnalyzing(false)
    }
  }

  async function handleUpload(types?: DocumentTypeSelectValue[]) {
    const filledGroups = groups.filter(g => g.pages.length > 0)
    if (filledGroups.length === 0 || !animalId) return
    if (!types && requestedDocumentType === DOCUMENT_TYPE_PLACEHOLDER) return
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
              if (msg.includes('Tesseract') || msg.includes('tesseract')) setOcrProvider('Lokales Tesseract OCR')
              if (msg.includes('Gemini') || msg.includes('gemini') || msg.includes('Google API')) setOcrProvider('Gemini API')
              if (msg.includes('Quota') || msg.includes('quota')) setOcrProvider('⚠️ Quota - Tesseract Fallback')
            },
            onResult: (data: any) => {
              const nextDocumentId = data.data.documentId
              collectedIds.push(nextDocumentId)
              setResult(data.data)
              setSuggestedType(data.data.type || data.data.suggestedType || 'other')
              setDocumentId(nextDocumentId)
              setOcrProvider(data.data.ocrProvider || 'unknown')
              setAutoSavedAt(new Date())
              if (data.data.analysisStatus === 'pending_analysis') {
                reject(new Error(data.data.analysisError || t('docScan.analyzeFailedRetry')))
                return
              }
              resolve()
            },
            onError: (msg: string) => reject(new Error(msg)),
            metadata: { allowedRoles, language: i18next.language || 'de', requestedDocumentType: types?.[i] ?? requestedDocumentType }
          }).catch(reject)
        })
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unbekannter Fehler')
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
          pageCount={totalPagesToUpload}
          onAccept={() => { setBillingConsentAccepted(true); setShowConsentModal(false); handleUpload(pendingUploadTypes) }}
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
                              title="Hier trennen — neues Dokument"
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
                          {groupIdx < groups.length - 1 && (
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
                              ← Zusammenführen →
                            </button>
                          )}
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
                    <Camera size={18} /> Weitere Seite fotografieren
                  </label>
                  <label htmlFor="addPageFileInput" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
                    minHeight: '44px', padding: 'var(--space-2) var(--space-3)',
                    border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface)', cursor: 'pointer',
                    fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', fontWeight: 500
                  }}>
                    <Plus size={18} /> Weitere Seite aus Galerie
                  </label>
                </div>
              </div>

              <button className="btn btn-primary btn-full" onClick={() => {
                const filled = groups.filter(g => g.pages.length > 0)
                setRequestedDocumentType(DOCUMENT_TYPE_PLACEHOLDER)
                setGroupTypes(new Array(filled.length).fill(DOCUMENT_TYPE_PLACEHOLDER))
                setTypeWizardIdx(0)
              }}>
                {groups.filter(g => g.pages.length > 0).length > 1
                  ? `${groups.filter(g => g.pages.length > 0).length} Dokumente hochladen & analysieren`
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
                  <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                    {hasAnyKey && (
                      <button className="btn btn-primary flex-1" onClick={() => { setRequestedDocumentType(DOCUMENT_TYPE_PLACEHOLDER); setShowModelSelection(true) }} type="button">
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
                  <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                    <button className="btn btn-primary flex-1" onClick={() => navigate(`/animals/${animalId}`)} type="button">
                      {t('docScan.saveForLater')}
                    </button>
                    <button className="btn btn-ghost flex-1" onClick={() => { setPhase('capture'); setErrorMsg(null); setGroups([{ pages: [], previews: [] }]); setActiveGroupIdx(0); setActivePageIdx(0) }} type="button">
                      {t('docScan.retry')}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {phase === 'done' && !!result && (
            <div>
              <div style={{ color: 'var(--success-500)', marginBottom: 'var(--space-3)', display: 'flex', justifyContent: 'center' }}>
                <CheckCircle size={48} strokeWidth={1.5} />
              </div>
              <h3 style={{ marginBottom: 'var(--space-2)' }}>{t('docScan.analyzeComplete')}</h3>
              
              {autoSavedAt && (
                <div style={{ background: 'var(--success-50)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', marginBottom: 'var(--space-4)', border: '1px solid var(--success-200)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <CheckCircle size={20} color="var(--success-600)" />
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--success-800)' }}>{t('docScan.documentSaved')}</div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--success-700)' }}>{autoSavedAt.toLocaleTimeString()}</div>
                  </div>
                </div>
              )}

              {(ocrProvider || currentStatusMsg) && (
                <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-6)', borderLeft: ocrProvider?.includes('Quota') ? '4px solid var(--danger-500)' : '4px solid var(--success-500)' }}>
                  {ocrProvider && <div style={{ display: 'inline-flex', marginBottom: 'var(--space-2)' }}><span className={`badge ${ocrProvider?.includes('Quota') ? 'badge-danger' : 'badge-success'}`}>{ocrProvider}</span></div>}
                  {currentStatusMsg && <p style={{ margin: '0', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>{currentStatusMsg}</p>}
                </div>
              )}

              {suggestedType && (
                <div style={{ background: 'var(--primary-50)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-6)', borderLeft: '4px solid var(--primary-500)' }}>
                  <h4 style={{ margin: '0 0 var(--space-3) 0', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>{t('docScan.docType')}</h4>
                  <p style={{ margin: '0 0 var(--space-3) 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                    {ocrProvider?.includes('Tesseract') ? 'Tesseract' : 'AI'}: <strong style={{ color: 'var(--text-primary)' }}>{docTypes.find(t => t.id === suggestedType)?.label || suggestedType}</strong>
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                    {docTypes.map(type => (
                      <button
                        key={type.id}
                        onClick={() => setSuggestedType(type.id)}
                        style={{
                          padding: 'var(--space-2)',
                          borderRadius: 'var(--radius-md)',
                          border: suggestedType === type.id ? '2px solid var(--primary-500)' : '1px solid var(--border)',
                          background: suggestedType === type.id ? 'var(--primary-50)' : 'var(--surface)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-2)',
                          fontSize: 'var(--font-size-sm)',
                          fontWeight: suggestedType === type.id ? 600 : 400,
                          transition: 'all 0.2s'
                        }}
                      >
                        {type.icon}
                        {type.label}
                      </button>
                    ))}
                  </div>
                  <button
                    className="btn btn-primary btn-full"
                    disabled={savingDocType}
                    onClick={async () => {
                      setSavingDocType(true)
                      try {
                        if (documentId && suggestedType) {
                          await patchDocument(documentId, { doc_type: suggestedType })
                        }
                        navigate(`/animals/${animalId}`)
                      } catch (err) {
                        setErrorMsg(err instanceof Error ? err.message : t('common.error'))
                      } finally {
                        setSavingDocType(false)
                      }
                    }}
                  >
                    {savingDocType ? `${t('docScan.confirmSave')}...` : t('docScan.confirmSave')}
                  </button>
                </div>
              )}

              <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', textAlign: 'left', marginBottom: 'var(--space-6)' }}>
                <h4 style={{ margin: '0 0 var(--space-2) 0', fontSize: 'var(--font-size-sm)' }}>{t('docDetail.ocrText')}</h4>
                {(() => {
                  const parsed = typeof result === 'object' ? (result as any) : null
                  if (!parsed) return (
                    <pre style={{ margin: 0, fontSize: 'var(--font-size-xs)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordWrap: 'break-word', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
                    </pre>
                  )
                  const data = parsed?.data || parsed?.page_results?.[0] || parsed
                  return (
                    <div style={{ display: 'grid', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)' }}>
                      {data?.title && <div><strong>{t('docDetail.title')}:</strong> {data.title}</div>}
                      {data?.document_date && <div><strong>{t('animal.created')}:</strong> {data.document_date}</div>}
                      {data?.summary && <div className="text-muted">{data.summary}</div>}
                      {Array.isArray(data?.vaccinations) && data.vaccinations.length > 0 && (
                        <div>
                          <strong>{t('animal.vaccinations')}:</strong>
                          {data.vaccinations.map((v: any, i: number) => (
                            <div key={i} style={{ marginLeft: 'var(--space-3)', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                              • {[v.vaccine, v.date, v.nextDue ? `Next: ${v.nextDue}` : null, v.vet].filter(Boolean).join(' — ')}
                            </div>
                          ))}
                        </div>
                      )}
                      {data?.product && (
                        <div>
                          <strong>{t('animal.docTypeMedicalProduct')}:</strong>
                          <div style={{ marginLeft: 'var(--space-3)', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                            {[data.product.name, data.product.active_substance, data.product.dosage, data.product.manufacturer].filter(Boolean).join(' — ')}
                          </div>
                        </div>
                      )}
                      {data?.pedigree && (
                        <div>
                          <strong>{t('animal.docTypePedigree')}:</strong>
                          <div style={{ marginLeft: 'var(--space-3)', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                            {[data.pedigree.federation, data.pedigree.registration_number, data.pedigree.sire ? `Vater: ${data.pedigree.sire}` : null, data.pedigree.dam ? `Mutter: ${data.pedigree.dam}` : null].filter(Boolean).join(' — ')}
                          </div>
                        </div>
                      )}
                      {data?.certificate && (
                        <div>
                          <strong>{t('animal.docTypeDogCertificate')}:</strong>
                          <div style={{ marginLeft: 'var(--space-3)', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                            {[data.certificate.holder_name, data.certificate.evaluation, data.certificate.passed !== undefined ? (data.certificate.passed ? '✓ Bestanden' : '✗ Nicht bestanden') : null].filter(Boolean).join(' — ')}
                          </div>
                        </div>
                      )}
                      {Array.isArray(data?.suggested_tags) && data.suggested_tags.length > 0 && (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: 'var(--space-1)' }}>
                          {data.suggested_tags.map((tag: string, i: number) => (
                            <span key={i} className="badge">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>

              <button className="btn btn-ghost btn-full" onClick={() => navigate(`/animals/${animalId}`)} type="button">
                {t('docScan.backToProfile')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
