'use client'

import { createContext, useContext } from 'react'

interface EditorNoteContext {
  currentNoteId: string | null
  createChildNote: () => Promise<{ id: string; title: string } | null>
  saveNow: (content: Record<string, unknown>) => void
  onSubNoteRemove: (noteId: string) => void
}

const EditorNoteCtx = createContext<EditorNoteContext>({
  currentNoteId: null,
  createChildNote: async () => null,
  saveNow: () => {},
  onSubNoteRemove: () => {},
})

export function EditorNoteProvider({
  children,
  value,
}: {
  children: React.ReactNode
  value: EditorNoteContext
}) {
  return <EditorNoteCtx.Provider value={value}>{children}</EditorNoteCtx.Provider>
}

export function useEditorNote() {
  return useContext(EditorNoteCtx)
}
