'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { trpc } from '@/lib/trpc/provider'

/**
 * Subscribes to Supabase Realtime changes on the `notes` table
 * and invalidates note queries so list + editor stay in sync.
 */
export function useNoteRealtime() {
  const utils = trpc.useUtils()

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('notes-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notes' },
        () => {
          utils.notes.list.invalidate()
          utils.notes.getById.invalidate()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [utils])
}
