import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getDocument } from '../api/rest'
import { generateICS, downloadBlob } from '../utils/ics'

const docTypeLabel: Record<string, string> = {
  vaccination: '🛡️ Impfung',
  medication: '💊 Medikament',
  other: '📄 Dokument'
}

export default function DocumentDetailPage() {
  const { id: animalId, docId } = useParams<{ id: string; docId: string }>()
  const navigate = useNavigate()
  const [doc, setDoc] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reminderMode, setReminderMode] = useState(false)
  const [reminderTitle, setReminderTitle] = useState('')
  const [reminderDate, setReminderDate] = useState('')
  const [reminderNotes, setReminderNotes] = useState('')

  useEffect(() => {
    if (docId) loadDocument()
  }, [docId])

  const loadDocument = async () => {
    try {
      const res = await getDocument(docId!)
      setDoc(res.data)
      setError(null)
    } catch (err) {
      setError('Dokument konnte nicht geladen werden')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateReminder = () => {
    if (!doc?.extracted_json?.rawText) {
      setError('Kein OCR-Text verfügbar')
      return
    }
    setReminderTitle(docTypeLabel[doc.doc_type] ?? doc.doc_type)
    setReminderMode(true)
  }

  const handleDownloadReminder = () => {
    const ics = generateICS({
      title: reminderTitle,
      date: reminderDate,
      description: reminderNotes
    })
    downloadBlob(ics, 'reminder.ics', 'text/calendar')
    setReminderMode(false)
    setReminderTitle('')
    setReminderDate('')
    setReminderNotes('')
  }

  const handleEmailReminder = () => {
    const userEmail = localStorage.getItem('userEmail') || 'selbst'
    const subject = encodeURIComponent(`PAW Reminder: ${reminderTitle}`)
    const body = encodeURIComponent(`Titel: ${reminderTitle}\nDatum: ${reminderDate}\n\n${reminderNotes}`)
    window.open(`mailto:${userEmail}?subject=${subject}&body=${body}`)
  }

  if (loading) return <div className="container"><p>Laden...</p></div>
  if (error) return <div className="container"><p className="error">{error}</p></div>
  if (!doc) return <div className="container"><p className="error">Dokument nicht gefunden</p></div>

  const extracted = doc.extracted_json || {}
  const rawText = extracted.rawText || extracted.raw_text || ''

  return (
    <div className="container">
      <div className="nav-bar">
        <button
          onClick={() => navigate(`/animals/${animalId}`)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem' }}
        >
          ←
        </button>
        <h2>{docTypeLabel[doc.doc_type] ?? doc.doc_type}</h2>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <span className="badge" style={{ background: 'var(--primary)', color: 'white' }}>
            {doc.ocr_provider || 'Unbekannt'}
          </span>
          {doc.added_by_role === 'vet' && (
            <span className="badge" style={{ background: '#10b981', color: 'white' }}>
              🐾 Tierarzt
            </span>
          )}
          {doc.added_by_role === 'authority' && (
            <span className="badge" style={{ background: '#3b82f6', color: 'white' }}>
              🐾 Behörde
            </span>
          )}
        </div>

        <p className="muted" style={{ fontSize: '0.85rem' }}>
          {new Date(doc.created_at).toLocaleString('de-AT')}
        </p>

        {doc.image_path && (
          <img
            src={`/uploads/${doc.image_path.split('/').pop()}`}
            alt="Dokument"
            style={{ width: '100%', maxWidth: '300px', borderRadius: '8px', marginTop: '1rem', marginBottom: '1rem' }}
          />
        )}

        {rawText && (
          <>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '1.5rem' }}>OCR-Text</h3>
            <pre
              style={{
                background: '#f8fafc',
                padding: '1rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '300px'
              }}
            >
              {rawText}
            </pre>

            {(doc.doc_type === 'vaccination' || doc.doc_type === 'medication') && (
              <button className="btn btn-primary" onClick={handleCreateReminder} style={{ marginTop: '1rem' }}>
                📅 Reminder erstellen
              </button>
            )}
          </>
        )}

        {!rawText && <p className="muted" style={{ marginTop: '1rem' }}>Keine OCR-Daten verfügbar</p>}
      </div>

      {reminderMode && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>Reminder für Kalender</h3>

          <label>Titel</label>
          <input value={reminderTitle} onChange={e => setReminderTitle(e.target.value)} placeholder="z.B. Tetanus-Impfung" />

          <label>Datum</label>
          <input type="date" value={reminderDate} onChange={e => setReminderDate(e.target.value)} />

          <label>Notizen</label>
          <textarea
            value={reminderNotes}
            onChange={e => setReminderNotes(e.target.value)}
            placeholder="z.B. Auffrischung nötig..."
            style={{ minHeight: '80px' }}
          />

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={handleDownloadReminder} disabled={!reminderDate}>
              📥 Datei downloaden
            </button>
            <button className="btn btn-outline" onClick={handleEmailReminder} disabled={!reminderDate}>
              📧 Per E-Mail senden
            </button>
            <button className="btn btn-outline" onClick={() => setReminderMode(false)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
