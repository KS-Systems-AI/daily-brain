import { z } from 'zod'

export const noteCreateSchema = z.object({
  record_type: z.enum(['contact', 'company', 'deal', 'custom']).optional(),
  record_id: z.string().uuid().optional(),
  title: z.string().max(300).optional(),
  content: z.unknown().default({}),
  content_text: z.string().optional(),
  content_markdown: z.string().optional(),
  linked_event_id: z.string().optional(),
  is_pinned: z.boolean().default(false),
})

export const noteUpdateSchema = noteCreateSchema.partial()

export type NoteCreateInput = z.infer<typeof noteCreateSchema>
export type NoteUpdateInput = z.infer<typeof noteUpdateSchema>
