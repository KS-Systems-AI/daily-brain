import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './client'

interface WorkspaceCtx {
  workspaceId: string | null
  userId: string | null
  loading: boolean
}

const Ctx = createContext<WorkspaceCtx>({ workspaceId: null, userId: null, loading: true })

export function useWorkspace() {
  return useContext(Ctx)
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceCtx>({
    workspaceId: null,
    userId: null,
    loading: true,
  })

  useEffect(() => {
    let mounted = true

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !mounted) {
        setState({ workspaceId: null, userId: null, loading: false })
        return
      }

      const { data: member } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .limit(1)
        .single()

      if (mounted) {
        setState({
          workspaceId: member?.workspace_id ?? null,
          userId: user.id,
          loading: false,
        })
      }
    }

    load()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      load()
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>
}
