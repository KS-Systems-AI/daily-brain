import type { BaseRecord, JsonValue } from './base'

export interface Company extends BaseRecord {
  name: string
  domain: string | null
  industry: string | null
  size: string | null
  logo_url: string | null
  attrs: Record<string, JsonValue>
}

export type CompanyCreateInput = {
  name: string
  domain?: string
  industry?: string
  size?: string
  attrs?: Record<string, JsonValue>
}

export type CompanyUpdateInput = Partial<CompanyCreateInput>
