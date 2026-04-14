import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import type { Prisma } from '@prisma/client'
import { createTRPCRouter, protectedProcedure } from '../trpc'

export const tasksRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(['todo', 'in_progress', 'done', 'cancelled']).optional(),
        includeCompleted: z.boolean().default(false),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.TaskWhereInput = {
        workspace_id: ctx.workspaceId,
        deleted_at: null,
      }

      if (input?.status) {
        where.status = input.status
      } else if (!input?.includeCompleted) {
        where.OR = [
          { status: 'todo' },
          { status: 'in_progress' },
          { status: null },
        ]
      }

      return ctx.prisma.task.findMany({
        where,
        orderBy: [{ position: 'asc' }, { created_at: 'desc' }],
        select: {
          id: true,
          title: true,
          description: true,
          due_at: true,
          end_at: true,
          completed_at: true,
          status: true,
          priority: true,
          position: true,
          contact_id: true,
          company_id: true,
          created_at: true,
          updated_at: true,
        },
      })
    }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(300),
        description: z.string().nullish(),
        due_at: z.string().datetime().nullish(),
        end_at: z.string().datetime().nullish(),
        status: z.enum(['todo', 'in_progress', 'done', 'cancelled']).default('todo'),
        priority: z.enum(['none', 'low', 'medium', 'high', 'urgent']).default('none'),
        contact_id: z.string().uuid().nullish(),
        company_id: z.string().uuid().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.task.create({
        data: {
          workspace_id: ctx.workspaceId!,
          author_id: ctx.userId!,
          title: input.title,
          description: input.description ?? null,
          due_at: input.due_at ? new Date(input.due_at) : null,
          end_at: input.end_at ? new Date(input.end_at) : null,
          status: input.status,
          priority: input.priority,
          position: 0,
          contact_id: input.contact_id ?? null,
          company_id: input.company_id ?? null,
        },
      })
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(300).optional(),
        description: z.string().nullish(),
        due_at: z.string().datetime().nullish(),
        end_at: z.string().datetime().nullish(),
        status: z.enum(['todo', 'in_progress', 'done', 'cancelled']).optional(),
        priority: z.enum(['none', 'low', 'medium', 'high', 'urgent']).optional(),
        position: z.number().int().optional(),
        completed_at: z.string().datetime().nullish(),
        contact_id: z.string().uuid().nullish(),
        company_id: z.string().uuid().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      const existing = await ctx.prisma.task.findFirst({
        where: { id, workspace_id: ctx.workspaceId, deleted_at: null },
      })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })

      const updateData: Prisma.TaskUpdateInput = {}
      if (data.title !== undefined) updateData.title = data.title
      if (data.description !== undefined) updateData.description = data.description
      if (data.due_at !== undefined) updateData.due_at = data.due_at ? new Date(data.due_at) : null
      if (data.end_at !== undefined) updateData.end_at = data.end_at ? new Date(data.end_at) : null
      if (data.status !== undefined) updateData.status = data.status
      if (data.priority !== undefined) updateData.priority = data.priority
      if (data.position !== undefined) updateData.position = data.position
      if (data.completed_at !== undefined) {
        updateData.completed_at = data.completed_at ? new Date(data.completed_at) : null
      }

      if (data.contact_id !== undefined) updateData.contact_id = data.contact_id ?? null
      if (data.company_id !== undefined) updateData.company_id = data.company_id ?? null

      if (data.status === 'done' && !data.completed_at && !existing.completed_at) {
        updateData.completed_at = new Date()
      }
      if (data.status && data.status !== 'done' && existing.completed_at) {
        updateData.completed_at = null
      }

      return ctx.prisma.task.update({ where: { id }, data: updateData })
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.task.findFirst({
        where: { id: input.id, workspace_id: ctx.workspaceId, deleted_at: null },
      })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })

      return ctx.prisma.task.update({
        where: { id: input.id },
        data: { deleted_at: new Date() },
      })
    }),

  completed: protectedProcedure
    .query(async ({ ctx }) => {
      return ctx.prisma.task.findMany({
        where: {
          workspace_id: ctx.workspaceId,
          deleted_at: null,
          status: { in: ['done', 'cancelled'] },
        },
        orderBy: { completed_at: 'desc' },
        take: 50,
        select: {
          id: true,
          title: true,
          description: true,
          due_at: true,
          end_at: true,
          completed_at: true,
          status: true,
          priority: true,
          position: true,
          created_at: true,
          updated_at: true,
        },
      })
    }),
})
