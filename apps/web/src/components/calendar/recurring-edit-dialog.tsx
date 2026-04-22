'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export type RecurringMode = 'THIS' | 'THIS_AND_FOLLOWING' | 'ALL'

type Props = {
  open: boolean
  eventTitle: string
  onConfirm: (mode: RecurringMode) => void
  onCancel: () => void
}

const OPTIONS: { value: RecurringMode; label: string }[] = [
  { value: 'THIS', label: 'Nur dieser Termin' },
  { value: 'THIS_AND_FOLLOWING', label: 'Dieser und folgende Termine' },
  { value: 'ALL', label: 'Alle Termine' },
]

export function RecurringEditDialog({ open, eventTitle, onConfirm, onCancel }: Props): React.JSX.Element {
  const [selected, setSelected] = useState<RecurringMode>('THIS')

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Serientermin „{eventTitle}" bearbeiten
          </DialogTitle>
          <DialogDescription className="sr-only">
            Wähle, welche Termine der Serie bearbeitet werden sollen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
            >
              <input
                type="radio"
                name="recurring-mode"
                value={opt.value}
                checked={selected === opt.value}
                onChange={() => setSelected(opt.value)}
                className="h-4 w-4 accent-primary"
              />
              <span className="text-sm">{opt.label}</span>
            </label>
          ))}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" size="sm" onClick={onCancel} className="shrink-0">
            Änderung verwerfen
          </Button>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>
              Abbrechen
            </Button>
            <Button size="sm" onClick={() => onConfirm(selected)}>
              Speichern
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
