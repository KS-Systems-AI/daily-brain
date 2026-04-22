'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@/server/routers/_app'

type RouterOutputs = inferRouterOutputs<AppRouter>
type SimilarTx = RouterOutputs['budget']['listSimilarTransactions'][number]

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  similarTransactions: SimilarTx[]
  onConfirm: (selectedIds: string[]) => void
  isLoading?: boolean
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

export function ApplyToSimilarDialog({ open, onOpenChange, similarTransactions, onConfirm, isLoading }: Props): React.JSX.Element {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (open) {
      setSelected(new Set(similarTransactions.map((t) => t.id)))
    }
  }, [open, similarTransactions])

  const allSelected = selected.size === similarTransactions.length
  const noneSelected = selected.size === 0

  function toggleAll(): void {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(similarTransactions.map((t) => t.id)))
    }
  }

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Kategorie auf ähnliche Buchungen anwenden?</DialogTitle>
          <DialogDescription>
            {similarTransactions.length} ähnliche Buchung{similarTransactions.length !== 1 ? 'en' : ''} gefunden. Wähle aus, welche ebenfalls geändert werden sollen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          {/* Select all row */}
          <button
            onClick={toggleAll}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted/50"
          >
            <div className={cn(
              'flex size-4 items-center justify-center rounded border border-primary',
              allSelected ? 'bg-primary' : noneSelected ? 'bg-background' : 'bg-primary/40',
            )}>
              {(allSelected || !noneSelected) && <Check size={10} className="text-primary-foreground" strokeWidth={3} />}
            </div>
            <span className="font-medium text-muted-foreground">
              {allSelected ? 'Alle abwählen' : 'Alle auswählen'}
            </span>
            <span className="ml-auto text-xs text-muted-foreground">{selected.size} / {similarTransactions.length}</span>
          </button>

          <div className="h-px bg-border" />

          {/* Transaction list */}
          <div className="max-h-[55vh] overflow-y-auto">
            {similarTransactions.map((tx) => (
              <div
                key={tx.id}
                onClick={() => toggle(tx.id)}
                className="flex w-full cursor-pointer items-center gap-2 overflow-hidden rounded-md px-3 py-2 text-sm hover:bg-muted/50"
              >
                <Checkbox
                  checked={selected.has(tx.id)}
                  onCheckedChange={() => toggle(tx.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="w-20 shrink-0 text-xs text-muted-foreground">
                  {format(new Date(tx.date), 'd. MMM yy', { locale: de })}
                </span>
                <div className="w-0 flex-1 overflow-hidden">
                  <p className="truncate text-sm font-medium">{tx.recipient ?? tx.subject ?? '—'}</p>
                  {tx.subject && tx.recipient && (
                    <p className="truncate text-xs text-muted-foreground">{tx.subject}</p>
                  )}
                </div>
                <div className="flex w-24 shrink-0 justify-end overflow-hidden">
                  {tx.category ? (
                    <span
                      className="truncate rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{ backgroundColor: `${tx.category.color ?? '#94a3b8'}20`, color: tx.category.color ?? '#94a3b8' }}
                    >
                      {tx.category.name}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  )}
                </div>
                <span className={cn(
                  'w-20 shrink-0 text-right text-sm font-medium tabular-nums',
                  tx.amount >= 0 ? 'text-green-600' : 'text-foreground',
                )}>
                  {formatCents(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onConfirm([])}>
            Nur diese Buchung
          </Button>
          <Button
            onClick={() => onConfirm(Array.from(selected))}
            disabled={isLoading}
          >
            {selected.size > 0 ? `${selected.size + 1} Buchungen ändern` : 'Nur diese Buchung ändern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
