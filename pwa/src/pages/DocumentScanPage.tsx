import { useRef, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, CheckCircle, AlertCircle, Syringe, FileText, Cpu, BookOpen, Camera, RefreshCw } from 'lucide-react'
import { uploadDocument } from '../api/ws'

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
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [docType, setDocType] = useState('vaccination')
  const [phase, setPhase] = useState<Phase>('capture')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [result, setResult] = useState<unknown>(null)
  const [ocrProvider, setOcrProvider] = useState<string | null>(null)
  const [currentStatusMsg, setCurrentStatusMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [allowedRoles, setAllowedRoles] = useState<string[]>(['vet', 'authority', 'readonly'])

  useEffect(() => {
    if (phase !== 'analysing') return
    const interval = setInterval(() => setElapsedTime(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [phase])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    
    try {
      if (window.createImageBitmap) {
        // Nativer, speicherschonender Weg (verhindert oft den iOS Safari "Camera Crash")
        const bmp = await createImageBitmap(f)
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
            setFile(resizedFile)
            setPreview(URL.createObjectURL(resizedFile))
          }
          bmp.close() // Speicher hart freigeben
        }, 'image/jpeg', 0.8)
      } else {
        // Fallback für ältere Browser
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
              setFile(resizedFile)
              setPreview(URL.createObjectURL(resizedFile))
            }
            URL.revokeObjectURL(objectUrl)
          }, 'image/jpeg', 0.8)
        }
        
        img.src = objectUrl
      }
    } catch (err) {
      console.error(err)
      setErrorMsg("Bild konnte nicht verarbeitet werden.")
    }
  }

  async function handleRotate() {
    if (!preview || !file) return
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      // 90 degrees clockwise
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
          const rotatedFile = new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() })
          setFile(rotatedFile)
          setPreview(URL.createObjectURL(rotatedFile))
        }
      }, 'image/jpeg', 0.8)
    }
    img.src = preview
  }

  async function handleUpload() {
    if (!file || !animalId) return
    setPhase('uploading')
    setUploadProgress(0)
    setElapsedTime(0)
    setOcrProvider(null)
    setErrorMsg(null)

    try {
      await uploadDocument(animalId, file, {
        onProgress: (percent) => setUploadProgress(Math.round(percent)),
        onStatus: (msg) => {
          setPhase('analysing')
          setCurrentStatusMsg(msg)
          if (msg.includes('Tesseract') || msg.includes('tesseract')) setOcrProvider('Lokales Tesseract OCR')
          if (msg.includes('Gemini') || msg.includes('gemini') || msg.includes('Google API')) setOcrProvider('Gemini 3.1 Flash-Lite')
        },
        onResult: (data) => {
          setResult(data.data.content)
          setPhase('done')
        },
        onError: (msg) => {
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
      <div className="nav-bar" style={{ margin: 'calc(var(--space-4) * -1) calc(var(--space-4) * -1) var(--space-4) calc(var(--space-4) * -1)' }}>
        <button
          onClick={() => navigate(`/animals/${animalId}`)}
          className="btn-ghost btn-icon"
          type="button"
          style={{ border: 'none', cursor: 'pointer' }}
        >
          <ChevronLeft size={20} />
        </button>
        <h2 style={{ margin: 0, paddingRight: '40px' }}>Dokument scannen</h2>
      </div>

      {phase === 'capture' && (
        <div className="card animate-slide-up">
          <h3 style={{ marginBottom: 'var(--space-3)' }}>Document Type</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            {docTypes.map(type => (
              <button
                key={type.id}
                onClick={() => setDocType(type.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                  padding: 'var(--space-3)',
                  background: docType === type.id ? 'var(--primary-50)' : 'var(--bg-elevated)',
                  border: `1.5px solid ${docType === type.id ? 'var(--primary-400)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  transition: 'all var(--t-fast) var(--ease-out)',
                  color: docType === type.id ? 'var(--primary-600)' : 'var(--text-secondary)',
                  fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--font-size-sm)',
                }}
              >
                {type.icon} {type.label}
              </button>
            ))}
          </div>

          <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>Fotografiere einen Impfpass, ein Rezept oder ein anderes Tierdokument zur automatischen OCR-Erfassung.</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          {!preview ? (
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
                <img src={preview} alt="Vorschau" style={{ width: '100%', borderRadius: 'var(--radius-md)', display: 'block' }} />
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

              <button className="btn btn-primary btn-full" onClick={handleUpload}>Hochladen & analysieren</button>
              <button className="btn btn-ghost btn-full" style={{ marginTop: 'var(--space-2)' }} onClick={() => { setPreview(null); setFile(null) }}>
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
                <button className="btn btn-primary flex-1" onClick={() => { setPhase('capture'); setErrorMsg(null) }} type="button">
                  Try Again
                </button>
                <button className="btn btn-ghost flex-1" onClick={() => navigate(`/animals/${animalId}`)} type="button">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {phase === 'done' && !!result && (
            <div>
              <div style={{ color: 'var(--success-500)', marginBottom: 'var(--space-3)', display: 'flex', justifyContent: 'center' }}>
                <CheckCircle size={48} strokeWidth={1.5} />
              </div>
              <h3 style={{ marginBottom: 'var(--space-2)' }}>Analysis Complete!</h3>
              {ocrProvider && <span className="badge badge-success" style={{ marginBottom: 'var(--space-6)', display: 'inline-flex' }}>{ocrProvider}</span>}
              
              <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', textAlign: 'left', marginBottom: 'var(--space-6)' }}>
                <h4 style={{ margin: '0 0 var(--space-2) 0', fontSize: 'var(--font-size-sm)' }}>Extracted Text</h4>
                <pre style={{ margin: 0, fontSize: 'var(--font-size-xs)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordWrap: 'break-word', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
                </pre>
              </div>
              
              <button className="btn btn-primary btn-full" onClick={() => navigate(`/animals/${animalId}`)} type="button">
                Return to Pet Profile
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
