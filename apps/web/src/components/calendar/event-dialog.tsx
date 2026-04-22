'use client'

import { useState, useEffect } from 'react'
import { trpc } from '@/lib/trpc/provider'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { RecurringEditDialog, type RecurringMode } from './recurring-edit-dialog'
import { MapPin, AlignLeft, Users, Calendar, Clock } from 'lucide-react'

type CalendarEventRow = {
  id: string
  title: string
  description: string | null
  location: string | null
  start_at: Date | string
  end_at: Date | string
  is_all_day: boolean
  attendees: unknown
  recurrence_rule: string | null
  recurring_event_id: string | null
  account: { id: string; provider: string; email: string }
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Wenn gesetzt → Bearbeitungsmodus. Wenn null → Erstellungsmodus. */
  event?: CalendarEventRow | null
  /** Vorausgefüllte Startzeit bei Klick auf leeren Slot */
  defaultStart?: Date
  defaultEnd?: Date
  defaultAccountId?: string
}

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function toTimeInput(d: Date): string {
  return d.toISOString().slice(11, 16)
}
function combineDatetime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00Z`)
}

export function EventDialog({
  open,
  onOpenChange,
  event,
  defaultStart,
  defaultEnd,
  defaultAccountId,
}: Props): React.JSX.Element {
  const isEdit = Boolean(event)
  const utils = trpc.useUtils()
  const { data: accounts = [] } = trpc.calendar.listAccounts.useQuery()

  const now = new Date()
  const defaultStartDate = defaultStart ?? now
  const defaultEndDate = defaultEnd ?? new Date(now.getTime() + 60 * 60 * 1000)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [dateStr, setDateStr] = useState(toDateInput(defaultStartDate))
  const [startTime, setStartTime] = useState(toTimeInput(defaultStartDate))
  const [endTime, setEndTime] = useState(toTimeInput(defaultEndDate))
  const [isAllDay, setIsAllDay] = useState(false)
  const [accountId, setAccountId] = useState(defaultAccountId ?? '')

  // Serientermin-Dialog
  const [pendingAction, setPendingAction] = useState<'update' | 'delete' | null>(null)
  const [showRecurringDialog, setShowRecurringDialog] = useState(false)

  useEffect(() => {
    if (event) {
      const start = new Date(event.start_at)
      const end = new Date(event.end_at)
      setTitle(event.title)
      setDescription(event.description ?? '')
      setLocation(event.location ?? '')
      setDateStr(toDateInput(start))
      setStartTime(toTimeInput(start))
      setEndTime(toTimeInput(end))
      setIsAllDay(event.is_all_day)
      setAccountId(event.account.id)
    } else {
      setTitle('')
      setDescription('')
      setLocation('')
      setDateStr(toDateInput(defaultStartDate))
      setStartTime(toTimeInput(defaultStartDate))
      setEndTime(toTimeInput(defaultEndDate))
      setIsAllDay(false)
      setAccountId(defaultAccountId ?? accounts[0]?.id ?? '')
    }
  }, [event, open]) // eslint-disable-line react-hooks/exhaustive-deps

  const createMutation = trpc.calendar.create.useMutation({
    onSuccess: () => {
      utils.calendar.list.invalidate()
      onOpenChange(false)
    },
  })

  const updateMutation = trpc.calendar.update.useMutation({
    onSuccess: () => {
      utils.calendar.list.invalidate()
      onOpenChange(false)
    },
  })

  const deleteMutation = trpc.calendar.delete.useMutation({
    onSuccess: () => {
      utils.calendar.list.invalidate()
      onOpenChange(false)
    },
  })

  const isRecurring = Boolean(event?.recurrence_rule || event?.recurring_event_id)

  const handleSave = (): void => {
    if (isEdit && isRecurring) {
      setPendingAction('update')
      setShowRecurringDialog(true)
      return
    }
    doSave('THIS')
  }

  const handleDelete = (): void => {
    if (!event) return
    if (isRecurring) {
      setPendingAction('delete')
      setShowRecurringDialog(true)
      return
    }
    doDelete('THIS')
  }

  const doSave = (mode: RecurringMode): void => {
    const start = isAllDay ? new Date(`${dateStr}T00:00:00Z`) : combineDatetime(dateStr, startTime)
    const end = isAllDay ? new Date(`${dateStr}T23:59:59Z`) : combineDatetime(dateStr, endTime)

    if (isEdit && event) {
      updateMutation.mutate({
        id: event.id,
        patch: { title, description: description || null, location: location || null, start_at: start, end_at: end, is_all_day: isAllDay },
        recurringMode: mode,
      })
    } else {
      createMutation.mutate({
        accountId,
        title,
        description: description || null,
        location: location || null,
        start_at: start,
        end_at: end,
        is_all_day: isAllDay,
      })
    }
  }

  const doDelete = (mode: RecurringMode): void => {
    if (!event) return
    deleteMutation.mutate({ id: event.id, recurringMode: mode })
  }

  const onRecurringConfirm = (mode: RecurringMode): void => {
    setShowRecurringDialog(false)
    if (pendingAction === 'update') doSave(mode)
    else if (pendingAction === 'delete') doDelete(mode)
    setPendingAction(null)
  }

  const isBusy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Termin bearbeiten' : 'Neuer Termin'}</DialogTitle>
            <DialogDescription className="sr-only">
              Kalendertermin {isEdit ? 'bearbeiten' : 'erstellen'}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Titel */}
            <div>
              <Input
                placeholder="Titel"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-base font-medium"
                autoFocus
              />
            </div>

            {/* Datum + Zeit */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Calendar size={15} className="shrink-0 text-muted-foreground" />
                <Input
                  type="date"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  className="w-auto"
                />
              </div>
              {!isAllDay && (
                <div className="flex items-center gap-2">
                  <Clock size={15} className="shrink-0 text-muted-foreground" />
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-auto"
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-auto"
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="all-day"
                  checked={isAllDay}
                  onCheckedChange={(v) => setIsAllDay(Boolean(v))}
                />
                <Label htmlFor="all-day" className="cursor-pointer text-sm font-normal">Ganztägig</Label>
              </div>
            </div>

            {/* Ort */}
            <div className="flex items-center gap-2">
              <MapPin size={15} className="shrink-0 text-muted-foreground" />
              <Input
                placeholder="Ort hinzufügen"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>

            {/* Beschreibung */}
            <div className="flex items-start gap-2">
              <AlignLeft size={15} className="mt-2 shrink-0 text-muted-foreground" />
              <textarea
                placeholder="Beschreibung hinzufügen"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {/* Kalender-Konto (nur beim Erstellen) */}
            {!isEdit && accounts.length > 0 && (
              <div className="flex items-center gap-2">
                <Users size={15} className="shrink-0 text-muted-foreground" />
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.display_name ?? acc.email} ({acc.provider})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2 sm:justify-between">
            {isEdit && (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={handleDelete}
                disabled={isBusy}
              >
                Löschen
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>
                Abbrechen
              </Button>
              <Button onClick={handleSave} disabled={isBusy || !title.trim() || (!isEdit && !accountId)}>
                Speichern
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {event && (
        <RecurringEditDialog
          open={showRecurringDialog}
          eventTitle={event.title}
          onConfirm={onRecurringConfirm}
          onCancel={() => { setShowRecurringDialog(false); setPendingAction(null) }}
        />
      )}
    </>
  )
}
