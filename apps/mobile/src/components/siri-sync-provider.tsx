import { useEffect } from 'react'
import { Platform } from 'react-native'
import { supabase } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/supabase/workspace'
import { setSharedData, removeSharedData } from '../../modules/dailybrain-intents'

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  'https://jdgolotkssanvzwflxej.supabase.co'

const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkZ29sb3Rrc3NhbnZ6d2ZseGVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTYxNDYsImV4cCI6MjA5MTM5MjE0Nn0._Vv8MK5dWezQ2s5TO1bGi3_4j9uK4fQJW3l9RDzgAO8'

function syncToSiri(token: string | null, workspaceId: string | null, userId: string | null) {
  if (Platform.OS !== 'ios') return

  try {
    if (token && workspaceId && userId) {
      setSharedData('supabase_url', SUPABASE_URL)
      setSharedData('supabase_anon_key', SUPABASE_ANON_KEY)
      setSharedData('supabase_token', token)
      setSharedData('workspace_id', workspaceId)
      setSharedData('user_id', userId)
    } else {
      removeSharedData('supabase_token')
      removeSharedData('workspace_id')
      removeSharedData('user_id')
    }
  } catch {
    // Module not available (e.g. Expo Go)
  }
}

export function SiriSyncProvider() {
  const { workspaceId, userId } = useWorkspace()

  useEffect(() => {
    if (Platform.OS !== 'ios') return

    async function syncCurrentSession() {
      const { data: { session } } = await supabase.auth.getSession()
      syncToSiri(session?.access_token ?? null, workspaceId, userId)
    }

    syncCurrentSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      syncToSiri(session?.access_token ?? null, workspaceId, userId)
    })

    return () => subscription.unsubscribe()
  }, [workspaceId, userId])

  return null
}
