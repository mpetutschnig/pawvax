import { useState, useEffect, useMemo } from 'react'
import { Routes, Route, Navigate, useLocation, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PawPrint, ScanLine, User, Settings, Receipt, Bug } from 'lucide-react'
import { useGlobalNfc } from './hooks/useGlobalNfc'
import { api } from './api/rest'
import { generateThemeVariables, applyTheme } from './utils/colors'
import { ErrorBoundary } from './components/ErrorBoundary'
import LoginPage from './pages/LoginPage'
import AnimalsPage from './pages/AnimalsPage'
import ScanPage from './pages/ScanPage'
import AnimalPage from './pages/AnimalPage'
import TagManagementPage from './pages/TagManagementPage'
import DocumentScanPage from './pages/DocumentScanPage'
import AdminPage from './pages/AdminPage'
import ProfilePage from './pages/ProfilePage'
import DocumentDetailPage from './pages/DocumentDetailPage'
import PublicScanPage from './pages/PublicScanPage'
import DocumentationPage from './pages/DocumentationPage'
import WelcomePage from './pages/WelcomePage'
import PublicSharePage from './pages/PublicSharePage'
import RemindersPage from './pages/RemindersPage'
import BillingPage from './pages/BillingPage'

function GlobalBrand() {
  const location = useLocation()
  const { t } = useTranslation()
  const [settings, setSettings] = useState({ app_name: 'PAW', logo_data: '', theme_color: '' })
  const [account, setAccount] = useState<any>(null)
  const token = localStorage.getItem('token')
  const roleStr = token ? (localStorage.getItem('role') || 'user') : ''
  const roles = roleStr.split(',').map(r => r.trim()).filter(Boolean)
  
  useEffect(() => {
    fetch('/api/settings').then(res => res.json()).then(data => setSettings(data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (token) {
      api.get('/accounts/me').then(res => setAccount(res.data)).catch(() => {})
    }
  }, [token, location.pathname])
  
  useEffect(() => {
    if (settings.app_name) document.title = settings.app_name
    if (settings.logo_data) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement
      if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        document.head.appendChild(link)
      }
      link.href = settings.logo_data
    }
    if (settings.theme_color) {
      const meta = document.querySelector('meta[name="theme-color"]')
      if (meta) meta.setAttribute('content', settings.theme_color)
      
      // Dynamische Paletten-Generierung & Injektion
      const themeVars = generateThemeVariables(settings.theme_color)
      applyTheme(themeVars)
    }
  }, [settings])

  const hideOn = ['/login', '/welcome', '/admin', '/public-scan', '/share']
  if (hideOn.some(path => location.pathname.startsWith(path))) return null
  if (!settings.logo_data && (!settings.app_name || settings.app_name === 'PAW')) return null

  const aiDisabled = account && !account.system_fallback_enabled && !account.has_gemini_token && !account.has_anthropic_token && !account.has_openai_token

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px var(--space-4)', background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ flex: 1 }}></div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          {settings.logo_data && <img src={settings.logo_data} alt="Logo" style={{ height: '24px', objectFit: 'contain' }} />}
          <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{settings.app_name || 'PAW'}</span>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: '4px', flexWrap: 'wrap' }}>
          {roles.map((r: string) => (
            <span key={r} className={`badge ${r === 'vet' ? 'badge-success' : 'badge-info'}`} style={{ fontSize: '10px', padding: '2px 6px', textTransform: 'capitalize' }}>
              {r === 'vet' ? t('docScan.vet') : r === 'authority' ? t('docScan.authority') : r === 'admin' ? 'Admin' : r === 'guest' ? t('docScan.guestAccess') : 'User'}
            </span>
          ))}
        </div>
      </div>
      {aiDisabled && (
        <div style={{ background: 'var(--warning-50)', borderBottom: '1px solid var(--warning-500)', padding: '6px var(--space-4)', fontSize: '12px', textAlign: 'center', color: 'var(--warning-600)' }}>
          ⚠️ KI-Funktionen deaktiviert. <Link to="/profile" style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 600 }}>Im Profil aktivieren</Link>
        </div>
      )}
    </>
  )
}

function RequireAuth({ children, adminOnly }: { children: React.ReactNode; adminOnly?: boolean }) {
  const token = localStorage.getItem('token')
  const role = localStorage.getItem('role')

  if (!token) return <Navigate to="/login" replace />
  if (adminOnly && role !== 'admin') return <Navigate to="/animals" replace />

  return <>{children}</>
}

function BottomNav() {
  const location = useLocation()
  const { t } = useTranslation()
  const token = localStorage.getItem('token')
  const roleStr = localStorage.getItem('role') || ''
  const roles = roleStr.split(',').map(r => r.trim()).filter(Boolean)

  if (!token || location.pathname === '/login') return null

  return (
    <nav className="bottom-nav">
      {!(roles.length > 0 && roles.every((r: string) => r === 'guest')) && (
        <Link to="/scan" className={location.pathname.startsWith('/scan') ? 'active' : ''}>
          <div className="nav-icon-wrap">
            <ScanLine size={22} strokeWidth={1.8} />
          </div>
          <span>{t('nav.find')}</span>
        </Link>
      )}
      <Link to="/animals" className={location.pathname.startsWith('/animals') ? 'active' : ''}>
        <div className="nav-icon-wrap">
          <PawPrint size={22} strokeWidth={1.8} />
        </div>
        <span>{t('nav.animals')}</span>
      </Link>
      <Link to="/profile" className={location.pathname.startsWith('/profile') ? 'active' : ''}>
        <div className="nav-icon-wrap">
          <User size={22} strokeWidth={1.8} />
        </div>
        <span>{t('nav.profile')}</span>
      </Link>
      {!(roles.length > 0 && roles.every((r: string) => r === 'guest')) && (
        <Link to="/billing" className={location.pathname.startsWith('/billing') ? 'active' : ''}>
          <div className="nav-icon-wrap">
            <Receipt size={22} strokeWidth={1.8} />
          </div>
          <span>{t('nav.billing')}</span>
        </Link>
      )}
      {roles.includes('admin') && (
        <Link to="/admin" className={location.pathname.startsWith('/admin') ? 'active' : ''}>
          <div className="nav-icon-wrap">
            <Settings size={22} strokeWidth={1.8} />
          </div>
          <span>{t('nav.admin')}</span>
        </Link>
      )}
    </nav>
  )
}

function DebugOverlay() {
  const location = useLocation()
  const params = useMemo(() => new URLSearchParams(location.search), [location.search])
  const [isDebug, setIsDebug] = useState(false)
  const [history, setHistory] = useState<any[]>([])
  const [currentScreen, setCurrentScreen] = useState('')

  // Map paths to component names for better identification
  const getComponentName = (path: string) => {
    if (path.startsWith('/animals/')) {
      if (path.endsWith('/scan')) return 'DocumentScanPage'
      if (path.includes('/documents/')) return 'DocumentDetailPage'
      if (path.endsWith('/tags')) return 'TagManagementPage'
      return 'AnimalPage'
    }
    const mapping: Record<string, string> = {
      '/animals': 'AnimalsPage',
      '/scan': 'ScanPage',
      '/login': 'LoginPage',
      '/profile': 'ProfilePage',
      '/billing': 'BillingPage',
      '/admin': 'AdminPage',
      '/welcome': 'WelcomePage',
      '/docs': 'DocumentationPage',
      '/public-scan': 'PublicScanPage',
      '/reminders': 'RemindersPage'
    }
    return mapping[path] || 'UnknownPage'
  }

  // Capture screen context from DOM
  const captureScreenState = () => {
    const heading = document.querySelector('h1, h2, .card-title, .page-title')?.textContent?.trim() || ''
    const compName = getComponentName(location.pathname)
    
    // Find active modals by looking for fixed/absolute containers with high z-index
    const modals: string[] = []
    document.querySelectorAll('[style*="position: fixed"], [style*="position: absolute"]').forEach(el => {
      const h3 = el.querySelector('h3')?.textContent
      if (h3 && (el as HTMLElement).offsetParent !== null) {
        modals.push(h3.trim())
      }
    })

    // Find visible errors
    const errors: string[] = []
    document.querySelectorAll('.error-card, .text-danger, [class*="error"], .debug-error-details').forEach(el => {
      if (el.textContent && (el as HTMLElement).offsetParent !== null && el.textContent.length < 1000) {
        errors.push(el.textContent.trim())
      }
    })

    return {
      component: compName,
      path: location.pathname,
      heading,
      modals: modals.length > 0 ? modals : null,
      errors: errors.length > 0 ? errors : null,
      state: location.state ? location.state : null,
      time: new Date().toLocaleTimeString()
    }
  }

  useEffect(() => {
    const debugParam = params.get('debug')
    if (debugParam === '1' || debugParam === 'true') {
      localStorage.setItem('paw_debug_mode', '1')
      setIsDebug(true)
    } else if (debugParam === '0' || debugParam === 'false') {
      localStorage.removeItem('paw_debug_mode')
      setIsDebug(false)
    } else {
      setIsDebug(localStorage.getItem('paw_debug_mode') === '1')
    }
  }, [params])

  // History Tracking with Location and DOM Mutations
  useEffect(() => {
    if (!isDebug) return

    const updateHistory = () => {
      const snapshot = captureScreenState()
      const modalDesc = snapshot.modals ? ` (Modal: ${snapshot.modals[0]})` : ''
      setCurrentScreen(`${snapshot.component}${modalDesc}`)

      setHistory(prev => {
        // Only add if the snapshot has changed significantly from the last one
        const last = prev[0]
        if (last && last.path === snapshot.path && last.heading === snapshot.heading && JSON.stringify(last.modals) === JSON.stringify(snapshot.modals)) {
          return prev
        }
        return [snapshot, ...prev].slice(0, 10)
      })
    }

    // Initial capture
    updateHistory()

    // Observe DOM changes to catch modals or error messages appearing
    const observer = new MutationObserver(updateHistory)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })

    return () => observer.disconnect()
  }, [location, isDebug])
  
  if (!isDebug) return null

  const handleCopy = () => {
    const debugInfo = {
      userAgent: navigator.userAgent,
      screen: `${window.innerWidth}x${window.innerHeight}`,
      language: navigator.language,
      currentSnapshot: captureScreenState(),
      history: history
    }
    navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2))
    alert('Debug-Info kopiert! (Keine sensiblen Daten enthalten)')
  }

  return (
    <div style={{
      position: 'fixed',
      top: '60px',
      right: '10px',
      zIndex: 9999,
      background: 'rgba(0,0,0,0.85)',
      color: '#00ff00',
      padding: '8px 12px',
      borderRadius: '8px',
      fontSize: '10px',
      fontFamily: 'monospace',
      pointerEvents: 'auto',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      border: '1px solid rgba(0,255,0,0.3)',
      maxWidth: '250px',
      wordBreak: 'break-all'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px', borderBottom: '1px solid rgba(0,255,0,0.2)', paddingBottom: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Bug size={12} />
          <span style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>Debug Mode</span>
        </div>
        <button 
          onClick={handleCopy}
          style={{ background: 'rgba(0,255,0,0.2)', border: '1px solid #00ff00', color: '#00ff00', cursor: 'pointer', borderRadius: '4px', padding: '2px 6px', fontSize: '9px', fontWeight: 'bold' }}
        >
          COPY INFO
        </button>
      </div>
      <div><strong>Screen:</strong> {currentScreen}</div>
      <div style={{ marginTop: '2px', opacity: 0.7 }}><strong>Path:</strong> {location.pathname}</div>
    </div>
  )
}

export default function App() {
  useGlobalNfc()
  const [, setTokenRefreshed] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    api.post('/auth/refresh')
      .then((res: any) => {
        localStorage.setItem('token', res.data.token)
        localStorage.setItem('role', res.data.account?.role || 'user')
        localStorage.setItem('verified', String(res.data.account?.verified || 0))
        setTokenRefreshed(true)
      })
      .catch(() => {})
  }, [])

  return (
    <ErrorBoundary>
      <DebugOverlay />
      <GlobalBrand />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/public-scan" element={<PublicScanPage />} />
        <Route path="/t/:tagId" element={<PublicScanPage />} />
        <Route path="/share/:shareId" element={<PublicSharePage />} />
        <Route path="/" element={<Navigate to="/animals" replace />} />
        <Route path="/reminders" element={<RequireAuth><RemindersPage /></RequireAuth>} />
        <Route path="/animals" element={<RequireAuth><AnimalsPage /></RequireAuth>} />
        <Route path="/animals/:id" element={<RequireAuth><AnimalPage /></RequireAuth>} />
        <Route path="/animals/:id/tags" element={<RequireAuth><TagManagementPage /></RequireAuth>} />
        <Route path="/animals/:id/scan" element={<RequireAuth><DocumentScanPage /></RequireAuth>} />
        <Route path="/animals/:id/documents/:docId" element={<RequireAuth><DocumentDetailPage /></RequireAuth>} />
        <Route path="/scan" element={<RequireAuth><ScanPage /></RequireAuth>} />
        <Route path="/docs" element={<RequireAuth><DocumentationPage /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="/billing" element={<RequireAuth><BillingPage /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth adminOnly><AdminPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/animals" replace />} />
      </Routes>
      <BottomNav />
    </ErrorBoundary>
  )
}
