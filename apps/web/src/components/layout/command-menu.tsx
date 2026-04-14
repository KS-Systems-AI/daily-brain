'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  CheckSquare,
  UserPlus,
  FileText,
  Home,
  Users,
  Building2,
  Briefcase,
  Settings,
  Search,
} from 'lucide-react'

interface CommandMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateTask: () => void
  onCreateContact: () => void
}

export function CommandMenu({ open, onOpenChange, onCreateTask, onCreateContact }: CommandMenuProps) {
  const router = useRouter()

  const runAction = useCallback((fn: () => void) => {
    onOpenChange(false)
    fn()
  }, [onOpenChange])

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Suche oder Aktion ausführen..." />
      <CommandList>
        <CommandEmpty>Keine Ergebnisse gefunden.</CommandEmpty>

        <CommandGroup heading="Erstellen">
          <CommandItem onSelect={() => runAction(onCreateTask)}>
            <CheckSquare className="text-orange-500" />
            <span>Neue Aufgabe</span>
          </CommandItem>
          <CommandItem onSelect={() => runAction(onCreateContact)}>
            <UserPlus className="text-purple-500" />
            <span>Neuer Kontakt</span>
          </CommandItem>
          <CommandItem onSelect={() => runAction(() => router.push('/notes'))}>
            <FileText className="text-blue-500" />
            <span>Neue Notiz</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => runAction(() => router.push('/dashboard'))}>
            <Home />
            <span>Start</span>
          </CommandItem>
          <CommandItem onSelect={() => runAction(() => router.push('/tasks'))}>
            <CheckSquare />
            <span>Aufgaben</span>
          </CommandItem>
          <CommandItem onSelect={() => runAction(() => router.push('/notes'))}>
            <FileText />
            <span>Notizen</span>
          </CommandItem>
          <CommandItem onSelect={() => runAction(() => router.push('/contacts'))}>
            <Users />
            <span>Personen</span>
          </CommandItem>
          <CommandItem onSelect={() => runAction(() => router.push('/companies'))}>
            <Building2 />
            <span>Unternehmen</span>
          </CommandItem>
          <CommandItem onSelect={() => runAction(() => router.push('/deals'))}>
            <Briefcase />
            <span>Deals</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
