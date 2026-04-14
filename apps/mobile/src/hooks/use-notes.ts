import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, createRealtimeChannelId } from '@/lib/supabase/client'
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
        .select(
          'id, title, content_text, is_pinned, is_archived, parent_id, contact_id, company_id, created_at, updated_at, contact:contacts!notes_contact_id_fkey(id,first_name,last_name), company:companies!notes_company_id_fkey(id,name)',
        )
        .eq('workspace_id', workspaceId!)
        .is('deleted_at', null)
        .eq('is_archived', false)
        .is('parent_id', null)
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(50)
      if (error) throw error

      const noteIds = data.map((n) => n.id)
      let childCounts: Record<string, number> = {}
      if (noteIds.length > 0) {
        const { data: children } = await supabase
          .from('notes')
          .select('parent_id')
          .in('parent_id', noteIds)
          .is('deleted_at', null)
        if (children) {
          for (const c of children) {
            if (c.parent_id) {
              childCounts[c.parent_id] = (childCounts[c.parent_id] ?? 0) + 1
            }
          }
        }
      }

      return data.map((n) => ({
        ...n,
        children_count: childCounts[n.id] ?? 0,
      }))
    },
  })
}

const NOTE_DETAIL_POLL_MS = 6_000

type NoteDetail = Awaited<ReturnType<typeof fetchNoteDetailFromSupabase>>

async function fetchNoteDetailFromSupabase(noteId: string, workspaceId: string) {
  const { data: note, error } = await supabase
    .from('notes')
    .select(
      '*, contact:contacts!notes_contact_id_fkey(id,first_name,last_name), company:companies!notes_company_id_fkey(id,name)',
    )
    .eq('id', noteId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .single()
  if (error) throw error

  const { data: blocks } = await supabase
    .from('note_blocks')
    .select('*')
    .eq('note_id', noteId)
    .order('sort_order', { ascending: true })

  return { ...note, blocks: blocks ?? [] }
}

export function useNote(id: string | undefined) {
  const { workspaceId } = useWorkspace()
  const qc = useQueryClient()

  return useQuery({
    queryKey: ['note', id],
    enabled: !!id && !!workspaceId,
    refetchOnWindowFocus: false,
    refetchInterval: NOTE_DETAIL_POLL_MS,
    queryFn: async () => {
      const fresh = await fetchNoteDetailFromSupabase(id!, workspaceId!)
      const existing = qc.getQueryData<NoteDetail>(['note', id!])
      const exAt =
        existing?.updated_at != null ? String(existing.updated_at) : ''
      const frAt = fresh.updated_at != null ? String(fresh.updated_at) : ''
      if (exAt && frAt && exAt > frAt) {
        return existing
      }
      return fresh
    },
  })
}

export function useNoteChildren(noteId: string | undefined) {
  const { workspaceId } = useWorkspace()

  return useQuery({
    queryKey: ['note-children', noteId],
    enabled: !!noteId && !!workspaceId,
    refetchInterval: NOTE_DETAIL_POLL_MS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notes')
        .select('id, title, content_text, position, updated_at')
        .eq('workspace_id', workspaceId!)
        .eq('parent_id', noteId!)
        .is('deleted_at', null)
        .order('position', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

export function useNoteBreadcrumbs(noteId: string | undefined) {
  const { workspaceId } = useWorkspace()

  return useQuery({
    queryKey: ['note-breadcrumbs', noteId],
    enabled: !!noteId && !!workspaceId,
    refetchInterval: NOTE_DETAIL_POLL_MS * 2,
    queryFn: async () => {
      const crumbs: { id: string; title: string | null }[] = []
      let currentId = noteId!

      const { data: note } = await supabase
        .from('notes')
        .select('parent_id')
        .eq('id', currentId)
        .single()

      let parentId = note?.parent_id
      while (parentId) {
        const { data: parent } = await supabase
          .from('notes')
          .select('id, title, parent_id')
          .eq('id', parentId)
          .single()
        if (!parent) break
        crumbs.unshift({ id: parent.id, title: parent.title })
        parentId = parent.parent_id
      }

      return crumbs
    },
  })
}

export function useCreateNote() {
  const qc = useQueryClient()
  const { workspaceId, userId } = useWorkspace()

  return useMutation({
    mutationFn: async (input: { title?: string; contact_id?: string | null; company_id?: string | null; parent_id?: string | null }) => {
      const maxPos = input.parent_id
        ? await supabase
            .from('notes')
            .select('position')
            .eq('parent_id', input.parent_id)
            .is('deleted_at', null)
            .order('position', { ascending: false })
            .limit(1)
            .then(({ data }) => (data?.[0]?.position ?? -1) + 1)
        : 0

      const { data, error } = await supabase
        .from('notes')
        .insert({
          workspace_id: workspaceId!,
          author_id: userId!,
          title: input.title ?? null,
          content: {},
          content_text: '',
          contact_id: input.contact_id ?? null,
          company_id: input.company_id ?? null,
          parent_id: input.parent_id ?? null,
          position: maxPos,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['notes'] })
      if (vars.parent_id) {
        qc.invalidateQueries({ queryKey: ['note-children', vars.parent_id] })
      }
    },
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
      contact_id?: string | null
      company_id?: string | null
      parent_id?: string | null
    }) => {
      const { id, ...updates } = input
      const { error } = await supabase
        .from('notes')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes'] })
      qc.invalidateQueries({ queryKey: ['note-children'] })
    },
  })
}

export function useSearchNotes(search: string, enabled: boolean) {
  const { workspaceId } = useWorkspace()

  return useQuery({
    queryKey: ['notes-search', workspaceId, search],
    enabled: enabled && !!workspaceId,
    queryFn: async () => {
      let query = supabase
        .from('notes')
        .select('id, title')
        .eq('workspace_id', workspaceId!)
        .is('deleted_at', null)
        .is('parent_id', null)
        .order('updated_at', { ascending: false })
        .limit(30)
      if (search.trim()) {
        query = query.ilike('title', `%${search.trim()}%`)
      }
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export function useDeleteNote() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const now = new Date().toISOString()
      const idsToDelete = [id]
      const queue = [id]

      while (queue.length > 0) {
        const parentId = queue.shift()!
        const { data: children } = await supabase
          .from('notes')
          .select('id')
          .eq('parent_id', parentId)
          .is('deleted_at', null)
        if (children) {
          for (const child of children) {
            idsToDelete.push(child.id)
            queue.push(child.id)
          }
        }
      }

      const { error } = await supabase
        .from('notes')
        .update({ deleted_at: now })
        .in('id', idsToDelete)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes'] })
      qc.invalidateQueries({ queryKey: ['note-children'] })
    },
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
      qc.invalidateQueries({ queryKey: ['note-children', vars.noteId] })
    },
  })
}

type NotesRealtimePayload = {
  eventType?: 'INSERT' | 'UPDATE' | 'DELETE'
  new: Record<string, unknown> | null
  old: Record<string, unknown> | null
}

function collectParentIds(row: Record<string, unknown> | null) {
  const ids: string[] = []
  if (!row || Object.keys(row).length === 0) return ids
  const p = row.parent_id
  if (typeof p === 'string' && p.length > 0) ids.push(p)
  return ids
}

export function useNoteRealtime() {
  const qc = useQueryClient()
  const { workspaceId } = useWorkspace()

  useEffect(() => {
    if (!workspaceId) return

    const onNotesChange = (payload: NotesRealtimePayload) => {
      const rowNew =
        payload.new && Object.keys(payload.new).length > 0 ? payload.new : null
      const rowOld =
        payload.old && Object.keys(payload.old).length > 0 ? payload.old : null
      const row = rowNew ?? rowOld
      if (!row || row.workspace_id !== workspaceId) return

      const noteId = String(row.id)
      const parentIds = new Set<string>()
      for (const pid of collectParentIds(rowNew)) parentIds.add(pid)
      for (const pid of collectParentIds(rowOld)) parentIds.add(pid)

      qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
      qc.invalidateQueries({ queryKey: ['note', noteId] })
      for (const pid of parentIds) {
        qc.invalidateQueries({ queryKey: ['note-children', pid] })
      }
      qc.invalidateQueries({ queryKey: ['note-breadcrumbs', noteId] })
    }

    const channel = supabase
      .channel(createRealtimeChannelId(`mobile-notes-${workspaceId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, onNotesChange)
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [qc, workspaceId])
}
