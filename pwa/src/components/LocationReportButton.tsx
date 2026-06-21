import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MapPin, Check, Loader2 } from 'lucide-react'
import { sendLocationReport } from '../api/rest'

type Phase = 'idle' | 'locating' | 'form' | 'sending' | 'done' | 'error'

/**
 * Public "I found this pet — send my location" action.
 * Works for any visitor (no login required); optional note/name/contact.
 */
export function LocationReportButton({ animalId, animalName }: { animalId: string; animalName?: string }) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>('idle')
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null)
  const [note, setNote] = useState('')
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const requestLocation = () => {
    if (!('geolocation' in navigator)) {
      setErrorMsg(t('locationReport.noGeolocation'))
      setPhase('error')
      return
    }
    setPhase('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
        setPhase('form')
      },
      () => {
        setErrorMsg(t('locationReport.denied'))
        setPhase('error')
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  const submit = async () => {
    if (!coords) return
    setPhase('sending')
    try {
      await sendLocationReport(animalId, {
        lat: coords.lat,
        lng: coords.lng,
        accuracy_m: coords.accuracy,
        note: note || undefined,
        reporter_name: name || undefined,
        reporter_contact: contact || undefined
      })
      setPhase('done')
    } catch {
      // Endpoint always returns success; only network errors land here
      setErrorMsg(t('locationReport.sendError'))
      setPhase('error')
    }
  }

  if (phase === 'done') {
    return (
      <div style={{ marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--success-50)', border: '1px solid var(--success-500)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--success-700)' }}>
        <Check size={18} /> <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>{t('locationReport.sent')}</span>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      {phase === 'idle' && (
        <button className="btn btn-primary btn-full" onClick={requestLocation} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }}>
          <MapPin size={18} /> {t('locationReport.cta')}
        </button>
      )}

      {phase === 'locating' && (
        <button className="btn btn-primary btn-full" disabled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }}>
          <Loader2 size={18} className="animate-spin" /> {t('locationReport.locating')}
        </button>
      )}

      {phase === 'error' && (
        <div style={{ padding: 'var(--space-3)', background: 'var(--danger-50, #fef2f2)', border: '1px solid var(--danger-300, #fca5a5)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', color: 'var(--danger-700, #b91c1c)' }}>
          {errorMsg}
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 'var(--space-2)' }} onClick={() => setPhase('idle')}>{t('common.retry')}</button>
        </div>
      )}

      {(phase === 'form' || phase === 'sending') && (
        <div style={{ padding: 'var(--space-3)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>{t('locationReport.formTitle', { name: animalName || '' })}</p>
          <p className="text-muted" style={{ margin: 0, fontSize: 'var(--font-size-xs)' }}>{t('locationReport.privacyHint')}</p>
          <textarea className="form-input" rows={2} placeholder={t('locationReport.notePlaceholder')} value={note} onChange={e => setNote(e.target.value)} maxLength={500} />
          <input className="form-input" placeholder={t('locationReport.namePlaceholder')} value={name} onChange={e => setName(e.target.value)} maxLength={120} />
          <input className="form-input" placeholder={t('locationReport.contactPlaceholder')} value={contact} onChange={e => setContact(e.target.value)} maxLength={120} />
          <button className="btn btn-primary btn-full" onClick={submit} disabled={phase === 'sending'} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }}>
            {phase === 'sending' ? <Loader2 size={18} className="animate-spin" /> : <MapPin size={18} />} {t('locationReport.send')}
          </button>
        </div>
      )}
    </div>
  )
}
