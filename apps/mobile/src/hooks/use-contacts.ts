import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/supabase/workspace'

export function useContacts(search?: string) {
  const { workspaceId } = useWorkspace()

  return useQuery({
    queryKey: ['contacts', workspaceId, search],
    enabled: !!workspaceId,
    queryFn: async () => {
      let query = supabase
        .from('contacts')
        .select('id, first_name, last_name, email, phone, company_id, companies(id, name)')
        .eq('workspace_id', workspaceId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50)

      if (search) {
        query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%`)
      }

      const { data, error } = await query
      if (error) throw error

      return (data ?? []).map((c: any) => ({
        ...c,
        company: c.companies ?? null,
        companies: undefined,
      }))
    },
  })
}

export function useContact(id: string | undefined) {
  const { workspaceId } = useWorkspace()

  return useQuery({
    queryKey: ['contact', id],
    enabled: !!id && !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('*, companies(id, name, domain)')
        .eq('id', id!)
        .eq('workspace_id', workspaceId!)
        .is('deleted_at', null)
        .single()
      if (error) throw error
      return {
        ...data,
        company: (data as any).companies ?? null,
        companies: undefined,
      }
    },
  })
}

export function useCreateContact() {
  const qc = useQueryClient()
  const { workspaceId } = useWorkspace()

  return useMutation({
    mutationFn: async (input: {
      first_name: string
      last_name?: string
      email?: string[]
      phone?: string[]
      company_id?: string
    }) => {
      const { data, error } = await supabase
        .from('contacts')
        .insert({
          workspace_id: workspaceId!,
          first_name: input.first_name,
          last_name: input.last_name ?? null,
          email: input.email ?? [],
          phone: input.phone ?? [],
          company_id: input.company_id ?? null,
          attrs: {},
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })
}

export function useUpdateContact() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { id: string; data: Record<string, unknown> }) => {
      const { error } = await supabase
        .from('contacts')
        .update({ ...input.data, updated_at: new Date().toISOString() })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      qc.invalidateQueries({ queryKey: ['contact', vars.id] })
    },
  })
}

export function useDeleteContact() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('contacts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })
}
