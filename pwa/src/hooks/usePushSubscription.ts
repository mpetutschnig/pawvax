import { useCallback, useEffect, useState } from 'react'
import { getVapidPublicKey, pushSubscribe, pushUnsubscribe } from '../api/rest'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

type PushState = 'unsupported' | 'denied' | 'unsubscribed' | 'subscribed' | 'loading'

export function usePushSubscription() {
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  const [state, setState] = useState<PushState>(supported ? 'loading' : 'unsupported')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!supported) { setState('unsupported'); return }
    if (Notification.permission === 'denied') { setState('denied'); return }
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      setState(sub ? 'subscribed' : 'unsubscribed')
    } catch { setState('unsubscribed') }
  }, [supported])

  useEffect(() => { refresh() }, [refresh])

  const subscribe = useCallback(async () => {
    if (!supported) return false
    setBusy(true)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setState(perm === 'denied' ? 'denied' : 'unsubscribed'); return false }
      const { data } = await getVapidPublicKey()
      if (!data.publicKey) return false
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey) as unknown as BufferSource
      })
      await pushSubscribe(sub.toJSON() as PushSubscriptionJSON)
      setState('subscribed')
      return true
    } catch {
      return false
    } finally { setBusy(false) }
  }, [supported])

  const unsubscribe = useCallback(async () => {
    if (!supported) return
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await pushUnsubscribe(sub.endpoint).catch(() => {})
        await sub.unsubscribe().catch(() => {})
      }
      setState('unsubscribed')
    } finally { setBusy(false) }
  }, [supported])

  return { state, busy, subscribe, unsubscribe, supported }
}
