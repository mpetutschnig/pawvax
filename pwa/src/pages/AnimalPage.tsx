import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getAnimal, getAnimalDocuments, getAnimalTags, updateAnimal, deleteAnimal, uploadAnimalAvatar } from '../api/rest'
import { PageHeader } from '../components/PageHeader'
import { PawPrint, Cat, ArrowLeft, Edit2, Trash2, Tag, Lock, Camera, Search, Syringe, FileText, Radio, CheckCircle, ShieldAlert } from 'lucide-react'

interface Animal {
  id: string; name: string; species: string; breed?: string; birthdate?: string;
  avatar_path?: string; dynamic_fields?: string; avatar_base64?: string;
}
interface AnimalTag {
  tag_id: string; tag_type: string; active: number; added_at: string
}
interface Document {
  id: string; doc_type: string; created_at: string; ocr_provider: string; added_by_role?: string
}

const docTypeLabel: Record<string, string> = { vaccination: 'Vaccination', medication: 'Medication', other: 'Document' }

export default function AnimalPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [animal, setAnimal] = useState<Animal | null>(null)
  const [tags, setTags] = useState<AnimalTag[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<Animal | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [documentSearch, setDocumentSearch] = useState('')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const myRoles: string[] = JSON.parse(localStorage.getItem('roles') || '[]')
  const isReadOnly = myRoles.length === 1 && myRoles[0] === 'readonly'

  useEffect(() => {
    if (!id) return
    Promise.all([getAnimal(id), getAnimalDocuments(id), getAnimalTags(id)])
      .then(([a, d, t]) => {
        setAnimal(a.data)
        setEditData(a.data)
        setDocuments(d.data)
        setTags(t.data)
      })
      .catch(() => setError('Tier nicht gefunden'))
      .finally(() => setLoading(false))
  }, [id])

  const handleEdit = async () => {
    if (!editData || !id) return
    try {
      setSubmitting(true)
      await updateAnimal(id, {
        name: editData.name,
        species: editData.species,
        breed: editData.breed || null,
        birthdate: editData.birthdate || null
      })
      setAnimal(editData)
      setEditing(false)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Fehler beim Speichern')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!id || !window.confirm('Bist du sicher, dass du dieses Tier löschen möchtest?')) return
    try {
      setSubmitting(true)
      await deleteAnimal(id)
      navigate('/animals')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Fehler beim Löschen')
      setSubmitting(false)
    }
  }

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = (event) => {
        const img = new Image()
        img.src = event.target?.result as string
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const maxSize = 512
          let width = img.width
          let height = img.height

          if (width > height) {
            if (width > maxSize) {
              height *= maxSize / width
              width = maxSize
            }
          } else {
            if (height > maxSize) {
              width *= maxSize / height
              height = maxSize
            }
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx?.drawImage(img, 0, 0, width, height)

          // Compress to JPEG with quality 0.75
          const compressed = canvas.toDataURL('image/jpeg', 0.75)
          resolve(compressed)
        }
        img.onerror = () => reject(new Error('Fehler beim Laden des Bildes'))
      }
      reader.onerror = () => reject(new Error('Fehler beim Lesen der Datei'))
    })
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !id) return

    setUploadingAvatar(true)
    try {
      const compressed = await compressImage(file)
      await uploadAnimalAvatar(id, compressed)
      const res = await getAnimal(id)
      setAnimal(res.data)
      setError(null)
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Fehler beim Hochladen des Avatars')
    } finally {
      setUploadingAvatar(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
  }

  if (loading) return <div className="container page" style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}><div className="spinner spinner-lg"></div></div>
  if (error || !animal) return <div className="container page"><div className="error-card"><p>{error}</p></div></div>

  const hasNfcTag = tags.some(t => t.tag_type === 'nfc' && t.active === 1)
  const isVetVerified = false // Placeholder for future implementation

  return (
    <div className="container page">
      <PageHeader title={animal.name} backTo="/animals" showThemeToggle />

      {error && <div className="error-card"><p>{error}</p></div>}

      {!editing ? (
        <>
          <div style={{
            borderRadius: 'var(--radius-xl)',
            background: 'linear-gradient(135deg, var(--primary-500), var(--primary-700))',
            padding: 'var(--space-5)',
            marginBottom: 'var(--space-4)',
            boxShadow: 'var(--shadow-lg)',
          }}>
            <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
              <div style={{ position: 'relative' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 'var(--radius-lg)',
                  background: 'oklch(100% 0 0 / 0.18)',
                  border: '1.5px solid oklch(100% 0 0 / 0.28)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                  cursor: 'pointer', transition: 'opacity 0.2s'
                }} onClick={() => avatarInputRef.current?.click()}>
                  {animal.avatar_path ? (
                    <img src={`/uploads/${animal.avatar_path.split('/').pop()}`} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    animal.species === 'cat' ? <Cat size={28} color="white" strokeWidth={1.6} /> : <PawPrint size={28} color="white" strokeWidth={1.6} />
                  )}
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleAvatarUpload}
                  disabled={uploadingAvatar}
                />
                {uploadingAvatar && (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="spinner spinner-sm" style={{ width: 20, height: 20 }}></div>
                  </div>
                )}
              </div>
              <div>
                <h2 style={{ color: 'white', margin: 0, fontFamily: 'var(--font-display)' }}>{animal.name}</h2>
                <p style={{ color: 'oklch(100% 0 0 / 0.70)', margin: 0, fontSize: 'var(--font-size-sm)' }}>
                  {animal.breed} {animal.birthdate ? `· ${new Date().getFullYear() - new Date(animal.birthdate).getFullYear()} Jahre` : ''}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: animal.dynamic_fields ? 'var(--space-3)' : 0 }}>
              {isVetVerified && (
                <span style={{ background: 'oklch(100% 0 0 / 0.15)', border: '1px solid oklch(100% 0 0 / 0.22)', borderRadius: 'var(--radius-full)', padding: '3px 10px', fontSize: 11, fontWeight: 600, color: 'white' }}>
                  Vet Verified
                </span>
              )}
              {hasNfcTag && (
                <span style={{ background: 'oklch(100% 0 0 / 0.15)', border: '1px solid oklch(100% 0 0 / 0.22)', borderRadius: 'var(--radius-full)', padding: '3px 10px', fontSize: 11, fontWeight: 600, color: 'white' }}>
                  NFC Active
                </span>
              )}
            </div>
            
            {animal.dynamic_fields && (() => {
              try {
                const df = JSON.parse(animal.dynamic_fields);
                return Object.entries(df).map(([k, v]) => (
                  <div key={k} style={{ color: 'white', fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-1)' }}>
                    <strong>{k}:</strong> {String(v)}
                  </div>
                ))
              } catch { return null; }
            })()}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <button className="btn btn-secondary" onClick={() => setEditing(true)}><Edit2 size={16} /> Bearbeiten</button>
            <button className="btn btn-outline" onClick={handleDelete} disabled={submitting} style={{ borderColor: 'var(--danger-500)', color: 'var(--danger-500)' }}><Trash2 size={16} /> Löschen</button>
            <Link to={`/animals/${id}/tags`} className="btn btn-ghost" style={{ textDecoration: 'none' }}>
              <Tag size={16} /> Tags
            </Link>
            <Link to={`/animals/${id}/sharing`} className="btn btn-ghost" style={{ textDecoration: 'none' }}>
              <Lock size={16} /> Freigaben
            </Link>
          </div>
          <Link to={`/animals/${id}/scan`} className="btn btn-primary btn-full" style={{ marginBottom: 'var(--space-6)' }}>
            <Camera size={18} /> Dokument scannen
          </Link>
        </>
      ) : (
        <div className="card animate-slide-up">
          <h3 style={{ marginBottom: 'var(--space-4)' }}>Daten bearbeiten</h3>
          <form>
            <div className="form-group">
              <label className="form-label">Name</label>
              <input
                className="form-input"
                type="text"
                value={editData?.name || ''}
                onChange={(e) => setEditData({ ...editData!, name: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Tierart</label>
              <select
                className="form-select"
                value={editData?.species || 'dog'}
                onChange={(e) => setEditData({ ...editData!, species: e.target.value })}
              >
                <option value="dog">Hund</option>
                <option value="cat">Katze</option>
                <option value="other">Sonstiges</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Rasse (optional)</label>
              <input
                className="form-input"
                type="text"
                value={editData?.breed || ''}
                onChange={(e) => setEditData({ ...editData!, breed: e.target.value })}
                placeholder="z.B. Golden Retriever"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Geburtsdatum (optional)</label>
              <input
                type="date"
                className="form-input"
                value={editData?.birthdate || ''}
                onChange={(e) => setEditData({ ...editData!, birthdate: e.target.value })}
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Profilbild (optional)</label>
              <input
                type="file"
                accept="image/*"
                className="form-input"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => setEditData({ ...editData!, avatar_base64: ev.target?.result as string });
                    reader.readAsDataURL(file);
                  }
                }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Dynamische Felder (JSON Format)</label>
              <textarea
                className="form-input"
                rows={3}
                placeholder={'{"Instagram": "@bella", "Chip": "1234"}'}
                value={editData?.dynamic_fields || ''}
                onChange={(e) => setEditData({ ...editData!, dynamic_fields: e.target.value })}
              />
              <p className="text-muted" style={{ fontSize: '11px', marginTop: 'var(--space-1)' }}>Erlaubt beliebige Key-Value Paare.</p>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
              <button type="button" className="btn btn-primary flex-1" onClick={handleEdit} disabled={submitting}>
                {submitting ? 'Speichert...' : 'Speichern'}
              </button>
              <button type="button" className="btn btn-ghost flex-1" onClick={() => { setEditing(false); setEditData(animal) }} disabled={submitting}>
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      )}

      {tags.length > 0 && (
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <h3 style={{ marginBottom: 'var(--space-3)' }}>IDs ({tags.length})</h3>
          {tags.map(tag => (
            <div key={tag.tag_id} className="card card-sm" style={{ marginBottom: 'var(--space-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', justifyContent: 'space-between' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: '4px' }}>
                    {tag.tag_type === 'barcode' ? <Radio size={16} color="var(--primary-500)" /> : <Tag size={16} color="var(--primary-500)" />}
                    <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', wordBreak: 'break-all' }}>
                      {tag.tag_id}
                    </span>
                  </div>
                  <p className="text-muted" style={{ margin: 0, fontSize: '12px' }}>
                    {tag.tag_type === 'barcode' ? 'Barcode' : 'NFC'}
                  </p>
                </div>
                {tag.active === 1 ? (
                  <span className="badge badge-success"><span className="badge-dot"></span>Aktiv</span>
                ) : (
                  <span className="badge badge-danger">Inaktiv</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ marginBottom: 'var(--space-3)' }}>Dokumente ({documents.length})</h3>
      {documents.length === 0 && <p className="text-muted text-center" style={{ padding: 'var(--space-4) 0' }}>Noch keine Dokumente. Scanne das erste Dokument!</p>}
      
      {documents.length > 0 && (
        <div style={{ position: 'relative', marginBottom: 'var(--space-4)' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input
            className="form-input"
            style={{ paddingLeft: 38 }}
            type="text"
            placeholder="Dokumente durchsuchen..."
            value={documentSearch}
            onChange={e => setDocumentSearch(e.target.value.toLowerCase())}
          />
        </div>
      )}
      
      {documents
        .filter(doc => !documentSearch || docTypeLabel[doc.doc_type]?.toLowerCase().includes(documentSearch) || new Date(doc.created_at).toLocaleString('de-AT').includes(documentSearch))
        .map(doc => (
        <Link key={doc.id} to={`/animals/${id}/documents/${doc.id}`} style={{ textDecoration: 'none' }}>
          <div className="card card-sm" style={{ 
            display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)',
            border: doc.added_by_role === 'vet' ? '1.5px solid var(--success-500)' : undefined,
            background: doc.added_by_role === 'vet' ? 'var(--success-50)' : 'var(--bg-elevated)',
            boxShadow: doc.added_by_role === 'vet' ? '0 4px 12px rgba(16, 185, 129, 0.1)' : undefined
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 'var(--radius-sm)', flexShrink: 0,
              background: doc.added_by_role === 'vet' ? 'var(--success-100)' : 'var(--primary-50)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {doc.doc_type === 'vaccination' ? <Syringe size={16} color={doc.added_by_role === 'vet' ? "var(--success-600)" : "var(--primary-600)"} strokeWidth={2} /> : <FileText size={16} color={doc.added_by_role === 'vet' ? "var(--success-600)" : "var(--primary-600)"} strokeWidth={2} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>{docTypeLabel[doc.doc_type] ?? doc.doc_type}</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
                {new Date(doc.created_at).toLocaleString('de-AT')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '4px', flexDirection: 'column', alignItems: 'flex-end' }}>
              {doc.added_by_role === 'vet' && <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><CheckCircle size={10} /> Tierarzt</span>}
              {doc.added_by_role === 'authority' && <span className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><ShieldAlert size={10} /> Behörde</span>}
              {!['vet', 'authority'].includes(doc.added_by_role ?? '') && <span className="badge" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px' }}>Besitzer</span>}
              <span className="text-muted" style={{ fontSize: '10px' }}>{doc.ocr_provider}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}
