import type { BaseRecord, JsonValue } from './base'

export type TriggerType =
  | 'record.created'
  | 'record.updated'
  | 'field.changed'
  | 'date.reached'
  | 'webhook.received'

export type ActionType =
  | 'send_email'
  | 'create_task'
  | 'update_field'
  | 'http_request'
  | 'ai_action'
  | 'send_whatsapp'

export interface AutomationTrigger {
  type: TriggerType
  config: Record<string, JsonValue>
}

export interface AutomationStep {
  id: string
  type: ActionType
  config: Record<string, JsonValue>
}

export interface Automation extends BaseRecord {
  name: string
  trigger: AutomationTrigger
  steps: AutomationStep[]
  enabled: boolean
}

export interface AutomationRun extends BaseRecord {
  automation_id: string
  status: 'pending' | 'running' | 'success' | 'failed'
  trigger_data: Record<string, JsonValue>
  result: Record<string, JsonValue> | null
  started_at: string
  finished_at: string | null
  error: string | null
}
