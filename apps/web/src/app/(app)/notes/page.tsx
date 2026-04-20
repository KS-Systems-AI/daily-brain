import type { Metadata } from 'next'
import { Suspense } from 'react'
import { NoteList } from '@/components/notes/note-list'

export const metadata: Metadata = {
  title: 'Notizen — Daily Brain',
}

export default function NotesPage(): React.JSX.Element {
  return (
    <Suspense>
      <NoteList />
    </Suspense>
  )
}
