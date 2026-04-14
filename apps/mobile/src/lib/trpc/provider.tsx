import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createTRPCReact, httpBatchLink } from '@trpc/react-query'
import { useState } from 'react'
import superjson from 'superjson'
import type { AppRouter } from '@daily-brain/core/types/trpc'
import { supabase } from '@/lib/supabase/client'

export const trpc = createTRPCReact<AppRouter>()

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3456'

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: false,
          },
        },
      }),
  )

  const [trpcClientInstance] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${BASE_URL}/api/trpc`,
          transformer: superjson,
          async headers() {
            const { data } = await supabase.auth.getSession()
            const token = data.session?.access_token
            return token ? { authorization: `Bearer ${token}` } : {}
          },
        }),
      ],
    }),
  )

  return (
    <trpc.Provider client={trpcClientInstance} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  )
}
