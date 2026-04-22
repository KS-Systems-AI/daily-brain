'use client'

import { useEffect, useCallback, useState, useRef } from 'react'
import { trpc } from '@/lib/trpc/provider'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

// Modul-Level-Flag: überlebt Re-Mounts, verhindert doppelte Registrierung
let pushRegistrationDone = false

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
  // Verhindert, dass subscribe() mehrfach gleichzeitig läuft
  const registeredRef = useRef(false)
  const registerTokenRef = useRef(registerToken)
  useEffect(() => { registerTokenRef.current = registerToken })

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission)
    }
  }, [])

  const subscribe = useCallback(async () => {
    if (typeof window === 'undefined') return false
    const supportsPush =
      !!VAPID_PUBLIC_KEY &&
      window.isSecureContext &&
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window

    if (!supportsPush) {
      return false
    }

    // Modul-Level-Guard: verhindert Loop über Re-Mounts hinweg
    if (pushRegistrationDone) return true
    if (registeredRef.current) return true
    pushRegistrationDone = true
    registeredRef.current = true

    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') {
        registeredRef.current = false
        return false
      }

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
        await registerTokenRef.current.mutateAsync({
          token: sub.endpoint,
          platform: 'web',
          endpoint: sub.endpoint,
          p256dh: sub.keys.p256dh ?? undefined,
          auth: sub.keys.auth ?? undefined,
        })
      }
      return true
    } catch (err) {
      pushRegistrationDone = false
      registeredRef.current = false
      if (err instanceof DOMException && err.name === 'AbortError') {
        return false
      }
      return false
    }
  }, []) // Keine Abhängigkeiten — registeredRef und registerTokenRef sind stabile Refs

  useEffect(() => {
    if (permission === 'granted' && VAPID_PUBLIC_KEY) {
      void subscribe()
    }
  }, [permission, subscribe])

  return { permission, subscribe }
}
