'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Mail,
  Phone,
  Building2,
  Calendar,
  Wifi,
  Plus,
  Trash2,
  Star,
  MoreHorizontal,
  FileText,
  CheckSquare,
  Activity,
  User,
  Check,
  Sparkles,
  UserPen,
  CheckCircle2,
  ClipboardList,
  Globe,
  Users,
  Pencil,
  type LucideIcon,
} from 'lucide-react'
import { TaskFormDialog } from '@/components/tasks/task-form-dialog'
import { AttachmentsTab } from '@/components/contacts/attachments-tab'
import type { Task } from '@/store/task-store'
import { trpc } from '@/lib/trpc/provider'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { formatDate, formatRelativeDate } from '@/lib/utils'
import { CompanyFormSheet } from '@/components/companies/company-form-sheet'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
}

type Tab = 'overview' | 'activity' | 'emails' | 'meetings' | 'notizen' | 'aufgaben' | 'dateien'

// ─── Editable Detail Row ───────────────────────────────────────────────────────
function EditableDetailRow({
  icon: Icon,
  label,
  value,
  placeholder = 'Wert setzen…',
  onSave,
  href,
}: {
  icon: React.ElementType
  label: string
  value?: string
  placeholder?: string
  onSave?: (v: string) => void
  href?: string
}): React.JSX.Element {
  const [editing, setEditing] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [draft, setDraft] = React.useState(value ?? '')

  React.useEffect(() => {
    if (!editing) setDraft(value ?? '')
  }, [value, editing])

  React.useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commit = (): void => {
    const trimmed = draft.trim()
    if (onSave && trimmed !== (value ?? '')) onSave(trimmed)
    setEditing(false)
  }

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) }
  }

  return (
    <div
      className={cn(
        'group flex min-h-[28px] items-center gap-2 rounded px-1.5 py-1 -mx-1.5',
        !editing && onSave && 'cursor-text hover:bg-accent/60',
      )}
      onClick={() => {
        if (!editing && onSave) {
          setDraft(value ?? '')
          setEditing(true)
        }
      }}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="w-24 shrink-0 text-[12px] text-muted-foreground">{label}</span>

      {editing ? (
        <div className="flex min-w-0 flex-1 items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKey}
            className="min-w-0 flex-1 border-b border-border bg-transparent text-[13px] text-foreground outline-none"
            placeholder={placeholder}
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={commit}
            className="flex size-5 shrink-0 items-center justify-center rounded bg-foreground text-background hover:bg-foreground/80"
            aria-label="Speichern"
          >
            <Check className="size-3" />
          </button>
        </div>
      ) : value ? (
        href ? (
          <Link
            href={href}
            className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {value}
          </Link>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
            {value}
          </span>
        )
      ) : (
        <span className="min-w-0 flex-1 text-[13px] text-muted-foreground">{placeholder}</span>
      )}
    </div>
  )
}

// ─── Note Row ──────────────────────────────────────────────────────────────────
type NoteItem = {
  id: string
  title?: string | null
  content_text?: string | null
  created_at: Date | string
  author: { full_name?: string | null; avatar_url?: string | null }
}

function NoteRow({ note }: { note: NoteItem }): React.JSX.Element {
  return (
    <Link href={`/notes/${note.id}`} className="flex min-w-0 items-center gap-2 py-1.5 hover:bg-accent/40 -mx-1 px-1 rounded transition-colors">
      <Avatar className="size-5 shrink-0">
        <AvatarImage src={note.author.avatar_url ?? undefined} />
        <AvatarFallback className="bg-orange-500 text-[9px] text-white">
          {note.author.full_name?.charAt(0) ?? '?'}
        </AvatarFallback>
      </Avatar>
      <span className="shrink-0 text-[12px] font-medium text-foreground">
        {note.author.full_name ?? 'Unbekannt'}
      </span>
      <span className="shrink-0 text-[12px] text-muted-foreground">·</span>
      <span className="min-w-0 flex-1 truncate text-[12px]">
        {note.title ? (
          <>
            <span className="font-semibold text-foreground">{note.title}</span>
            {note.content_text ? (
              <span className="text-muted-foreground"> · {note.content_text}</span>
            ) : null}
          </>
        ) : (
          <span className="text-muted-foreground">{note.content_text ?? 'Kein Inhalt'}</span>
        )}
      </span>
      <time className="shrink-0 text-[12px] text-muted-foreground whitespace-nowrap">
        {formatRelativeDate(note.created_at)}
      </time>
    </Link>
  )
}

// ─── Meeting Row ──────────────────────────────────────────────────────────────
type MeetingItem = {
  id: string
  title: string
  start_at: Date | string
  end_at: Date | string
  is_all_day: boolean
  location?: string | null
  attendees?: unknown
}

function MeetingRow({ meeting }: { meeting: MeetingItem }): React.JSX.Element {
  const start = new Date(meeting.start_at)
  const end = new Date(meeting.end_at)
  const fmt = (d: Date): string =>
    `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  const attendeeList = Array.isArray(meeting.attendees) ? meeting.attendees as { email: string; name?: string }[] : []

  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="flex size-8 shrink-0 flex-col items-center justify-center rounded-lg bg-muted text-center">
        <span className="text-[9px] font-medium uppercase text-muted-foreground leading-none">
          {start.toLocaleDateString('de-DE', { month: 'short' })}
        </span>
        <span className="text-[13px] font-bold leading-none text-foreground">
          {start.getDate()}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-foreground">{meeting.title}</p>
        <p className="text-[11px] text-muted-foreground">
          {meeting.is_all_day ? 'Ganztägig' : `${fmt(start)} – ${fmt(end)}`}
          {meeting.location ? ` · ${meeting.location}` : ''}
        </p>
        {attendeeList.length > 0 ? (
          <div className="mt-0.5 flex items-center gap-1">
            {attendeeList.slice(0, 3).map((a, i) => (
              <span key={i} className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                {a.name || a.email}
              </span>
            ))}
            {attendeeList.length > 3 ? (
              <span className="text-[10px] text-muted-foreground">+{attendeeList.length - 3}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ─── Highlight Card ────────────────────────────────────────────────────────────
function HighlightCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3.5">
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Icon className="size-3.5" />
        <span>{label}</span>
      </div>
      <div className="text-[12px] font-medium text-foreground">
        {value ?? <span className="font-normal text-muted-foreground">—</span>}
      </div>
    </div>
  )
}

// ─── Due Badge ────────────────────────────────────────────────────────────────
function DueBadge({ date, endAt }: { date: Date | string; endAt?: Date | string }): React.JSX.Element {
  const d = new Date(date)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dueStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((dueStart.getTime() - todayStart.getTime()) / 86400000)

  const fmt = (dt: Date): string =>
    `${dt.getHours().toString().padStart(2, '0')}:${dt.getMinutes().toString().padStart(2, '0')}`

  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0
  const timeStr = hasTime
    ? (endAt ? ` ${fmt(d)}–${fmt(new Date(endAt))}` : ` ${fmt(d)}`)
    : ''

  let label: string
  let className: string

  if (dueStart < todayStart) {
    label = `Überfällig${timeStr}`
    className = 'bg-red-50 text-red-600 border-red-200'
  } else if (diffDays === 0) {
    label = `Heute${timeStr}`
    className = 'bg-amber-50 text-amber-600 border-amber-200'
  } else if (diffDays === 1) {
    label = `Morgen${timeStr}`
    className = 'bg-yellow-50 text-yellow-600 border-yellow-200'
  } else if (diffDays <= 7) {
    const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
    label = `${days[d.getDay()]}${timeStr}`
    className = 'bg-muted text-muted-foreground border-border'
  } else {
    label = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' }).format(d) + timeStr
    className = 'bg-muted text-muted-foreground border-border'
  }

  return (
    <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap', className)}>
      {label}
    </span>
  )
}

// ─── Section Header ────────────────────────────────────────────────────────────
function SectionHeader({
  icon: Icon,
  label,
  count,
  onAdd,
  onNavigate,
  children,
}: {
  icon: React.ElementType
  label: string
  count?: number
  onAdd?: () => void
  onNavigate?: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div>
      <div className="flex items-center justify-between py-1.5">
        <div
          className={cn(
            'flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-foreground',
            onNavigate && 'cursor-pointer hover:text-orange-500',
          )}
          onClick={onNavigate}
          role={onNavigate ? 'button' : undefined}
        >
          <Icon className="size-3.5 text-muted-foreground" />
          {label}
          {count !== undefined && count > 0 ? (
            <span className="ml-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
              {count}
            </span>
          ) : null}
        </div>
        {onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-3.5" />
          </button>
        ) : null}
      </div>
      <div className="pb-2">{children}</div>
    </div>
  )
}

// ─── Activity helpers ──────────────────────────────────────────────────────────
type ActivityData = Record<string, unknown>

function activityMeta(type: string, data: ActivityData): { icon: LucideIcon; text: string } {
  switch (type) {
    case 'contact.created':
      return { icon: User, text: 'hat den Kontakt erstellt' }
    case 'contact.field_updated': {
      const label = (data.label as string | undefined) ?? (data.field as string | undefined) ?? 'Feld'
      const newVal = data.newValue as string | undefined
      return {
        icon: UserPen,
        text: newVal ? `hat ${label} auf „${newVal}" gesetzt` : `hat ${label} geändert`,
      }
    }
    case 'task.created':
      return { icon: ClipboardList, text: `hat Aufgabe „${data.title as string}" erstellt` }
    case 'task.updated':
      return { icon: ClipboardList, text: `hat Aufgabe „${data.title as string}" aktualisiert` }
    case 'task.completed':
      return { icon: CheckCircle2, text: `hat Aufgabe „${data.title as string}" abgeschlossen` }
    case 'task.assigned':
      return { icon: ClipboardList, text: `hat Aufgabe „${data.title as string}" zugewiesen` }
    case 'note.created':
      return {
        icon: FileText,
        text: data.noteTitle
          ? `hat Notiz „${data.noteTitle as string}" erstellt`
          : 'hat eine Notiz erstellt',
      }
    case 'note.updated':
      return {
        icon: FileText,
        text: data.noteTitle
          ? `hat Notiz „${data.noteTitle as string}" bearbeitet`
          : 'hat eine Notiz bearbeitet',
      }
    case 'email.received':
      return { icon: Mail, text: 'hat eine E-Mail erhalten' }
    case 'email.sent':
      return { icon: Mail, text: 'hat eine E-Mail gesendet' }
    case 'meeting.created':
      return { icon: Calendar, text: data.title ? `Meeting „${data.title as string}" erstellt` : 'hat ein Meeting erstellt' }
    case 'meeting.updated':
      return { icon: Calendar, text: data.title ? `Meeting „${data.title as string}" aktualisiert` : 'hat ein Meeting aktualisiert' }
    default:
      return { icon: Activity, text: type.replace(/_/g, ' ') }
  }
}

function ActivityItem({
  type,
  data,
  avatarUrl,
  name,
  timestamp,
}: {
  type: string
  data: ActivityData
  avatarUrl?: string | null
  name: string
  timestamp: Date | string
}): React.JSX.Element {
  const { icon: Icon, text } = activityMeta(type, data)

  return (
    <div className="flex items-center gap-2.5 py-2">
      <Avatar className="size-5 shrink-0">
        <AvatarImage src={avatarUrl ?? undefined} />
        <AvatarFallback className="bg-orange-500 text-[9px] text-white">{name.charAt(0)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <Icon className="size-3 shrink-0 text-muted-foreground" />
        <p className="text-[12px] text-foreground">
          <span className="font-medium">{name}</span>{' '}
          <span className="text-muted-foreground">{text}</span>
        </p>
      </div>
      <time className="shrink-0 text-[11px] text-muted-foreground" dateTime={timestamp.toString()}>
        {formatRelativeDate(timestamp)}
      </time>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
export function CompanyDetailView({ companyId }: { companyId: string }): React.JSX.Element {
  const router = useRouter()
  const { toast } = useToast()
  const utils = trpc.useUtils()
  const [activeTab, setActiveTab] = React.useState<Tab>('overview')
  const [editOpen, setEditOpen] = React.useState(false)
  const [editingTask, setEditingTask] = React.useState<Task | null>(null)
  const [showNewTaskDialog, setShowNewTaskDialog] = React.useState(false)
  const validId = isUuid(companyId)

  const query = trpc.companies.getById.useQuery({ id: companyId }, { enabled: validId })

  const contactsQuery = trpc.companies.getContacts.useInfiniteQuery(
    { companyId },
    { enabled: validId && Boolean(query.data), getNextPageParam: (last) => last.nextCursor },
  )

  const notesQuery = trpc.companies.getNotes.useInfiniteQuery(
    { companyId },
    { enabled: validId && Boolean(query.data), getNextPageParam: (last) => last.nextCursor },
  )
  const activitiesQuery = trpc.companies.getActivities.useInfiniteQuery(
    { companyId },
    { enabled: validId && Boolean(query.data), getNextPageParam: (last) => last.nextCursor },
  )
  const tasksQuery = trpc.companies.getTasks.useQuery(
    { companyId, includeCompleted: false },
    { enabled: validId && Boolean(query.data) },
  )
  const meetingsQuery = trpc.companies.getMeetings.useQuery(
    { companyId, limit: 20 },
    { enabled: validId && Boolean(query.data) },
  )
  const upcomingMeetingsQuery = trpc.companies.getMeetings.useQuery(
    { companyId, limit: 3, upcoming: true },
    { enabled: validId && Boolean(query.data) },
  )

  const linkedContacts = React.useMemo(
    () => contactsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [contactsQuery.data?.pages],
  )
  const notes = React.useMemo(
    () => notesQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [notesQuery.data?.pages],
  )
  const activities = React.useMemo(
    () => activitiesQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [activitiesQuery.data?.pages],
  )
  const meetings = meetingsQuery.data?.items ?? []
  const upcomingMeetings = upcomingMeetingsQuery.data?.items ?? []
  const nextMeeting = upcomingMeetings[0] ?? null

  // ── Update mutation ─────────────────────────────────────────────────
  const updateMutation = trpc.companies.update.useMutation({
    onSuccess: () => void query.refetch(),
    onError: (err) =>
      toast({ title: 'Speichern fehlgeschlagen', description: err.message, variant: 'destructive' }),
  })

  const saveField = React.useCallback(
    (field: string, value: unknown): void => {
      if (!query.data) return
      updateMutation.mutate({ id: query.data.id, data: { [field]: value } as Parameters<typeof updateMutation.mutate>[0]['data'] })
    },
    [query.data, updateMutation],
  )

  // ── Complete task ───────────────────────────────────────────────────
  const completeTask = trpc.companies.completeTask.useMutation({
    onMutate: async ({ taskId, completed }) => {
      await utils.companies.getTasks.cancel({ companyId, includeCompleted: false })
      const previous = utils.companies.getTasks.getData({ companyId, includeCompleted: false })
      utils.companies.getTasks.setData({ companyId, includeCompleted: false }, (old) => {
        if (!old) return old
        return completed
          ? old.filter((t) => t.id !== taskId)
          : old.map((t) => (t.id === taskId ? { ...t, completed_at: null } : t))
      })
      return { previous }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous)
        utils.companies.getTasks.setData({ companyId, includeCompleted: false }, ctx.previous)
      toast({ title: 'Aktualisierung fehlgeschlagen', description: err.message, variant: 'destructive' })
    },
    onSettled: () => {
      void utils.companies.getTasks.invalidate({ companyId, includeCompleted: false })
    },
  })

  // ── Delete ──────────────────────────────────────────────────────────
  const deleteMutation = trpc.companies.delete.useMutation({
    onSuccess: () => {
      void utils.companies.list.invalidate()
      toast({ title: 'Unternehmen gelöscht', variant: 'success' })
      router.push('/companies')
    },
    onError: (err) =>
      toast({ title: 'Löschen fehlgeschlagen', description: err.message, variant: 'destructive' }),
  })

  const createNote = trpc.notes.create.useMutation({
    onSuccess: (note) => {
      void utils.companies.getNotes.invalidate({ companyId })
      router.push(`/notes/${note.id}`)
    },
    onError: (err) =>
      toast({ title: 'Notiz konnte nicht erstellt werden', description: err.message, variant: 'destructive' }),
  })

  // ── Error states ─────────────────────────────────────────────────────
  if (!validId) {
    return (
      <main className="flex flex-1 flex-col px-8 py-6">
        <p className="text-[13px] text-muted-foreground">Ungültige Unternehmens-ID.</p>
        <Button asChild className="mt-4 w-fit" variant="outline">
          <Link href="/companies">Zurück zu Unternehmen</Link>
        </Button>
      </main>
    )
  }

  if (query.isLoading) {
    return (
      <main className="flex flex-1 flex-col">
        <div className="border-b border-border px-5 py-2.5">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="border-b border-border px-5 py-3.5">
          <Skeleton className="h-7 w-56" />
        </div>
        <div className="border-b border-border px-4 py-0">
          <Skeleton className="my-3 h-5 w-80" />
        </div>
        <div className="flex flex-1 gap-0 overflow-hidden">
          <div className="flex-1 space-y-4 p-6">
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
          <div className="w-72 border-l border-border p-5">
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </main>
    )
  }

  if (query.isError || !query.data) {
    return (
      <main className="flex flex-1 flex-col px-8 py-6">
        <p className="text-[13px] text-destructive">Unternehmen nicht gefunden.</p>
        <Button asChild className="mt-4 w-fit" variant="outline">
          <Link href="/companies">Zurück zu Unternehmen</Link>
        </Button>
      </main>
    )
  }

  const c = query.data
  const attrs = (c.attrs ?? {}) as Record<string, unknown>

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Übersicht' },
    { id: 'activity', label: 'Aktivität', count: activities.length },
    { id: 'emails', label: 'E-Mails' },
    { id: 'meetings', label: 'Meetings', count: meetings.length },
    { id: 'notizen', label: 'Notizen', count: notes.length },
    { id: 'aufgaben', label: 'Aufgaben', count: tasksQuery.data?.length },
    { id: 'dateien', label: 'Dateien' },
  ]

  return (
    <main className="flex flex-1 flex-col overflow-hidden">

      {/* ── Breadcrumb ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border bg-background px-5 py-1.5">
        <nav className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Link href="/companies" className="hover:text-foreground">
            Unternehmen
          </Link>
          <span>/</span>
          <span className="font-medium text-foreground">{c.name}</span>
          <button type="button" className="ml-1 text-muted-foreground hover:text-amber-400">
            <Star className="size-3.5" />
          </button>
        </nav>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[12px]" onClick={() => setEditOpen(true)}>
            <Pencil className="size-3.5" />
            Bearbeiten
          </Button>
          <button
            type="button"
            title="Neue Notiz"
            disabled={createNote.isPending}
            onClick={() => createNote.mutate({ company_id: c.id })}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <FileText className="size-3.5" />
          </button>
          <button
            type="button"
            title="Neue Aufgabe"
            onClick={() => setShowNewTaskDialog(true)}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <CheckSquare className="size-3.5" />
          </button>
          <button
            type="button"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <MoreHorizontal className="size-4" />
          </button>
          <button
            type="button"
            disabled={deleteMutation.isPending}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              if (window.confirm('Dieses Unternehmen wirklich löschen?'))
                deleteMutation.mutate({ id: c.id })
            }}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {/* ── Name + Icon ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 border-b border-border bg-background px-5 py-2.5">
        <div className="flex size-7 items-center justify-center rounded bg-muted text-foreground">
          <Building2 className="size-4" />
        </div>
        <h1 className="text-sm font-semibold text-foreground">{c.name}</h1>
        {c.domain ? (
          <span className="text-[12px] text-muted-foreground">· {c.domain}</span>
        ) : null}
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <div className="flex items-center border-b border-border bg-background px-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12px] transition-colors',
              activeTab === tab.id
                ? 'border-foreground font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 ? (
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[12px] font-medium',
                  activeTab === tab.id
                    ? 'bg-foreground/10 text-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ── Main Content ────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left scrollable area */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* Overview */}
          {activeTab === 'overview' ? (
            <div className="space-y-[18px]">
              <SectionHeader icon={Sparkles} label="Highlights">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                  <HighlightCard icon={Wifi} label="Verbindungsstärke" />
                  <HighlightCard icon={Calendar} label="Nächster Kalendertermin" value={
                    nextMeeting ? (
                      <span>
                        {nextMeeting.title}
                        <span className="block text-[11px] font-normal text-muted-foreground">
                          {new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(nextMeeting.start_at))}
                        </span>
                      </span>
                    ) : undefined
                  } />
                  <HighlightCard icon={Globe} label="Domain" value={
                    c.domain ? (
                      <a href={`https://${c.domain}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {c.domain}
                      </a>
                    ) : undefined
                  } />
                  <HighlightCard icon={Users} label="Kontakte" value={
                    c._count.contacts > 0 ? `${c._count.contacts} Personen` : undefined
                  } />
                  <HighlightCard icon={Building2} label="Branche" value={c.industry ?? undefined} />
                  <HighlightCard icon={Users} label="Größe" value={c.size ?? undefined} />
                </div>
              </SectionHeader>

              <SectionHeader icon={Activity} label="Aktivität" count={activities.length} onNavigate={() => setActiveTab('activity')}>
                {activities.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">Noch keine Aktivitäten.</p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-border">
                    {activities.slice(0, 3).map((a, i) => (
                      <div key={a.id} className={cn('px-3', i !== 0 && 'border-t border-border')}>
                        <ActivityItem
                          type={a.type}
                          data={(a.data as ActivityData) ?? {}}
                          avatarUrl={a.actor.avatar_url}
                          name={a.actor.full_name ?? 'Unbekannt'}
                          timestamp={a.created_at}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </SectionHeader>

              {upcomingMeetings.length > 0 ? (
                <SectionHeader icon={Calendar} label="Bevorstehende Meetings" count={upcomingMeetings.length} onNavigate={() => setActiveTab('meetings')}>
                  <div className="overflow-hidden rounded-lg border border-border">
                    {upcomingMeetings.map((m, i) => (
                      <div key={m.id} className={cn('px-3', i !== 0 && 'border-t border-border')}>
                        <MeetingRow meeting={m} />
                      </div>
                    ))}
                  </div>
                </SectionHeader>
              ) : null}

              {linkedContacts.length > 0 ? (
                <SectionHeader icon={Users} label="Personen" count={linkedContacts.length}>
                  <div className="overflow-hidden rounded-lg border border-border">
                    {linkedContacts.slice(0, 5).map((p, i) => {
                      const pName = [p.first_name, p.last_name].filter(Boolean).join(' ')
                      return (
                        <Link
                          key={p.id}
                          href={`/contacts/${p.id}`}
                          className={cn(
                            'flex items-center gap-2.5 px-3 py-2 hover:bg-accent/40',
                            i !== 0 && 'border-t border-border',
                          )}
                        >
                          <Avatar className="size-5">
                            <AvatarImage src={p.avatar_url ?? undefined} />
                            <AvatarFallback className="text-[9px]">{p.first_name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <span className="text-[12px] font-medium text-foreground">{pName}</span>
                          {p.email?.[0] ? (
                            <span className="text-[11px] text-muted-foreground">{p.email[0]}</span>
                          ) : null}
                        </Link>
                      )
                    })}
                  </div>
                </SectionHeader>
              ) : null}

              <SectionHeader icon={FileText} label="Notizen" count={notes.length} onAdd={() => createNote.mutate({ company_id: c.id })} onNavigate={() => setActiveTab('notizen')}>
                {notes.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">Noch keine Notizen.</p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-border">
                    {notes.slice(0, 5).map((n, i) => (
                      <div key={n.id} className={cn('px-3 py-0.5', i !== 0 && 'border-t border-border')}>
                        <NoteRow note={n} />
                      </div>
                    ))}
                  </div>
                )}
              </SectionHeader>

              {tasksQuery.data && tasksQuery.data.length > 0 ? (
                <SectionHeader icon={CheckSquare} label="Aufgaben" count={tasksQuery.data.length} onAdd={() => setShowNewTaskDialog(true)} onNavigate={() => setActiveTab('aufgaben')}>
                  <div className="overflow-hidden rounded-lg border border-border">
                    {tasksQuery.data.slice(0, 5).map((task, i) => (
                      <div
                        key={task.id}
                        className={cn(
                          'flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-accent/40',
                          i !== 0 && 'border-t border-border',
                        )}
                        onClick={() => setEditingTask(task as Task)}
                      >
                        <Checkbox
                          checked={false}
                          onCheckedChange={(checked) => {
                            if (checked === true)
                              completeTask.mutate({ taskId: task.id, completed: true })
                          }}
                          aria-label="Als erledigt markieren"
                          className="mt-0.5 size-3.5 shrink-0 rounded-full"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="flex-1 text-[12px] font-medium text-foreground leading-relaxed">
                          {task.title}
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                          {task.assignee ? (
                            <Avatar className="size-4" title={task.assignee.full_name ?? 'Zugewiesen'}>
                              <AvatarImage src={task.assignee.avatar_url ?? undefined} />
                              <AvatarFallback className="bg-orange-500 text-[9px] text-white">
                                {task.assignee.full_name?.charAt(0) ?? '?'}
                              </AvatarFallback>
                            </Avatar>
                          ) : null}
                          {task.due_at ? <DueBadge date={task.due_at} /> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionHeader>
              ) : null}
            </div>
          ) : null}

          {/* Activity */}
          {activeTab === 'activity' ? (
            <div>
              {activities.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">Noch keine Aktivitäten.</p>
              ) : (
                <div className="divide-y divide-border/60">
                  {activities.map((a) => (
                    <ActivityItem
                      key={a.id}
                      type={a.type}
                      data={(a.data as ActivityData) ?? {}}
                      avatarUrl={a.actor.avatar_url}
                      name={a.actor.full_name ?? 'Unbekannt'}
                      timestamp={a.created_at}
                    />
                  ))}
                </div>
              )}
              {activitiesQuery.hasNextPage ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  disabled={activitiesQuery.isFetchingNextPage}
                  onClick={() => void activitiesQuery.fetchNextPage()}
                >
                  Mehr laden
                </Button>
              ) : null}
            </div>
          ) : null}

          {/* E-Mails */}
          {activeTab === 'emails' ? (
            <p className="text-[13px] text-muted-foreground">E-Mail-Synchronisation kommt in Kürze.</p>
          ) : null}

          {/* Meetings */}
          {activeTab === 'meetings' ? (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[12px] font-bold uppercase tracking-wide text-foreground">Meetings</span>
              </div>
              {meetings.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">Keine Meetings gefunden.</p>
              ) : (
                <div className="divide-y divide-border/60">
                  {meetings.map((m) => (
                    <MeetingRow key={m.id} meeting={m} />
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {/* Notizen */}
          {activeTab === 'notizen' ? (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[12px] font-bold uppercase tracking-wide text-foreground">Notizen</span>
                <button
                  type="button"
                  onClick={() => createNote.mutate({ company_id: c.id })}
                  disabled={createNote.isPending}
                  className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
              {notes.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">Noch keine Notizen.</p>
              ) : (
                <div className="divide-y divide-border/60">
                  {notes.map((n) => (
                    <NoteRow key={n.id} note={n} />
                  ))}
                </div>
              )}
              {notesQuery.hasNextPage ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  disabled={notesQuery.isFetchingNextPage}
                  onClick={() => void notesQuery.fetchNextPage()}
                >
                  Mehr laden
                </Button>
              ) : null}
            </div>
          ) : null}

          {/* Aufgaben */}
          {activeTab === 'aufgaben' ? (
            <div className="space-y-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[12px] font-bold uppercase tracking-wide text-foreground">Aufgaben</span>
                <button
                  type="button"
                  onClick={() => setShowNewTaskDialog(true)}
                  className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
              {!tasksQuery.data?.length ? (
                <p className="text-[12px] text-muted-foreground">Keine offenen Aufgaben.</p>
              ) : (
                tasksQuery.data.map((task) => (
                  <div
                    key={task.id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3.5 hover:bg-accent/40"
                    onClick={() => setEditingTask(task as Task)}
                  >
                    <Checkbox
                      checked={false}
                      onCheckedChange={(checked) => {
                        if (checked === true)
                          completeTask.mutate({ taskId: task.id, completed: true })
                      }}
                      aria-label="Als erledigt markieren"
                      className="mt-0.5"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium">{task.title}</p>
                      {task.description ? (
                        <p className="mt-0.5 text-[12px] text-muted-foreground">{task.description}</p>
                      ) : null}
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {task.assignee ? (
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <Avatar className="size-4">
                              <AvatarImage src={task.assignee.avatar_url ?? undefined} />
                              <AvatarFallback className="bg-orange-500 text-[9px] text-white">
                                {task.assignee.full_name?.charAt(0) ?? '?'}
                              </AvatarFallback>
                            </Avatar>
                            <span>{task.assignee.full_name ?? 'Zugewiesen'}</span>
                          </div>
                        ) : null}
                        {task.due_at ? <DueBadge date={task.due_at} /> : null}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : null}

          {/* Dateien */}
          {activeTab === 'dateien' ? (
            <AttachmentsTab companyId={c.id} />
          ) : null}
        </div>

        {/* ── Right Details Panel ──────────────────────────────────────── */}
        <aside className="w-72 shrink-0 overflow-y-auto border-l border-border bg-background">
          <div className="flex items-center border-b border-border px-4">
            <button
              type="button"
              className="border-b-2 border-foreground px-2 py-2.5 text-[13px] font-medium text-foreground"
            >
              Details
            </button>
            <button
              type="button"
              className="border-b-2 border-transparent px-2 py-2.5 text-[13px] text-muted-foreground hover:text-foreground"
            >
              Kommentare
            </button>
          </div>

          <div className="space-y-5 p-4">
            <div>
              <div className="mb-2 flex items-center gap-1 text-[12px] font-bold uppercase tracking-wide text-foreground">
                <Building2 className="size-3.5 text-muted-foreground" />
                Datensatz-Details
              </div>

              <div className="space-y-0.5">
                <EditableDetailRow
                  icon={Building2}
                  label="Name"
                  value={c.name}
                  placeholder="Name eingeben…"
                  onSave={(v) => saveField('name', v)}
                />
                <EditableDetailRow
                  icon={Globe}
                  label="Domain"
                  value={c.domain ?? undefined}
                  placeholder="Domain eingeben…"
                  onSave={(v) => saveField('domain', v)}
                  href={c.domain ? `https://${c.domain}` : undefined}
                />
                <EditableDetailRow
                  icon={Building2}
                  label="Branche"
                  value={c.industry ?? undefined}
                  placeholder="Branche eingeben…"
                  onSave={(v) => saveField('industry', v)}
                />
                <EditableDetailRow
                  icon={Users}
                  label="Größe"
                  value={c.size ?? undefined}
                  placeholder="Größe eingeben…"
                  onSave={(v) => saveField('size', v)}
                />
                <EditableDetailRow
                  icon={Pencil}
                  label="Beschreibung"
                  value={attrs.description as string | undefined}
                  placeholder="Beschreibung…"
                  onSave={(v) => {
                    const existing = (c.attrs ?? {}) as Record<string, unknown>
                    updateMutation.mutate({ id: c.id, data: { attrs: { ...existing, description: v } } })
                  }}
                />
                <EditableDetailRow
                  icon={Calendar}
                  label="Erstellt"
                  value={formatDate(c.created_at)}
                />
              </div>
            </div>

            {/* People list in sidebar */}
            {linkedContacts.length > 0 ? (
              <div>
                <div className="mb-2 flex items-center gap-1 text-[12px] font-bold uppercase tracking-wide text-foreground">
                  <Users className="size-3.5 text-muted-foreground" />
                  Personen ({linkedContacts.length})
                </div>
                <div className="space-y-1">
                  {linkedContacts.slice(0, 8).map((p) => {
                    const pName = [p.first_name, p.last_name].filter(Boolean).join(' ')
                    return (
                      <Link
                        key={p.id}
                        href={`/contacts/${p.id}`}
                        className="flex items-center gap-2 rounded py-1 text-[12px] hover:bg-accent/60"
                      >
                        <Avatar className="size-5">
                          <AvatarImage src={p.avatar_url ?? undefined} />
                          <AvatarFallback className="text-[9px]">{p.first_name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span className="truncate font-medium text-foreground">{pName}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      <TaskFormDialog
        open={editingTask !== null}
        onOpenChange={(open) => { if (!open) setEditingTask(null) }}
        task={editingTask}
      />
      <TaskFormDialog
        open={showNewTaskDialog}
        onOpenChange={setShowNewTaskDialog}
        initialRecord={{ id: c.id, type: 'company', label: c.name }}
      />
      <CompanyFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        company={c}
        onSaved={() => void query.refetch()}
      />
    </main>
  )
}
