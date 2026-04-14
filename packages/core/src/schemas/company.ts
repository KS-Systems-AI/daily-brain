import { z } from 'zod'

export const companyCreateSchema = z.object({
  name: z.string().min(1, 'Company name is required').max(200),
  domain: z.string().max(200).optional(),
  industry: z.string().max(100).optional(),
  size: z
    .enum(['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'])
    .optional(),
  attrs: z.record(z.unknown()).default({}),
})

export const companyUpdateSchema = companyCreateSchema.partial()

export const companyFiltersSchema = z.object({
  search: z.string().optional(),
  industry: z.string().optional(),
  size: z.string().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
})

export type CompanyCreateInput = z.infer<typeof companyCreateSchema>
export type CompanyUpdateInput = z.infer<typeof companyUpdateSchema>
export type CompanyFilters = z.infer<typeof companyFiltersSchema>
