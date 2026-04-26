import { useRef, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, CheckCircle, AlertCircle } from 'lucide-react'
import { uploadDocument } from '../api/ws'

type Phase = 'capture' | 'uploading' | 'analysing' | 'done' | 'error'

export default function DocumentScanPage() {
  const { id: animalId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<Phase>('capture')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [result, setResult] = useState<unknown>(null)
  const [ocrProvider, setOcrProvider] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (phase !== 'analysing') return
    const interval = setInterval(() => setElapsedTime(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [phase])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
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
          if (msg.includes('Tesseract') || msg.includes('tesseract')) setOcrProvider('Tesseract.js')
          if (msg.includes('Gemini') || msg.includes('gemini')) setOcrProvider('Gemini Vision')
        },
        onResult: (data) => {
          setResult(data.data.content)
          setPhase('done')
        },
        onError: (msg) => {
          setErrorMsg(msg)
          setPhase('error')
        }
      })
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unbekannter Fehler')
      setPhase('error')
    }
  }

  return (
    <div className="page">
      <div className="container">
        <div className="nav-bar">
          <button
            onClick={() => navigate(`/animals/${animalId}`)}
            className="btn btn-ghost btn-icon"
            type="button"
          >
            <ChevronLeft size={20} />
          </button>
          <h2 style={{ margin: 0 }}>Dokument scannen</h2>
          <div style={{ width: 40 }} />
        </div>

        {phase === 'capture' && (
          <div className="card">
            <p className="muted">Foto eines Impfpasses, Rezepts oder anderen Tierdokuments</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            {!preview ? (
              <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
                Foto aufnehmen / auswählen
              </button>
            ) : (
              <>
                <img src={preview} alt="Vorschau" style={{ width: '100%', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' }} />
                <button className="btn btn-primary" onClick={handleUpload}>Hochladen & analysieren</button>
                <button className="btn btn-outline" style={{ marginTop: 'var(--space-2)' }} onClick={() => { setPreview(null); setFile(null) }}>
                  Anderes Foto wählen
                </button>
              </>
            )}
          </div>
        )}

        {phase !== 'capture' && (
          <div className="upload-progress-card">
            <div className="stepper">
              <div className={`stepper-step ${phase !== 'capture' ? 'active' : ''}`}>
                <div className="stepper-number">1</div>
                <div className="stepper-label">Hochladen</div>
              </div>
              <div className={`stepper-step ${['analysing', 'done'].includes(phase) ? 'active' : ''}`}>
                <div className="stepper-number">{phase === 'done' ? <CheckCircle size={20} style={{ color: '#ffffff' }} /> : '2'}</div>
                <div className="stepper-label">Analysieren</div>
              </div>
              <div className={`stepper-step ${phase === 'done' ? 'active' : ''}`}>
                <div className="stepper-number">{phase === 'done' ? <CheckCircle size={20} style={{ color: '#ffffff' }} /> : '3'}</div>
                <div className="stepper-label">Fertig</div>
              </div>
            </div>

            {phase === 'uploading' && (
              <div className="upload-progress-content">
                <h3 className="upload-progress-title">Datei wird hochgeladen...</h3>
                <div className="progress-bar" style={{ width: '100%', maxWidth: '200px' }}>
                  <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }} />
                </div>
                <div className="upload-progress-text">{uploadProgress}%</div>
              </div>
            )}

            {phase === 'analysing' && (
              <div className="upload-progress-content">
                <h3 className="upload-progress-title">Dokument wird analysiert...</h3>
                <div className="upload-progress-visual">
                  <div className="spinner" />
                  {ocrProvider && <span className="badge badge-info">{ocrProvider}</span>}
                </div>
                <div className="upload-progress-text">Bitte warten...</div>
                <div className="upload-progress-time">{elapsedTime} Sekunden vergangen</div>
              </div>
            )}

            {phase === 'error' && (
              <div className="upload-progress-content">
                <div style={{ color: 'var(--color-danger)', marginBottom: 'var(--space-3)' }}>
                  <AlertCircle size={48} />
                </div>
                <h3 className="upload-progress-title">Fehler bei der Analyse</h3>
                <p className="upload-progress-text">{errorMsg || 'Ein unbekannter Fehler ist aufgetreten'}</p>
                <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center', marginTop: 'var(--space-4)' }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => { setPhase('capture'); setErrorMsg(null) }}
                    type="button"
                  >
                    Erneut versuchen
                  </button>
                  <button
                    className="btn btn-outline"
                    onClick={() => navigate(`/animals/${animalId}`)}
                    type="button"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            )}

            {phase === 'done' && result && (
              <div>
                <div className="upload-progress-content">
                  <div style={{ color: 'var(--color-success)', marginBottom: 'var(--space-3)' }}>
                    <CheckCircle size={48} />
                  </div>
                  <h3 className="upload-progress-title">Analyse abgeschlossen!</h3>
                  {ocrProvider && <span className="badge badge-success">{ocrProvider}</span>}
                </div>
                <div className="card" style={{ marginTop: 'var(--space-6)' }}>
                  <h3>Erkannter Text</h3>
                  <pre style={{ fontSize: 'var(--font-size-sm)', overflowX: 'auto', background: 'var(--color-surface-2)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
                    {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
                  </pre>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => navigate(`/animals/${animalId}`)}
                  style={{ width: '100%', marginTop: 'var(--space-4)' }}
                  type="button"
                >
                  Zur Dokumentenübersicht
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
