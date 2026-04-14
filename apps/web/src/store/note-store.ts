import { create } from 'zustand'

export interface Note {
  id: string
  title: string
  content: Record<string, unknown>
  icon: string | null
  cover_image: string | null
  is_pinned: boolean
  is_archived: boolean
  parent_id: string | null
  position: number
  created_at: string
  updated_at: string
}

interface NoteState {
  notes: Note[]
  loading: boolean
  selectedNoteId: string | null
  setNotes: (notes: Note[]) => void
  addNote: (note: Note) => void
  updateNote: (id: string, updates: Partial<Note>) => void
  deleteNote: (id: string) => void
  setLoading: (loading: boolean) => void
  setSelectedNoteId: (id: string | null) => void
}

export const useNoteStore = create<NoteState>((set) => ({
  notes: [],
  loading: false,
  selectedNoteId: null,
  setNotes: (notes) => set({ notes }),
  addNote: (note) => set((s) => ({ notes: [note, ...s.notes] })),
  updateNote: (id, updates) =>
    set((s) => ({
      notes: s.notes.map((n) =>
        n.id === id ? { ...n, ...updates, updated_at: new Date().toISOString() } : n,
      ),
    })),
  deleteNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
  setLoading: (loading) => set({ loading }),
  setSelectedNoteId: (id) => set({ selectedNoteId: id }),
}))
