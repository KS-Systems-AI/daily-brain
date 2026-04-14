'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { trpc } from '@/lib/trpc/provider'

/**
 * Subscribes to Supabase Realtime changes on the `tasks` table
 * and invalidates the tRPC task queries so all components stay in sync.
 */
export function useTaskRealtime() {
  const utils = trpc.useUtils()

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('tasks-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        () => {
          utils.tasks.list.invalidate()
          utils.tasks.completed.invalidate()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [utils])
}
