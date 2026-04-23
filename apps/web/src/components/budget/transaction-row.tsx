'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/provider'
import { CategoryPicker } from './category-picker'
import { ApplyToSimilarDialog } from './apply-to-similar-dialog'
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

  function handleIntervalChange(interval: BillingInterval): void {
    setLocalInterval(interval)
    setShowIntervalPicker(false)
    update.mutate({ id: tx.id, billingInterval: interval })
  }

  return (
    <>
      <div className={cn(
        'group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-muted/50',
        tx.is_transfer && 'opacity-60',
        update.isPending && 'opacity-50 pointer-events-none',
      )}>
        <span className="w-20 shrink-0 text-xs text-muted-foreground">
          {format(new Date(tx.date), 'd. MMM', { locale: de })}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{tx.recipient ?? tx.subject ?? '—'}</p>
          {tx.subject && tx.recipient && (
            <p className="truncate text-xs text-muted-foreground">{tx.subject}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
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
                      onClick={() => handleIntervalChange(o.value)}
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
            'w-24 text-right font-medium tabular-nums',
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
    </>
  )
}
