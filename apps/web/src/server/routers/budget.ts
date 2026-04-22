import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import type { PrismaClient } from '@prisma/client'
import { createTRPCRouter, protectedProcedure } from '../trpc'
import { SEED_CATEGORIES, SEED_RULES } from '../lib/budget/seed-data'
import { applyRules } from '../lib/budget/rule-engine'

// Extract the meaningful merchant name from a raw bank recipient string.
// "REWE SAGT DANKE 12345 //BERLIN/DE"           → "REWE SAGT DANKE"
// "AMZN.Mktp.DE.NZ14V7F34/AMZN.COM.BILL"       → "AMZN.MKTP.DE"
// "NETFLIX.COM"                                 → "NETFLIX.COM"
function normalizeRecipient(raw: string): string {
  const upper = raw.trim().toUpperCase()

  // Dot/slash-only recipients (no whitespace): reconstruct using original separators
  // so the result is still a substring of the original string.
  if (!/\s/.test(upper)) {
    const firstSegment = upper.split('/')[0] ?? upper
    const parts = firstSegment.split('.')
    const meaningful: string[] = []
    for (const p of parts) {
      if (!p) continue
      if (/^\d+$/.test(p)) break
      // Looks like a reference ID (e.g. NZ14V7F34): >30% digits and length > 5
      if (p.length > 5 && (p.match(/\d/g)?.length ?? 0) / p.length > 0.3) break
      meaningful.push(p)
      if (meaningful.length >= 4) break
    }
    return meaningful.join('.') || upper.substring(0, 40)
  }

  // Space-separated: extract meaningful tokens, stop at pure numbers / location markers / dates
  const parts = upper.split(/\s+/)
  const meaningful: string[] = []
  for (const part of parts) {
    if (/^\d{3,}$/.test(part)) break
    if (part.startsWith('//') || part === '/') break
    if (/^\d{2}\.\d{2}\./.test(part)) break
    meaningful.push(part)
    if (meaningful.length >= 4) break
  }
  return meaningful.join(' ') || upper.substring(0, 40)
}

async function ensureSeedData(prisma: PrismaClient, workspaceId: string): Promise<void> {
  const count = await prisma.budgetCategory.count({ where: { workspace_id: workspaceId, is_system: true, deleted_at: null } })
  if (count > 0) {
    await runMigrations(prisma, workspaceId)
    return
  }

  const categories = await prisma.$transaction(
    SEED_CATEGORIES.map((cat) =>
      prisma.budgetCategory.create({
        data: {
          workspace_id: workspaceId,
          name: cat.name,
          type: cat.type,
          color: cat.color,
          icon: cat.icon,
          is_system: cat.is_system,
        },
      })
    )
  )

  const catMap = new Map(categories.map((c) => [c.name, c.id]))

  const rules = SEED_RULES.filter((r) => catMap.has(r.categoryKey)).map((r) => ({
    workspace_id: workspaceId,
    category_id: catMap.get(r.categoryKey)!,
    match_field: r.match_field,
    match_value: r.match_value,
    match_type: r.match_type,
    priority: r.priority,
    is_system: true,
  }))

  await prisma.budgetRule.createMany({ data: rules })
}

// Runs once per workspace when old "Lebensmittel & Drogerie" still exists
async function runMigrations(prisma: PrismaClient, workspaceId: string): Promise<void> {
  const old = await prisma.budgetCategory.findFirst({
    where: { workspace_id: workspaceId, name: 'Lebensmittel & Drogerie', deleted_at: null },
  })
  if (!old) return

  // Create two replacement categories if they don't exist
  const [lebensmittel, drogerie] = await Promise.all([
    prisma.budgetCategory.upsert({
      where: { id: `${workspaceId}-lebensmittel-seed` },
      create: { workspace_id: workspaceId, name: 'Lebensmittel', type: 'variable', color: '#22c55e', icon: 'ShoppingCart', is_system: true },
      update: {},
    }).catch(() =>
      prisma.budgetCategory.findFirst({ where: { workspace_id: workspaceId, name: 'Lebensmittel', deleted_at: null } })
        .then((c) => c ?? prisma.budgetCategory.create({ data: { workspace_id: workspaceId, name: 'Lebensmittel', type: 'variable', color: '#22c55e', icon: 'ShoppingCart', is_system: true } }))
    ),
    prisma.budgetCategory.findFirst({ where: { workspace_id: workspaceId, name: 'Drogerie & Körperpflege', deleted_at: null } })
      .then((c) => c ?? prisma.budgetCategory.create({ data: { workspace_id: workspaceId, name: 'Drogerie & Körperpflege', type: 'variable', color: '#06b6d4', icon: 'Sparkles', is_system: true } })),
  ])

  if (!lebensmittel || !drogerie) return

  // Migrate all transactions from old category → Lebensmittel (default)
  await prisma.budgetTransaction.updateMany({
    where: { workspace_id: workspaceId, category_id: old.id, deleted_at: null },
    data: { category_id: lebensmittel.id },
  })

  // Soft-delete old category + its system rules
  await prisma.budgetCategory.update({ where: { id: old.id }, data: { deleted_at: new Date() } })
  await prisma.budgetRule.updateMany({
    where: { workspace_id: workspaceId, category_id: old.id, is_system: true },
    data: { deleted_at: new Date() },
  })

  // Seed rules for both new categories
  const DROGERIE_KEYWORDS = ['DM-DROGERIE', 'DM DROGERIE', 'ROSSMANN', 'MUELLER DROGERIE', 'MÜLLER DROGERIE', 'BUDNI', 'DOUGLAS', 'BODYSHOP', 'THE BODY SHOP']
  const LEBENSMITTEL_KEYWORDS = ['REWE', 'EDEKA', 'LIDL', 'ALDI', 'PENNY', 'NETTO', 'KAUFLAND', 'NORMA', 'TEGUT', 'REAL MARKT', 'HIT MARKT', 'GLOBUS', 'FAMILA', 'SPAR MARKT', 'NAHKAUF', 'BILLA', 'VOLLCORNER']

  const newRules = [
    ...LEBENSMITTEL_KEYWORDS.map((v) => ({ workspace_id: workspaceId, category_id: lebensmittel.id, match_field: 'any', match_value: v, match_type: 'contains', priority: 10, is_system: true })),
    ...DROGERIE_KEYWORDS.map((v) => ({ workspace_id: workspaceId, category_id: drogerie.id, match_field: 'any', match_value: v, match_type: 'contains', priority: 10, is_system: true })),
  ]

  await prisma.budgetRule.createMany({ data: newRules, skipDuplicates: true })
}

export const budgetRouter = createTRPCRouter({
  // ── Categories ──────────────────────────────────────────

  listCategories: protectedProcedure.query(async ({ ctx }) => {
    await ensureSeedData(ctx.prisma, ctx.workspaceId)
    return ctx.prisma.budgetCategory.findMany({
      where: { workspace_id: ctx.workspaceId, deleted_at: null },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    })
  }),

  createCategory: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      type: z.enum(['fixed', 'variable', 'income', 'transfer']),
      color: z.string().optional(),
      icon: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.budgetCategory.create({
        data: {
          workspace_id: ctx.workspaceId,
          name: input.name,
          type: input.type,
          color: input.color ?? '#94a3b8',
          icon: input.icon ?? 'Tag',
          is_system: false,
        },
      })
    }),

  updateCategory: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(100).optional(),
      type: z.enum(['fixed', 'variable', 'income', 'transfer']).optional(),
      color: z.string().optional(),
      icon: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const cat = await ctx.prisma.budgetCategory.findFirst({
        where: { id: input.id, workspace_id: ctx.workspaceId, deleted_at: null },
      })
      if (!cat) throw new TRPCError({ code: 'NOT_FOUND' })
      // System categories: allow name/color edit but not type change
      const { id, type, ...rest } = input
      const data = cat.is_system ? rest : { type, ...rest }
      return ctx.prisma.budgetCategory.update({ where: { id }, data })
    }),

  deleteCategory: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const cat = await ctx.prisma.budgetCategory.findFirst({
        where: { id: input.id, workspace_id: ctx.workspaceId, deleted_at: null },
      })
      if (!cat) throw new TRPCError({ code: 'NOT_FOUND' })
      if (cat.is_system) throw new TRPCError({ code: 'FORBIDDEN', message: 'System-Kategorien können nicht gelöscht werden' })
      return ctx.prisma.budgetCategory.update({
        where: { id: input.id },
        data: { deleted_at: new Date() },
      })
    }),

  // ── Transactions ─────────────────────────────────────────

  listTransactions: protectedProcedure
    .input(z.object({
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
      categoryId: z.string().uuid().optional(),
      includeTransfers: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      const start = new Date(input.year, input.month - 1, 1)
      const end = new Date(input.year, input.month, 1)
      return ctx.prisma.budgetTransaction.findMany({
        where: {
          workspace_id: ctx.workspaceId,
          deleted_at: null,
          date: { gte: start, lt: end },
          ...(input.categoryId ? { category_id: input.categoryId } : {}),
          ...(input.includeTransfers ? {} : { is_transfer: false }),
        },
        include: { category: true },
        orderBy: { date: 'desc' },
      })
    }),

  listSimilarTransactions: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tx = await ctx.prisma.budgetTransaction.findFirst({
        where: { id: input.id, workspace_id: ctx.workspaceId, deleted_at: null },
      })
      if (!tx?.recipient) return []
      const matchKey = normalizeRecipient(tx.recipient)
      return ctx.prisma.budgetTransaction.findMany({
        where: {
          workspace_id: ctx.workspaceId,
          deleted_at: null,
          id: { not: input.id },
          recipient: { contains: matchKey, mode: 'insensitive' },
        },
        include: { category: true },
        orderBy: { date: 'desc' },
      })
    }),

  updateTransaction: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      categoryId: z.string().uuid().nullable().optional(),
      isTransfer: z.boolean().optional(),
      notes: z.string().optional(),
      applyToSimilar: z.boolean().default(false),
      targetIds: z.array(z.string().uuid()).optional(), // explicit IDs to update (empty = none, undefined = all similar)
    }))
    .mutation(async ({ ctx, input }) => {
      const tx = await ctx.prisma.budgetTransaction.findFirst({
        where: { id: input.id, workspace_id: ctx.workspaceId, deleted_at: null },
      })
      if (!tx) throw new TRPCError({ code: 'NOT_FOUND' })

      // Check if assigned category is transfer type → set is_transfer
      let isTransfer = input.isTransfer
      if (input.categoryId) {
        const cat = await ctx.prisma.budgetCategory.findFirst({
          where: { id: input.categoryId, workspace_id: ctx.workspaceId, deleted_at: null },
        })
        if (cat?.type === 'transfer') isTransfer = true
      }

      const updated = await ctx.prisma.budgetTransaction.update({
        where: { id: input.id },
        data: {
          ...(input.categoryId !== undefined ? { category_id: input.categoryId } : {}),
          ...(isTransfer !== undefined ? { is_transfer: isTransfer } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
        include: { category: true },
      })

      // Apply to selected IDs (targetIds) or all similar (applyToSimilar)
      const shouldApply = input.categoryId !== undefined && (input.applyToSimilar || (input.targetIds && input.targetIds.length > 0))
      if (shouldApply && tx.recipient) {
        const matchKey = normalizeRecipient(tx.recipient)
        const whereIds = input.targetIds && input.targetIds.length > 0
          ? { id: { in: input.targetIds } }
          : { id: { not: input.id }, recipient: { contains: matchKey, mode: 'insensitive' as const } }

        await ctx.prisma.budgetTransaction.updateMany({
          where: {
            workspace_id: ctx.workspaceId,
            deleted_at: null,
            ...whereIds,
          },
          data: {
            category_id: input.categoryId,
            ...(isTransfer !== undefined ? { is_transfer: isTransfer } : {}),
          },
        })

        // Save rule so future imports get same treatment
        if (input.categoryId) {
          const matchKey = normalizeRecipient(tx.recipient)
          const existing = await ctx.prisma.budgetRule.findFirst({
            where: {
              workspace_id: ctx.workspaceId,
              match_value: matchKey,
              deleted_at: null,
            },
          })
          if (existing) {
            await ctx.prisma.budgetRule.update({
              where: { id: existing.id },
              data: { category_id: input.categoryId, priority: 20, is_system: false },
            })
          } else {
            await ctx.prisma.budgetRule.create({
              data: {
                workspace_id: ctx.workspaceId,
                category_id: input.categoryId,
                match_field: 'recipient',
                match_value: matchKey,
                match_type: 'contains',
                priority: 20,
                is_system: false,
              },
            })
          }
        }
      }

      return updated
    }),

  deleteTransaction: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.budgetTransaction.updateMany({
        where: { id: input.id, workspace_id: ctx.workspaceId },
        data: { deleted_at: new Date() },
      })
    }),

  // ── Dashboard stats ──────────────────────────────────────

  dashboardStats: protectedProcedure
    .input(z.object({
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
    }))
    .query(async ({ ctx, input }) => {
      const start = new Date(input.year, input.month - 1, 1)
      const end = new Date(input.year, input.month, 1)

      const transactions = await ctx.prisma.budgetTransaction.findMany({
        where: {
          workspace_id: ctx.workspaceId,
          deleted_at: null,
          date: { gte: start, lt: end },
          is_transfer: false,
        },
        include: { category: true },
      })

      // Net per category: refunds/returns in an expense category reduce that category's total
      const netByCategory = transactions
        .filter((t) => t.category)
        .reduce<Record<string, { name: string; color: string; type: string; net: number }>>(
          (acc, t) => {
            const catId = t.category_id!
            if (!acc[catId]) {
              acc[catId] = {
                name: t.category!.name,
                color: t.category!.color ?? '#94a3b8',
                type: t.category!.type,
                net: 0,
              }
            }
            acc[catId].net += t.amount
            return acc
          },
          {}
        )

      // Income = sum of positive nets in income-type categories only
      const totalIncome = Object.values(netByCategory)
        .filter((c) => c.type === 'income' && c.net > 0)
        .reduce((sum, c) => sum + c.net, 0)

      // Expenses = net of non-income categories (refunds reduce the total) + uncategorized negatives
      const totalExpenses =
        Object.values(netByCategory)
          .filter((c) => c.type !== 'income' && c.net < 0)
          .reduce((sum, c) => sum + Math.abs(c.net), 0) +
        transactions.filter((t) => !t.category_id && t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0)

      const fixedExpenses = Object.values(netByCategory)
        .filter((c) => c.type === 'fixed' && c.net < 0)
        .reduce((sum, c) => sum + Math.abs(c.net), 0)

      const variableExpenses = Object.values(netByCategory)
        .filter((c) => c.type === 'variable' && c.net < 0)
        .reduce((sum, c) => sum + Math.abs(c.net), 0)

      const uncategorized = transactions.filter((t) => !t.category_id).length

      // byCategory includes ALL categories (income + expense), sorted by absolute amount
      const byCategory = Object.entries(netByCategory)
        .map(([id, c]) => ({
          id,
          name: c.name,
          color: c.color,
          type: c.type,
          // For expense categories: show abs(net) so 0 means fully offset by refunds
          // For income categories: show positive net
          total: c.type === 'income' ? Math.max(0, c.net) : Math.abs(Math.min(0, c.net)),
        }))
        .filter((c) => c.total > 0)
        .sort((a, b) => b.total - a.total)

      return {
        totalExpenses,
        totalIncome,
        fixedExpenses,
        variableExpenses,
        uncategorized,
        byCategory,
      }
    }),

  monthlyOverview: protectedProcedure
    .input(z.object({ months: z.number().int().min(1).max(24).default(12) }))
    .query(async ({ ctx, input }) => {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth() - input.months + 1, 1)

      const transactions = await ctx.prisma.budgetTransaction.findMany({
        where: {
          workspace_id: ctx.workspaceId,
          deleted_at: null,
          date: { gte: start },
          is_transfer: false,
        },
        include: { category: true },
      })

      const monthMap: Record<string, { income: number; expenses: number; fixed: number; variable: number }> = {}

      for (const tx of transactions) {
        const key = `${tx.date.getFullYear()}-${String(tx.date.getMonth() + 1).padStart(2, '0')}`
        if (!monthMap[key]) monthMap[key] = { income: 0, expenses: 0, fixed: 0, variable: 0 }

        if (tx.amount > 0) {
          monthMap[key].income += tx.amount
        } else {
          monthMap[key].expenses += Math.abs(tx.amount)
          if (tx.category?.type === 'fixed') monthMap[key].fixed += Math.abs(tx.amount)
          if (tx.category?.type === 'variable') monthMap[key].variable += Math.abs(tx.amount)
        }
      }

      return Object.entries(monthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({ month, ...data }))
    }),

  // ── Rules ────────────────────────────────────────────────

  listRules: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.budgetRule.findMany({
      where: { workspace_id: ctx.workspaceId, deleted_at: null, is_system: false },
      include: { category: true },
      orderBy: { created_at: 'desc' },
    })
  }),

  deleteRule: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.budgetRule.updateMany({
        where: { id: input.id, workspace_id: ctx.workspaceId, is_system: false },
        data: { deleted_at: new Date() },
      })
    }),

  // ── Import (called from upload API route) ────────────────

  importTransactions: protectedProcedure
    .input(z.object({
      transactions: z.array(z.object({
        date: z.string(),
        amount: z.number().int(),
        recipient: z.string().nullable(),
        sender: z.string().nullable(),
        subject: z.string().nullable(),
        iban: z.string().nullable(),
        rawData: z.record(z.string()),
        isTransfer: z.boolean(),
        categoryId: z.string().uuid().nullable(),
      })),
      sourceFile: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ensureSeedData(ctx.prisma, ctx.workspaceId)

      const rules = await ctx.prisma.budgetRule.findMany({
        where: { workspace_id: ctx.workspaceId, deleted_at: null },
        include: { category: true },
      })

      const data = input.transactions.map((tx) => {
        let categoryId = tx.categoryId
        let isTransfer = tx.isTransfer

        if (!categoryId && !isTransfer) {
          const cat = applyRules(
            { recipient: tx.recipient, sender: tx.sender, subject: tx.subject },
            rules,
          )
          if (cat) {
            categoryId = cat.id
            if (cat.type === 'transfer') isTransfer = true
          }
        }

        return {
          workspace_id: ctx.workspaceId,
          category_id: categoryId,
          date: new Date(tx.date),
          amount: tx.amount,
          recipient: tx.recipient,
          sender: tx.sender,
          subject: tx.subject,
          iban: tx.iban,
          raw_data: tx.rawData,
          is_transfer: isTransfer,
          source_file: input.sourceFile ?? null,
        }
      })

      await ctx.prisma.budgetTransaction.createMany({ data, skipDuplicates: false })

      return { imported: data.length }
    }),
})
