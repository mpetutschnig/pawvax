import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bell, CheckCircle, ChevronRight } from 'lucide-react'
import { getReminders, dismissReminder } from '../api/rest'

interface Reminder {
  id: string
  animal_id: string
  animal_name: string
  document_id: string | null
  title: string
  due_date: string
  notes: string | null
  dismissed_at: string | null
  created_at: string
}

export default function RemindersPage() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissing, setDismissing] = useState<string | null>(null)

  useEffect(() => {
    getReminders()
      .then(res => {
        const data: Reminder[] = res.data
        if (data.length === 0) {
          navigate('/animals', { replace: true })
        } else {
          setReminders(data)
        }
      })
      .catch(() => navigate('/animals', { replace: true }))
      .finally(() => setLoading(false))
  }, [navigate])

  const handleDismiss = async (id: string) => {
    setDismissing(id)
    try {
      await dismissReminder(id)
      const remaining = reminders.filter(r => r.id !== id)
      if (remaining.length === 0) {
        navigate('/animals', { replace: true })
      } else {
        setReminders(remaining)
      }
    } catch {
      // ignore, UI stays
    } finally {
      setDismissing(null)
    }
  }

  const getDueDateStyle = (due_date: string): React.CSSProperties => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const due = new Date(due_date)
    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays < 0) return { color: 'var(--error-600)', fontWeight: 700 }
    if (diffDays <= 14) return { color: 'var(--warning-600)', fontWeight: 600 }
    return { color: 'var(--text-secondary)' }
  }

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(i18n.language === 'de' ? 'de-AT' : 'en-GB')

  // Group by animal
  const grouped = reminders.reduce<Record<string, Reminder[]>>((acc, r) => {
    if (!acc[r.animal_id]) acc[r.animal_id] = []
    acc[r.animal_id].push(r)
    return acc
  }, {})

  if (loading) {
    return (
      <div className="container page" style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}>
        <div className="spinner spinner-lg"></div>
      </div>
    )
  }

  return (
    <div className="container page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)', marginTop: 'var(--space-2)' }}>
        <Bell size={24} color="var(--primary-500)" />
        <h1 style={{ margin: 0, fontSize: 'var(--font-size-xl)' }}>{t('reminders.title')}</h1>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        {Object.entries(grouped).map(([animalId, animalReminders]) => (
          <div key={animalId}>
            <h2 style={{ margin: '0 0 var(--space-3) 0', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '11px', fontWeight: 600 }}>
              {animalReminders[0].animal_name}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {animalReminders.map(reminder => (
                <div key={reminder.id} className="card animate-slide-up" style={{ padding: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: '0 0 var(--space-1) 0', fontWeight: 600, fontSize: 'var(--font-size-base)', wordBreak: 'break-word' }}>
                        {reminder.title}
                      </p>
                      <p style={{ margin: '0 0 var(--space-2) 0', fontSize: 'var(--font-size-sm)', ...getDueDateStyle(reminder.due_date) }}>
                        {t('reminders.due')}: {formatDate(reminder.due_date)}
                      </p>
                      {reminder.notes && (
                        <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', whiteSpace: 'pre-line' }}>
                          {reminder.notes}
                        </p>
                      )}
                    </div>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '6px', flexShrink: 0 }}
                      onClick={() => handleDismiss(reminder.id)}
                      disabled={dismissing === reminder.id}
                      title={t('reminders.dismiss')}
                    >
                      {dismissing === reminder.id
                        ? <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                        : <CheckCircle size={22} color="var(--success-600)" />
                      }
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 'var(--space-8)', textAlign: 'center' }}>
        <button className="btn btn-primary btn-full" onClick={() => navigate('/animals')}>
          {t('reminders.continue')} <ChevronRight size={18} />
        </button>
      </div>
    </div>
  )
}
