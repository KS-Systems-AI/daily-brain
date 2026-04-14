'use client'

import { trpc } from '@/lib/trpc/provider'
import { Bell, BellRing, CheckCheck, CheckSquare, Clock, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState, useEffect } from 'react'

function timeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'Gerade eben'
  if (diffMin < 60) return `vor ${diffMin} Min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `vor ${diffH} Std`
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return 'Gestern'
  if (diffD < 7) return `vor ${diffD} Tagen`
  return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
}

function groupByDate<T extends { created_at: Date | string }>(items: T[]): { label: string; items: T[] }[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 7)

  const groups: Record<string, T[]> = {}
  for (const item of items) {
    const d = new Date(item.created_at)
    d.setHours(0, 0, 0, 0)
    let label: string
    if (d.getTime() >= today.getTime()) label = 'Heute'
    else if (d.getTime() >= yesterday.getTime()) label = 'Gestern'
    else if (d.getTime() >= weekAgo.getTime()) label = 'Diese Woche'
    else label = 'Älter'

    if (!groups[label]) groups[label] = []
    groups[label].push(item)
  }

  const order = ['Heute', 'Gestern', 'Diese Woche', 'Älter']
  return order.filter((l) => groups[l]).map((label) => ({ label, items: groups[label] }))
}

function useWebPushPermission() {
  const [perm, setPerm] = useState<NotificationPermission>('default')
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPerm(Notification.permission)
    }
  }, [])
  const request = useCallback(async () => {
    if (!('Notification' in window)) return
    const result = await Notification.requestPermission()
    setPerm(result)
    if (result === 'granted' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
    }
  }, [])
  return { perm, request }
}

export default function NotificationsPage() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const { perm: pushPerm, request: requestPush } = useWebPushPermission()
  const { data, isLoading } = trpc.notifications.list.useQuery()
  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate()
      utils.notifications.unreadCount.invalidate()
    },
  })
  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate()
      utils.notifications.unreadCount.invalidate()
    },
  })

  const notifications = data?.items ?? []
  const unreadCount = notifications.filter((n) => !n.read_at).length
  const grouped = useMemo(() => groupByDate(notifications), [notifications])

  const handleClick = useCallback(
    (notif: (typeof notifications)[0]) => {
      if (!notif.read_at) {
        markRead.mutate({ id: notif.id })
      }
      if (notif.task_id) {
        router.push('/tasks')
      }
    },
    [markRead, router],
  )

  const iconForType = (type: string) => {
    switch (type) {
      case 'task_due_now':
        return <AlertCircle size={16} className="text-red-500" />
      case 'task_due_soon':
        return <Clock size={16} className="text-orange-500" />
      default:
        return <CheckSquare size={16} className="text-blue-500" />
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-muted-foreground" />
          <span className="text-[13px] font-medium text-foreground">Benachrichtigungen</span>
          {unreadCount > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-600">
              {unreadCount} ungelesen
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllRead.mutate()}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <CheckCheck size={14} />
            Alle als gelesen markieren
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {pushPerm === 'default' && (
          <div className="mx-auto max-w-2xl px-6 pt-4">
            <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950/30">
              <BellRing size={18} className="shrink-0 text-blue-600 dark:text-blue-400" />
              <div className="flex-1">
                <p className="text-[13px] font-medium text-blue-900 dark:text-blue-100">
                  Desktop-Benachrichtigungen aktivieren
                </p>
                <p className="text-[12px] text-blue-700 dark:text-blue-300">
                  Erhalte Erinnerungen direkt im Browser, wenn Aufgaben fällig werden.
                </p>
              </div>
              <button
                onClick={requestPush}
                className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-blue-700"
              >
                Aktivieren
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Bell size={20} className="text-muted-foreground" />
            </div>
            <p className="mt-4 text-[14px] font-medium text-foreground">Keine Benachrichtigungen</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Du wirst benachrichtigt, wenn Aufgaben fällig werden.
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl">
            {grouped.map((group) => (
              <div key={group.label}>
                <div className="sticky top-0 z-10 border-b border-border/50 bg-background/95 px-6 py-2 backdrop-blur-sm">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </span>
                </div>
                <div className="divide-y divide-border/40">
                  {group.items.map((notif) => (
                    <button
                      key={notif.id}
                      onClick={() => handleClick(notif)}
                      className={cn(
                        'flex w-full items-start gap-3 px-6 py-3.5 text-left transition-colors hover:bg-muted/50',
                        !notif.read_at && 'bg-blue-50/50 dark:bg-blue-950/10',
                      )}
                    >
                      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                        {iconForType(notif.type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'text-[13px]',
                              !notif.read_at ? 'font-semibold text-foreground' : 'font-medium text-foreground/80',
                            )}
                          >
                            {notif.title}
                          </span>
                          {!notif.read_at && (
                            <span className="size-2 shrink-0 rounded-full bg-blue-500" />
                          )}
                        </div>
                        {notif.body && (
                          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{notif.body}</p>
                        )}
                        <span className="mt-1 block text-[11px] text-muted-foreground/70">
                          {timeAgo(new Date(notif.created_at))}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
