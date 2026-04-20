'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { trpc } from '@/lib/trpc/provider'
import { parseTaskInput, formatRelativeDate } from '@/lib/task-parser'
import type { Task, TaskStatus, TaskPriority } from '@/store/task-store'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Calendar, Hourglass } from 'lucide-react'
import { RecordSelector, type SelectedRecord } from '@/components/common/record-selector'

function toDateVal(d: Date | null): string {
  if (!d) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toTimeVal(d: Date | null): string {
  if (!d) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function timeToMinutes(t: string): number | null {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return null
  return h * 60 + m
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatDurationMin(mins: number): string {
  if (mins <= 0) return ''
  if (mins < 60) return `${mins}`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}` : `${h}h`
}

function parseDurationText(text: string): number | null {
  if (!text.trim()) return null
  const hm = text.match(/(\d+)\s*h\s*(?:(\d+)\s*m(?:in)?)?/i)
  if (hm) return parseInt(hm[1]) * 60 + (hm[2] ? parseInt(hm[2]) : 0)
  const colon = text.match(/^(\d+):(\d{1,2})$/)
  if (colon) return parseInt(colon[1]) * 60 + parseInt(colon[2])
  const minOnly = text.match(/^(\d+)\s*m(?:in)?$/i)
  if (minOnly) return parseInt(minOnly[1])
  const num = parseInt(text)
  if (!isNaN(num) && num > 0) return num
  return null
}

function buildDatetime(dateStr: string, timeStr: string): string | undefined {
  if (!dateStr) return undefined
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr ? timeStr.split(':').map(Number) : [0, 0]
  return new Date(y, m - 1, d, hh, mm).toISOString()
}

interface TaskFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task?: Task | null
  initialRecord?: SelectedRecord | null
}

export function TaskFormDialog({ open, onOpenChange, task, initialRecord }: TaskFormDialogProps) {
  const utils = trpc.useUtils()
  const createTask = trpc.tasks.create.useMutation({
    onSuccess: (task) => {
      utils.tasks.list.invalidate()
      utils.tasks.completed.invalidate()
      if (task.contact_id) void utils.contacts.getTasks.invalidate({ contactId: task.contact_id })
    },
  })
  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: (task) => {
      utils.tasks.list.invalidate()
      utils.tasks.completed.invalidate()
      if (task.contact_id) void utils.contacts.getTasks.invalidate({ contactId: task.contact_id })
    },
  })

  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formDate, setFormDate] = useState('')
  const [formTime, setFormTime] = useState('')
  const [formEndTime, setFormEndTime] = useState('')
  const [formDurationMin, setFormDurationMin] = useState<number | null>(null)
  const [formDurationText, setFormDurationText] = useState('')
  const [formPriority, setFormPriority] = useState<TaskPriority>('none')
  const [formStatus, setFormStatus] = useState<TaskStatus>('todo')
  const [formRecord, setFormRecord] = useState<SelectedRecord | null>(null)
  const [initialized, setInitialized] = useState(false)

  const { data: linkedContact } = trpc.contacts.getById.useQuery(
    { id: task?.contact_id ?? '' },
    { enabled: open && !!task?.contact_id, refetchOnWindowFocus: false },
  )
  const { data: linkedCompany } = trpc.companies.getById.useQuery(
    { id: task?.company_id ?? '' },
    { enabled: open && !!task?.company_id, refetchOnWindowFocus: false },
  )

  const isEdit = !!task

  if (open && !initialized) {
    if (task) {
      const due = task.due_at ? new Date(task.due_at) : null
      const end = task.end_at ? new Date(task.end_at) : null
      setFormTitle(task.title)
      setFormDescription(task.description ?? '')
      setFormDate(toDateVal(due))
      setFormTime(toTimeVal(due))
      setFormEndTime(toTimeVal(end))
      if (due && end) {
        const d = Math.round((end.getTime() - due.getTime()) / 60000)
        if (d > 0) {
          setFormDurationMin(d)
          setFormDurationText(formatDurationMin(d))
        } else {
          setFormDurationMin(null)
          setFormDurationText('')
        }
      } else {
        setFormDurationMin(null)
        setFormDurationText('')
      }
      setFormPriority((task.priority ?? 'none') as TaskPriority)
      setFormStatus((task.status ?? 'todo') as TaskStatus)
      // restore linked record when editing
      if (task.contact_id) {
        const label = [task.contact?.first_name, task.contact?.last_name]
          .filter(Boolean)
          .join(' ')
        setFormRecord({
          id: task.contact_id,
          type: 'contact',
          label: label || 'Kontakt',
        })
      } else if (task.company_id) {
        setFormRecord({
          id: task.company_id,
          type: 'company',
          label: task.company?.name || 'Unternehmen',
        })
      } else {
        setFormRecord(null)
      }
    } else {
      setFormTitle('')
      setFormDescription('')
      setFormDate('')
      setFormTime('')
      setFormEndTime('')
      setFormDurationMin(null)
      setFormDurationText('')
      setFormPriority('none')
      setFormStatus('todo')
      setFormRecord(initialRecord ?? null)
    }
    setInitialized(true)
  }

  if (!open && initialized) {
    setInitialized(false)
  }

  useEffect(() => {
    if (!open || !task) return

    if (task.contact_id && linkedContact) {
      const label = [linkedContact.first_name, linkedContact.last_name]
        .filter(Boolean)
        .join(' ')
      if (label) {
        setFormRecord((prev) => {
          if (prev?.id === task.contact_id && prev.type === 'contact' && prev.label === label) {
            return prev
          }
          return { id: task.contact_id as string, type: 'contact', label }
        })
      }
    } else if (task.company_id && linkedCompany?.name) {
      setFormRecord((prev) => {
        if (
          prev?.id === task.company_id &&
          prev.type === 'company' &&
          prev.label === linkedCompany.name
        ) {
          return prev
        }
        return {
          id: task.company_id as string,
          type: 'company',
          label: linkedCompany.name,
        }
      })
    }
  }, [open, task, linkedContact, linkedCompany])

  const parsedPreview = useMemo(() => {
    if (isEdit || !formTitle.trim()) return null
    const p = parseTaskInput(formTitle)
    if (p.due_at && p.title !== formTitle) return p
    return null
  }, [formTitle, isEdit])

  const applyParsing = useCallback(() => {
    if (isEdit) return
    const parsed = parseTaskInput(formTitle)
    if (parsed.due_at && parsed.title !== formTitle) {
      setFormTitle(parsed.title)
      setFormDate(toDateVal(parsed.due_at))
      setFormTime(toTimeVal(parsed.due_at))
      if (parsed.end_at) {
        setFormEndTime(toTimeVal(parsed.end_at))
        const d = Math.round((parsed.end_at.getTime() - parsed.due_at.getTime()) / 60000)
        if (d > 0) {
          setFormDurationMin(d)
          setFormDurationText(formatDurationMin(d))
        }
      }
    }
  }, [formTitle, isEdit])

  const handleTimeChange = useCallback((newTime: string) => {
    setFormTime(newTime)
    if (formDurationMin && formDurationMin > 0 && newTime) {
      const startMins = timeToMinutes(newTime)
      if (startMins !== null) {
        setFormEndTime(minutesToTime(startMins + formDurationMin))
      }
    }
  }, [formDurationMin])

  const handleEndTimeChange = useCallback((newEndTime: string) => {
    setFormEndTime(newEndTime)
    if (formTime && newEndTime) {
      const startMins = timeToMinutes(formTime)
      const endMins = timeToMinutes(newEndTime)
      if (startMins !== null && endMins !== null) {
        const d = endMins - startMins
        if (d > 0) {
          setFormDurationMin(d)
          setFormDurationText(formatDurationMin(d))
        }
      }
    }
  }, [formTime])

  const handleDurationBlur = useCallback(() => {
    const mins = parseDurationText(formDurationText)
    setFormDurationMin(mins)
    if (mins && mins > 0) {
      setFormDurationText(formatDurationMin(mins))
      if (formTime) {
        const startMins = timeToMinutes(formTime)
        if (startMins !== null) {
          setFormEndTime(minutesToTime(startMins + mins))
        }
      }
    }
  }, [formDurationText, formTime])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (!formTitle.trim()) return

    const due_at = buildDatetime(formDate, formTime)
    let end_at: string | undefined
    if (formDate && formEndTime) {
      end_at = buildDatetime(formDate, formEndTime)
    }

    const contact_id = formRecord?.type === 'contact' ? formRecord.id : null
    const company_id = formRecord?.type === 'company' ? formRecord.id : null

    if (task) {
      updateTask.mutate({
        id: task.id,
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        due_at: due_at ?? null,
        end_at: end_at ?? null,
        priority: formPriority,
        status: formStatus,
        completed_at: formStatus === 'done' ? new Date().toISOString() : undefined,
        contact_id,
        company_id,
      })
    } else {
      createTask.mutate({
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        due_at,
        end_at,
        priority: formPriority,
        status: formStatus,
        contact_id,
        company_id,
      })
    }
    onOpenChange(false)
  }, [formTitle, formDescription, formDate, formTime, formEndTime, formPriority, formStatus, task, createTask, updateTask, onOpenChange])

  const submitting = createTask.isPending || updateTask.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Bearbeite die Aufgabe und speichere die Änderungen.'
              : 'Gib einen Titel ein — Datum und Uhrzeit werden erkannt. Drücke Enter, um sie in die Felder zu übernehmen.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="task-title">
              {isEdit ? 'Titel' : 'Aufgabe'}
            </Label>
            <Input
              id="task-title"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isEdit) {
                  e.preventDefault()
                  applyParsing()
                }
              }}
              placeholder="z.B. Markus anrufen morgen um 15:00 Uhr"
              required
              autoFocus
            />
            {parsedPreview && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-0.5 text-[11px] text-orange-600">
                  <Calendar size={10} />
                  {formatRelativeDate(parsedPreview.due_at!)}
                  {parsedPreview.due_at!.getHours() !== 0 || parsedPreview.due_at!.getMinutes() !== 0
                    ? ` ${toTimeVal(parsedPreview.due_at)}`
                    : ''}
                  {parsedPreview.end_at ? ` – ${toTimeVal(parsedPreview.end_at)}` : ''}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  ↵ Enter zum Übernehmen
                </span>
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="task-desc">Beschreibung</Label>
            <textarea
              id="task-desc"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Optionale Details..."
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <div className="grid gap-2">
            <Label>Verknüpft mit</Label>
            <RecordSelector
              value={formRecord}
              onChange={setFormRecord}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="task-date">Datum</Label>
              <Input
                id="task-date"
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="task-time">Uhrzeit</Label>
              <Input
                id="task-time"
                type="time"
                value={formTime}
                onChange={(e) => handleTimeChange(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="task-endtime">Endzeit</Label>
              <Input
                id="task-endtime"
                type="time"
                value={formEndTime}
                onChange={(e) => handleEndTimeChange(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="task-duration">Dauer</Label>
              <Input
                id="task-duration"
                type="text"
                value={formDurationText}
                onChange={(e) => setFormDurationText(e.target.value)}
                onBlur={handleDurationBlur}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleDurationBlur() } }}
                placeholder="z.B. 1h, 30min, 1:30"
              />
            </div>
            {formDurationMin && formDurationMin > 0 && (
              <div className="flex items-end pb-2">
                <span className="flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-[12px] text-blue-600">
                  <Hourglass size={12} />
                  {formatDurationMin(formDurationMin)}
                </span>
              </div>
            )}
          </div>

          {formDate && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
              <Calendar size={14} className="text-orange-500" />
              <span className="text-[13px] text-foreground">
                {(() => {
                  const [y, m, d] = formDate.split('-').map(Number)
                  return formatRelativeDate(new Date(y, m - 1, d))
                })()}
                {formTime && ` um ${formTime}`}
                {formEndTime && ` – ${formEndTime}`}
                {formDurationMin && formDurationMin > 0 && ` (${formatDurationMin(formDurationMin)})`}
              </span>
            </div>
          )}

          <DialogFooter className="mt-2 flex-row gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={submitting || !formTitle.trim()}>
              {submitting ? 'Wird gespeichert…' : isEdit ? 'Speichern' : 'Erstellen'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
