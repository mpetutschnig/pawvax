import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Sun, Moon, LogOut, User } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'
import { logout } from '../api/rest'

interface PageHeaderProps {
  title: string
  backTo?: string
  showThemeToggle?: boolean
  showLogout?: boolean
  actions?: React.ReactNode
}

export function PageHeader({
  title,
  backTo,
  showThemeToggle = false,
  showLogout = true,
  actions
}: PageHeaderProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      localStorage.removeItem('token')
      localStorage.removeItem('role')
      localStorage.removeItem('roles')
      localStorage.removeItem('verified')
      navigate('/login')
    }
  }

  return (
    <div className="nav-bar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        {backTo && (
          <button
            onClick={() => navigate(backTo)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text)',
              padding: 'var(--space-2)',
              display: 'flex',
              alignItems: 'center'
            }}
            aria-label={t('common.back')}
          >
            <ChevronLeft size={24} />
          </button>
        )}
        <h2>{title}</h2>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        {actions}
        {showThemeToggle && (
          <button
            onClick={toggleTheme}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text)',
              padding: 'var(--space-2)',
              display: 'flex',
              alignItems: 'center',
              opacity: 0.7,
              transition: 'opacity 0.2s'
            }}
            aria-label={t('theme.light')}
            title={`${t('theme.light')}/${t('theme.dark')}`}
          >
            {theme === 'light' || (theme === 'system' && !window.matchMedia('(prefers-color-scheme: dark)').matches) ? (
              <Moon size={20} />
            ) : (
              <Sun size={20} />
            )}
          </button>
        )}
        {showLogout && (
          <button
            onClick={() => navigate('/profile')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text)',
              padding: 'var(--space-2)',
              display: 'flex',
              alignItems: 'center',
              opacity: 0.7,
              transition: 'opacity 0.2s'
            }}
            aria-label={t('nav.profile')}
            title={t('nav.profile')}
          >
            <User size={20} />
          </button>
        )}
        {showLogout && (
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            style={{
              background: 'none',
              border: 'none',
              cursor: loggingOut ? 'not-allowed' : 'pointer',
              color: 'var(--text)',
              padding: 'var(--space-2)',
              display: 'flex',
              alignItems: 'center',
              opacity: loggingOut ? 0.5 : 0.7,
              transition: 'opacity 0.2s'
            }}
            aria-label={t('logout')}
            title={t('logout')}
          >
            <LogOut size={20} />
          </button>
        )}
      </div>
    </div>
  )
}
