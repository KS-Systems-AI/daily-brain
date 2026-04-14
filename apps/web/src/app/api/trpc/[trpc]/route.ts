import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { type NextRequest } from 'next/server'
import { appRouter } from '@/server/routers/_app'
import { createTRPCContext } from '@/server/trpc'

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext(req),
    ...(process.env.NODE_ENV === 'development'
      ? {
          onError: ({ path, error }: { path: string | undefined; error: Error }) => {
            console.error(`tRPC error on ${path ?? '<no-path>'}:`, error)
          },
        }
      : {}),
  })

export { handler as GET, handler as POST }
