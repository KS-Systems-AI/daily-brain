'use client'

import { trpc } from '@/lib/trpc/provider'
import { cn, formatRelativeDate } from '@/lib/utils'
import { Plus, FileText, Pin, MoreHorizontal, Trash2, Archive } from 'lucide-react'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

export function NoteList() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const [contextMenuId, setContextMenuId] = useState<string | null>(null)

  const { data, isLoading, isFetching } = trpc.notes.list.useQuery({
    limit: 50,
    is_archived: false,
  })

  const showLoading = isLoading && !data

  const createNote = trpc.notes.create.useMutation({
    onSuccess: (note) => {
      utils.notes.list.invalidate()
      router.push(`/notes/${note.id}`)
    },
  })

  const updateNote = trpc.notes.update.useMutation({
    onSuccess: () => utils.notes.list.invalidate(),
  })

  const deleteNote = trpc.notes.delete.useMutation({
    onSuccess: () => utils.notes.list.invalidate(),
  })

  const handleNewNote = useCallback(() => {
    createNote.mutate({})
  }, [createNote])

  const notes = data?.items ?? []
  const pinnedNotes = notes.filter((n) => n.is_pinned)
  const unpinnedNotes = notes.filter((n) => !n.is_pinned)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2.5">
          <FileText size={16} className="text-muted-foreground" />
          <h1 className="text-[13px] font-medium text-foreground">Notizen</h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {notes.length}
          </span>
        </div>
        <button
          onClick={handleNewNote}
          disabled={createNote.isPending}
          className="flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[12px] font-medium text-background shadow-sm transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          <Plus size={13} />
          Neue Notiz
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {showLoading ? (
          <div className="py-24 text-center">
            <p className="text-[13px] text-muted-foreground/50">Notizen werden geladen...</p>
          </div>
        ) : (
          <div className="p-6">
            {pinnedNotes.length > 0 && (
              <div className="mb-6">
                <div className="mb-2 flex items-center gap-1.5 px-0.5">
                  <Pin size={11} className="text-muted-foreground/40" />
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
                    Angepinnt
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {pinnedNotes.map((note) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      showContextMenu={contextMenuId === note.id}
                      onToggleContextMenu={() =>
                        setContextMenuId(contextMenuId === note.id ? null : note.id)
                      }
                      onDelete={() => deleteNote.mutate({ id: note.id })}
                      onTogglePin={() =>
                        updateNote.mutate({ id: note.id, is_pinned: !note.is_pinned })
                      }
                      onArchive={() => updateNote.mutate({ id: note.id, is_archived: true })}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {unpinnedNotes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  showContextMenu={contextMenuId === note.id}
                  onToggleContextMenu={() =>
                    setContextMenuId(contextMenuId === note.id ? null : note.id)
                  }
                  onDelete={() => deleteNote.mutate({ id: note.id })}
                  onTogglePin={() =>
                    updateNote.mutate({ id: note.id, is_pinned: !note.is_pinned })
                  }
                  onArchive={() => updateNote.mutate({ id: note.id, is_archived: true })}
                />
              ))}
            </div>

            {notes.length === 0 && (
              <div className="py-24 text-center">
                <p className="text-[13px] text-muted-foreground/50">Noch keine Notizen</p>
                <button
                  onClick={handleNewNote}
                  className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Plus size={13} />
                  Notiz erstellen
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

interface NoteItem {
  id: string
  title: string | null
  content_text: string | null
  is_pinned: boolean
  is_archived: boolean
  created_at: Date
  updated_at: Date
}

function NoteCard({
  note,
  showContextMenu,
  onToggleContextMenu,
  onDelete,
  onTogglePin,
  onArchive,
}: {
  note: NoteItem
  showContextMenu: boolean
  onToggleContextMenu: () => void
  onDelete: () => void
  onTogglePin: () => void
  onArchive: () => void
}) {
  const router = useRouter()
  const preview = (note.content_text ?? '').slice(0, 120)

  return (
    <div
      onClick={() => router.push(`/notes/${note.id}`)}
      className="group relative cursor-pointer rounded-lg border border-border bg-card p-3.5 shadow-sm transition-all hover:border-border/80 hover:shadow-md"
    >
      <div className="mb-1.5 flex items-start justify-between">
        <h3 className="text-[13px] font-medium text-foreground line-clamp-1">
          {note.title || 'Ohne Titel'}
        </h3>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleContextMenu()
          }}
          className="shrink-0 rounded p-0.5 text-muted-foreground/30 opacity-0 transition-opacity hover:text-muted-foreground group-hover:opacity-100"
        >
          <MoreHorizontal size={14} />
        </button>
      </div>

      <p className="mb-3 text-[12px] leading-[1.6] text-muted-foreground/60 line-clamp-3">
        {preview || 'Leere Notiz'}
      </p>

      <p className="text-[11px] text-muted-foreground/40">
        {formatRelativeDate(note.updated_at instanceof Date ? note.updated_at.toISOString() : String(note.updated_at))}
      </p>

      {note.is_pinned && (
        <Pin size={9} className="absolute right-2 top-2 text-muted-foreground/30" />
      )}

      {showContextMenu && (
        <div className="absolute right-1 top-7 z-10 min-w-[130px] rounded-lg border border-border bg-popover py-1 shadow-lg">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onTogglePin()
              onToggleContextMenu()
            }}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-[12px] text-popover-foreground hover:bg-muted"
          >
            <Pin size={11} />
            {note.is_pinned ? 'Lösen' : 'Anpinnen'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onArchive()
              onToggleContextMenu()
            }}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-[12px] text-popover-foreground hover:bg-muted"
          >
            <Archive size={11} />
            Archivieren
          </button>
          <div className="my-0.5 border-t border-border" />
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
              onToggleContextMenu()
            }}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-[12px] text-red-500 hover:bg-muted"
          >
            <Trash2 size={11} />
            Löschen
          </button>
        </div>
      )}
    </div>
  )
}
