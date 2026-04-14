import type { BaseRecord } from './base'

export type EmailProvider = 'gmail' | 'outlook'
export type EmailDirection = 'inbound' | 'outbound'

export interface EmailAccount extends BaseRecord {
  provider: EmailProvider
  email: string
  user_id: string
  access_token: string
  refresh_token: string
  expires_at: string | null
  is_active: boolean
}

export interface EmailThread extends BaseRecord {
  external_id: string
  subject: string
  participants: string[] // email addresses
  record_id: string | null
  record_type: string | null
  last_message_at: string
}

export interface EmailMessage extends BaseRecord {
  thread_id: string
  body: string
  body_text: string | null
  from_addr: string
  to_addrs: string[]
  sent_at: string
  direction: EmailDirection
  external_id: string
}
