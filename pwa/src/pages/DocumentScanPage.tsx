import React, { useRef, useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18next from 'i18next'
import { CheckCircle, AlertCircle, Camera, RefreshCw, Plus, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { DocumentAnalysisForm } from '../components/DocumentAnalysisForm'
import { uploadMultiPageDocument } from '../api/ws'
import { analyzeDocument } from '../api/rest'
import { useAiConfig } from '../hooks/useAiConfig'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { DOCUMENT_TYPE_OPTIONS, DOCUMENT_TYPE_PLACEHOLDER, type DocumentTypeSelectValue } from '../utils/documentAnalysis'

const S = {
  pageHeader: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)', marginTop: 'var(--space-2)' } as React.CSSProperties,
  batchGroupList: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' } as React.CSSProperties,
  batchGroupItem: { display: 'flex', gap: 'var(--space-3)', alignItems: 'center', padding: 'var(--space-3)', background: 'var(--surface-alt)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' } as React.CSSProperties,
  batchGroupLabel: { fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '4px' } as React.CSSProperties,
  disclaimer: { marginBottom: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '11px', color: 'var(--text-secondary)' } as React.CSSProperties,
  thumbStrip: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' } as React.CSSProperties,
  thumbRow: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } as React.CSSProperties,
  splitBtn: { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '16px', fontWeight: 700, padding: '0 6px', minHeight: '44px', minWidth: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } as React.CSSProperties,
  thumbPageNum: { position: 'absolute', bottom: '2px', left: '2px', background: 'rgba(0,0,0,0.55)', color: 'white', fontSize: '10px', fontWeight: 700, lineHeight: 1, padding: '2px 4px', borderRadius: '3px' } as React.CSSProperties,
  thumbRemoveBtn: { position: 'absolute', top: '-8px', right: '-8px', width: '22px', height: '22px', background: 'var(--danger-600)', border: '2px solid var(--surface)', borderRadius: '50%', color: 'white', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
  groupTag: { fontSize: '11px', fontWeight: 700, color: 'var(--primary-600)', background: 'var(--primary-50)', borderRadius: '4px', padding: '2px 6px', display: 'inline-block', marginBottom: 'var(--space-2)' } as React.CSSProperties,
  mergeBtn: { marginTop: 'var(--space-2)', width: '100%', padding: 'var(--space-2) var(--space-3)', minHeight: '44px', background: 'var(--danger-50)', border: '1px solid var(--danger-200)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--danger-600)', fontSize: 'var(--font-size-sm)', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' } as React.CSSProperties,
  addPageBtns: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-3)' } as React.CSSProperties,
  progressBarWrap: { width: '100%', maxWidth: '240px', margin: '0 auto var(--space-3)' } as React.CSSProperties,
  analysingSpinner: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' } as React.CSSProperties,
  statusMsg: { fontSize: 'var(--font-size-sm)', padding: '0 var(--space-4)', wordBreak: 'break-word', minHeight: '40px' } as React.CSSProperties,
  errorIcon: { color: 'var(--danger-500)', marginBottom: 'var(--space-3)', display: 'flex', justifyContent: 'center' } as React.CSSProperties,
  errorActions: { display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' } as React.CSSProperties,
  techDetails: { marginBottom: 'var(--space-4)', textAlign: 'left' } as React.CSSProperties,
  techPre: { margin: 0, padding: 'var(--space-2)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '10px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text-secondary)', maxHeight: '120px' } as React.CSSProperties,
  noAccessCard: { textAlign: 'center', padding: 'var(--space-8)' } as React.CSSProperties,
}

type Phase = 'capture' | 'configure' | 'uploading' | 'analysing' | 'error'
type Group = { pages: File[]; previews: string[] }

const HTTP_ERROR_CODE_MAP: Record<string, string> = {
  budget_exceeded: 'docScan.budgetExceeded',
}

function parseAnalysisError(rawError: unknown, fallback: string, t?: (key: string) => string): { userMessage: string; techMessage: string } {
  if (!rawError) return { userMessage: fallback, techMessage: '' }
  if (typeof rawError === 'string') return { userMessage: rawError, techMessage: '' }

  const err = rawError as any
  let userMessage = fallback
  let techMessage = ''

  const response = err?.response
  if (response) {
    const status = response.status
    const data = response.data || {}
    techMessage = `HTTP ${status}: ${JSON.stringify(data)}`
    const rawCode = (data.error || data.message) as string | undefined
    if (rawCode) {
      const i18nKey = HTTP_ERROR_CODE_MAP[rawCode]
      userMessage = (i18nKey && t) ? t(i18nKey) : rawCode
    }
  } else if (err?.message) {
    userMessage = err.message || fallback
    techMessage = err.details || err.stack || ''
  }
  return { userMessage, techMessage }
}

async function processImage(f: File): Promise<{ file: File; preview: string }> {
  return new Promise((resolve, reject) => {
    createImageBitmap(f).then((bmp) => {
      const canvas = document.createElement('canvas')
      const MAX = 1200
      let width = bmp.width, height = bmp.height
      if (width > height) { if (width > MAX) { height *= MAX / width; width = MAX } }
      else { if (height > MAX) { width *= MAX / height; height = MAX } }
      canvas.width = width; canvas.height = height
      canvas.getContext('2d')?.drawImage(bmp, 0, 0, width, height)
      canvas.toBlob((blob) => {
        if (blob) resolve({ file: new File([blob], f.name, { type: 'image/jpeg', lastModified: Date.now() }), preview: URL.createObjectURL(new Blob([blob])) })
        bmp.close()
      }, 'image/jpeg', 0.8)
    }).catch(reject)
  })
}

export default function DocumentScanPage() {
  const { id: animalId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const routeState = location.state as { documentId?: string; action?: 'retry' | 'reanalyze'; previews?: string[] } | null
  const { t } = useTranslation()
  const { isGuest } = useCurrentUser()
  const ai = useAiConfig()
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [groups, setGroups] = useState<Group[]>([{ pages: [], previews: [] }])
  const [activeGroupIdx, setActiveGroupIdx] = useState(0)
  const [activePageIdx, setActivePageIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>('capture')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [ocrProvider, setOcrProvider] = useState<string | null>(null)
  const [currentStatusMsg, setCurrentStatusMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [techErrorMsg, setTechErrorMsg] = useState<string | null>(null)
  const [documentId, setDocumentId] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [requestedDocumentType, setRequestedDocumentType] = useState<DocumentTypeSelectValue>('general')
  const [groupTypes, setGroupTypes] = useState<DocumentTypeSelectValue[]>([])
  const [consentChecked, setConsentChecked] = useState(false)

  const hasPages = groups.some(g => g.pages.length > 0)
  const totalPages = groups.reduce((s, g) => s + g.pages.length, 0)
  const activePreview = groups[activeGroupIdx]?.previews[activePageIdx]
  const filledGroups = groups.filter(g => g.pages.length > 0)
  const isBatch = filledGroups.length > 1
  const isRetry = !!routeState?.documentId

  // Navigate to configure phase when retry/reanalyze
  useEffect(() => {
    if (routeState?.documentId) {
      setDocumentId(routeState.documentId)
      if (routeState.previews?.length) {
        const normalizedPreviews = routeState.previews.map(p => {
          if (!p || p.startsWith('blob:') || p.startsWith('data:')) return p
          const filename = p.split(/[\\/]/).pop()
          return filename ? `/uploads/${filename}` : p
        })
        setGroups([{ pages: [], previews: normalizedPreviews }])
      }
      setPhase('configure')
    }
  }, [])

  useEffect(() => {
    if (phase !== 'analysing') return
    setElapsedTime(0)
    const startTime = Date.now()
    const interval = setInterval(() => setElapsedTime(Math.floor((Date.now() - startTime) / 1000)), 1000)
    return () => clearInterval(interval)
  }, [phase])

  const allPreviews = groups.flatMap(g => g.previews)

  // Consent is required when using system AI without own key
  const needsConsent = ai.usingFallback && !ai.billingConsentAccepted && !consentChecked
  const canSubmit = !needsConsent || consentChecked

  if (isGuest) {
    return (
      <div className="container page">
        <div className="error-card" style={S.noAccessCard}>
          <p style={{ fontWeight: 600 }}>{t('common.noAccess')}</p>
          <p className="text-muted">{t('docScan.noAccessDesc')}</p>
          <button className="btn btn-ghost" onClick={() => navigate(-1)}>{t('common.back')}</button>
        </div>
      </div>
    )
  }

  // --- Image handling ---
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      const { file, preview } = await processImage(f)
      setGroups([{ pages: [file], previews: [preview] }])
      setActiveGroupIdx(0); setActivePageIdx(0)
    } catch { setErrorMsg(t('docScan.imageProcessError')) }
    e.target.value = ''
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
    } catch { setErrorMsg(t('docScan.pageAddError')) }
    e.target.value = ''
  }

  function handleRemovePage(groupIdx: number, pageIdx: number) {
    const newGroups = groups.map((g, gi) =>
      gi !== groupIdx ? g : { pages: g.pages.filter((_, i) => i !== pageIdx), previews: g.previews.filter((_, i) => i !== pageIdx) }
    ).filter((g, _, arr) => g.pages.length > 0 || arr.length === 1)
    setActiveGroupIdx(Math.min(activeGroupIdx, newGroups.length - 1))
    setActivePageIdx(Math.min(activePageIdx, Math.max(0, (newGroups[Math.min(activeGroupIdx, newGroups.length - 1)]?.pages.length || 1) - 1)))
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
      } else { newGroups.push(g) }
      offset += g.pages.length
    }
    setGroups(newGroups)
  }

  function removeGroupDivider(groupIdx: number) {
    if (groupIdx >= groups.length - 1) return
    const newGroups = [...groups]
    newGroups.splice(groupIdx, 2, { pages: [...newGroups[groupIdx].pages, ...newGroups[groupIdx + 1].pages], previews: [...newGroups[groupIdx].previews, ...newGroups[groupIdx + 1].previews] })
    setGroups(newGroups)
    if (activeGroupIdx > groupIdx) setActiveGroupIdx(activeGroupIdx - 1)
  }

  async function handleRotate() {
    const g = groups[activeGroupIdx]
    if (!g?.previews[activePageIdx] || !g?.pages[activePageIdx]) return
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.height; canvas.height = img.width
      const ctx = canvas.getContext('2d')
      if (ctx) { ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(Math.PI / 2); ctx.drawImage(img, -img.width / 2, -img.height / 2) }
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

  // --- Submit flows ---
  async function handleSubmitConfigure() {
    if (consentChecked && !ai.billingConsentAccepted) {
      ai.setBillingConsentAccepted(true)
    }
    if (isRetry) {
      await handleRetryAnalysisAPI()
    } else {
      await handleUpload()
    }
  }

  async function handleRetryAnalysisAPI() {
    if (!documentId || requestedDocumentType === DOCUMENT_TYPE_PLACEHOLDER) return
    setIsAnalyzing(true)
    setErrorMsg(null)
    setPhase('analysing')
    setCurrentStatusMsg(t('docScan.sendingToAi'))
    setOcrProvider(null)
    setUploadProgress(100)
    try {
      const action = routeState?.action || 'retry'
      await analyzeDocument(documentId, action, {
        provider: ai.hasOwnKey ? ai.retryProvider : null,
        model: ai.hasOwnKey ? ai.retryModel : null,
        language: i18next.language || 'de',
        requestedDocumentType
      })
      navigate(`/animals/${animalId}/documents/${documentId}`, { replace: true })
    } catch (err) {
      const parsed = parseAnalysisError(err, t('animal.documentFailed'), t)
      setErrorMsg(parsed.userMessage)
      setTechErrorMsg(parsed.techMessage)
      setPhase('error')
    } finally {
      setIsAnalyzing(false)
    }
  }

  async function handleUpload() {
    if (filledGroups.length === 0 || !animalId) return
    if (!isBatch && requestedDocumentType === DOCUMENT_TYPE_PLACEHOLDER) return
    if (isBatch && (groupTypes.length < filledGroups.length || groupTypes.includes(DOCUMENT_TYPE_PLACEHOLDER as DocumentTypeSelectValue))) return

    setPhase('uploading')
    setUploadProgress(0)
    setElapsedTime(0)
    setOcrProvider(null)
    setErrorMsg(null)

    const collectedIds: string[] = []

    try {
      for (let i = 0; i < filledGroups.length; i++) {
        const docLabel = isBatch ? `Doc ${i + 1}/${filledGroups.length}: ` : ''
        await new Promise<void>((resolve, reject) => {
          uploadMultiPageDocument(animalId!, filledGroups[i].pages, {
            onProgress: (percent: number) => setUploadProgress(Math.round(percent)),
            onStatus: (msg: string) => {
              setPhase('analysing')
              setCurrentStatusMsg(docLabel + msg)
              if (msg.includes('Gemini') || msg.includes('Google API')) setOcrProvider(t('docScan.geminiApi'))
              else if (msg.includes('Quota') || msg.includes('quota')) setOcrProvider(t('docScan.quotaFallback'))
            },
            onResult: (data: any) => {
              const nextDocumentId = data.data.documentId
              collectedIds.push(nextDocumentId)
              setDocumentId(nextDocumentId)
              setOcrProvider(data.data.ocrProvider || 'unknown')
              if (data.data.analysisStatus === 'pending_analysis') {
                const err = new Error(data.data.analysisError || t('docScan.analyzeFailedRetry')) as any
                err.details = data.data.analysisError
                reject(err); return
              }
              resolve()
            },
            onError: (msg: string, details?: string) => {
              const err = new Error(msg) as any
              err.details = details
              reject(err)
            },
            metadata: {
              language: i18next.language || 'de',
              requestedDocumentType: isBatch ? groupTypes[i] : requestedDocumentType,
              provider: ai.hasOwnKey ? ai.retryProvider : null,
              model: ai.hasOwnKey ? ai.retryModel : null
            }
          }).catch(reject)
        })
      }
    } catch (err) {
      const parsed = parseAnalysisError(err, t('common.unknownError'), t)
      setErrorMsg(parsed.userMessage)
      setTechErrorMsg(parsed.techMessage)
      setPhase('error')
      return
    }

    if (collectedIds.length === 1) navigate(`/animals/${animalId}/documents/${collectedIds[0]}`, { replace: true })
    else navigate(`/animals/${animalId}`, { replace: true })
  }

  // --- Configure phase: batch type selection or single form ---
  if (phase === 'configure') {
    const previews = allPreviews.filter(Boolean) as string[]

    if (isBatch && !isRetry) {
      return (
        <div className="container page">
          <div style={S.pageHeader}>
            <button className="btn btn-ghost" style={{ padding: '8px', margin: '-8px' }} onClick={() => setPhase('capture')}>{t('common.back')}</button>
            <h1 style={{ margin: 0, fontSize: 'var(--font-size-xl)' }}>{t('docScan.batchUpload', { count: filledGroups.length })}</h1>
          </div>
          <div className="card animate-slide-up">
            <div style={S.batchGroupList}>
              {filledGroups.map((group, i) => (
                <div key={i} style={S.batchGroupItem}>
                  <img src={group.previews[0]} alt="Preview" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={S.batchGroupLabel}>DOC {i + 1} ({group.pages.length} {t('docScan.pages')})</div>
                    <select className="form-select" style={{ padding: '4px 8px', fontSize: 'var(--font-size-sm)' }}
                      value={groupTypes[i] || DOCUMENT_TYPE_PLACEHOLDER}
                      onChange={e => { const t = [...groupTypes]; t[i] = e.target.value as DocumentTypeSelectValue; setGroupTypes(t) }}>
                      <option value={DOCUMENT_TYPE_PLACEHOLDER} disabled>{t('docScan.docTypePlaceholder')}</option>
                      {DOCUMENT_TYPE_OPTIONS.map(type => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
            <SystemAiCostInfo ai={ai} pageCount={filledGroups.reduce((s, g) => s + g.pages.length, 0)} consentChecked={consentChecked} onConsentChange={setConsentChecked} t={t} />
            <div className="form-group" style={{ opacity: ai.usingFallback ? 0.6 : 1 }}>
              <label className="form-label">{t('docDetail.provider')}</label>
              <ProviderSelect ai={ai} t={t} />
            </div>
            <div style={S.disclaimer}>
              <strong>Disclaimer:</strong> {t('docScan.aiDisclaimer')}
            </div>
            <button className="btn btn-primary btn-full" disabled={groupTypes.length < filledGroups.length || groupTypes.some(gt => gt === DOCUMENT_TYPE_PLACEHOLDER) || !canSubmit} onClick={handleSubmitConfigure}>
              {t('docScan.analyzeAll', { count: filledGroups.length })}
            </button>
          </div>
        </div>
      )
    }

    return (
      <DocumentAnalysisForm
        title={isRetry ? t('docDetail.aiAnalysis') : t('docScan.title')}
        description={t('docDetail.aiSelectProvider')}
        previews={previews}
        errorMessage={errorMsg}
        hasAnyKey={ai.hasAnyKey}
        hasGemini={ai.hasGemini}
        hasAnthropic={ai.hasAnthropic}
        hasOpenai={ai.hasOpenai}
        hasSystemAi={ai.hasSystemAi}
        systemFallbackEnabled={ai.systemFallbackEnabled}
        pricePerPage={ai.billingPricePerPage}
        retryProvider={ai.retryProvider}
        retryModel={ai.retryModel}
        requestedDocumentType={requestedDocumentType}
        availableModels={ai.availableModels}
        submitLabel={isRetry ? t('animal.analyzeBtn') : t('docScan.uploadAndAnalyze')}
        cancelLabel={isRetry ? t('docScan.saveForLater') : t('common.cancel')}
        isSubmitting={isAnalyzing}
        consentRequired={needsConsent}
        consentChecked={consentChecked}
        onConsentChange={setConsentChecked}
        onProviderChange={ai.handleProviderChange}
        onModelChange={ai.setRetryModel}
        onRequestedDocumentTypeChange={setRequestedDocumentType}
        onSubmit={handleSubmitConfigure}
        onCancel={() => {
          setErrorMsg(null)
          if (isRetry) navigate(`/animals/${animalId}`)
          else setPhase('capture')
        }}
      />
    )
  }

  return (
    <div className="container page">
      <PageHeader title={t('docScan.title')} backTo={`/animals/${animalId}`} showThemeToggle />

      {phase === 'capture' && (
        <div className="card animate-slide-up">
          <p className="text-muted" style={{ marginBottom: 'var(--space-6)' }}>{t('docScan.uploadMethod')}</p>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileChange} />
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

          {!hasPages ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <button type="button" className="btn btn-primary btn-full" onClick={() => cameraRef.current?.click()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }}>
                <Camera size={20} /> {t('docScan.camera')}
              </button>
              <button type="button" className="btn btn-secondary btn-full" onClick={() => fileRef.current?.click()}>
                {t('docScan.file')}
              </button>
            </div>
          ) : (
            <>
              <div style={{ position: 'relative', marginBottom: 'var(--space-4)' }}>
                <img src={activePreview} alt="Preview" style={{ width: '100%', borderRadius: 'var(--radius-md)', display: 'block' }} />
                <button className="btn-secondary" onClick={handleRotate} title={t('docScan.rotateImage')}
                  style={{ position: 'absolute', top: 'var(--space-2)', right: 'var(--space-2)', padding: '8px', borderRadius: '50%', background: 'rgba(255,255,255,0.9)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', border: 'none', cursor: 'pointer' }}>
                  <RefreshCw size={20} color="var(--primary-600)" />
                </button>
              </div>

              {/* Thumbnail strip with group management */}
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-2)', color: 'var(--text-secondary)' }}>
                  {t('docScan.pages')}: {totalPages}
                  {groups.length > 1 && <span style={{ marginLeft: 'var(--space-2)', color: 'var(--primary-600)' }}>· {groups.length} {t('docScan.documents')}</span>}
                </div>
                <div style={S.thumbStrip}>
                  {(() => {
                    const groupItems: React.ReactNode[] = []
                    let globalIdx = 0
                    groups.forEach((group, groupIdx) => {
                      const thumbRow: React.ReactNode[] = []
                      group.previews.forEach((preview, pageIdx) => {
                        const myGlobalIdx = globalIdx
                        const isActive = groupIdx === activeGroupIdx && pageIdx === activePageIdx
                        if (pageIdx > 0) {
                          thumbRow.push(
                            <button key={`split-${myGlobalIdx}`} onClick={() => insertGroupDivider(myGlobalIdx)} title={t('docScan.splitDocument')}
                              style={S.splitBtn} aria-label="Split page">÷</button>
                          )
                        }
                        thumbRow.push(
                          <div key={`thumb-${groupIdx}-${pageIdx}`} onClick={() => { setActiveGroupIdx(groupIdx); setActivePageIdx(pageIdx) }}
                            style={{ position: 'relative', width: '64px', height: '64px', borderRadius: 'var(--radius-sm)', overflow: 'visible', border: `3px solid ${isActive ? 'var(--primary-500)' : 'var(--border)'}`, cursor: 'pointer', opacity: isActive ? 1 : 0.7, transition: 'all var(--t-fast)', flexShrink: 0 }}>
                            <img src={preview} alt={`Page ${pageIdx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'calc(var(--radius-sm) - 2px)', display: 'block' }} />
                            {group.pages.length > 1 && <span style={S.thumbPageNum}>{pageIdx + 1}</span>}
                            {totalPages > 1 && (
                              <button onClick={(e) => { e.stopPropagation(); handleRemovePage(groupIdx, pageIdx) }}
                                style={S.thumbRemoveBtn} aria-label="Remove page"><X size={12} /></button>
                            )}
                          </div>
                        )
                        globalIdx++
                      })
                      groupItems.push(
                        <div key={`group-${groupIdx}`}>
                          {groups.length > 1 && <div style={S.groupTag}>Doc {groupIdx + 1}</div>}
                          <div style={S.thumbRow}>{thumbRow}</div>
                          {groupIdx < groups.length - 1 && (
                            <button onClick={() => removeGroupDivider(groupIdx)} style={S.mergeBtn}
                              aria-label="Merge documents">{t('docScan.mergeDocuments')}</button>
                          )}
                        </div>
                      )
                    })
                    return groupItems
                  })()}
                </div>

                <input type="file" id="addPageCameraInput" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleAddPage} />
                <input type="file" id="addPageFileInput" accept="image/*" style={{ display: 'none' }} onChange={handleAddPage} />
                <div style={S.addPageBtns}>
                  <label htmlFor="addPageCameraInput" className="btn-add-page"><Camera size={18} /> {t('docScan.addPageCamera')}</label>
                  <label htmlFor="addPageFileInput" className="btn-add-page"><Plus size={18} /> {t('docScan.addPageFile')}</label>
                </div>
              </div>

              <button className="btn btn-primary btn-full" onClick={() => {
                setRequestedDocumentType('general')
                setGroupTypes(new Array(filledGroups.length).fill('general'))
                setPhase('configure')
              }}>
                {isBatch ? t('docScan.uploadMultiAndAnalyze', { count: filledGroups.length }) : t('docScan.uploadAndAnalyze')}
              </button>
              <button className="btn btn-ghost btn-full" style={{ marginTop: 'var(--space-2)' }} onClick={() => { setGroups([{ pages: [], previews: [] }]); setActiveGroupIdx(0); setActivePageIdx(0) }}>
                {t('docScan.chooseAnother')}
              </button>
            </>
          )}
        </div>
      )}

      {(phase === 'uploading' || phase === 'analysing' || phase === 'error') && (
        <div className="card animate-slide-up" style={{ textAlign: 'center', padding: 'var(--space-6) var(--space-4)' }}>
          <div className="stepper" style={{ marginBottom: 'var(--space-6)' }}>
            <div className={`stepper-step active`}><div className="stepper-number">1</div><div className="stepper-label">{t('docScan.camera')}</div></div>
            <div className={`stepper-step ${phase === 'analysing' || phase === 'error' ? 'active' : ''}`}><div className="stepper-number">2</div><div className="stepper-label">{t('docScan.analyzing')}</div></div>
            <div className={`stepper-step ${phase === 'error' ? 'active' : ''}`}><div className="stepper-number"><CheckCircle size={16} color="white" /></div><div className="stepper-label">{t('docScan.analyzeComplete')}</div></div>
          </div>

          {phase === 'uploading' && (
            <div>
              <h3 style={{ marginBottom: 'var(--space-4)' }}>{t('docScan.uploading')}...</h3>
              <div className="progress-bar" style={S.progressBarWrap}>
                <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }} />
              </div>
              <div className="text-muted" style={{ fontWeight: 600 }}>{uploadProgress}%</div>
            </div>
          )}

          {phase === 'analysing' && (
            <div>
              <h3 style={{ marginBottom: 'var(--space-4)' }}>{t('docScan.analyzing')}...</h3>
              <div style={S.analysingSpinner}>
                <div className="spinner"></div>
                {ocrProvider && <span className="badge badge-info">{ocrProvider}</span>}
              </div>
              <div className="text-muted" style={S.statusMsg}>
                {currentStatusMsg || t('common.loading')}
              </div>
              <div className="text-tertiary" style={{ fontSize: 'var(--font-size-xs)', marginTop: 'var(--space-2)' }}>{elapsedTime}s</div>
            </div>
          )}

          {phase === 'error' && (
            <div>
              <div style={S.errorIcon}>
                <AlertCircle size={48} strokeWidth={1.5} />
              </div>
              <h3 style={{ marginBottom: 'var(--space-2)' }}>{t('docScan.analyzeFailed')}</h3>
              <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>{errorMsg || t('common.error')}</p>
              {techErrorMsg && (
                <div style={S.techDetails}>
                  <p style={{ margin: '0 0 4px 0', fontSize: '11px', fontWeight: 600, color: 'var(--danger-600)' }}>Technical Details:</p>
                  <pre className="debug-error-details" style={S.techPre}>{techErrorMsg}</pre>
                </div>
              )}
              <div style={S.errorActions}>
                {ai.hasAnyKey && documentId && (
                  <button className="btn btn-primary flex-1" onClick={() => { setRequestedDocumentType('general'); setPhase('configure') }} type="button">
                    {t('animal.retry')}
                  </button>
                )}
                <button className="btn btn-ghost flex-1" onClick={() => navigate(`/animals/${animalId}`)} type="button">
                  {documentId ? t('docScan.saveForLater') : t('common.cancel')}
                </button>
                {!documentId && (
                  <button className="btn btn-ghost flex-1" onClick={() => { setPhase('capture'); setErrorMsg(null); setTechErrorMsg(null); setGroups([{ pages: [], previews: [] }]); setActiveGroupIdx(0); setActivePageIdx(0) }} type="button">
                    {t('docScan.retry')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// --- Small helper components ---

function SystemAiCostInfo({ ai, pageCount, consentChecked, onConsentChange, t }: { ai: ReturnType<typeof useAiConfig>; pageCount: number; consentChecked: boolean; onConsentChange: (v: boolean) => void; t: Function }) {
  if (ai.hasOwnKey) return null
  if (!ai.hasSystemAi || !ai.systemFallbackEnabled) return null

  if (ai.billingConsentAccepted) {
    return (
      <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--info-50)', border: '1px solid var(--info-200)', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--info-700)' }}>
        {t('docScan.usingSystemFallback')}
        {ai.billingPricePerPage > 0 && <span style={{ fontWeight: 600 }}> · {t('docScan.costInfo', { price: ai.billingPricePerPage })}</span>}
      </div>
    )
  }

  const totalCents = ai.billingPricePerPage * pageCount
  return (
    <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4)', background: 'var(--warning-50)', border: '2px solid var(--warning-400)', borderRadius: 'var(--radius-md)' }}>
      <p style={{ margin: '0 0 var(--space-2) 0', fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--warning-800)' }}>{t('docScan.systemAiCostTitle')}</p>
      <p style={{ margin: '0 0 var(--space-3) 0', fontSize: 'var(--font-size-sm)', color: 'var(--warning-700)' }}>
        {pageCount} {t('docScan.pages')} × {ai.billingPricePerPage} ct = <strong>{totalCents} ct</strong>
      </p>
      <label style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start', cursor: 'pointer' }}>
        <input type="checkbox" checked={consentChecked} onChange={e => onConsentChange(e.target.checked)} style={{ marginTop: '2px', width: 16, height: 16, accentColor: 'var(--primary-500)', flexShrink: 0 }} />
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--warning-800)' }}>{t('docScan.systemAiConsentLabel')}</span>
      </label>
    </div>
  )
}

function ProviderSelect({ ai, t }: { ai: ReturnType<typeof useAiConfig>; t: Function }) {
  if (!ai.hasOwnKey) {
    return (
      <select className="form-select" disabled>
        <option>{ai.usingFallback ? String(t('profile.systemAiFallback')) : String(t('docScan.noProviderAvailable'))}</option>
      </select>
    )
  }
  return (
    <select className="form-select" value={ai.retryProvider} onChange={e => ai.handleProviderChange(e.target.value)}>
      {ai.hasGemini && <option value="google">Google Gemini</option>}
      {ai.hasAnthropic && <option value="anthropic">Anthropic Claude</option>}
      {ai.hasOpenai && <option value="openai">OpenAI</option>}
    </select>
  )
}
