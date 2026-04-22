# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Skills (read before starting any feature)
- @docs/skills/supabase.md
- @docs/skills/trpc.md
- @docs/skills/tiptap.md
- @docs/skills/expo.md
- @docs/skills/prisma.md

---

## Commands

### Monorepo (run from root)
```bash
pnpm dev              # start all apps (Turborepo)
pnpm build            # build all apps
pnpm lint             # lint all apps
pnpm type-check       # TypeScript check all apps
pnpm format           # Prettier format everything
```

### Web only
```bash
pnpm --filter @daily-brain/web dev
pnpm --filter @daily-brain/web build
pnpm --filter @daily-brain/web type-check
```

### Mobile only
```bash
pnpm --filter @daily-brain/mobile dev   # expo start
pnpm --filter @daily-brain/mobile ios
pnpm --filter @daily-brain/mobile android
```

### Database
```bash
pnpm db:generate   # prisma generate (after schema changes — always run this)
pnpm db:migrate    # prisma migrate dev (creates migration + applies)
pnpm db:push       # prisma db push (quick schema sync, no migration file)
pnpm db:studio     # prisma studio UI
```

---

## Architecture

### Monorepo layout
```
/apps/web          Next.js 15 (App Router) — main CRM
/apps/mobile       Expo SDK 52 — mirrors web features
/packages/core     shared Zod schemas, types, utils
/packages/prisma   Prisma schema + client singleton
/supabase          SQL migrations, Edge Functions
```

### Request path (web)
```
Browser → Next.js App Router → /api/trpc/[trpc] route handler
  → createTRPCContext (resolves Supabase user + Prisma client)
  → protectedProcedure middleware (checks userId, fetches workspaceId from workspace_members)
  → router handler (always scoped by workspaceId)
```

`apps/web/src/server/trpc.ts` — context + middleware  
`apps/web/src/server/routers/_app.ts` — root router (merges all domain routers)  
`apps/web/src/lib/trpc/` — client-side tRPC + React Query setup

### tRPC routers (one file per domain)
`apps/web/src/server/routers/`: contacts, companies, deals, notes, tasks, calendar, attachments, notifications

### Database
Single Prisma schema at `packages/prisma/prisma/schema.prisma`. All models follow:
- `id uuid` via `gen_random_uuid()`
- `workspace_id` — always scope queries by this
- `deleted_at` soft-delete — never hard delete

Custom fields use JSONB `attrs` column, not EAV.

### Auth flow
Supabase Auth → JWT in cookie (server) or `Authorization: Bearer` header (mobile). `createTRPCContext` handles both. RLS on all Supabase tables enforces workspace isolation at DB level too.

### Notes editor
Tiptap v3 (not v2) + ProseMirror. Stored as:
- `content JSONB` — ProseMirror document (editor state)
- `content_text TEXT` — plaintext for FTS
- `content_markdown TEXT` — for AI processing

Autosave debounce: 1500ms. No Yjs/collaboration yet.

### Mobile
- Styling: `react-native-unistyles` v3 — **not NativeWind**
- Lists: `@shopify/flash-list` — not FlatList
- Auth tokens: `expo-secure-store` — not AsyncStorage
- Navigation: Expo Router (file-based), bottom tabs
- Offline notes/tasks: `expo-sqlite`, sync on reconnect

---

## Key Conventions

- All components: named exports only (default exports for page/screen files only)
- File names: kebab-case; component names: PascalCase
- Zod schemas live in `packages/core/schemas/` — shared web + mobile
- Currency: store as integer cents, display with `Intl.NumberFormat`
- Dates: UTC in DB, format in UI layer only
- Optimistic updates on all CUD mutations via tRPC + React Query
- shadcn/ui as base — extend via `cn()`, never override base styles

## Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL          # pooler connection (queries)
DIRECT_URL            # direct connection (migrations)
ANTHROPIC_API_KEY
INNGEST_SIGNING_KEY / INNGEST_EVENT_KEY
UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET
WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID
TELEGRAM_BOT_TOKEN
NEXT_PUBLIC_VAPID_PUBLIC_KEY
```
Mobile uses `EXPO_PUBLIC_` prefix instead of `NEXT_PUBLIC_`.
