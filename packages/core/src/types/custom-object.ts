import type { BaseRecord, JsonValue } from './base'

export type AttributeType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'select'
  | 'multi_select'
  | 'relation'
  | 'url'
  | 'email'
  | 'phone'

export interface CustomObject extends BaseRecord {
  slug: string
  label: string
  label_plural: string
  icon: string | null
  description: string | null
}

export interface Attribute extends BaseRecord {
  object_slug: string
  key: string
  label: string
  type: AttributeType
  config: Record<string, JsonValue>
  is_required: boolean
  position: number
}

export interface CustomRecord extends BaseRecord {
  object_slug: string
  attrs: Record<string, JsonValue>
}

export interface Relation extends BaseRecord {
  from_type: string
  from_id: string
  to_type: string
  to_id: string
  label: string | null
}
