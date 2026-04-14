import type { BaseRecord, RecordType, JsonValue } from './base'

export interface Note extends BaseRecord {
  record_type: RecordType | null
  record_id: string | null
  title: string | null
  content: JsonValue // ProseMirror JSON
  content_text: string | null
  content_markdown: string | null
  linked_event_id: string | null
  author_id: string
  is_pinned: boolean
  ai_summary: string | null
  source: 'manual' | 'voice' | 'email' | null
}

export type NoteCreateInput = {
  record_type?: RecordType
  record_id?: string
  title?: string
  content?: JsonValue
  content_text?: string
  content_markdown?: string
  linked_event_id?: string
  is_pinned?: boolean
}

export type NoteUpdateInput = Partial<NoteCreateInput>
