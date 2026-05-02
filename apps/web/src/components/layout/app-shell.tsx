'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Bell,
  CalendarDays,
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
  Wallet,
  PanelLeft,
  Menu,
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
import { VoiceNoteRecorder } from '@/components/voice/voice-note-recorder'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

const mainNav = [
  { href: '/dashboard', label: 'Start', icon: Home },
  { href: '/notifications', label: 'Benachrichtigungen', icon: Bell },
  { href: '/calendar', label: 'Kalender', icon: CalendarDays },
  { href: '/tasks', label: 'Aufgaben', icon: CheckSquare, badge: true },
  { href: '/notes', label: 'Notizen', icon: FileText },
  { href: '/budget', label: 'Haushaltsbuch', icon: Wallet },
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const [cmdOpen, setCmdOpen] = useState(false)
  const [contactDialogOpen, setContactDialogOpen] = useState(false)
  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [voiceNoteOpen, setVoiceNoteOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const isSidebarCollapsed = sidebarCollapsed

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
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-300 ease-out md:flex',
          sidebarCollapsed
            ? 'w-[76px]'
            : 'w-[240px]',
        )}
      >
        {/* Workspace Header */}
        <div
          className={cn(
            'flex items-center py-3',
            isSidebarCollapsed ? 'justify-center gap-2 px-2' : 'gap-2.5 px-4',
          )}
        >
          <Image src="/logo.png" alt="Daily Brain" width={32} height={32} className="rounded-lg" />
          <div className={cn('flex flex-1 items-center gap-1', isSidebarCollapsed && 'hidden')}>
            <span className="truncate text-[13px] font-semibold text-foreground">Daily Brain</span>
            <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
          </div>
          <div className={cn('flex items-center gap-0.5', isSidebarCollapsed && 'hidden')}>
            <button className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Kopieren">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={sidebarCollapsed ? 'Sidebar verbreitern' : 'Sidebar einklappen'}
            title={sidebarCollapsed ? 'Sidebar verbreitern' : 'Sidebar einklappen'}
          >
            <PanelLeft size={15} className={cn('transition-transform duration-300', sidebarCollapsed && 'rotate-180')} />
          </button>
        </div>

        {/* Schnellaktionen */}
        <div className="px-3 pb-1">
          <button
            onClick={() => setCmdOpen(true)}
            className={cn(
              'flex w-full items-center rounded-md text-[13px] text-sidebar-foreground transition-colors hover:bg-muted',
              isSidebarCollapsed ? 'justify-center px-2 py-2' : 'gap-2 px-2 py-1.5',
            )}
            title="Schnellaktionen"
          >
            <Zap size={14} className="shrink-0" />
            <span className={cn(isSidebarCollapsed && 'hidden')}>Schnellaktionen</span>
            <div className={cn('ml-auto items-center gap-1 text-[11px] text-muted-foreground', isSidebarCollapsed ? 'hidden' : 'flex')}>
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px]">
                <Command size={9} className="inline" />K
              </kbd>
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px]">/</kbd>
            </div>
          </button>
        </div>

        {/* Suche */}
        <div className="px-3 pb-2">
          <button
            onClick={() => router.push('/notes?focus=search')}
            className={cn(
              'flex w-full items-center rounded-md text-[13px] text-sidebar-foreground transition-colors hover:bg-muted',
              isSidebarCollapsed ? 'justify-center px-2 py-2' : 'gap-2 px-2 py-1.5',
            )}
            title="Suche"
          >
            <Search size={14} className="shrink-0" />
            <span className={cn(isSidebarCollapsed && 'hidden')}>Suche</span>
          </button>
        </div>

        {/* Scrollbare Navigation */}
        <nav className="flex flex-1 flex-col overflow-y-auto px-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
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
                  title={label}
                  className={cn(
                    'relative flex items-center rounded-md py-[6px] text-[13px] transition-colors',
                    isSidebarCollapsed ? 'justify-center px-2' : 'gap-2.5 px-2.5',
                    active
                      ? 'bg-accent font-medium text-foreground'
                      : 'text-sidebar-foreground hover:bg-muted',
                  )}
                >
                  <Icon size={15} strokeWidth={1.75} className="shrink-0" />
                  <span className={cn('flex-1', isSidebarCollapsed && 'hidden')}>{label}</span>
                  {displayBadge > 0 && (
                    <span className={cn(
                      'flex size-[18px] items-center justify-center rounded-full text-[10px] font-medium text-white',
                      isSidebarCollapsed && 'absolute ml-4 -mt-4 size-[14px] text-[9px]',
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
              className={cn(
                'flex w-full items-center rounded-md py-[6px] text-[13px] text-sidebar-foreground transition-colors hover:bg-muted',
                isSidebarCollapsed ? 'justify-center px-2' : 'gap-2.5 px-2.5',
              )}
              title="Automatisierungen"
            >
              {isSidebarCollapsed ? (
                <Zap size={15} className="shrink-0" />
              ) : (
                <>
              <ChevronRight
                size={12}
                className={cn('shrink-0 transition-transform', automationsOpen && 'rotate-90')}
              />
              <span>Automatisierungen</span>
                </>
              )}
            </button>
            {!isSidebarCollapsed && automationsOpen && (
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
            {!isSidebarCollapsed ? (
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
            ) : null}
            {(recordsOpen || isSidebarCollapsed) && (
              <div className="mt-0.5 space-y-0.5">
                {recordsNav.map(({ href, label, icon: Icon, color }) => {
                  const active = pathname.startsWith(href)
                  return (
                    <Link
                      key={href}
                      href={href}
                      title={label}
                      className={cn(
                        'flex items-center rounded-md py-[6px] text-[13px] transition-colors',
                        isSidebarCollapsed ? 'justify-center px-2' : 'gap-2.5 px-2.5',
                        active
                          ? 'bg-accent font-medium text-foreground'
                          : 'text-sidebar-foreground hover:bg-muted',
                      )}
                    >
                      <Icon size={15} strokeWidth={1.75} className={cn('shrink-0', color)} />
                      <span className={cn(isSidebarCollapsed && 'hidden')}>{label}</span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          {/* Listen */}
          <div className="mt-4">
            {!isSidebarCollapsed ? (
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
            ) : null}
            {(listsOpen || isSidebarCollapsed) && (
              <div className="mt-0.5">
                <button
                  className={cn(
                    'flex w-full items-center rounded-md py-[6px] text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                    isSidebarCollapsed ? 'justify-center px-2' : 'gap-2 px-2.5',
                  )}
                  title="Neue Liste"
                >
                  <Plus size={14} className="shrink-0" />
                  <span className={cn(isSidebarCollapsed && 'hidden')}>Neue Liste</span>
                </button>
              </div>
            )}
          </div>

          {/* Chats */}
          <div className="mt-4">
            {!isSidebarCollapsed ? (
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
            ) : null}
            {(chatsOpen || isSidebarCollapsed) && (
              <div className="mt-0.5">
                <Link
                  href="/chats"
                  title="Chat starten"
                  className={cn(
                    'flex items-center rounded-md py-[6px] text-[13px] text-sidebar-foreground transition-colors hover:bg-muted',
                    isSidebarCollapsed ? 'justify-center px-2' : 'gap-2 px-2.5',
                  )}
                >
                  <MessageSquare size={14} className="shrink-0" />
                  <span className={cn('truncate', isSidebarCollapsed && 'hidden')}>Chat starten</span>
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
            title="Erste Schritte"
            className={cn(
              'flex items-center rounded-md px-2 py-1.5 text-[12px] text-sidebar-foreground transition-colors hover:bg-muted',
              isSidebarCollapsed ? 'justify-center' : 'gap-2',
            )}
          >
            <Settings size={14} className="shrink-0" />
            <span className={cn(isSidebarCollapsed && 'hidden')}>Erste Schritte</span>
            <span className={cn('ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground', isSidebarCollapsed && 'hidden')}>
              3/7
            </span>
          </Link>
          <button
            className={cn(
              'flex w-full items-center rounded-md px-2 py-1.5 text-[12px] text-sidebar-foreground transition-colors hover:bg-muted',
              isSidebarCollapsed ? 'justify-center' : 'gap-2',
            )}
            title="Teammitglieder einladen"
          >
            <UserPlus size={14} className="shrink-0" />
            <span className={cn(isSidebarCollapsed && 'hidden')}>Teammitglieder einladen</span>
          </button>
          <button
            onClick={async () => {
              const supabase = createClient()
              await supabase.auth.signOut()
              router.push('/login')
            }}
            className={cn(
              'flex w-full items-center rounded-md px-2 py-1.5 text-[12px] text-red-500 transition-colors hover:bg-red-50',
              isSidebarCollapsed ? 'justify-center' : 'gap-2',
            )}
            title="Abmelden"
          >
            <LogOut size={14} className="shrink-0" />
            <span className={cn(isSidebarCollapsed && 'hidden')}>Abmelden</span>
          </button>
        </div>
      </aside>

      {/* Hauptinhalt */}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-3 py-2 md:hidden">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Navigation öffnen"
          >
            <Menu size={18} />
          </button>
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="Daily Brain" width={24} height={24} className="rounded-md" />
            <span className="text-sm font-semibold text-foreground">Daily Brain</span>
          </div>
          <div className="w-9" />
        </div>
        {children}
      </div>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-[84vw] max-w-[320px] overflow-y-auto p-0">
          <SheetHeader className="border-b border-border px-4 py-4">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Image src="/logo.png" alt="Daily Brain" width={24} height={24} className="rounded-md" />
              Daily Brain
            </SheetTitle>
          </SheetHeader>

          <div className="px-3 py-3">
            <div className="space-y-1">
              {mainNav.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileNavOpen(false)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                      active ? 'bg-accent font-medium text-foreground' : 'text-sidebar-foreground hover:bg-muted',
                    )}
                  >
                    <Icon size={16} className="shrink-0" />
                    <span>{label}</span>
                  </Link>
                )
              })}
            </div>

            <div className="mt-5">
              <p className="px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Datensätze
              </p>
              <div className="mt-1 space-y-1">
                {recordsNav.map(({ href, label, icon: Icon, color }) => {
                  const active = pathname.startsWith(href)
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setMobileNavOpen(false)}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                        active ? 'bg-accent font-medium text-foreground' : 'text-sidebar-foreground hover:bg-muted',
                      )}
                    >
                      <Icon size={16} className={cn('shrink-0', color)} />
                      <span>{label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>

            <div className="mt-5 border-t border-border pt-3">
              <button
                onClick={async () => {
                  const supabase = createClient()
                  await supabase.auth.signOut()
                  setMobileNavOpen(false)
                  router.push('/login')
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-red-500 transition-colors hover:bg-red-50"
              >
                <LogOut size={16} className="shrink-0" />
                <span>Abmelden</span>
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Command Menu (⌘K) */}
      <CommandMenu
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        onCreateTask={() => setTaskDialogOpen(true)}
        onCreateContact={() => setContactDialogOpen(true)}
        onVoiceNote={() => setVoiceNoteOpen(true)}
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

      {/* Sprachnotiz */}
      <VoiceNoteRecorder open={voiceNoteOpen} onOpenChange={setVoiceNoteOpen} />
    </div>
  )
}
