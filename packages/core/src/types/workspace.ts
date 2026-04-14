import type { BaseRecord } from './base'

export interface Workspace extends BaseRecord {
  name: string
  slug: string
  logo_url: string | null
  plan: 'free' | 'pro' | 'enterprise'
}

export interface WorkspaceMember extends BaseRecord {
  user_id: string
  role: 'owner' | 'admin' | 'member'
  joined_at: string
}
