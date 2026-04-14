'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { trpc } from '@/lib/trpc/provider'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { formatDate, formatRelativeDate } from '@/lib/utils'
import { ContactFormSheet } from '@/components/contacts/contact-form-sheet'
import { useToast } from '@/hooks/use-toast'

function initials(first: string, last?: string | null): string {
  const a = first.charAt(0).toUpperCase()
  const b = last?.charAt(0).toUpperCase() ?? ''
  return (a + b).slice(0, 2)
}

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
}

export function ContactDetailView({ contactId }: { contactId: string }): React.JSX.Element {
  const router = useRouter()
  const { toast } = useToast()
  const utils = trpc.useUtils()
  const [editOpen, setEditOpen] = React.useState(false)
  const validId = isUuid(contactId)

  const query = trpc.contacts.getById.useQuery(
    { id: contactId },
    { enabled: validId },
  )

  const notesQuery = trpc.contacts.getNotes.useInfiniteQuery(
    { contactId },
    { enabled: validId && Boolean(query.data), getNextPageParam: (last) => last.nextCursor },
  )
  const activitiesQuery = trpc.contacts.getActivities.useInfiniteQuery(
    { contactId },
    { enabled: validId && Boolean(query.data), getNextPageParam: (last) => last.nextCursor },
  )

  const tasksQuery = trpc.contacts.getTasks.useQuery(
    { contactId, includeCompleted: false },
    { enabled: validId && Boolean(query.data) },
  )

  const timeline = React.useMemo(() => {
    const notes =
      notesQuery.data?.pages.flatMap((p) =>
        p.items.map((n) => ({
          sort: new Date(n.created_at).getTime(),
          kind: 'note' as const,
          id: n.id,
          title: n.title,
          body: n.content_text,
          created_at: n.created_at,
          author: n.author,
          pinned: n.is_pinned,
        })),
      ) ?? []
    const activities =
      activitiesQuery.data?.pages.flatMap((p) =>
        p.items.map((a) => ({
          sort: new Date(a.created_at).getTime(),
          kind: 'activity' as const,
          id: a.id,
          type: a.type,
          data: a.data,
          created_at: a.created_at,
          actor: a.actor,
        })),
      ) ?? []
    return [...notes, ...activities].sort((a, b) => b.sort - a.sort)
  }, [notesQuery.data?.pages, activitiesQuery.data?.pages])

  const completeTask = trpc.contacts.completeTask.useMutation({
    onMutate: async ({ taskId, completed }) => {
      await utils.contacts.getTasks.cancel({ contactId, includeCompleted: false })
      const previous = utils.contacts.getTasks.getData({ contactId, includeCompleted: false })
      utils.contacts.getTasks.setData({ contactId, includeCompleted: false }, (old) => {
        if (!old) return old
        if (completed) return old.filter((t) => t.id !== taskId)
        return old.map((t) =>
          t.id === taskId ? { ...t, completed_at: null } : t,
        )
      })
      return { previous }
    },
    onError: (err, vars, ctx) => {
      if (ctx?.previous) {
        utils.contacts.getTasks.setData({ contactId, includeCompleted: false }, ctx.previous)
      }
      toast({ title: 'Aktualisierung fehlgeschlagen', description: err.message, variant: 'destructive' })
    },
    onSettled: () => {
      void utils.contacts.getTasks.invalidate({ contactId, includeCompleted: false })
      void utils.contacts.getTasks.invalidate({ contactId, includeCompleted: true })
    },
  })

  const deleteMutation = trpc.contacts.delete.useMutation({
    onSuccess: () => {
      void utils.contacts.list.invalidate()
      toast({ title: 'Kontakt gelöscht', variant: 'success' })
      router.push('/contacts')
    },
    onError: (err) => {
      toast({ title: 'Löschen fehlgeschlagen', description: err.message, variant: 'destructive' })
    },
  })

  if (!validId) {
    return (
      <main className="flex flex-1 flex-col px-8 py-6">
        <p className="text-sm text-muted-foreground">Invalid contact id.</p>
        <Button asChild className="mt-4 w-fit" variant="outline">
          <Link href="/contacts">Back to contacts</Link>
        </Button>
      </main>
    )
  }

  if (query.isLoading) {
    return (
      <main className="flex flex-1 flex-col gap-4 px-8 py-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full max-w-xl" />
      </main>
    )
  }

  if (query.isError || !query.data) {
    return (
      <main className="flex flex-1 flex-col px-8 py-6">
        <p className="text-sm text-destructive">Contact not found.</p>
        <Button asChild className="mt-4 w-fit" variant="outline">
          <Link href="/contacts">Back to contacts</Link>
        </Button>
      </main>
    )
  }

  const c = query.data
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ')
  const attrs = c.attrs as Record<string, unknown>
  const hasAttrs = attrs && typeof attrs === 'object' && Object.keys(attrs).length > 0

  return (
    <main className="flex flex-1 flex-col">
      <div className="border-b border-border px-8 py-4">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2" asChild>
          <Link href="/contacts">
            <ArrowLeft className="size-4" />
            Contacts
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="size-14">
              <AvatarImage src={c.avatar_url ?? undefined} alt="" />
              <AvatarFallback>{initials(c.first_name, c.last_name)}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-xl font-semibold text-foreground">{name}</h1>
              <p className="text-sm text-muted-foreground">{c.email[0] ?? 'No email'}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" />
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (window.confirm('Delete this contact?')) deleteMutation.mutate({ id: c.id })
              }}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      <div className="grid flex-1 gap-6 px-8 py-6 lg:grid-cols-[minmax(0,280px)_1fr]">
        <aside className="space-y-4">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Attributes
            </h2>
            <Separator className="my-3" />
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">First name</dt>
                <dd className="font-medium">{c.first_name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Last name</dt>
                <dd className="font-medium">{c.last_name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Emails</dt>
                <dd className="font-medium">{c.email.length ? c.email.join(', ') : '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Phones</dt>
                <dd className="font-medium">{c.phone.length ? c.phone.join(', ') : '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Company</dt>
                <dd className="font-medium">
                  {c.company ? (
                    <Link href={`/companies/${c.company.id}`} className="hover:underline">
                      {c.company.name}
                    </Link>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Created</dt>
                <dd className="font-medium">{formatDate(c.created_at)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Updated</dt>
                <dd className="font-medium">{formatDate(c.updated_at)}</dd>
              </div>
            </dl>
          </div>
          {hasAttrs ? (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Custom fields
              </h2>
              <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs">
                {JSON.stringify(attrs, null, 2)}
              </pre>
            </div>
          ) : null}
        </aside>

        <section>
          <Tabs defaultValue="timeline">
            <TabsList>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
            </TabsList>
            <TabsContent value="timeline" className="mt-4 space-y-3">
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notes or activities yet.</p>
              ) : (
                timeline.map((item) =>
                  item.kind === 'note' ? (
                    <div
                      key={`n-${item.id}`}
                      className="rounded-lg border border-border bg-card p-4 shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Avatar className="size-7">
                            <AvatarImage src={item.author.avatar_url ?? undefined} />
                            <AvatarFallback className="text-[10px]">
                              {item.author.full_name?.charAt(0) ?? '?'}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium">
                            {item.author.full_name ?? 'Unknown'}
                          </span>
                          {item.pinned ? <Badge variant="secondary">Pinned</Badge> : null}
                        </div>
                        <time className="text-xs text-muted-foreground" dateTime={item.created_at.toString()}>
                          {formatRelativeDate(item.created_at)}
                        </time>
                      </div>
                      {item.title ? (
                        <p className="mt-2 text-sm font-semibold">{item.title}</p>
                      ) : null}
                      <p className="mt-1 line-clamp-4 text-sm text-muted-foreground">
                        {item.body ?? 'Empty note'}
                      </p>
                    </div>
                  ) : (
                    <div
                      key={`a-${item.id}`}
                      className="rounded-lg border border-border bg-card p-4 shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Avatar className="size-7">
                            <AvatarImage src={item.actor.avatar_url ?? undefined} />
                            <AvatarFallback className="text-[10px]">
                              {item.actor.full_name?.charAt(0) ?? '?'}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium">
                            {item.actor.full_name ?? 'Unknown'}
                          </span>
                          <Badge variant="outline">{item.type}</Badge>
                        </div>
                        <time className="text-xs text-muted-foreground" dateTime={item.created_at.toString()}>
                          {formatRelativeDate(item.created_at)}
                        </time>
                      </div>
                      <p className="mt-2 font-mono text-xs text-muted-foreground">
                        {JSON.stringify(item.data)}
                      </p>
                    </div>
                  ),
                )
              )}
              {(notesQuery.hasNextPage || activitiesQuery.hasNextPage) ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={notesQuery.isFetchingNextPage || activitiesQuery.isFetchingNextPage}
                  onClick={() => {
                    void notesQuery.fetchNextPage()
                    void activitiesQuery.fetchNextPage()
                  }}
                >
                  Load more
                </Button>
              ) : null}
            </TabsContent>
            <TabsContent value="tasks" className="mt-4 space-y-2">
              {!tasksQuery.data?.length ? (
                <p className="text-sm text-muted-foreground">No open tasks.</p>
              ) : (
                tasksQuery.data.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
                  >
                    <Checkbox
                      checked={false}
                      onCheckedChange={(checked) => {
                        if (checked === true) {
                          completeTask.mutate({ taskId: task.id, completed: true })
                        }
                      }}
                      aria-label="Mark complete"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{task.title}</p>
                      {task.description ? (
                        <p className="text-xs text-muted-foreground">{task.description}</p>
                      ) : null}
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {task.due_at ? <span>Due {formatDate(task.due_at)}</span> : null}
                        {task.assignee ? (
                          <span>· {task.assignee.full_name ?? 'Assignee'}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        </section>
      </div>

      <ContactFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        contact={c}
        onSaved={() => void query.refetch()}
      />
    </main>
  )
}
