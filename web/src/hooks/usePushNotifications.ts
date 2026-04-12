import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../utils/supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function usePushNotifications(userId: string | null) {
  const isSupported =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window

  const [isSubscribed, setIsSubscribed] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>(
    isSupported ? Notification.permission : 'default',
  )

  // Check existing subscription on mount
  useEffect(() => {
    if (!isSupported || !userId) return
    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => setIsSubscribed(!!sub))
      .catch(() => {})
  }, [isSupported, userId])

  const subscribe = useCallback(async () => {
    if (!isSupported || !userId) return
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') return

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: VAPID_PUBLIC_KEY
          ? urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
          : undefined,
      })

      const subJson = sub.toJSON()
      if (supabase) {
        await supabase.from('push_subscriptions').upsert(
          {
            user_id: userId,
            endpoint: sub.endpoint,
            p256dh: subJson.keys?.p256dh ?? '',
            auth: subJson.keys?.auth ?? '',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,endpoint' },
        )
      }
      setIsSubscribed(true)
    } catch (err) {
      console.error('[Push] subscribe error:', err)
    }
  }, [isSupported, userId])

  const unsubscribe = useCallback(async () => {
    if (!isSupported || !userId) return
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await sub.unsubscribe()
        if (supabase) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('user_id', userId)
            .eq('endpoint', sub.endpoint)
        }
      }
      setIsSubscribed(false)
    } catch (err) {
      console.error('[Push] unsubscribe error:', err)
    }
  }, [isSupported, userId])

  return { isSupported, isSubscribed, permission, subscribe, unsubscribe }
}
