import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/supabase/workspace'

export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  location: string | null
  start_at: string
  end_at: string
  is_all_day: boolean
  attendees: unknown
  organizer_email: string | null
  status: string
  record_type: string | null
  record_id: string | null
  account_id: string
  created_at: string
}

export function useCalendarEvents(startAt: Date, endAt: Date) {
  const { workspaceId } = useWorkspace()

  return useQuery({
    queryKey: ['calendar-events', workspaceId, startAt.toISOString(), endAt.toISOString()],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('id, title, description, location, start_at, end_at, is_all_day, attendees, organizer_email, status, record_type, record_id, account_id, created_at')
        .eq('workspace_id', workspaceId!)
        .is('deleted_at', null)
        .neq('status', 'cancelled')
        .lte('start_at', endAt.toISOString())
        .gte('end_at', startAt.toISOString())
        .order('start_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as CalendarEvent[]
    },
  })
}

export function useCalendarAccounts() {
  const { workspaceId } = useWorkspace()

  return useQuery({
    queryKey: ['calendar-accounts', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_accounts')
        .select('id, provider, email, display_name, last_synced_at, calendar_id')
        .eq('workspace_id', workspaceId!)
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })
}
