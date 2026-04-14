'use client'

import { cn } from '@/lib/utils'
import { formatRelativeDate, formatTime, formatDuration, isOverdue } from '@/lib/task-parser'
import type { Task, TaskStatus, TaskPriority } from '@/store/task-store'
import { Calendar, Check, Circle, Clock, Timer, Trash2, User, X } from 'lucide-react'

const STATUS_CONFIG: Record<TaskStatus, { icon: typeof Circle; color: string }> = {
  todo: { icon: Circle, color: 'text-muted-foreground/50' },
  in_progress: { icon: Clock, color: 'text-blue-500' },
  done: { icon: Check, color: 'text-green-500' },
  cancelled: { icon: X, color: 'text-muted-foreground/30' },
}

const PRIORITY_CONFIG: Record<TaskPriority, { color: string; label: string; dot: string }> = {
  none: { color: '', label: 'Keine', dot: '' },
  low: { color: 'text-blue-600', label: 'Niedrig', dot: 'bg-blue-500' },
  medium: { color: 'text-amber-600', label: 'Mittel', dot: 'bg-amber-500' },
  high: { color: 'text-orange-600', label: 'Hoch', dot: 'bg-orange-500' },
  urgent: { color: 'text-red-600', label: 'Dringend', dot: 'bg-red-500' },
}

export function TaskRow({
  task,
  onStatusChange,
  onEdit,
  onDelete,
  compact = false,
}: {
  task: Task
  onStatusChange: () => void
  onEdit: () => void
  onDelete?: () => void
  compact?: boolean
}) {
  const status = (task.status ?? 'todo') as TaskStatus
  const priority = (task.priority ?? 'none') as TaskPriority
  const isDone = status === 'done' || status === 'cancelled'
  const sc = STATUS_CONFIG[status]
  const StatusIcon = sc.icon
  const pc = PRIORITY_CONFIG[priority]

  const dueDate = task.due_at ? new Date(task.due_at) : null
  const endDate = task.end_at ? new Date(task.end_at) : null
  const overdue = dueDate && !isDone && isOverdue(dueDate)
  const hasStartTime = !!dueDate && (dueDate.getHours() !== 0 || dueDate.getMinutes() !== 0)
  const contactName = [task.contact?.first_name, task.contact?.last_name]
    .filter(Boolean)
    .join(' ')
  const linkedLabel = contactName || task.company?.name || null

  return (
    <div className={cn('group flex items-center gap-3 transition-colors', compact ? 'py-2' : 'py-2.5')}>
      <button onClick={onStatusChange} className={cn('shrink-0 transition-colors', sc.color)}>
        <StatusIcon size={compact ? 15 : 16} strokeWidth={status === 'done' ? 2.5 : 1.75} />
      </button>

      <span
        onClick={onEdit}
        className={cn(
          'flex-1 cursor-pointer text-[13px] transition-colors hover:text-foreground/80',
          isDone ? 'text-muted-foreground/40 line-through' : 'text-foreground',
        )}
      >
        {task.title}
      </span>

      <div className="relative flex items-center gap-1.5">
        {linkedLabel && (
          <span className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
            <User size={10} />
            <span className="max-w-[120px] truncate">{linkedLabel}</span>
          </span>
        )}

        {!compact && priority !== 'none' && (
          <span className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
            <span className={cn('size-1.5 rounded-full', pc.dot)} />
            <span className={cn('text-[11px] font-medium', pc.color)}>{pc.label}</span>
          </span>
        )}

        {dueDate && (
          <span
            className={cn(
              'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]',
              overdue
                ? 'border-red-200 bg-red-50 text-red-600'
                : 'border-border text-muted-foreground',
            )}
          >
            {!compact && <Calendar size={10} />}
            {compact
              ? (dueDate.getHours() !== 0 || dueDate.getMinutes() !== 0)
                ? `${formatTime(dueDate)}${endDate ? ` – ${formatTime(endDate)}` : ''}`
                : formatRelativeDate(dueDate)
              : (
                <>
                  {formatRelativeDate(dueDate)}
                  {(dueDate.getHours() !== 0 || dueDate.getMinutes() !== 0) && ` ${formatTime(dueDate)}`}
                  {endDate && ` – ${formatTime(endDate)}`}
                </>
              )}
          </span>
        )}

        {!compact && dueDate && endDate && !hasStartTime && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
            <Timer size={9} />
            {formatDuration(dueDate, endDate)}
          </span>
        )}

        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={onEdit}
            className="rounded p-1 text-muted-foreground/40 hover:text-muted-foreground"
            title="Bearbeiten"
          >
            <Calendar size={12} />
          </button>
          {onDelete && (
            <button onClick={onDelete} className="rounded p-1 text-muted-foreground/40 hover:text-red-500" title="Löschen">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
