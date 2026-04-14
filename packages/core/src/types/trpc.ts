/**
 * Re-exported AppRouter type so the mobile app can reference it
 * without a direct dependency on apps/web (which would create a cycle).
 *
 * Usage in apps/mobile:
 *   import type { AppRouter } from '@daily-brain/core/types/trpc'
 *
 * Keep this file in sync with apps/web/src/server/routers/_app.ts.
 * Import the real type here once the web app is built out further.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppRouter = any
