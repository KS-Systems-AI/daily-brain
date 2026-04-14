'use client'

import { trpc } from '@/lib/trpc/provider'
import { TiptapEditor } from '@/components/editor/tiptap-editor'
import { ArrowLeft, Pin, Trash2, MoreHorizontal, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useCallback, useEffect, useRef } from 'react'
import { RecordSelector, type SelectedRecord } from '@/components/common/record-selector'

interface NoteEditorPageProps {
  noteId: string
}

const AUTOSAVE_DELAY = 1200

export function NoteEditorPage({ noteId }: NoteEditorPageProps) {
  const router = useRouter()
  const utils = trpc.useUtils()
  const [title, setTitle] = useState('')
  const [showMenu, setShowMenu] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [linkedRecord, setLinkedRecord] = useState<SelectedRecord | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingContentRef = useRef<Record<string, unknown> | null>(null)
  const pendingTitleRef = useRef<string | null>(null)

  const { data: note, isLoading } = trpc.notes.getById.useQuery(
    { id: noteId },
    { refetchOnWindowFocus: false },
  )

  const saveContent = trpc.notes.saveFromTiptap.useMutation({
    onMutate: () => setIsSaving(true),
    onSettled: () => {
      setIsSaving(false)
      utils.notes.list.invalidate()
    },
  })

  const updateNote = trpc.notes.update.useMutation({
    onSuccess: () => utils.notes.list.invalidate(),
  })

  const deleteNote = trpc.notes.delete.useMutation({
    onSuccess: () => {
      utils.notes.list.invalidate()
      router.push('/notes')
    },
  })

  const saveContentRef = useRef(saveContent)
  saveContentRef.current = saveContent
  const updateNoteRef = useRef(updateNote)
  updateNoteRef.current = updateNote

  useEffect(() => {
    if (!note) return
    setTitle(note.title ?? '')
    if (note.contact_id) {
      setLinkedRecord({ id: note.contact_id, type: 'contact', label: '' })
    } else if (note.company_id) {
      setLinkedRecord({ id: note.company_id, type: 'company', label: '' })
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
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <button
          onClick={() => router.push('/notes')}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft size={14} />
          Notizen
        </button>
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
        content={note.tiptap_content as unknown as Record<string, unknown>}
        onChange={handleContentChange}
        placeholder="Schreib etwas..."
      />
    </div>
  )
}
