import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBarcode } from '../hooks/useBarcode'
import { useNfc } from '../hooks/useNfc'
import { PawPrint, Camera, LogIn, ShieldCheck, Syringe, Radio } from 'lucide-react'
import axios from 'axios'

type Phase = 'scan' | 'result' | 'notfound'

export default function PublicScanPage() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('scan')
  const [animal, setAnimal] = useState<any>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [nfcError, setNfcError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [scanMode, setScanMode] = useState<'barcode' | 'nfc' | null>(null)

  const handleTag = useCallback(async (rawTagId: string) => {
    setLoading(true)
    let tagId = rawTagId.trim()
    try {
      const url = new URL(tagId)
      const parts = url.pathname.split('/')
      tagId = parts[parts.length - 1]
    } catch { /* keine URL */ }

    try {
      const res = await axios.get(`/api/public/tag/${encodeURIComponent(tagId)}`)
      setAnimal(res.data)
      setPhase('result')
      stopBarcode()
    } catch {
      setPhase('notfound')
      stopBarcode()
    } finally {
      setLoading(false)
    }
  }, [])

  const handleBarcode = useCallback((code: string) => handleTag(code), [handleTag])
  const { start: startBarcode, stop: stopBarcode } = useBarcode('public-barcode-reader', handleBarcode, setCameraError)

  const handleNfc = useCallback((tagId: string) => handleTag(tagId), [handleTag])
  const { start: startNfc, stop: stopNfc } = useNfc(handleNfc, setNfcError)

  const speciesEmoji: Record<string, string> = { dog: '🐶', cat: '🐱', other: '🐾' }

  if (phase === 'result' && animal) {
    // Wenn Tier existiert aber nicht öffentlich freigegeben
    if (!animal.is_public) {
      return (
        <div className="container page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
          <div className="card animate-slide-up" style={{ textAlign: 'center', padding: 'var(--space-8)', maxWidth: 480 }}>
            <div style={{ fontSize: '2rem', marginBottom: 'var(--space-4)' }}>🔒</div>
            <h2 style={{ marginBottom: 'var(--space-2)' }}>{animal.name}</h2>
            <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>
              Dieses Tier hat keine freigegebenen Daten. Melden dich an, um mehr zu erfahren.
            </p>
            <button className="btn btn-primary btn-full" onClick={() => navigate('/login')}>
              <LogIn size={16} /> Anmelden
            </button>
            <button className="btn btn-ghost btn-full" style={{ marginTop: 'var(--space-2)' }} onClick={() => { setPhase('scan'); setAnimal(null) }}>
              Zurück zum Scanner
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="container page" style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="card animate-slide-up" style={{ padding: 'var(--space-6)' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 80, height: 80, borderRadius: '50%',
              background: 'var(--primary-50)', fontSize: '2.5rem',
              marginBottom: 'var(--space-3)'
            }}>
              {speciesEmoji[animal.species] ?? '🐾'}
            </div>
            <h1 style={{ margin: '0 0 4px 0', fontSize: 'var(--font-size-xl)' }}>{animal.name}</h1>
            <p className="text-muted" style={{ margin: 0 }}>
              {animal.species} {animal.breed ? `· ${animal.breed}` : ''} {animal.birthdate ? `· geb. ${animal.birthdate}` : ''}
            </p>
          </div>

          {/* Readonly-Hinweis */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            padding: 'var(--space-3)', background: 'var(--success-50)',
            borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)',
            border: '1px solid var(--success-200)'
          }}>
            <ShieldCheck size={18} color="var(--success-600)" />
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--success-800)' }}>
              Öffentliches Profil – nur freigegebene Daten
            </span>
          </div>

          {/* Kontakt */}
          {animal.contact && (
            <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--surface)', borderRadius: 'var(--radius-md)' }}>
              <div className="text-muted" style={{ fontSize: 'var(--font-size-xs)', marginBottom: 4 }}>Kontakt</div>
              <div style={{ fontWeight: 600 }}>{animal.contact.name}</div>
            </div>
          )}

          {/* Impfungen */}
          {animal.vaccinations && animal.vaccinations.length > 0 && (
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <h3 style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Syringe size={18} /> Impfungen ({animal.vaccinations.length})
              </h3>
              {animal.vaccinations.map((doc: any) => (
                <div key={doc.id} className="card card-sm" style={{ marginBottom: 'var(--space-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>Impfung</span>
                  <span className="text-muted" style={{ fontSize: 'var(--font-size-xs)' }}>
                    {new Date(doc.created_at).toLocaleDateString('de-AT')}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* No vaccinations message */}
          {(!animal.vaccinations || animal.vaccinations.length === 0) && (
            <div style={{
              padding: 'var(--space-4)', background: 'var(--surface)',
              borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)',
              textAlign: 'center'
            }}>
              <p className="text-muted" style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>
                Keine freigegebenen Impfdaten vorhanden.
              </p>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'grid', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            <button className="btn btn-primary" onClick={() => navigate('/login')}>
              <LogIn size={18} /> Anmelden für mehr Details
            </button>
            <button className="btn btn-ghost" onClick={() => { setPhase('scan'); setAnimal(null) }}>
              Erneut scannen
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'notfound') {
    return (
      <div className="container page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
        <div className="card animate-slide-up" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>❓</div>
          <h2 style={{ marginBottom: 'var(--space-2)' }}>Tier nicht gefunden</h2>
          <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>
            Dieser Tag ist noch keinem Tier zugeordnet oder hat kein öffentliches Profil.
          </p>
          <button className="btn btn-ghost" onClick={() => setPhase('scan')}>Zurück zum Scanner</button>
          <button className="btn btn-primary" style={{ marginTop: 'var(--space-2)' }} onClick={() => navigate('/login')}>
            <LogIn size={16} /> Anmelden & Tier registrieren
          </button>
        </div>
      </div>
    )
  }

  // Scan-Phase
  return (
    <div className="container page" style={{ maxWidth: 480, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)', paddingTop: 'var(--space-4)' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: 'var(--primary-50)', marginBottom: 'var(--space-3)' }}>
          <PawPrint size={28} color="var(--primary-500)" />
        </div>
        <h1 style={{ margin: '0 0 4px 0', fontSize: 'var(--font-size-xl)' }}>Tier scannen</h1>
        <p className="text-muted" style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>
          Scanne den QR-Code, Barcode oder NFC-Chip des Tieres
        </p>
        {('NDEFReader' in window) && (
          <p style={{ margin: 'var(--space-2) 0 0 0', fontSize: 'var(--font-size-xs)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: 'var(--success-500)' }}>
            <Radio size={12} /> NFC verfügbar
          </p>
        )}
      </div>

      {(cameraError || nfcError) && (
        <div className="error-card" style={{ marginBottom: 'var(--space-4)' }}>
          <p>{cameraError || nfcError}</p>
        </div>
      )}

      {scanMode === 'barcode' && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <div
            id="public-barcode-reader"
            style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', minHeight: 240, background: 'var(--surface)' }}
          />
        </div>
      )}

      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-4)' }}>
            <div className="spinner" />
          </div>
        ) : (
          <>
            <button
              className="btn btn-primary btn-full"
              onClick={() => {
                setScanMode('barcode')
                startBarcode()
              }}
              disabled={scanMode === 'nfc'}
            >
              <Camera size={18} /> Barcode/QR scannen
            </button>
            {('NDEFReader' in window) && (
              <button
                className="btn btn-outline btn-full"
                onClick={() => {
                  setScanMode('nfc')
                  startNfc()
                }}
                disabled={scanMode === 'barcode'}
              >
                <Radio size={18} /> NFC lesen
              </button>
            )}
          </>
        )}
        <button className="btn btn-ghost btn-full" onClick={() => navigate('/login')}>
          <LogIn size={16} /> Anmelden
        </button>
      </div>
    </div>
  )
}
