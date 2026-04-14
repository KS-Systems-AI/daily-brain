'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { trpc } from '@/lib/trpc/provider'
import { Building2, User, X, Search, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type RecordType = 'contact' | 'company'

export interface SelectedRecord {
  id: string
  type: RecordType
  label: string
}

interface RecordSelectorProps {
  value: SelectedRecord | null
  onChange: (record: SelectedRecord | null) => void
  placeholder?: string
  className?: string
}

export function RecordSelector({ value, onChange, placeholder = 'Person oder Firma...', className }: RecordSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: contactsData } = trpc.contacts.list.useQuery(
    { search: search || undefined, limit: 8 },
    { enabled: open },
  )
  const { data: companiesData } = trpc.companies.list.useQuery(
    { search: search || undefined, limit: 8 },
    { enabled: open },
  )

  const contacts = contactsData?.items ?? []
  const companies = companiesData?.items ?? []

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleOpen = useCallback(() => {
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [])

  const handleSelect = useCallback((record: SelectedRecord) => {
    onChange(record)
    setOpen(false)
    setSearch('')
  }, [onChange])

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(null)
  }, [onChange])

  const hasResults = contacts.length > 0 || companies.length > 0

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={value ? undefined : handleOpen}
        className={cn(
          'flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors',
          !value && 'hover:border-ring/40 cursor-pointer',
          value && 'cursor-default',
        )}
      >
        {value ? (
          <>
            {value.type === 'contact'
              ? <User size={14} className="shrink-0 text-blue-500" />
              : <Building2 size={14} className="shrink-0 text-orange-500" />
            }
            <span className="flex-1 text-left text-[13px] text-foreground">{value.label}</span>
            <button
              type="button"
              onClick={handleClear}
              className="ml-auto rounded p-0.5 text-muted-foreground/50 hover:text-muted-foreground"
            >
              <X size={12} />
            </button>
          </>
        ) : (
          <>
            <Search size={14} className="shrink-0 text-muted-foreground/40" />
            <span className="flex-1 text-left text-[13px] text-muted-foreground/50">{placeholder}</span>
            <ChevronDown size={14} className="shrink-0 text-muted-foreground/30" />
          </>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[240px] rounded-lg border border-border bg-popover shadow-lg">
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-center gap-2">
              <Search size={13} className="shrink-0 text-muted-foreground/50" />
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Suchen..."
                className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/40"
              />
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto py-1">
            {!hasResults && (
              <p className="px-3 py-4 text-center text-[12px] text-muted-foreground/50">
                {search ? 'Keine Ergebnisse' : 'Tippe um zu suchen...'}
              </p>
            )}

            {contacts.length > 0 && (
              <>
                <div className="px-3 pb-1 pt-2">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">Personen</span>
                </div>
                {contacts.map((c) => {
                  const label = [c.first_name, c.last_name].filter(Boolean).join(' ')
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelect({ id: c.id, type: 'contact', label })}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-foreground hover:bg-muted"
                    >
                      <User size={13} className="shrink-0 text-blue-500" />
                      <span className="flex-1 truncate text-left">{label}</span>
                      {c.company?.name && (
                        <span className="truncate text-[11px] text-muted-foreground/60">{c.company.name}</span>
                      )}
                    </button>
                  )
                })}
              </>
            )}

            {companies.length > 0 && (
              <>
                <div className="px-3 pb-1 pt-2">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">Firmen</span>
                </div>
                {companies.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelect({ id: c.id, type: 'company', label: c.name })}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-foreground hover:bg-muted"
                  >
                    <Building2 size={13} className="shrink-0 text-orange-500" />
                    <span className="flex-1 truncate text-left">{c.name}</span>
                    {c.domain && (
                      <span className="truncate text-[11px] text-muted-foreground/60">{c.domain}</span>
                    )}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
