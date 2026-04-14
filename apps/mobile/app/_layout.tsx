import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useRef, useState, useCallback } from 'react'
import { AppState, Linking, Platform } from 'react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { WorkspaceProvider } from '@/lib/supabase/workspace'
import { SiriSyncProvider } from '@/components/siri-sync-provider'
import type { Session } from '@supabase/supabase-js'

let getSharedData: ((key: string) => string | null) | null = null
let removeSharedData: ((key: string) => void) | null = null

try {
  const mod = require('../modules/dailybrain-intents')
  getSharedData = mod.getSharedData
  removeSharedData = mod.removeSharedData
} catch {}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: false },
  },
})

function routeForDeepLink(url: string): string | null {
  if (url.includes('task/voice')) return '/task/voice'
  if (url.includes('task/new')) return '/task/new'
  if (url.includes('notifications')) return '/(tabs)/dashboard'
  if (url.includes('tasks')) return '/(tabs)/tasks'
  return null
}

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const segments = useSegments()
  const pendingDeepLink = useRef<string | null>(null)
  const authReady = useRef(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (loading) return
    const inAuthGroup = segments[0] === 'login' || segments[0] === 'register'
    if (!session && !inAuthGroup) {
      router.replace('/login')
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)/dashboard')
    }

    if (session && !inAuthGroup) {
      authReady.current = true

      if (pendingDeepLink.current) {
        const route = pendingDeepLink.current
        pendingDeepLink.current = null
        setTimeout(() => router.push(route as any), 300)
      }
    }
  }, [session, loading, segments])

  const navigateDeepLink = useCallback((route: string) => {
    if (authReady.current) {
      router.push(route as any)
    } else {
      pendingDeepLink.current = route
    }
  }, [router])

  const checkPendingAction = useCallback(() => {
    if (Platform.OS !== 'ios' || !getSharedData || !removeSharedData) return
    try {
      const action = getSharedData('pending_action')
      if (action === 'voice') {
        removeSharedData('pending_action')
        navigateDeepLink('/task/voice')
      }
    } catch {}
  }, [navigateDeepLink])

  useEffect(() => {
    const sub = Linking.addEventListener('url', (event) => {
      const route = routeForDeepLink(event.url)
      if (route) navigateDeepLink(route)
    })

    Linking.getInitialURL().then((url) => {
      if (url) {
        const route = routeForDeepLink(url)
        if (route) navigateDeepLink(route)
      }
    })

    checkPendingAction()

    return () => sub.remove()
  }, [navigateDeepLink, checkPendingAction])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkPendingAction()
      }
    })

    return () => sub.remove()
  }, [checkPendingAction])

  if (loading) return null

  return (
    <QueryClientProvider client={queryClient}>
      <WorkspaceProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="login" />
          <Stack.Screen name="register" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="contact/[id]" />
          <Stack.Screen name="contact/new" options={{ presentation: 'modal' }} />
          <Stack.Screen name="note/[id]" />
          <Stack.Screen name="note/new" options={{ presentation: 'modal' }} />
          <Stack.Screen name="task/[id]" />
          <Stack.Screen name="task/new" />
          <Stack.Screen name="task/voice" />
        </Stack>
        {Platform.OS === 'ios' && <SiriSyncProvider />}
        <StatusBar style="auto" />
      </WorkspaceProvider>
    </QueryClientProvider>
  )
}
