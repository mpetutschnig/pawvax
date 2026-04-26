import { useEffect, useState } from 'react'
import {
  adminGetStats, adminGetAccounts, adminGetAnimals, adminGetPendingVerifications,
  adminVerifyAccount, adminPatchAccount, adminGetAuditLog
} from '../api/rest'

type Section = 'overview' | 'accounts' | 'animals' | 'verifications' | 'audit'

interface Account {
  id: string; name: string; email: string; role: string; verified: number; verification_status?: string; created_at: string
}

interface Animal {
  id: string; name: string; species: string; breed?: string; birthdate?: string; owner_name: string; owner_email: string
}

interface Verification {
  id: string; name: string; email: string; role: string; verification_status: string; created_at: string
}

interface AuditEntry {
  id: string; account_id: string | null; account_role: string | null; action: string; resource: string; resource_id: string; created_at: string
}

interface Stats {
  accounts: number; animals: number; documents: number; auditEntries: number
}

interface AuditLog {
  rows: AuditEntry[]; page: number; pages: number; total: number
}

export default function AdminPage() {
  const [section, setSection] = useState<Section>('overview')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Data
  const [stats, setStats] = useState<Stats | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [animals, setAnimals] = useState<Animal[]>([])
  const [verifications, setVerifications] = useState<Verification[]>([])
  const [auditLog, setAuditLog] = useState<AuditLog | null>(null)
  const [auditPage, setAuditPage] = useState(1)

  useEffect(() => {
    loadData()
  }, [section, auditPage])

  const loadData = async () => {
    setLoading(true)
    try {
      if (section === 'overview') {
        const res = await adminGetStats()
        setStats(res.data)
      } else if (section === 'accounts') {
        const res = await adminGetAccounts()
        setAccounts(res.data)
      } else if (section === 'animals') {
        const res = await adminGetAnimals()
        setAnimals(res.data)
      } else if (section === 'verifications') {
        const res = await adminGetPendingVerifications()
        setVerifications(res.data)
      } else if (section === 'audit') {
        const res = await adminGetAuditLog({ page: auditPage })
        setAuditLog(res.data)
      }
    } catch (err) {
      console.error('Admin load error:', err)
    } finally {
      setLoading(false)
    }
  }

  const selectedAccount = selectedId ? accounts.find(a => a.id === selectedId) : null
  const selectedAnimal = selectedId ? animals.find(a => a.id === selectedId) : null

  return (
    <div className="admin-layout">
      {/* Header */}
      <div className="admin-header">
        <div className="admin-header-brand">🐾 PAW Admin</div>
        <button
          onClick={() => {
            localStorage.removeItem('token')
            localStorage.removeItem('role')
            localStorage.removeItem('roles')
            window.location.href = '/login'
          }}
          className="btn btn-outline"
          style={{ width: 'auto', minHeight: 'auto', padding: '0.5rem 1rem' }}
        >
          Logout
        </button>
      </div>

      {/* Sidebar */}
      <nav className="admin-sidebar" role="navigation" aria-label="Admin Navigation">
        {[
          { id: 'overview', label: '📊 Übersicht', icon: '📊' },
          { id: 'accounts', label: '👥 Accounts', icon: '👥' },
          { id: 'animals', label: '🐾 Tiere', icon: '🐾' },
          { id: 'verifications', label: '✓ Verifikationen', icon: '✓' },
          { id: 'audit', label: '📋 Audit-Log', icon: '📋' }
        ].map(item => (
          <button
            key={item.id}
            onClick={() => {
              setSection(item.id as Section)
              setSelectedId(null)
              setAuditPage(1)
            }}
            className="admin-sidebar-item"
            aria-current={section === item.id ? 'page' : undefined}
            style={{
              background: section === item.id ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
              color: section === item.id ? '#ffffff' : 'var(--admin-sidebar-fg)'
            }}
          >
            <span>{item.icon}</span>
            <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Main Content */}
      <main className="admin-main" role="main">
        {loading && <p>Laden...</p>}

        {/* Overview */}
        {section === 'overview' && stats && !loading && (
          <div>
            <h1>Systemübersicht</h1>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1.5rem' }}>
              <div className="card">
                <p className="muted">Accounts</p>
                <p style={{ fontSize: '2.5rem', fontWeight: 700, margin: 0 }}>{stats.accounts}</p>
              </div>
              <div className="card">
                <p className="muted">Tiere</p>
                <p style={{ fontSize: '2.5rem', fontWeight: 700, margin: 0 }}>{stats.animals}</p>
              </div>
              <div className="card">
                <p className="muted">Dokumente</p>
                <p style={{ fontSize: '2.5rem', fontWeight: 700, margin: 0 }}>{stats.documents}</p>
              </div>
              <div className="card">
                <p className="muted">Audit-Einträge</p>
                <p style={{ fontSize: '2.5rem', fontWeight: 700, margin: 0 }}>{stats.auditEntries}</p>
              </div>
            </div>
          </div>
        )}

        {/* Accounts Table */}
        {section === 'accounts' && !loading && (
          <div>
            <h1>Account-Verwaltung</h1>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>E-Mail</th>
                  <th>Rollen</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(acc => (
                  <tr key={acc.id} onClick={() => setSelectedId(acc.id)} style={{ cursor: 'pointer' }}>
                    <td>{acc.name}</td>
                    <td>{acc.email}</td>
                    <td><code style={{ fontSize: '0.85rem' }}>{acc.role}</code></td>
                    <td>{acc.verified ? '✓ Verifiziert' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Animals Table */}
        {section === 'animals' && !loading && (
          <div>
            <h1>Tiere im System</h1>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Art</th>
                  <th>Besitzer</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody>
                {animals.map(animal => (
                  <tr key={animal.id} onClick={() => setSelectedId(animal.id)} style={{ cursor: 'pointer' }}>
                    <td>{animal.name}</td>
                    <td>{animal.species === 'dog' ? '🐶' : animal.species === 'cat' ? '🐱' : '🐾'} {['dog', 'cat', 'other'].indexOf(animal.species) >= 0 ? ['Hund', 'Katze', 'Sonstiges']['dog,cat,other'.split(',').indexOf(animal.species)] : animal.species}</td>
                    <td>{animal.owner_name}</td>
                    <td>{animal.owner_email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Verifications */}
        {section === 'verifications' && !loading && (
          <div>
            <h1>Vet-Verifikationen</h1>
            {verifications.length === 0 ? (
              <p className="muted">Keine pending-Anfragen</p>
            ) : (
              <div style={{ display: 'grid', gap: '1rem' }}>
                {verifications.map(v => (
                  <div key={v.id} className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                      <div>
                        <p style={{ fontWeight: 600, margin: 0 }}>{v.name}</p>
                        <p className="muted">{v.email}</p>
                      </div>
                      <span className="badge" style={{ background: '#fef3c7', color: '#92400e' }}>Pending</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn btn-primary"
                        onClick={() => adminVerifyAccount(v.id, true).then(() => loadData())}
                        style={{ flex: 1, minHeight: '40px' }}
                      >
                        ✓ Genehmigen
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => adminVerifyAccount(v.id, false).then(() => loadData())}
                        style={{ flex: 1, minHeight: '40px' }}
                      >
                        ✕ Ablehnen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Audit Log */}
        {section === 'audit' && auditLog && !loading && (
          <div>
            <h1>Audit-Log</h1>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Aktion</th>
                  <th>Resource</th>
                  <th>Account</th>
                  <th>Zeitstempel</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.rows.map(entry => (
                  <tr key={entry.id}>
                    <td><code style={{ fontSize: '0.85rem' }}>{entry.action}</code></td>
                    <td>{entry.resource}</td>
                    <td className="muted">{entry.account_role || '—'}</td>
                    <td className="muted" style={{ fontSize: '0.85rem' }}>{new Date(entry.created_at).toLocaleString('de-AT')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1rem' }}>
              <button
                className="btn btn-outline"
                onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                disabled={auditPage === 1}
              >
                ← Zurück
              </button>
              <span style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                {auditPage} / {auditLog.pages}
              </span>
              <button
                className="btn btn-outline"
                onClick={() => setAuditPage(p => p + 1)}
                disabled={auditPage === auditLog.pages}
              >
                Weiter →
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Detail Panel */}
      {selectedAccount && (
        <div className="admin-detail-panel">
          <h2>{selectedAccount.name}</h2>
          <p className="muted">{selectedAccount.email}</p>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1rem 0' }} />

          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '1rem' }}>Rollen</h3>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {['user', 'vet', 'authority', 'admin'].map(r => (
              <label key={r} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={selectedAccount.role.includes(r)}
                  onChange={e => {
                    const roles = selectedAccount.role.split(',').map(x => x.trim())
                    const next = e.target.checked ? [...roles, r] : roles.filter(x => x !== r)
                    adminPatchAccount(selectedAccount.id, { role: next.join(',') }).then(() => loadData())
                  }}
                />
                <span style={{ fontSize: '0.9rem' }}>{r}</span>
              </label>
            ))}
          </div>

          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '1rem' }}>Verifizierung</h3>
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!selectedAccount.verified}
              onChange={e => adminPatchAccount(selectedAccount.id, { verified: e.target.checked }).then(() => loadData())}
            />
            <span style={{ fontSize: '0.9rem' }}>Verifiziert</span>
          </label>

          <button
            className="btn btn-outline"
            onClick={() => setSelectedId(null)}
            style={{ marginTop: '2rem' }}
          >
            Schließen
          </button>
        </div>
      )}

      {selectedAnimal && (
        <div className="admin-detail-panel">
          <h2>{selectedAnimal.name}</h2>
          <p className="muted">
            {selectedAnimal.species === 'dog' ? '🐶' : selectedAnimal.species === 'cat' ? '🐱' : '🐾'}
            {' '}
            {selectedAnimal.species}
          </p>
          <p className="muted">{selectedAnimal.breed && `Rasse: ${selectedAnimal.breed}`}</p>
          <p className="muted">{selectedAnimal.birthdate && `Geb.: ${selectedAnimal.birthdate}`}</p>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1rem 0' }} />

          <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Besitzer</h3>
          <p style={{ margin: 0 }}>{selectedAnimal.owner_name}</p>
          <p className="muted">{selectedAnimal.owner_email}</p>

          <button
            className="btn btn-outline"
            onClick={() => setSelectedId(null)}
            style={{ marginTop: '2rem' }}
          >
            Schließen
          </button>
        </div>
      )}
    </div>
  )
}
