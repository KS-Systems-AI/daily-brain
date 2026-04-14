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

export type TaskCreateInput = {
  title: string
  description?: string
  due_at?: string
  record_type?: RecordType
  record_id?: string
  assignee_id?: string
}

export type TaskUpdateInput = Partial<TaskCreateInput> & {
  completed_at?: string | null
}
