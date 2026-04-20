'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  format,
  startOfWeek,
  addDays,
  isSameDay,
  isToday,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  getDaysInMonth,
  startOfMonth,
  isSameMonth,
  getDay,
} from 'date-fns'
import { de } from 'date-fns/locale/de'
import { trpc } from '@/lib/trpc/provider'
import { EventDialog } from './event-dialog'
import { RecurringEditDialog } from './recurring-edit-dialog'
import { TaskFormDialog } from '@/components/tasks/task-form-dialog'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, RefreshCw, Plus, CheckSquare2, Settings } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { Task } from '@/store/task-store'

// ─── Konstanten ───────────────────────────────────────────────────
const HOUR_HEIGHT = 56 // px pro Stunde
const SNAP_MINS = 15  // Einrastung auf 15-Minuten-Raster
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const WEEK_DAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const ACCOUNT_COLORS = ['#7bb3f0', '#6fcf97', '#b5a4e8', '#f6a8c0', '#f6c89a', '#7dd4c8']
const ACCOUNT_TEXT_DARK = true  // Pastelfarben → dunkler Text besser lesbar
const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444', high: '#f97316', medium: '#3b82f6', low: '#22c55e', none: '#6366f1',
}

type ViewType = 'week' | 'day' | 'month'

// ─── Drag-State (Modul-Level-Ref, kein Re-Render) ─────────────────
let DRAG: {
  type: 'event' | 'task'
  id: string
  durationMins: number
  offsetMins: number  // Griff-Offset: wie viele Minuten vom Anfang des Items
} | null = null

// ─── Typen ────────────────────────────────────────────────────────
type CalendarEventRow = {
  id: string
  title: string
  description: string | null
  location: string | null
  start_at: string | Date
  end_at: string | Date
  is_all_day: boolean
  attendees: unknown
  recurrence_rule: string | null
  recurring_event_id: string | null
  account: { id: string; provider: string; email: string; display_name: string | null }
}

type TaskRow = {
  id: string
  title: string
  description: string | null
  due_at: string | Date | null
  end_at: string | Date | null
  status: string | null
  priority: string | null
  completed_at: string | Date | null
  contact_id: string | null
  company_id: string | null
  position: number | null
  created_at: string | Date
  updated_at: string | Date
  contact?: { id: string; first_name: string; last_name: string | null } | null
  company?: { id: string; name: string } | null
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────

function getWeekDays(date: Date): Date[] {
  const start = startOfWeek(date, { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

function getEventPosition(start: Date, end: Date): { top: number; height: number } {
  const startMins = start.getHours() * 60 + start.getMinutes()
  const endMins = end.getHours() * 60 + end.getMinutes()
  const top = (startMins / 60) * HOUR_HEIGHT
  const height = Math.max(((Math.max(endMins, startMins + 30) - startMins) / 60) * HOUR_HEIGHT, 20)
  return { top, height }
}

function snapMins(totalMins: number): number {
  return Math.round(totalMins / SNAP_MINS) * SNAP_MINS
}

/** Y-Position (px) aus dem Maus-Event relativ zur Spalten-Oberkante (00:00) */
function yFromDragEvent(e: React.DragEvent<HTMLDivElement>): number {
  const rect = e.currentTarget.getBoundingClientRect()
  return Math.max(0, e.clientY - rect.top)
}

type EventWithLayout = CalendarEventRow & { col: number; totalCols: number }

function assignColumns(events: CalendarEventRow[]): EventWithLayout[] {
  if (events.length === 0) return []

  const sorted = [...events].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
  )

  // Jedem Event eine Spalte zuweisen (erste freie Spalte)
  const colEnds: number[] = [] // colEnds[i] = Endzeit des letzten Events in Spalte i
  const withCol: (CalendarEventRow & { col: number })[] = []

  for (const ev of sorted) {
    const start = new Date(ev.start_at).getTime()
    const end = new Date(ev.end_at).getTime()
    let col = colEnds.findIndex((endTime) => endTime <= start)
    if (col === -1) { col = colEnds.length; colEnds.push(end) }
    else colEnds[col] = end
    withCol.push({ ...ev, col })
  }

  // totalCols: maximale Spaltenanzahl aller gleichzeitig überlappenden Events
  return withCol.map((ev) => {
    const s = new Date(ev.start_at).getTime()
    const e = new Date(ev.end_at).getTime()
    const maxCol = withCol.reduce((m, o) => {
      const os = new Date(o.start_at).getTime()
      const oe = new Date(o.end_at).getTime()
      return s < oe && e > os ? Math.max(m, o.col) : m
    }, 0)
    return { ...ev, totalCols: maxCol + 1 }
  })
}

function taskToStoreTask(t: TaskRow): Task {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: (t.status ?? 'todo') as Task['status'],
    priority: (t.priority ?? 'none') as Task['priority'],
    due_at: t.due_at ? new Date(t.due_at) : null,
    end_at: t.end_at ? new Date(t.end_at) : null,
    completed_at: t.completed_at ? new Date(t.completed_at) : null,
    position: t.position ?? 0,
    created_at: new Date(t.created_at),
    updated_at: new Date(t.updated_at),
    contact_id: t.contact_id,
    company_id: t.company_id,
    contact: t.contact ?? null,
    company: t.company ?? null,
  }
}

// ─── DropIndicator ────────────────────────────────────────────────

function DropIndicator({ top, durationMins }: { top: number; durationMins: number }): React.JSX.Element {
  const height = Math.max((durationMins / 60) * HOUR_HEIGHT, 20)
  const hours = Math.floor((top / HOUR_HEIGHT))
  const mins = Math.round(((top / HOUR_HEIGHT) - hours) * 60 / SNAP_MINS) * SNAP_MINS
  const label = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`

  return (
    <div
      className="pointer-events-none absolute inset-x-1 z-30 rounded-md border-2 border-blue-500 bg-blue-100/70"
      style={{ top, height }}
    >
      <span className="absolute -top-4 left-0 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
        {label}
      </span>
    </div>
  )
}

// ─── EventBlock ───────────────────────────────────────────────────

function EventBlock({
  event,
  color,
  colIndex,
  colCount,
  onClick,
  onDragStart,
}: {
  event: EventWithLayout
  color: string
  colIndex: number
  colCount: number
  onClick: (e: React.MouseEvent) => void
  onDragStart: (e: React.DragEvent, type: 'event', id: string, offsetMins: number, durationMins: number) => void
}): React.JSX.Element {
  const start = new Date(event.start_at)
  const end = new Date(event.end_at)
  const { top, height } = getEventPosition(start, end)
  const width = `calc(${100 / colCount}% - 4px)`
  const left = `calc(${(colIndex / colCount) * 100}% + 2px)`
  const durationMins = Math.round((end.getTime() - start.getTime()) / 60000)

  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    const offsetPx = e.clientY - rect.top
    const offsetMins = snapMins(Math.max(0, (offsetPx / HOUR_HEIGHT) * 60))
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', event.id)
    onDragStart(e, 'event', event.id, offsetMins, durationMins)
  }

  const isRecurring = !!(event.recurrence_rule || event.recurring_event_id)

  return (
    <button
      draggable
      onDragStart={handleDragStart}
      onClick={onClick}
      style={{
        top, height, width, left,
        backgroundColor: color + '33',  // 20% Deckkraft Hintergrund
        borderColor: color,
      }}
      className="absolute z-10 cursor-grab rounded-[4px] overflow-hidden border-l-[3px] px-1.5 py-0.5 text-left transition-opacity hover:opacity-80 active:cursor-grabbing select-none"
    >
      <div className="flex items-start justify-between gap-0.5">
        <p className="truncate text-[11px] font-semibold leading-tight" style={{ color }}>
          {event.title}
        </p>
        {isRecurring && (
          <span className="shrink-0 mt-[1px] text-[8px] leading-none opacity-60" style={{ color }}>↻</span>
        )}
      </div>
      {height > 32 && (
        <p className="truncate text-[10px] leading-tight opacity-70" style={{ color }}>
          {format(start, 'HH:mm')}–{format(end, 'HH:mm')}
        </p>
      )}
      {height > 48 && event.location && (
        <p className="truncate text-[10px] leading-tight opacity-50" style={{ color }}>{event.location}</p>
      )}
    </button>
  )
}

// ─── TaskChip ─────────────────────────────────────────────────────

function TaskChip({
  task,
  onClick,
  onToggle,
  onDragStart,
}: {
  task: TaskRow
  onClick: () => void
  onToggle: () => void
  onDragStart: (e: React.DragEvent, type: 'task', id: string, offsetMins: number, durationMins: number) => void
}): React.JSX.Element {
  const dueAt = task.due_at ? new Date(task.due_at) : null
  if (!dueAt || dueAt.getHours() === 0) return <></>

  const top = (dueAt.getHours() * 60 + dueAt.getMinutes()) / 60 * HOUR_HEIGHT + 2
  const isDone = Boolean(task.completed_at || task.status === 'done')
  const color = isDone ? '#94a3b8' : (PRIORITY_COLORS[task.priority ?? 'none'] ?? '#94a3b8')
  const endAt = task.end_at ? new Date(task.end_at) : new Date(dueAt.getTime() + 30 * 60000)
  const durationMins = Math.round((endAt.getTime() - dueAt.getTime()) / 60000)

  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation()
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', task.id)
    onDragStart(e, 'task', task.id, 0, durationMins)
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      style={{ top }}
      className="absolute left-1 right-1 z-10 flex cursor-grab items-center gap-1 rounded border border-orange-200 bg-orange-50 px-1.5 py-0.5 shadow-sm active:cursor-grabbing select-none"
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggle() }}
        className="shrink-0 flex items-center justify-center rounded-sm border border-orange-300 bg-white hover:bg-orange-100 transition-colors"
        style={{ width: 12, height: 12 }}
        title={isDone ? 'Als offen markieren' : 'Als erledigt markieren'}
      >
        {isDone && (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1.5 4L3 5.5L6.5 2" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <span
        onClick={(e) => { e.stopPropagation(); onClick() }}
        className={cn('truncate text-[10px] font-medium text-orange-700 cursor-pointer', isDone && 'line-through opacity-50')}
      >
        {task.title}
      </span>
    </div>
  )
}

// ─── DayColumn ────────────────────────────────────────────────────

function DayColumn({
  date,
  events,
  tasks,
  accountColorMap,
  dropIndicator,
  onSelectEvent,
  onSelectTask,
  onToggleTask,
  onSelectSlot,
  onDragStart,
  onDragOver,
  onDrop,
  onDragLeave,
}: {
  date: Date
  events: CalendarEventRow[]
  tasks: TaskRow[]
  accountColorMap: Map<string, string>
  dropIndicator: { top: number; durationMins: number } | null
  onSelectEvent: (ev: CalendarEventRow) => void
  onSelectTask: (task: TaskRow) => void
  onToggleTask: (task: TaskRow) => void
  onSelectSlot: (start: Date, end: Date) => void
  onDragStart: (e: React.DragEvent, type: 'event' | 'task', id: string, offsetMins: number, durationMins: number) => void
  onDragOver: (e: React.DragEvent<HTMLDivElement>, date: Date) => void
  onDrop: (e: React.DragEvent<HTMLDivElement>, date: Date) => void
  onDragLeave: () => void
}): React.JSX.Element {
  const dayEvents = events.filter(
    (ev) => !ev.is_all_day && isSameDay(new Date(ev.start_at), date),
  )
  const dayTasks = tasks.filter((t) => t.due_at && isSameDay(new Date(t.due_at), date))
  const layoutEvents = assignColumns(dayEvents)

  // Aktuelle Zeit
  const now = new Date()
  const currentTop = (now.getHours() * 60 + now.getMinutes()) / 60 * HOUR_HEIGHT

  const handleColumnClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if ((e.target as HTMLElement).closest('button')) return
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const totalMins = snapMins(Math.max(0, (y / HOUR_HEIGHT) * 60))
    const start = new Date(date)
    start.setHours(Math.floor(totalMins / 60), totalMins % 60, 0, 0)
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    onSelectSlot(start, end)
  }

  return (
    <div
      className={cn(
        'relative flex-1 border-l border-border/50 cursor-pointer',
        isToday(date) && 'bg-blue-50/30',
      )}
      style={{ height: HOUR_HEIGHT * 24 }}
      onClick={handleColumnClick}
      onDragOver={(e) => { e.preventDefault(); onDragOver(e, date) }}
      onDrop={(e) => onDrop(e, date)}
      onDragLeave={onDragLeave}
    >
      {/* Stunden-Linien */}
      {HOURS.map((h) => (
        <div
          key={h}
          className={cn(
            'absolute inset-x-0 border-t',
            h % 2 === 0 ? 'border-border/40' : 'border-border/20',
          )}
          style={{ top: h * HOUR_HEIGHT }}
        />
      ))}

      {/* Aktuelle Zeit */}
      {isToday(date) && (
        <div
          className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
          style={{ top: currentTop }}
        >
          <div className="h-2 w-2 shrink-0 rounded-full bg-red-500 -ml-1" />
          <div className="flex-1 border-t-[1.5px] border-red-500" />
        </div>
      )}

      {/* Drop-Indikator */}
      {dropIndicator && <DropIndicator top={dropIndicator.top} durationMins={dropIndicator.durationMins} />}

      {/* Termine */}
      {layoutEvents.map((ev) => (
        <EventBlock
          key={ev.id}
          event={ev}
          color={accountColorMap.get(ev.account.id) ?? '#6366f1'}
          colIndex={ev.col}
          colCount={ev.totalCols}
          onClick={(e) => { e.stopPropagation(); onSelectEvent(ev) }}
          onDragStart={onDragStart}
        />
      ))}

      {/* Aufgaben */}
      {dayTasks.map((task) => (
        <TaskChip
          key={task.id}
          task={task}
          onClick={() => onSelectTask(task)}
          onToggle={() => onToggleTask(task)}
          onDragStart={onDragStart}
        />
      ))}
    </div>
  )
}

// ─── WeekView ─────────────────────────────────────────────────────

function WeekView({
  currentDate,
  events,
  tasks,
  accountColorMap,
  dropState,
  onSelectEvent,
  onSelectTask,
  onToggleTask,
  onSelectSlot,
  onDragStart,
  onDragOver,
  onDrop,
  onDragLeave,
}: {
  currentDate: Date
  events: CalendarEventRow[]
  tasks: TaskRow[]
  accountColorMap: Map<string, string>
  dropState: { date: Date; top: number; durationMins: number } | null
  onSelectEvent: (ev: CalendarEventRow) => void
  onSelectTask: (task: TaskRow) => void
  onToggleTask: (task: TaskRow) => void
  onSelectSlot: (start: Date, end: Date) => void
  onDragStart: (e: React.DragEvent, type: 'event' | 'task', id: string, offsetMins: number, durationMins: number) => void
  onDragOver: (e: React.DragEvent<HTMLDivElement>, date: Date) => void
  onDrop: (e: React.DragEvent<HTMLDivElement>, date: Date) => void
  onDragLeave: () => void
}): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const days = getWeekDays(currentDate)

  useEffect(() => {
    if (scrollRef.current) {
      const h = isToday(currentDate) ? Math.max(new Date().getHours() - 1, 0) : 7
      scrollRef.current.scrollTop = h * HOUR_HEIGHT
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const allDayItems = events.filter((ev) => ev.is_all_day)
  const allDayTasks = tasks.filter((t) => {
    if (!t.due_at) return false
    const d = new Date(t.due_at)
    return d.getHours() === 0 && d.getMinutes() === 0
  })
  const hasAllDay = allDayItems.length > 0 || allDayTasks.length > 0

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Tages-Header */}
      <div className="flex shrink-0 border-b border-border/50 bg-background">
        <div className="w-12 shrink-0" />
        {days.map((day) => {
          const isT = isToday(day)
          return (
            <div key={day.toISOString()} className="flex flex-1 flex-col items-center py-2 border-l border-border/40 first:border-l-0">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {format(day, 'EEE', { locale: de })}
              </span>
              <div
                className={cn(
                  'mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold transition-colors',
                  isT ? 'bg-blue-600 text-white' : 'text-foreground hover:bg-muted',
                )}
              >
                {format(day, 'd')}
              </div>
            </div>
          )
        })}
      </div>

      {/* Ganztags-Zeile */}
      {hasAllDay && (
        <div className="flex shrink-0 border-b border-border/50">
          <div className="w-12 shrink-0 flex items-center justify-end pr-2 text-[9px] font-medium uppercase text-muted-foreground py-1">
            ganztag
          </div>
          {days.map((day) => {
            const dayAllDay = allDayItems.filter((ev) => isSameDay(new Date(ev.start_at), day))
            const dayT = allDayTasks.filter((t) => t.due_at && isSameDay(new Date(t.due_at), day))
            return (
              <div key={day.toISOString()} className="flex-1 border-l border-border/40 space-y-0.5 px-1 py-0.5 min-h-[20px]">
                {dayAllDay.map((ev) => (
                  <div
                    key={ev.id}
                    onClick={() => onSelectEvent(ev)}
                    style={{ backgroundColor: accountColorMap.get(ev.account.id) ?? '#6366f1' }}
                    className="truncate rounded px-1.5 py-0.5 text-[10px] font-medium text-white cursor-pointer hover:opacity-90"
                  >
                    {ev.title}
                  </div>
                ))}
                {dayT.map((task) => {
                  const isDone = Boolean(task.completed_at || task.status === 'done')
                  return (
                    <div
                      key={task.id}
                      onClick={() => onSelectTask(task)}
                      className="flex cursor-pointer items-center gap-1 truncate rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] hover:bg-slate-50"
                    >
                      <CheckSquare2 size={9} className={isDone ? 'text-slate-400' : 'text-blue-500'} />
                      <span className={cn(isDone && 'line-through text-muted-foreground')}>{task.title}</span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {/* Zeitraster */}
      <div ref={scrollRef} className="flex flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {/* Stunden-Spalte */}
        <div className="relative w-12 shrink-0 bg-background" style={{ height: HOUR_HEIGHT * 24 }}>
          {HOURS.map((h) => (
            <div
              key={h}
              className="absolute right-2 select-none text-[10px] text-muted-foreground"
              style={{ top: h * HOUR_HEIGHT - 7 }}
            >
              {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
            </div>
          ))}
        </div>

        {/* Tag-Spalten */}
        <div className="flex flex-1">
          {days.map((day) => (
            <DayColumn
              key={day.toISOString()}
              date={day}
              events={events}
              tasks={tasks}
              accountColorMap={accountColorMap}
              dropIndicator={dropState && isSameDay(dropState.date, day) ? { top: dropState.top, durationMins: dropState.durationMins } : null}
              onSelectEvent={onSelectEvent}
              onSelectTask={onSelectTask}
              onToggleTask={onToggleTask}
              onSelectSlot={onSelectSlot}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragLeave={onDragLeave}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── DayView ──────────────────────────────────────────────────────

function DayView({
  currentDate,
  events,
  tasks,
  accountColorMap,
  dropState,
  onSelectEvent,
  onSelectTask,
  onToggleTask,
  onSelectSlot,
  onDragStart,
  onDragOver,
  onDrop,
  onDragLeave,
}: {
  currentDate: Date
  events: CalendarEventRow[]
  tasks: TaskRow[]
  accountColorMap: Map<string, string>
  dropState: { date: Date; top: number; durationMins: number } | null
  onSelectEvent: (ev: CalendarEventRow) => void
  onSelectTask: (task: TaskRow) => void
  onToggleTask: (task: TaskRow) => void
  onSelectSlot: (start: Date, end: Date) => void
  onDragStart: (e: React.DragEvent, type: 'event' | 'task', id: string, offsetMins: number, durationMins: number) => void
  onDragOver: (e: React.DragEvent<HTMLDivElement>, date: Date) => void
  onDrop: (e: React.DragEvent<HTMLDivElement>, date: Date) => void
  onDragLeave: () => void
}): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const isT = isToday(currentDate)

  useEffect(() => {
    if (scrollRef.current) {
      const h = isT ? Math.max(new Date().getHours() - 1, 0) : 7
      scrollRef.current.scrollTop = h * HOUR_HEIGHT
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 border-b border-border/50 bg-background">
        <div className="w-12 shrink-0" />
        <div className="flex flex-1 flex-col items-center py-2 border-l border-border/40">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {format(currentDate, 'EEEE', { locale: de })}
          </span>
          <div className={cn(
            'mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold',
            isT ? 'bg-blue-600 text-white' : 'text-foreground',
          )}>
            {format(currentDate, 'd')}
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <div className="relative w-12 shrink-0 bg-background" style={{ height: HOUR_HEIGHT * 24 }}>
          {HOURS.map((h) => (
            <div key={h} className="absolute right-2 select-none text-[10px] text-muted-foreground" style={{ top: h * HOUR_HEIGHT - 7 }}>
              {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
            </div>
          ))}
        </div>
        <div className="flex flex-1">
          <DayColumn
            date={currentDate}
            events={events}
            tasks={tasks}
            accountColorMap={accountColorMap}
            dropIndicator={dropState && isSameDay(dropState.date, currentDate) ? { top: dropState.top, durationMins: dropState.durationMins } : null}
            onSelectEvent={onSelectEvent}
            onSelectTask={onSelectTask}
            onToggleTask={onToggleTask}
            onSelectSlot={onSelectSlot}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragLeave={onDragLeave}
          />
        </div>
      </div>
    </div>
  )
}

// ─── MonthView ────────────────────────────────────────────────────

function MonthView({
  currentDate,
  events,
  tasks,
  accountColorMap,
  onSelectEvent,
  onSelectTask,
  onSelectSlot,
}: {
  currentDate: Date
  events: CalendarEventRow[]
  tasks: TaskRow[]
  accountColorMap: Map<string, string>
  onSelectEvent: (ev: CalendarEventRow) => void
  onSelectTask: (task: TaskRow) => void
  onSelectSlot: (start: Date, end: Date) => void
}): React.JSX.Element {
  const monthStart = startOfMonth(currentDate)
  const daysInMonth = getDaysInMonth(currentDate)
  const firstDayOfWeek = (getDay(monthStart) + 6) % 7

  const allDays: (Date | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => addDays(monthStart, i)),
  ]
  while (allDays.length % 7 !== 0) allDays.push(null)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="grid shrink-0 grid-cols-7 border-b border-border/50 bg-background">
        {WEEK_DAY_LABELS.map((d) => (
          <div key={d} className="py-2 text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground border-l border-border/40 first:border-l-0">
            {d}
          </div>
        ))}
      </div>

      <div className="flex-1 grid grid-cols-7 overflow-y-auto">
        {allDays.map((day, idx) => {
          if (!day) return <div key={`e-${idx}`} className="border-r border-b border-border/20 bg-slate-50/40" />
          const isT = isToday(day)
          const inMonth = isSameMonth(day, currentDate)
          const dayEvents = events.filter((ev) => isSameDay(new Date(ev.start_at), day))
          const dayTasks = tasks.filter((t) => t.due_at && isSameDay(new Date(t.due_at), day))
          const total = dayEvents.length + dayTasks.length

          return (
            <div
              key={day.toISOString()}
              onClick={() => {
                const s = new Date(day)
                s.setHours(9, 0, 0, 0)
                const e = new Date(day)
                e.setHours(10, 0, 0, 0)
                onSelectSlot(s, e)
              }}
              className={cn(
                'border-r border-b border-border/20 p-1.5 cursor-pointer transition-colors hover:bg-muted/20 min-h-[90px]',
                isT && 'bg-blue-50/40',
              )}
            >
              <div className="mb-1">
                <span className={cn(
                  'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                  isT ? 'bg-blue-600 text-white' : inMonth ? 'text-foreground' : 'text-muted-foreground',
                )}>
                  {format(day, 'd')}
                </span>
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((ev) => (
                  <div
                    key={ev.id}
                    onClick={(e) => { e.stopPropagation(); onSelectEvent(ev) }}
                    style={{ backgroundColor: accountColorMap.get(ev.account.id) ?? '#6366f1' }}
                    className="truncate rounded px-1.5 py-0.5 text-[10px] font-medium text-white cursor-pointer hover:opacity-90"
                  >
                    {!ev.is_all_day && <span className="opacity-80">{format(new Date(ev.start_at), 'HH:mm')} </span>}
                    {ev.title}
                  </div>
                ))}
                {dayTasks.slice(0, 2).map((task) => {
                  const isDone = Boolean(task.completed_at || task.status === 'done')
                  const color = PRIORITY_COLORS[task.priority ?? 'none'] ?? '#6366f1'
                  return (
                    <div
                      key={task.id}
                      onClick={(e) => { e.stopPropagation(); onSelectTask(task) }}
                      className="flex cursor-pointer items-center gap-0.5 truncate rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] hover:bg-slate-50"
                    >
                      <CheckSquare2 size={9} style={{ color }} />
                      <span className={cn(isDone && 'line-through text-muted-foreground')}>{task.title}</span>
                    </div>
                  )
                })}
                {total > 5 && (
                  <div className="pl-1 text-[10px] text-muted-foreground">+{total - 5} weitere</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── CalendarView (Haupt-Komponente) ──────────────────────────────

export function CalendarView(): React.JSX.Element {
  const [view, setView] = useState<ViewType>('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [eventDialogOpen, setEventDialogOpen] = useState(false)
  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventRow | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [defaultStart, setDefaultStart] = useState<Date | undefined>(undefined)
  const [defaultEnd, setDefaultEnd] = useState<Date | undefined>(undefined)

  // Drop-Indikator: sichtbare Vorschau während Drag
  const [dropState, setDropState] = useState<{ date: Date; top: number; durationMins: number } | null>(null)

  // Ausstehender Drop bei Serientermin — wartet auf RecurringEditDialog-Auswahl
  const [pendingDrop, setPendingDrop] = useState<{
    event: CalendarEventRow
    newStart: Date
    newEnd: Date
  } | null>(null)

  // ── Sichtbaren Bereich berechnen ──
  const { startAt, endAt } = useMemo(() => {
    if (view === 'month') {
      return {
        startAt: addDays(startOfMonth(currentDate), -7),
        endAt: addDays(startOfMonth(addMonths(currentDate, 1)), 7),
      }
    }
    if (view === 'day') {
      const s = new Date(currentDate); s.setHours(0, 0, 0, 0)
      const e = new Date(currentDate); e.setHours(23, 59, 59, 999)
      return { startAt: s, endAt: e }
    }
    const ws = startOfWeek(currentDate, { weekStartsOn: 1 })
    return { startAt: addDays(ws, -1), endAt: addDays(ws, 8) }
  }, [currentDate, view])

  const { data: events = [], isFetching } = trpc.calendar.list.useQuery(
    { startAt, endAt },
    { staleTime: 60_000 },
  )
  const { data: rawTasks = [] } = trpc.tasks.list.useQuery(
    { includeCompleted: true },
    { staleTime: 30_000 },
  )

  const visibleTasks = useMemo(
    () => (rawTasks as TaskRow[]).filter((t) => {
      if (!t.due_at) return false
      const d = new Date(t.due_at)
      return d >= startAt && d <= endAt
    }),
    [rawTasks, startAt, endAt],
  )

  const syncMutation = trpc.calendar.syncNow.useMutation()
  const updateCalEvent = trpc.calendar.update.useMutation()
  const updateTask = trpc.tasks.update.useMutation()
  const utils = trpc.useUtils()

  const accountColorMap = useMemo(() => {
    const map = new Map<string, string>()
    let i = 0
    for (const ev of events as CalendarEventRow[]) {
      if (!map.has(ev.account.id)) {
        map.set(ev.account.id, ACCOUNT_COLORS[i % ACCOUNT_COLORS.length])
        i++
      }
    }
    return map
  }, [events])

  // ── Handler ──

  const handleSelectEvent = useCallback((ev: CalendarEventRow) => {
    setSelectedEvent(ev)
    setDefaultStart(undefined)
    setDefaultEnd(undefined)
    setEventDialogOpen(true)
  }, [])

  const handleSelectTask = useCallback((task: TaskRow) => {
    setSelectedTask(taskToStoreTask(task))
    setTaskDialogOpen(true)
  }, [])

  const handleToggleTask = useCallback((task: TaskRow) => {
    const isDone = Boolean(task.completed_at || task.status === 'done')
    updateTask.mutate(
      {
        id: task.id,
        status: isDone ? 'todo' : 'done',
        completed_at: isDone ? null : new Date().toISOString(),
      },
      { onSuccess: () => utils.tasks.list.invalidate() },
    )
  }, [updateTask, utils])

  const handleSelectSlot = useCallback((start: Date, end: Date) => {
    setSelectedEvent(null)
    setDefaultStart(start)
    setDefaultEnd(end)
    setEventDialogOpen(true)
  }, [])

  const navigate = useCallback((dir: 'prev' | 'next' | 'today'): void => {
    if (dir === 'today') { setCurrentDate(new Date()); return }
    const n = dir === 'next' ? 1 : -1
    if (view === 'month') setCurrentDate((d) => addMonths(d, n))
    else if (view === 'week') setCurrentDate((d) => addWeeks(d, n))
    else setCurrentDate((d) => addDays(d, n))
  }, [view])

  // ── Drag & Drop ──

  const handleDragStart = useCallback(
    (_e: React.DragEvent, type: 'event' | 'task', id: string, offsetMins: number, durationMins: number) => {
      DRAG = { type, id, offsetMins, durationMins }
    },
    [],
  )

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, date: Date): void => {
    e.preventDefault()
    if (!DRAG) return
    const y = yFromDragEvent(e)
    const rawMins = (y / HOUR_HEIGHT) * 60
    const startMins = Math.max(0, Math.min(snapMins(rawMins - DRAG.offsetMins), 23 * 60 + 45))
    const top = (startMins / 60) * HOUR_HEIGHT
    setDropState({ date, top, durationMins: DRAG.durationMins })
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, date: Date): void => {
      e.preventDefault()
      setDropState(null)
      if (!DRAG) return

      const y = yFromDragEvent(e)
      const rawMins = (y / HOUR_HEIGHT) * 60
      const startMins = Math.max(0, Math.min(snapMins(rawMins - DRAG.offsetMins), 23 * 60 + 45))
      const newStart = new Date(date)
      newStart.setHours(Math.floor(startMins / 60), startMins % 60, 0, 0)
      const newEnd = new Date(newStart.getTime() + DRAG.durationMins * 60_000)

      if (DRAG.type === 'event') {
        const ev = (events as CalendarEventRow[]).find((x) => x.id === DRAG!.id)
        if (!ev) return
        if (ev.recurrence_rule || ev.recurring_event_id) {
          // Serientermin (Master oder Instanz) → erst Dialog, dann Update
          setPendingDrop({ event: ev, newStart, newEnd })
          DRAG = null
          return
        }
        updateCalEvent.mutate(
          { id: ev.id, patch: { start_at: newStart, end_at: newEnd }, recurringMode: 'THIS' },
          { onSuccess: () => utils.calendar.list.invalidate() },
        )
      } else {
        updateTask.mutate(
          {
            id: DRAG!.id,
            due_at: newStart.toISOString(),
            end_at: newEnd.toISOString(),
          },
          { onSuccess: () => utils.tasks.list.invalidate() },
        )
      }
      DRAG = null
    },
    [events, updateCalEvent, updateTask, utils, handleSelectEvent],
  )

  const handleDragLeave = useCallback((): void => {
    setDropState(null)
  }, [])

  const titleLabel = useMemo(() => {
    if (view === 'month') return format(currentDate, 'MMMM yyyy', { locale: de })
    if (view === 'day') return format(currentDate, 'EEEE, d. MMMM yyyy', { locale: de })
    const ws = startOfWeek(currentDate, { weekStartsOn: 1 })
    const we = addDays(ws, 6)
    return ws.getMonth() === we.getMonth()
      ? `${format(ws, 'd.')}–${format(we, 'd. MMMM yyyy', { locale: de })}`
      : `${format(ws, 'd. MMM', { locale: de })} – ${format(we, 'd. MMM yyyy', { locale: de })}`
  }, [currentDate, view])

  const commonProps = {
    events: events as unknown as CalendarEventRow[],
    tasks: visibleTasks,
    accountColorMap,
    dropState,
    onSelectEvent: handleSelectEvent,
    onSelectTask: handleSelectTask,
    onToggleTask: handleToggleTask,
    onSelectSlot: handleSelectSlot,
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
    onDragLeave: handleDragLeave,
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">

      {/* ── Toolbar ── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-background px-4 py-2.5 shadow-sm">
        <div className="flex items-center">
          <button onClick={() => navigate('prev')} className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => navigate('next')} className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <ChevronRight size={16} />
          </button>
        </div>

        <button
          onClick={() => navigate('today')}
          className="rounded-md border border-border px-3 py-1 text-xs font-medium transition-colors hover:bg-muted"
        >
          Heute
        </button>

        <h2 className="flex-1 text-[15px] font-semibold capitalize text-foreground">{titleLabel}</h2>

        {isFetching && <RefreshCw size={13} className="animate-spin text-muted-foreground" />}

        {/* Ansicht-Umschalter */}
        <div className="flex overflow-hidden rounded-md border border-border text-xs font-medium">
          {(['day', 'week', 'month'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'px-3 py-1.5 transition-colors',
                view === v ? 'bg-foreground text-background' : 'bg-background text-muted-foreground hover:bg-muted',
              )}
            >
              {v === 'day' ? 'Tag' : v === 'week' ? 'Woche' : 'Monat'}
            </button>
          ))}
        </div>

        <button
          onClick={() => syncMutation.mutate({}, { onSuccess: () => utils.calendar.list.invalidate() })}
          disabled={syncMutation.isPending}
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
          title="Jetzt synchronisieren"
        >
          <RefreshCw size={14} className={syncMutation.isPending ? 'animate-spin' : ''} />
        </button>

        <Link
          href="/calendar/settings"
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Kalender-Einstellungen"
        >
          <Settings size={14} />
        </Link>

        <Button
          size="sm"
          onClick={() => {
            const now = new Date()
            const s = new Date(Math.ceil(now.getTime() / (15 * 60_000)) * 15 * 60_000)
            handleSelectSlot(s, new Date(s.getTime() + 3_600_000))
          }}
          className="gap-1.5"
        >
          <Plus size={13} />
          Neuer Termin
        </Button>
      </div>

      {/* ── Kalender-Inhalt ── */}
      {view === 'week' && <WeekView currentDate={currentDate} {...commonProps} />}
      {view === 'day'  && <DayView  currentDate={currentDate} {...commonProps} />}
      {view === 'month' && (
        <MonthView
          currentDate={currentDate}
          events={commonProps.events}
          tasks={commonProps.tasks}
          accountColorMap={commonProps.accountColorMap}
          onSelectEvent={commonProps.onSelectEvent}
          onSelectTask={commonProps.onSelectTask}
          onSelectSlot={commonProps.onSelectSlot}
        />
      )}

      {/* ── Dialoge ── */}
      <EventDialog
        open={eventDialogOpen}
        onOpenChange={setEventDialogOpen}
        event={selectedEvent}
        defaultStart={defaultStart}
        defaultEnd={defaultEnd}
      />

      <TaskFormDialog
        open={taskDialogOpen}
        onOpenChange={(open) => {
          setTaskDialogOpen(open)
          if (!open) {
            setSelectedTask(null)
            utils.tasks.list.invalidate()
          }
        }}
        task={selectedTask}
      />

      {/* Serientermin-Dialog beim Drag & Drop */}
      <RecurringEditDialog
        open={pendingDrop !== null}
        eventTitle={pendingDrop?.event.title ?? ''}
        onCancel={() => setPendingDrop(null)}
        onConfirm={(mode) => {
          if (!pendingDrop) return
          updateCalEvent.mutate(
            {
              id: pendingDrop.event.id,
              patch: { start_at: pendingDrop.newStart, end_at: pendingDrop.newEnd },
              recurringMode: mode,
            },
            { onSuccess: () => { utils.calendar.list.invalidate(); setPendingDrop(null) } },
          )
        }}
      />
    </div>
  )
}
