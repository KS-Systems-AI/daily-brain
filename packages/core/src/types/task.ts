import type { BaseRecord, RecordType } from './base'

export interface Task extends BaseRecord {
  title: string
  description: string | null
  due_at: string | null
  completed_at: string | null
  record_type: RecordType | null
  record_id: string | null
  assignee_id: string | null
  author_id: string
}
