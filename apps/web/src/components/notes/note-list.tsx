'use client'

import { trpc } from '@/lib/trpc/provider'
import { cn, formatRelativeDate } from '@/lib/utils'
import {
  Plus,
  FileText,
  Pin,
  MoreHorizontal,
  Trash2,
  Archive,
  Layers,
  User,
  Building2,
  Search,
  X,
} from 'lucide-react'
import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export function NoteList() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const [contextMenuId, setContextMenuId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get('focus') === 'search') {
      setTimeout(() => searchInputRef.current?.focus(), 100)
    }
  }, [searchParams])

  const isSearching = debouncedQuery.length > 0

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 250)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const { data, isLoading, isFetching } = trpc.notes.list.useQuery(
    { limit: 50, is_archived: false },
    { enabled: !isSearching },
  )

  const { data: searchData, isFetching: isSearchFetching } = trpc.notes.search.useQuery(
    { query: debouncedQuery, limit: 30 },
    { enabled: isSearching },
  )

  const showLoading = isLoading && !data && !isSearching

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
  const searchResults = searchData?.items ?? []
  const displayNotes = isSearching ? searchResults : notes
  const pinnedNotes = isSearching ? [] : displayNotes.filter((n) => n.is_pinned)
  const unpinnedNotes = isSearching ? displayNotes : displayNotes.filter((n) => !n.is_pinned)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2.5">
          <FileText size={16} className="text-muted-foreground" />
          <h1 className="text-[13px] font-medium text-foreground">Notizen</h1>
          {!isSearching && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {notes.length}
            </span>
          )}
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
            {/* Suchleiste — gleicher Stil wie Aufgaben-Eingabe */}
            <div className="mb-4">
              <div className="relative flex items-center gap-2.5 rounded-lg border border-border px-3.5 py-2.5 shadow-sm transition-colors focus-within:border-ring/40">
                <Search size={15} className="shrink-0 text-muted-foreground/40" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Notizen durchsuchen..."
                  className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                />
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(''); searchInputRef.current?.focus() }}
                    className="shrink-0 rounded p-0.5 text-muted-foreground/40 transition-colors hover:text-muted-foreground"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              {isSearching && (
                <p className="mt-1.5 px-1 text-[11px] text-muted-foreground/50">
                  {isSearchFetching
                    ? 'Suche...'
                    : `${searchResults.length} Ergebnis${searchResults.length !== 1 ? 'se' : ''} für „${debouncedQuery}"`}
                </p>
              )}
            </div>
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
                  searchQuery={isSearching ? debouncedQuery : undefined}
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

            {displayNotes.length === 0 && !isSearching && (
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

            {displayNotes.length === 0 && isSearching && !isSearchFetching && (
              <div className="py-24 text-center">
                <Search size={28} className="mx-auto mb-3 text-muted-foreground/20" />
                <p className="text-[13px] text-muted-foreground/50">
                  Keine Notizen für „{debouncedQuery}" gefunden
                </p>
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
  contact_id?: string | null
  company_id?: string | null
  contact?: { id: string; first_name: string | null; last_name: string | null } | null
  company?: { id: string; name: string | null } | null
  created_at: Date
  updated_at: Date
  _count?: { children: number }
}

function highlightMatch(text: string, query: string | undefined): React.ReactNode {
  if (!query || !text) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-yellow-200/60 px-0.5 dark:bg-yellow-800/40">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

function NoteCard({
  note,
  searchQuery,
  showContextMenu,
  onToggleContextMenu,
  onDelete,
  onTogglePin,
  onArchive,
}: {
  note: NoteItem
  searchQuery?: string
  showContextMenu: boolean
  onToggleContextMenu: () => void
  onDelete: () => void
  onTogglePin: () => void
  onArchive: () => void
}) {
  const router = useRouter()
  const fullText = note.content_text ?? ''
  let preview: string
  if (searchQuery && fullText) {
    const idx = fullText.toLowerCase().indexOf(searchQuery.toLowerCase())
    if (idx > 30) {
      preview = '...' + fullText.slice(idx - 20, idx + 100)
    } else {
      preview = fullText.slice(0, 120)
    }
  } else {
    preview = fullText.slice(0, 120)
  }
  const contactName = [note.contact?.first_name, note.contact?.last_name].filter(Boolean).join(' ')
  const hasContact = Boolean(note.contact_id)
  const hasCompany = Boolean(note.company_id)

  return (
    <div
      onClick={() => router.push(`/notes/${note.id}`)}
      className="group relative cursor-pointer rounded-lg border border-border bg-card p-3.5 shadow-sm transition-all hover:border-border/80 hover:shadow-md"
    >
      <div className="mb-1.5 flex items-start justify-between">
        <h3 className="text-[13px] font-medium text-foreground line-clamp-1">
          {searchQuery ? highlightMatch(note.title || 'Ohne Titel', searchQuery) : (note.title || 'Ohne Titel')}
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
        {searchQuery ? highlightMatch(preview, searchQuery) : (preview || 'Leere Notiz')}
      </p>

      {(hasContact || hasCompany) && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {hasContact && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
              <User size={10} />
              {contactName || 'Person'}
            </span>
          )}
          {hasCompany && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-950/30 dark:text-orange-300">
              <Building2 size={10} />
              {note.company?.name || 'Unternehmen'}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <p className="text-[11px] text-muted-foreground/40">
          {formatRelativeDate(note.updated_at instanceof Date ? note.updated_at.toISOString() : String(note.updated_at))}
        </p>
        {(note._count?.children ?? 0) > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/40">
            <Layers size={9} />
            {note._count!.children}
          </span>
        )}
      </div>

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
