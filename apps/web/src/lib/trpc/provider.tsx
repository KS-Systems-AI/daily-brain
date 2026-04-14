'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink, TRPCClientError } from '@trpc/client'
import { createTRPCReact } from '@trpc/react-query'
import { useState } from 'react'
import superjson from 'superjson'
import type { AppRouter } from '@/server/routers/_app'

export const trpc = createTRPCReact<AppRouter>()

function getBaseUrl(): string {
  if (typeof window !== 'undefined') return ''
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return `http://localhost:${process.env.PORT ?? 3000}`
}

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        retry: (failureCount, error) => {
          if (error instanceof TRPCClientError && error.data?.code === 'UNAUTHORIZED') return false
          return failureCount < 1
        },
      },
      mutations: {
        onError: (error) => {
          if (error instanceof TRPCClientError && error.data?.code === 'UNAUTHORIZED') {
            window.location.href = '/login'
          }
        },
      },
    },
  })
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => makeQueryClient())

  const [trpcClientInstance] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
        }),
      ],
    }),
  )

  // Redirect to login on any UNAUTHORIZED query error
  queryClient.getQueryCache().config.onError = (error) => {
    if (error instanceof TRPCClientError && error.data?.code === 'UNAUTHORIZED') {
      window.location.href = '/login'
    }
  }

  return (
    <trpc.Provider client={trpcClientInstance} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  )
}
