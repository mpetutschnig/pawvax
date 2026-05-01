import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PawPrint, Radio, Edit3, CheckCircle, AlertCircle } from 'lucide-react'

export default function WelcomePage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
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
          {t('welcome.title')}
        </h1>
        <p className="text-muted" style={{ fontSize: 'var(--font-size-base)', margin: '0 0 var(--space-6) 0' }}>
          {t('welcome.subtitle')}
        </p>
      </div>

      <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, margin: '0 0 var(--space-4) 0' }}>
        {t('welcome.howToAdd')}
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
              {t('welcome.scanChip')}
            </h3>
            <p className="text-muted" style={{ margin: '0 0 var(--space-3) 0', fontSize: 'var(--font-size-sm)' }}>
              {t('welcome.scanChipDesc')}
            </p>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
              <CheckCircle size={16} color="var(--success-500)" style={{ marginTop: '2px', flexShrink: 0 }} />
              <span className="text-muted" style={{ fontSize: 'var(--font-size-sm)' }}>
                <strong>{t('welcome.advantage')}:</strong> {t('welcome.chipAdvantage')}
              </span>
            </div>
            <button
              className="btn btn-primary btn-full"
              onClick={() => navigate('/scan')}
            >
              {t('welcome.scanChip')} →
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
              {t('welcome.manualCreate')}
            </h3>
            <p className="text-muted" style={{ margin: '0 0 var(--space-3) 0', fontSize: 'var(--font-size-sm)' }}>
              {t('welcome.manualCreateDesc')}
            </p>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
              <AlertCircle size={16} color="var(--warning-500)" style={{ marginTop: '2px', flexShrink: 0 }} />
              <span className="text-muted" style={{ fontSize: 'var(--font-size-sm)' }}>
                <strong>{t('welcome.important')}:</strong> {t('welcome.manualImportant')}
              </span>
            </div>
            <button
              className="btn btn-outline btn-full"
              onClick={() => navigate('/animals')}
            >
              {t('animals.myAnimals')} →
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
          {t('welcome.skip')}
        </button>
      </div>
    </div>
  )
}
