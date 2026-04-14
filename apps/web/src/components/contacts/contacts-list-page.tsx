'use client'

import * as React from 'react'
import Link from 'next/link'
import { useDebounce } from 'use-debounce'
import { Filter, SlidersHorizontal, Plus, Columns3 } from 'lucide-react'
import type { inferRouterInputs } from '@trpc/server'
import type { AppRouter } from '@/server/routers/_app'
import { trpc } from '@/lib/trpc/provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/utils'
import { ContactFormSheet } from '@/components/contacts/contact-form-sheet'

type ContactsListInput = inferRouterInputs<AppRouter>['contacts']['list']

function initials(first: string, last?: string | null): string {
  const a = first.charAt(0).toUpperCase()
  const b = last?.charAt(0).toUpperCase() ?? ''
  return (a + b).slice(0, 2)
}

export function ContactsListPage(): React.JSX.Element {
  const [search, setSearch] = React.useState('')
  const [debouncedSearch] = useDebounce(search, 300)
  const [sort, setSort] = React.useState<ContactsListInput['sort']>('created_at')
  const [order, setOrder] = React.useState<ContactsListInput['order']>('desc')
  const [companyFilter, setCompanyFilter] = React.useState<string | undefined>(undefined)
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [columns, setColumns] = React.useState({
    name: true,
    email: true,
    phone: true,
    company: true,
    created: true,
  })

  const listInput = React.useMemo(
    (): ContactsListInput => ({
      limit: 50,
      search: debouncedSearch.trim() || undefined,
      company_id: companyFilter,
      sort,
      order,
    }),
    [debouncedSearch, companyFilter, sort, order],
  )

  const listQuery = trpc.contacts.list.useInfiniteQuery(listInput, {
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })

  const companiesForFilter = trpc.companies.list.useInfiniteQuery(
    { limit: 80, sort: 'name', order: 'asc' },
    { getNextPageParam: (last) => last.nextCursor },
  )
  const companyOptions = React.useMemo(
    () => companiesForFilter.data?.pages.flatMap((p) => p.items) ?? [],
    [companiesForFilter.data?.pages],
  )

  const rows = React.useMemo(
    () => listQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [listQuery.data?.pages],
  )

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 px-6 py-4">
        <div>
          <h1 className="text-[15px] font-semibold text-foreground">Personen</h1>
          <p className="text-[12px] text-muted-foreground">Kontakte in deinem Arbeitsbereich</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Neuer Kontakt
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-6 py-2.5">
        <Input
          placeholder="Name suchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Button variant="outline" size="sm" onClick={() => setFilterOpen(true)}>
          <Filter className="size-4" />
          Filter
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <SlidersHorizontal className="size-4" />
              Sort
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel>Sortieren nach</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={sort === 'name'}
              onCheckedChange={() => setSort('name')}
            >
              Name
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={sort === 'created_at'}
              onCheckedChange={() => setSort('created_at')}
            >
              Erstellt
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={sort === 'updated_at'}
              onCheckedChange={() => setSort('updated_at')}
            >
              Aktualisiert
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={order === 'asc'}
              onCheckedChange={() => setOrder('asc')}
            >
              Aufsteigend
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={order === 'desc'}
              onCheckedChange={() => setOrder('desc')}
            >
              Absteigend
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3 className="size-4" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Sichtbare Spalten</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(Object.keys(columns) as (keyof typeof columns)[]).map((key) => (
              <DropdownMenuCheckboxItem
                key={key}
                checked={columns[key]}
                onCheckedChange={(c) => setColumns((prev) => ({ ...prev, [key]: Boolean(c) }))}
              >
                {key === 'created' ? 'Erstellt am' : key === 'name' ? 'Name' : key === 'email' ? 'E-Mail' : key === 'phone' ? 'Telefon' : key === 'company' ? 'Unternehmen' : key}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {listQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
            <p className="text-sm font-medium text-foreground">Noch keine Kontakte</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Erstelle einen Kontakt oder passe die Filter an.
            </p>
            <Button className="mt-4" onClick={() => setCreateOpen(true)}>
              Neuer Kontakt
            </Button>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  {columns.name ? <TableHead>Name</TableHead> : null}
                  {columns.email ? <TableHead>Email</TableHead> : null}
                  {columns.phone ? <TableHead>Phone</TableHead> : null}
                  {columns.company ? <TableHead>Company</TableHead> : null}
                  {columns.created ? <TableHead>Created</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const name = [row.first_name, row.last_name].filter(Boolean).join(' ')
                  return (
                    <TableRow key={row.id} className="cursor-pointer">
                      <TableCell className="w-10">
                        <Link href={`/contacts/${row.id}`} className="flex items-center">
                          <Avatar className="size-8">
                            <AvatarImage src={row.avatar_url ?? undefined} alt="" />
                            <AvatarFallback className="text-xs">
                              {initials(row.first_name, row.last_name)}
                            </AvatarFallback>
                          </Avatar>
                        </Link>
                      </TableCell>
                      {columns.name ? (
                        <TableCell>
                          <Link href={`/contacts/${row.id}`} className="font-medium hover:underline">
                            {name}
                          </Link>
                        </TableCell>
                      ) : null}
                      {columns.email ? (
                        <TableCell className="max-w-[200px] truncate text-muted-foreground">
                          <Link href={`/contacts/${row.id}`}>{row.email[0] ?? '—'}</Link>
                        </TableCell>
                      ) : null}
                      {columns.phone ? (
                        <TableCell className="text-muted-foreground">
                          <Link href={`/contacts/${row.id}`}>{row.phone[0] ?? '—'}</Link>
                        </TableCell>
                      ) : null}
                      {columns.company ? (
                        <TableCell>
                          {row.company ? (
                            <Link
                              href={`/companies/${row.company.id}`}
                              className="text-muted-foreground hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {row.company.name}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      ) : null}
                      {columns.created ? (
                        <TableCell className="text-muted-foreground">
                          <Link href={`/contacts/${row.id}`}>{formatDate(row.created_at)}</Link>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            {listQuery.hasNextPage ? (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  disabled={listQuery.isFetchingNextPage}
                  onClick={() => listQuery.fetchNextPage()}
                >
                  {listQuery.isFetchingNextPage ? 'Laden…' : 'Mehr laden'}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Filter</SheetTitle>
            <SheetDescription>Kontakte nach Unternehmen filtern.</SheetDescription>
          </SheetHeader>
          <div className="grid gap-4 py-6">
            <div className="grid gap-2">
              <span className="text-sm font-medium">Unternehmen</span>
              <Select
                value={companyFilter ?? 'all'}
                onValueChange={(v) => setCompanyFilter(v === 'all' ? undefined : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Alle Unternehmen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Unternehmen</SelectItem>
                  {companyOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {companiesForFilter.hasNextPage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="self-start px-0"
                  onClick={() => companiesForFilter.fetchNextPage()}
                >
                  Mehr laden
                </Button>
              ) : null}
            </div>
          </div>
          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCompanyFilter(undefined)
              }}
            >
              Zurücksetzen
            </Button>
            <Button onClick={() => setFilterOpen(false)}>Fertig</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ContactFormSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        contactsListInput={listInput}
      />
    </main>
  )
}
