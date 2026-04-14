import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import type { Prisma } from '@prisma/client'
import { createTRPCRouter, protectedProcedure } from '../trpc'
import { contactCreateSchema, contactUpdateSchema } from '@daily-brain/core/schemas/contact'

const listInput = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  search: z.string().optional(),
  company_id: z.string().uuid().optional(),
  sort: z.enum(['name', 'created_at', 'updated_at']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
})

export const contactsRouter = createTRPCRouter({
  list: protectedProcedure.input(listInput).query(async ({ ctx, input }) => {
    const { cursor, limit, search, company_id, sort, order } = input
    const { workspaceId, prisma } = ctx

    const where = {
      workspace_id: workspaceId,
      deleted_at: null,
      ...(company_id ? { company_id } : {}),
      ...(search
        ? {
            OR: [
              { first_name: { contains: search, mode: 'insensitive' as const } },
              { last_name: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const orderBy =
      sort === 'name'
        ? [{ first_name: order }, { last_name: order }]
        : [{ [sort]: order }]

    const items = await prisma.contact.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy,
      include: { company: { select: { id: true, name: true } } },
    })

    const hasMore = items.length > limit
    if (hasMore) items.pop()
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined

    return { items, nextCursor, hasMore }
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const contact = await ctx.prisma.contact.findFirst({
        where: { id: input.id, workspace_id: ctx.workspaceId, deleted_at: null },
        include: { company: { select: { id: true, name: true, domain: true } } },
      })
      if (!contact) throw new TRPCError({ code: 'NOT_FOUND' })
      return contact
    }),

  create: protectedProcedure.input(contactCreateSchema).mutation(async ({ ctx, input }) => {
    return ctx.prisma.contact.create({
      data: {
        workspace_id: ctx.workspaceId,
        first_name: input.first_name,
        last_name: input.last_name ?? null,
        email: input.email,
        phone: input.phone,
        company_id: input.company_id ?? null,
        attrs: input.attrs as Prisma.InputJsonValue,
      },
      include: { company: { select: { id: true, name: true } } },
    })
  }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: contactUpdateSchema }))
    .mutation(async ({ ctx, input }) => {
      const contact = await ctx.prisma.contact.findFirst({
        where: { id: input.id, workspace_id: ctx.workspaceId, deleted_at: null },
      })
      if (!contact) throw new TRPCError({ code: 'NOT_FOUND' })

      return ctx.prisma.contact.update({
        where: { id: input.id },
        data: {
          ...input.data,
          ...(input.data.attrs !== undefined
            ? { attrs: input.data.attrs as Prisma.InputJsonValue }
            : {}),
        } as Prisma.ContactUpdateInput,
        include: { company: { select: { id: true, name: true } } },
      })
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const contact = await ctx.prisma.contact.findFirst({
        where: { id: input.id, workspace_id: ctx.workspaceId, deleted_at: null },
      })
      if (!contact) throw new TRPCError({ code: 'NOT_FOUND' })

      await ctx.prisma.contact.update({
        where: { id: input.id },
        data: { deleted_at: new Date() },
      })
      return { success: true }
    }),

  getNotes: protectedProcedure
    .input(z.object({ contactId: z.string().uuid(), cursor: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const items = await ctx.prisma.note.findMany({
        where: {
          workspace_id: ctx.workspaceId,
          contact_id: input.contactId,
          deleted_at: null,
        },
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
        contactId: z.string().uuid(),
        includeCompleted: z.boolean().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.task.findMany({
        where: {
          workspace_id: ctx.workspaceId,
          contact_id: input.contactId,
          deleted_at: null,
          ...(input.includeCompleted ? {} : { completed_at: null }),
        },
        orderBy: [{ due_at: 'asc' }, { created_at: 'desc' }],
        select: {
          id: true,
          title: true,
          description: true,
          due_at: true,
          completed_at: true,
          created_at: true,
          assignee: { select: { id: true, full_name: true, avatar_url: true } },
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

  getActivities: protectedProcedure
    .input(z.object({ contactId: z.string().uuid(), cursor: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const items = await ctx.prisma.activity.findMany({
        where: {
          workspace_id: ctx.workspaceId,
          contact_id: input.contactId,
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
