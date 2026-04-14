import { z } from 'zod'

export const contactCreateSchema = z.object({
  first_name: z.string().min(1, 'First name is required').max(100),
  last_name: z.string().max(100).optional(),
  email: z.array(z.string().email()).default([]),
  phone: z.array(z.string()).default([]),
  company_id: z.string().uuid().optional(),
  attrs: z.record(z.unknown()).default({}),
})

export const contactUpdateSchema = contactCreateSchema.partial()

export const contactFiltersSchema = z.object({
  search: z.string().optional(),
  company_id: z.string().uuid().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
})

export type ContactCreateInput = z.infer<typeof contactCreateSchema>
export type ContactUpdateInput = z.infer<typeof contactUpdateSchema>
export type ContactFilters = z.infer<typeof contactFiltersSchema>
