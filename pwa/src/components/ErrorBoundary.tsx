import React, { ReactNode, ReactElement } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  public render(): ReactElement {
    if (this.state.hasError) {
      return (
        <div className="container page" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100dvh', gap: 'var(--space-4)' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-4)' }}>
              <AlertTriangle size={48} color="var(--danger-500)" />
            </div>
            <h1 style={{ margin: 0, marginBottom: 'var(--space-2)' }}>Etwas ist schiefgegangen</h1>
            <p style={{ color: 'var(--text-tertiary)', margin: 0, marginBottom: 'var(--space-4)' }}>
              Ein Fehler ist aufgetreten. Bitte versuche, die Seite neu zu laden.
            </p>
            <details style={{ textAlign: 'left', background: 'var(--surface)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', marginTop: 'var(--space-4)', maxWidth: '500px' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Fehler-Details</summary>
              <pre style={{ overflow: 'auto', fontSize: '12px', marginTop: 'var(--space-2)', color: 'var(--danger-600)' }}>
                {this.state.error?.message}
                {'\n\n'}
                {this.state.error?.stack}
              </pre>
            </details>
            <button
              onClick={() => window.location.href = '/'}
              style={{
                marginTop: 'var(--space-4)',
                padding: 'var(--space-2) var(--space-4)',
                background: 'var(--primary-500)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Zur Startseite
            </button>
          </div>
        </div>
      )
    }

    return this.props.children as ReactElement
  }
}
