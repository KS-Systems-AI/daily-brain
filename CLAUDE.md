## Skills (read before starting any feature)
- @docs/skills/supabase.md
- @docs/skills/trpc.md
- @docs/skills/tiptap.md
- @docs/skills/expo.md
- @docs/skills/prisma.md

# CLAUDE.md — CRM Project Master Context

## Project
Attio-inspired CRM. Web (Next.js) + Mobile (Expo). Solo dev. Ship fast, stay clean.

## Stack
- **Frontend Web**: Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Frontend Mobile**: Expo SDK 52, React Native, NativeWind
- **Shared logic**: `/packages/core` — types, validators (Zod), utils
- **API**: tRPC v11 (type-safe end-to-end, no codegen)
- **DB**: Supabase (PostgreSQL + Realtime + Auth + Storage)
- **ORM**: Prisma (schema-as-source-of-truth, Supabase direct connection)
- **Jobs/Automations**: Inngest (event-driven, serverless)
- **AI**: Anthropic Claude API (claude-sonnet-4-20250514)
- **Email sync**: Gmail API + Outlook Graph API (OAuth2)
- **Messaging**: WhatsApp Business Cloud API + Telegram Bot API
- **Calendar**: Google Calendar API + Microsoft Graph
- **Deployment**: Vercel (web), EAS (mobile)
- **Cache**: Upstash Redis (rate limiting, sessions)

## Monorepo Structure
```
/apps
  /web          # Next.js 15
  /mobile       # Expo
/packages
  /core         # shared types, zod schemas, utils
  /ui           # shared React components (web+native variants)
/supabase
  /migrations   # SQL migrations
  /functions    # Edge Functions
```

## Database Philosophy (critical)
Attio's power = flexible data model. Implement via:
- **Standard tables**: `workspaces`, `users`, `contacts`, `companies`, `deals`, `notes`, `tasks`, `activities`
- **Custom objects**: `objects` table (metadata) + `records` table (data as JSONB)
- **Attributes**: `attributes` table defines fields per object type
- **Relations**: `relations` table links any record to any record
- NEVER use EAV (Entity-Attribute-Value). Use JSONB for custom fields.
- All tables have: `id uuid DEFAULT gen_random_uuid()`, `workspace_id`, `created_at`, `updated_at`, `deleted_at` (soft delete)

## Key Schema Tables
```sql
workspaces, workspace_members, users
contacts (first_name, last_name, email[], phone[], company_id, attrs JSONB)
companies (name, domain, industry, size, attrs JSONB)
deals (title, value, currency, stage, pipeline_id, contact_id, company_id, attrs JSONB)
pipelines, pipeline_stages
notes (body, record_type, record_id, author_id)
tasks (title, due_at, completed_at, record_type, record_id, assignee_id)
activities (type, data JSONB, record_type, record_id, actor_id)
objects (slug, label, icon, workspace_id)         -- custom object types
attributes (object_slug, key, label, type, config JSONB)
records (object_slug, attrs JSONB, workspace_id)
relations (from_type, from_id, to_type, to_id, label)
email_accounts (provider, access_token, refresh_token, user_id)
email_threads (external_id, subject, participants JSONB, record_id)
email_messages (thread_id, body, from_addr, sent_at, direction)
automations (trigger JSONB, steps JSONB, workspace_id, enabled)
```

## Auth
- Supabase Auth (email/password + Google OAuth)
- Row Level Security (RLS) on ALL tables — workspace_id isolation
- tRPC middleware checks session + workspace membership

## AI Features
- **Enrichment**: on contact/company save → Inngest job → Claude researches via web → fills missing fields
- **KI-Assistent**: streaming chat, has tool-calls to query DB (search_contacts, get_deal, list_activities, etc.)
- **Notes AI**: summarize, extract tasks, detect sentiment
- **Voice** (later): Whisper transcription → note creation

## Views System
Each list (contacts, companies, deals, custom objects) supports:
- Table view (default)
- Kanban view (grouped by any select field)
- List view (compact)
Persist view config in `views` table (filters, sorts, columns, groupBy) per user per object.

## Automations
Trigger types: `record.created`, `record.updated`, `field.changed`, `date.reached`, `webhook.received`
Action types: `send_email`, `create_task`, `update_field`, `http_request`, `ai_action`, `send_whatsapp`
Use Inngest for execution. Store runs in `automation_runs` table.

## Messaging Integrations
- WhatsApp: Cloud API, webhook receives messages → activity logged → linked to contact
- Telegram: Bot API, same pattern
- All messages shown in contact timeline

## Conventions
- All components: named exports, no default exports except pages
- File naming: kebab-case for files, PascalCase for components
- tRPC routers: one file per domain (contacts.ts, deals.ts, notes.ts, etc.)
- Zod schemas in `/packages/core/schemas/` — shared web+mobile
- Error handling: tRPC TRPCError, never throw raw errors
- Dates: always UTC in DB, format in UI layer
- Currency: store as integer cents, display with Intl.NumberFormat
- Soft deletes: always set deleted_at, never hard delete user data
- Optimistic updates: use tRPC + React Query optimistic mutations for all CUD ops

## UI Conventions
- shadcn/ui as base — extend, never override
- Command palette (⌘K): global search across all records
- Keyboard shortcuts: n=new, e=edit, d=delete, /=search, g+c=go contacts
- Sidebar: collapsible, workspace switcher at top
- Empty states: always illustrated, with CTA
- Loading: skeleton screens, never spinners for list views

## Mobile Specific
- Bottom tab nav: Home, Contacts, Deals, Inbox, Settings
- Swipe actions on list items (quick complete task, archive)
- Offline-first for notes and tasks (sync on reconnect)
- Push notifications via Expo Notifications + Supabase Realtime

## Environment Variables Needed
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL                    # Prisma direct connection
DIRECT_URL                      # Prisma direct (no pooler)
ANTHROPIC_API_KEY
INNGEST_SIGNING_KEY
INNGEST_EVENT_KEY
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
MICROSOFT_CLIENT_ID
MICROSOFT_CLIENT_SECRET
WHATSAPP_TOKEN
WHATSAPP_PHONE_NUMBER_ID
TELEGRAM_BOT_TOKEN
```

## Priority Order (build in this sequence)
1. Monorepo scaffold + DB schema + Auth
2. Contacts & Companies (CRUD, table view, detail page)
3. Deals & Pipelines (kanban view)
4. Notes & Tasks (timeline on record detail)
5. Email Sync (Gmail first)
6. Views system (filters, sorts, saved views)
7. Automations (basic triggers + actions)
8. AI Enrichment + KI-Assistent
9. WhatsApp + Telegram integration
10. Calendar & Scheduling
11. Mobile app (mirrors web features)
12. Custom Objects (advanced)

---

## Notes System — Deep Spec (Attio-equivalent)

### Web Editor Stack
- **Editor**: Tiptap v2 (headless, ProseMirror-based) — same as Attio
- **Collaboration**: Yjs CRDT + Hocuspocus WebSocket server (via `@hocuspocus/server`)
- **Packages**: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-collaboration`, `@tiptap/extension-collaboration-cursor`, `@tiptap/extension-mention`, `@tiptap/extension-highlight`, `@tiptap/extension-placeholder`

### Storage Format
- **DB column**: `content JSONB` — stores ProseMirror JSON document
- **Also store**: `content_text TEXT` — plaintext for full-text search (Postgres `tsvector`)
- **Also store**: `content_markdown TEXT` — for AI processing and API export
- **Serialize on save**: JSON → Markdown via `@tiptap/extension-markdown` or custom serializer

### Note Schema (final)
```sql
notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL,
  record_type TEXT,               -- 'contact' | 'company' | 'deal' | null (standalone)
  record_id uuid,
  title TEXT,
  content JSONB NOT NULL DEFAULT '{}',
  content_text TEXT,              -- for search
  content_markdown TEXT,          -- for AI + API
  linked_event_id TEXT,           -- Google Calendar event ID
  author_id uuid NOT NULL,
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
)
-- FTS index
CREATE INDEX notes_fts ON notes USING gin(to_tsvector('english', content_text));
```

### Mention System
- `@user` → creates `note_mentions` row → sends notification via Supabase Realtime
- `@record` → creates `note_record_links` row → note appears in that record's timeline
- Both stored as ProseMirror marks with `type: "mention"`, `attrs: { id, label, mentionType: 'user'|'record' }`

### Slash Commands (/)
Implement these blocks: Heading 1, Heading 2, Heading 3, Bullet List, Numbered List, Todo (Checkbox), Quote, Code Block, Divider

### Autosave
- Debounce 1500ms after last keystroke
- Save: JSON + recompute plaintext + markdown
- Optimistic: no loading indicator, silent background save
- Conflict resolution: Yjs handles it client-side via CRDT

### Hocuspocus Server
- Run as separate Vercel Edge Function or dedicated server (Railway recommended for WebSocket support)
- Persistence: save Yjs document state to Supabase on every change
- Auth: validate Supabase JWT on WebSocket connect

### Mobile Notes (CORRECTION — Attio uses this)
- Attio confirmed: **Expo + react-native-unistyles** (NOT NativeWind)
- Replace NativeWind with `react-native-unistyles` v3 in mobile app
- Mobile note editor: use `react-native-rich-editor` OR custom TextInput with markdown shortcuts
- Same Yjs sync via WebSocket — mobile connects to same Hocuspocus server
- Offline: buffer Yjs updates in `expo-sqlite`, replay on reconnect

### AI on Notes (after save, debounced 3s)
1. Extract action items → `create_task` suggestions (toast UI)
2. Detect @record mentions not yet linked → suggest linking
3. Long notes (>400 words) → generate summary, store in `notes.ai_summary TEXT`
4. Voice (later): Whisper transcription → creates note with `source: 'voice'`
