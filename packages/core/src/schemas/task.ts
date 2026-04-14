import { z } from 'zod'

export const taskCreateSchema = z.object({
  title: z.string().min(1, 'Title is required').max(300),
  description: z.string().max(2000).optional(),
  due_at: z.string().datetime().optional(),
  record_type: z.enum(['contact', 'company', 'deal', 'custom']).optional(),
  record_id: z.string().uuid().optional(),
  assignee_id: z.string().uuid().optional(),
})

export const taskUpdateSchema = taskCreateSchema.partial().extend({
  completed_at: z.string().datetime().nullable().optional(),
})

export type TaskCreateInput = z.infer<typeof taskCreateSchema>
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>
