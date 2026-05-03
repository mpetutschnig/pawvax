import { useLocation, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PawPrint, ScanLine, User, Settings } from 'lucide-react'

export function SideNav() {
  const location = useLocation()
  const { t } = useTranslation()
  const token = localStorage.getItem('token')
  const roleStr = localStorage.getItem('role') || ''
  const roles = roleStr.split(',').map(r => r.trim()).filter(Boolean)

  if (!token || location.pathname === '/login') return null

  const isGuest = roles.length > 0 && roles.every(r => r === 'guest')

  return (
    <nav className="side-nav">
      <div className="side-nav-brand">
        <PawPrint size={24} strokeWidth={1.8} />
        <span>PAW</span>
      </div>
      <div className="side-nav-links">
        {!isGuest && (
          <Link to="/scan" className={`side-nav-item ${location.pathname.startsWith('/scan') ? 'active' : ''}`}>
            <ScanLine size={20} strokeWidth={1.8} />
            <span>{t('nav.find')}</span>
          </Link>
        )}
        <Link to="/animals" className={`side-nav-item ${location.pathname.startsWith('/animals') ? 'active' : ''}`}>
          <PawPrint size={20} strokeWidth={1.8} />
          <span>{t('nav.animals')}</span>
        </Link>
        <Link to="/profile" className={`side-nav-item ${location.pathname.startsWith('/profile') ? 'active' : ''}`}>
          <User size={20} strokeWidth={1.8} />
          <span>{t('nav.profile')}</span>
        </Link>
        {roles.includes('admin') && (
          <Link to="/admin" className={`side-nav-item ${location.pathname.startsWith('/admin') ? 'active' : ''}`}>
            <Settings size={20} strokeWidth={1.8} />
            <span>{t('nav.admin')}</span>
          </Link>
        )}
      </div>
    </nav>
  )
}
