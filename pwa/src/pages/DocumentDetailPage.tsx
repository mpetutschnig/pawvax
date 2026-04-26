import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getDocument } from '../api/rest'
import { generateICS, downloadBlob } from '../utils/ics'
import { ChevronLeft, Shield, Pill, FileText, PawPrint, Landmark, Calendar, Download, Mail, Tag, Save, X, Edit2 } from 'lucide-react'
import { patchDocument } from '../api/rest'

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
  
  const [tags, setTags] = useState<string[]>([])
  const [editMode, setEditMode] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [saving, setSaving] = useState(false)
  const [visibility, setVisibility] = useState<string[]>([])

  const docTypeConfig: Record<string, { label: string; icon: React.ReactNode }> = {
    vaccination: { label: 'Impfung', icon: <Shield size={20} /> },
    medication: { label: 'Medikament', icon: <Pill size={20} /> },
    other: { label: 'Dokument', icon: <FileText size={20} /> }
  }

  useEffect(() => {
    if (docId) loadDocument()
  }, [docId])

  const loadDocument = async () => {
    try {
      const res = await getDocument(docId!)
      setDoc(res.data)
      setTags(res.data.extracted_json?.suggested_tags || [])
      try {
        setVisibility(res.data.allowed_roles ? JSON.parse(res.data.allowed_roles) : [])
      } catch { setVisibility([]) }
      setError(null)
    } catch (err) {
      setError('Dokument konnte nicht geladen werden')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateReminder = () => {
    setReminderTitle(docTypeConfig[doc?.doc_type]?.label ?? doc?.doc_type ?? 'Dokument')
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

  const handleSaveDoc = async () => {
    setSaving(true)
    try {
      const updates: any = {}
      if (doc.isOwner) updates.allowed_roles = visibility
      if (canEditTags) updates.extracted_json = { ...doc.extracted_json, suggested_tags: tags }
      
      await patchDocument(docId!, updates)
      setEditMode(false)
      loadDocument()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()])
      setNewTag('')
    }
  }

  const removeTag = (t: string) => {
    setTags(tags.filter(x => x !== t))
  }

  if (loading) return <div className="container page" style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}><div className="spinner spinner-lg"></div></div>
  if (error) return <div className="container page"><div className="error-card"><p>{error}</p></div></div>
  if (!doc) return <div className="container page"><div className="error-card"><p>Dokument nicht gefunden</p></div></div>

  const extracted = doc.extracted_json || {}
  const rawText = extracted.rawText || extracted.raw_text || ''
  const config = docTypeConfig[doc.doc_type] || docTypeConfig.other

  const canEditTags = doc.isUploader || doc.added_by_role !== 'vet'
  const canEditVisibility = doc.isOwner

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
        <h2 style={{ margin: 0, paddingRight: '40px', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {config.icon} {config.label}
        </h2>
      </div>

      <div className="card animate-slide-up">
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
          <span className="badge badge-primary">
            {doc.ocr_provider || 'Unbekannt'}
          </span>
          {doc.added_by_role === 'vet' && (
            <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <PawPrint size={12} /> Tierarzt
            </span>
          )}
          {doc.added_by_role === 'authority' && (
            <span className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Landmark size={12} /> Behörde
            </span>
          )}
        </div>

        <p className="text-tertiary" style={{ fontSize: 'var(--font-size-xs)', marginBottom: 'var(--space-4)' }}>
          Hinzugefügt am {new Date(doc.created_at).toLocaleString('de-AT')}
        </p>

        {doc.image_path && (
          <div style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 'var(--space-6)', border: '1px solid var(--border)' }}>
            <img
              src={`/uploads/${doc.image_path.split('/').pop()}`}
              alt="Dokument"
              style={{ width: '100%', display: 'block' }}
            />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
          <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, margin: 0, display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Tag size={18} /> Tags & Freigabe
          </h3>
          {!editMode && (canEditTags || canEditVisibility) && (
            <button className="btn-ghost" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => setEditMode(true)}>
              <Edit2 size={14} /> Bearbeiten
            </button>
          )}
        </div>

        {editMode ? (
          <div style={{ background: 'var(--surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-6)' }}>
            {canEditTags && (
              <div className="form-group">
                <label className="form-label">Tags</label>
                <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', flexWrap: 'wrap' }}>
                  {tags.map(t => (
                    <span key={t} className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {t} <X size={12} style={{ cursor: 'pointer' }} onClick={() => removeTag(t)} />
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <input className="form-input" value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="Neuer Tag..." onKeyDown={e => e.key === 'Enter' && addTag()} />
                  <button className="btn btn-secondary" onClick={addTag}>Add</button>
                </div>
              </div>
            )}
            
            {canEditVisibility && (
              <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                <label className="form-label">Wer darf dieses Dokument sehen?</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {[{ id: 'vet', label: 'Tierarzt' }, { id: 'authority', label: 'Behörde' }, { id: 'readonly', label: 'Lesender Zugriff' }].map(r => (
                    <label key={r.id} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={visibility.includes(r.id)} 
                        onChange={(e) => {
                          if (e.target.checked) setVisibility([...visibility, r.id])
                          else setVisibility(visibility.filter(role => role !== r.id))
                        }} 
                        style={{ width: 16, height: 16, accentColor: 'var(--primary-500)' }}
                      />
                      <span style={{ fontSize: 'var(--font-size-sm)' }}>{r.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
              <button className="btn btn-primary" onClick={handleSaveDoc} disabled={saving}><Save size={16} /> Speichern</button>
              <button className="btn btn-ghost" onClick={() => { setEditMode(false); loadDocument(); }} disabled={saving}>Abbrechen</button>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 'var(--space-6)' }}>
            {tags.length > 0 ? (
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {tags.map(t => <span key={t} className="badge badge-info">{t}</span>)}
              </div>
            ) : (
              <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)' }}>Keine Tags vergeben.</p>
            )}
          </div>
        )}

        {rawText && (
          <>
            <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>OCR-Text</h3>
            <pre
              style={{
                background: 'var(--surface)',
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--font-size-xs)',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '300px',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)'
              }}
            >
              {rawText}
            </pre>
          </>
        )}

        {!rawText && <p className="text-muted" style={{ marginTop: 'var(--space-4)', fontStyle: 'italic' }}>Keine OCR-Daten verfügbar</p>}

        {!reminderMode && (
          <button className="btn btn-primary btn-full" onClick={handleCreateReminder} style={{ marginTop: 'var(--space-6)' }}>
            <Calendar size={18} /> Kalender-Erinnerung erstellen
          </button>
        )}
      </div>

      {reminderMode && (
        <div className="card animate-slide-up" style={{ marginTop: 'var(--space-4)', borderColor: 'var(--primary-200)', background: 'var(--primary-50)' }}>
          <h3 style={{ marginTop: 0, marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Calendar size={20} color="var(--primary-600)" /> Reminder für Kalender
          </h3>

          <div className="form-group">
            <label className="form-label">Titel</label>
            <input className="form-input" value={reminderTitle} onChange={e => setReminderTitle(e.target.value)} placeholder="z.B. Tetanus-Impfung" />
          </div>

          <div className="form-group">
            <label className="form-label">Datum</label>
            <input className="form-input" type="date" value={reminderDate} onChange={e => setReminderDate(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">Notizen</label>
            <textarea
              className="form-input"
              value={reminderNotes}
              onChange={e => setReminderNotes(e.target.value)}
              placeholder="z.B. Auffrischung nötig..."
              style={{ minHeight: '80px', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'grid', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
            <button className="btn btn-primary" onClick={handleDownloadReminder} disabled={!reminderDate}>
              <Download size={18} /> Datei downloaden
            </button>
            <button className="btn btn-secondary" onClick={handleEmailReminder} disabled={!reminderDate}>
              <Mail size={18} /> Per E-Mail senden
            </button>
            <button className="btn btn-ghost" onClick={() => setReminderMode(false)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
