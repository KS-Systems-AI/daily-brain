import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/supabase/workspace'
import { type EditorBlock, blocksToTiptap } from '@/lib/tiptap-blocks'

export function useNotes() {
  const { workspaceId } = useWorkspace()

  return useQuery({
    queryKey: ['notes', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notes')
        .select('id, title, content_text, is_pinned, is_archived, created_at, updated_at')
        .eq('workspace_id', workspaceId!)
        .is('deleted_at', null)
        .eq('is_archived', false)
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data
    },
  })
}

export function useNote(id: string | undefined) {
  const { workspaceId } = useWorkspace()

  return useQuery({
    queryKey: ['note', id],
    enabled: !!id && !!workspaceId,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data: note, error } = await supabase
        .from('notes')
        .select('*')
        .eq('id', id!)
        .eq('workspace_id', workspaceId!)
        .is('deleted_at', null)
        .single()
      if (error) throw error

      const { data: blocks } = await supabase
        .from('note_blocks')
        .select('*')
        .eq('note_id', id!)
        .order('sort_order', { ascending: true })

      return { ...note, blocks: blocks ?? [] }
    },
  })
}

export function useCreateNote() {
  const qc = useQueryClient()
  const { workspaceId, userId } = useWorkspace()

  return useMutation({
    mutationFn: async (input: { title?: string }) => {
      const { data, error } = await supabase
        .from('notes')
        .insert({
          workspace_id: workspaceId!,
          author_id: userId!,
          title: input.title ?? null,
          content: {},
          content_text: '',
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  })
}

export function useUpdateNote() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      id: string
      title?: string
      is_pinned?: boolean
      is_archived?: boolean
    }) => {
      const { id, ...updates } = input
      const { error } = await supabase
        .from('notes')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  })
}

export function useDeleteNote() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  })
}

export function useSaveNoteContent() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { noteId: string; blocks: EditorBlock[] }) => {
      const tiptapJson = blocksToTiptap(input.blocks)
      const contentText = input.blocks.map((b) => b.plaintext).join('\n')

      await supabase
        .from('note_blocks')
        .delete()
        .eq('note_id', input.noteId)

      if (input.blocks.length > 0) {
        const rows = input.blocks.map((b, i) => ({
          note_id: input.noteId,
          block_type: b.block_type,
          plaintext: b.plaintext,
          styles: [],
          sort_order: String(i).padStart(10, '0'),
          indent: b.indent,
          attrs: b.attrs,
        }))
        await supabase.from('note_blocks').insert(rows)
      }

      const { error } = await supabase
        .from('notes')
        .update({
          content: tiptapJson,
          content_text: contentText,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.noteId)

      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['notes'] })
      qc.invalidateQueries({ queryKey: ['note', vars.noteId] })
    },
  })
}
