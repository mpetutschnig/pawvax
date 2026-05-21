import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getPendingTasks } from '../api/rest'

interface PendingItem {
  type: 'document' | 'voice_memo'
  id: string
  analysis_status: string
  animal_name: string
  animal_id: string
  error_message?: string | null
  recently_failed?: boolean
}

const POLL_ACTIVE_MS = 4000
const POLL_IDLE_MS = 30000
const DISMISSED_KEY = 'pendingTasksDismissed'

function loadDismissed(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]')) } catch { return new Set() }
}
function saveDismissed(ids: Set<string>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]))
}

export function PendingTasksChip() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [items, setItems] = useState<PendingItem[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed)
  const [open, setOpen] = useState(false)
  const prevTotalRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismiss = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const next = new Set(dismissed)
    next.add(id)
    setDismissed(next)
    saveDismissed(next)
  }

  const dismissAll = (e: React.MouseEvent) => {
    e.stopPropagation()
    const next = new Set([...dismissed, ...items.map(i => i.id)])
    setDismissed(next)
    saveDismissed(next)
    setOpen(false)
  }

  const poll = async () => {
    try {
      const res = await getPendingTasks()
      const newItems: PendingItem[] = res.data.items
      const currentDismissed = loadDismissed()

      // prune dismissed IDs that server no longer returns (naturally resolved)
      const serverIds = new Set(newItems.map((i: PendingItem) => i.id))
      const pruned = new Set([...currentDismissed].filter(id => serverIds.has(id)))
      if (pruned.size !== currentDismissed.size) {
        saveDismissed(pruned)
        setDismissed(pruned)
      }

      const visible = newItems.filter(i => !pruned.has(i.id))
      const prevTotal = prevTotalRef.current
      if (prevTotal > 0 && visible.length < prevTotal) {
        toast.success(t('pending.taskCompleted'))
      }
      prevTotalRef.current = visible.length
      setItems(newItems)

      const hasActive = newItems.some(i => !i.recently_failed && !pruned.has(i.id))
      timerRef.current = setTimeout(poll, hasActive ? POLL_ACTIVE_MS : POLL_IDLE_MS)
    } catch {
      timerRef.current = setTimeout(poll, POLL_IDLE_MS)
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    poll()
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  const visible = items.filter(i => !dismissed.has(i.id))
  if (visible.length === 0) return null

  return (
    <>
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 189 }} onClick={() => setOpen(false)} />
      )}
      <div style={{
        position: 'fixed',
        bottom: 'calc(var(--bottom-nav-height, 64px) + 70px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 190,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-2)'
      }}>
        {open && (
          <div className="card" style={{
            width: 300,
            padding: 'var(--space-2)',
            marginBottom: 'var(--space-1)',
            maxHeight: 280,
            overflowY: 'auto',
            boxShadow: 'var(--shadow-xl)'
          }}>
            {visible.map(item => (
              <div
                key={item.id + (item.recently_failed ? '_f' : '')}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 'var(--space-1)',
                  marginBottom: 2
                }}
              >
                <button
                  onClick={() => { navigate(`/animals/${item.animal_id}`); setOpen(false) }}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    background: item.recently_failed ? 'var(--danger-50, #fff0f0)' : 'none',
                    border: item.recently_failed ? '1px solid var(--danger-200, #fca5a5)' : 'none',
                    cursor: 'pointer',
                    padding: 'var(--space-2) var(--space-3)',
                    borderRadius: 'var(--radius-sm)',
                    textAlign: 'left',
                    gap: 2
                  }}
                >
                  <span style={{ fontWeight: 500, fontSize: 'var(--font-size-sm)', color: item.recently_failed ? 'var(--danger-700, #b91c1c)' : undefined }}>
                    {item.type === 'voice_memo' ? t('pending.voiceMemo') : t('pending.document')} · {item.animal_name}
                  </span>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: item.recently_failed ? 'var(--danger-600, #dc2626)' : 'var(--text-muted)' }}>
                    {item.recently_failed && item.error_message ? item.error_message : item.analysis_status}
                  </span>
                </button>
                <button
                  onClick={e => dismiss(e, item.id)}
                  title="Ausblenden"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 4px', color: 'var(--text-muted)', flexShrink: 0 }}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            {visible.length > 1 && (
              <button
                onClick={dismissAll}
                style={{ width: '100%', marginTop: 'var(--space-2)', padding: '4px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textAlign: 'center' }}
              >
                {t('pending.dismissAll')}
              </button>
            )}
          </div>
        )}

        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            background: visible.some(i => i.recently_failed) ? 'var(--danger-500, #ef4444)' : 'var(--primary-500)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-full)',
            padding: '6px 14px',
            cursor: 'pointer',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 500,
            boxShadow: 'var(--shadow-md)',
            whiteSpace: 'nowrap'
          }}
        >
          <Loader2 size={14} style={{ animation: visible.some(i => !i.recently_failed) ? 'spin 1.5s linear infinite' : 'none' }} />
          {t('pending.chip', { count: visible.length })}
          {open && <X size={13} style={{ marginLeft: 2 }} />}
        </button>
      </div>
    </>
  )
}
