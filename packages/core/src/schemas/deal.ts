import { z } from 'zod'

export const dealCreateSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  pipeline_id: z.string().uuid(),
  stage: z.string().min(1),
  value: z.number().int().nonnegative().optional(), // cents
  currency: z.string().length(3).default('USD'),
  contact_id: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
  owner_id: z.string().uuid().optional(),
  close_date: z.string().datetime().optional(),
  attrs: z.record(z.unknown()).default({}),
})

export const dealUpdateSchema = dealCreateSchema.partial()

export const dealFiltersSchema = z.object({
  pipeline_id: z.string().uuid().optional(),
  stage: z.string().optional(),
  owner_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
})

export type DealCreateInput = z.infer<typeof dealCreateSchema>
export type DealUpdateInput = z.infer<typeof dealUpdateSchema>
export type DealFilters = z.infer<typeof dealFiltersSchema>
