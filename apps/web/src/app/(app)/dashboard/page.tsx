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
} from 'lucide-react'
import Link from 'next/link'
import { useState, useCallback, useMemo } from 'react'

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Guten Morgen'
  if (h < 18) return 'Guten Tag'
  return 'Guten Abend'
}

const mockMeetings = [
  { id: '1', title: 'Morgen Routine', time: '6:30 - 7:15', color: 'bg-purple-400' },
  { id: '2', title: 'Team Standup', time: '10:00 - 10:15', color: 'bg-green-400' },
  { id: '3', title: 'Produkt Review', time: '14:00 - 15:00', color: 'bg-blue-400' },
]

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

export default function DashboardPage() {
  const utils = trpc.useUtils()
  const { data: activeTasks = [] as Task[] } = trpc.tasks.list.useQuery()
  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => { utils.tasks.list.invalidate(); utils.tasks.completed.invalidate() },
  })

  const [chatInput, setChatInput] = useState('')

  const todayTasks = useMemo(
    () => activeTasks.filter(isTodayOrOverdue),
    [activeTasks],
  )

  const badgeCount = useMemo(
    () => activeTasks.filter(isOverdueOrNoDate).length,
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

  const today = new Date()

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

          {/* Termine (Mock) */}
          <div className="mt-10">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-foreground">Termine</h2>
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-muted-foreground">
                  Heute, {today.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}
                </span>
                <div className="flex items-center gap-0.5">
                  <button className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground">
                    <ChevronLeft size={14} />
                  </button>
                  <button className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground">
                    <ChevronRight size={14} />
                  </button>
                </div>
                <button className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground">
                  <MoreHorizontal size={14} />
                </button>
              </div>
            </div>
            <div className="mt-3 space-y-1">
              {mockMeetings.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-md px-1 py-2 transition-colors hover:bg-muted/50"
                >
                  <div className={cn('size-2 rounded-full', m.color)} />
                  <span className="flex-1 text-[13px] text-foreground/70">{m.title}</span>
                  <span className="text-[12px] text-muted-foreground">{m.time}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Aufgaben — nur heute & überfällig */}
          <div className="mt-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-semibold text-foreground">Aufgaben</h2>
                {badgeCount > 0 && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-600">
                    {badgeCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/tasks"
                  className="text-[12px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  Alle anzeigen
                </Link>
                <Link
                  href="/tasks"
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Plus size={14} />
                </Link>
              </div>
            </div>
            <div className="mt-3">
              {todayTasks.length === 0 ? (
                <p className="py-4 text-center text-[13px] text-muted-foreground/60">
                  Keine Aufgaben für heute
                </p>
              ) : (
                <div className="divide-y divide-border/60">
                  {todayTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task as Task}
                      onStatusChange={() => toggleDone(task as Task)}
                      onEdit={() => openEditDialog(task as Task)}
                      compact
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Task Edit Dialog (gleicher wie im Aufgabenbereich) */}
      <TaskFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask}
      />
    </div>
  )
}
