'use client'

import { trpc } from '@/lib/trpc/provider'
import { TiptapEditor } from '@/components/editor/tiptap-editor'
import { EditorNoteProvider } from '@/components/editor/editor-context'
import {
  ArrowLeft,
  Pin,
  Trash2,
  MoreHorizontal,
  Loader2,
  ChevronRight,
  FileText,
  Plus,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { RecordSelector, type SelectedRecord } from '@/components/common/record-selector'
import { SubNoteRemoveDialog } from '@/components/notes/sub-note-remove-dialog'
import { setSubNoteRemoveHandler } from '@/components/editor/sub-note-node'

interface NoteEditorPageProps {
  noteId: string
}

const AUTOSAVE_DELAY = 1200

function noteUpdatedAtKey(n: { updated_at?: Date | string | null }): string {
  const u = n.updated_at
  if (u instanceof Date) return u.toISOString()
  return String(u ?? '')
}

export function NoteEditorPage({ noteId }: NoteEditorPageProps) {
  const router = useRouter()
  const utils = trpc.useUtils()
  const [title, setTitle] = useState('')
  const [showMenu, setShowMenu] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [linkedRecord, setLinkedRecord] = useState<SelectedRecord | null>(null)
  const [pendingRemoveNoteId, setPendingRemoveNoteId] = useState<string | null>(null)
  const [editorVersion, setEditorVersion] = useState(0)
  const editorRef = useRef<{ getJSON: () => Record<string, unknown> } | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingContentRef = useRef<Record<string, unknown> | null>(null)
  const pendingTitleRef = useRef<string | null>(null)
  const prevNoteUpdatedAtRef = useRef<string | null>(null)
  const skipNextRemoteEditorSyncRef = useRef(false)

  const { data: note, isLoading } = trpc.notes.getById.useQuery(
    { id: noteId },
    { refetchOnWindowFocus: false },
  )

  const saveContent = trpc.notes.saveFromTiptap.useMutation({
    onMutate: () => {
      setIsSaving(true)
      skipNextRemoteEditorSyncRef.current = true
    },
    onError: () => {
      skipNextRemoteEditorSyncRef.current = false
    },
    onSettled: () => {
      setIsSaving(false)
      utils.notes.list.invalidate()
      utils.notes.getById.invalidate({ id: noteId })
    },
  })

  const updateNote = trpc.notes.update.useMutation({
    onSuccess: () => utils.notes.list.invalidate(),
  })

  const deleteNote = trpc.notes.delete.useMutation({
    onSuccess: () => {
      utils.notes.list.invalidate()
      if (note?.parent_id) {
        utils.notes.getById.invalidate({ id: note.parent_id })
        router.push(`/notes/${note.parent_id}`)
      } else {
        router.push('/notes')
      }
    },
  })

  const createChildNote = trpc.notes.create.useMutation({
    onSuccess: () => {
      utils.notes.list.invalidate()
    },
  })

  const saveContentRef = useRef(saveContent)
  saveContentRef.current = saveContent
  const updateNoteRef = useRef(updateNote)
  updateNoteRef.current = updateNote

  useEffect(() => {
    prevNoteUpdatedAtRef.current = null
    skipNextRemoteEditorSyncRef.current = false
  }, [noteId])

  useEffect(() => {
    if (!note) return
    const key = noteUpdatedAtKey(note)
    if (prevNoteUpdatedAtRef.current === null) {
      prevNoteUpdatedAtRef.current = key
      return
    }
    if (prevNoteUpdatedAtRef.current === key) return
    prevNoteUpdatedAtRef.current = key

    if (skipNextRemoteEditorSyncRef.current) {
      skipNextRemoteEditorSyncRef.current = false
      return
    }

    setTitle(note.title ?? '')
    setEditorVersion((v) => v + 1)
  }, [note, note?.updated_at])

  useEffect(() => {
    if (!note) return
    setTitle(note.title ?? '')
    if (note.contact_id) {
      const label = [note.contact?.first_name, note.contact?.last_name]
        .filter(Boolean)
        .join(' ')
      setLinkedRecord({ id: note.contact_id, type: 'contact', label: label || 'Kontakt' })
    } else if (note.company_id) {
      setLinkedRecord({
        id: note.company_id,
        type: 'company',
        label: note.company?.name || 'Unternehmen',
      })
    } else {
      setLinkedRecord(null)
    }
  }, [note])

  const handleTitleChange = useCallback(
    (value: string) => {
      setTitle(value)
      pendingTitleRef.current = value
      if (titleTimerRef.current) clearTimeout(titleTimerRef.current)
      titleTimerRef.current = setTimeout(() => {
        updateNoteRef.current.mutate({ id: noteId, title: value })
        pendingTitleRef.current = null
      }, AUTOSAVE_DELAY)
    },
    [noteId],
  )

  const handleRecordChange = useCallback(
    (record: SelectedRecord | null) => {
      setLinkedRecord(record)
      updateNoteRef.current.mutate({
        id: noteId,
        contact_id: record?.type === 'contact' ? record.id : null,
        company_id: record?.type === 'company' ? record.id : null,
      })
    },
    [noteId],
  )

  const handleContentChange = useCallback(
    (content: Record<string, unknown>) => {
      pendingContentRef.current = content
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        saveContentRef.current.mutate({ note_id: noteId, tiptap_json: content })
        pendingContentRef.current = null
      }, AUTOSAVE_DELAY)
    },
    [noteId],
  )

  const handleSaveNow = useCallback(
    (content: Record<string, unknown>) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      pendingContentRef.current = null
      saveContentRef.current.mutate({ note_id: noteId, tiptap_json: content })
    },
    [noteId],
  )

  const handleSubNoteRemove = useCallback((childNoteId: string) => {
    setPendingRemoveNoteId(childNoteId)
  }, [])

  useEffect(() => {
    setSubNoteRemoveHandler(handleSubNoteRemove)
    return () => setSubNoteRemoveHandler(null)
  }, [handleSubNoteRemove])

  const removeSubNoteBlockAndSave = useCallback(
    (childNoteId: string) => {
      const editor = editorRef.current
      if (!editor) return
      const json = editor.getJSON() as { type: string; content?: Array<{ type: string; attrs?: Record<string, unknown> }> }
      if (!json.content) return
      const filtered = json.content.filter(
        (node) => !(node.type === 'subNote' && node.attrs?.noteId === childNoteId),
      )
      const cleaned = { ...json, content: filtered }
      saveContentRef.current.mutate({ note_id: noteId, tiptap_json: cleaned as Record<string, unknown> })
    },
    [noteId],
  )

  const handleDialogDone = useCallback(() => {
    const removedId = pendingRemoveNoteId
    setPendingRemoveNoteId(null)
    if (removedId) {
      removeSubNoteBlockAndSave(removedId)
      setEditorVersion((v) => v + 1)
    }
    utils.notes.getById.invalidate({ id: noteId })
  }, [pendingRemoveNoteId, removeSubNoteBlockAndSave, noteId, utils])

  const handleCreateChildNote = useCallback(async () => {
    const child = await createChildNote.mutateAsync({ parent_id: noteId })
    return { id: child.id, title: child.title ?? 'Ohne Titel' }
  }, [noteId, createChildNote])

  const handleCreateAndNavigate = useCallback(async () => {
    const child = await createChildNote.mutateAsync({ parent_id: noteId })
    router.push(`/notes/${child.id}`)
  }, [noteId, createChildNote, router])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      if (titleTimerRef.current) clearTimeout(titleTimerRef.current)
      if (pendingContentRef.current) {
        saveContentRef.current.mutate({ note_id: noteId, tiptap_json: pendingContentRef.current })
        pendingContentRef.current = null
      }
      if (pendingTitleRef.current !== null) {
        updateNoteRef.current.mutate({ id: noteId, title: pendingTitleRef.current })
        pendingTitleRef.current = null
      }
    }
  }, [noteId])

  const noteChildren = note?.children ?? []

  const { editorContent, contentWasCleaned } = useMemo(() => {
    if (!note) return { editorContent: null, contentWasCleaned: false }
    const raw = note.tiptap_content as Record<string, unknown> | null
    if (!raw || !Array.isArray((raw as { content?: unknown }).content)) return { editorContent: raw, contentWasCleaned: false }
    const doc = raw as { type: string; content: Array<{ type: string; attrs?: Record<string, unknown> }> }
    const validChildIds = new Set(noteChildren.map((c) => c.id))
    const filtered = doc.content.filter(
      (node) => node.type !== 'subNote' || (node.attrs?.noteId && validChildIds.has(node.attrs.noteId as string)),
    )
    if (filtered.length === doc.content.length) return { editorContent: raw, contentWasCleaned: false }
    return { editorContent: { ...doc, content: filtered } as Record<string, unknown>, contentWasCleaned: true }
  }, [note, noteChildren])

  const cleanedSavedRef = useRef(false)
  useEffect(() => {
    if (contentWasCleaned && !cleanedSavedRef.current) {
      cleanedSavedRef.current = true
      saveContentRef.current.mutate({ note_id: noteId, tiptap_json: editorContent as Record<string, unknown> })
      setEditorVersion((v) => v + 1)
    } else if (!contentWasCleaned) {
      cleanedSavedRef.current = false
    }
  }, [contentWasCleaned, editorContent, noteId])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!note) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[13px] text-muted-foreground/40">Notiz nicht gefunden</p>
      </div>
    )
  }

  const breadcrumbs = note.breadcrumbs ?? []

  return (
    <EditorNoteProvider
      value={{ currentNoteId: noteId, createChildNote: handleCreateChildNote, saveNow: handleSaveNow, onSubNoteRemove: handleSubNoteRemove }}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <nav className="flex items-center gap-1 text-[12px]">
            <button
              onClick={() => router.push('/notes')}
              className="rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Notizen
            </button>
            {breadcrumbs.map((crumb) => (
              <span key={crumb.id} className="flex items-center gap-1">
                <ChevronRight size={11} className="text-muted-foreground/40" />
                <button
                  onClick={() => router.push(`/notes/${crumb.id}`)}
                  className="max-w-[150px] truncate rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {crumb.title || 'Ohne Titel'}
                </button>
              </span>
            ))}
            <ChevronRight size={11} className="text-muted-foreground/40" />
            <span className="max-w-[200px] truncate px-1.5 py-0.5 font-medium text-foreground">
              {title || 'Ohne Titel'}
            </span>
          </nav>

          <div className="flex items-center gap-2">
            {isSaving && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
                <Loader2 size={10} className="animate-spin" />
                Speichert...
              </span>
            )}
            <div className="relative flex items-center gap-1">
              <button
                onClick={() => updateNote.mutate({ id: noteId, is_pinned: !note.is_pinned })}
                className={`rounded p-1.5 transition-colors ${
                  note.is_pinned
                    ? 'text-foreground'
                    : 'text-muted-foreground/40 hover:text-muted-foreground'
                }`}
              >
                <Pin size={14} />
              </button>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="rounded p-1.5 text-muted-foreground/40 transition-colors hover:text-muted-foreground"
              >
                <MoreHorizontal size={14} />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-8 z-10 min-w-[130px] rounded-lg border border-border bg-popover py-1 shadow-lg">
                  <button
                    onClick={() => deleteNote.mutate({ id: noteId })}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-red-500 hover:bg-muted"
                  >
                    <Trash2 size={12} />
                    Notiz löschen
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl px-6 pt-6 pb-2">
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Ohne Titel"
              className="w-full bg-transparent text-[22px] font-semibold text-foreground placeholder-muted-foreground/30 outline-none"
              style={{ letterSpacing: '-0.02em' }}
            />
            <div className="mt-3">
              <RecordSelector
                value={linkedRecord}
                onChange={handleRecordChange}
                placeholder="Person oder Firma verknüpfen..."
              />
            </div>
          </div>

          <TiptapEditor
            key={`${noteId}-${editorVersion}`}
            content={editorContent as Record<string, unknown>}
            onChange={handleContentChange}
            onEditorReady={(e) => { editorRef.current = e }}
            placeholder="Schreib etwas..."
          />

          {/* Child notes overview */}
          <div className="mx-auto w-full max-w-2xl px-6 pb-8">
            <div className="border-t border-border pt-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium text-muted-foreground/60">
                    Unternotizen
                  </span>
                  {noteChildren.length > 0 && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {noteChildren.length}
                    </span>
                  )}
                </div>
                <button
                  onClick={handleCreateAndNavigate}
                  disabled={createChildNote.isPending}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  <Plus size={12} />
                  Erstellen
                </button>
              </div>

              {noteChildren.length === 0 ? (
                <p className="py-3 text-center text-[12px] text-muted-foreground/40">
                  Keine Unternotizen
                </p>
              ) : (
                <div className="space-y-1">
                  {noteChildren.map((child) => (
                    <button
                      key={child.id}
                      onClick={() => router.push(`/notes/${child.id}`)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted"
                    >
                      <FileText size={14} className="shrink-0 text-muted-foreground/50" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-foreground">
                          {child.title || 'Ohne Titel'}
                        </p>
                        {child.content_text && (
                          <p className="truncate text-[11px] text-muted-foreground/50">
                            {child.content_text.slice(0, 80)}
                          </p>
                        )}
                      </div>
                      {child._count.children > 0 && (
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {child._count.children}
                        </span>
                      )}
                      <ChevronRight size={13} className="shrink-0 text-muted-foreground/30" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <SubNoteRemoveDialog
        noteId={pendingRemoveNoteId}
        currentParentId={noteId}
        onClose={() => setPendingRemoveNoteId(null)}
        onDone={handleDialogDone}
      />
    </EditorNoteProvider>
  )
}
