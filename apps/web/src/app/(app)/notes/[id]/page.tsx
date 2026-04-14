'use client'

import { use } from 'react'
import { NoteEditorPage } from '@/components/notes/note-editor-page'

export default function NoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return <NoteEditorPage noteId={id} />
}
