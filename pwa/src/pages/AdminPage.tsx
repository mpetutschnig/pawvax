import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  adminGetStats, adminGetAccounts, adminGetAnimals,
  adminPatchAccount, adminGetAuditLog, adminDeleteAnimal, adminDeleteAccount, adminGetTestResults,
  adminGetOrphans, adminDeleteOrphans, adminGetVerifications, adminApproveVerification, adminRejectVerification, adminGetVersion
} from '../api/rest'
import { PawPrint, LogOut, LayoutDashboard, Users, Cat, ShieldCheck, FileClock, CheckCircle, Menu, X, Settings, XCircle, FlaskConical, Trash2, AlertCircle } from 'lucide-react'
import { AdminAnimalDTO } from '../types/animal'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'

type Section = 'overview' | 'accounts' | 'animals' | 'verifications' | 'audit' | 'settings' | 'tests' | 'cleanup'

interface Account {
  id: string; name: string; email: string; role: string; verified: number; verification_status?: string; created_at: string
}

interface AuditEntry {
  id: string; account_id: string | null; account_role: string | null; account_email?: string; account_name?: string; action: string; resource: string; resource_id: string; details?: string; ip?: string; created_at: string
}

interface Stats {
  accounts: number
  animals: { total: number; active: number; archived: number; with_documents: number }
  documents: number
  auditEntries: number
  pendingVerifications: number
}

interface AuditLog {
  rows: AuditEntry[]; page: number; pages: number; total: number
}

interface TestCase {
  ancestorTitles: string[]
  title: string
  fullName: string
  status: 'passed' | 'failed'
  duration: number
  failureMessages?: string[]
}

interface TestResults {
  summary: {
    status: string
    date: string
    passedTests?: number
    failedTests?: number
    pendingTests?: number
    todoTests?: number
    totalTests?: number
  } | null
  tests: {
    numPassedTests: number
    numFailedTests: number
    testResults: { assertionResults?: TestCase[]; testResults?: TestCase[] }[]
  } | null
}

interface OrphanItem {
  id: string
  title: string | null
  reference: string | null
  created_at?: string | number | null
}

interface OrphanCategory {
  key: string
  label: string
  count: number
  items: OrphanItem[]
}

interface OrphanReport {
  total: number
  categories: OrphanCategory[]
}

export default function AdminPage() {
  const { t, i18n } = useTranslation()
  const [section, setSection] = useState<Section>('overview')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Data
  const [stats, setStats] = useState<Stats | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [animals, setAnimals] = useState<AdminAnimalDTO[]>([])
  const [auditLog, setAuditLog] = useState<AuditLog | null>(null)
  const [auditPage, setAuditPage] = useState(1)
  const [selectedAuditEntry, setSelectedAuditEntry] = useState<AuditEntry | null>(null)
  const [auditSheetOpen, setAuditSheetOpen] = useState(false)
  const [appSettings, setAppSettings] = useState({ app_name: '', theme_color: '', logo_data: '' })
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [testResults, setTestResults] = useState<TestResults | null>(null)
  const [selectedTest, setSelectedTest] = useState<TestCase | null>(null)
  const [orphanReport, setOrphanReport] = useState<OrphanReport | null>(null)
  const [selectedOrphanCategories, setSelectedOrphanCategories] = useState<string[]>([])
  const [orphanDeleting, setOrphanDeleting] = useState(false)
  const [orphanFilter, setOrphanFilter] = useState('')
  const [verificationRequests, setVerificationRequests] = useState<any[]>([])
  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [verificationProcessing, setVerificationProcessing] = useState<string | null>(null)
  const [version, setVersion] = useState<any>(null)

  useEffect(() => {
    fetch('/api/settings').then(res => res.json()).then(data => setAppSettings(data)).catch(console.error)
    adminGetVersion().then(res => setVersion(res.data)).catch(console.error)
  }, [])

  useEffect(() => {
    loadData()
  }, [section, auditPage])

  const loadData = async () => {
    setLoading(true)
    try {
      if (section === 'overview') {
        const [statsRes, orphanRes] = await Promise.all([adminGetStats(), adminGetOrphans()])
        setStats(statsRes.data)
        setOrphanReport(orphanRes.data)
        const setRes = await fetch('/api/settings')
        const setData = await setRes.json()
        setAppSettings(setData)
      } else if (section === 'accounts') {
        const res = await adminGetAccounts()
        setAccounts(res.data)
      } else if (section === 'animals') {
        const res = await adminGetAnimals()
        setAnimals(res.data)
      } else if (section === 'verifications') {
        const res = await adminGetVerifications()
        setVerificationRequests(res.data.verifications || [])
      } else if (section === 'audit') {
        const res = await adminGetAuditLog({ page: auditPage })
        setAuditLog(res.data)
      } else if (section === 'settings') {
        const res = await fetch('/api/settings')
        const data = await res.json()
        setAppSettings(data)
      } else if (section === 'tests') {
        const res = await adminGetTestResults()
        setTestResults(res.data)
        setSelectedTest(null)
      } else if (section === 'cleanup') {
        const res = await adminGetOrphans()
        setOrphanReport(res.data)
        setSelectedOrphanCategories([])
        setOrphanFilter('')
      }
    } catch (err) {
      console.error('Admin load error:', err)
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    setSettingsSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(appSettings)
      })
      if (!res.ok) throw new Error('Failed to save settings')
      alert(t('admin.settingsSaved'))
      window.location.reload() // Lade die Seite neu, um Farbe/Name direkt global zu übernehmen
    } catch (e) {
      alert(t('common.error'))
    } finally {
      setSettingsSaving(false)
    }
  }

  const selectedAccount = selectedId ? accounts.find(a => a.id === selectedId) : null
  const selectedAnimal = selectedId ? animals.find(a => a.id === selectedId) : null
  const orphanCategories = orphanReport?.categories ?? []
  const filteredOrphanCategories = orphanCategories.filter(category => {
    const haystack = `${category.label} ${category.key}`.toLowerCase()
    return haystack.includes(orphanFilter.trim().toLowerCase())
  })
  const orphanTotal = orphanReport?.total ?? 0
  const orphanBreakdown = orphanCategories
    .filter(category => category.count > 0)
    .slice(0, 3)
    .map(category => `${category.count} ${t(`admin.orphanCategory.${category.key}` as any, category.label)}`)
    .join(' · ')

  const toggleOrphanCategory = (key: string) => {
    setSelectedOrphanCategories(current => current.includes(key)
      ? current.filter(entry => entry !== key)
      : [...current, key])
  }

  const deleteSelectedOrphans = async (categories = selectedOrphanCategories) => {
    if (categories.length === 0) return

    const selectedLabels = orphanCategories
      .filter(category => categories.includes(category.key))
      .map(category => category.label)

    if (!confirm(`${t('admin.deleteSelectedOrphans')}\n\n${selectedLabels.join('\n')}`)) {
      return
    }

    setOrphanDeleting(true)
    try {
      const res = await adminDeleteOrphans(categories)
      setOrphanReport(res.data.report)
      setSelectedOrphanCategories([])
    } catch (err) {
      console.error('Orphan cleanup failed:', err)
      alert(t('common.error'))
    } finally {
      setOrphanDeleting(false)
    }
  }

  const approveVerification = async (requestId: string) => {
    setVerificationProcessing(requestId)
    try {
      await adminApproveVerification(requestId)
      await loadData()
    } catch (err) {
      alert(t('common.error'))
      console.error(err)
    } finally {
      setVerificationProcessing(null)
    }
  }

  const rejectVerification = async (requestId: string) => {
    if (!rejectionReason.trim()) {
      alert(t('admin.enterRejectionReason'))
      return
    }

    setVerificationProcessing(requestId)
    try {
      await adminRejectVerification(requestId, rejectionReason)
      setRejectingRequestId(null)
      setRejectionReason('')
      await loadData()
    } catch (err) {
      alert(t('common.error'))
      console.error(err)
    } finally {
      setVerificationProcessing(null)
    }
  }

  let lastTestRun: TestResults['summary'] = null
  try {
    if ((appSettings as any).last_test_run) {
      lastTestRun = JSON.parse((appSettings as any).last_test_run)
    }
  } catch {}

  const lastTestRunPassed = lastTestRun?.status === 'passed'
  const lastTestRunIncomplete = lastTestRun?.status === 'incomplete'

  const adminName = t('admin.adminUser') // Ideally from Auth context

  return (
    <div className={`admin-layout ${sidebarOpen ? 'sidebar-open' : ''}`}>
      {/* Header */}
      <header className="admin-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="btn btn-ghost btn-icon admin-hamburger"
            title="Menu"
            style={{ display: 'none' }}
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="admin-header-brand">
            {appSettings.logo_data ? (
              <img src={appSettings.logo_data} alt="Logo" style={{ height: '24px', verticalAlign: 'middle', marginRight: 8, objectFit: 'contain' }} />
            ) : (
              <PawPrint size={20} strokeWidth={1.8} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            )}
            {appSettings.app_name || 'PAW'} {t('nav.admin')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          {version && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-xs)', color: 'oklch(70% 0.05 240)', padding: '4px 8px', background: 'oklch(96% 0.01 240)', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontWeight: 600 }}>v{version.server}</span>
              <span style={{ color: 'oklch(65% 0.04 240)' }} title={version.buildTime}>{version.buildDate}</span>
            </div>
          )}
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'oklch(80% 0.04 240)' }}>
            {adminName}
          </span>
          <button
            onClick={() => {
              localStorage.removeItem('token')
              localStorage.removeItem('role')
              localStorage.removeItem('roles')
              window.location.href = '/login'
            }}
            className="btn btn-ghost btn-icon"
            title={t('logout')}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <nav className="admin-sidebar" role="navigation" aria-label="Admin Navigation">
        {[
          { id: 'overview', labelKey: 'admin.statistics', icon: <LayoutDashboard size={18} /> },
          { id: 'accounts', labelKey: 'admin.accounts', icon: <Users size={18} /> },
          { id: 'animals', labelKey: 'admin.animals', icon: <Cat size={18} /> },
          { id: 'verifications', labelKey: 'admin.verifications', icon: <ShieldCheck size={18} />, badge: stats?.pendingVerifications },
          { id: 'audit', labelKey: 'admin.audit', icon: <FileClock size={18} /> },
          { id: 'cleanup', labelKey: 'admin.cleanup', icon: <Trash2 size={18} />, badge: orphanTotal || undefined },
          { id: 'tests', labelKey: 'admin.tests', icon: <FlaskConical size={18} /> },
          { id: 'settings', labelKey: 'admin.settings', icon: <Settings size={18} /> }
        ].map(item => (
          <a
            key={item.id}
            onClick={() => {
              setSection(item.id as Section)
              setSelectedId(null)
              setAuditPage(1)
              setSidebarOpen(false)
            }}
            className="admin-sidebar-item"
            aria-current={section === item.id ? 'page' : undefined}
            style={{ cursor: 'pointer', position: 'relative' }}
          >
            {item.icon}
            <span>{t(item.labelKey as any)}</span>
            {(item as any).badge > 0 && (
              <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'var(--danger-500)', color: 'white', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700 }}>
                {(item as any).badge}
              </span>
            )}
          </a>
        ))}
      </nav>

      {/* Main Content */}
      <main className="admin-main" role="main">
        {loading && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--space-8)' }}><div className="spinner spinner-lg"></div></div>}

        {/* Overview */}
        {section === 'overview' && stats && !loading && (
          <div className="animate-fade-in">
            <h1 style={{ marginBottom: 'var(--space-6)' }}>{t('admin.statistics')}</h1>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
              {[
                { label: t('admin.registeredAccounts'), value: stats.accounts, trend: '+12%', up: true },
                { label: t('admin.totalAnimals'), value: stats.animals.total, trend: '+5%', up: true },
                { label: t('admin.totalDocuments'), value: stats.documents, trend: '+18%', up: true },
                { label: t('admin.auditEntries'), value: stats.auditEntries, trend: '+2%', up: true },
                { label: t('admin.pendingVerifications'), value: stats.pendingVerifications, trend: '', up: true, clickable: true, onClick: () => setSection('verifications') },
                { label: t('admin.orphanedItems'), value: orphanTotal, trend: orphanTotal > 0 ? t('admin.cleanupRecommended') : '', detail: orphanBreakdown, up: false, clickable: true, onClick: () => setSection('cleanup'), alert: orphanTotal > 0 },
              ].map(stat => (
                <div key={stat.label} className="card card-sm" style={{ marginBottom: 0, ...(stat.clickable ? { cursor: 'pointer', transition: 'all 0.2s' } : {}), ...(stat.alert ? { border: '1px solid var(--danger-300)', background: 'var(--danger-50)' } : {}) }} onClick={stat.onClick} onMouseEnter={(e) => stat.clickable && (e.currentTarget.style.transform = 'translateY(-4px)')} onMouseLeave={(e) => stat.clickable && (e.currentTarget.style.transform = 'translateY(0)')}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: stat.value > 0 ? 'var(--danger-500)' : 'var(--text-primary)', lineHeight: 1 }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>
                    {stat.label}
                  </div>
                  {stat.trend && (
                    <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: stat.up ? 'var(--success-600)' : 'var(--danger-500)', marginTop: 6 }}>
                      {stat.up ? '↑' : '↓'} {stat.trend}
                    </div>
                  )}
                  {stat.detail && (
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginTop: 'var(--space-2)', lineHeight: 1.4 }}>
                      {stat.detail}
                    </div>
                  )}
                </div>
              ))}
              
              <div className="card card-sm" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setSection('tests')}>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--space-2)' }}>
                  {t('admin.testResults')}
                </div>
                {lastTestRun ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      {lastTestRunPassed ? <CheckCircle size={20} color="var(--success-600)" /> : <XCircle size={20} color={lastTestRunIncomplete ? 'var(--warning-600, #b7791f)' : 'var(--danger-500)'} />}
                      <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, color: lastTestRunPassed ? 'var(--success-600)' : (lastTestRunIncomplete ? 'var(--warning-600, #b7791f)' : 'var(--danger-500)') }}>
                        {lastTestRunPassed ? t('admin.testSuccess') : t('admin.testFailed')}
                      </span>
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                      {new Date(lastTestRun.date).toLocaleString(i18n.language === 'de' ? 'de-AT' : 'en-GB')}
                    </div>
                    {typeof lastTestRun.totalTests === 'number' && (
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {lastTestRun.passedTests || 0}/{lastTestRun.totalTests} Tests
                        {lastTestRun.failedTests ? `, ${lastTestRun.failedTests} fehlgeschlagen` : ''}
                      </div>
                    )}
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--primary-600)', marginTop: 'var(--space-2)', fontWeight: 500 }}>
                      {t('admin.viewDetails')} →
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-tertiary)', fontWeight: 500, marginTop: 'auto', paddingBottom: '4px' }}>
                    {t('admin.testNever')}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Accounts Table */}
        {section === 'accounts' && !loading && (
          <div className="animate-fade-in">
            <h1 style={{ marginBottom: 'var(--space-6)' }}>{t('admin.accountManagement')}</h1>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t('admin.name')}</th>
                    <th>{t('admin.email')}</th>
                    <th>{t('profile.roles')}</th>
                    <th>{t('admin.verified')}</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(acc => (
                    <tr key={acc.id} onClick={() => setSelectedId(acc.id)} style={{ cursor: 'pointer' }}>
                      <td style={{ fontWeight: 500 }}>{acc.name}</td>
                      <td className="text-muted">{acc.email}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {acc.role.split(',').map(r => (
                            <span key={r} className={`badge ${r.trim() === 'vet' ? 'badge-success' : 'badge-info'}`} style={{ fontSize: '10px', padding: '2px 6px', textTransform: 'capitalize' }}>{r.trim()}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Animals Table */}
        {section === 'animals' && !loading && (
          <div className="animate-fade-in">
            <h1 style={{ marginBottom: 'var(--space-6)' }}>{t('admin.animals')}</h1>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t('admin.name')}</th>
                    <th>{t('animals.species')}</th>
                    <th>{t('admin.owner')}</th>
                    <th>{t('admin.email')}</th>
                  </tr>
                </thead>
                <tbody>
                  {animals.map(animal => (
                    <tr key={animal.id} onClick={() => setSelectedId(animal.id)} style={{ cursor: 'pointer' }}>
                      <td style={{ fontWeight: 500 }}>{animal.name}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {animal.species === 'cat' ? <Cat size={14} color="var(--text-tertiary)" /> : <PawPrint size={14} color="var(--text-tertiary)" />}
                          <span className="text-muted" style={{ textTransform: 'capitalize' }}>{animal.species}</span>
                        </div>
                      </td>
                      <td>{animal.owner_name}</td>
                      <td className="text-muted">{animal.owner_email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Verifications */}
        {section === 'verifications' && !loading && (
          <div className="animate-fade-in">
            <h1 style={{ marginBottom: 'var(--space-6)' }}>{t('admin.verifications')}</h1>
            {verificationRequests.length === 0 ? (
              <div className="card text-center" style={{ padding: 'var(--space-8)' }}>
                <ShieldCheck size={48} color="var(--primary-200)" style={{ margin: '0 auto var(--space-4)' }} />
                <p className="text-muted">{t('admin.noVerifications')}</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
                {verificationRequests.map(req => (
                  <div key={req.id} className="card" style={{ padding: 0, overflow: 'hidden', borderLeft: `4px solid ${req.status === 'pending' ? 'var(--warning-500)' : req.status === 'approved' ? 'var(--success-500)' : 'var(--danger-500)'}` }}>
                    <div style={{ padding: 'var(--space-4)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 'var(--space-3)' }}>
                        <div>
                          <p style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--font-size-base)', margin: '0 0 2px 0' }}>{req.name}</p>
                          <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)', margin: 0 }}>{req.email}</p>
                          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', margin: '4px 0 0 0' }}>
                            {new Date(req.created_at).toLocaleString()}
                          </p>
                        </div>
                        <span className="badge" style={{ background: req.status === 'pending' ? 'var(--warning-500)' : req.status === 'approved' ? 'var(--success-500)' : 'var(--danger-500)' }}>
                          {req.status === 'pending' ? t('admin.pending') : req.status === 'approved' ? t('admin.approved') : t('admin.rejected')}
                        </span>
                      </div>

                      <div style={{ background: 'var(--surface)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-3)' }}>
                        <p style={{ margin: '0 0 4px 0', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>{t('admin.requestedType')}:</p>
                        <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', textTransform: 'capitalize' }}>
                          {req.type === 'vet' ? t('profile.vetVerification') : t('profile.authorityVerification')}
                        </p>
                      </div>

                      {req.notes && (
                        <div style={{ background: 'var(--surface)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-3)' }}>
                          <p style={{ margin: '0 0 4px 0', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>{t('admin.requestedNotes')}:</p>
                          <p style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>{req.notes}</p>
                        </div>
                      )}

                      {req.document_path && (
                        <div style={{ background: 'var(--surface)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-3)' }}>
                          <p style={{ margin: '0 0 4px 0', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>{t('admin.viewDocument')}:</p>
                          <a href={`/uploads/${req.document_path}`} target="_blank" rel="noopener noreferrer" className="text-link" style={{ fontSize: 'var(--font-size-sm)' }}>
                            📄 {req.document_path.split('/').pop()}
                          </a>
                        </div>
                      )}

                      {req.rejection_reason && (
                        <div style={{ background: 'var(--danger-50)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-3)', borderLeft: '3px solid var(--danger-500)' }}>
                          <p style={{ margin: '0 0 4px 0', fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--danger-700)' }}>{t('profile.rejectionReason')}:</p>
                          <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--danger-900)' }}>{req.rejection_reason}</p>
                        </div>
                      )}

                      {req.status === 'pending' && (
                        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                          <button
                            className="btn btn-primary flex-1"
                            onClick={() => approveVerification(req.id)}
                            disabled={verificationProcessing === req.id}
                          >
                            <CheckCircle size={14} /> {verificationProcessing === req.id ? t('common.loading') : t('admin.approveVerification')}
                          </button>
                          <button
                            className="btn btn-outline flex-1"
                            onClick={() => setRejectingRequestId(req.id)}
                            disabled={verificationProcessing === req.id}
                          >
                            <AlertCircle size={14} /> {t('admin.rejectVerification')}
                          </button>
                        </div>
                      )}

                      {rejectingRequestId === req.id && (
                        <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--danger-50)', borderRadius: 'var(--radius-sm)' }}>
                          <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
                            {t('admin.enterRejectionReason')}:
                          </label>
                          <textarea
                            className="form-input"
                            placeholder={t('admin.rejectionReasonPlaceholder')}
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            rows={3}
                            style={{ marginBottom: 'var(--space-2)', fontSize: 'var(--font-size-sm)' }}
                          />
                          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                            <button
                              className="btn btn-danger flex-1"
                              onClick={() => rejectVerification(req.id)}
                              disabled={verificationProcessing === req.id}
                            >
                              {verificationProcessing === req.id ? t('common.loading') : t('admin.confirmReject')}
                            </button>
                            <button
                              className="btn btn-ghost flex-1"
                              onClick={() => { setRejectingRequestId(null); setRejectionReason('') }}
                              disabled={verificationProcessing === req.id}
                            >
                              {t('common.cancel')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Audit Log */}
        {section === 'audit' && auditLog && !loading && (
          <div className="animate-fade-in">
            <h1 style={{ marginBottom: 'var(--space-6)' }}>{t('admin.auditLog')}</h1>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t('admin.action')}</th>
                    <th>Resource</th>
                    <th>{t('admin.user')}</th>
                    <th>{t('admin.role')}</th>
                    <th>IP</th>
                    <th>{t('admin.details')}</th>
                    <th>{t('admin.timestamp')}</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.rows.map(entry => {
                    const details = entry.details ? (typeof entry.details === 'string' ? JSON.parse(entry.details) : entry.details) : null
                    const detailsText = details ? Object.entries(details).map(([k, v]) => `${k}: ${v}`).join(', ') : '—'
                    return (
                      <tr
                        key={entry.id}
                        onClick={() => {
                          setSelectedAuditEntry(entry)
                          setAuditSheetOpen(true)
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <td><code style={{ fontSize: '11px', background: 'var(--surface)', padding: '2px 6px', borderRadius: '4px' }}>{entry.action}</code></td>
                        <td style={{ fontSize: '13px' }}>{entry.resource}</td>
                        <td style={{ fontSize: '12px' }}>{entry.account_email || entry.account_name || (entry.account_id ? entry.account_id.substring(0, 8) : '—')}</td>
                        <td>
                          {entry.account_role ? (
                            <span className="badge badge-info" style={{ fontSize: '10px' }}>{entry.account_role}</span>
                          ) : <span className="text-muted">—</span>}
                        </td>
                        <td style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{entry.ip || '—'}</td>
                        <td style={{ fontSize: '11px', color: 'var(--text-tertiary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={detailsText}>{detailsText}</td>
                        <td className="text-tertiary" style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>{new Date(entry.created_at).toLocaleString(i18n.language === 'de' ? 'de-AT' : 'en-GB')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center', marginTop: 'var(--space-6)', alignItems: 'center' }}>
              <button
                className="btn btn-outline"
                onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                disabled={auditPage === 1}
              >
                {t('common.back')}
              </button>
              <span className="text-muted" style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                {auditPage} / {auditLog.pages}
              </span>
              <button
                className="btn btn-outline"
                onClick={() => setAuditPage(p => p + 1)}
                disabled={auditPage === auditLog.pages}
              >
                {t('admin.next')}
              </button>
            </div>
          </div>
        )}

        {/* Settings */}
        {section === 'settings' && !loading && (
          <div className="animate-fade-in">
            <h1 style={{ marginBottom: 'var(--space-6)' }}>{t('admin.settings')}</h1>
            <div className="card">
              <div className="form-group">
                <label className="form-label">{t('admin.appName')}</label>
                <input className="form-input" value={appSettings.app_name || ''} onChange={e => setAppSettings({...appSettings, app_name: e.target.value})} placeholder="z.B. Tierarztpraxis Huber" />
              </div>
              <div className="form-group">
                <label className="form-label">{t('admin.themeColor')}</label>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <input type="color" value={appSettings.theme_color || '#0ea5e9'} onChange={e => setAppSettings({...appSettings, theme_color: e.target.value})} style={{ width: '40px', height: '40px', padding: 0, border: 'none', borderRadius: 'var(--radius-sm)' }} />
                  <input className="form-input" value={appSettings.theme_color || '#0ea5e9'} onChange={e => setAppSettings({...appSettings, theme_color: e.target.value})} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('admin.logo')}</label>
                <input type="file" accept="image/*" className="form-input" onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) {
                    const reader = new FileReader()
                    reader.onload = ev => setAppSettings({...appSettings, logo_data: ev.target?.result as string})
                    reader.readAsDataURL(file)
                  }
                }} />
                {appSettings.logo_data && <img src={appSettings.logo_data} alt="Logo" style={{ marginTop: 'var(--space-3)', maxHeight: '80px', borderRadius: 'var(--radius-md)' }} />}
              </div>
              <button className="btn btn-primary" onClick={saveSettings} disabled={settingsSaving} style={{ marginTop: 'var(--space-4)' }}>
                {settingsSaving ? t('common.loading') : t('admin.saveSettings')}
              </button>
            </div>
          </div>
        )}

        {/* Cleanup */}
        {section === 'cleanup' && !loading && (
          <div className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-4)', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
              <div>
                <h1 style={{ marginBottom: 'var(--space-2)' }}>{t('admin.cleanup')}</h1>
                <p className="text-muted" style={{ margin: 0 }}>
                  {t('admin.cleanupDescription')}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <button className="btn btn-outline" onClick={() => loadData()}>
                  {t('common.refresh') || 'Refresh'}
                </button>
                <button className="btn btn-danger" disabled={selectedOrphanCategories.length === 0 || orphanDeleting} onClick={() => deleteSelectedOrphans()}>
                  {orphanDeleting ? t('common.loading') : t('admin.deleteSelectedOrphans')}
                </button>
              </div>
            </div>

            {orphanCategories.length === 0 ? (
              <div className="card text-center" style={{ padding: 'var(--space-8)' }}>
                <CheckCircle size={48} color="var(--success-600)" style={{ margin: '0 auto var(--space-4)' }} />
                <p style={{ margin: 0, fontWeight: 600 }}>{t('admin.noOrphans')}</p>
              </div>
            ) : (
              <>
                <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
                  <label className="form-label">{t('common.search')}</label>
                  <input
                    className="form-input"
                    value={orphanFilter}
                    onChange={e => setOrphanFilter(e.target.value)}
                    placeholder={`${t('common.search')}...`}
                  />
                </div>
                <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
                  {filteredOrphanCategories.length === 0 && (
                    <div className="card text-center" style={{ padding: 'var(--space-6)' }}>
                      <p className="text-muted" style={{ margin: 0 }}>{t('admin.noOrphans')}</p>
                    </div>
                  )}
                  {filteredOrphanCategories.map(category => (
                    <div key={category.key} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4)', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={selectedOrphanCategories.includes(category.key)}
                            onChange={() => toggleOrphanCategory(category.key)}
                            style={{ width: 16, height: 16, accentColor: 'var(--danger-500)' }}
                          />
                          <div>
                            <div style={{ fontWeight: 600 }}>{t(`admin.orphanCategory.${category.key}` as any, category.label)}</div>
                            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>{category.count} {t('admin.orphanedItems')}</div>
                          </div>
                        </label>
                        <button className="btn btn-danger" onClick={() => deleteSelectedOrphans([category.key])} disabled={orphanDeleting}>
                          {t('admin.deleteCategory')}
                        </button>
                      </div>

                      <div style={{ overflowX: 'auto' }}>
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>ID</th>
                              <th>{t('admin.name')}</th>
                              <th>{t('admin.reference')}</th>
                              <th>{t('admin.timestamp')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {category.items.map(item => (
                              <tr key={item.id}>
                                <td><code>{item.id}</code></td>
                                <td>{item.title || '—'}</td>
                                <td><code>{item.reference || '—'}</code></td>
                                <td>{item.created_at ? String(item.created_at) : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Tests Section */}
        {section === 'tests' && !loading && testResults && (
          <div className="animate-fade-in">
            <h1 style={{ marginBottom: 'var(--space-4)' }}>{t('admin.tests')}</h1>
            <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)' }}>
              <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--success-600)', fontWeight: 600 }}>{testResults.tests?.numPassedTests || 0}</span> / <span style={{ color: testResults.tests?.numFailedTests ? 'var(--danger-600)' : 'var(--text-secondary)' }}>{(testResults.tests?.numPassedTests || 0) + (testResults.tests?.numFailedTests || 0)}</span> Tests
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {testResults.tests ? (() => {
                  const allTests: TestCase[] = []
                  if (Array.isArray(testResults.tests.testResults)) {
                    for (const suite of testResults.tests.testResults) {
                      const results = suite.assertionResults || suite.testResults || []
                      if (Array.isArray(results)) allTests.push(...results)
                    }
                  }

                  if (allTests.length === 0) {
                    return <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-tertiary)' }}>{t('admin.noTestResults')}</div>
                  }

                  const groups = new Map<string, TestCase[]>()
                  for (const test of allTests) {
                    const titles = test.ancestorTitles ?? []
                    // nested describes (e.g. "PAWvax API Tests > 1. Authentication") → use index 1
                    // root-level describes (e.g. "Suite 11: …") → use index 0
                    const groupName = titles.length > 1 ? titles[1] : (titles[0] ?? 'Other')
                    if (!groups.has(groupName)) groups.set(groupName, [])
                    groups.get(groupName)!.push(test)
                  }

                  return Array.from(groups.entries()).map(([groupName, tests]) => (
                    <div key={groupName}>
                      <div style={{ padding: 'var(--space-3)', paddingLeft: 'var(--space-4)', background: 'var(--surface)', borderBottom: '1px solid var(--border)', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {groupName}
                      </div>
                      {tests.map((test, testIdx) => (
                        <div
                          key={`${groupName}-${testIdx}`}
                          onClick={() => setSelectedTest(test)}
                          style={{
                            padding: 'var(--space-3)',
                            paddingLeft: 'var(--space-6)',
                            borderBottom: '1px solid var(--border)',
                            cursor: 'pointer',
                            background: selectedTest === test ? 'var(--primary-50)' : 'transparent',
                            transition: 'all 0.2s'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
                            <div style={{ marginTop: '2px', flexShrink: 0 }}>
                              {test.status === 'passed' ? (
                                <CheckCircle size={16} color="var(--success-600)" />
                              ) : (
                                <XCircle size={16} color="var(--danger-500)" />
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500, lineHeight: 1.4, wordBreak: 'break-word' }}>
                                {test.title}
                              </div>
                              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                {test.duration}ms
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
                })() : (
                  <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                    {t('admin.noTestResults')}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {section === 'tests' && !loading && !testResults && (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-tertiary)' }}>{t('admin.noTestResults')}</p>
          </div>
        )}
      </main>

      {section === 'tests' && selectedTest && (
        <div className="admin-detail-panel animate-slide-up" style={{ boxShadow: 'var(--shadow-xl)' }}>
          <h2 style={{ marginBottom: 'var(--space-4)' }}>{t('admin.testDetails')}</h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
            {selectedTest.status === 'passed' ? (
              <CheckCircle size={20} color="var(--success-600)" />
            ) : (
              <XCircle size={20} color="var(--danger-500)" />
            )}
            <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, color: selectedTest.status === 'passed' ? 'var(--success-600)' : 'var(--danger-500)' }}>
              {selectedTest.status === 'passed' ? t('admin.testsPassed') : t('admin.testsFailed')}
            </span>
          </div>

          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Title</label>
            <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500, marginTop: '4px', wordBreak: 'break-word' }}>
              {selectedTest.title}
            </div>
          </div>

          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Suite</label>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {selectedTest.ancestorTitles.slice(1).join(' › ')}
            </div>
          </div>

          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Duration</label>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {selectedTest.duration}ms
            </div>
          </div>

          {selectedTest.failureMessages && selectedTest.failureMessages.length > 0 && (
            <div>
              <label style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', color: 'var(--text-tertiary)', display: 'block', marginBottom: 'var(--space-2)' }}>Error Message</label>
              <pre style={{ background: 'var(--surface)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, color: 'var(--danger-600)' }}>
                {selectedTest.failureMessages.join('\n')}
              </pre>
            </div>
          )}
        </div>
      )}

      {selectedAccount && (
        <div className="admin-detail-panel animate-slide-up" style={{ boxShadow: 'var(--shadow-xl)' }}>
          <h2 style={{ marginBottom: '2px' }}>{selectedAccount.name}</h2>
          <p className="text-muted" style={{ margin: 0, marginBottom: 'var(--space-4)' }}>{selectedAccount.email}</p>

          <hr className="divider" style={{ margin: 'var(--space-4) 0' }} />

          <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>{t('profile.roles')}</h3>
          <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
            {['user', 'vet', 'authority', 'admin'].map(r => (
              <label key={r} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', cursor: 'pointer', padding: 'var(--space-2) 0' }}>
                <input
                  type="checkbox"
                  style={{ width: 16, height: 16, accentColor: 'var(--primary-500)' }}
                  checked={selectedAccount.role.includes(r)}
                  onChange={e => {
                    const roles = selectedAccount.role.split(',').map(x => x.trim())
                    const next = e.target.checked ? [...roles, r] : roles.filter(x => x !== r)
                    adminPatchAccount(selectedAccount.id, { role: next.join(',') }).then(() => loadData())
                  }}
                />
                <span style={{ fontSize: 'var(--font-size-sm)', textTransform: 'capitalize' }}>{r}</span>
              </label>
            ))}
          </div>

          <button
            className="btn btn-danger btn-full"
            onClick={() => {
              if (confirm(`${t('admin.deleteAccount')} "${selectedAccount.name}"?`)) {
                adminDeleteAccount(selectedAccount.id).then(() => {
                  setSelectedId(null)
                  loadData()
                })
              }
            }}
            style={{ marginTop: 'var(--space-6)', marginBottom: 'var(--space-3)' }}
          >
            {t('admin.deleteAccount')}
          </button>

          <button className="btn btn-outline btn-full" onClick={() => setSelectedId(null)}>
            {t('common.cancel')}
          </button>
        </div>
      )}

      {selectedAnimal && (
        <div className="admin-detail-panel animate-slide-up" style={{ boxShadow: 'var(--shadow-xl)' }}>
          <h2 style={{ marginBottom: '2px' }}>{selectedAnimal.name}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 'var(--space-2)' }}>
            {selectedAnimal.species === 'cat' ? <Cat size={14} color="var(--text-tertiary)" /> : <PawPrint size={14} color="var(--text-tertiary)" />}
            <span className="text-muted" style={{ textTransform: 'capitalize' }}>{selectedAnimal.species}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            <div>
              <p className="text-tertiary" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px 0' }}>{t('animals.breed')}</p>
              <p style={{ margin: 0, fontWeight: 500 }}>{selectedAnimal.breed || '—'}</p>
            </div>
            <div>
              <p className="text-tertiary" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px 0' }}>{t('animal.birthdate')}</p>
              <p style={{ margin: 0, fontWeight: 500 }}>{selectedAnimal.birthdate || '—'}</p>
            </div>
          </div>

          <hr className="divider" style={{ margin: 'var(--space-6) 0' }} />

          <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>{t('admin.ownerInfo')}</h3>
          <div className="card card-sm" style={{ background: 'var(--surface)', border: 'none' }}>
            <p style={{ margin: '0 0 4px 0', fontWeight: 600 }}>{selectedAnimal.owner_name}</p>
            <p className="text-muted" style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>{selectedAnimal.owner_email}</p>
          </div>

          <button
            className="btn btn-danger btn-full"
            onClick={() => {
              if (confirm(`${t('admin.deleteAnimal')} "${selectedAnimal.name}"?`)) {
                adminDeleteAnimal(selectedAnimal.id).then(() => {
                  setSelectedId(null)
                  loadData()
                })
              }
            }}
            style={{ marginTop: 'var(--space-6)', marginBottom: 'var(--space-3)' }}
          >
            {t('admin.deleteAnimal')}
          </button>
          <button
            className="btn btn-outline btn-full"
            onClick={() => setSelectedId(null)}
          >
            {t('common.cancel')}
          </button>
        </div>
      )}

      {/* Audit Entry Detail Sheet */}
      <Sheet open={auditSheetOpen} onOpenChange={setAuditSheetOpen}>
        <SheetContent
          side="right"
          style={{
            width: 420,
            maxWidth: '90vw',
            background: 'var(--bg-elevated)',
            borderLeft: '1px solid var(--border-subtle)',
            padding: 'var(--space-6)',
          }}
        >
          {selectedAuditEntry && (
            <>
              <SheetHeader style={{ marginBottom: 'var(--space-5)' }}>
                <SheetTitle
                  style={{
                    fontFamily: 'var(--font-display)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <code
                    style={{
                      background: 'var(--surface)',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-xs)',
                      fontWeight: 700,
                    }}
                  >
                    {selectedAuditEntry.action}
                  </code>
                </SheetTitle>
                <SheetDescription
                  style={{
                    color: 'var(--text-tertiary)',
                    fontSize: 'var(--font-size-xs)',
                  }}
                >
                  {new Date(selectedAuditEntry.created_at).toLocaleString(
                    i18n.language === 'de' ? 'de-AT' : 'en-GB'
                  )}
                </SheetDescription>
              </SheetHeader>

              {/* Resource */}
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <p
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    textTransform: 'uppercase',
                    color: 'var(--text-tertiary)',
                    margin: '0 0 4px',
                  }}
                >
                  Resource
                </p>
                <p style={{ margin: 0, fontWeight: 600 }}>
                  {selectedAuditEntry.resource}
                </p>
                {selectedAuditEntry.resource_id && (
                  <code
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--text-tertiary)',
                    }}
                  >
                    {selectedAuditEntry.resource_id}
                  </code>
                )}
              </div>

              {/* User */}
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <p
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    textTransform: 'uppercase',
                    color: 'var(--text-tertiary)',
                    margin: '0 0 4px',
                  }}
                >
                  {t('admin.user')}
                </p>
                <p style={{ margin: 0, fontWeight: 600 }}>
                  {selectedAuditEntry.account_email ||
                    selectedAuditEntry.account_name ||
                    '—'}
                </p>
                {selectedAuditEntry.account_role && (
                  <span
                    className="badge badge-info"
                    style={{ fontSize: '11px', marginTop: 4 }}
                  >
                    {selectedAuditEntry.account_role}
                  </span>
                )}
              </div>

              {/* IP */}
              {selectedAuditEntry.ip && (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <p
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      textTransform: 'uppercase',
                      color: 'var(--text-tertiary)',
                      margin: '0 0 4px',
                    }}
                  >
                    IP
                  </p>
                  <code style={{ fontSize: 'var(--font-size-sm)' }}>
                    {selectedAuditEntry.ip}
                  </code>
                </div>
              )}

              {/* Details JSON */}
              {selectedAuditEntry.details && (
                <div>
                  <p
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      textTransform: 'uppercase',
                      color: 'var(--text-tertiary)',
                      margin: '0 0 8px',
                    }}
                  >
                    {t('admin.details')}
                  </p>
                  <pre
                    style={{
                      background: 'var(--surface)',
                      padding: 'var(--space-4)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 'var(--font-size-xs)',
                      overflow: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: 300,
                      fontFamily: 'var(--font-mono)',
                      margin: 0,
                    }}
                  >
                    {JSON.stringify(
                      typeof selectedAuditEntry.details === 'string'
                        ? JSON.parse(selectedAuditEntry.details)
                        : selectedAuditEntry.details,
                      null,
                      2
                    )}
                  </pre>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
