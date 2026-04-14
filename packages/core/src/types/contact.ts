import type { BaseRecord, JsonValue } from './base'

export interface Contact extends BaseRecord {
  first_name: string
  last_name: string | null
  email: string[]
  phone: string[]
  company_id: string | null
  avatar_url: string | null
  attrs: Record<string, JsonValue>
}

export type ContactCreateInput = {
  first_name: string
  last_name?: string
  email?: string[]
  phone?: string[]
  company_id?: string
  attrs?: Record<string, JsonValue>
}

export type ContactUpdateInput = Partial<ContactCreateInput>
