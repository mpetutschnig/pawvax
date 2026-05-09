import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PawPrint, ScanLine, User, Settings, Receipt } from 'lucide-react'
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
  const token = localStorage.getItem('token')
  const roleStr = token ? (localStorage.getItem('role') || 'user') : ''
  const roles = roleStr.split(',').map(r => r.trim()).filter(Boolean)
  
  useEffect(() => {
    fetch('/api/settings').then(res => res.json()).then(data => setSettings(data)).catch(() => {})
  }, [])
  
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

  return (
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
      <GlobalBrand />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/public-scan" element={<PublicScanPage />} />
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
