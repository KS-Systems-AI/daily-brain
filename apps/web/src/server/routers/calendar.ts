import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../trpc'
import { fullSync, incrementalSync, linkEventsToNewContact } from '../lib/calendar/sync'
import {
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
} from '../lib/calendar/google-calendar'
import {
  createMicrosoftEvent,
  updateMicrosoftEvent,
  deleteMicrosoftEvent,
} from '../lib/calendar/microsoft-graph'
import { logActivity, ACT_MEETING_CREATED, ACT_MEETING_UPDATED } from '../lib/activity'

const recurringModeSchema = z.enum(['THIS', 'THIS_AND_FOLLOWING', 'ALL']).default('THIS')

const eventPatchSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  start_at: z.coerce.date().optional(),
  end_at: z.coerce.date().optional(),
  is_all_day: z.boolean().optional(),
  attendees: z.array(z.object({ email: z.string().email() })).optional(),
  record_type: z.enum(['contact', 'company', 'deal']).nullable().optional(),
  record_id: z.string().uuid().nullable().optional(),
})

export const calendarRouter = createTRPCRouter({
  // ─── Konten verwalten ────────────────────────────────────────────

  listAccounts: protectedProcedure.query(({ ctx }) => {
    return ctx.prisma.calendarAccount.findMany({
      where: { workspace_id: ctx.workspaceId, deleted_at: null, is_active: true },
      select: {
        id: true,
        provider: true,
        email: true,
        display_name: true,
        last_synced_at: true,
        calendar_id: true,
      },
      orderBy: { created_at: 'asc' },
    })
  }),

  disconnectAccount: protectedProcedure
    .input(z.object({ accountId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const account = await ctx.prisma.calendarAccount.findFirst({
        where: { id: input.accountId, workspace_id: ctx.workspaceId, deleted_at: null },
      })
      if (!account) throw new TRPCError({ code: 'NOT_FOUND' })

      await ctx.prisma.calendarAccount.update({
        where: { id: input.accountId },
        data: { deleted_at: new Date(), is_active: false },
      })

      // Lokale Termine des Kontos Soft-Delete
      await ctx.prisma.calendarEvent.updateMany({
        where: { account_id: input.accountId, deleted_at: null },
        data: { deleted_at: new Date() },
      })
    }),

  // ─── Termine lesen ───────────────────────────────────────────────

  list: protectedProcedure
    .input(
      z.object({
        startAt: z.coerce.date(),
        endAt: z.coerce.date(),
        accountId: z.string().uuid().optional(),
      }),
    )
    .query(({ ctx, input }) => {
      return ctx.prisma.calendarEvent.findMany({
        where: {
          workspace_id: ctx.workspaceId,
          deleted_at: null,
          status: { not: 'cancelled' },
          start_at: { lte: input.endAt },
          end_at: { gte: input.startAt },
          ...(input.accountId ? { account_id: input.accountId } : {}),
        },
        include: {
          account: { select: { id: true, provider: true, email: true, display_name: true } },
        },
        orderBy: { start_at: 'asc' },
      })
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const event = await ctx.prisma.calendarEvent.findFirst({
        where: { id: input.id, workspace_id: ctx.workspaceId, deleted_at: null },
        include: {
          account: { select: { id: true, provider: true, email: true } },
        },
      })
      if (!event) throw new TRPCError({ code: 'NOT_FOUND' })
      return event
    }),

  // ─── Termine erstellen ───────────────────────────────────────────

  create: protectedProcedure
    .input(
      z.object({
        accountId: z.string().uuid(),
        title: z.string().min(1).max(300),
        description: z.string().nullable().optional(),
        location: z.string().nullable().optional(),
        start_at: z.coerce.date(),
        end_at: z.coerce.date(),
        is_all_day: z.boolean().default(false),
        attendees: z.array(z.object({ email: z.string().email() })).optional(),
        record_type: z.enum(['contact', 'company', 'deal']).nullable().optional(),
        record_id: z.string().uuid().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ctx.prisma.calendarAccount.findFirst({
        where: { id: input.accountId, workspace_id: ctx.workspaceId, deleted_at: null, is_active: true },
      })
      if (!account) throw new TRPCError({ code: 'NOT_FOUND', message: 'Kalender-Konto nicht gefunden' })

      let externalId: string
      if (account.provider === 'google') {
        externalId = await createGoogleEvent(account, input)
      } else {
        externalId = await createMicrosoftEvent(account, input)
      }

      const created = await ctx.prisma.calendarEvent.create({
        data: {
          workspace_id: ctx.workspaceId,
          account_id: account.id,
          external_id: externalId,
          title: input.title,
          description: input.description ?? null,
          location: input.location ?? null,
          start_at: input.start_at,
          end_at: input.end_at,
          is_all_day: input.is_all_day,
          attendees: (input.attendees ?? []) as unknown as import('@prisma/client').Prisma.InputJsonValue,
          status: 'confirmed',
          record_type: input.record_type ?? null,
          record_id: input.record_id ?? null,
        },
      })

      // Create links for attendees matching contacts/companies
      if (input.attendees && input.attendees.length > 0) {
        const attendeeEmails = input.attendees.map((a) => a.email.toLowerCase())

        const [matchingContacts, matchingCompanies] = await Promise.all([
          ctx.prisma.contact.findMany({
            where: { workspace_id: ctx.workspaceId, deleted_at: null },
            select: { id: true, email: true },
          }),
          ctx.prisma.company.findMany({
            where: {
              workspace_id: ctx.workspaceId,
              deleted_at: null,
              domain: { not: null },
            },
            select: { id: true, domain: true },
          }),
        ])

        const linksToCreate: { workspace_id: string; event_id: string; record_type: string; record_id: string }[] = []

        for (const contact of matchingContacts) {
          const contactEmails = (contact.email ?? []).map((e: string) => e.toLowerCase())
          if (attendeeEmails.some((ae) => contactEmails.includes(ae))) {
            linksToCreate.push({
              workspace_id: ctx.workspaceId,
              event_id: created.id,
              record_type: 'contact',
              record_id: contact.id,
            })
          }
        }

        const domains = [...new Set(attendeeEmails.map((e) => e.split('@')[1]).filter(Boolean))]
        for (const company of matchingCompanies) {
          if (company.domain && domains.includes(company.domain.toLowerCase())) {
            linksToCreate.push({
              workspace_id: ctx.workspaceId,
              event_id: created.id,
              record_type: 'company',
              record_id: company.id,
            })
          }
        }

        if (linksToCreate.length > 0) {
          await ctx.prisma.calendarEventLink.createMany({
            data: linksToCreate,
            skipDuplicates: true,
          })

          for (const link of linksToCreate) {
            await logActivity({
              prisma: ctx.prisma,
              workspaceId: ctx.workspaceId,
              actorId: ctx.userId!,
              type: ACT_MEETING_CREATED,
              data: { eventId: created.id, title: input.title, startAt: input.start_at.toISOString() },
              recordType: link.record_type as 'contact' | 'company' | 'deal',
              recordId: link.record_id,
              contactId: link.record_type === 'contact' ? link.record_id : null,
              companyId: link.record_type === 'company' ? link.record_id : null,
            })
          }
        }
      }

      return created
    }),

  // ─── Termine bearbeiten ──────────────────────────────────────────

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        patch: eventPatchSchema,
        recurringMode: recurringModeSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const event = await ctx.prisma.calendarEvent.findFirst({
        where: { id: input.id, workspace_id: ctx.workspaceId, deleted_at: null },
        include: { account: true },
      })
      if (!event) throw new TRPCError({ code: 'NOT_FOUND' })

      if (event.account.provider === 'google') {
        await updateGoogleEvent(
          event.account,
          event.external_id,
          input.patch,
          input.recurringMode,
          event.recurring_event_id ?? undefined,
        )
      } else {
        await updateMicrosoftEvent(event.account, event.external_id, input.patch, input.recurringMode)
      }

      // Lokale DB aktualisieren
      const update: Record<string, unknown> = {}
      if (input.patch.title !== undefined) update['title'] = input.patch.title
      if (input.patch.description !== undefined) update['description'] = input.patch.description
      if (input.patch.location !== undefined) update['location'] = input.patch.location
      if (input.patch.start_at !== undefined) update['start_at'] = input.patch.start_at
      if (input.patch.end_at !== undefined) update['end_at'] = input.patch.end_at
      if (input.patch.is_all_day !== undefined) update['is_all_day'] = input.patch.is_all_day
      if (input.patch.attendees !== undefined) update['attendees'] = input.patch.attendees
      if (input.patch.record_type !== undefined) update['record_type'] = input.patch.record_type
      if (input.patch.record_id !== undefined) update['record_id'] = input.patch.record_id

      if (input.recurringMode === 'ALL') {
        // Alle Instanzen der Serie lokal aktualisieren (Titel, Beschreibung etc. — keine Zeiten)
        const seriesUpdate = { ...update }
        delete seriesUpdate['start_at']
        delete seriesUpdate['end_at']

        const masterId = event.recurring_event_id ?? event.external_id
        if (Object.keys(seriesUpdate).length > 0) {
          await ctx.prisma.calendarEvent.updateMany({
            where: {
              workspace_id: ctx.workspaceId,
              account_id: event.account_id,
              recurring_event_id: masterId,
              id: { not: event.id },
              deleted_at: null,
            },
            data: seriesUpdate as Parameters<typeof ctx.prisma.calendarEvent.updateMany>[0]['data'],
          })
        }
      }

      const updated = await ctx.prisma.calendarEvent.update({
        where: { id: input.id },
        data: update as Parameters<typeof ctx.prisma.calendarEvent.update>[0]['data'],
      })

      const recordType = input.patch.record_type ?? event.record_type
      const recordId = input.patch.record_id ?? event.record_id
      if (recordType && recordId) {
        await logActivity({
          prisma: ctx.prisma,
          workspaceId: ctx.workspaceId,
          actorId: ctx.userId!,
          type: ACT_MEETING_UPDATED,
          data: { eventId: event.id, title: input.patch.title ?? event.title, startAt: (input.patch.start_at ?? event.start_at).toISOString() },
          recordType: recordType as 'contact' | 'company' | 'deal',
          recordId: recordId,
          contactId: recordType === 'contact' ? recordId : null,
          companyId: recordType === 'company' ? recordId : null,
        })
      }

      return updated
    }),

  // ─── Termine löschen ────────────────────────────────────────────

  delete: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        recurringMode: recurringModeSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const event = await ctx.prisma.calendarEvent.findFirst({
        where: { id: input.id, workspace_id: ctx.workspaceId, deleted_at: null },
        include: { account: true },
      })
      if (!event) throw new TRPCError({ code: 'NOT_FOUND' })

      if (event.account.provider === 'google') {
        await deleteGoogleEvent(event.account, event.external_id, input.recurringMode)
      } else {
        await deleteMicrosoftEvent(event.account, event.external_id, input.recurringMode)
      }

      const now = new Date()
      if (input.recurringMode === 'ALL') {
        const masterId = event.recurring_event_id ?? event.external_id
        await ctx.prisma.calendarEvent.updateMany({
          where: {
            workspace_id: ctx.workspaceId,
            account_id: event.account_id,
            recurring_event_id: masterId,
            deleted_at: null,
          },
          data: { deleted_at: now },
        })
      }

      await ctx.prisma.calendarEvent.update({
        where: { id: input.id },
        data: { deleted_at: now },
      })
    }),

  // ─── Manueller Sync ──────────────────────────────────────────────

  syncNow: protectedProcedure
    .input(z.object({ accountId: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }) => {
      const where = {
        workspace_id: ctx.workspaceId,
        deleted_at: null as null,
        is_active: true,
        ...(input.accountId ? { id: input.accountId } : {}),
      }
      const accounts = await ctx.prisma.calendarAccount.findMany({ where })

      // Full-Sync erzwingen: sync_token zurücksetzen damit alle Termine neu geladen werden
      await ctx.prisma.calendarAccount.updateMany({
        where: { id: { in: accounts.map((a) => a.id) } },
        data: { sync_token: null },
      })
      const fresh = await ctx.prisma.calendarAccount.findMany({ where })
      await Promise.all(fresh.map((acc) => fullSync(acc)))
      return { synced: fresh.length }
    }),
})
