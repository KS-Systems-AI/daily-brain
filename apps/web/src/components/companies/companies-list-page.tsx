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
import { Label } from '@/components/ui/label'
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
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/utils'
import { CompanyFormSheet } from '@/components/companies/company-form-sheet'

type CompaniesListInput = inferRouterInputs<AppRouter>['companies']['list']

const SIZE_OPTIONS = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'] as const

export function CompaniesListPage(): React.JSX.Element {
  const [search, setSearch] = React.useState('')
  const [debouncedSearch] = useDebounce(search, 300)
  const [sort, setSort] = React.useState<CompaniesListInput['sort']>('created_at')
  const [order, setOrder] = React.useState<CompaniesListInput['order']>('desc')
  const [industryFilter, setIndustryFilter] = React.useState('')
  const [debouncedIndustry] = useDebounce(industryFilter, 300)
  const [sizeFilter, setSizeFilter] = React.useState<string | undefined>(undefined)
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [columns, setColumns] = React.useState({
    name: true,
    domain: true,
    industry: true,
    size: true,
    contacts: true,
    created: true,
  })

  const listInput = React.useMemo(
    (): CompaniesListInput => ({
      limit: 50,
      search: debouncedSearch.trim() || undefined,
      industry: debouncedIndustry.trim() || undefined,
      size: sizeFilter,
      sort,
      order,
    }),
    [debouncedSearch, debouncedIndustry, sizeFilter, sort, order],
  )

  const listQuery = trpc.companies.list.useInfiniteQuery(listInput, {
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })

  const rows = React.useMemo(
    () => listQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [listQuery.data?.pages],
  )

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 px-6 py-4">
        <div>
          <h1 className="text-[15px] font-semibold text-foreground">Unternehmen</h1>
          <p className="text-[12px] text-muted-foreground">Organisationen in deinem Arbeitsbereich</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Neues Unternehmen
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-6 py-2.5">
        <Input
          placeholder="Name oder Domain suchen…"
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
                {key === 'created'
                  ? 'Erstellt am'
                  : key === 'contacts'
                    ? 'Kontakte'
                    : key === 'name' ? 'Name' : key === 'domain' ? 'Domain' : key === 'industry' ? 'Branche' : key === 'size' ? 'Größe' : key}
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
            <p className="text-sm font-medium text-foreground">Noch keine Unternehmen</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Erstelle ein Unternehmen oder passe die Filter an.
            </p>
            <Button className="mt-4" onClick={() => setCreateOpen(true)}>
              Neues Unternehmen
            </Button>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.name ? <TableHead>Name</TableHead> : null}
                  {columns.domain ? <TableHead>Domain</TableHead> : null}
                  {columns.industry ? <TableHead>Industry</TableHead> : null}
                  {columns.size ? <TableHead>Size</TableHead> : null}
                  {columns.contacts ? <TableHead>Contacts</TableHead> : null}
                  {columns.created ? <TableHead>Created</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className="cursor-pointer">
                    {columns.name ? (
                      <TableCell>
                        <Link href={`/companies/${row.id}`} className="font-medium hover:underline">
                          {row.name}
                        </Link>
                      </TableCell>
                    ) : null}
                    {columns.domain ? (
                      <TableCell className="text-muted-foreground">
                        <Link href={`/companies/${row.id}`}>{row.domain ?? '—'}</Link>
                      </TableCell>
                    ) : null}
                    {columns.industry ? (
                      <TableCell className="text-muted-foreground">
                        <Link href={`/companies/${row.id}`}>{row.industry ?? '—'}</Link>
                      </TableCell>
                    ) : null}
                    {columns.size ? (
                      <TableCell className="text-muted-foreground">
                        <Link href={`/companies/${row.id}`}>{row.size ?? '—'}</Link>
                      </TableCell>
                    ) : null}
                    {columns.contacts ? (
                      <TableCell className="text-muted-foreground">
                        <Link href={`/companies/${row.id}`}>{row._count.contacts}</Link>
                      </TableCell>
                    ) : null}
                    {columns.created ? (
                      <TableCell className="text-muted-foreground">
                        <Link href={`/companies/${row.id}`}>{formatDate(row.created_at)}</Link>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
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
            <SheetDescription>Unternehmensliste verfeinern.</SheetDescription>
          </SheetHeader>
          <div className="grid gap-6 py-6">
            <div className="grid gap-2">
              <Label htmlFor="flt-industry">Branche enthält</Label>
              <Input
                id="flt-industry"
                value={industryFilter}
                onChange={(e) => setIndustryFilter(e.target.value)}
                placeholder="z.B. Software"
              />
            </div>
            <div className="grid gap-2">
              <Label>Größe</Label>
              <Select
                value={sizeFilter ?? 'all'}
                onValueChange={(v) => setSizeFilter(v === 'all' ? undefined : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Alle Größen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Größen</SelectItem>
                  {SIZE_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIndustryFilter('')
                setSizeFilter(undefined)
              }}
            >
              Zurücksetzen
            </Button>
            <Button onClick={() => setFilterOpen(false)}>Fertig</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <CompanyFormSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        companiesListInput={listInput}
      />
    </main>
  )
}
