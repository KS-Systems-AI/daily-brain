import type { BaseRecord, RecordType, JsonValue } from './base'

export type ActivityType =
  | 'note_created'
  | 'task_created'
  | 'task_completed'
  | 'deal_stage_changed'
  | 'email_sent'
  | 'email_received'
  | 'whatsapp_sent'
  | 'whatsapp_received'
  | 'telegram_sent'
  | 'telegram_received'
  | 'field_updated'
  | 'record_created'
  | 'record_linked'

export interface Activity extends BaseRecord {
  type: ActivityType
  data: Record<string, JsonValue>
  record_type: RecordType
  record_id: string
  actor_id: string
}
