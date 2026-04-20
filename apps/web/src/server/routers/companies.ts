import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import type { Prisma } from '@prisma/client'
import { createTRPCRouter, protectedProcedure } from '../trpc'
import { companyCreateSchema, companyUpdateSchema } from '@daily-brain/core/schemas/company'

const listInput = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  search: z.string().optional(),
  industry: z.string().optional(),
  size: z.string().optional(),
  sort: z.enum(['name', 'created_at', 'updated_at']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
})

export const companiesRouter = createTRPCRouter({
  list: protectedProcedure.input(listInput).query(async ({ ctx, input }) => {
    const { cursor, limit, search, industry, size, sort, order } = input
    const { workspaceId, prisma } = ctx

    const where = {
      workspace_id: workspaceId,
      deleted_at: null,
      ...(industry
        ? { industry: { contains: industry, mode: 'insensitive' as const } }
        : {}),
      ...(size ? { size } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { domain: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const items = await prisma.company.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { [sort]: order },
      include: { _count: { select: { contacts: { where: { deleted_at: null } } } } },
    })

    const hasMore = items.length > limit
    if (hasMore) items.pop()
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined

    return { items, nextCursor, hasMore }
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const company = await ctx.prisma.company.findFirst({
        where: { id: input.id, workspace_id: ctx.workspaceId, deleted_at: null },
        include: { _count: { select: { contacts: { where: { deleted_at: null } } } } },
      })
      if (!company) throw new TRPCError({ code: 'NOT_FOUND' })
      return company
    }),

  create: protectedProcedure.input(companyCreateSchema).mutation(async ({ ctx, input }) => {
    return ctx.prisma.company.create({
      data: {
        workspace_id: ctx.workspaceId,
        name: input.name,
        domain: input.domain ?? null,
        industry: input.industry ?? null,
        size: input.size ?? null,
        attrs: input.attrs as Prisma.InputJsonValue,
      },
      include: { _count: { select: { contacts: { where: { deleted_at: null } } } } },
    })
  }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: companyUpdateSchema }))
    .mutation(async ({ ctx, input }) => {
      const company = await ctx.prisma.company.findFirst({
        where: { id: input.id, workspace_id: ctx.workspaceId, deleted_at: null },
      })
      if (!company) throw new TRPCError({ code: 'NOT_FOUND' })

      return ctx.prisma.company.update({
        where: { id: input.id },
        data: {
          ...input.data,
          ...(input.data.attrs !== undefined
            ? { attrs: input.data.attrs as Prisma.InputJsonValue }
            : {}),
        } as Prisma.CompanyUpdateInput,
        include: { _count: { select: { contacts: { where: { deleted_at: null } } } } },
      })
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const company = await ctx.prisma.company.findFirst({
        where: { id: input.id, workspace_id: ctx.workspaceId, deleted_at: null },
      })
      if (!company) throw new TRPCError({ code: 'NOT_FOUND' })

      await ctx.prisma.company.update({
        where: { id: input.id },
        data: { deleted_at: new Date() },
      })
      return { success: true }
    }),

  getContacts: protectedProcedure
    .input(z.object({ companyId: z.string().uuid(), cursor: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const items = await ctx.prisma.contact.findMany({
        where: {
          workspace_id: ctx.workspaceId,
          company_id: input.companyId,
          deleted_at: null,
        },
        take: 21,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        orderBy: [{ first_name: 'asc' }, { last_name: 'asc' }],
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          phone: true,
          avatar_url: true,
        },
      })
      const hasMore = items.length > 20
      if (hasMore) items.pop()
      return { items, nextCursor: hasMore ? items[items.length - 1]?.id : undefined }
    }),

  getNotes: protectedProcedure
    .input(z.object({ companyId: z.string().uuid(), cursor: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const items = await ctx.prisma.note.findMany({
        where: { workspace_id: ctx.workspaceId, company_id: input.companyId, deleted_at: null },
        take: 21,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          title: true,
          content_text: true,
          is_pinned: true,
          created_at: true,
          updated_at: true,
          author: { select: { id: true, full_name: true, avatar_url: true } },
        },
      })
      const hasMore = items.length > 20
      if (hasMore) items.pop()
      return { items, nextCursor: hasMore ? items[items.length - 1]?.id : undefined }
    }),

  getTasks: protectedProcedure
    .input(
      z.object({
        companyId: z.string().uuid(),
        includeCompleted: z.boolean().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.task.findMany({
        where: {
          workspace_id: ctx.workspaceId,
          company_id: input.companyId,
          deleted_at: null,
          ...(input.includeCompleted ? {} : { completed_at: null }),
        },
        orderBy: [{ due_at: 'asc' }, { created_at: 'desc' }],
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          priority: true,
          due_at: true,
          end_at: true,
          completed_at: true,
          position: true,
          created_at: true,
          updated_at: true,
          contact_id: true,
          company_id: true,
          assignee: { select: { id: true, full_name: true, avatar_url: true } },
          contact: { select: { id: true, first_name: true, last_name: true } },
          company: { select: { id: true, name: true } },
        },
      })
    }),

  completeTask: protectedProcedure
    .input(z.object({ taskId: z.string().uuid(), completed: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.prisma.task.findFirst({
        where: {
          id: input.taskId,
          workspace_id: ctx.workspaceId,
          deleted_at: null,
        },
      })
      if (!task) throw new TRPCError({ code: 'NOT_FOUND' })

      return ctx.prisma.task.update({
        where: { id: input.taskId },
        data: { completed_at: input.completed ? new Date() : null },
      })
    }),

  getMeetings: protectedProcedure
    .input(
      z.object({
        companyId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).default(20),
        upcoming: z.boolean().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      const company = await ctx.prisma.company.findFirst({
        where: { id: input.companyId, workspace_id: ctx.workspaceId, deleted_at: null },
      })
      if (!company) throw new TRPCError({ code: 'NOT_FOUND' })

      // Links for this company + links for all contacts belonging to this company
      const companyContacts = await ctx.prisma.contact.findMany({
        where: { workspace_id: ctx.workspaceId, company_id: input.companyId, deleted_at: null },
        select: { id: true },
      })
      const contactIds = companyContacts.map((c) => c.id)

      const links = await ctx.prisma.calendarEventLink.findMany({
        where: {
          workspace_id: ctx.workspaceId,
          OR: [
            { record_type: 'company', record_id: input.companyId },
            ...(contactIds.length > 0
              ? [{ record_type: 'contact' as const, record_id: { in: contactIds } }]
              : []),
          ],
        },
        select: { event_id: true },
      })
      const eventIds = [...new Set(links.map((l) => l.event_id))]
      if (eventIds.length === 0) return { items: [] }

      const events = await ctx.prisma.calendarEvent.findMany({
        where: {
          id: { in: eventIds },
          deleted_at: null,
          status: { not: 'cancelled' },
          ...(input.upcoming ? { start_at: { gte: new Date() } } : {}),
        },
        orderBy: { start_at: input.upcoming ? 'asc' : 'desc' },
        take: input.limit,
        include: {
          account: { select: { id: true, provider: true, email: true, display_name: true } },
        },
      })

      return {
        items: events.map((ev) => ({
          id: ev.id, title: ev.title, description: ev.description,
          location: ev.location, start_at: ev.start_at, end_at: ev.end_at,
          is_all_day: ev.is_all_day, attendees: ev.attendees, status: ev.status,
          record_type: ev.record_type, record_id: ev.record_id, created_at: ev.created_at,
          account: ev.account,
        })),
      }
    }),

  getActivities: protectedProcedure
    .input(z.object({ companyId: z.string().uuid(), cursor: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const items = await ctx.prisma.activity.findMany({
        where: {
          workspace_id: ctx.workspaceId,
          company_id: input.companyId,
          deleted_at: null,
        },
        take: 21,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          type: true,
          data: true,
          created_at: true,
          actor: { select: { id: true, full_name: true, avatar_url: true } },
        },
      })
      const hasMore = items.length > 20
      if (hasMore) items.pop()
      return { items, nextCursor: hasMore ? items[items.length - 1]?.id : undefined }
    }),
})
