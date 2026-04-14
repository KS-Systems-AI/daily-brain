import { TRPCError, initTRPC } from '@trpc/server'
import { type NextRequest } from 'next/server'
import superjson from 'superjson'
import { ZodError } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createClient as createBrowserClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import type { PrismaClient } from '@prisma/client'

export type Context = {
  req: NextRequest
  userId: string | null
  workspaceId: string | null
  prisma: PrismaClient
  supabase: SupabaseClient
}

export async function createTRPCContext(req: NextRequest): Promise<Context> {
  const authHeader = req.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (bearerToken) {
    const client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const { data: { user } } = await client.auth.getUser(bearerToken)
    return {
      req,
      userId: user?.id ?? null,
      workspaceId: null,
      prisma,
      supabase: client,
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return {
    req,
    userId: user?.id ?? null,
    workspaceId: null,
    prisma,
    supabase: supabase as unknown as SupabaseClient,
  }
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    }
  },
})

export const createTRPCRouter = t.router
export const publicProcedure = t.procedure

const isAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED' })

  let member = await ctx.prisma.workspaceMember.findFirst({
    where: { user_id: ctx.userId, deleted_at: null },
  })

  if (!member) {
    const { data } = await ctx.supabase.auth.getUser()
    const email = data.user?.email ?? `${ctx.userId}@unknown.com`
    const fullName = (data.user?.user_metadata?.['full_name'] as string | undefined) ?? null

    member = await ctx.prisma.$transaction(async (tx) => {
      await tx.user.upsert({
        where: { id: ctx.userId! },
        create: { id: ctx.userId!, email, full_name: fullName },
        update: { email },
      })
      const workspace = await tx.workspace.create({
        data: {
          name: `${fullName ?? email.split('@')[0]}'s Workspace`,
          slug: `ws-${ctx.userId!.substring(0, 8)}`,
        },
      })
      return tx.workspaceMember.create({
        data: { workspace_id: workspace.id, user_id: ctx.userId!, role: 'owner' },
      })
    })
  }

  return next({ ctx: { ...ctx, userId: ctx.userId, workspaceId: member.workspace_id } })
})

export const protectedProcedure = t.procedure.use(isAuthed)
