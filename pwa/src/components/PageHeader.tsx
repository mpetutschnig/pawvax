import React from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Sun, Moon } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

interface PageHeaderProps {
  title: string
  backTo?: string
  showThemeToggle?: boolean
  actions?: React.ReactNode
}

export function PageHeader({
  title,
  backTo,
  showThemeToggle = false,
  actions
}: PageHeaderProps) {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()

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
            aria-label="Back"
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
            aria-label="Toggle theme"
            title={`Theme: ${theme}`}
          >
            {theme === 'light' || (theme === 'system' && !window.matchMedia('(prefers-color-scheme: dark)').matches) ? (
              <Moon size={20} />
            ) : (
              <Sun size={20} />
            )}
          </button>
        )}
      </div>
    </div>
  )
}
