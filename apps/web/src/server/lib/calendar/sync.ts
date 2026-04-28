import type { CalendarAccount } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  listGoogleEvents,
  listGoogleEventsDelta,
  getGoogleSyncToken,
  refreshTokenIfNeeded,
} from './google-calendar'
import {
  listMicrosoftEvents,
  listMicrosoftEventsDelta,
  getMicrosoftDeltaLink,
  refreshMicrosoftToken,
} from './microsoft-graph'
import type { NormalizedEvent } from './event-mapper'
import { logActivity, ACT_MEETING_CREATED, ACT_MEETING_UPDATED } from '../activity'

const FULL_SYNC_WINDOW_MONTHS = 3

/**
 * Vollständiger Sync: letzte 3 Monate + nächste 3 Monate.
 * Wird beim ersten Verbinden eines Kontos aufgerufen.
 */
export async function fullSync(account: CalendarAccount): Promise<void> {
  const now = new Date()
  const timeMin = new Date(now)
  timeMin.setMonth(timeMin.getMonth() - FULL_SYNC_WINDOW_MONTHS)
  const timeMax = new Date(now)
  timeMax.setMonth(timeMax.getMonth() + FULL_SYNC_WINDOW_MONTHS)

  const fresh = account.provider === 'google'
    ? await refreshTokenIfNeeded(account)
    : await refreshMicrosoftToken(account)

  let events: NormalizedEvent[]
  let nextSyncToken: string | null = null

  if (fresh.provider === 'google') {
    events = await listGoogleEvents(fresh, timeMin, timeMax)
    nextSyncToken = await getGoogleSyncToken(fresh)
  } else {
    events = await listMicrosoftEvents(fresh, timeMin, timeMax)
    nextSyncToken = await getMicrosoftDeltaLink(fresh)
  }

  await upsertEvents(account, events)

  // Veraltete Events im Sync-Fenster entfernen: Events, die lokal existieren aber
  // nicht mehr von der API zurückkommen (z.B. wenn sich recurring-event IDs ändern)
  const syncedExternalIds = events.map((ev) => ev.external_id)
  if (syncedExternalIds.length > 0) {
    await prisma.calendarEvent.updateMany({
      where: {
        account_id: account.id,
        deleted_at: null,
        start_at: { gte: timeMin, lte: timeMax },
        external_id: { notIn: syncedExternalIds },
      },
      data: { deleted_at: new Date() },
    })
  }

  await prisma.calendarAccount.update({
    where: { id: account.id },
    data: { sync_token: nextSyncToken, last_synced_at: new Date() },
  })
}

/**
 * Inkrementeller Sync: nur geänderte Termine seit letztem Sync-Token.
 * Fällt bei abgelaufenem Token auf Vollsync zurück.
 */
export async function incrementalSync(account: CalendarAccount): Promise<void> {
  if (!account.sync_token) {
    await fullSync(account)
    return
  }

  const fresh = account.provider === 'google'
    ? await refreshTokenIfNeeded(account)
    : await refreshMicrosoftToken(account)

  let events: NormalizedEvent[]
  let nextSyncToken: string | null = null

  if (fresh.provider === 'google') {
    const result = await listGoogleEventsDelta(fresh, fresh.sync_token!)
    if (result.nextSyncToken === null && result.events.length === 0) {
      await fullSync(fresh)
      return
    }
    events = result.events
    nextSyncToken = result.nextSyncToken
  } else {
    const result = await listMicrosoftEventsDelta(fresh, fresh.sync_token!)
    if (result.nextDeltaLink === null && result.events.length === 0) {
      await fullSync(fresh)
      return
    }
    events = result.events
    nextSyncToken = result.nextDeltaLink
  }

  await upsertEvents(fresh, events)

  await prisma.calendarAccount.update({
    where: { id: account.id },
    data: {
      sync_token: nextSyncToken ?? account.sync_token,
      last_synced_at: new Date(),
    },
  })
}

async function upsertEvents(account: CalendarAccount, events: NormalizedEvent[]): Promise<void> {
  if (events.length === 0) return

  const cancelled = events.filter((ev) => ev.status === 'cancelled')
  const active = events.filter((ev) => ev.status !== 'cancelled')
  const now = new Date()

  // Soft-Delete abgesagte Termine (batch)
  if (cancelled.length > 0) {
    await prisma.calendarEvent.updateMany({
      where: {
        account_id: account.id,
        external_id: { in: cancelled.map((ev) => ev.external_id) },
        deleted_at: null,
      },
      data: { deleted_at: now },
    })
  }

  // Load existing events to detect changes for activity logging
  const existingExternalIds = active.map((ev) => ev.external_id)
  const existingEvents = existingExternalIds.length > 0
    ? await prisma.calendarEvent.findMany({
        where: { account_id: account.id, external_id: { in: existingExternalIds } },
        select: { id: true, external_id: true, title: true, start_at: true, record_type: true, record_id: true },
      })
    : []
  const existingByExtId = new Map(existingEvents.map((e) => [e.external_id, e]))

  // Aktive Termine parallel upserten (max. 20 gleichzeitig um DB nicht zu überlasten)
  const BATCH = 20
  for (let i = 0; i < active.length; i += BATCH) {
    const chunk = active.slice(i, i + BATCH)
    await Promise.all(
      chunk.map((ev) =>
        prisma.calendarEvent.upsert({
          where: { account_id_external_id: { account_id: account.id, external_id: ev.external_id } },
          create: {
            workspace_id: account.workspace_id,
            account_id: account.id,
            external_id: ev.external_id,
            title: ev.title,
            description: ev.description,
            location: ev.location,
            start_at: ev.start_at,
            end_at: ev.end_at,
            is_all_day: ev.is_all_day,
            attendees: ev.attendees as unknown as import('@prisma/client').Prisma.InputJsonValue,
            organizer_email: ev.organizer_email,
            status: ev.status,
            recurrence_rule: ev.recurrence_rule,
            recurring_event_id: ev.recurring_event_id,
            original_start_at: ev.original_start_at,
            deleted_at: null,
          },
          update: {
            title: ev.title,
            description: ev.description,
            location: ev.location,
            start_at: ev.start_at,
            end_at: ev.end_at,
            is_all_day: ev.is_all_day,
            attendees: ev.attendees as unknown as import('@prisma/client').Prisma.InputJsonValue,
            organizer_email: ev.organizer_email,
            status: ev.status,
            recurrence_rule: ev.recurrence_rule,
            recurring_event_id: ev.recurring_event_id,
            original_start_at: ev.original_start_at,
            deleted_at: null,
          },
        }),
      ),
    )
  }

  // Log ACT_MEETING_UPDATED for linked events that changed
  for (const ev of active) {
    const existing = existingByExtId.get(ev.external_id)
    if (!existing || !existing.record_type || !existing.record_id) continue

    const titleChanged = existing.title !== ev.title
    const timeChanged = existing.start_at.getTime() !== ev.start_at.getTime()
    if (!titleChanged && !timeChanged) continue

    await logActivity({
      prisma,
      workspaceId: account.workspace_id,
      actorId: account.user_id,
      type: ACT_MEETING_UPDATED,
      data: {
        eventId: existing.id,
        title: ev.title,
        startAt: ev.start_at.toISOString(),
      },
      recordType: existing.record_type as 'contact' | 'company' | 'deal',
      recordId: existing.record_id,
      contactId: existing.record_type === 'contact' ? existing.record_id : null,
      companyId: existing.record_type === 'company' ? existing.record_id : null,
    })
  }

  // Teilnehmer mit Kontakten/Firmen abgleichen und Termine verknüpfen
  await linkAttendeesToContacts(account, active)
}

/**
 * Gleicht Teilnehmer-E-Mails gegen Kontakte und Firmen ab und
 * erstellt Einträge in calendar_event_links (many-to-many).
 */
async function linkAttendeesToContacts(
  account: CalendarAccount,
  events: NormalizedEvent[],
): Promise<void> {
  const eventsWithAttendees = events.filter(
    (ev) => Array.isArray(ev.attendees) && ev.attendees.length > 0,
  )
  if (eventsWithAttendees.length === 0) return

  const allEmails = new Set<string>()
  for (const ev of eventsWithAttendees) {
    for (const att of ev.attendees as { email: string }[]) {
      if (att.email) allEmails.add(att.email.toLowerCase())
    }
  }
  if (allEmails.size === 0) return

  const emailList = Array.from(allEmails)
  const domainList = [...new Set(emailList.map((e) => e.split('@')[1]).filter(Boolean))]

  const [contacts, companies] = await Promise.all([
    prisma.contact.findMany({
      where: { workspace_id: account.workspace_id, deleted_at: null },
      select: { id: true, email: true, company_id: true },
    }),
    domainList.length > 0
      ? prisma.company.findMany({
          where: {
            workspace_id: account.workspace_id,
            deleted_at: null,
            domain: { in: domainList, mode: 'insensitive' },
          },
          select: { id: true, domain: true },
        })
      : [],
  ])

  const emailToContact = new Map<string, string>()
  for (const c of contacts) {
    for (const e of c.email ?? []) {
      emailToContact.set(e.toLowerCase(), c.id)
    }
  }
  const domainToCompany = new Map<string, string>()
  for (const co of companies) {
    if (co.domain) domainToCompany.set(co.domain.toLowerCase(), co.id)
  }

  // Load all DB events for these external IDs in one query
  const externalIds = eventsWithAttendees.map((ev) => ev.external_id)
  const dbEvents = await prisma.calendarEvent.findMany({
    where: { account_id: account.id, external_id: { in: externalIds } },
    select: { id: true, external_id: true },
  })
  const extIdToDbId = new Map(dbEvents.map((e) => [e.external_id, e.id]))

  // Load existing links to avoid duplicates
  const dbEventIds = dbEvents.map((e) => e.id)
  const existingLinks = dbEventIds.length > 0
    ? await prisma.calendarEventLink.findMany({
        where: { event_id: { in: dbEventIds } },
        select: { event_id: true, record_type: true, record_id: true },
      })
    : []
  const existingLinkSet = new Set(
    existingLinks.map((l) => `${l.event_id}:${l.record_type}:${l.record_id}`),
  )

  const linksToCreate: {
    workspace_id: string; event_id: string; record_type: string; record_id: string
  }[] = []
  const activitiesToLog: {
    recordType: 'contact' | 'company'; recordId: string
    contactId: string | null; companyId: string | null
    eventId: string; title: string; startAt: string
  }[] = []

  for (const ev of eventsWithAttendees) {
    const dbEventId = extIdToDbId.get(ev.external_id)
    if (!dbEventId) continue

    const linkedRecords = new Set<string>()

    for (const att of ev.attendees as { email: string }[]) {
      const email = att.email?.toLowerCase()
      if (!email) continue

      const contactId = emailToContact.get(email)
      if (contactId) {
        const key = `${dbEventId}:contact:${contactId}`
        if (!existingLinkSet.has(key) && !linkedRecords.has(key)) {
          linkedRecords.add(key)
          linksToCreate.push({
            workspace_id: account.workspace_id,
            event_id: dbEventId,
            record_type: 'contact',
            record_id: contactId,
          })
          activitiesToLog.push({
            recordType: 'contact', recordId: contactId,
            contactId, companyId: null,
            eventId: dbEventId, title: ev.title, startAt: ev.start_at.toISOString(),
          })
        }
      }

      const domain = email.split('@')[1]
      if (domain) {
        const companyId = domainToCompany.get(domain)
        if (companyId) {
          const key = `${dbEventId}:company:${companyId}`
          if (!existingLinkSet.has(key) && !linkedRecords.has(key)) {
            linkedRecords.add(key)
            linksToCreate.push({
              workspace_id: account.workspace_id,
              event_id: dbEventId,
              record_type: 'company',
              record_id: companyId,
            })
            activitiesToLog.push({
              recordType: 'company', recordId: companyId,
              contactId: null, companyId,
              eventId: dbEventId, title: ev.title, startAt: ev.start_at.toISOString(),
            })
          }
        }
      }
    }
  }

  if (linksToCreate.length > 0) {
    await prisma.calendarEventLink.createMany({
      data: linksToCreate,
      skipDuplicates: true,
    })
  }

  for (const act of activitiesToLog) {
    await logActivity({
      prisma,
      workspaceId: account.workspace_id,
      actorId: account.user_id,
      type: ACT_MEETING_CREATED,
      data: { eventId: act.eventId, title: act.title, startAt: act.startAt },
      recordType: act.recordType,
      recordId: act.recordId,
      contactId: act.contactId,
      companyId: act.companyId,
    })
  }
}

/**
 * Verlinkt bestehende Kalender-Events mit einem neu erstellten Kontakt
 * anhand der E-Mail-Adressen des Kontakts.
 */
export async function linkEventsToNewContact(
  workspaceId: string,
  userId: string,
  contactId: string,
  contactEmails: string[],
): Promise<void> {
  if (contactEmails.length === 0) return
  const normalizedEmails = contactEmails.map((e) => e.toLowerCase())

  const events = await prisma.calendarEvent.findMany({
    where: {
      workspace_id: workspaceId,
      deleted_at: null,
      status: { not: 'cancelled' },
    },
    select: { id: true, title: true, start_at: true, attendees: true },
  })

  const linksToCreate: {
    workspace_id: string; event_id: string; record_type: string; record_id: string
  }[] = []

  for (const ev of events) {
    const attendees = ev.attendees as { email?: string }[] | null
    if (!Array.isArray(attendees)) continue

    const hasMatch = attendees.some(
      (att) => att.email && normalizedEmails.includes(att.email.toLowerCase()),
    )
    if (!hasMatch) continue

    linksToCreate.push({
      workspace_id: workspaceId,
      event_id: ev.id,
      record_type: 'contact',
      record_id: contactId,
    })
  }

  if (linksToCreate.length > 0) {
    await prisma.calendarEventLink.createMany({
      data: linksToCreate,
      skipDuplicates: true,
    })

    for (const link of linksToCreate) {
      const ev = events.find((e) => e.id === link.event_id)!
      await logActivity({
        prisma,
        workspaceId,
        actorId: userId,
        type: ACT_MEETING_CREATED,
        data: { eventId: ev.id, title: ev.title, startAt: ev.start_at.toISOString() },
        recordType: 'contact',
        recordId: contactId,
        contactId,
      })
    }
  }
}
