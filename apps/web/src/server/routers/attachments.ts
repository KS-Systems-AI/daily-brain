import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createTRPCRouter, protectedProcedure } from '../trpc'
import { processAttachment } from '../lib/attachment-ocr'

const BUCKET = 'attachments'
const MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export const attachmentsRouter = createTRPCRouter({
  // Returns a signed upload URL. Client uploads directly to Supabase Storage.
  getUploadUrl: protectedProcedure
    .input(
      z.object({
        filename: z.string().min(1).max(500),
        mime_type: z.string(),
        size_bytes: z.number().int().positive().max(MAX_SIZE_BYTES),
        contact_id: z.string().uuid().optional(),
        company_id: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ALLOWED_MIME_TYPES.has(input.mime_type)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Dateityp nicht unterstützt.' })
      }

      const storageKey = `${ctx.workspaceId}/${input.contact_id ?? input.company_id ?? 'general'}/${Date.now()}-${input.filename}`

      const supabase = serviceClient()
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUploadUrl(storageKey)

      if (error || !data) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error?.message ?? 'Upload-URL konnte nicht erstellt werden.' })
      }

      // Create DB record with pending status
      const attachment = await ctx.prisma.attachment.create({
        data: {
          workspace_id: ctx.workspaceId!,
          uploaded_by_id: ctx.userId!,
          contact_id: input.contact_id ?? null,
          company_id: input.company_id ?? null,
          filename: input.filename,
          mime_type: input.mime_type,
          size_bytes: input.size_bytes,
          storage_key: storageKey,
          ocr_status: 'pending',
        },
      })

      return { uploadUrl: data.signedUrl, token: data.token, attachmentId: attachment.id, storageKey }
    }),

  // Called after upload completes — marks attachment as processing
  // Client then calls /api/attachments/process to run OCR as a proper HTTP request
  confirmUpload: protectedProcedure
    .input(z.object({ attachmentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const attachment = await ctx.prisma.attachment.findFirst({
        where: { id: input.attachmentId, workspace_id: ctx.workspaceId!, deleted_at: null },
      })
      if (!attachment) throw new TRPCError({ code: 'NOT_FOUND' })

      await ctx.prisma.attachment.update({
        where: { id: attachment.id },
        data: { ocr_status: 'processing' },
      })

      return { ok: true }
    }),

  list: protectedProcedure
    .input(
      z.object({
        contact_id: z.string().uuid().optional(),
        company_id: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const attachments = await ctx.prisma.attachment.findMany({
        where: {
          workspace_id: ctx.workspaceId!,
          contact_id: input.contact_id ?? undefined,
          company_id: input.company_id ?? undefined,
          deleted_at: null,
        },
        orderBy: { created_at: 'desc' },
        include: { uploaded_by: { select: { full_name: true, avatar_url: true } } },
      })

      const supabase = serviceClient()
      const withUrls = await Promise.all(
        attachments.map(async (a) => {
          const { data } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(a.storage_key, 3600) // 1h
          return { ...a, url: data?.signedUrl ?? null }
        }),
      )

      return withUrls
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const attachment = await ctx.prisma.attachment.findFirst({
        where: { id: input.id, workspace_id: ctx.workspaceId!, deleted_at: null },
      })
      if (!attachment) throw new TRPCError({ code: 'NOT_FOUND' })

      const supabase = serviceClient()
      await supabase.storage.from(BUCKET).remove([attachment.storage_key])

      await ctx.prisma.attachment.update({
        where: { id: input.id },
        data: { deleted_at: new Date() },
      })

      return { ok: true }
    }),
})
