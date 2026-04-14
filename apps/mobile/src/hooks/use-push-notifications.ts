import { useEffect, useRef, useCallback } from 'react'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/supabase/workspace'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync()
    let finalStatus = existingStatus

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }

    if (finalStatus !== 'granted') return null

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Standard',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF8C00',
      })
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId ?? undefined,
    })
    return tokenData.data
  } catch (err) {
    console.warn('Push notification registration failed:', err)
    return null
  }
}

export function usePushNotifications() {
  const router = useRouter()
  const { userId } = useWorkspace()
  const notificationListener = useRef<Notifications.EventSubscription>()
  const responseListener = useRef<Notifications.EventSubscription>()

  const saveToken = useCallback(
    async (token: string) => {
      if (!userId) return
      const platform = Platform.OS === 'ios' ? 'ios' : 'android'
      await supabase.from('push_tokens').upsert(
        { user_id: userId, token, platform },
        { onConflict: 'user_id,token' },
      )
    },
    [userId],
  )

  useEffect(() => {
    if (!userId) return

    registerForPushNotificationsAsync()
      .then((token) => { if (token) saveToken(token) })
      .catch(() => {})

    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      // Foreground notification received - handler above shows it as alert
    })

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string> | undefined
      if (data?.notificationId) {
        supabase
          .from('notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('id', data.notificationId)
          .then(() => {})
      }
      if (data?.taskId) {
        router.push('/tasks' as any)
      } else {
        router.push('/(tabs)/dashboard' as any)
      }
    })

    return () => {
      notificationListener.current?.remove()
      responseListener.current?.remove()
      notificationListener.current = undefined
      responseListener.current = undefined
    }
  }, [userId, router, saveToken])
}
