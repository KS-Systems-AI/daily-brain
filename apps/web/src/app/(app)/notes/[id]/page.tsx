'use client'

import { use } from 'react'
import { NoteEditorPage } from '@/components/notes/note-editor-page'
import { CraftNoteLayout } from '@/components/notes/craft-note-layout'

export default function NoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return (
    <CraftNoteLayout noteId={id}>
      <NoteEditorPage noteId={id} />
    </CraftNoteLayout>
  )
}
