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

export function PendingTasksChip() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [items, setItems] = useState<PendingItem[]>([])
  const [open, setOpen] = useState(false)
  const prevTotalRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const poll = async () => {
    try {
      const res = await getPendingTasks()
      const newItems: PendingItem[] = res.data.items
      const newTotal = newItems.length
      const prevTotal = prevTotalRef.current

      if (prevTotal > 0 && newTotal < prevTotal) {
        toast.success(t('pending.taskCompleted'))
      }

      prevTotalRef.current = newTotal
      setItems(newItems)

      const hasActive = newItems.some(i => !i.recently_failed)
      const delay = hasActive ? POLL_ACTIVE_MS : POLL_IDLE_MS
      timerRef.current = setTimeout(poll, delay)
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

  if (items.length === 0) return null

  return (
    <>
      {open && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 189 }}
          onClick={() => setOpen(false)}
        />
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
            width: 280,
            padding: 'var(--space-2)',
            marginBottom: 'var(--space-1)',
            maxHeight: 240,
            overflowY: 'auto',
            boxShadow: 'var(--shadow-xl)'
          }}>
            {items.map(item => (
              <button
                key={item.id + (item.recently_failed ? '_failed' : '')}
                onClick={() => { navigate(`/animals/${item.animal_id}`); setOpen(false) }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  width: '100%',
                  background: item.recently_failed ? 'var(--danger-50, #fff0f0)' : 'none',
                  border: item.recently_failed ? '1px solid var(--danger-200, #fca5a5)' : 'none',
                  cursor: 'pointer',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-sm)',
                  textAlign: 'left',
                  gap: 2,
                  marginBottom: 2
                }}
              >
                <span style={{ fontWeight: 500, fontSize: 'var(--font-size-sm)', color: item.recently_failed ? 'var(--danger-700, #b91c1c)' : undefined }}>
                  {item.type === 'voice_memo' ? t('pending.voiceMemo') : t('pending.document')} · {item.animal_name}
                </span>
                <span style={{ fontSize: 'var(--font-size-xs)', color: item.recently_failed ? 'var(--danger-600, #dc2626)' : 'var(--text-muted)' }}>
                  {item.recently_failed && item.error_message ? item.error_message : item.analysis_status}
                </span>
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            background: 'var(--primary-500)',
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
          <Loader2 size={14} style={{ animation: 'spin 1.5s linear infinite' }} />
          {t('pending.chip', { count: items.length })}
          {open && <X size={13} style={{ marginLeft: 2 }} />}
        </button>
      </div>
    </>
  )
}
