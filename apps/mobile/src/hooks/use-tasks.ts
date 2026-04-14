import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, createRealtimeChannelId } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/supabase/workspace'

const TASK_SELECT =
  'id, title, description, due_at, end_at, completed_at, status, priority, position, contact_id, company_id, created_at, updated_at, contact:contacts!tasks_contact_id_fkey(id,first_name,last_name), company:companies!tasks_company_id_fkey(id,name)'

export function useTasks() {
  const { workspaceId } = useWorkspace()

  return useQuery({
    queryKey: ['tasks', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select(TASK_SELECT)
        .eq('workspace_id', workspaceId!)
        .is('deleted_at', null)
        .or('status.eq.todo,status.eq.in_progress,status.is.null')
        .order('position', { ascending: true })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useCompletedTasks() {
  const { workspaceId } = useWorkspace()

  return useQuery({
    queryKey: ['tasks-completed', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select(TASK_SELECT)
        .eq('workspace_id', workspaceId!)
        .is('deleted_at', null)
        .or('status.eq.done,status.eq.cancelled')
        .order('completed_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data ?? []
    },
  })
}

export function useTask(id: string | undefined) {
  const { workspaceId } = useWorkspace()

  return useQuery({
    queryKey: ['task', id],
    enabled: !!id && !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select(TASK_SELECT)
        .eq('id', id!)
        .eq('workspace_id', workspaceId!)
        .is('deleted_at', null)
        .single()
      if (error) throw error
      return data
    },
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  const { workspaceId, userId } = useWorkspace()

  return useMutation({
    mutationFn: async (input: {
      title: string
      description?: string
      due_at?: string | null
      end_at?: string | null
      contact_id?: string | null
      company_id?: string | null
    }) => {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          workspace_id: workspaceId!,
          author_id: userId!,
          title: input.title,
          description: input.description ?? null,
          due_at: input.due_at ?? null,
          end_at: input.end_at ?? null,
          contact_id: input.contact_id ?? null,
          company_id: input.company_id ?? null,
          status: 'todo',
          priority: 'none',
          position: 0,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      id: string
      title?: string
      description?: string | null
      due_at?: string | null
      end_at?: string | null
      status?: string
      completed_at?: string | null
      contact_id?: string | null
      company_id?: string | null
    }) => {
      const { id, ...patch } = input

      if (patch.status === 'done' && !patch.completed_at) {
        patch.completed_at = new Date().toISOString()
      }
      if (patch.status && patch.status !== 'done') {
        patch.completed_at = null
      }

      const { error } = await supabase
        .from('tasks')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['tasks-completed'] })
      qc.invalidateQueries({ queryKey: ['task', vars.id] })
    },
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('tasks')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['tasks-completed'] })
    },
  })
}

export function useTaskRealtime() {
  const qc = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel(createRealtimeChannelId('mobile-tasks'))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        () => {
          qc.invalidateQueries({ queryKey: ['tasks'] })
          qc.invalidateQueries({ queryKey: ['tasks-completed'] })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [qc])
}
