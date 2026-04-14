'use client'

import * as React from 'react'
import { z } from 'zod'
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

type ContactsListInput = inferRouterInputs<AppRouter>['contacts']['list']
type ContactDetail = inferRouterOutputs<AppRouter>['contacts']['getById']
type ContactListItem = inferRouterOutputs<AppRouter>['contacts']['list']['items'][number]

function parseList(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

const emailListSchema = z.array(z.string().email())

type ContactFormSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  contact?: ContactDetail | ContactListItem | null
  contactsListInput?: ContactsListInput
  onSaved?: (contact: ContactDetail | ContactListItem) => void
}

export function ContactFormSheet({
  open,
  onOpenChange,
  mode,
  contact,
  contactsListInput,
  onSaved,
}: ContactFormSheetProps): React.JSX.Element {
  const { toast } = useToast()
  const utils = trpc.useUtils()
  const [firstName, setFirstName] = React.useState('')
  const [lastName, setLastName] = React.useState('')
  const [emailRaw, setEmailRaw] = React.useState('')
  const [phoneRaw, setPhoneRaw] = React.useState('')
  const [companyId, setCompanyId] = React.useState<string | undefined>(undefined)

  const companiesQuery = trpc.companies.list.useInfiniteQuery(
    { limit: 80, sort: 'name', order: 'asc' },
    { getNextPageParam: (last) => last.nextCursor, enabled: open },
  )
  const companies = React.useMemo(
    () => companiesQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [companiesQuery.data?.pages],
  )

  React.useEffect(() => {
    if (!open) return
    if (mode === 'edit' && contact) {
      setFirstName(contact.first_name)
      setLastName(contact.last_name ?? '')
      setEmailRaw(contact.email.join(', '))
      setPhoneRaw(contact.phone.join(', '))
      setCompanyId(contact.company_id ?? undefined)
    } else {
      setFirstName('')
      setLastName('')
      setEmailRaw('')
      setPhoneRaw('')
      setCompanyId(undefined)
    }
  }, [open, mode, contact])

  const createMutation = trpc.contacts.create.useMutation({
    onMutate: async (variables) => {
      if (!contactsListInput) return {}
      await utils.contacts.list.cancel(contactsListInput)
      const previous = utils.contacts.list.getInfiniteData(contactsListInput)
      const template = previous?.pages[0]?.items[0]
      let optimisticId: string | undefined
      if (template) {
        optimisticId = crypto.randomUUID()
        const linked =
          variables.company_id ? companies.find((c) => c.id === variables.company_id) : null
        const optimisticItem: ContactListItem = {
          ...template,
          id: optimisticId,
          first_name: variables.first_name,
          last_name: variables.last_name ?? null,
          email: variables.email ?? [],
          phone: variables.phone ?? [],
          company_id: variables.company_id ?? null,
          company: linked ? { id: linked.id, name: linked.name } : null,
          created_at: new Date(),
          updated_at: new Date(),
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(utils.contacts.list as any).setInfiniteData(
          contactsListInput,
          (old: unknown) => {
            const o = old as { pages: { items: ContactListItem[]; nextCursor: string | undefined; hasMore: boolean }[]; pageParams: unknown[] }
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
      if (contactsListInput && ctx && 'previous' in ctx && ctx.previous) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(utils.contacts.list as any).setInfiniteData(contactsListInput, ctx.previous)
      }
      toast({ title: 'Kontakt konnte nicht erstellt werden', description: err.message, variant: 'destructive' })
    },
    onSuccess: (data, _vars, ctx) => {
      if (
        contactsListInput &&
        ctx &&
        'optimisticId' in ctx &&
        ctx.optimisticId
      ) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(utils.contacts.list as any).setInfiniteData(
          contactsListInput,
          (old: unknown) => {
            const o = old as { pages: { items: ContactListItem[]; nextCursor: string | undefined; hasMore: boolean }[]; pageParams: unknown[] }
            if (!o.pages[0]) return old
            const pages = o.pages.map((page) => ({
              ...page,
              items: page.items.map((item) => (item.id === ctx.optimisticId ? (data as ContactListItem) : item)),
            }))
            return { ...o, pages }
          },
        )
      } else {
        void utils.contacts.list.invalidate()
      }
      utils.contacts.getById.setData({ id: data.id }, data as ContactDetail)
      toast({ title: 'Kontakt erstellt', variant: 'success' })
      onSaved?.(data)
      onOpenChange(false)
    },
  })

  const updateMutation = trpc.contacts.update.useMutation({
    onMutate: async ({ id, data: patch }) => {
      await utils.contacts.getById.cancel({ id })
      if (contactsListInput) await utils.contacts.list.cancel(contactsListInput)

      const previousDetail = utils.contacts.getById.getData({ id })
      const previousLists = contactsListInput
        ? utils.contacts.list.getInfiniteData(contactsListInput)
        : undefined

      const linkedCompany =
        patch.company_id !== undefined
          ? patch.company_id
            ? companies.find((c) => c.id === patch.company_id)
            : null
          : undefined

      if (previousDetail) {
        utils.contacts.getById.setData({ id }, {
          ...previousDetail,
          ...patch,
          last_name: patch.last_name !== undefined ? patch.last_name ?? null : previousDetail.last_name,
          email: patch.email ?? previousDetail.email,
          phone: patch.phone ?? previousDetail.phone,
          company_id:
            patch.company_id !== undefined ? patch.company_id ?? null : previousDetail.company_id,
          company:
            linkedCompany !== undefined
              ? linkedCompany
                ? {
                    id: linkedCompany.id,
                    name: linkedCompany.name,
                    domain: linkedCompany.domain ?? null,
                  }
                : null
              : previousDetail.company,
          attrs: (patch.attrs ?? previousDetail.attrs) as ContactDetail['attrs'],
        } as ContactDetail)
      }

      if (contactsListInput) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(utils.contacts.list as any).setInfiniteData(
          contactsListInput,
          (old: unknown) => {
            const o = old as { pages: { items: ContactListItem[]; nextCursor: string | undefined; hasMore: boolean }[]; pageParams: unknown[] }
            return {
              ...o,
              pages: o.pages.map((page) => ({
                ...page,
                items: page.items.map((row) => {
                  if (row.id !== id) return row
                  const nextCompany =
                    linkedCompany !== undefined
                      ? linkedCompany
                        ? { id: linkedCompany.id, name: linkedCompany.name }
                        : null
                      : row.company
                  return {
                    ...row,
                    ...patch,
                    last_name: patch.last_name !== undefined ? patch.last_name ?? null : row.last_name,
                    email: patch.email ?? row.email,
                    phone: patch.phone ?? row.phone,
                    company_id:
                      patch.company_id !== undefined ? patch.company_id ?? null : row.company_id,
                    company: nextCompany,
                  } as ContactListItem
                }),
              })),
            }
          },
        )
      }

      return { previousDetail, previousLists }
    },
    onError: (err, { id }, ctx) => {
      if (ctx?.previousDetail) utils.contacts.getById.setData({ id }, ctx.previousDetail)
      if (contactsListInput && ctx?.previousLists) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(utils.contacts.list as any).setInfiniteData(contactsListInput, ctx.previousLists)
      }
      toast({ title: 'Kontakt konnte nicht gespeichert werden', description: err.message, variant: 'destructive' })
    },
    onSuccess: (data) => {
      utils.contacts.getById.setData({ id: data.id }, data as ContactDetail)
      if (contactsListInput) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(utils.contacts.list as any).setInfiniteData(
          contactsListInput,
          (old: unknown) => {
            const o = old as { pages: { items: ContactListItem[]; nextCursor: string | undefined; hasMore: boolean }[]; pageParams: unknown[] }
            return {
              ...o,
              pages: o.pages.map((page) => ({
                ...page,
                items: page.items.map((row) =>
                  row.id === data.id ? (data as ContactListItem) : row,
                ),
              })),
            }
          },
        )
      }
      toast({ title: 'Kontakt aktualisiert', variant: 'success' })
      onSaved?.(data)
      onOpenChange(false)
    },
  })

  const submitting = createMutation.isPending || updateMutation.isPending

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault()
    const emails = parseList(emailRaw)
    const parsed = emailListSchema.safeParse(emails)
    if (!parsed.success) {
      toast({
        title: 'Ungültige E-Mail',
        description: 'Bitte gültige Adressen eingeben, durch Komma getrennt.',
        variant: 'destructive',
      })
      return
    }
    const phones = parseList(phoneRaw)
    const payload = {
      first_name: firstName.trim(),
      last_name: lastName.trim() || undefined,
      email: parsed.data,
      phone: phones,
      company_id: companyId,
      attrs: {},
    }

    if (mode === 'create') {
      createMutation.mutate(payload)
    } else if (contact) {
      updateMutation.mutate({ id: contact.id, data: payload })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Neuer Kontakt' : 'Kontakt bearbeiten'}</DialogTitle>
          <DialogDescription>
            {mode === 'create' ? 'Füge eine Person zu deinem Workspace hinzu.' : 'Felder bearbeiten und speichern.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="cf-first">Vorname</Label>
            <Input
              id="cf-first"
              value={firstName}
              onChange={(ev) => setFirstName(ev.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cf-last">Nachname</Label>
            <Input id="cf-last" value={lastName} onChange={(ev) => setLastName(ev.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cf-email">E-Mails</Label>
            <Input
              id="cf-email"
              placeholder="a@b.com, c@d.com"
              value={emailRaw}
              onChange={(ev) => setEmailRaw(ev.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cf-phone">Telefon</Label>
            <Input
              id="cf-phone"
              placeholder="+49 …, durch Komma getrennt"
              value={phoneRaw}
              onChange={(ev) => setPhoneRaw(ev.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Unternehmen</Label>
            <Select
              value={companyId ?? 'none'}
              onValueChange={(v) => setCompanyId(v === 'none' ? undefined : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Keins" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Keins</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {companiesQuery.hasNextPage ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start px-0"
                onClick={() => companiesQuery.fetchNextPage()}
              >
                Mehr laden
              </Button>
            ) : null}
          </div>

          <DialogFooter className="mt-2 flex-row gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={submitting || !firstName.trim()}>
              {submitting ? 'Wird gespeichert…' : mode === 'create' ? 'Erstellen' : 'Speichern'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
