import { useEffect } from 'react'
import { push as pushApi } from '../services/api'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export function usePushNotifications() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (Notification.permission === 'denied') return

    let cancelled = false

    const setup = async () => {
      try {
        // Fetch VAPID public key from backend
        const { data } = await pushApi.vapidKey()
        if (!data.key || cancelled) return

        const reg = await navigator.serviceWorker.register('/sw.js')
        await navigator.serviceWorker.ready

        // Check existing subscription first
        let sub = await reg.pushManager.getSubscription()
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(data.key),
          })
        }

        const json = sub.toJSON()
        await pushApi.subscribe({
          endpoint: sub.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        })
      } catch (err) {
        // Silently fail — push is non-critical
        console.debug('[push] setup failed:', err)
      }
    }

    // Only subscribe after user grants notification permission
    if (Notification.permission === 'granted') {
      setup()
    } else {
      Notification.requestPermission().then(perm => {
        if (perm === 'granted' && !cancelled) setup()
      })
    }

    return () => { cancelled = true }
  }, [])
}
