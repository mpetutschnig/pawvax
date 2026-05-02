import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../components/PageHeader'
import { BookOpen, User, Shield, Code } from 'lucide-react'

type DocTab = 'user' | 'admin' | 'dev'

export default function DocumentationPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<DocTab>('user')
  const [logoData, setLogoData] = useState<string>('')

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => { if (data.logo_data) setLogoData(data.logo_data) })
      .catch(err => console.error(err))
  }, [])

  const textStyle = { 
    whiteSpace: 'pre-wrap' as const, 
    lineHeight: 1.6, 
    fontSize: 'var(--font-size-sm)', 
    color: 'var(--text-secondary)',
    marginBottom: 'var(--space-6)'
  }

  const renderContent = () => {
    if (activeTab === 'user') {
      return (
        <div className="animate-fade-in">
          <h2 style={{ marginBottom: 'var(--space-2)' }}>{t('docs.user.title')}</h2>
          <p className="text-muted" style={{ marginBottom: 'var(--space-6)' }}>{t('docs.user.p1')}</p>
          
          <h3 style={{ marginBottom: 'var(--space-2)' }}>{t('docs.user.h1')}</h3>
          <p style={textStyle}>{t('docs.user.t1')}</p>

          <h3 style={{ marginBottom: 'var(--space-2)' }}>{t('docs.user.h2')}</h3>
          <p style={textStyle}>{t('docs.user.t2')}</p>

          <h3 style={{ marginBottom: 'var(--space-2)' }}>{t('docs.user.h3')}</h3>
          <p style={textStyle}>{t('docs.user.t3')}</p>
        </div>
      )
    }
    
    if (activeTab === 'admin') {
      return (
        <div className="animate-fade-in">
          <h2 style={{ marginBottom: 'var(--space-2)' }}>{t('docs.admin.title')}</h2>
          <p className="text-muted" style={{ marginBottom: 'var(--space-6)' }}>{t('docs.admin.p1')}</p>
          
          <h3 style={{ marginBottom: 'var(--space-2)' }}>{t('docs.admin.h1')}</h3>
          <p style={textStyle}>{t('docs.admin.t1')}</p>

          <h3 style={{ marginBottom: 'var(--space-2)' }}>{t('docs.admin.h2')}</h3>
          <p style={textStyle}>{t('docs.admin.t2')}</p>

          <h3 style={{ marginBottom: 'var(--space-2)' }}>{t('docs.admin.h3')}</h3>
          <p style={textStyle}>{t('docs.admin.t3')}</p>
        </div>
      )
    }

    return (
      <div className="animate-fade-in">
        <h2 style={{ marginBottom: 'var(--space-2)' }}>{t('docs.dev.title')}</h2>
        <p className="text-muted" style={{ marginBottom: 'var(--space-6)' }}>{t('docs.dev.p1')}</p>
        
        <h3 style={{ marginBottom: 'var(--space-2)' }}>{t('docs.dev.h1')}</h3>
        <pre style={{ ...textStyle, background: 'var(--surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{t('docs.dev.t1')}</pre>

        <h3 style={{ marginBottom: 'var(--space-2)' }}>{t('docs.dev.h2')}</h3>
        <pre style={{ ...textStyle, background: 'var(--surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{t('docs.dev.t2')}</pre>

        <h3 style={{ marginBottom: 'var(--space-2)' }}>{t('docs.dev.h3')}</h3>
        <p style={textStyle}>{t('docs.dev.t3')}</p>
      </div>
    )
  }

  return (
    <div className="container page">
      <PageHeader title={t('docs.title')} backTo="/profile" showThemeToggle />
      
      {logoData && (
        <div className="animate-fade-in" style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
          <img src={logoData} alt="Franchise Logo" style={{ maxHeight: '80px', borderRadius: 'var(--radius-md)', objectFit: 'contain' }} />
        </div>
      )}
      
      <div className="card" style={{ padding: '0 0 var(--space-4) 0', overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
          <button onClick={() => setActiveTab('user')} style={{ flex: 1, padding: 'var(--space-3)', background: 'none', border: 'none', borderBottom: activeTab === 'user' ? '2px solid var(--primary-500)' : '2px solid transparent', color: activeTab === 'user' ? 'var(--primary-600)' : 'var(--text-tertiary)', fontWeight: activeTab === 'user' ? 600 : 400, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <User size={16} /> {t('docs.tabUser')}
          </button>
          <button onClick={() => setActiveTab('admin')} style={{ flex: 1, padding: 'var(--space-3)', background: 'none', border: 'none', borderBottom: activeTab === 'admin' ? '2px solid var(--primary-500)' : '2px solid transparent', color: activeTab === 'admin' ? 'var(--primary-600)' : 'var(--text-tertiary)', fontWeight: activeTab === 'admin' ? 600 : 400, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <Shield size={16} /> {t('docs.tabAdmin')}
          </button>
          <button onClick={() => setActiveTab('dev')} style={{ flex: 1, padding: 'var(--space-3)', background: 'none', border: 'none', borderBottom: activeTab === 'dev' ? '2px solid var(--primary-500)' : '2px solid transparent', color: activeTab === 'dev' ? 'var(--primary-600)' : 'var(--text-tertiary)', fontWeight: activeTab === 'dev' ? 600 : 400, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <Code size={16} /> {t('docs.tabDev')}
          </button>
        </div>
        
        <div style={{ padding: 'var(--space-6) var(--space-4) 0 var(--space-4)' }}>
          {renderContent()}
        </div>
      </div>
    </div>
  )
}