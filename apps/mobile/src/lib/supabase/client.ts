import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  'https://jdgolotkssanvzwflxej.supabase.co'

const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkZ29sb3Rrc3NhbnZ6d2ZseGVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTYxNDYsImV4cCI6MjA5MTM5MjE0Nn0._Vv8MK5dWezQ2s5TO1bGi3_4j9uK4fQJW3l9RDzgAO8'

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

/** Unique per mount so React Strict Mode / fast remounts never reuse a subscribed channel name. */
export function createRealtimeChannelId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}
