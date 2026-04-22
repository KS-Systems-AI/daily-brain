'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, ArrowLeftRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@/server/routers/_app'

type Category = inferRouterOutputs<AppRouter>['budget']['listCategories'][number]

type Props = {
  categories: Category[]
  value: Category | null
  isTransfer: boolean
  onSelect: (categoryId: string | null, isTransfer: boolean) => void
  disabled?: boolean
}

const TYPE_LABELS: Record<string, string> = {
  fixed: 'Fixkosten',
  variable: 'Variabel',
  income: 'Einnahmen',
  transfer: 'Umbuchungen',
}

export function CategoryPicker({ categories, value, isTransfer, onSelect, disabled }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => {
    function onClickOutside(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const filtered = categories.filter((c) =>
    !query || c.name.toLowerCase().includes(query.toLowerCase())
  )

  const grouped = Object.entries(
    filtered.reduce<Record<string, Category[]>>((acc, c) => {
      acc[c.type] = acc[c.type] ?? []
      acc[c.type].push(c)
      return acc
    }, {})
  )

  function handleSelect(cat: Category): void {
    onSelect(cat.id, cat.type === 'transfer')
    setOpen(false)
  }

  function handleMarkTransfer(): void {
    onSelect(null, true)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors',
          isTransfer
            ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            : value
              ? 'hover:opacity-80'
              : 'border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary',
          disabled && 'pointer-events-none opacity-50',
        )}
        style={value && !isTransfer ? { backgroundColor: `${value.color ?? '#94a3b8'}20`, color: value.color ?? '#94a3b8' } : undefined}
      >
        {isTransfer ? (
          <><ArrowLeftRight size={10} /> Umbuchung</>
        ) : value ? (
          value.name
        ) : (
          'Kategorie wählen'
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          {/* Search input */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search size={12} className="shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Kategorie suchen..."
              className="flex-1 bg-transparent text-sm focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false)
                if (e.key === 'Enter' && filtered.length === 1) handleSelect(filtered[0])
              }}
            />
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {/* Transfer option */}
            <button
              onClick={handleMarkTransfer}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent',
                isTransfer && 'bg-accent/50',
              )}
            >
              <ArrowLeftRight size={12} className="shrink-0 text-slate-400" />
              <span>Als Umbuchung markieren</span>
            </button>

            <div className="my-1 border-t border-border/50" />

            {grouped.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">Keine Kategorien gefunden</p>
            )}

            {grouped.map(([type, cats]) => (
              <div key={type}>
                <p className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {TYPE_LABELS[type] ?? type}
                </p>
                {cats.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => handleSelect(cat)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent',
                      value?.id === cat.id && 'bg-accent/50',
                    )}
                  >
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: cat.color ?? '#94a3b8' }} />
                    {cat.name}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
