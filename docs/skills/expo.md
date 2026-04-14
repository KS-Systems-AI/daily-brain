# Skill: Expo + React Native

## Stack
- Expo SDK 52, Expo Router (file-based)
- react-native-unistyles v3 (NOT NativeWind)
- @shopify/flash-list (not FlatList)
- expo-secure-store (auth tokens, never AsyncStorage)

## Supabase on Mobile
```ts
import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { storage: { getItem: (k) => SecureStore.getItemAsync(k), setItem: (k,v) => SecureStore.setItemAsync(k,v), removeItem: (k) => SecureStore.deleteItemAsync(k) }, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } }
)
```

## Key Rules
- react-native-unistyles for ALL styling
- FlashList everywhere — never FlatList
- Expo Router — file-based navigation
- SecureStore for tokens
- Same tRPC routers as web
- No WebView — everything native
- env vars prefix: EXPO_PUBLIC_ (not NEXT_PUBLIC_)
