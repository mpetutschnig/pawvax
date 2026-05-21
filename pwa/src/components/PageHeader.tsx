import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft } from 'lucide-react'

interface PageHeaderProps {
  title: string
  backTo?: string
  actions?: React.ReactNode
}

export function PageHeader({ title, backTo, actions }: PageHeaderProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()

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
      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {actions}
        </div>
      )}
    </div>
  )
}
