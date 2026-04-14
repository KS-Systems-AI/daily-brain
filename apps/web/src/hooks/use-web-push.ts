'use client'

import { useEffect, useCallback, useState } from 'react'
import { trpc } from '@/lib/trpc/provider'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function useWebPush() {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const registerToken = trpc.notifications.registerToken.useMutation()

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission)
    }
  }, [])

  const subscribe = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return false
    }

    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') return false

      const registration = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        })
      }

      const sub = subscription.toJSON()
      if (sub.endpoint && sub.keys) {
        await registerToken.mutateAsync({
          token: sub.endpoint,
          platform: 'web',
          endpoint: sub.endpoint,
          p256dh: sub.keys.p256dh ?? undefined,
          auth: sub.keys.auth ?? undefined,
        })
      }
      return true
    } catch (err) {
      console.error('Web Push subscription failed:', err)
      return false
    }
  }, [registerToken])

  useEffect(() => {
    if (permission === 'granted' && VAPID_PUBLIC_KEY) {
      subscribe()
    }
  }, [permission, subscribe])

  return { permission, subscribe }
}
