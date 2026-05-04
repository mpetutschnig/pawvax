import { useRef, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18next from 'i18next'
import { CheckCircle, AlertCircle, Syringe, FileText, BookOpen, Camera, RefreshCw, Plus, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { uploadMultiPageDocument } from '../api/ws'
import { patchDocument, getMe, patchMe } from '../api/rest'

type Phase = 'capture' | 'uploading' | 'analysing' | 'done' | 'error'

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

  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [previews, setPreviews] = useState<string[]>([])
  const [pages, setPages] = useState<File[]>([])
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
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
  const [savingModel, setSavingModel] = useState(false)
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

  const docTypes = [
    { id: 'vaccination', label: t('animal.docTypeVaccination'), icon: <Syringe size={14} /> },
    { id: 'treatment', label: t('animal.docTypeTreatment'), icon: <FileText size={14} /> },
    { id: 'pet_passport', label: t('animal.docTypePetPassport'), icon: <BookOpen size={14} /> },
    { id: 'medical_product', label: t('animal.docTypeMedicalProduct'), icon: <FileText size={14} /> },
    { id: 'pedigree', label: t('animal.docTypePedigree'), icon: <BookOpen size={14} /> },
    { id: 'dog_certificate', label: t('animal.docTypeDogCertificate'), icon: <CheckCircle size={14} /> },
    { id: 'general', label: t('animal.docTypeGeneral'), icon: <FileText size={14} /> },
  ]

  useEffect(() => {
    if (phase !== 'analysing') return
    const interval = setInterval(() => setElapsedTime(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [phase])

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
      setPages([file])
      setPreviews([preview])
      setCurrentPageIndex(0)
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
      setPages([...pages, file])
      setPreviews([...previews, preview])
      setCurrentPageIndex(pages.length)
    } catch (err) {
      console.error(err)
      setErrorMsg(t('docScan.pageAddError'))
    }
  }

  function handleRemovePage(index: number) {
    const newPages = pages.filter((_, i) => i !== index)
    const newPreviews = previews.filter((_, i) => i !== index)
    setPages(newPages)
    setPreviews(newPreviews)
    if (currentPageIndex >= newPages.length) {
      setCurrentPageIndex(Math.max(0, newPages.length - 1))
    }
  }

  async function handleRotate() {
    if (!previews[currentPageIndex] || !pages[currentPageIndex]) return
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
          const rotatedFile = new File([blob], pages[currentPageIndex].name, { type: 'image/jpeg', lastModified: Date.now() })
          const newPages = [...pages]
          newPages[currentPageIndex] = rotatedFile
          setPages(newPages)
          const newPreviews = [...previews]
          newPreviews[currentPageIndex] = URL.createObjectURL(rotatedFile)
          setPreviews(newPreviews)
        }
      }, 'image/jpeg', 0.8)
    }
    img.src = previews[currentPageIndex]
  }

  const handleProviderChange = (prov: string) => {
    setRetryProvider(prov)
    if (prov === 'google') setRetryModel('gemini-3.1-flash-lite-preview')
    else if (prov === 'anthropic') setRetryModel('claude-3-5-sonnet-20241022')
    else if (prov === 'openai') setRetryModel('gpt-4o-mini')
  }

  const startUploadWithModel = async () => {
    setSavingModel(true)
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
      handleUpload() // Starte den Upload erst nach Festlegung des Modells
    } catch (err: any) {
      setErrorMsg(err.message || t('common.error'))
    } finally {
      setSavingModel(false)
    }
  }

  const handleRetryAnalysisAPI = async () => {
    if (!documentId) return
    setSavingModel(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/documents/${documentId}/retry-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ provider: retryProvider, model: retryModel, language: i18next.language || 'de' })
      })
      const data = await res.json().catch(() => ({}))
      setShowModelSelection(false)

      if (!res.ok) {
        navigate(`/animals/${animalId}/documents/${documentId}`, {
          replace: true,
          state: { analysisError: data.error || t('animal.documentFailed') }
        })
        return
      }

      navigate(`/animals/${animalId}/documents/${documentId}`, { replace: true })
    } catch (err: any) {
      setShowModelSelection(false)
      navigate(`/animals/${animalId}/documents/${documentId}`, {
        replace: true,
        state: { analysisError: err.message || t('common.error') }
      })
    } finally {
      setSavingModel(false)
    }
  }

  async function handleUpload() {
    if (pages.length === 0 || !animalId) return
    setPhase('uploading')
    setUploadProgress(0)
    setElapsedTime(0)
    setOcrProvider(null)
    setErrorMsg(null)
    setShowModelSelection(false)

    try {
      await uploadMultiPageDocument(animalId, pages, {
        onProgress: (percent: number) => setUploadProgress(Math.round(percent)),
        onStatus: (msg: string) => {
          setPhase('analysing')
          setCurrentStatusMsg(msg)
          if (msg.includes('Tesseract') || msg.includes('tesseract')) setOcrProvider('Lokales Tesseract OCR')
          if (msg.includes('Gemini') || msg.includes('gemini') || msg.includes('Google API')) setOcrProvider('Gemini API')
          if (msg.includes('Quota') || msg.includes('quota')) setOcrProvider('⚠️ Quota - Tesseract Fallback')
        },
        onResult: (data: any) => {
          const nextDocumentId = data.data.documentId
          setResult(data.data)
          setSuggestedType(data.data.type || data.data.suggestedType || 'other')
          setDocumentId(nextDocumentId)
          setOcrProvider(data.data.ocrProvider || 'unknown')
          setAutoSavedAt(new Date())

          if (data.data.analysisStatus === 'pending_analysis') {
            navigate(`/animals/${animalId}/documents/${nextDocumentId}`, {
              replace: true,
              state: { analysisError: t('docScan.analyzeFailedRetry') }
            })
            return
          }

          navigate(`/animals/${animalId}/documents/${nextDocumentId}`, { replace: true })
        },
        onError: (msg: string) => {
          setErrorMsg(msg)
          setPhase('error')
        },
        metadata: { 
          allowedRoles,
          language: i18next.language || 'de'
        }
      })
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unbekannter Fehler')
      setPhase('error')
    }
  }

  // Eigener "Screen" für die Analyse
  if (showModelSelection) {
    return (
      <div className="container page">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)', marginTop: 'var(--space-2)' }}>
          <button className="btn-ghost" style={{ padding: '8px', margin: '-8px' }} onClick={() => { setShowModelSelection(false); setErrorMsg(null); }}>
            <X size={24} />
          </button>
          <h1 style={{ margin: 0, fontSize: 'var(--font-size-xl)' }}>{t('docDetail.aiAnalysis')}</h1>
        </div>
        
        {errorMsg && <div className="error-card" style={{ marginBottom: 'var(--space-4)' }}><p>{errorMsg}</p></div>}

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
            {hasAnyKey ? (
              <>
                <button className="btn btn-primary flex-1" onClick={documentId ? handleRetryAnalysisAPI : startUploadWithModel} disabled={savingModel}>
                  {savingModel ? t('animal.retrying') : (documentId ? t('animal.analyzeBtn') : t('docScan.uploadAndAnalyze'))}
                </button>
                <button className="btn btn-ghost flex-1" onClick={() => documentId ? navigate(`/animals/${animalId}`) : setShowModelSelection(false)} disabled={savingModel}>
                  {documentId ? t('docScan.saveForLater') : t('common.cancel')}
                </button>
              </>
            ) : (
              <>
                {!documentId && (
                  <button className="btn btn-primary flex-1" onClick={handleUpload} disabled={savingModel}>
                    {t('docScan.upload')}
                  </button>
                )}
                <button className="btn btn-ghost flex-1" onClick={() => documentId ? navigate(`/animals/${animalId}`) : setShowModelSelection(false)} disabled={savingModel}>
                  {documentId ? t('docScan.saveForLater') : t('common.cancel')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container page">
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
          {previews.length === 0 ? (
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
                <img src={previews[currentPageIndex]} alt="Vorschau" style={{ width: '100%', borderRadius: 'var(--radius-md)', display: 'block' }} />
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

              {/* Page Thumbnails and Add Page Button */}
              {previews.length > 0 && (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-2)', color: 'var(--text-secondary)' }}>
                    {t('docScan.pages')}: {previews.length}
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
                    {previews.map((preview, idx) => (
                      <div
                        key={idx}
                        onClick={() => setCurrentPageIndex(idx)}
                        style={{
                          position: 'relative',
                          width: '60px',
                          height: '60px',
                          borderRadius: 'var(--radius-sm)',
                          overflow: 'hidden',
                          border: `2px solid ${idx === currentPageIndex ? 'var(--primary-500)' : 'var(--border)'}`,
                          cursor: 'pointer',
                          opacity: idx === currentPageIndex ? 1 : 0.6,
                          transition: 'all var(--t-fast)'
                        }}
                      >
                        <img src={preview} alt={`Seite ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        {previews.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRemovePage(idx)
                            }}
                            style={{
                              position: 'absolute',
                              top: '-5px',
                              right: '-5px',
                              width: '20px',
                              height: '20px',
                              background: 'var(--danger-600)',
                              border: 'none',
                              borderRadius: '50%',
                              color: 'white',
                              cursor: 'pointer',
                              padding: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '12px'
                            }}
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                    <input
                      type="file"
                      id="addPageInput"
                      accept="image/*"
                      capture="environment"
                      style={{ display: 'none' }}
                      onChange={handleAddPage}
                    />
                    <label
                      htmlFor="addPageInput"
                      style={{
                        width: '60px',
                        height: '60px',
                        border: '2px dashed var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all var(--t-fast)',
                        background: 'var(--surface)'
                      }}
                    >
                      <Plus size={24} color="var(--text-secondary)" />
                    </label>
                  </div>
                </div>
              )}

              <button className="btn btn-primary btn-full" onClick={() => setShowModelSelection(true)}>{t('docScan.uploadAndAnalyze')}</button>
              <button className="btn btn-ghost btn-full" style={{ marginTop: 'var(--space-2)' }} onClick={() => { setPreviews([]); setPages([]) }}>
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
                      <button className="btn btn-primary flex-1" onClick={() => setShowModelSelection(true)} type="button">
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
                    <button className="btn btn-ghost flex-1" onClick={() => { setPhase('capture'); setErrorMsg(null); setPreviews([]); setPages([]) }} type="button">
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
