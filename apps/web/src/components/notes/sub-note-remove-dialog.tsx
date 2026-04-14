'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc/provider'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Trash2, ArrowRightLeft, Unlink, FileText, Search, Loader2 } from 'lucide-react'

interface SubNoteRemoveDialogProps {
  noteId: string | null
  currentParentId: string
  onClose: () => void
  onDone: () => void
}

type View = 'choose' | 'move'

export function SubNoteRemoveDialog({
  noteId,
  currentParentId,
  onClose,
  onDone,
}: SubNoteRemoveDialogProps) {
  const [view, setView] = useState<View>('choose')
  const [search, setSearch] = useState('')
  const utils = trpc.useUtils()

  const { data: childNote } = trpc.notes.getById.useQuery(
    { id: noteId! },
    { enabled: !!noteId },
  )

  const deleteNote = trpc.notes.delete.useMutation({
    onSuccess: () => {
      utils.notes.list.invalidate()
      utils.notes.getById.invalidate({ id: currentParentId })
      onDone()
    },
  })

  const updateNote = trpc.notes.update.useMutation({
    onSuccess: () => {
      utils.notes.list.invalidate()
      utils.notes.getById.invalidate({ id: currentParentId })
      onDone()
    },
  })

  const { data: notesData, isLoading: notesLoading } = trpc.notes.list.useQuery(
    { limit: 50, search: search || undefined },
    { enabled: view === 'move' },
  )

  const handleDelete = () => {
    if (!noteId) return
    deleteNote.mutate({ id: noteId })
  }

  const handleDetach = () => {
    if (!noteId) return
    updateNote.mutate({ id: noteId, parent_id: null })
  }

  const handleMoveTo = (targetId: string) => {
    if (!noteId) return
    updateNote.mutate({ id: noteId, parent_id: targetId })
  }

  const childTitle = childNote?.title || 'Ohne Titel'
  const isPending = deleteNote.isPending || updateNote.isPending

  const moveTargets = (notesData?.items ?? []).filter(
    (n) => n.id !== noteId && n.id !== currentParentId,
  )

  return (
    <Dialog open={!!noteId} onOpenChange={(open) => { if (!open) { onClose(); setView('choose'); setSearch('') } }}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">
            {view === 'choose' ? 'Unternotiz entfernen' : 'Notiz verschieben'}
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            {view === 'choose'
              ? `Was soll mit "${childTitle}" passieren?`
              : `Wähle eine Notiz, in die "${childTitle}" verschoben werden soll.`}
          </DialogDescription>
        </DialogHeader>

        {view === 'choose' ? (
          <div className="flex flex-col gap-1.5 pt-1">
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-50"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30">
                <Trash2 size={14} className="text-red-500" />
              </div>
              <div>
                <p className="text-[13px] font-medium text-red-600 dark:text-red-400">Notiz löschen</p>
                <p className="text-[11px] text-muted-foreground">Notiz und Inhalt endgültig entfernen</p>
              </div>
            </button>

            <button
              onClick={() => setView('move')}
              disabled={isPending}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted disabled:opacity-50"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                <ArrowRightLeft size={14} className="text-muted-foreground" />
              </div>
              <div>
                <p className="text-[13px] font-medium text-foreground">In andere Notiz verschieben</p>
                <p className="text-[11px] text-muted-foreground">Notiz einer anderen Elternnotiz zuordnen</p>
              </div>
            </button>

            <button
              onClick={handleDetach}
              disabled={isPending}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted disabled:opacity-50"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                <Unlink size={14} className="text-muted-foreground" />
              </div>
              <div>
                <p className="text-[13px] font-medium text-foreground">Eigenständig speichern</p>
                <p className="text-[11px] text-muted-foreground">Notiz wird zur Top-Level Notiz</p>
              </div>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 pt-1">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Notiz suchen..."
                autoFocus
                className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-[13px] placeholder-muted-foreground/50 outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="max-h-[250px] overflow-y-auto rounded-md border border-border">
              {notesLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 size={14} className="animate-spin text-muted-foreground" />
                </div>
              ) : moveTargets.length === 0 ? (
                <p className="py-6 text-center text-[12px] text-muted-foreground/50">
                  Keine Notizen gefunden
                </p>
              ) : (
                moveTargets.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleMoveTo(n.id)}
                    disabled={isPending}
                    className="flex w-full items-center gap-2.5 border-b border-border px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-muted disabled:opacity-50"
                  >
                    <FileText size={13} className="shrink-0 text-muted-foreground/50" />
                    <span className="truncate text-[13px] text-foreground">
                      {n.title || 'Ohne Titel'}
                    </span>
                  </button>
                ))
              )}
            </div>

            <button
              onClick={() => { setView('choose'); setSearch('') }}
              className="text-[12px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Zurück
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
