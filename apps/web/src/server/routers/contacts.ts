import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import type { Prisma } from '@prisma/client'
import { createTRPCRouter, protectedProcedure } from '../trpc'
import { contactCreateSchema, contactUpdateSchema } from '@daily-brain/core/schemas/contact'
import { logActivity, ACT_CONTACT_CREATED, ACT_CONTACT_FIELD_UPDATED, FIELD_LABELS } from '../lib/activity'
import { linkEventsToNewContact } from '../lib/calendar/sync'

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
    const contact = await ctx.prisma.contact.create({
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

    await logActivity({
      prisma: ctx.prisma,
      workspaceId: ctx.workspaceId!,
      actorId: ctx.userId!,
      type: ACT_CONTACT_CREATED,
      data: {},
      recordType: 'contact',
      recordId: contact.id,
      contactId: contact.id,
    })

    // Bestehende Kalender-Events rückwirkend verlinken
    if (input.email && input.email.length > 0) {
      linkEventsToNewContact(ctx.workspaceId, ctx.userId!, contact.id, input.email).catch(() => {})
    }

    return contact
  }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: contactUpdateSchema }))
    .mutation(async ({ ctx, input }) => {
      const contact = await ctx.prisma.contact.findFirst({
        where: { id: input.id, workspace_id: ctx.workspaceId, deleted_at: null },
      })
      if (!contact) throw new TRPCError({ code: 'NOT_FOUND' })

      const updated = await ctx.prisma.contact.update({
        where: { id: input.id },
        data: {
          ...input.data,
          ...(input.data.attrs !== undefined
            ? { attrs: input.data.attrs as Prisma.InputJsonValue }
            : {}),
        } as Prisma.ContactUpdateInput,
        include: { company: { select: { id: true, name: true } } },
      })

      // Log one activity per changed top-level field
      const changedFields = Object.keys(input.data) as (keyof typeof input.data)[]
      for (const field of changedFields) {
        if (field === 'attrs') {
          // Log each changed attr key separately
          const newAttrs = (input.data.attrs ?? {}) as Record<string, unknown>
          const oldAttrs = (contact.attrs ?? {}) as Record<string, unknown>
          for (const key of Object.keys(newAttrs)) {
            const oldVal = String(oldAttrs[key] ?? '')
            const newVal = String(newAttrs[key] ?? '')
            if (oldVal === newVal) continue
            await logActivity({
              prisma: ctx.prisma,
              workspaceId: ctx.workspaceId!,
              actorId: ctx.userId!,
              type: ACT_CONTACT_FIELD_UPDATED,
              data: {
                field: `attrs.${key}`,
                label: FIELD_LABELS[`attrs.${key}`] ?? key,
                oldValue: oldVal,
                newValue: newVal,
              },
              recordType: 'contact',
              recordId: input.id,
              contactId: input.id,
            })
          }
        } else {
          const oldVal = Array.isArray(contact[field as keyof typeof contact])
            ? (contact[field as keyof typeof contact] as string[]).join(', ')
            : String(contact[field as keyof typeof contact] ?? '')
          const newVal = Array.isArray(input.data[field])
            ? (input.data[field] as string[]).join(', ')
            : String(input.data[field] ?? '')
          if (oldVal === newVal) continue
          await logActivity({
            prisma: ctx.prisma,
            workspaceId: ctx.workspaceId!,
            actorId: ctx.userId!,
            type: ACT_CONTACT_FIELD_UPDATED,
            data: {
              field,
              label: FIELD_LABELS[field] ?? field,
              oldValue: oldVal,
              newValue: newVal,
            },
            recordType: 'contact',
            recordId: input.id,
            contactId: input.id,
          })
        }
      }

      // Re-link calendar events if email changed
      if (input.data.email && input.data.email.length > 0) {
        linkEventsToNewContact(ctx.workspaceId, ctx.userId!, input.id, input.data.email).catch(() => {})
      }

      return updated
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
        contactId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).default(20),
        upcoming: z.boolean().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      const contact = await ctx.prisma.contact.findFirst({
        where: { id: input.contactId, workspace_id: ctx.workspaceId, deleted_at: null },
      })
      if (!contact) throw new TRPCError({ code: 'NOT_FOUND' })

      const links = await ctx.prisma.calendarEventLink.findMany({
        where: {
          workspace_id: ctx.workspaceId,
          record_type: 'contact',
          record_id: input.contactId,
        },
        select: { event_id: true },
      })
      const eventIds = links.map((l) => l.event_id)
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
