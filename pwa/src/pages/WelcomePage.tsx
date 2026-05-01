import { useNavigate } from 'react-router-dom'
import { PawPrint, Radio, Edit3, CheckCircle, AlertCircle } from 'lucide-react'

export default function WelcomePage() {
  const navigate = useNavigate()
  const token = localStorage.getItem('token')

  // Redirect to login if no token
  if (!token) {
    navigate('/login')
    return null
  }

  return (
    <div className="container page" style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', paddingTop: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 64, height: 64, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--primary-500), var(--primary-700))',
          marginBottom: 'var(--space-4)'
        }}>
          <PawPrint size={32} color="white" strokeWidth={1.5} />
        </div>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, margin: '0 0 var(--space-2) 0' }}>
          Willkommen bei PAW!
        </h1>
        <p className="text-muted" style={{ fontSize: 'var(--font-size-base)', margin: '0 0 var(--space-6) 0' }}>
          Verwalte die Impfdaten und Dokumente deiner Haustiere an einem sicheren Ort.
        </p>
      </div>

      <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, margin: '0 0 var(--space-4) 0' }}>
        Wie möchtest du dein erstes Tier hinzufügen?
      </h2>

      {/* Option A: Chip/Barcode */}
      <div className="card" style={{ marginBottom: 'var(--space-4)', borderLeft: '4px solid var(--success-500)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 48, height: 48, borderRadius: 'var(--radius-md)',
            background: 'var(--success-50)', flexShrink: 0
          }}>
            <Radio size={24} color="var(--success-500)" strokeWidth={1.5} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: '0 0 var(--space-1) 0', fontSize: 'var(--font-size-base)', fontWeight: 600 }}>
              Chip oder Barcode scannen
            </h3>
            <p className="text-muted" style={{ margin: '0 0 var(--space-3) 0', fontSize: 'var(--font-size-sm)' }}>
              Scanne den NFC-Chip oder QR-Code am Tag deines Tieres. PAW erstellt automatisch ein Profil.
            </p>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
              <CheckCircle size={16} color="var(--success-500)" style={{ marginTop: '2px', flexShrink: 0 }} />
              <span className="text-muted" style={{ fontSize: 'var(--font-size-sm)' }}>
                <strong>Vorteil:</strong> Andere können dein Tier mit dem Chip finden, auch ohne Konto
              </span>
            </div>
            <button
              className="btn btn-primary btn-full"
              onClick={() => navigate('/scan')}
            >
              Chip oder Barcode scannen →
            </button>
          </div>
        </div>
      </div>

      {/* Option B: Manual */}
      <div className="card" style={{ marginBottom: 'var(--space-6)', borderLeft: '4px solid var(--info-500)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 48, height: 48, borderRadius: 'var(--radius-md)',
            background: 'var(--info-50)', flexShrink: 0
          }}>
            <Edit3 size={24} color="var(--info-500)" strokeWidth={1.5} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: '0 0 var(--space-1) 0', fontSize: 'var(--font-size-base)', fontWeight: 600 }}>
              Tier manuell anlegen
            </h3>
            <p className="text-muted" style={{ margin: '0 0 var(--space-3) 0', fontSize: 'var(--font-size-sm)' }}>
              Erstelle ein Tierprofil manuell mit Namen, Art und Rasse — ohne Chip oder Barcode.
            </p>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
              <AlertCircle size={16} color="var(--warning-500)" style={{ marginTop: '2px', flexShrink: 0 }} />
              <span className="text-muted" style={{ fontSize: 'var(--font-size-sm)' }}>
                <strong>Wichtig:</strong> Das Tier ist dann nur für dich sichtbar. Ohne Chip können andere es nicht scannen.
              </span>
            </div>
            <button
              className="btn btn-outline btn-full"
              onClick={() => navigate('/animals')}
            >
              Zur Tierliste →
            </button>
          </div>
        </div>
      </div>

      {/* Skip */}
      <div style={{ textAlign: 'center' }}>
        <button
          className="btn btn-ghost"
          onClick={() => navigate('/animals')}
        >
          Überspringe diesen Schritt
        </button>
      </div>
    </div>
  )
}
