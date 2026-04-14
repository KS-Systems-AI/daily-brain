import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '../trpc'

export const notificationsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        cursor: z.string().uuid().optional(),
        limit: z.number().min(1).max(100).default(50),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50

      const items = await ctx.prisma.notification.findMany({
        where: {
          user_id: ctx.userId,
          workspace_id: ctx.workspaceId,
          ...(input?.cursor ? { created_at: { lt: (await ctx.prisma.notification.findUnique({ where: { id: input.cursor } }))?.created_at ?? new Date() } } : {}),
        },
        orderBy: { created_at: 'desc' },
        take: limit + 1,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          read_at: true,
          created_at: true,
          task_id: true,
          task: { select: { id: true, title: true, status: true, due_at: true } },
        },
      })

      let nextCursor: string | undefined
      if (items.length > limit) {
        const next = items.pop()!
        nextCursor = next.id
      }

      return { items, nextCursor }
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.notification.count({
      where: {
        user_id: ctx.userId,
        workspace_id: ctx.workspaceId,
        read_at: null,
      },
    })
  }),

  markRead: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.notification.updateMany({
        where: { id: input.id, user_id: ctx.userId },
        data: { read_at: new Date() },
      })
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    return ctx.prisma.notification.updateMany({
      where: { user_id: ctx.userId, workspace_id: ctx.workspaceId, read_at: null },
      data: { read_at: new Date() },
    })
  }),

  registerToken: protectedProcedure
    .input(
      z.object({
        token: z.string().min(1),
        platform: z.enum(['ios', 'android', 'web']),
        endpoint: z.string().optional(),
        p256dh: z.string().optional(),
        auth: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.pushToken.upsert({
        where: {
          user_id_token: { user_id: ctx.userId!, token: input.token },
        },
        create: {
          user_id: ctx.userId!,
          token: input.token,
          platform: input.platform,
          endpoint: input.endpoint ?? null,
          p256dh: input.p256dh ?? null,
          auth: input.auth ?? null,
        },
        update: {
          platform: input.platform,
          endpoint: input.endpoint ?? null,
          p256dh: input.p256dh ?? null,
          auth: input.auth ?? null,
          updated_at: new Date(),
        },
      })
    }),

  removeToken: protectedProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.pushToken.deleteMany({
        where: { user_id: ctx.userId, token: input.token },
      })
    }),
})
