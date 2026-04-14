'use client'

import * as React from 'react'
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@/server/routers/_app'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { trpc } from '@/lib/trpc/provider'
import { useToast } from '@/hooks/use-toast'

const SIZE_OPTIONS = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'] as const

type CompaniesListInput = inferRouterInputs<AppRouter>['companies']['list']
type CompanyDetail = inferRouterOutputs<AppRouter>['companies']['getById']
type CompanyListItem = inferRouterOutputs<AppRouter>['companies']['list']['items'][number]

type CompanyFormSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  company?: CompanyDetail | CompanyListItem | null
  companiesListInput?: CompaniesListInput
  onSaved?: (company: CompanyDetail | CompanyListItem) => void
}

export function CompanyFormSheet({
  open,
  onOpenChange,
  mode,
  company,
  companiesListInput,
  onSaved,
}: CompanyFormSheetProps): React.JSX.Element {
  const { toast } = useToast()
  const utils = trpc.useUtils()
  const [name, setName] = React.useState('')
  const [domain, setDomain] = React.useState('')
  const [industry, setIndustry] = React.useState('')
  const [size, setSize] = React.useState<string | undefined>(undefined)

  React.useEffect(() => {
    if (!open) return
    if (mode === 'edit' && company) {
      setName(company.name)
      setDomain(company.domain ?? '')
      setIndustry(company.industry ?? '')
      setSize(company.size ?? undefined)
    } else {
      setName('')
      setDomain('')
      setIndustry('')
      setSize(undefined)
    }
  }, [open, mode, company])

  const createMutation = trpc.companies.create.useMutation({
    onMutate: async (variables) => {
      if (!companiesListInput) return {}
      await utils.companies.list.cancel(companiesListInput)
      const previous = utils.companies.list.getInfiniteData(companiesListInput)
      const template = previous?.pages[0]?.items[0]
      let optimisticId: string | undefined
      if (template) {
        optimisticId = crypto.randomUUID()
        const optimisticItem: CompanyListItem = {
          ...template,
          id: optimisticId,
          name: variables.name,
          domain: variables.domain ?? null,
          industry: variables.industry ?? null,
          size: variables.size ?? null,
          logo_url: null,
          attrs: template.attrs,
          created_at: new Date(),
          updated_at: new Date(),
          _count: { contacts: 0 },
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(utils.companies.list as any).setInfiniteData(
          companiesListInput,
          (old: unknown) => {
            const o = old as {
              pages: { items: CompanyListItem[]; nextCursor: string | undefined; hasMore: boolean }[]
              pageParams: unknown[]
            }
            if (!o.pages[0]) return old
            const p0 = o.pages[0]
            const pages = [...o.pages]
            pages[0] = {
              items: [optimisticItem, ...p0.items],
              nextCursor: p0.nextCursor,
              hasMore: p0.hasMore,
            }
            return { ...o, pages }
          },
        )
      }
      return { previous, optimisticId }
    },
    onError: (err, _vars, ctx) => {
      if (companiesListInput && ctx && 'previous' in ctx && ctx.previous) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(utils.companies.list as any).setInfiniteData(companiesListInput, ctx.previous)
      }
      toast({ title: 'Unternehmen konnte nicht erstellt werden', description: err.message, variant: 'destructive' })
    },
    onSuccess: (data, _vars, ctx) => {
      if (
        companiesListInput &&
        ctx &&
        'optimisticId' in ctx &&
        ctx.optimisticId
      ) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(utils.companies.list as any).setInfiniteData(
          companiesListInput,
          (old: unknown) => {
            const o = old as {
              pages: { items: CompanyListItem[]; nextCursor: string | undefined; hasMore: boolean }[]
              pageParams: unknown[]
            }
            if (!o.pages[0]) return old
            const pages = o.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item.id === ctx.optimisticId ? (data as CompanyListItem) : item,
              ),
            }))
            return { ...o, pages }
          },
        )
      } else {
        void utils.companies.list.invalidate()
      }
      utils.companies.getById.setData({ id: data.id }, data as CompanyDetail)
      toast({ title: 'Unternehmen erstellt', variant: 'success' })
      onSaved?.(data)
      onOpenChange(false)
    },
  })

  const updateMutation = trpc.companies.update.useMutation({
    onMutate: async ({ id, data: patch }) => {
      await utils.companies.getById.cancel({ id })
      if (companiesListInput) await utils.companies.list.cancel(companiesListInput)

      const previousDetail = utils.companies.getById.getData({ id })
      const previousLists = companiesListInput
        ? utils.companies.list.getInfiniteData(companiesListInput)
        : undefined

      if (previousDetail) {
        utils.companies.getById.setData(
          { id },
          {
            ...previousDetail,
            ...patch,
            name: patch.name ?? previousDetail.name,
            domain: patch.domain !== undefined ? patch.domain ?? null : previousDetail.domain,
            industry: patch.industry !== undefined ? patch.industry ?? null : previousDetail.industry,
            size: patch.size !== undefined ? patch.size ?? null : previousDetail.size,
            attrs: (patch.attrs ?? previousDetail.attrs) as CompanyDetail['attrs'],
          } as CompanyDetail,
        )
      }

      if (companiesListInput) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(utils.companies.list as any).setInfiniteData(
          companiesListInput,
          (old: unknown) => {
            const o = old as {
              pages: { items: CompanyListItem[]; nextCursor: string | undefined; hasMore: boolean }[]
              pageParams: unknown[]
            }
            return {
              ...o,
              pages: o.pages.map((page) => ({
                ...page,
                items: page.items.map((row) => {
                  if (row.id !== id) return row
                  return {
                    ...row,
                    ...patch,
                    name: patch.name ?? row.name,
                    domain: patch.domain !== undefined ? patch.domain ?? null : row.domain,
                    industry: patch.industry !== undefined ? patch.industry ?? null : row.industry,
                    size: patch.size !== undefined ? patch.size ?? null : row.size,
                  } as CompanyListItem
                }),
              })),
            }
          },
        )
      }

      return { previousDetail, previousLists }
    },
    onError: (err, { id }, ctx) => {
      if (ctx?.previousDetail) utils.companies.getById.setData({ id }, ctx.previousDetail)
      if (companiesListInput && ctx?.previousLists) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(utils.companies.list as any).setInfiniteData(companiesListInput, ctx.previousLists)
      }
      toast({ title: 'Unternehmen konnte nicht gespeichert werden', description: err.message, variant: 'destructive' })
    },
    onSuccess: (data) => {
      utils.companies.getById.setData({ id: data.id }, data as CompanyDetail)
      if (companiesListInput) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(utils.companies.list as any).setInfiniteData(
          companiesListInput,
          (old: unknown) => {
            const o = old as {
              pages: { items: CompanyListItem[]; nextCursor: string | undefined; hasMore: boolean }[]
              pageParams: unknown[]
            }
            return {
              ...o,
              pages: o.pages.map((page) => ({
                ...page,
                items: page.items.map((row) =>
                  row.id === data.id ? (data as CompanyListItem) : row,
                ),
              })),
            }
          },
        )
      }
      toast({ title: 'Unternehmen aktualisiert', variant: 'success' })
      onSaved?.(data)
      onOpenChange(false)
    },
  })

  const submitting = createMutation.isPending || updateMutation.isPending

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault()
    const payload = {
      name: name.trim(),
      domain: domain.trim() || undefined,
      industry: industry.trim() || undefined,
      size: size as (typeof SIZE_OPTIONS)[number] | undefined,
      attrs: {},
    }

    if (mode === 'create') {
      createMutation.mutate(payload)
    } else if (company) {
      updateMutation.mutate({ id: company.id, data: payload })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Neues Unternehmen' : 'Unternehmen bearbeiten'}</DialogTitle>
          <DialogDescription>
            {mode === 'create' ? 'Füge eine Organisation hinzu.' : 'Felder bearbeiten und speichern.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="co-name">Name</Label>
            <Input
              id="co-name"
              value={name}
              onChange={(ev) => setName(ev.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="co-domain">Domain</Label>
            <Input
              id="co-domain"
              placeholder="beispiel.de"
              value={domain}
              onChange={(ev) => setDomain(ev.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="co-industry">Branche</Label>
            <Input
              id="co-industry"
              value={industry}
              onChange={(ev) => setIndustry(ev.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Unternehmensgröße</Label>
            <Select value={size ?? 'none'} onValueChange={(v) => setSize(v === 'none' ? undefined : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Nicht angegeben" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nicht angegeben</SelectItem>
                {SIZE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s} Mitarbeiter
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="mt-2 flex-row gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? 'Wird gespeichert…' : mode === 'create' ? 'Erstellen' : 'Speichern'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
