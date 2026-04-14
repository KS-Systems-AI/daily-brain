/** Columns present on every table */
export interface BaseRecord {
  id: string
  workspace_id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type RecordType = 'contact' | 'company' | 'deal' | 'custom'

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }
