'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@/server/routers/_app'

type RouterOutputs = inferRouterOutputs<AppRouter>
type Category = RouterOutputs['budget']['listCategories'][number]
type Transaction = RouterOutputs['budget']['listTransactions'][number]
import { ChevronLeft, ChevronRight, Upload, ArrowLeftRight, Tag } from 'lucide-react'
import { trpc } from '@/lib/trpc/provider'
import { CsvUpload } from '@/components/budget/csv-upload'
import { TransactionRow } from '@/components/budget/transaction-row'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

function formatCents(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

const BILLING_INTERVAL_LABELS: Record<string, string> = {
  monthly: 'monatlich',
  quarterly: 'vierteljährlich',
  biannual: 'halbjährlich',
  annual: 'jährlich',
}


type Tab = 'dashboard' | 'transactions' | 'transfers' | 'categories'

const OVERVIEW_REFRESH_MS = 10_000
type TransferListItem =
  | { kind: 'pair'; key: string; outgoing: Transaction; incoming: Transaction }
  | { kind: 'single'; key: string; transaction: Transaction }

function normalizeName(value: string | null | undefined): string | null {
  if (!value) return null
  return value.trim().toUpperCase().replace(/\s+/g, ' ')
}

function isSameDay(a: string | Date, b: string | Date): boolean {
  const left = new Date(a)
  const right = new Date(b)
  return left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
}

function buildTransferList(transactions: Transaction[]): TransferListItem[] {
  const used = new Set<string>()
  const items: TransferListItem[] = []

  for (const tx of transactions) {
    if (used.has(tx.id)) continue

    const pair = transactions.find((candidate) => {
      if (candidate.id === tx.id || used.has(candidate.id)) return false
      if (!isSameDay(tx.date, candidate.date)) return false
      if (tx.amount !== -candidate.amount) return false

      const txRecipient = normalizeName(tx.recipient)
      const txSender = normalizeName(tx.sender)
      const candidateRecipient = normalizeName(candidate.recipient)
      const candidateSender = normalizeName(candidate.sender)

      return !!(
        txRecipient &&
        txSender &&
        candidateRecipient &&
        candidateSender &&
        txRecipient === candidateSender &&
        txSender === candidateRecipient
      )
    })

    if (pair) {
      used.add(tx.id)
      used.add(pair.id)

      const outgoing = tx.amount < 0 ? tx : pair
      const incoming = tx.amount >= 0 ? tx : pair

      items.push({
        kind: 'pair',
        key: `${outgoing.id}-${incoming.id}`,
        outgoing,
        incoming,
      })
      continue
    }

    used.add(tx.id)
    items.push({ kind: 'single', key: tx.id, transaction: tx })
  }

  return items
}

export default function BudgetPage(): React.JSX.Element {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [tab, setTab] = useState<Tab>('dashboard')
  const [showUpload, setShowUpload] = useState(false)
  const [selectedFixedCostKey, setSelectedFixedCostKey] = useState<string | null>(null)
  const [fixedCostLabelDraft, setFixedCostLabelDraft] = useState('')
  const [fixedCostIntervalDraft, setFixedCostIntervalDraft] = useState<'monthly' | 'quarterly' | 'biannual' | 'annual'>('monthly')
  const [mergeTargetKey, setMergeTargetKey] = useState<string>('')
  const [selectedCategory, setSelectedCategory] = useState<{
    id: string
    name: string
    color: string
    year: number
    monthNumber: number
  } | null>(null)

  function prevMonth(): void {
    if (month === 1) { setMonth(12); setYear((y) => y - 1) }
    else setMonth((m) => m - 1)
  }
  function nextMonth(): void {
    if (month === 12) { setMonth(1); setYear((y) => y + 1) }
    else setMonth((m) => m + 1)
  }

  const overviewQueryOptions = {
    refetchInterval: tab === 'dashboard' ? OVERVIEW_REFRESH_MS : false,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  } as const

  const { data: stats, isLoading: statsLoading } = trpc.budget.dashboardStats.useQuery(
    { year, month },
    overviewQueryOptions,
  )
  const { data: monthlyCategories } = trpc.budget.monthlyCategoryOverview.useQuery(
    { months: 12 },
    overviewQueryOptions,
  )
  const { data: fixedCostOverview } = trpc.budget.fixedCostOverview.useQuery(
    undefined,
    overviewQueryOptions,
  )
  const { data: transactions = [], isLoading: txLoading } = trpc.budget.listTransactions.useQuery({
    year, month,
    includeTransfers: tab === 'transfers',
  })
  const { data: categories = [] } = trpc.budget.listCategories.useQuery()
  const { data: rules = [] } = trpc.budget.listRules.useQuery()
  const { data: fixedCostDetails } = trpc.budget.getFixedCostGroupDetails.useQuery(
    { groupKey: selectedFixedCostKey ?? '' },
    { enabled: !!selectedFixedCostKey }
  )
  const { data: categoryTxs = [], isLoading: categoryTxsLoading } = trpc.budget.listTransactions.useQuery(
    {
      year: selectedCategory?.year ?? year,
      month: selectedCategory?.monthNumber ?? month,
      categoryId: selectedCategory?.id,
      includeTransfers: false,
    },
    { enabled: !!selectedCategory }
  )

  const isCurrentOrFuture = year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1)

  const filteredTransactions = tab === 'transfers'
    ? transactions.filter((t) => t.is_transfer)
    : transactions.filter((t) => !t.is_transfer)
  const transferItems = tab === 'transfers' ? buildTransferList(filteredTransactions) : []
  const utils = trpc.useUtils()
  const updateFixedCostGroup = trpc.budget.updateFixedCostGroup.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.budget.fixedCostOverview.invalidate(),
        utils.budget.getFixedCostGroupDetails.invalidate(),
        utils.budget.listTransactions.invalidate(),
        utils.budget.dashboardStats.invalidate(),
      ])
    },
  })
  const splitFixedCostTransaction = trpc.budget.splitFixedCostTransaction.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.budget.fixedCostOverview.invalidate(),
        utils.budget.getFixedCostGroupDetails.invalidate(),
        utils.budget.listTransactions.invalidate(),
        utils.budget.dashboardStats.invalidate(),
      ])
    },
  })

  useEffect(() => {
    if (!fixedCostDetails) return
    setFixedCostLabelDraft(fixedCostDetails.label)
    setFixedCostIntervalDraft(fixedCostDetails.billingInterval as 'monthly' | 'quarterly' | 'biannual' | 'annual')
    setMergeTargetKey(fixedCostDetails.siblingGroups[0]?.groupKey ?? '')
  }, [fixedCostDetails])

  const TABS: { key: Tab; label: string }[] = [
    { key: 'dashboard', label: 'Übersicht' },
    { key: 'transactions', label: 'Buchungen' },
    { key: 'transfers', label: 'Umbuchungen' },
    { key: 'categories', label: 'Kategorien' },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
          <h1 className="text-lg font-semibold sm:text-xl">Haushaltsbuch</h1>
          {(tab === 'transactions' || tab === 'transfers') && (
            <div className="flex items-center gap-1 self-start rounded-full border border-border bg-background p-1">
              <button type="button" onClick={prevMonth} className="rounded-full p-1.5 hover:bg-muted">
                <ChevronLeft size={16} />
              </button>
              <span className="min-w-[132px] px-1 text-center text-sm font-medium sm:min-w-[148px]">
                {format(new Date(year, month - 1, 1), 'MMMM yyyy', { locale: de })}
              </span>
              <button
                type="button"
                onClick={nextMonth}
                disabled={isCurrentOrFuture}
                className="rounded-full p-1.5 hover:bg-muted disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="w-full md:w-auto"
          onClick={() => setShowUpload((v) => !v)}
        >
          <Upload size={14} className="mr-1.5" />
          CSV importieren
        </Button>
      </div>

      {/* Upload panel */}
      {showUpload && (
        <div className="border-b border-border bg-muted/30 px-4 py-4 sm:px-6">
          <CsvUpload onSuccess={() => setShowUpload(false)} />
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-border px-4 sm:px-6">
        <div className="flex gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                '-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm transition-colors',
                tab === key
                  ? 'border-primary font-medium text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {tab === 'dashboard' && (
          <div className="space-y-6">
            {fixedCostOverview?.items.length ? (
              <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">Fixkosten pro Monat</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Dauerhafte Monatslast auf Basis deiner gespeicherten Fixkostenbuchungen.
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Gesamt</p>
                    <p className="text-xl font-semibold tabular-nums">
                      {formatCents(fixedCostOverview.totalMonthly)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 max-h-[32rem] overflow-y-auto pr-1">
                  <div className="divide-y divide-border/50">
                    {fixedCostOverview.items.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setSelectedFixedCostKey(item.key)}
                      className="flex w-full flex-col gap-3 rounded-lg py-3 text-left transition-colors hover:bg-muted/40 sm:flex-row sm:items-center"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <span
                          className="mt-1 size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: item.categoryColor }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{item.label}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {item.categoryName} · {BILLING_INTERVAL_LABELS[item.billingInterval] ?? item.billingInterval} · zuletzt{' '}
                            {format(new Date(item.lastBookedAt), 'MMM yyyy', { locale: de })}
                          </p>
                        </div>
                      </div>
                      <div className="w-full text-left sm:w-auto sm:text-right">
                        <p className="text-sm font-semibold tabular-nums">
                          {formatCents(item.monthlyAmount)}
                        </p>
                        {item.lastAmount !== item.monthlyAmount && (
                          <p className="text-[10px] text-muted-foreground">
                            von {formatCents(item.lastAmount)}
                          </p>
                        )}
                      </div>
                    </button>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                  <p>
                    Klick auf einen Eintrag, um Abo-Name, Intervall oder Zusammenführung direkt zu bearbeiten.
                  </p>
                  {fixedCostOverview.items.length > 8 ? (
                    <p>Nach unten scrollen für weitere Fixkosten.</p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-card/60 p-5">
                <h2 className="text-sm font-semibold">Fixkosten pro Monat</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Noch keine Fixkosten erkannt. Sobald du wiederkehrende Buchungen als monatlich, vierteljährlich, halbjährlich oder jährlich markierst, erscheint hier deine echte Monatslast.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 w-full sm:w-auto"
                  onClick={() => setTab('transactions')}
                >
                  Buchungen kategorisieren
                </Button>
              </div>
            )}

            {monthlyCategories?.length ? (
              <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">Monate im Überblick</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Variable Kosten pro Monat auf einer Seite. Klick auf eine Kategorie zeigt die einzelnen Buchungen.
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">letzte 12 Monate</p>
                </div>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {monthlyCategories.map((monthEntry) => (
                    <div key={monthEntry.month} className="rounded-xl border border-border/70 bg-background/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold">
                            {format(new Date(monthEntry.year, monthEntry.monthNumber - 1, 1), 'MMMM yyyy', { locale: de })}
                          </h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Variable Kosten gesamt: {formatCents(monthEntry.variableTotal)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {monthEntry.variableCategories.length > 0 ? (
                          monthEntry.variableCategories.map((category) => (
                            <button
                              key={`${monthEntry.month}-${category.id}`}
                              onClick={() => setSelectedCategory({
                                id: category.id,
                                name: category.name,
                                color: category.color,
                                year: monthEntry.year,
                                monthNumber: monthEntry.monthNumber,
                              })}
                              className="rounded-full px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                              style={{
                                backgroundColor: `${category.color}20`,
                                color: category.color,
                              }}
                            >
                              {category.name} · {formatCents(category.total)}
                            </button>
                          ))
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Keine variablen Kategorien in diesem Monat.
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-card/60 p-5">
                <h2 className="text-sm font-semibold">Monate im Überblick</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Noch keine variable Monatsübersicht vorhanden. Nach dem Import und der Kategorisierung werden hier deine Ausgaben je Monat und Kategorie sichtbar.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 w-full sm:w-auto"
                  onClick={() => setShowUpload(true)}
                >
                  CSV importieren
                </Button>
              </div>
            )}

            {stats?.uncategorized && stats.uncategorized > 0 ? (
              <div className="flex flex-col gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <Tag size={14} />
                  <span><strong>{stats.uncategorized}</strong> Buchungen ohne Kategorie — im Tab &quot;Buchungen&quot; manuell zuweisen</span>
                </div>
                <button onClick={() => setTab('transactions')} className="text-left text-amber-700 underline sm:ml-auto">
                  Jetzt kategorisieren
                </button>
              </div>
            ) : null}
          </div>
        )}

        {(tab === 'transactions' || tab === 'transfers') && (
          <div className="rounded-xl border border-border bg-card">
            {txLoading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
                ))}
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                <ArrowLeftRight size={32} className="opacity-30" />
                <p className="text-sm">Keine Buchungen für diesen Monat</p>
              </div>
            ) : tab === 'transfers' ? (
              <div className="divide-y divide-border/50 p-2">
                {transferItems.map((item) => (
                  item.kind === 'pair'
                    ? <TransferPairRow key={item.key} outgoing={item.outgoing} incoming={item.incoming} />
                    : <TransactionRow key={item.key} transaction={item.transaction} categories={categories} />
                ))}
              </div>
            ) : (
              <div className="divide-y divide-border/50 p-2">
                {filteredTransactions.map((tx) => (
                  <TransactionRow key={tx.id} transaction={tx} categories={categories} />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'categories' && (
          <CategoriesTab categories={categories as Category[]} rules={rules} />
        )}
      </div>

      {/* Category detail dialog */}
      <Dialog open={!!selectedCategory} onOpenChange={(open) => { if (!open) setSelectedCategory(null) }}>
        <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-6">
              {selectedCategory && (
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: selectedCategory.color }} />
              )}
              {selectedCategory?.name}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {selectedCategory
                ? format(new Date(selectedCategory.year, selectedCategory.monthNumber - 1, 1), 'MMMM yyyy', { locale: de })
                : format(new Date(year, month - 1, 1), 'MMMM yyyy', { locale: de })}
            </p>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {categoryTxsLoading ? (
              <div className="space-y-2 py-2">
                {[0, 1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />)}
              </div>
            ) : categoryTxs.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Keine Buchungen</p>
            ) : (
              <div className="divide-y divide-border/50">
                {categoryTxs.map((tx) => (
                  <div key={tx.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="w-16 shrink-0 text-xs text-muted-foreground">
                      {format(new Date(tx.date), 'd. MMM', { locale: de })}
                    </span>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p className="truncate font-medium">{tx.recipient ?? tx.subject ?? '—'}</p>
                      {tx.subject && tx.recipient && (
                        <p className="truncate text-xs text-muted-foreground">{tx.subject}</p>
                      )}
                    </div>
                    <span className={cn(
                      'w-24 shrink-0 text-right font-medium tabular-nums',
                      tx.amount >= 0 ? 'text-green-600' : 'text-foreground',
                    )}>
                      {formatCents(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {categoryTxs.length > 0 && (
            <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
              <span className="text-muted-foreground">{categoryTxs.length} Buchungen</span>
              <span className={cn(
                'font-semibold tabular-nums',
                categoryTxs.reduce((s, t) => s + t.amount, 0) >= 0 ? 'text-green-600' : 'text-foreground',
              )}>
                {formatCents(categoryTxs.reduce((s, t) => s + t.amount, 0))}
              </span>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!selectedFixedCostKey}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedFixedCostKey(null)
          }
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Fixkosten bearbeiten</DialogTitle>
          </DialogHeader>

          {fixedCostDetails ? (
            <div className="space-y-5 overflow-y-auto pr-1">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium">Abo-Name</span>
                  <input
                    value={fixedCostLabelDraft}
                    onChange={(e) => setFixedCostLabelDraft(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">Intervall</span>
                  <select
                    value={fixedCostIntervalDraft}
                    onChange={(e) => setFixedCostIntervalDraft(e.target.value as 'monthly' | 'quarterly' | 'biannual' | 'annual')}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="monthly">Monatlich</option>
                    <option value="quarterly">Vierteljährlich</option>
                    <option value="biannual">Halbjährlich</option>
                    <option value="annual">Jährlich</option>
                  </select>
                </label>
              </div>

              <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">Aktuelle Monatslast</p>
                  <p className="text-xs text-muted-foreground">
                    Zuletzt gebucht {format(new Date(fixedCostDetails.transactions[0]?.date ?? new Date()), 'MMM yyyy', { locale: de })}
                  </p>
                </div>
                <p className="text-lg font-semibold tabular-nums">{formatCents(fixedCostDetails.monthlyAmount)}</p>
              </div>

              <div className="flex items-center justify-end">
                <Button
                  onClick={() => updateFixedCostGroup.mutate({
                    groupKey: fixedCostDetails.groupKey,
                    label: fixedCostLabelDraft.trim(),
                    billingInterval: fixedCostIntervalDraft,
                  })}
                  disabled={updateFixedCostGroup.isPending || !fixedCostLabelDraft.trim()}
                >
                  Änderungen speichern
                </Button>
              </div>

              {fixedCostDetails.siblingGroups.length > 0 ? (
                <div className="space-y-3 rounded-lg border border-border p-4">
                  <div>
                    <h3 className="text-sm font-medium">Mit anderem Abo zusammenführen</h3>
                    <p className="text-xs text-muted-foreground">
                      Nützlich, wenn zwei Einträge doch dasselbe Abo oder derselbe Vertrag sind.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select
                      value={mergeTargetKey}
                      onChange={(e) => setMergeTargetKey(e.target.value)}
                      className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                    >
                      {fixedCostDetails.siblingGroups.map((group) => (
                        <option key={group.groupKey} value={group.groupKey}>
                          {group.label} · {formatCents(group.monthlyAmount)} · {BILLING_INTERVAL_LABELS[group.billingInterval] ?? group.billingInterval}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const target = fixedCostDetails.siblingGroups.find((group) => group.groupKey === mergeTargetKey)
                        if (!target) return
                        updateFixedCostGroup.mutate({
                          groupKey: fixedCostDetails.groupKey,
                          mergeIntoGroupKey: target.groupKey,
                          mergeIntoLabel: target.label,
                        })
                      }}
                      disabled={updateFixedCostGroup.isPending || !mergeTargetKey}
                    >
                      Zusammenführen
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-medium">Zugehörige Buchungen</h3>
                  <p className="text-xs text-muted-foreground">
                    Einzelne Buchungen kannst du bei Bedarf als eigenes Abo abspalten.
                  </p>
                </div>
                <div className="max-h-[260px] space-y-2 overflow-y-auto">
                  {fixedCostDetails.transactions.map((tx) => (
                    <div key={tx.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {format(new Date(tx.date), 'd. MMM yyyy', { locale: de })} · {formatCents(tx.amount)}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {tx.recipient ?? tx.subject ?? 'Buchung'}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => splitFixedCostTransaction.mutate({
                          transactionId: tx.id,
                          label: `${fixedCostLabelDraft || fixedCostDetails.label} separat`,
                        })}
                        disabled={splitFixedCostTransaction.isPending}
                      >
                        Eigenes Abo
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-6 text-sm text-muted-foreground">Fixkosten werden geladen…</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TransferPairRow({
  outgoing,
  incoming,
}: {
  outgoing: Transaction
  incoming: Transaction
}): React.JSX.Element {
  const fromLabel = outgoing.sender ?? outgoing.recipient ?? 'Unbekannt'
  const toLabel = outgoing.recipient ?? incoming.recipient ?? 'Unbekannt'

  return (
    <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="w-16 shrink-0 pt-0.5 text-xs text-muted-foreground">
          {format(new Date(outgoing.date), 'd. MMM', { locale: de })}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">
              {fromLabel} <span className="text-muted-foreground">→</span> {toLabel}
            </p>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              Umbuchung
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Abgang {formatCents(outgoing.amount)} · Eingang {formatCents(incoming.amount)}
          </p>
        </div>
        <span className="text-sm font-semibold text-emerald-700">
          {formatCents(incoming.amount)}
        </span>
      </div>
    </div>
  )
}

function CategoryRow({ cat }: { cat: Category }): React.JSX.Element {
  const utils = trpc.useUtils()
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(cat.name)
  const [editColor, setEditColor] = useState(cat.color ?? '#94a3b8')

  const update = trpc.budget.updateCategory.useMutation({
    onSuccess: () => {
      void utils.budget.listCategories.invalidate()
      setEditing(false)
    },
  })

  const deleteCategory = trpc.budget.deleteCategory.useMutation({
    onSuccess: () => void utils.budget.listCategories.invalidate(),
  })

  if (editing) {
    return (
      <div className="flex items-center gap-2 px-4 py-2">
        <input
          type="color"
          value={editColor}
          onChange={(e) => setEditColor(e.target.value)}
          className="size-6 cursor-pointer rounded border-0 p-0"
        />
        <input
          autoFocus
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') update.mutate({ id: cat.id, name: editName, color: editColor })
            if (e.key === 'Escape') setEditing(false)
          }}
          className="flex-1 rounded-md border border-primary bg-background px-2 py-1 text-sm focus:outline-none"
        />
        <Button
          size="sm"
          disabled={update.isPending || !editName.trim()}
          onClick={() => update.mutate({ id: cat.id, name: editName, color: editColor })}
        >
          Speichern
        </Button>
        <button onClick={() => setEditing(false)} className="text-xs text-muted-foreground hover:text-foreground">
          Abbrechen
        </button>
      </div>
    )
  }

  return (
    <div className="group flex items-center gap-3 px-4 py-2.5">
      <div className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color ?? '#94a3b8' }} />
      <span className="flex-1 text-sm">{cat.name}</span>
      <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={() => { setEditName(cat.name); setEditColor(cat.color ?? '#94a3b8'); setEditing(true) }}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Bearbeiten
        </button>
        {!cat.is_system && (
          <button
            onClick={() => deleteCategory.mutate({ id: cat.id })}
            className="text-xs text-red-400 hover:text-red-600"
          >
            Löschen
          </button>
        )}
      </div>
    </div>
  )
}

function CategoriesTab({
  categories,
  rules,
}: {
  categories: Category[]
  rules: RouterOutputs['budget']['listRules']
}): React.JSX.Element {
  const utils = trpc.useUtils()
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<'fixed' | 'variable' | 'income' | 'transfer'>('variable')

  const create = trpc.budget.createCategory.useMutation({
    onSuccess: () => {
      void utils.budget.listCategories.invalidate()
      setNewName('')
    },
  })
  const deleteRule = trpc.budget.deleteRule.useMutation({
    onSuccess: () => void utils.budget.listRules.invalidate(),
  })

  const groups: Record<string, Category[]> = {
    fixed: categories.filter((c) => c.type === 'fixed'),
    variable: categories.filter((c) => c.type === 'variable'),
    income: categories.filter((c) => c.type === 'income'),
    transfer: categories.filter((c) => c.type === 'transfer'),
  }

  const typeLabels: Record<string, string> = {
    fixed: 'Fixkosten',
    variable: 'Variable Ausgaben',
    income: 'Einnahmen',
    transfer: 'Umbuchungen',
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Neue Kategorie</h2>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            if (!newName.trim()) return
            create.mutate({ name: newName.trim(), type: newType })
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name"
            className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as typeof newType)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="fixed">Fixkosten</option>
            <option value="variable">Variabel</option>
            <option value="income">Einnahmen</option>
            <option value="transfer">Umbuchung</option>
          </select>
          <Button type="submit" size="sm" disabled={create.isPending || !newName.trim()}>
            Erstellen
          </Button>
        </form>
      </div>

      {Object.entries(groups).map(([type, cats]) => (
        <div key={type} className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{typeLabels[type]}</h2>
          </div>
          <div className="divide-y divide-border/50">
            {cats.map((cat) => <CategoryRow key={cat.id} cat={cat} />)}
          </div>
        </div>
      ))}

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Gespeicherte Regeln</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Manuell gelernte Zuordnungen für künftige CSV-Imports.
          </p>
        </div>
        {rules.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            Noch keine eigenen Regeln gespeichert.
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{rule.match_value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {rule.match_field} · {rule.match_type}
                  </p>
                </div>
                <span
                  className="rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{
                    backgroundColor: `${rule.category.color ?? '#94a3b8'}20`,
                    color: rule.category.color ?? '#94a3b8',
                  }}
                >
                  {rule.category.name}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-muted-foreground"
                  onClick={() => deleteRule.mutate({ id: rule.id })}
                  disabled={deleteRule.isPending}
                >
                  Löschen
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
