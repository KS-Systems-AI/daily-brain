'use client'

import { trpc } from '@/lib/trpc/provider'
import { TiptapEditor } from '@/components/editor/tiptap-editor'
import { EditorNoteProvider } from '@/components/editor/editor-context'
import { Loader2 } from 'lucide-react'
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
      skipNextRemoteEditorSyncRef.current = true
    },
    onError: () => {
      skipNextRemoteEditorSyncRef.current = false
    },
    onSettled: () => {
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

  const isSaving = saveContent.isPending || updateNote.isPending
  const saveLabel = isSaving ? 'Speichert…' : 'Automatisch gespeichert'
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

  return (
    <EditorNoteProvider
      value={{ currentNoteId: noteId, createChildNote: handleCreateChildNote, saveNow: handleSaveNow, onSubNoteRemove: handleSubNoteRemove }}
    >
      <div className="flex h-full flex-col overflow-y-auto px-4 py-2 md:px-6 md:py-3">
        <div className="rounded-[28px] border border-[#E8ECF2] bg-[linear-gradient(180deg,#FFFFFF_0%,#FCFDFE_100%)] shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
          <div className="border-b border-[#EDF1F5] px-4 py-2.5 md:px-6">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#F3F6FA] px-3 py-1 text-[11px] font-medium text-[#667085]">
                Dokument
              </span>
              <span className="rounded-full bg-[#FFF4EC] px-3 py-1 text-[11px] font-medium text-[#D56A34]">
                {saveLabel}
              </span>
              {note.parent_id && (
                <span className="rounded-full bg-[#EEF4FF] px-3 py-1 text-[11px] font-medium text-[#1D4ED8]">
                  Unternotiz
                </span>
              )}
            </div>

            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Ohne Titel"
              className="mb-2 w-full bg-transparent text-[28px] font-semibold tracking-[-0.04em] text-foreground outline-none placeholder:text-[#B4BDC9] md:text-[34px]"
            />

            <div className="rounded-[20px] border border-[#EEF2F6] bg-[#FAFBFC] p-1.5">
              <RecordSelector
                value={linkedRecord}
                onChange={handleRecordChange}
                placeholder="Person oder Firma verknüpfen..."
                className="w-full"
              />
            </div>
          </div>

          <div className="px-4 py-4 md:px-6 md:py-5">
            <TiptapEditor
              key={`${noteId}-${editorVersion}`}
              content={editorContent as Record<string, unknown>}
              onChange={handleContentChange}
              onEditorReady={(e) => { editorRef.current = e }}
              placeholder="Schreib etwas oder drücke / für Befehle..."
            />
          </div>

        </div>

        <div className="h-3" />
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
