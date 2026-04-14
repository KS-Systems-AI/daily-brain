'use client'

import { trpc } from '@/lib/trpc/provider'
import { cn } from '@/lib/utils'
import type { Task, TaskStatus } from '@/store/task-store'
import { TaskRow } from './task-row'
import { TaskFormDialog } from './task-form-dialog'
import { CheckSquare, ChevronDown, Plus } from 'lucide-react'
import { useState, useCallback } from 'react'

export function TaskList() {
  const utils = trpc.useUtils()
  const { data: activeTasks = [], isLoading } = trpc.tasks.list.useQuery()
  const { data: completedTasks = [] } = trpc.tasks.completed.useQuery()
  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => { utils.tasks.list.invalidate(); utils.tasks.completed.invalidate() },
  })
  const deleteTask = trpc.tasks.delete.useMutation({
    onSuccess: () => { utils.tasks.list.invalidate(); utils.tasks.completed.invalidate() },
  })

  const [showCompleted, setShowCompleted] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  const openCreateDialog = useCallback(() => {
    setEditingTask(null)
    setDialogOpen(true)
  }, [])

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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2.5">
          <CheckSquare size={16} className="text-muted-foreground" />
          <h1 className="text-[13px] font-medium text-foreground">Aufgaben</h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {activeTasks.length}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-6">
          <div className="mb-4">
            <div
              onClick={openCreateDialog}
              className="flex cursor-text items-center gap-2.5 rounded-lg border border-border px-3.5 py-2.5 shadow-sm transition-colors hover:border-ring/40"
            >
              <Plus size={15} className="shrink-0 text-muted-foreground/40" />
              <span className="text-[13px] text-muted-foreground/50">
                Neue Aufgabe... (z.B. &apos;Markus anrufen morgen um 15:00&apos;)
              </span>
            </div>
          </div>

          {isLoading ? (
            <div className="py-20 text-center">
              <p className="text-[13px] text-muted-foreground/50">Laden...</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-border/60">
                {activeTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task as Task}
                    onStatusChange={() => toggleDone(task as Task)}
                    onEdit={() => openEditDialog(task as Task)}
                    onDelete={() => deleteTask.mutate({ id: task.id })}
                  />
                ))}
              </div>

              {activeTasks.length === 0 && (
                <div className="py-20 text-center">
                  <p className="text-[13px] text-muted-foreground/50">Keine Aufgaben</p>
                </div>
              )}

              {completedTasks.length > 0 && (
                <div className="mt-8">
                  <button
                    onClick={() => setShowCompleted(!showCompleted)}
                    className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground/60 transition-colors hover:text-muted-foreground"
                  >
                    <ChevronDown
                      size={12}
                      className={cn('transition-transform', !showCompleted && '-rotate-90')}
                    />
                    Erledigt · {completedTasks.length}
                  </button>
                  {showCompleted && (
                    <div className="divide-y divide-border/60">
                      {completedTasks.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task as Task}
                          onStatusChange={() => toggleDone(task as Task)}
                          onEdit={() => openEditDialog(task as Task)}
                          onDelete={() => deleteTask.mutate({ id: task.id })}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
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
