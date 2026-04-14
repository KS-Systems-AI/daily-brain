import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/supabase/workspace'

export function useCompanies(search?: string) {
  const { workspaceId } = useWorkspace()

  return useQuery({
    queryKey: ['companies', workspaceId, search],
    enabled: !!workspaceId,
    queryFn: async () => {
      let query = supabase
        .from('companies')
        .select('id, name, domain')
        .eq('workspace_id', workspaceId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50)

      if (search) {
        query = query.or(`name.ilike.%${search}%,domain.ilike.%${search}%`)
      }

      const { data, error } = await query
      if (error) throw error
      return data ?? []
    },
  })
}
