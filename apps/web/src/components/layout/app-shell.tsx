'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Bell,
  CheckSquare,
  FileText,
  Mail,
  Phone,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Building2,
  Users,
  Briefcase,
  User,
  Globe,
  Plus,
  MessageSquare,
  Search,
  Zap,
  Settings,
  UserPlus,
  LogOut,
  Command,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc/provider'
import { createClient } from '@/lib/supabase/client'
import { useTaskRealtime } from '@/hooks/use-task-realtime'
import { useNotificationRealtime } from '@/hooks/use-notification-realtime'
import { useNoteRealtime } from '@/hooks/use-note-realtime'
import { useWebPush } from '@/hooks/use-web-push'
import { CommandMenu } from './command-menu'
import { ContactFormSheet } from '@/components/contacts/contact-form-sheet'
import { TaskFormDialog } from '@/components/tasks/task-form-dialog'

const mainNav = [
  { href: '/dashboard', label: 'Start', icon: Home },
  { href: '/notifications', label: 'Benachrichtigungen', icon: Bell },
  { href: '/tasks', label: 'Aufgaben', icon: CheckSquare, badge: true },
  { href: '/notes', label: 'Notizen', icon: FileText },
  { href: '/emails', label: 'E-Mails', icon: Mail },
  { href: '/calls', label: 'Anrufe', icon: Phone },
  { href: '/reports', label: 'Berichte', icon: BarChart3 },
] as const

const recordsNav = [
  { href: '/companies', label: 'Unternehmen', icon: Building2, color: 'text-orange-500' },
  { href: '/contacts', label: 'Personen', icon: Users, color: 'text-purple-500' },
  { href: '/deals', label: 'Deals', icon: Briefcase, color: 'text-green-500' },
  { href: '/users', label: 'Benutzer', icon: User, color: 'text-blue-500' },
  { href: '/workspaces', label: 'Arbeitsbereiche', icon: Globe, color: 'text-teal-500' },
] as const

export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  useTaskRealtime()
  useNotificationRealtime()
  useNoteRealtime()
  useWebPush()
  const pathname = usePathname()
  const { data: activeTasks = [] } = trpc.tasks.list.useQuery()
  const { data: notifUnreadCount = 0 } = trpc.notifications.unreadCount.useQuery()
  const badgeCount = useMemo(() => {
    return activeTasks.filter((t) => {
      const isDone = t.status === 'done' || t.status === 'cancelled'
      if (isDone) return false
      if (!t.due_at) return true
      return new Date(t.due_at).getTime() < Date.now()
    }).length
  }, [activeTasks])
  const router = useRouter()
  const [automationsOpen, setAutomationsOpen] = useState(false)
  const [recordsOpen, setRecordsOpen] = useState(true)
  const [listsOpen, setListsOpen] = useState(true)
  const [chatsOpen, setChatsOpen] = useState(true)

  const [cmdOpen, setCmdOpen] = useState(false)
  const [contactDialogOpen, setContactDialogOpen] = useState(false)
  const [taskDialogOpen, setTaskDialogOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        {/* Workspace Header */}
        <div className="flex items-center gap-2.5 px-4 py-3">
          <Image src="/logo.png" alt="Daily Brain" width={32} height={32} className="rounded-lg" />
          <div className="flex flex-1 items-center gap-1">
            <span className="truncate text-[13px] font-semibold text-foreground">Daily Brain</span>
            <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
          </div>
          <div className="flex items-center gap-0.5">
            <button className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Kopieren">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
          </div>
        </div>

        {/* Schnellaktionen */}
        <div className="px-3 pb-1">
          <button
            onClick={() => setCmdOpen(true)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-sidebar-foreground transition-colors hover:bg-muted"
          >
            <Zap size={14} className="shrink-0" />
            <span>Schnellaktionen</span>
            <div className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px]">
                <Command size={9} className="inline" />K
              </kbd>
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px]">/</kbd>
            </div>
          </button>
        </div>

        {/* Suche */}
        <div className="px-3 pb-2">
          <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-sidebar-foreground transition-colors hover:bg-muted">
            <Search size={14} className="shrink-0" />
          </button>
        </div>

        {/* Scrollbare Navigation */}
        <nav className="flex flex-1 flex-col overflow-y-auto px-2">
          {/* Hauptnav */}
          <div className="space-y-0.5">
            {mainNav.map(({ href, label, icon: Icon, ...rest }) => {
              const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
              const isTaskBadge = 'badge' in rest && rest.badge && badgeCount > 0
              const isNotifBadge = href === '/notifications' && notifUnreadCount > 0
              const displayBadge = isTaskBadge ? badgeCount : isNotifBadge ? notifUnreadCount : 0
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-2.5 py-[6px] text-[13px] transition-colors',
                    active
                      ? 'bg-accent font-medium text-foreground'
                      : 'text-sidebar-foreground hover:bg-muted',
                  )}
                >
                  <Icon size={15} strokeWidth={1.75} className="shrink-0" />
                  <span className="flex-1">{label}</span>
                  {displayBadge > 0 && (
                    <span className={cn(
                      'flex size-[18px] items-center justify-center rounded-full text-[10px] font-medium text-white',
                      isNotifBadge ? 'bg-blue-500' : 'bg-red-500',
                    )}>
                      {displayBadge}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>

          {/* Automatisierungen */}
          <div className="mt-1">
            <button
              onClick={() => setAutomationsOpen(!automationsOpen)}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-[6px] text-[13px] text-sidebar-foreground transition-colors hover:bg-muted"
            >
              <ChevronRight
                size={12}
                className={cn('shrink-0 transition-transform', automationsOpen && 'rotate-90')}
              />
              <span>Automatisierungen</span>
            </button>
            {automationsOpen && (
              <div className="ml-5 space-y-0.5 border-l border-border pl-2.5">
                <Link
                  href="/automations/sequences"
                  className="flex items-center gap-2 rounded-md px-2.5 py-[5px] text-[13px] text-sidebar-foreground transition-colors hover:bg-muted"
                >
                  Sequenzen
                </Link>
                <Link
                  href="/automations/workflows"
                  className="flex items-center gap-2 rounded-md px-2.5 py-[5px] text-[13px] text-sidebar-foreground transition-colors hover:bg-muted"
                >
                  Workflows
                </Link>
              </div>
            )}
          </div>

          {/* Datensätze */}
          <div className="mt-4">
            <button
              onClick={() => setRecordsOpen(!recordsOpen)}
              className="flex w-full items-center gap-1 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              <ChevronRight
                size={10}
                className={cn('shrink-0 transition-transform', recordsOpen && 'rotate-90')}
              />
              Datensätze
            </button>
            {recordsOpen && (
              <div className="mt-0.5 space-y-0.5">
                {recordsNav.map(({ href, label, icon: Icon, color }) => {
                  const active = pathname.startsWith(href)
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-2.5 py-[6px] text-[13px] transition-colors',
                        active
                          ? 'bg-accent font-medium text-foreground'
                          : 'text-sidebar-foreground hover:bg-muted',
                      )}
                    >
                      <Icon size={15} strokeWidth={1.75} className={cn('shrink-0', color)} />
                      {label}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          {/* Listen */}
          <div className="mt-4">
            <button
              onClick={() => setListsOpen(!listsOpen)}
              className="flex w-full items-center gap-1 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              <ChevronRight
                size={10}
                className={cn('shrink-0 transition-transform', listsOpen && 'rotate-90')}
              />
              Listen
            </button>
            {listsOpen && (
              <div className="mt-0.5">
                <button className="flex w-full items-center gap-2 rounded-md px-2.5 py-[6px] text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <Plus size={14} className="shrink-0" />
                  Neue Liste
                </button>
              </div>
            )}
          </div>

          {/* Chats */}
          <div className="mt-4">
            <button
              onClick={() => setChatsOpen(!chatsOpen)}
              className="flex w-full items-center gap-1 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              <ChevronRight
                size={10}
                className={cn('shrink-0 transition-transform', chatsOpen && 'rotate-90')}
              />
              Chats
            </button>
            {chatsOpen && (
              <div className="mt-0.5">
                <Link
                  href="/chats"
                  className="flex items-center gap-2 rounded-md px-2.5 py-[6px] text-[13px] text-sidebar-foreground transition-colors hover:bg-muted"
                >
                  <MessageSquare size={14} className="shrink-0" />
                  <span className="truncate">Chat starten</span>
                </Link>
              </div>
            )}
          </div>

          <div className="flex-1" />
        </nav>

        {/* Footer */}
        <div className="border-t border-sidebar-border px-3 py-2">
          <Link
            href="/getting-started"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-sidebar-foreground transition-colors hover:bg-muted"
          >
            <Settings size={14} className="shrink-0" />
            <span>Erste Schritte</span>
            <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              3/7
            </span>
          </Link>
          <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-sidebar-foreground transition-colors hover:bg-muted">
            <UserPlus size={14} className="shrink-0" />
            <span>Teammitglieder einladen</span>
          </button>
          <button
            onClick={async () => {
              const supabase = createClient()
              await supabase.auth.signOut()
              router.push('/login')
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-red-500 transition-colors hover:bg-red-50"
          >
            <LogOut size={14} className="shrink-0" />
            <span>Abmelden</span>
          </button>
        </div>
      </aside>

      {/* Hauptinhalt */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</div>

      {/* Command Menu (⌘K) */}
      <CommandMenu
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        onCreateTask={() => setTaskDialogOpen(true)}
        onCreateContact={() => setContactDialogOpen(true)}
      />

      {/* Aufgabe erstellen Dialog (gleicher wie im Aufgabenbereich) */}
      <TaskFormDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
      />

      {/* Kontakt erstellen Dialog (gleicher wie im Kontaktbereich) */}
      <ContactFormSheet
        open={contactDialogOpen}
        onOpenChange={setContactDialogOpen}
        mode="create"
      />
    </div>
  )
}
