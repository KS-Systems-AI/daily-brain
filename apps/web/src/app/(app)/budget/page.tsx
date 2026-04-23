'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@/server/routers/_app'

type RouterOutputs = inferRouterOutputs<AppRouter>
type Category = RouterOutputs['budget']['listCategories'][number]
import { ChevronLeft, ChevronRight, Upload, ArrowLeftRight, TrendingDown, TrendingUp, Tag, X } from 'lucide-react'
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


type Tab = 'dashboard' | 'transactions' | 'transfers' | 'categories'

export default function BudgetPage(): React.JSX.Element {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [tab, setTab] = useState<Tab>('dashboard')
  const [showUpload, setShowUpload] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<{ id: string; name: string; color: string } | null>(null)

  function prevMonth(): void {
    if (month === 1) { setMonth(12); setYear((y) => y - 1) }
    else setMonth((m) => m - 1)
  }
  function nextMonth(): void {
    if (month === 12) { setMonth(1); setYear((y) => y + 1) }
    else setMonth((m) => m + 1)
  }

  const { data: stats, isLoading: statsLoading } = trpc.budget.dashboardStats.useQuery({ year, month })
  const { data: monthly } = trpc.budget.monthlyOverview.useQuery({ months: 12 })
  const { data: transactions = [], isLoading: txLoading } = trpc.budget.listTransactions.useQuery({
    year, month,
    includeTransfers: tab === 'transfers',
  })
  const { data: categories = [] } = trpc.budget.listCategories.useQuery()
  const { data: categoryTxs = [], isLoading: categoryTxsLoading } = trpc.budget.listTransactions.useQuery(
    { year, month, categoryId: selectedCategory?.id, includeTransfers: false },
    { enabled: !!selectedCategory }
  )

  const currentMonthLabel = format(new Date(year, month - 1, 1), 'MMMM yyyy', { locale: de })

  const isCurrentOrFuture = year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1)

  const filteredTransactions = tab === 'transfers'
    ? transactions.filter((t) => t.is_transfer)
    : transactions.filter((t) => !t.is_transfer)

  const TABS: { key: Tab; label: string }[] = [
    { key: 'dashboard', label: 'Übersicht' },
    { key: 'transactions', label: 'Buchungen' },
    { key: 'transfers', label: 'Umbuchungen' },
    { key: 'categories', label: 'Kategorien' },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">Haushaltsbuch</h1>
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="rounded p-1 hover:bg-muted">
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-[140px] text-center text-sm font-medium">{currentMonthLabel}</span>
            <button onClick={nextMonth} disabled={isCurrentOrFuture} className="rounded p-1 hover:bg-muted disabled:opacity-40">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowUpload((v) => !v)}>
          <Upload size={14} className="mr-1.5" />
          CSV importieren
        </Button>
      </div>

      {/* Upload panel */}
      {showUpload && (
        <div className="border-b border-border bg-muted/30 px-6 py-4">
          <CsvUpload onSuccess={() => setShowUpload(false)} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border px-6">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2.5 text-sm transition-colors',
              tab === key
                ? 'border-primary font-medium text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'dashboard' && (
          <div className="space-y-6">
            {/* Summary cards */}
            {statsLoading ? (
              <div className="grid grid-cols-4 gap-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            ) : stats ? (
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="Einnahmen" value={formatCents(stats.totalIncome)} icon={<TrendingUp size={16} />} color="text-green-600" />
                <StatCard label="Ausgaben gesamt" value={formatCents(stats.totalExpenses)} icon={<TrendingDown size={16} />} color="text-red-500" />
                <StatCard
                  label="Fixkosten"
                  value={formatCents(stats.fixedExpensesNormalized)}
                  icon={<Tag size={16} />}
                  color="text-violet-500"
                  note={stats.fixedExpensesNormalized !== stats.fixedExpenses ? 'Ø/Monat' : undefined}
                />
                <StatCard label="Variable Ausgaben" value={formatCents(stats.variableExpenses)} icon={<Tag size={16} />} color="text-orange-500" />
              </div>
            ) : null}

            {/* Charts row */}
            <div className="grid grid-cols-5 gap-4">
              {/* Monthly bar chart */}
              <div className="col-span-3 rounded-xl border border-border bg-card p-4">
                <h2 className="mb-4 text-sm font-semibold">12-Monats-Verlauf</h2>
                {monthly?.length ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={monthly} barSize={12} barGap={2}>
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={(v) => {
                        const [y, m] = (v as string).split('-')
                        return format(new Date(parseInt(y), parseInt(m) - 1), 'MMM', { locale: de })
                      }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round((v as number) / 100)}€`} />
                      <Tooltip
                        formatter={(v: unknown) => formatCents(Number(v))}
                        labelFormatter={(v) => {
                          const [y, m] = (v as string).split('-')
                          return format(new Date(parseInt(y), parseInt(m) - 1), 'MMMM yyyy', { locale: de })
                        }}
                      />
                      <Bar dataKey="fixed" name="Fixkosten" fill="#6366f1" radius={[2, 2, 0, 0]} stackId="a" />
                      <Bar dataKey="variable" name="Variabel" fill="#f97316" radius={[2, 2, 0, 0]} stackId="a" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart />
                )}
              </div>

              {/* Category donut */}
              <div className="col-span-2 rounded-xl border border-border bg-card p-4">
                <h2 className="mb-4 text-sm font-semibold">Nach Kategorie</h2>
                {stats?.byCategory.length ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={stats.byCategory.slice(0, 8)}
                        dataKey="total"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                      >
                        {stats.byCategory.slice(0, 8).map((entry) => (
                          <Cell key={entry.id} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: unknown) => formatCents(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart />
                )}
              </div>
            </div>

            {/* Category breakdown list */}
            {stats?.byCategory.length ? (
              <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border px-4 py-3">
                  <h2 className="text-sm font-semibold">Kategorie-Aufschlüsselung</h2>
                </div>
                {(
                  [
                    { type: 'income',   label: 'Einnahmen',         base: stats.totalIncome,   color: 'text-green-600' },
                    { type: 'fixed',    label: 'Fixkosten',          base: stats.totalExpenses, color: 'text-violet-500' },
                    { type: 'variable', label: 'Variable Ausgaben',  base: stats.totalExpenses, color: 'text-orange-500' },
                  ] as const
                ).map(({ type, label, base, color }) => {
                  const cats = stats.byCategory.filter((c) => c.type === type)
                  if (!cats.length) return null
                  return (
                    <div key={type}>
                      <div className="flex items-center justify-between border-b border-border/50 bg-muted/30 px-4 py-1.5">
                        <span className={cn('text-xs font-semibold uppercase tracking-wider', color)}>{label}</span>
                        <span className={cn('text-xs font-semibold tabular-nums', color)}>
                          {type === 'income' ? '+' : ''}{formatCents(cats.reduce((s, c) => s + c.total, 0))}
                        </span>
                      </div>
                      <div className="divide-y divide-border/50">
                        {cats.map((cat) => {
                          const pct = base > 0 ? (cat.total / base) * 100 : 0
                          return (
                            <button
                              key={cat.id}
                              onClick={() => setSelectedCategory({ id: cat.id, name: cat.name, color: cat.color })}
                              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
                            >
                              <div className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: cat.color }} />
                              <span className="flex-1 text-sm">{cat.name}</span>
                              <div className="flex items-center gap-3">
                                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                                  <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: cat.color }} />
                                </div>
                                <span className="w-8 text-right text-xs text-muted-foreground">{Math.round(pct)}%</span>
                                <div className="w-28 text-right">
                                  <span className={cn(
                                    'text-sm font-medium tabular-nums',
                                    type === 'income' ? 'text-green-600' : 'text-foreground',
                                  )}>
                                    {type === 'income' ? '+' : ''}{formatCents(cat.total)}
                                  </span>
                                  {cat.type === 'fixed' && cat.actualTotal !== cat.total && (
                                    <p className="text-[10px] text-muted-foreground">
                                      von {formatCents(cat.actualTotal)}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : null}

            {/* Uncategorized warning */}
            {stats?.uncategorized && stats.uncategorized > 0 ? (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <Tag size={14} />
                <span><strong>{stats.uncategorized}</strong> Buchungen ohne Kategorie — im Tab &quot;Buchungen&quot; manuell zuweisen</span>
                <button onClick={() => setTab('transactions')} className="ml-auto text-amber-700 underline">Jetzt kategorisieren</button>
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
          <CategoriesTab categories={categories as Category[]} />
        )}
      </div>

      {/* Category detail dialog */}
      <Dialog open={!!selectedCategory} onOpenChange={(open) => { if (!open) setSelectedCategory(null) }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-6">
              {selectedCategory && (
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: selectedCategory.color }} />
              )}
              {selectedCategory?.name}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {format(new Date(year, month - 1, 1), 'MMMM yyyy', { locale: de })}
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
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  color,
  note,
}: {
  label: string
  value: string
  icon: React.ReactNode
  color: string
  note?: string
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className={cn('mb-2 flex items-center gap-1.5 text-xs font-medium', color)}>
        {icon}
        {label}
        {note && (
          <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
            {note}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </div>
  )
}

function EmptyChart(): React.JSX.Element {
  return (
    <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
      Noch keine Daten — CSV importieren
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

function CategoriesTab({ categories }: { categories: Category[] }): React.JSX.Element {
  const utils = trpc.useUtils()
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<'fixed' | 'variable' | 'income' | 'transfer'>('variable')

  const create = trpc.budget.createCategory.useMutation({
    onSuccess: () => {
      void utils.budget.listCategories.invalidate()
      setNewName('')
    },
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
          className="flex gap-2"
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
    </div>
  )
}
