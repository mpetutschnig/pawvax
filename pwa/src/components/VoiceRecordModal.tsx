import { useRef, useState } from 'react'
import { Mic, Square, Send, RotateCcw, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { uploadVoiceMemo } from '../api/rest'

type RecordingState = 'idle' | 'recording' | 'recorded' | 'uploading' | 'done'

interface Props {
  animalId: string
  onClose: () => void
  onSuccess: () => void
}

export function VoiceRecordModal({ animalId, onClose, onSuccess }: Props) {
  const { t } = useTranslation()
  const [state, setState] = useState<RecordingState>('idle')
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [languageMode, setLanguageMode] = useState('de')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const startRecording = async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunks.current = []
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mr.ondataavailable = e => { if (e.data.size > 0) chunks.current.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(chunks.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        setState('recorded')
      }
      mr.start(200)
      mediaRecorder.current = mr
      setState('recording')
      setSeconds(0)
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
    } catch {
      setError('Mikrofon-Zugriff verweigert. Bitte Berechtigungen prüfen.')
    }
  }

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    mediaRecorder.current?.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
  }

  const resetRecording = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioBlob(null)
    setAudioUrl(null)
    setSeconds(0)
    setState('idle')
  }

  const upload = async () => {
    if (!audioBlob) return
    setState('uploading')
    setError('')
    try {
      const form = new FormData()
      form.append('audio', audioBlob, 'memo.webm')
      form.append('language_mode', languageMode)
      await uploadVoiceMemo(animalId, form)
      setState('done')
      toast.info(t('pending.startedBackground'))
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 800)
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Upload fehlgeschlagen')
      setState('recorded')
    }
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 400, padding: 'var(--space-6)', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 'var(--space-4)', right: 'var(--space-4)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
          <X size={20} />
        </button>

        <h2 style={{ margin: '0 0 var(--space-4)' }}>{t('animal.fabAddVoiceMemo')}</h2>

        {/* Language selection */}
        <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
          <label className="form-label">{t('voiceMemo.language')}</label>
          <select className="form-select" value={languageMode} onChange={e => setLanguageMode(e.target.value)} disabled={state !== 'idle'}>
            <option value="de">{t('voiceMemo.languageDe')}</option>
            <option value="en">{t('voiceMemo.languageEn')}</option>
            <option value="both">{t('voiceMemo.languageBoth')}</option>
          </select>
        </div>

        {/* Recording UI */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4) 0' }}>
          {state === 'idle' && (
            <button onClick={startRecording} style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--primary-500)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-lg)' }}>
              <Mic size={36} />
            </button>
          )}

          {state === 'recording' && (
            <>
              <div style={{ position: 'relative' }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--danger-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--danger-500)', animation: 'pulse 1s infinite' }} />
                </div>
              </div>
              <p style={{ margin: 0, fontVariantNumeric: 'tabular-nums', fontSize: 'var(--font-size-xl)', fontWeight: 600 }}>{fmt(seconds)}</p>
              <button onClick={stopRecording} className="btn btn-danger" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Square size={16} /> {t('voiceMemo.stopRecording')}
              </button>
            </>
          )}

          {state === 'recorded' && audioUrl && (
            <>
              <audio controls src={audioUrl} style={{ width: '100%' }} />
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <button onClick={resetRecording} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <RotateCcw size={16} /> {t('voiceMemo.retry')}
                </button>
                <button onClick={upload} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <Send size={16} /> {t('voiceMemo.send')}
                </button>
              </div>
            </>
          )}

          {state === 'uploading' && (
            <p style={{ margin: 0 }}>{t('voiceMemo.uploading')}</p>
          )}

          {state === 'done' && (
            <p style={{ margin: 0, color: 'var(--success-600)', fontWeight: 500 }}>✓ {t('voiceMemo.statusCompleted')}</p>
          )}

          {state === 'idle' && (
            <p className="text-muted" style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>{t('voiceMemo.startRecording')}</p>
          )}
        </div>

        {error && <div className="error-card" style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)' }}><p style={{ margin: 0 }}>{error}</p></div>}
      </div>
    </div>
  )
}
