import type { BaseRecord, JsonValue } from './base'

export interface Company extends BaseRecord {
  name: string
  domain: string | null
  industry: string | null
  size: string | null
  logo_url: string | null
  attrs: Record<string, JsonValue>
}
