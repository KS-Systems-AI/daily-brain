import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import type { Prisma } from '@prisma/client'
import { createTRPCRouter, protectedProcedure } from '../trpc'
import {
  tiptapJsonToBlocks,
  blocksToTiptapJson,
  generateSortOrder,
  midSortOrder,
  type NoteBlockData,
} from '@/lib/block-converter'

const styleSpanSchema = z.object({
  start: z.number(),
  length: z.number(),
  style: z.string(),
})

const blockInputSchema = z.object({
  id: z.string().uuid().optional(),
  block_type: z.string().default('unstyled'),
  plaintext: z.string().default(''),
  styles: z.array(styleSpanSchema).default([]),
  sort_order: z.string(),
  indent: z.number().int().min(0).default(0),
  attrs: z.record(z.unknown()).default({}),
})

export const notesRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        cursor: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        search: z.string().optional(),
        is_archived: z.boolean().default(false),
        is_pinned: z.boolean().optional(),
        parent_id: z.string().uuid().nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { cursor, limit, search, is_archived, is_pinned, parent_id } = input

      const where: Prisma.NoteWhereInput = {
        workspace_id: ctx.workspaceId,
        deleted_at: null,
        is_archived,
        parent_id: parent_id ?? null,
        ...(is_pinned !== undefined ? { is_pinned } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { content_text: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      }

      const items = await ctx.prisma.note.findMany({
        where,
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: [{ is_pinned: 'desc' }, { updated_at: 'desc' }],
        select: {
          id: true,
          title: true,
          content_text: true,
          is_pinned: true,
          is_archived: true,
          contact_id: true,
          company_id: true,
          contact: { select: { id: true, first_name: true, last_name: true } },
          company: { select: { id: true, name: true } },
          parent_id: true,
          created_at: true,
          updated_at: true,
          author: { select: { id: true, full_name: true, avatar_url: true } },
          _count: { select: { children: true } },
        },
      })

      const hasMore = items.length > limit
      if (hasMore) items.pop()

      return {
        items,
        nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
        hasMore,
      }
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const note = await ctx.prisma.note.findFirst({
        where: { id: input.id, workspace_id: ctx.workspaceId, deleted_at: null },
        include: {
          blocks: { orderBy: { sort_order: 'asc' } },
          author: { select: { id: true, full_name: true, avatar_url: true } },
          contact: { select: { id: true, first_name: true, last_name: true } },
          company: { select: { id: true, name: true } },
          children: {
            where: { deleted_at: null },
            orderBy: { position: 'asc' },
            select: {
              id: true,
              title: true,
              content_text: true,
              updated_at: true,
              position: true,
              _count: { select: { children: true } },
            },
          },
        },
      })
      if (!note) throw new TRPCError({ code: 'NOT_FOUND' })

      const breadcrumbs: { id: string; title: string | null }[] = []
      let currentParentId = note.parent_id
      for (let i = 0; i < 10 && currentParentId; i++) {
        const parent = await ctx.prisma.note.findFirst({
          where: { id: currentParentId, deleted_at: null },
          select: { id: true, title: true, parent_id: true },
        })
        if (!parent) break
        breadcrumbs.unshift({ id: parent.id, title: parent.title })
        currentParentId = parent.parent_id
      }

      const blockData: NoteBlockData[] = note.blocks.map((b) => ({
        id: b.id,
        block_type: b.block_type,
        plaintext: b.plaintext,
        styles: b.styles as unknown as NoteBlockData['styles'],
        sort_order: b.sort_order,
        indent: b.indent,
        attrs: (b.attrs as Record<string, unknown>) ?? {},
      }))

      const storedContent = note.content as Record<string, unknown> | null
      const hasStoredContent =
        storedContent &&
        typeof storedContent === 'object' &&
        Array.isArray((storedContent as { content?: unknown }).content) &&
        ((storedContent as { content: unknown[] }).content).length > 0

      const tiptapDoc = hasStoredContent
        ? storedContent
        : blocksToTiptapJson(blockData)

      return {
        ...note,
        tiptap_content: tiptapDoc,
        blocks: blockData,
        breadcrumbs,
      }
    }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().max(300).optional(),
        contact_id: z.string().uuid().optional(),
        company_id: z.string().uuid().optional(),
        deal_id: z.string().uuid().optional(),
        parent_id: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let position = 0
      if (input.parent_id) {
        const parent = await ctx.prisma.note.findFirst({
          where: { id: input.parent_id, workspace_id: ctx.workspaceId, deleted_at: null },
        })
        if (!parent) throw new TRPCError({ code: 'NOT_FOUND', message: 'Parent note not found' })

        const maxPos = await ctx.prisma.note.aggregate({
          where: { parent_id: input.parent_id, deleted_at: null },
          _max: { position: true },
        })
        position = (maxPos._max.position ?? -1) + 1
      }

      const note = await ctx.prisma.note.create({
        data: {
          workspace_id: ctx.workspaceId!,
          author_id: ctx.userId!,
          title: input.title ?? null,
          content: {},
          content_text: '',
          contact_id: input.contact_id ?? null,
          company_id: input.company_id ?? null,
          deal_id: input.deal_id ?? null,
          parent_id: input.parent_id ?? null,
          position,
        },
      })

      const emptyBlock = await ctx.prisma.noteBlock.create({
        data: {
          note_id: note.id,
          block_type: 'unstyled',
          plaintext: '',
          styles: [],
          sort_order: generateSortOrder(0, 1),
          indent: 0,
          attrs: {},
        },
      })

      return {
        ...note,
        blocks: [emptyBlock],
      }
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().max(300).optional(),
        is_pinned: z.boolean().optional(),
        is_archived: z.boolean().optional(),
        contact_id: z.string().uuid().nullish(),
        company_id: z.string().uuid().nullish(),
        parent_id: z.string().uuid().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const note = await ctx.prisma.note.findFirst({
        where: { id: input.id, workspace_id: ctx.workspaceId, deleted_at: null },
      })
      if (!note) throw new TRPCError({ code: 'NOT_FOUND' })

      const data: Prisma.NoteUncheckedUpdateInput = {}
      if (input.title !== undefined) data.title = input.title
      if (input.is_pinned !== undefined) data.is_pinned = input.is_pinned
      if (input.is_archived !== undefined) data.is_archived = input.is_archived
      if (input.contact_id !== undefined) data.contact_id = input.contact_id ?? null
      if (input.company_id !== undefined) data.company_id = input.company_id ?? null
      if (input.parent_id !== undefined) data.parent_id = input.parent_id ?? null

      return ctx.prisma.note.update({ where: { id: input.id }, data })
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const note = await ctx.prisma.note.findFirst({
        where: { id: input.id, workspace_id: ctx.workspaceId, deleted_at: null },
      })
      if (!note) throw new TRPCError({ code: 'NOT_FOUND' })

      const now = new Date()
      const idsToDelete: string[] = [input.id]
      let queue = [input.id]
      while (queue.length > 0) {
        const kids = await ctx.prisma.note.findMany({
          where: { parent_id: { in: queue }, deleted_at: null },
          select: { id: true },
        })
        const kidIds = kids.map((k) => k.id)
        idsToDelete.push(...kidIds)
        queue = kidIds
      }

      await ctx.prisma.note.updateMany({
        where: { id: { in: idsToDelete } },
        data: { deleted_at: now },
      })
      return { success: true }
    }),

  reorderChildren: protectedProcedure
    .input(
      z.object({
        parent_id: z.string().uuid(),
        child_ids: z.array(z.string().uuid()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const parent = await ctx.prisma.note.findFirst({
        where: { id: input.parent_id, workspace_id: ctx.workspaceId, deleted_at: null },
      })
      if (!parent) throw new TRPCError({ code: 'NOT_FOUND' })

      await ctx.prisma.$transaction(
        input.child_ids.map((id, index) =>
          ctx.prisma.note.update({ where: { id }, data: { position: index } }),
        ),
      )
      return { success: true }
    }),

  upsertBlocks: protectedProcedure
    .input(
      z.object({
        note_id: z.string().uuid(),
        blocks: z.array(blockInputSchema),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const note = await ctx.prisma.note.findFirst({
        where: { id: input.note_id, workspace_id: ctx.workspaceId, deleted_at: null },
      })
      if (!note) throw new TRPCError({ code: 'NOT_FOUND' })

      await ctx.prisma.$transaction(async (tx) => {
        for (const block of input.blocks) {
          const data = {
            block_type: block.block_type,
            plaintext: block.plaintext,
            styles: block.styles as unknown as Prisma.InputJsonValue,
            sort_order: block.sort_order,
            indent: block.indent,
            attrs: block.attrs as Prisma.InputJsonValue,
          }

          if (block.id) {
            await tx.noteBlock.upsert({
              where: { id: block.id },
              create: { id: block.id, note_id: input.note_id, ...data },
              update: data,
            })
          } else {
            await tx.noteBlock.create({
              data: { note_id: input.note_id, ...data },
            })
          }
        }

        const allBlocks = await tx.noteBlock.findMany({
          where: { note_id: input.note_id },
          orderBy: { sort_order: 'asc' },
        })

        const contentText = allBlocks.map((b) => b.plaintext).join('\n')
        const blockDataForDoc: NoteBlockData[] = allBlocks.map((b) => ({
          id: b.id,
          block_type: b.block_type,
          plaintext: b.plaintext,
          styles: b.styles as unknown as NoteBlockData['styles'],
          sort_order: b.sort_order,
          indent: b.indent,
          attrs: (b.attrs as Record<string, unknown>) ?? {},
        }))
        const tiptapDoc = blocksToTiptapJson(blockDataForDoc)

        await tx.note.update({
          where: { id: input.note_id },
          data: {
            content: tiptapDoc as unknown as Prisma.InputJsonValue,
            content_text: contentText,
          },
        })
      })

      const updatedBlocks = await ctx.prisma.noteBlock.findMany({
        where: { note_id: input.note_id },
        orderBy: { sort_order: 'asc' },
      })

      return updatedBlocks
    }),

  deleteBlocks: protectedProcedure
    .input(
      z.object({
        note_id: z.string().uuid(),
        block_ids: z.array(z.string().uuid()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const note = await ctx.prisma.note.findFirst({
        where: { id: input.note_id, workspace_id: ctx.workspaceId, deleted_at: null },
      })
      if (!note) throw new TRPCError({ code: 'NOT_FOUND' })

      await ctx.prisma.noteBlock.deleteMany({
        where: { id: { in: input.block_ids }, note_id: input.note_id },
      })

      const remaining = await ctx.prisma.noteBlock.findMany({
        where: { note_id: input.note_id },
        orderBy: { sort_order: 'asc' },
      })

      const contentText = remaining.map((b) => b.plaintext).join('\n')
      const blockDataForDoc: NoteBlockData[] = remaining.map((b) => ({
        id: b.id,
        block_type: b.block_type,
        plaintext: b.plaintext,
        styles: b.styles as unknown as NoteBlockData['styles'],
        sort_order: b.sort_order,
        indent: b.indent,
        attrs: (b.attrs as Record<string, unknown>) ?? {},
      }))
      const tiptapDoc = blocksToTiptapJson(blockDataForDoc)

      await ctx.prisma.note.update({
        where: { id: input.note_id },
        data: {
          content: tiptapDoc as unknown as Prisma.InputJsonValue,
          content_text: contentText,
        },
      })

      return { success: true }
    }),

  saveFromTiptap: protectedProcedure
    .input(
      z.object({
        note_id: z.string().uuid(),
        tiptap_json: z.record(z.unknown()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const note = await ctx.prisma.note.findFirst({
        where: { id: input.note_id, workspace_id: ctx.workspaceId, deleted_at: null },
      })
      if (!note) throw new TRPCError({ code: 'NOT_FOUND' })

      const newBlocks = tiptapJsonToBlocks(input.tiptap_json as unknown as Parameters<typeof tiptapJsonToBlocks>[0])

      await ctx.prisma.$transaction(async (tx) => {
        await tx.noteBlock.deleteMany({ where: { note_id: input.note_id } })

        if (newBlocks.length > 0) {
          await tx.noteBlock.createMany({
            data: newBlocks.map((b) => ({
              id: b.id,
              note_id: input.note_id,
              block_type: b.block_type,
              plaintext: b.plaintext,
              styles: b.styles as unknown as Prisma.InputJsonValue,
              sort_order: b.sort_order,
              indent: b.indent,
              attrs: b.attrs as Prisma.InputJsonValue,
            })),
          })
        }

        const contentText = newBlocks.map((b) => b.plaintext).join('\n')
        await tx.note.update({
          where: { id: input.note_id },
          data: {
            content: input.tiptap_json as Prisma.InputJsonValue,
            content_text: contentText,
          },
        })
      })

      return { success: true }
    }),

  reorderBlock: protectedProcedure
    .input(
      z.object({
        note_id: z.string().uuid(),
        block_id: z.string().uuid(),
        before_id: z.string().uuid().nullable(),
        after_id: z.string().uuid().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const note = await ctx.prisma.note.findFirst({
        where: { id: input.note_id, workspace_id: ctx.workspaceId, deleted_at: null },
      })
      if (!note) throw new TRPCError({ code: 'NOT_FOUND' })

      let beforeOrder: string | null = null
      let afterOrder: string | null = null

      if (input.before_id) {
        const before = await ctx.prisma.noteBlock.findUnique({
          where: { id: input.before_id },
          select: { sort_order: true },
        })
        beforeOrder = before?.sort_order ?? null
      }

      if (input.after_id) {
        const after = await ctx.prisma.noteBlock.findUnique({
          where: { id: input.after_id },
          select: { sort_order: true },
        })
        afterOrder = after?.sort_order ?? null
      }

      const newOrder = midSortOrder(beforeOrder, afterOrder)

      await ctx.prisma.noteBlock.update({
        where: { id: input.block_id },
        data: { sort_order: newOrder },
      })

      return { sort_order: newOrder }
    }),
})
