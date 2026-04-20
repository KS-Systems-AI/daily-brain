'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Mail,
  Phone,
  Building2,
  MapPin,
  Calendar,
  Wifi,
  Plus,
  Pencil,
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
import { formatTime } from '@/lib/task-parser'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

function initials(first: string, last?: string | null): string {
  const a = first.charAt(0).toUpperCase()
  const b = last?.charAt(0).toUpperCase() ?? ''
  return (a + b).slice(0, 2)
}

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
}

type Tab = 'overview' | 'activity' | 'emails' | 'meetings' | 'notizen' | 'aufgaben' | 'dateien'

// ─── Editable Detail Row ───────────────────────────────────────────────────────
// Einzeilig: [Icon] [Label, feste Breite] [Wert / Input]
function EditableDetailRow({
  icon: Icon,
  label,
  value,
  placeholder = 'Wert setzen…',
  onSave,
  href,
  multiValue,
  onSaveMulti,
}: {
  icon: React.ElementType
  label: string
  value?: string
  placeholder?: string
  onSave?: (v: string) => void
  href?: string
  multiValue?: string[]
  onSaveMulti?: (v: string[]) => void
}): React.JSX.Element {
  const [editing, setEditing] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // For multi-value (email, phone) we join with comma for editing
  const displayValue = multiValue !== undefined ? (multiValue.join(', ') || undefined) : value
  const [draft, setDraft] = React.useState(displayValue ?? '')

  // Sync draft when value changes externally
  React.useEffect(() => {
    if (!editing) setDraft(displayValue ?? '')
  }, [displayValue, editing])

  React.useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commit = (): void => {
    const trimmed = draft.trim()
    if (multiValue !== undefined && onSaveMulti) {
      const arr = trimmed ? trimmed.split(/[,;]\s*/).map((s) => s.trim()).filter(Boolean) : []
      if (arr.join(', ') !== (multiValue ?? []).join(', ')) onSaveMulti(arr)
    } else if (onSave && trimmed !== (value ?? '')) {
      onSave(trimmed)
    }
    setEditing(false)
  }

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    if (e.key === 'Escape') { setDraft(displayValue ?? ''); setEditing(false) }
  }

  return (
    <div
      className={cn(
        'group flex min-h-[28px] items-center gap-2 rounded px-1.5 py-1 -mx-1.5',
        !editing && (onSave || onSaveMulti) && 'cursor-text hover:bg-accent/60',
      )}
      onClick={() => {
        if (!editing && (onSave || onSaveMulti)) {
          setDraft(displayValue ?? '')
          setEditing(true)
        }
      }}
    >
      {/* Icon */}
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />

      {/* Label – feste Breite */}
      <span className="w-24 shrink-0 text-[12px] text-muted-foreground">{label}</span>

      {/* Wert / Input */}
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
          {/* Speicher-Button: mouseDown verhindert blur, onClick speichert */}
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
      ) : displayValue ? (
        href ? (
          <Link
            href={href}
            className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {displayValue}
          </Link>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
            {displayValue}
          </span>
        )
      ) : (
        <span className="min-w-0 flex-1 text-[13px] text-muted-foreground">{placeholder}</span>
      )}
    </div>
  )
}

// ─── Note Row ─────────────────────────────────────────────────────────────────
// Einzeilig: [Avatar] [Autor] · [Titel / Inhalt-Vorschau] · [Zeitstempel]
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
      {/* Autor – feste Mindestbreite damit er nicht zu stark schrumpft */}
      <span className="shrink-0 text-[12px] font-medium text-foreground">
        {note.author.full_name ?? 'Unbekannt'}
      </span>
      <span className="shrink-0 text-[12px] text-muted-foreground">·</span>
      {/* Titel fett, Inhalt muted – beide in einer Zeile, wird abgeschnitten */}
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
  account: { provider: string; email: string; display_name?: string | null }
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

// ─── Activity Item ─────────────────────────────────────────────────────────────
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
export function ContactDetailView({ contactId }: { contactId: string }): React.JSX.Element {
  const router = useRouter()
  const { toast } = useToast()
  const utils = trpc.useUtils()
  const [activeTab, setActiveTab] = React.useState<Tab>('overview')
  const [editingTask, setEditingTask] = React.useState<Task | null>(null)
  const [showNewTaskDialog, setShowNewTaskDialog] = React.useState(false)
  const validId = isUuid(contactId)

  const query = trpc.contacts.getById.useQuery({ id: contactId }, { enabled: validId })

  const notesQuery = trpc.contacts.getNotes.useInfiniteQuery(
    { contactId },
    { enabled: validId && Boolean(query.data), getNextPageParam: (last) => last.nextCursor },
  )
  const activitiesQuery = trpc.contacts.getActivities.useInfiniteQuery(
    { contactId },
    { enabled: validId && Boolean(query.data), getNextPageParam: (last) => last.nextCursor },
  )
  const tasksQuery = trpc.contacts.getTasks.useQuery(
    { contactId, includeCompleted: false },
    { enabled: validId && Boolean(query.data) },
  )

  const meetingsQuery = trpc.contacts.getMeetings.useQuery(
    { contactId, limit: 20 },
    { enabled: validId && Boolean(query.data) },
  )
  const upcomingMeetingsQuery = trpc.contacts.getMeetings.useQuery(
    { contactId, limit: 3, upcoming: true },
    { enabled: validId && Boolean(query.data) },
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

  // ── Update mutation (inline editing) ──────────────────────────────────────
  const updateMutation = trpc.contacts.update.useMutation({
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

  const saveAttrField = React.useCallback(
    (key: string, value: string): void => {
      if (!query.data) return
      const existing = (query.data.attrs ?? {}) as Record<string, unknown>
      updateMutation.mutate({
        id: query.data.id,
        data: { attrs: { ...existing, [key]: value } },
      })
    },
    [query.data, updateMutation],
  )

  // ── Complete task ──────────────────────────────────────────────────────────
  const completeTask = trpc.contacts.completeTask.useMutation({
    onMutate: async ({ taskId, completed }) => {
      await utils.contacts.getTasks.cancel({ contactId, includeCompleted: false })
      const previous = utils.contacts.getTasks.getData({ contactId, includeCompleted: false })
      utils.contacts.getTasks.setData({ contactId, includeCompleted: false }, (old) => {
        if (!old) return old
        return completed
          ? old.filter((t) => t.id !== taskId)
          : old.map((t) => (t.id === taskId ? { ...t, completed_at: null } : t))
      })
      return { previous }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous)
        utils.contacts.getTasks.setData({ contactId, includeCompleted: false }, ctx.previous)
      toast({ title: 'Aktualisierung fehlgeschlagen', description: err.message, variant: 'destructive' })
    },
    onSettled: () => {
      void utils.contacts.getTasks.invalidate({ contactId, includeCompleted: false })
      void utils.contacts.getTasks.invalidate({ contactId, includeCompleted: true })
    },
  })

  // ── Delete ─────────────────────────────────────────────────────────────────
  const deleteMutation = trpc.contacts.delete.useMutation({
    onSuccess: () => {
      void utils.contacts.list.invalidate()
      toast({ title: 'Kontakt gelöscht', variant: 'success' })
      router.push('/contacts')
    },
    onError: (err) =>
      toast({ title: 'Löschen fehlgeschlagen', description: err.message, variant: 'destructive' }),
  })

  const createNote = trpc.notes.create.useMutation({
    onSuccess: (note) => {
      void utils.contacts.getNotes.invalidate({ contactId })
      router.push(`/notes/${note.id}`)
    },
    onError: (err) =>
      toast({ title: 'Notiz konnte nicht erstellt werden', description: err.message, variant: 'destructive' }),
  })

  // ── Error states ──────────────────────────────────────────────────────────
  if (!validId) {
    return (
      <main className="flex flex-1 flex-col px-8 py-6">
        <p className="text-[13px] text-muted-foreground">Ungültige Kontakt-ID.</p>
        <Button asChild className="mt-4 w-fit" variant="outline">
          <Link href="/contacts">Zurück zu Kontakten</Link>
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
        <p className="text-[13px] text-destructive">Kontakt nicht gefunden.</p>
        <Button asChild className="mt-4 w-fit" variant="outline">
          <Link href="/contacts">Zurück zu Kontakten</Link>
        </Button>
      </main>
    )
  }

  const c = query.data
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ')
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

      {/* ── Breadcrumb-Leiste ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border bg-background px-5 py-1.5">
        <nav className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Link href="/contacts" className="hover:text-foreground">
            Personen
          </Link>
          <span>/</span>
          <span className="font-medium text-foreground">{name}</span>
          <button type="button" className="ml-1 text-muted-foreground hover:text-amber-400">
            <Star className="size-3.5" />
          </button>
        </nav>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[12px]">
            <Mail className="size-3.5" />
            E-Mail verfassen
          </Button>
          <button
            type="button"
            title="Neue Notiz"
            disabled={createNote.isPending}
            onClick={() => createNote.mutate({ contact_id: c.id })}
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
              if (window.confirm('Diesen Kontakt wirklich löschen?'))
                deleteMutation.mutate({ id: c.id })
            }}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {/* ── Kontaktname + Avatar ───────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 border-b border-border bg-background px-5 py-2.5">
        <Avatar className="size-7">
          <AvatarImage src={c.avatar_url ?? undefined} alt="" />
          <AvatarFallback className="text-[12px] font-semibold">
            {initials(c.first_name, c.last_name)}
          </AvatarFallback>
        </Avatar>
        <h1 className="text-sm font-semibold text-foreground">{name}</h1>
      </div>

      {/* ── Tab-Navigation ────────────────────────────────────────────────── */}
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

      {/* ── Hauptinhalt ───────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Linker scrollbarer Bereich */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* Übersicht */}
          {activeTab === 'overview' ? (
            <div className="space-y-[18px]">
              <SectionHeader icon={Sparkles} label="Highlights">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                  <HighlightCard icon={Wifi} label="Verbindungsstärke" value={
                    <span className="flex items-center gap-1 text-destructive">
                      <span className="size-2 rounded-full bg-destructive" />
                      Sehr schwach
                    </span>
                  } />
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
                  <HighlightCard icon={Building2} label="Unternehmen" value={
                    c.company ? (
                      <Link href={`/companies/${c.company.id}`} className="hover:underline">
                        {c.company.name}
                      </Link>
                    ) : undefined
                  } />
                  <HighlightCard icon={Mail} label="E-Mail-Adressen" value={
                    c.email.length ? (
                      <a href={`mailto:${c.email[0]}`} className="hover:underline">
                        {c.email[0]}
                      </a>
                    ) : undefined
                  } />
                  <HighlightCard icon={Phone} label="Telefonnummern" value={
                    c.phone.length ? c.phone[0] : undefined
                  } />
                  <HighlightCard icon={MapPin} label="Hauptstandort" />
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

              <SectionHeader icon={FileText} label="Notizen" count={notes.length} onAdd={() => createNote.mutate({ contact_id: c.id })} onNavigate={() => setActiveTab('notizen')}>
                {notes.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">Noch keine Notizen.</p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-border">
                    {notes.slice(0, 5).map((n, i) => (
                      <div
                        key={n.id}
                        className={cn('px-3 py-0.5', i !== 0 && 'border-t border-border')}
                      >
                        <NoteRow note={n} />
                      </div>
                    ))}
                  </div>
                )}
              </SectionHeader>

              {tasksQuery.data && tasksQuery.data.length > 0 ? (
                <div>
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
                          {/* Checkbox */}
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

                          {/* Titel (darf umbrechen) */}
                          <span className="flex-1 text-[12px] font-medium text-foreground leading-relaxed">
                            {task.title}
                          </span>

                          {/* Meta rechts */}
                          <div className="flex shrink-0 items-center gap-2">
                            {task.assignee ? (
                              <Avatar className="size-4" title={task.assignee.full_name ?? 'Zugewiesen'}>
                                <AvatarImage src={task.assignee.avatar_url ?? undefined} />
                                <AvatarFallback className="bg-orange-500 text-[9px] text-white">
                                  {task.assignee.full_name?.charAt(0) ?? '?'}
                                </AvatarFallback>
                              </Avatar>
                            ) : null}
                            {task.due_at ? (
                              <DueBadge
                                date={task.due_at}
                                endAt={task.end_at ?? undefined}
                              />
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </SectionHeader>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Aktivität */}
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

          {/* Notizen */}
          {activeTab === 'notizen' ? (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[12px] font-bold uppercase tracking-wide text-foreground">Notizen</span>
                <button
                  type="button"
                  onClick={() => createNote.mutate({ contact_id: c.id })}
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
                        {task.due_at ? (
                          <DueBadge date={task.due_at} endAt={task.end_at ?? undefined} />
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : null}

          {/* E-Mails – Platzhalter */}
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

          {/* Dateien */}
          {activeTab === 'dateien' ? (
            <AttachmentsTab contactId={c.id} />
          ) : null}
        </div>

        {/* ── Rechtes Details-Panel ──────────────────────────────────────────── */}
        <aside className="w-72 shrink-0 overflow-y-auto border-l border-border bg-background">

          {/* Details / Kommentare Sub-Tabs */}
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

            {/* Datensatz-Details */}
            <div>
              <div className="mb-2 flex items-center gap-1 text-[12px] font-bold uppercase tracking-wide text-foreground">
                <User className="size-3.5 text-muted-foreground" />
                Datensatz-Details
              </div>

              <div className="space-y-0.5">
                <EditableDetailRow
                  icon={User}
                  label="Vorname"
                  value={c.first_name}
                  placeholder="Vorname eingeben…"
                  onSave={(v) => saveField('first_name', v)}
                />
                <EditableDetailRow
                  icon={User}
                  label="Nachname"
                  value={c.last_name ?? undefined}
                  placeholder="Nachname eingeben…"
                  onSave={(v) => saveField('last_name', v)}
                />
                <EditableDetailRow
                  icon={Mail}
                  label="E-Mail"
                  multiValue={c.email}
                  placeholder="E-Mail eingeben…"
                  onSaveMulti={(v) => saveField('email', v)}
                />
                <EditableDetailRow
                  icon={Phone}
                  label="Telefon"
                  multiValue={c.phone}
                  placeholder="Telefon eingeben…"
                  onSaveMulti={(v) => saveField('phone', v)}
                />
                <EditableDetailRow
                  icon={Building2}
                  label="Unternehmen"
                  value={c.company?.name}
                  placeholder="Unternehmen wählen…"
                  href={c.company ? `/companies/${c.company.id}` : undefined}
                />
                <EditableDetailRow
                  icon={Pencil}
                  label="Beschreibung"
                  value={attrs.description as string | undefined}
                  placeholder="Beschreibung eingeben…"
                  onSave={(v) => saveAttrField('description', v)}
                />
                <EditableDetailRow
                  icon={FileText}
                  label="Jobtitel"
                  value={attrs.job_title as string | undefined}
                  placeholder="Jobtitel eingeben…"
                  onSave={(v) => saveAttrField('job_title', v)}
                />
                <EditableDetailRow
                  icon={Calendar}
                  label="Erstellt"
                  value={formatDate(c.created_at)}
                />
              </div>
            </div>


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
        initialRecord={{ id: c.id, type: 'contact', label: name }}
      />
    </main>
  )
}
