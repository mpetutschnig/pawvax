import { useRef, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CheckCircle, AlertCircle, Syringe, FileText, Cpu, BookOpen, Camera, RefreshCw, Plus, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { uploadMultiPageDocument } from '../api/ws'
import { patchDocument } from '../api/rest'

type Phase = 'capture' | 'uploading' | 'analysing' | 'done' | 'error'

const docTypes = [
  { id: 'vaccination', label: 'Vaccination', icon: <Syringe size={14} /> },
  { id: 'report',      label: 'Vet Report',  icon: <FileText size={14} /> },
  { id: 'microchip',   label: 'Microchip',   icon: <Cpu size={14} /> },
  { id: 'passport',    label: 'Passport',    icon: <BookOpen size={14} /> },
];

export default function DocumentScanPage() {
  const { id: animalId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // Readonly-User dürfen keine Dokumente hochladen
  const myRoles: string[] = JSON.parse(localStorage.getItem('roles') || '[]')
  const isReadOnly = myRoles.length > 0 && myRoles.every(r => r === 'readonly')
  if (isReadOnly) {
    return (
      <div className="container page">
        <div className="error-card" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
          <p style={{ fontWeight: 600 }}>Kein Zugriff</p>
          <p className="text-muted">Lesende Benutzer dürfen keine Dokumente hochladen.</p>
          <button className="btn btn-ghost" onClick={() => navigate(-1)}>Zurück</button>
        </div>
      </div>
    )
  }

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
  const [allowedRoles, setAllowedRoles] = useState<string[]>(['vet', 'authority', 'readonly'])
  const [suggestedType, setSuggestedType] = useState<string | null>(null)
  const [documentId, setDocumentId] = useState<string | null>(null)
  const [savingDocType, setSavingDocType] = useState(false)

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
        } else {
          const objectUrl = URL.createObjectURL(f)
          const img = new Image()

          img.onload = () => {
            const canvas = document.createElement('canvas')
            const MAX_WIDTH = 1200
            const MAX_HEIGHT = 1200
            let width = img.width
            let height = img.height

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
            ctx?.drawImage(img, 0, 0, width, height)

            canvas.toBlob((blob) => {
              if (blob) {
                const resizedFile = new File([blob], f.name, { type: 'image/jpeg', lastModified: Date.now() })
                resolve({ file: resizedFile, preview: URL.createObjectURL(resizedFile) })
              }
              URL.revokeObjectURL(objectUrl)
            }, 'image/jpeg', 0.8)
          }

          img.onerror = reject
          img.src = objectUrl
        }
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
      setErrorMsg("Bild konnte nicht verarbeitet werden.")
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
      setErrorMsg("Seite konnte nicht hinzugefügt werden.")
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

  async function handleUpload() {
    if (pages.length === 0 || !animalId) return
    setPhase('uploading')
    setUploadProgress(0)
    setElapsedTime(0)
    setOcrProvider(null)
    setErrorMsg(null)

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
          setResult(data.data)
          setSuggestedType(data.data.suggestedType || 'other')
          setDocumentId(data.data.documentId)
          setOcrProvider(data.data.ocrProvider || 'unknown')

          // If analysis failed (pending_analysis), show error instead of done
          if (data.data.analysisStatus === 'pending_analysis') {
            setErrorMsg('⚠️ Gemini API Quota überschritten. Dokument gespeichert. Versuchen Sie später erneut.')
            setPhase('error')
          } else {
            setPhase('done')
          }
        },
        onError: (msg: string) => {
          setErrorMsg(msg)
          setPhase('error')
        },
        metadata: { allowedRoles }
      })
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unbekannter Fehler')
      setPhase('error')
    }
  }

  return (
    <div className="container page">
      <PageHeader title="Dokument scannen" backTo={`/animals/${animalId}`} showThemeToggle />

      {phase === 'capture' && (
        <div className="card animate-slide-up">
          <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>Fotografiere einen Impfpass, ein Rezept oder ein anderes Tierdokument zur automatischen OCR-Erfassung.</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          {previews.length === 0 ? (
            <div 
              style={{ 
                border: '2px dashed var(--border)', 
                borderRadius: 'var(--radius-lg)', 
                padding: 'var(--space-8) var(--space-4)',
                textAlign: 'center',
                cursor: 'pointer',
                marginBottom: 'var(--space-4)',
                background: 'var(--surface)'
              }}
              onClick={() => fileRef.current?.click()}
            >
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--primary-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-3)' }}>
                <Camera size={24} color="var(--primary-500)" />
              </div>
              <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 var(--space-1) 0' }}>Dokument fotografieren</p>
              <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--text-tertiary)' }}>oder Datei/Bild auswählen</p>
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
                  title="Bild drehen"
                >
                  <RefreshCw size={20} color="var(--primary-600)" />
                </button>
              </div>
              
              <div style={{ marginBottom: 'var(--space-4)', textAlign: 'left' }}>
                <label className="form-label">Wer darf dieses Dokument sehen?</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {[{ id: 'vet', label: 'Tierarzt' }, { id: 'authority', label: 'Behörde' }, { id: 'readonly', label: 'Lesender Zugriff' }].map(r => (
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
                    Seiten: {previews.length}
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

              <button className="btn btn-primary btn-full" onClick={handleUpload}>Hochladen & analysieren</button>
              <button className="btn btn-ghost btn-full" style={{ marginTop: 'var(--space-2)' }} onClick={() => { setPreviews([]); setPages([]) }}>
                Anderes Foto wählen
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
              <div className="stepper-label">Upload</div>
            </div>
            <div className={`stepper-step ${['analysing', 'done'].includes(phase) ? 'active' : ''}`}>
              <div className="stepper-number">{phase === 'done' ? <CheckCircle size={16} color="white" /> : '2'}</div>
              <div className="stepper-label">Analyse</div>
            </div>
            <div className={`stepper-step ${phase === 'done' ? 'active' : ''}`}>
              <div className="stepper-number">{phase === 'done' ? <CheckCircle size={16} color="white" /> : '3'}</div>
              <div className="stepper-label">Fertig</div>
            </div>
          </div>

          {phase === 'uploading' && (
            <div>
              <h3 style={{ marginBottom: 'var(--space-4)' }}>Dokument wird hochgeladen...</h3>
              <div className="progress-bar" style={{ width: '100%', maxWidth: '240px', margin: '0 auto var(--space-3)' }}>
                <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }} />
              </div>
              <div className="text-muted" style={{ fontWeight: 600 }}>{uploadProgress}%</div>
            </div>
          )}

          {phase === 'analysing' && (
            <div>
              <h3 style={{ marginBottom: 'var(--space-4)' }}>Dokument wird analysiert...</h3>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                <div className="spinner"></div>
                {ocrProvider && <span className="badge badge-info">{ocrProvider}</span>}
              </div>
              <div className="text-muted" style={{ fontSize: 'var(--font-size-sm)', padding: '0 var(--space-4)', wordBreak: 'break-word', minHeight: '40px' }}>
                {currentStatusMsg || 'Bitte warten...'}
              </div>
              <div className="text-tertiary" style={{ fontSize: 'var(--font-size-xs)', marginTop: 'var(--space-2)' }}>{elapsedTime} Sekunden vergangen</div>
            </div>
          )}

          {phase === 'error' && (
            <div>
              <div style={{ color: 'var(--danger-500)', marginBottom: 'var(--space-3)', display: 'flex', justifyContent: 'center' }}>
                <AlertCircle size={48} strokeWidth={1.5} />
              </div>
              <h3 style={{ marginBottom: 'var(--space-2)' }}>Analysis Failed</h3>
              <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>{errorMsg || 'An unknown error occurred'}</p>
              <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                <button className="btn btn-primary flex-1" onClick={() => navigate(`/animals/${animalId}`)} type="button">
                  Für später speichern
                </button>
                <button className="btn btn-ghost flex-1" onClick={() => { setPhase('capture'); setErrorMsg(null); setPreviews([]); setPages([]) }} type="button">
                  Erneut versuchen
                </button>
              </div>
            </div>
          )}

          {phase === 'done' && !!result && (
            <div>
              <div style={{ color: 'var(--success-500)', marginBottom: 'var(--space-3)', display: 'flex', justifyContent: 'center' }}>
                <CheckCircle size={48} strokeWidth={1.5} />
              </div>
              <h3 style={{ marginBottom: 'var(--space-4)' }}>Analysis Complete!</h3>

              {(ocrProvider || currentStatusMsg) && (
                <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-6)', borderLeft: ocrProvider?.includes('Quota') ? '4px solid var(--danger-500)' : '4px solid var(--success-500)' }}>
                  {ocrProvider && <div style={{ display: 'inline-flex', marginBottom: 'var(--space-2)' }}><span className={`badge ${ocrProvider?.includes('Quota') ? 'badge-danger' : 'badge-success'}`}>{ocrProvider}</span></div>}
                  {currentStatusMsg && <p style={{ margin: '0', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>{currentStatusMsg}</p>}
                </div>
              )}

              {suggestedType && (
                <div style={{ background: 'var(--primary-50)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-6)', borderLeft: '4px solid var(--primary-500)' }}>
                  <h4 style={{ margin: '0 0 var(--space-3) 0', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>Document Type</h4>
                  <p style={{ margin: '0 0 var(--space-3) 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                    {ocrProvider?.includes('Tesseract') ? 'Tesseract detected' : 'AI analyzed'}: <strong style={{ color: 'var(--text-primary)' }}>{docTypes.find(t => t.id === suggestedType)?.label || suggestedType}</strong>
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
                        setErrorMsg(err instanceof Error ? err.message : 'Error saving document type')
                      } finally {
                        setSavingDocType(false)
                      }
                    }}
                  >
                    {savingDocType ? 'Saving...' : 'Confirm & Save'}
                  </button>
                </div>
              )}

              <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', textAlign: 'left', marginBottom: 'var(--space-6)' }}>
                <h4 style={{ margin: '0 0 var(--space-2) 0', fontSize: 'var(--font-size-sm)' }}>Extracted Text</h4>
                <pre style={{ margin: 0, fontSize: 'var(--font-size-xs)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordWrap: 'break-word', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
                </pre>
              </div>

              <button className="btn btn-ghost btn-full" onClick={() => navigate(`/animals/${animalId}`)} type="button">
                Back to Pet Profile
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
