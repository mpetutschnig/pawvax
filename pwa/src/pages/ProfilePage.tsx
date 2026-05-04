import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getMe, patchMe, deleteMe, requestVerification, getMyVerifications } from '../api/rest'
import { PageHeader } from '../components/PageHeader'
import { User, Shield, Stethoscope, Settings, Trash2, CheckCircle, Clock, AlertTriangle, Key, BookOpen, Download, Upload, X } from 'lucide-react'

export default function ProfilePage() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [geminiToken, setGeminiToken] = useState('')
  const [geminiError, setGeminiError] = useState('')
  const [geminiSuccess, setGeminiSuccess] = useState('')
  const [anthropicToken, setAnthropicToken] = useState('')
  const [claudeError, setClaudeError] = useState('')
  const [claudeSuccess, setClaudeSuccess] = useState('')
  const [openaiToken, setOpenaiToken] = useState('')
  const [openaiError, setOpenaiError] = useState('')
  const [openaiSuccess, setOpenaiSuccess] = useState('')
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [geminiModel, setGeminiModel] = useState('')
  const [claudeModel, setClaudeModel] = useState('')
  const [openaiModel, setOpenaiModel] = useState('')
  const [aiPriority, setAiPriority] = useState<string[]>(['system', 'google', 'anthropic', 'openai'])
  const [modelSaving, setModelSaving] = useState(false)
  const [requestedRole, setRequestedRole] = useState<string>('vet')
  const [verificationNotes, setVerificationNotes] = useState('')
  const [verificationDocument, setVerificationDocument] = useState<File | null>(null)
  const [verificationSubmitting, setVerificationSubmitting] = useState(false)
  const [verificationRequests, setVerificationRequests] = useState<any[]>([])
  const [showVerificationForm, setShowVerificationForm] = useState(false)

  useEffect(() => {
    loadProfile()
    loadVerificationRequests()
  }, [])

  const loadVerificationRequests = async () => {
    try {
      const res = await getMyVerifications()
      setVerificationRequests(res.data.requests || [])
    } catch (err) {
      console.error('Failed to load verification requests', err)
    }
  }

  const loadProfile = async () => {
    try {
      const res = await getMe()
      setProfile(res.data)
      setGeminiModel(res.data.gemini_model || 'gemini-3.1-flash-lite-preview')
      setClaudeModel(res.data.claude_model || 'claude-haiku-4-5-20251001')
      setOpenaiModel(res.data.openai_model || 'gpt-4o-mini')
      
      try {
        if (res.data.ai_provider_priority) {
          setAiPriority(typeof res.data.ai_provider_priority === 'string' ? JSON.parse(res.data.ai_provider_priority) : res.data.ai_provider_priority)
        }
      } catch {}

      setGeminiToken('')
      setAnthropicToken('')
      setOpenaiToken('')
      setError(null)
    } catch (err) {
      setError(t('profile.loadError'))
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const saveGeminiToken = async () => {
    if (!geminiToken) return
    setSaving(true)
    setGeminiError('')
    setGeminiSuccess('')
    try {
      // Validate key
      const validateRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview?key=${geminiToken}`)
      if (!validateRes.ok) {
        throw new Error(t('profile.geminiInvalid'))
      }

      await patchMe({ gemini_token: geminiToken || null })
      setGeminiSuccess(t('profile.geminiSuccess'))
      setGeminiToken('')
      setTimeout(() => {
        loadProfile()
        setGeminiSuccess('')
      }, 3000)
    } catch (err) {
      setGeminiError(err instanceof Error ? err.message : t('profile.geminiError'))
    } finally {
      setSaving(false)
    }
  }

  const clearGeminiToken = async () => {
    setSaving(true)
    try {
      await patchMe({ gemini_token: null })
      setSuccess(t('profile.deleteSuccess'))
      setGeminiToken('')
      setTimeout(() => {
        loadProfile()
        setSuccess(null)
      }, 1000)
    } catch (err) {
      setError(t('profile.saveError'))
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const saveGeminiModel = async (model: string) => {
    setModelSaving(true)
    try {
      await patchMe({ gemini_model: model })
      setGeminiModel(model)
      setSuccess(t('profile.modelSaved'))
      setTimeout(() => setSuccess(null), 2000)
    } catch (err) {
      setError(t('profile.saveError'))
      console.error(err)
    } finally {
      setModelSaving(false)
    }
  }

  const saveAnthropicToken = async () => {
    if (!anthropicToken) return
    setSaving(true)
    setClaudeError('')
    setClaudeSuccess('')
    try {
      // Validate key by calling Claude API
      const validateRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicToken,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'test' }]
        })
      })
      if (!validateRes.ok) {
        throw new Error(t('profile.claudeInvalid') || 'Invalid API key')
      }

      await patchMe({ anthropic_token: anthropicToken || null })
      setClaudeSuccess(t('profile.claudeSuccess') || 'Claude API key saved')
      setAnthropicToken('')
      setTimeout(() => {
        loadProfile()
        setClaudeSuccess('')
      }, 3000)
    } catch (err) {
      setClaudeError(err instanceof Error ? err.message : t('profile.claudeError') || 'Error saving key')
    } finally {
      setSaving(false)
    }
  }

  const clearAnthropicToken = async () => {
    setSaving(true)
    try {
      await patchMe({ anthropic_token: null })
      setSuccess(t('profile.deleteSuccess'))
      setAnthropicToken('')
      setTimeout(() => {
        loadProfile()
        setSuccess(null)
      }, 1000)
    } catch (err) {
      setError(t('profile.saveError'))
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const saveClaudeModel = async (model: string) => {
    setModelSaving(true)
    try {
      await patchMe({ claude_model: model })
      setClaudeModel(model)
      setSuccess(t('profile.modelSaved'))
      setTimeout(() => setSuccess(null), 2000)
    } catch (err) {
      setError(t('profile.saveError'))
      console.error(err)
    } finally {
      setModelSaving(false)
    }
  }

  const saveOpenaiToken = async () => {
    if (!openaiToken) return
    setSaving(true)
    setOpenaiError('')
    setOpenaiSuccess('')
    try {
      // Minimal validation for OpenAI key
      const validateRes = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${openaiToken}` }
      })
      if (!validateRes.ok) throw new Error(t('profile.openaiInvalid'))

      await patchMe({ openai_token: openaiToken || null })
      setOpenaiSuccess(t('profile.openaiSaved'))
      setOpenaiToken('')
      setTimeout(() => {
        loadProfile()
        setOpenaiSuccess('')
      }, 3000)
    } catch (err) {
      setOpenaiError(err instanceof Error ? err.message : t('profile.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const clearOpenaiToken = async () => {
    setSaving(true)
    try {
      await patchMe({ openai_token: null })
      setSuccess(t('profile.deleteSuccess'))
      setOpenaiToken('')
      setTimeout(() => {
        loadProfile()
        setSuccess(null)
      }, 1000)
    } catch (err) {
      setError(t('profile.saveError'))
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const saveOpenaiModel = async (model: string) => {
    setModelSaving(true)
    try {
      await patchMe({ openai_model: model })
      setOpenaiModel(model)
      setSuccess(t('profile.modelSaved'))
      setTimeout(() => setSuccess(null), 2000)
    } catch (err) {
      setError(t('profile.saveError'))
    } finally {
      setModelSaving(false)
    }
  }

  const updatePriority = async (newPriority: string[]) => {
    setAiPriority(newPriority)
    try {
      await patchMe({ ai_provider_priority: JSON.stringify(newPriority) })
      setSuccess(t('common.success'))
      setTimeout(() => setSuccess(null), 2000)
    } catch (err) {
      setError(t('profile.saveError'))
    }
  }

  const requestVerify = async () => {
    if (!verificationNotes.trim() && !verificationDocument) {
      setError(t('profile.verificationMinRequired'))
      return
    }
    try {
      setVerificationSubmitting(true)
      await requestVerification(
        requestedRole as 'vet' | 'authority',
        verificationNotes || undefined,
        verificationDocument || undefined
      )
      setVerificationNotes('')
      setVerificationDocument(null)
      setShowVerificationForm(false)
      await loadProfile()
      await loadVerificationRequests()
      setSuccess(t('profile.requestVerificationSuccess'))
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || t('common.error'))
    } finally {
      setVerificationSubmitting(false)
    }
  }

  const handleTakeout = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/accounts/me/export', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!response.ok) throw new Error('Download failed')
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `paw_takeout_${new Date().toISOString().slice(0, 10)}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(t('profile.takeoutError'))
    }
  }

  const handleDelete = async () => {
    if (deleteConfirmEmail.toLowerCase() !== (profile?.email || '').toLowerCase()) {
      setError(t('profile.emailMismatch'))
      return
    }
    try {
      await deleteMe()
      localStorage.removeItem('token')
      localStorage.removeItem('role')
      localStorage.removeItem('roles')
      localStorage.removeItem('verified')
      navigate('/login')
    } catch (err) {
      setError(t('profile.deleteError'))
      console.error(err)
    }
  }

  if (loading) return <div className="container page" style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}><div className="spinner spinner-lg"></div></div>

  if (!profile) return <div className="container page"><div className="error-card"><p>{t('profile.loadError')}</p></div></div>

  const roles = profile.roles ?? (typeof profile.role === 'string' ? profile.role.split(',').map((r: string) => r.trim()) : [])
  const isVerified = profile.verified === 1 || profile.verified === true
  const isPending = profile.verification_status === 'pending' || ((roles.includes('vet') || roles.includes('authority')) && !isVerified)
  
  const hasVerifiedRole = roles.includes('vet') || roles.includes('authority') || roles.includes('veterinarian')
  const isVet = roles.includes('veterinarian') && !isPending
  const isOrg = roles.includes('authority') && !isPending
  const isAdmin = roles.includes('admin')

  return (
    <div className="container page">
      <PageHeader title={t('profile.title')} showThemeToggle showLogout />

      {error && <div className="error-card" style={{ marginBottom: 'var(--space-4)' }}><p>{error}</p></div>}
      {success && <div className="card" style={{ background: 'var(--success-50)', borderColor: 'var(--success-500)', marginBottom: 'var(--space-4)', display: 'flex', gap: 'var(--space-2)' }}><CheckCircle size={20} color="var(--success-600)" /><p style={{ margin: 0, color: 'var(--success-600)', fontWeight: 500 }}>{success}</p></div>}

      <div className="card animate-slide-up">
        <h2 style={{ fontSize: 'var(--font-size-lg)', marginTop: 0, marginBottom: '2px' }}>{profile.name}</h2>
        <p className="text-muted" style={{ margin: 0 }}>{profile.email}</p>

        <hr className="divider" style={{ margin: 'var(--space-4) 0' }} />

        <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>{t('profile.roles')}</h3>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {roles.length > 0 ? (
            roles.map((r: string) => (
              <span key={r} className="badge badge-primary" style={{ display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'capitalize' }}>
                {r === 'user' ? <User size={12} /> : r === 'vet' ? <Stethoscope size={12} /> : r === 'authority' ? <Shield size={12} /> : <Settings size={12} />}
                {r}
              </span>
            ))
          ) : (
            <span className="text-muted">{t('profile.account')}</span>
          )}
        </div>

        {!isAdmin && (
          <>
            <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginTop: 'var(--space-6)', marginBottom: 'var(--space-3)' }}>{t('profile.verification')}</h3>
            {isVet ? (
              <p style={{ color: 'var(--success-600)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', margin: 0, fontWeight: 500 }}><CheckCircle size={18} /> {t('profile.verifiedVet')} (Zugriff aktiv)</p>
            ) : isOrg ? (
              <p style={{ color: 'var(--info-600)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', margin: 0, fontWeight: 500 }}><CheckCircle size={18} /> {t('profile.verifiedOrg')} (Zugriff aktiv)</p>
            ) : isPending ? (
              <p className="text-muted" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', margin: 0 }}><Clock size={18} /> {t('profile.verificationPending')}</p>
            ) : (
              <></>
            )}

            {/* Verification History */}
            <div style={{ marginTop: 'var(--space-4)' }}>
              {verificationRequests.length > 0 && (
                <>
                  <h4 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>{t('profile.verificationRequests')}</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {verificationRequests.map(req => (
                      <div key={req.id} className="card" style={{ padding: 'var(--space-3)', background: req.status === 'pending' ? 'var(--warning-50)' : req.status === 'approved' ? 'var(--success-50)' : 'var(--danger-50)', borderLeft: `4px solid ${req.status === 'pending' ? 'var(--warning-500)' : req.status === 'approved' ? 'var(--success-500)' : 'var(--danger-500)'}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 'var(--space-2)' }}>
                          <div>
                            <p style={{ margin: 0, fontWeight: 600, textTransform: 'capitalize' }}>
                              {req.type === 'vet' ? t('profile.vetVerification') : t('profile.authorityVerification')}
                            </p>
                            <p className="text-muted" style={{ margin: '4px 0 0 0', fontSize: 'var(--font-size-xs)' }}>
                              {new Date(req.created_at).toLocaleString()}
                            </p>
                          </div>
                          <span className="badge" style={{ background: req.status === 'pending' ? 'var(--warning-500)' : req.status === 'approved' ? 'var(--success-500)' : 'var(--danger-500)' }}>
                            {req.status === 'pending' ? t('profile.status') : req.status === 'approved' ? t('admin.approved') : t('admin.rejected')}
                          </span>
                        </div>
                        {req.notes && <p style={{ margin: '0 0 var(--space-2) 0', fontSize: 'var(--font-size-sm)' }}>{req.notes}</p>}
                        {req.rejection_reason && (
                          <div style={{ background: 'var(--danger-50)', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', marginTop: 'var(--space-2)', borderLeft: '3px solid var(--danger-500)' }}>
                            <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--danger-700)' }}>{t('profile.rejectionReason')}:</p>
                            <p style={{ margin: '4px 0 0 0', fontSize: 'var(--font-size-sm)', color: 'var(--danger-900)' }}>{req.rejection_reason}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Verification Request Form */}
            {!hasVerifiedRole && !isPending && (
              <div style={{ marginTop: 'var(--space-4)' }}>
                {!showVerificationForm ? (
                  <button className="btn btn-primary" onClick={() => setShowVerificationForm(true)}>
                    <CheckCircle size={16} /> {t('profile.requestVerification')}
                  </button>
                ) : (
                  <div className="card" style={{ background: 'var(--surface)', padding: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                      <h4 style={{ margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 600 }}>{t('profile.requestVerification')}</h4>
                      <button className="btn btn-ghost" onClick={() => { setShowVerificationForm(false); setVerificationNotes(''); setVerificationDocument(null) }} style={{ padding: '4px' }}>
                        <X size={18} />
                      </button>
                    </div>

                    <div style={{ marginBottom: 'var(--space-3)' }}>
                      <label style={{ display: 'block', fontWeight: 600, marginBottom: 'var(--space-2)', fontSize: 'var(--font-size-sm)' }}>{t('profile.verificationType')}</label>
                      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                        <label style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', cursor: 'pointer' }}>
                          <input type="radio" name="requestRole" checked={requestedRole === 'vet'}
                            onChange={() => setRequestedRole('vet')} 
                            style={{ width: 16, height: 16, accentColor: 'var(--primary-500)' }} />
                          {t('profile.vetVerification')}
                        </label>
                        <label style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', cursor: 'pointer' }}>
                          <input type="radio" name="requestRole" checked={requestedRole === 'authority'}
                            onChange={() => setRequestedRole('authority')} 
                            style={{ width: 16, height: 16, accentColor: 'var(--primary-500)' }} />
                          {t('profile.authorityVerification')}
                        </label>
                      </div>
                    </div>

                    <div style={{ marginBottom: 'var(--space-3)' }}>
                      <label style={{ display: 'block', fontWeight: 600, marginBottom: 'var(--space-2)', fontSize: 'var(--font-size-sm)' }}>{t('profile.verificationNotes')}</label>
                      <textarea
                        className="form-input"
                        placeholder={t('profile.verificationNotes')}
                        value={verificationNotes}
                        onChange={(e) => setVerificationNotes(e.target.value)}
                        rows={3}
                        style={{ resize: 'vertical' }}
                      />
                    </div>

                    <div style={{ marginBottom: 'var(--space-3)' }}>
                      <label style={{ display: 'block', fontWeight: 600, marginBottom: 'var(--space-2)', fontSize: 'var(--font-size-sm)' }}>{t('profile.attachDocument')}</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.gif"
                          onChange={(e) => setVerificationDocument(e.target.files?.[0] || null)}
                          style={{ flex: 1 }}
                        />
                        {verificationDocument && (
                          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--success-600)' }}>
                            ✓ {verificationDocument.name}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                      <button className="btn btn-outline" onClick={() => { setShowVerificationForm(false); setVerificationNotes(''); setVerificationDocument(null) }} disabled={verificationSubmitting}>
                        {t('common.cancel')}
                      </button>
                      <button className="btn btn-primary" onClick={requestVerify} disabled={verificationSubmitting}>
                        {verificationSubmitting ? <Clock size={16} /> : <Upload size={16} />} {verificationSubmitting ? t('common.loading') : t('profile.submitVerification')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginTop: 'var(--space-6)', marginBottom: 'var(--space-3)' }}>{t('profile.language')}</h3>
        <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)' }}>{t('profile.languageDesc')}</p>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button
            className={`btn ${i18n.language === 'de' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => i18n.changeLanguage('de')}
          >
            {t('profile.german')}
          </button>
          <button
            className={`btn ${i18n.language === 'en' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => i18n.changeLanguage('en')}
          >
            {t('profile.english')}
          </button>
        </div>

        <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginTop: 'var(--space-6)', marginBottom: 'var(--space-3)' }}>
          {t('profile.aiPriorityTitle')}
        </h3>
        <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)' }}>
          {t('profile.aiPriorityDesc')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {aiPriority.map((provider, index) => (
            <div key={provider} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', background: 'var(--surface)', padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 600, width: '20px' }}>{index + 1}.</span>
              <span style={{ flex: 1 }}>
                {provider === 'system' ? t('profile.systemAi') : provider === 'google' ? 'Google Gemini' : provider === 'anthropic' ? 'Anthropic Claude' : 'OpenAI'}
              </span>
              <button className="btn btn-ghost" style={{ padding: '4px' }} disabled={index === 0} onClick={() => {
                const newPrio = [...aiPriority]
                ;[newPrio[index - 1], newPrio[index]] = [newPrio[index], newPrio[index - 1]]
                updatePriority(newPrio)
              }}>↑</button>
              <button className="btn btn-ghost" style={{ padding: '4px' }} disabled={index === aiPriority.length - 1} onClick={() => {
                const newPrio = [...aiPriority]
                ;[newPrio[index + 1], newPrio[index]] = [newPrio[index], newPrio[index + 1]]
                updatePriority(newPrio)
              }}>↓</button>
            </div>
          ))}
        </div>

        <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginTop: 'var(--space-6)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Key size={18} color="var(--primary-500)" /> {t('profile.gemini')}
        </h3>
        <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)' }}>
          {t('profile.geminiDesc')}
        </p>
        <p style={{ fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)' }}>
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-500)', textDecoration: 'underline' }}>
            {t('profile.geminiCreateKey')}
          </a>
        </p>

        <h4 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginTop: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>{t('profile.model')}</h4>
        <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)' }}>{t('profile.modelDesc')}</p>
        <div className="form-group">
          <select
            className="form-select"
            value={geminiModel}
            onChange={(e) => saveGeminiModel(e.target.value)}
            disabled={modelSaving}
          >
            <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash-Lite (Standard)</option>
            <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
            <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
            <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
          </select>
        </div>

        {profile.has_gemini_token && (
          <p style={{ color: 'var(--success-600)', marginBottom: 'var(--space-3)', marginTop: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontWeight: 500 }}><CheckCircle size={16} /> {t('profile.geminiSaved')}</p>
        )}

        {!profile.has_gemini_token && (
          <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
            <input
              className="form-input"
              type="password"
              placeholder="AIza..."
              value={geminiToken}
              onChange={e => setGeminiToken(e.target.value)}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          {!profile.has_gemini_token ? (
            <button className="btn btn-primary" onClick={saveGeminiToken} disabled={saving || !geminiToken}>
              {saving ? t('profile.geminiChecking') : t('profile.geminiCheck')}
            </button>
          ) : (
            <button className="btn btn-danger" onClick={clearGeminiToken} disabled={saving}>
              {saving ? t('profile.geminiDeleting') : t('profile.geminiDelete')}
            </button>
          )}
        </div>

        {geminiError && <div className="error-card" style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)' }}><p style={{ margin: 0 }}>{geminiError}</p></div>}
        {geminiSuccess && <div className="card" style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--success-50)', borderColor: 'var(--success-500)', display: 'flex', gap: 'var(--space-2)' }}><CheckCircle size={16} color="var(--success-600)" /><p style={{ margin: 0, color: 'var(--success-600)', fontWeight: 500, fontSize: 'var(--font-size-sm)' }}>{geminiSuccess}</p></div>}

        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'color-mix(in oklch, var(--warning-500) 12%, var(--surface))', borderRadius: 'var(--radius-md)', border: '1px solid color-mix(in oklch, var(--warning-500) 30%, transparent)' }}>
          <AlertTriangle size={16} color="var(--warning-600)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <p style={{ fontSize: 'var(--font-size-xs)', margin: 0, color: 'var(--text-primary)' }}>
            {t('profile.geminiWarning')}
          </p>
        </div>

        <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginTop: 'var(--space-6)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Key size={18} color="var(--primary-500)" /> {t('profile.claude')}
        </h3>
        <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)' }}>
          {t('profile.claudeDesc')}
        </p>
        <p style={{ fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)' }}>
          <a href="https://console.anthropic.com/account/keys" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-500)', textDecoration: 'underline' }}>
            {t('profile.claudeCreateKey')}
          </a>
        </p>

        <h4 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginTop: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>{t('profile.model')}</h4>
        <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)' }}>{t('profile.modelDesc')}</p>
        <div className="form-group">
          <select
            className="form-select"
            value={claudeModel}
            onChange={(e) => saveClaudeModel(e.target.value)}
            disabled={modelSaving}
          >
            <option value="claude-haiku-4-5-20251001">Claude Haiku (Standard)</option>
            <option value="claude-sonnet-4-6">Claude Sonnet</option>
            <option value="claude-opus-4-7">Claude Opus</option>
          </select>
        </div>

        {profile.has_anthropic_token && (
          <p style={{ color: 'var(--success-600)', marginBottom: 'var(--space-3)', marginTop: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontWeight: 500 }}><CheckCircle size={16} /> {t('profile.claudeSaved')}</p>
        )}

        {!profile.has_anthropic_token && (
          <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
            <input
              className="form-input"
              type="password"
              placeholder="sk-ant-..."
              value={anthropicToken}
              onChange={e => setAnthropicToken(e.target.value)}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          {!profile.has_anthropic_token ? (
            <button className="btn btn-primary" onClick={saveAnthropicToken} disabled={saving || !anthropicToken}>
              {saving ? t('profile.claudeChecking') : t('profile.claudeCheck')}
            </button>
          ) : (
            <button className="btn btn-danger" onClick={clearAnthropicToken} disabled={saving}>
              {saving ? t('profile.claudeDeleting') : t('profile.claudeDelete')}
            </button>
          )}
        </div>

        {claudeError && <div className="error-card" style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)' }}><p style={{ margin: 0 }}>{claudeError}</p></div>}
        {claudeSuccess && <div className="card" style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--success-50)', borderColor: 'var(--success-500)', display: 'flex', gap: 'var(--space-2)' }}><CheckCircle size={16} color="var(--success-600)" /><p style={{ margin: 0, color: 'var(--success-600)', fontWeight: 500, fontSize: 'var(--font-size-sm)' }}>{claudeSuccess}</p></div>}

        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'color-mix(in oklch, var(--warning-500) 12%, var(--surface))', borderRadius: 'var(--radius-md)', border: '1px solid color-mix(in oklch, var(--warning-500) 30%, transparent)' }}>
          <AlertTriangle size={16} color="var(--warning-600)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <p style={{ fontSize: 'var(--font-size-xs)', margin: 0, color: 'var(--text-primary)' }}>
            {t('profile.aiWarning')}
          </p>
        </div>

        <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginTop: 'var(--space-6)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Key size={18} color="var(--primary-500)" /> OpenAI
        </h3>
        
        <h4 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginTop: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>{t('profile.model')}</h4>
        <div className="form-group">
          <select
            className="form-select"
            value={openaiModel}
            onChange={(e) => saveOpenaiModel(e.target.value)}
            disabled={modelSaving}
          >
            <option value="gpt-4o-mini">GPT-4o Mini (Standard)</option>
            <option value="gpt-4o">GPT-4o</option>
          </select>
        </div>

        {profile.has_openai_token && (
          <p style={{ color: 'var(--success-600)', marginBottom: 'var(--space-3)', marginTop: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontWeight: 500 }}><CheckCircle size={16} /> {t('profile.openaiSaved')}</p>
        )}

        {!profile.has_openai_token && (
          <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
            <input
              className="form-input"
              type="password"
              placeholder="sk-proj-..."
              value={openaiToken}
              onChange={e => setOpenaiToken(e.target.value)}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          {!profile.has_openai_token ? (
            <button className="btn btn-primary" onClick={saveOpenaiToken} disabled={saving || !openaiToken}>
              {saving ? t('profile.openaiChecking') : t('profile.openaiCheck')}
            </button>
          ) : (
            <button className="btn btn-danger" onClick={clearOpenaiToken} disabled={saving}>
              {saving ? t('profile.openaiDeleting') : t('profile.openaiDelete')}
            </button>
          )}
        </div>
        {openaiError && <div className="error-card" style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)' }}><p style={{ margin: 0 }}>{openaiError}</p></div>}
        {openaiSuccess && <div className="card" style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--success-50)', borderColor: 'var(--success-500)', display: 'flex', gap: 'var(--space-2)' }}><CheckCircle size={16} color="var(--success-600)" /><p style={{ margin: 0, color: 'var(--success-600)', fontWeight: 500, fontSize: 'var(--font-size-sm)' }}>{openaiSuccess}</p></div>}

        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'color-mix(in oklch, var(--warning-500) 12%, var(--surface))', borderRadius: 'var(--radius-md)', border: '1px solid color-mix(in oklch, var(--warning-500) 30%, transparent)' }}>
          <AlertTriangle size={16} color="var(--warning-600)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <p style={{ fontSize: 'var(--font-size-xs)', margin: 0, color: 'var(--text-primary)' }}>
            {t('profile.aiWarning')}
          </p>
        </div>

        <hr className="divider" style={{ margin: 'var(--space-6) 0' }} />

        <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <BookOpen size={18} color="var(--primary-500)" /> {t('docs.title')}
        </h3>
        <button className="btn btn-outline btn-full" onClick={() => navigate('/docs')}>
          {t('docs.openDocs')}
        </button>

        <hr className="divider" style={{ margin: 'var(--space-6) 0' }} />

        {/* Main Section: Account & Data Management */}
        <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 'var(--space-4)', color: 'var(--danger-500)' }}>
          {t('profile.deleteAccountTitle')}
        </h3>

        {/* Subsection: Data Export (Takeout) */}
        <h4 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Download size={16} /> {t('profile.dataExport')}
        </h4>
        <p className="text-muted" style={{ fontSize: 'var(--font-size-xs)', marginBottom: 'var(--space-3)' }}>
          {t('profile.dataExportDesc')}
        </p>
        <button className="btn btn-secondary" onClick={handleTakeout} style={{ marginBottom: 'var(--space-6)' }}>
          {t('profile.dataExportBtn')}
        </button>

        {/* Subsection: Delete Account */}
        <h4 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
          {t('profile.deleteAccountDesc')}
        </h4>
        <p className="text-muted" style={{ fontSize: 'var(--font-size-xs)', marginBottom: 'var(--space-3)' }}>
          {t('profile.deleteAccountDesc')}
        </p>
        <button className="btn btn-danger" onClick={() => setShowConfirmDelete(true)}>
          <Trash2 size={16} /> {t('profile.deleteAccountBtn')}
        </button>
      </div>

      {showConfirmDelete && (
        <div className="card animate-slide-up" style={{ borderLeft: '4px solid var(--danger-500)', marginTop: 'var(--space-4)' }}>
          <h3 style={{ color: 'var(--danger-500)', marginTop: 0, marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <AlertTriangle size={20} /> {t('profile.deleteConfirm')}
          </h3>
          <p className="text-muted" style={{ marginBottom: 'var(--space-2)' }}>{t('profile.deleteConfirmDesc')}</p>
          <ul className="text-muted" style={{ marginLeft: 'var(--space-4)', marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-sm)' }}>
            <li>{t('profile.deleteList1')}</li>
            <li>{t('profile.deleteList2')}</li>
            <li>{t('profile.deleteList3')}</li>
          </ul>
          <div style={{ background: 'var(--surface)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' }}>
            <p className="text-muted" style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>{t('profile.deleteTakeoutHint')}</p>
            <button className="btn btn-secondary" onClick={handleTakeout} style={{ marginTop: 'var(--space-2)' }}>
              {t('profile.dataExportBtn')}
            </button>
          </div>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-2)', color: 'var(--danger-700)' }}>{t('profile.confirmEmailLabel')}</label>
            <input
              className="form-input"
              type="email"
              value={deleteConfirmEmail}
              onChange={e => setDeleteConfirmEmail(e.target.value)}
              placeholder={profile?.email || ''}
            />
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button className="btn btn-danger flex-1" onClick={handleDelete}>
              {t('profile.deleteYes')}
            </button>
            <button className="btn btn-ghost flex-1" onClick={() => setShowConfirmDelete(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
