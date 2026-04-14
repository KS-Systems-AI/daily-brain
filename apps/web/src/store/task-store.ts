export type TaskPriority = 'none' | 'low' | 'medium' | 'high' | 'urgent'
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled'

export interface Task {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  due_at: Date | null
  end_at: Date | null
  position: number
  created_at: Date
  updated_at: Date
  completed_at: Date | null
  contact_id: string | null
  company_id: string | null
}
