'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/provider'
import { CategoryPicker } from './category-picker'
import { ApplyToSimilarDialog } from './apply-to-similar-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@/server/routers/_app'

type RouterOutputs = inferRouterOutputs<AppRouter>
type Transaction = RouterOutputs['budget']['listTransactions'][number]
type Category = RouterOutputs['budget']['listCategories'][number]

type BillingInterval = 'monthly' | 'quarterly' | 'biannual' | 'annual'

const INTERVAL_OPTIONS: { value: BillingInterval; label: string }[] = [
  { value: 'monthly', label: 'Monatlich' },
  { value: 'quarterly', label: 'Vierteljährlich' },
  { value: 'biannual', label: 'Halbjährlich' },
  { value: 'annual', label: 'Jährlich' },
]

const INTERVAL_LABELS: Record<string, string> = {
  quarterly: 'Quartal',
  biannual: 'Halbjahr',
  annual: 'Jährlich',
}

type Props = {
  transaction: Transaction
  categories: Category[]
}

type PendingChange = {
  categoryId: string | null
  isTransfer: boolean
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

export function TransactionRow({ transaction: tx, categories }: Props): React.JSX.Element {
  const utils = trpc.useUtils()
  const [pending, setPending] = useState<PendingChange | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [showIntervalPicker, setShowIntervalPicker] = useState(false)
  const [localInterval, setLocalInterval] = useState<BillingInterval>(
    (tx.billing_interval as BillingInterval | undefined) ?? 'monthly'
  )
  const [fixedCostDialogOpen, setFixedCostDialogOpen] = useState(false)
  const [pendingInterval, setPendingInterval] = useState<BillingInterval | null>(null)
  const [fixedCostMode, setFixedCostMode] = useState<'override' | 'existing' | 'additional' | 'single'>('existing')
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null)
  const [customFixedCostLabel, setCustomFixedCostLabel] = useState('')
  const [fixedCostMatchesData, setFixedCostMatchesData] = useState<RouterOutputs['budget']['listFixedCostMatches'] | null>(null)

  const isFixed = tx.category?.type === 'fixed'

  const similarQuery = trpc.budget.listSimilarTransactions.useQuery(
    { id: tx.id },
    { enabled: dialogOpen }
  )

  const update = trpc.budget.updateTransaction.useMutation({
    onSuccess: () => {
      void utils.budget.listTransactions.invalidate()
      void utils.budget.dashboardStats.invalidate()
      void utils.budget.monthlyOverview.invalidate()
      void utils.budget.monthlyCategoryOverview.invalidate()
      void utils.budget.fixedCostOverview.invalidate()
      void utils.budget.listSimilarTransactions.invalidate({ id: tx.id })
    },
  })

  async function handleCategorySelect(categoryId: string | null, isTransfer: boolean): Promise<void> {
    const similar = await utils.budget.listSimilarTransactions.fetch({ id: tx.id })
    if (similar.length > 0) {
      setPending({ categoryId, isTransfer })
      setDialogOpen(true)
    } else {
      update.mutate({ id: tx.id, categoryId: categoryId ?? undefined, isTransfer, applyToSimilar: false })
    }
  }

  function handleConfirm(selectedIds: string[]): void {
    if (!pending) return
    update.mutate({
      id: tx.id,
      categoryId: pending.categoryId ?? undefined,
      isTransfer: pending.isTransfer,
      applyToSimilar: false,
      targetIds: selectedIds,
    })
    setDialogOpen(false)
    setPending(null)
  }

  async function handleIntervalChange(interval: BillingInterval): Promise<void> {
    setShowIntervalPicker(false)

    const matches = await utils.budget.listFixedCostMatches.fetch({ id: tx.id })
    if (matches.matches.length === 0) {
      setLocalInterval(interval)
      update.mutate({ id: tx.id, billingInterval: interval })
      return
    }

    setPendingInterval(interval)
    setFixedCostMatchesData(matches)
    setSelectedGroupKey(matches.matches[0]?.groupKey ?? null)
    setCustomFixedCostLabel(matches.matches[0]?.label ?? '')
    setFixedCostMode('existing')
    setFixedCostDialogOpen(true)
  }

  function confirmFixedCostAssignment(): void {
    if (!pendingInterval || !fixedCostMatchesData) return

    let fixedCostGroupKey: string | null | undefined
    let fixedCostLabel: string | null | undefined

    if (fixedCostMode === 'existing') {
      fixedCostGroupKey = selectedGroupKey
      fixedCostLabel = fixedCostMatchesData.matches.find((item) => item.groupKey === selectedGroupKey)?.label ?? null
    } else if (fixedCostMode === 'override') {
      fixedCostGroupKey = selectedGroupKey
      fixedCostLabel = customFixedCostLabel.trim() || (fixedCostMatchesData.matches.find((item) => item.groupKey === selectedGroupKey)?.label ?? null)
    } else if (fixedCostMode === 'additional') {
      fixedCostGroupKey = fixedCostMatchesData.suggestedNewGroupKey
      fixedCostLabel = customFixedCostLabel.trim() || `${fixedCostMatchesData.providerLabel} zusätzlich`
    } else {
      fixedCostGroupKey = `${fixedCostMatchesData.providerKey}::single::${tx.id}`
      fixedCostLabel = customFixedCostLabel.trim() || `${fixedCostMatchesData.providerLabel} einmalig`
    }

    setLocalInterval(pendingInterval)
    setFixedCostDialogOpen(false)
    update.mutate({
      id: tx.id,
      billingInterval: pendingInterval,
      fixedCostGroupKey,
      fixedCostLabel,
    })
  }

  return (
    <>
      <div className={cn(
        'group flex flex-col gap-2 rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-3',
        tx.is_transfer && 'opacity-60',
        update.isPending && 'opacity-50 pointer-events-none',
      )}>
        <span className="w-full shrink-0 text-xs text-muted-foreground sm:w-20">
          {format(new Date(tx.date), 'd. MMM', { locale: de })}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{tx.recipient ?? tx.subject ?? '—'}</p>
          {tx.subject && tx.recipient && (
            <p className="truncate text-xs text-muted-foreground">{tx.subject}</p>
          )}
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          {isFixed && (
            <div className="relative">
              <button
                onClick={() => setShowIntervalPicker((v) => !v)}
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors',
                  localInterval === 'monthly'
                    ? 'bg-muted text-muted-foreground hover:bg-muted/80'
                    : 'bg-violet-100 text-violet-600 hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-400',
                )}
              >
                {localInterval === 'monthly' ? 'Monatl.' : INTERVAL_LABELS[localInterval]}
              </button>
              {showIntervalPicker && (
                <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-md border border-border bg-popover shadow-md">
                  {INTERVAL_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      onClick={() => { void handleIntervalChange(o.value) }}
                      className={cn(
                        'w-full px-3 py-1.5 text-left text-xs hover:bg-muted',
                        localInterval === o.value && 'font-medium text-primary',
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <CategoryPicker
            categories={categories}
            value={tx.category ?? null}
            isTransfer={tx.is_transfer}
            onSelect={(catId, isTransfer) => { void handleCategorySelect(catId, isTransfer) }}
            disabled={update.isPending}
          />

          <span className={cn(
            'ml-auto text-right font-medium tabular-nums sm:w-24',
            tx.amount >= 0 ? 'text-green-600' : 'text-foreground',
          )}>
            {formatCents(tx.amount)}
          </span>
        </div>
      </div>

      <ApplyToSimilarDialog
        open={dialogOpen}
        onOpenChange={(open) => { if (!open) { setDialogOpen(false); setPending(null) } }}
        similarTransactions={similarQuery.data ?? []}
        onConfirm={handleConfirm}
        isLoading={update.isPending}
      />

      <Dialog
        open={fixedCostDialogOpen}
        onOpenChange={(open) => {
          setFixedCostDialogOpen(open)
          if (!open) {
            setPendingInterval(null)
            setFixedCostMatchesData(null)
          }
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Fixkosten-Abo zuordnen</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Für diesen Anbieter gibt es bereits Fixkosten. Wähle, ob diese Buchung ein bestehendes Abo nutzt, es überschreibt oder als zusätzliches Abo geführt werden soll.
            </p>

            <div className="space-y-2">
              <label className="flex items-start gap-3 rounded-lg border border-border p-3">
                <input
                  type="radio"
                  name={`fixed-cost-mode-${tx.id}`}
                  checked={fixedCostMode === 'override'}
                  onChange={() => setFixedCostMode('override')}
                  className="mt-1"
                />
                <div>
                  <p className="text-sm font-medium">Abo überschreiben</p>
                  <p className="text-xs text-muted-foreground">
                    Diese Buchung wird der gewählten Abo-Gruppe zugeordnet und kann deren Namen aktualisieren.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-lg border border-border p-3">
                <input
                  type="radio"
                  name={`fixed-cost-mode-${tx.id}`}
                  checked={fixedCostMode === 'existing'}
                  onChange={() => setFixedCostMode('existing')}
                  className="mt-1"
                />
                <div>
                  <p className="text-sm font-medium">Bestehendes nutzen</p>
                  <p className="text-xs text-muted-foreground">
                    Diese Buchung wird einem vorhandenen Abo zugeordnet und nutzt dessen bestehende Bezeichnung.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-lg border border-border p-3">
                <input
                  type="radio"
                  name={`fixed-cost-mode-${tx.id}`}
                  checked={fixedCostMode === 'additional'}
                  onChange={() => setFixedCostMode('additional')}
                  className="mt-1"
                />
                <div>
                  <p className="text-sm font-medium">Zusätzliches anlegen</p>
                  <p className="text-xs text-muted-foreground">
                    Nützlich, wenn du beim selben Anbieter mehrere Abos oder Verträge parallel hast.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-lg border border-border p-3">
                <input
                  type="radio"
                  name={`fixed-cost-mode-${tx.id}`}
                  checked={fixedCostMode === 'single'}
                  onChange={() => setFixedCostMode('single')}
                  className="mt-1"
                />
                <div>
                  <p className="text-sm font-medium">Nur diese Buchung</p>
                  <p className="text-xs text-muted-foreground">
                    Führt diese Buchung als eigenen Fixkosten-Posten, ohne sie mit einem anderen Abo zusammenzuführen.
                  </p>
                </div>
              </label>
            </div>

            {fixedCostMode === 'existing' || fixedCostMode === 'override' ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Bestehendes Abo</label>
                <select
                  value={selectedGroupKey ?? ''}
                  onChange={(e) => setSelectedGroupKey(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  {fixedCostMatchesData?.matches.map((item) => (
                    <option key={item.groupKey} value={item.groupKey}>
                      {item.label} · {formatCents(item.lastAmount)} · {item.billingInterval}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {fixedCostMode === 'override' || fixedCostMode === 'additional' || fixedCostMode === 'single' ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Bezeichnung</label>
                <input
                  value={customFixedCostLabel}
                  onChange={(e) => setCustomFixedCostLabel(e.target.value)}
                  placeholder="z. B. Family-Abo, Firmenabo, Rücklage A"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setFixedCostDialogOpen(false)}>
                Abbrechen
              </Button>
              <Button
                onClick={confirmFixedCostAssignment}
                disabled={update.isPending || !pendingInterval}
              >
                Speichern
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
