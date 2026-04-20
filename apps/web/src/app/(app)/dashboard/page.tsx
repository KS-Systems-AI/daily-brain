'use client'

import { trpc } from '@/lib/trpc/provider'
import { cn } from '@/lib/utils'
import type { Task, TaskStatus } from '@/store/task-store'
import { TaskRow } from '@/components/tasks/task-row'
import { TaskFormDialog } from '@/components/tasks/task-form-dialog'
import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Send,
  Sparkles,
  Calendar,
  MapPin,
} from 'lucide-react'
import Link from 'next/link'
import { useState, useCallback, useMemo } from 'react'

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Guten Morgen'
  if (h < 18) return 'Guten Tag'
  return 'Guten Abend'
}

function isTodayOrOverdue(task: { due_at: Date | null; status: string | null }): boolean {
  const isDone = task.status === 'done' || task.status === 'cancelled'
  if (isDone) return false
  if (!task.due_at) return true
  const now = new Date()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return new Date(task.due_at) < todayEnd
}

function isOverdueOrNoDate(task: { due_at: Date | null; status: string | null }): boolean {
  const isDone = task.status === 'done' || task.status === 'cancelled'
  if (isDone) return false
  if (!task.due_at) return true
  return new Date(task.due_at).getTime() < Date.now()
}

function isTaskForDate(task: { due_at: Date | null; status: string | null }, date: Date): boolean {
  const isDone = task.status === 'done' || task.status === 'cancelled'
  if (isDone) return false
  if (!task.due_at) return false
  const d = new Date(task.due_at)
  return d.getFullYear() === date.getFullYear() &&
    d.getMonth() === date.getMonth() &&
    d.getDate() === date.getDate()
}

function fmtTime(d: Date): string {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

type TimelineItem =
  | { kind: 'event'; sortTime: number; event: { id: string; title: string; start_at: Date | string; end_at: Date | string; is_all_day: boolean; location: string | null; attendees: unknown } }
  | { kind: 'task'; sortTime: number; task: Task }

export default function DashboardPage() {
  const utils = trpc.useUtils()
  const { data: activeTasks = [] as Task[] } = trpc.tasks.list.useQuery()
  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => { utils.tasks.list.invalidate(); utils.tasks.completed.invalidate() },
  })

  const [chatInput, setChatInput] = useState('')
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  })

  const startOfDay = useMemo(() => new Date(selectedDate), [selectedDate])
  const endOfDay = useMemo(() => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + 1)
    return d
  }, [selectedDate])

  const { data: calendarEvents = [] } = trpc.calendar.list.useQuery({
    startAt: startOfDay,
    endAt: endOfDay,
  })

  const isToday = useMemo(() => {
    const now = new Date()
    return selectedDate.getFullYear() === now.getFullYear() &&
      selectedDate.getMonth() === now.getMonth() &&
      selectedDate.getDate() === now.getDate()
  }, [selectedDate])

  const timeline = useMemo(() => {
    const items: TimelineItem[] = []

    for (const ev of calendarEvents) {
      items.push({
        kind: 'event',
        sortTime: ev.is_all_day ? -1 : new Date(ev.start_at).getTime(),
        event: ev,
      })
    }

    const tasksForDate = isToday
      ? (activeTasks as Task[]).filter(isTodayOrOverdue)
      : (activeTasks as Task[]).filter((t) => isTaskForDate(t, selectedDate))

    for (const task of tasksForDate) {
      const dueAt = task.due_at ? new Date(task.due_at) : null
      const hasTime = dueAt && (dueAt.getHours() !== 0 || dueAt.getMinutes() !== 0)
      items.push({
        kind: 'task',
        sortTime: hasTime ? dueAt!.getTime() : Infinity,
        task,
      })
    }

    items.sort((a, b) => {
      if (a.sortTime === -1 && b.sortTime !== -1) return -1
      if (b.sortTime === -1 && a.sortTime !== -1) return 1
      return a.sortTime - b.sortTime
    })

    return items
  }, [calendarEvents, activeTasks, selectedDate, isToday])

  const badgeCount = useMemo(
    () => (activeTasks as Task[]).filter(isOverdueOrNoDate).length,
    [activeTasks],
  )

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  const openEditDialog = useCallback((task: Task) => {
    setEditingTask(task)
    setDialogOpen(true)
  }, [])

  const toggleDone = useCallback(
    (task: Task) => {
      const isDone = task.status === 'done'
      updateTask.mutate({
        id: task.id,
        status: isDone ? 'todo' : 'done',
        completed_at: isDone ? null : new Date().toISOString(),
      })
    },
    [updateTask],
  )

  const goDay = useCallback((delta: number) => {
    setSelectedDate((prev) => {
      const d = new Date(prev)
      d.setDate(d.getDate() + delta)
      return d
    })
  }, [])

  const goToday = useCallback(() => {
    const d = new Date()
    setSelectedDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()))
  }, [])

  const dateLabel = useMemo(() => {
    if (isToday) return `Heute, ${selectedDate.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}`
    const now = new Date()
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    if (selectedDate.getTime() === tomorrow.getTime()) {
      return `Morgen, ${selectedDate.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}`
    }
    return selectedDate.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })
  }, [selectedDate, isToday])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-6 py-3">
        <div className="flex size-5 items-center justify-center rounded text-muted-foreground">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </div>
        <span className="text-[13px] font-medium text-foreground">Start</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-10">
          <h1 className="text-[28px] font-semibold text-foreground" style={{ letterSpacing: '-0.02em' }}>
            {getGreeting()}, Kevin.
          </h1>

          {/* KI-Chat */}
          <div className="mt-6">
            <div className="mb-2 flex items-center gap-2 text-[12px] text-muted-foreground">
              <Sparkles size={12} />
              <span>Letzter Chat</span>
              <span className="text-foreground/70">·</span>
              <span className="text-foreground/70">Frag mich alles</span>
            </div>
            <div className="rounded-xl border border-border bg-card shadow-sm">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Frag mich alles..."
                rows={3}
                className="w-full resize-none rounded-t-xl bg-transparent px-4 py-3 text-[14px] text-foreground placeholder-muted-foreground/50 outline-none"
              />
              <div className="flex items-center justify-end gap-2 border-t border-border/50 px-3 py-2">
                <span className="text-[12px] font-medium text-muted-foreground">Auto</span>
                <button className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
                <button className="flex size-7 items-center justify-center rounded-full bg-orange-500 text-white shadow-sm transition-opacity hover:opacity-90">
                  <Send size={12} />
                </button>
              </div>
            </div>
          </div>

          {/* Timeline: Termine + Aufgaben */}
          <div className="mt-10">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-foreground">Tagesplan</h2>
              <div className="flex items-center gap-2">
                {!isToday ? (
                  <button
                    onClick={goToday}
                    className="rounded px-2 py-0.5 text-[12px] font-medium text-orange-500 transition-colors hover:bg-orange-50"
                  >
                    Heute
                  </button>
                ) : null}
                <span className="text-[13px] text-muted-foreground">{dateLabel}</span>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => goDay(-1)}
                    className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    onClick={() => goDay(1)}
                    className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
                <Link
                  href="/calendar"
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Calendar size={14} />
                </Link>
              </div>
            </div>
            <div className="mt-3">
              {timeline.length === 0 ? (
                <p className="py-4 text-center text-[13px] text-muted-foreground/60">
                  Keine Termine oder Aufgaben für diesen Tag
                </p>
              ) : (
                <div className="space-y-0.5">
                  {timeline.map((item) =>
                    item.kind === 'event' ? (
                      <div
                        key={`ev-${item.event.id}`}
                        className="flex items-center gap-3 rounded-md px-1 py-2 transition-colors hover:bg-muted/50"
                      >
                        <div className="size-2 shrink-0 rounded-full bg-blue-400" />
                        <span className="flex-1 text-[13px] text-foreground/70">{item.event.title}</span>
                        <div className="flex items-center gap-2">
                          {item.event.location ? (
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <MapPin size={10} />
                              <span className="max-w-[100px] truncate">{item.event.location}</span>
                            </span>
                          ) : null}
                          <span className="text-[12px] text-muted-foreground">
                            {item.event.is_all_day
                              ? 'Ganztägig'
                              : `${fmtTime(new Date(item.event.start_at))} - ${fmtTime(new Date(item.event.end_at))}`}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <TaskRow
                        key={`task-${item.task.id}`}
                        task={item.task}
                        onStatusChange={() => toggleDone(item.task)}
                        onEdit={() => openEditDialog(item.task)}
                        compact
                      />
                    ),
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Overdue / no-date tasks (only on "today" view) */}
          {isToday ? (() => {
            const undatedTasks = (activeTasks as Task[]).filter((t) => {
              const isDone = t.status === 'done' || t.status === 'cancelled'
              if (isDone) return false
              return !t.due_at
            })
            if (undatedTasks.length === 0) return null
            return (
              <div className="mt-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[15px] font-semibold text-foreground">Ohne Termin</h2>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {undatedTasks.length}
                    </span>
                  </div>
                  <Link
                    href="/tasks"
                    className="text-[12px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Alle anzeigen
                  </Link>
                </div>
                <div className="mt-3 divide-y divide-border/60">
                  {undatedTasks.slice(0, 5).map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      onStatusChange={() => toggleDone(task)}
                      onEdit={() => openEditDialog(task)}
                      compact
                    />
                  ))}
                </div>
              </div>
            )
          })() : null}
        </div>
      </div>

      <TaskFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask}
      />
    </div>
  )
}
