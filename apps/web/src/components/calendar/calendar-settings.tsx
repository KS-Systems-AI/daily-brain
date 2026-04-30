'use client'

import { useSearchParams } from 'next/navigation'
import { trpc } from '@/lib/trpc/provider'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { CheckCircle, Trash2, RefreshCw, AlertCircle } from 'lucide-react'

const GOOGLE_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
)

const MICROSOFT_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24">
    <path fill="#f25022" d="M1 1h10v10H1z"/>
    <path fill="#00a4ef" d="M13 1h10v10H13z"/>
    <path fill="#7fba00" d="M1 13h10v10H1z"/>
    <path fill="#ffb900" d="M13 13h10v10H13z"/>
  </svg>
)

export function CalendarSettings(): React.JSX.Element {
  const searchParams = useSearchParams()
  const connected = searchParams.get('connected')
  const error = searchParams.get('error')
  const { toast } = useToast()

  const { data: accounts = [], isLoading } = trpc.calendar.listAccounts.useQuery()
  const utils = trpc.useUtils()
  const syncMutation = trpc.calendar.syncNow.useMutation({
    onSuccess: async (_, input) => {
      await Promise.all([
        utils.calendar.listAccounts.invalidate(),
        utils.calendar.list.invalidate(),
      ])
      const account = accounts.find((entry) => entry.id === input.accountId)
      toast({
        title: 'Kalender synchronisiert',
        description: account ? `${account.display_name ?? account.email} wurde erfolgreich synchronisiert.` : 'Der Kalender wurde erfolgreich synchronisiert.',
        variant: 'success',
      })
    },
    onError: (err) => {
      toast({
        title: 'Kalender-Sync fehlgeschlagen',
        description: err.message,
        variant: 'destructive',
      })
    },
  })
  const disconnectMutation = trpc.calendar.disconnectAccount.useMutation({
    onSuccess: () => utils.calendar.listAccounts.invalidate(),
  })

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Kalender verbinden</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Verbinde Google Calendar oder Microsoft 365 / Exchange, um Termine anzuzeigen und zu bearbeiten.
        </p>
      </div>

      {/* Erfolgsmeldung */}
      {connected && (
        <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          <CheckCircle size={14} />
          {connected === 'google' ? 'Google Calendar' : 'Microsoft Calendar'} erfolgreich verbunden.
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle size={14} />
          {error === 'access_denied' ? 'Zugriff verweigert.' : 'Verbindung fehlgeschlagen.'}
        </div>
      )}

      {/* Verbundene Konten */}
      {!isLoading && accounts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Verbundene Konten</h3>
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="flex items-center justify-between rounded-lg border border-border p-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                  {acc.provider === 'google' ? GOOGLE_ICON : MICROSOFT_ICON}
                </div>
                <div>
                  <p className="text-sm font-medium">{acc.display_name ?? acc.email}</p>
                  <p className="text-xs text-muted-foreground">{acc.email}</p>
                  {acc.last_synced_at && (
                    <p className="text-xs text-muted-foreground">
                      Zuletzt synchronisiert: {new Date(acc.last_synced_at).toLocaleString('de-DE')}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs capitalize">{acc.provider}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => syncMutation.mutate({ accountId: acc.id })}
                  disabled={syncMutation.isPending}
                  title="Jetzt synchronisieren"
                >
                  <RefreshCw size={13} className={syncMutation.isPending ? 'animate-spin' : ''} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => disconnectMutation.mutate({ accountId: acc.id })}
                  disabled={disconnectMutation.isPending}
                  className="text-destructive hover:text-destructive"
                  title="Konto trennen"
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Separator />

      {/* Neue Konten verbinden */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Konto hinzufügen</h3>

        <a href="/api/calendar/google/connect" className="block">
          <div className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted cursor-pointer">
            <div className="flex size-8 items-center justify-center rounded-full bg-muted">{GOOGLE_ICON}</div>
            <div>
              <p className="text-sm font-medium">Google Calendar verbinden</p>
              <p className="text-xs text-muted-foreground">Gmail, Google Workspace, Google Calendar</p>
            </div>
          </div>
        </a>

        <a href="/api/calendar/microsoft/connect" className="block">
          <div className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted cursor-pointer">
            <div className="flex size-8 items-center justify-center rounded-full bg-muted">{MICROSOFT_ICON}</div>
            <div>
              <p className="text-sm font-medium">Microsoft 365 / Exchange verbinden</p>
              <p className="text-xs text-muted-foreground">Outlook, Exchange Online, Microsoft 365</p>
            </div>
          </div>
        </a>
      </div>

      <p className="text-xs text-muted-foreground">
        Der Sync erfolgt automatisch alle 15 Minuten. Du kannst jederzeit manuell synchronisieren.
      </p>
    </div>
  )
}
