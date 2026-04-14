import type { BaseRecord, JsonValue } from './base'

export type DealStage = string // dynamic, from pipeline_stages

export interface Deal extends BaseRecord {
  title: string
  value: number | null // stored as integer cents
  currency: string
  stage: string
  pipeline_id: string
  contact_id: string | null
  company_id: string | null
  owner_id: string | null
  close_date: string | null
  attrs: Record<string, JsonValue>
}

export type DealCreateInput = {
  title: string
  pipeline_id: string
  stage: string
  value?: number
  currency?: string
  contact_id?: string
  company_id?: string
  owner_id?: string
  close_date?: string
  attrs?: Record<string, JsonValue>
}

export type DealUpdateInput = Partial<DealCreateInput>
