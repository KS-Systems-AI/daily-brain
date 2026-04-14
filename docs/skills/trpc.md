# Skill: tRPC v11

## Init (server/trpc.ts)
```ts
import { initTRPC, TRPCError } from '@trpc/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { ZodError } from 'zod'

export const createTRPCContext = async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { user, supabase, prisma }
}

const t = initTRPC.context<typeof createTRPCContext>().create({
  errorFormatter: ({ shape, error }) => ({
    ...shape,
    data: { ...shape.data, zodError: error.cause instanceof ZodError ? error.cause.flatten() : null }
  })
})

export const router = t.router
export const publicProcedure = t.procedure

const isAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' })
  const member = await ctx.prisma.workspaceMember.findFirst({
    where: { userId: ctx.user.id }, include: { workspace: true }
  })
  if (!member) throw new TRPCError({ code: 'FORBIDDEN' })
  return next({ ctx: { ...ctx, user: ctx.user, member, workspaceId: member.workspaceId } })
})

export const protectedProcedure = t.procedure.use(isAuthed)
```

## Key Rules
- All procedures use protectedProcedure — never publicProcedure for CRM data
- Always scope queries by workspaceId from context
- Use cursor-based pagination, never offset
- Soft delete: set deletedAt, never remove rows
- Always invalidate relevant queries after mutations
