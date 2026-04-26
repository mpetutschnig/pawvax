import { Routes, Route, Navigate, useLocation, Link } from 'react-router-dom'
import { PawPrint, ScanLine, User, Settings } from 'lucide-react'
import LoginPage from './pages/LoginPage'
import AnimalsPage from './pages/AnimalsPage'
import ScanPage from './pages/ScanPage'
import AnimalPage from './pages/AnimalPage'
import TagManagementPage from './pages/TagManagementPage'
import DocumentScanPage from './pages/DocumentScanPage'
import SharingSettingsPage from './pages/SharingSettingsPage'
import AdminPage from './pages/AdminPage'
import ProfilePage from './pages/ProfilePage'
import DocumentDetailPage from './pages/DocumentDetailPage'

function RequireAuth({ children, adminOnly }: { children: React.ReactNode; adminOnly?: boolean }) {
  const token = localStorage.getItem('token')
  const role = localStorage.getItem('role')

  if (!token) return <Navigate to="/login" replace />
  if (adminOnly && role !== 'admin') return <Navigate to="/animals" replace />

  return <>{children}</>
}

function BottomNav() {
  const location = useLocation()
  const token = localStorage.getItem('token')
  const rolesStr = localStorage.getItem('roles')
  const roles = rolesStr ? JSON.parse(rolesStr) : []

  if (!token || location.pathname === '/login') return null

  const isActive = (path: string) => location.pathname === path ? 'active' : ''

  return (
    <nav className="bottom-nav">
      <Link to="/animals" className={isActive('/animals')}>
        <PawPrint size={24} />
        Tiere
      </Link>
      <Link to="/scan" className={isActive('/scan')}>
        <ScanLine size={24} />
        Scannen
      </Link>
      <Link to="/profile" className={isActive('/profile')}>
        <User size={24} />
        Profil
      </Link>
      {roles.includes('admin') && (
        <Link to="/admin" className={isActive('/admin')}>
          <Settings size={24} />
          Admin
        </Link>
      )}
    </nav>
  )
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/animals" replace />} />
        <Route path="/animals" element={<RequireAuth><AnimalsPage /></RequireAuth>} />
        <Route path="/animals/:id" element={<RequireAuth><AnimalPage /></RequireAuth>} />
        <Route path="/animals/:id/tags" element={<RequireAuth><TagManagementPage /></RequireAuth>} />
        <Route path="/animals/:id/scan" element={<RequireAuth><DocumentScanPage /></RequireAuth>} />
        <Route path="/animals/:id/sharing" element={<RequireAuth><SharingSettingsPage /></RequireAuth>} />
        <Route path="/animals/:id/documents/:docId" element={<RequireAuth><DocumentDetailPage /></RequireAuth>} />
        <Route path="/scan" element={<RequireAuth><ScanPage /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth adminOnly><AdminPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/animals" replace />} />
      </Routes>
      <BottomNav />
    </>
  )
}
