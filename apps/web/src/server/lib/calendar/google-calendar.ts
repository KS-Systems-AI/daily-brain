import { google, type Auth } from 'googleapis'
import type { CalendarAccount } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { mapGoogleEvent, type NormalizedEvent } from './event-mapper'

export type RecurringMode = 'THIS' | 'THIS_AND_FOLLOWING' | 'ALL'

function buildOAuth2Client(account: CalendarAccount): Auth.OAuth2Client {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_CALENDAR_REDIRECT_URI!,
  )
  oauth2.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
  })
  return oauth2
}

export async function refreshTokenIfNeeded(account: CalendarAccount): Promise<CalendarAccount> {
  if (!account.expires_at || account.expires_at.getTime() > Date.now() + 60_000) {
    return account
  }
  const oauth2 = buildOAuth2Client(account)
  const { credentials } = await oauth2.refreshAccessToken()
  const updated = await prisma.calendarAccount.update({
    where: { id: account.id },
    data: {
      access_token: credentials.access_token!,
      expires_at: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
    },
  })
  return updated
}

export async function listGoogleEvents(
  account: CalendarAccount,
  timeMin: Date,
  timeMax: Date,
): Promise<NormalizedEvent[]> {
  const fresh = await refreshTokenIfNeeded(account)
  const oauth2 = buildOAuth2Client(fresh)
  const cal = google.calendar({ version: 'v3', auth: oauth2 })

  const res = await cal.events.list({
    calendarId: fresh.calendar_id ?? 'primary',
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 2500,
  })

  return (res.data.items ?? []).map(mapGoogleEvent)
}

export async function createGoogleEvent(
  account: CalendarAccount,
  event: {
    title: string
    description?: string | null
    location?: string | null
    start_at: Date
    end_at: Date
    is_all_day: boolean
    attendees?: Array<{ email: string }>
  },
): Promise<string> {
  const fresh = await refreshTokenIfNeeded(account)
  const oauth2 = buildOAuth2Client(fresh)
  const cal = google.calendar({ version: 'v3', auth: oauth2 })

  const body: import('googleapis').calendar_v3.Schema$Event = {
    summary: event.title,
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    attendees: event.attendees?.map((a) => ({ email: a.email })),
  }

  if (event.is_all_day) {
    const fmt = (d: Date): string => d.toISOString().slice(0, 10)
    body.start = { date: fmt(event.start_at) }
    body.end = { date: fmt(event.end_at) }
  } else {
    body.start = { dateTime: event.start_at.toISOString(), timeZone: 'UTC' }
    body.end = { dateTime: event.end_at.toISOString(), timeZone: 'UTC' }
  }

  const res = await cal.events.insert({
    calendarId: fresh.calendar_id ?? 'primary',
    requestBody: body,
  })

  return res.data.id!
}

function logGoogleError(context: string, err: unknown): void {
  const e = err as Record<string, unknown>
  const cause = e?.['cause'] as Record<string, unknown> | undefined
  const errors = cause?.['errors'] as unknown[] | undefined
  console.error(`[Google Calendar] ${context}:`, JSON.stringify({ status: e?.['status'], errors }, null, 2))
}

export async function updateGoogleEvent(
  account: CalendarAccount,
  externalId: string,
  patch: {
    title?: string
    description?: string | null
    location?: string | null
    start_at?: Date
    end_at?: Date
    is_all_day?: boolean
    attendees?: Array<{ email: string }>
  },
  recurringMode: RecurringMode,
  masterExternalId?: string,  // direkt aus DB — vermeidet fehlerhafte inst.recurringEventId-Lookups
): Promise<void> {
  const fresh = await refreshTokenIfNeeded(account)
  const oauth2 = buildOAuth2Client(fresh)
  const cal = google.calendar({ version: 'v3', auth: oauth2 })

  if (recurringMode === 'ALL') {
    // Instanz laden um Delta zu berechnen
    const inst = await cal.events.get({
      calendarId: fresh.calendar_id ?? 'primary',
      eventId: externalId,
    })
    // Master-ID: aus DB (zuverlässig) oder Fallback auf API-Feld
    const masterId = masterExternalId ?? inst.data.recurringEventId ?? externalId
    const master = await cal.events.get({
      calendarId: fresh.calendar_id ?? 'primary',
      eventId: masterId,
    })

    const masterTz = master.data.start?.timeZone ?? 'UTC'
    const body = buildGooglePatchBody(patch, masterTz)

    // Delta aus Drag auf Master-Startzeit anwenden (Datum des Masters bleibt erhalten)
    if (patch.start_at !== undefined && inst.data.start?.dateTime && master.data.start?.dateTime) {
      const instStart = new Date(inst.data.start.dateTime)
      const deltaMs = patch.start_at.getTime() - instStart.getTime()
      const masterStart = new Date(new Date(master.data.start.dateTime).getTime() + deltaMs)
      body['start'] = { dateTime: masterStart.toISOString(), timeZone: masterTz }
    }
    if (patch.end_at !== undefined && inst.data.end?.dateTime && master.data.end?.dateTime) {
      const masterEndTz = master.data.end?.timeZone ?? masterTz
      const instEnd = new Date(inst.data.end.dateTime)
      const deltaMs = patch.end_at.getTime() - instEnd.getTime()
      const masterEnd = new Date(new Date(master.data.end.dateTime).getTime() + deltaMs)
      body['end'] = { dateTime: masterEnd.toISOString(), timeZone: masterEndTz }
    }

    await cal.events.patch({
      calendarId: fresh.calendar_id ?? 'primary',
      eventId: masterId,
      requestBody: body,
    })
    return
  }

  if (recurringMode === 'THIS_AND_FOLLOWING') {
    const inst = await cal.events.get({
      calendarId: fresh.calendar_id ?? 'primary',
      eventId: externalId,
    })
    const instTz = inst.data.start?.timeZone ?? 'UTC'
    const masterId = inst.data.recurringEventId ?? externalId
    const origStart = inst.data.originalStartTime?.dateTime ?? inst.data.start?.dateTime
    if (masterId !== externalId && origStart) {
      const untilDate = new Date(new Date(origStart).getTime() - 1000)
        .toISOString()
        .replace(/[-:]/g, '')
        .slice(0, 15) + 'Z'
      const master = await cal.events.get({
        calendarId: fresh.calendar_id ?? 'primary',
        eventId: masterId,
      })
      const existingRrule = master.data.recurrence?.find((r) => r.startsWith('RRULE:')) ?? ''
      const updatedRrule = existingRrule.replace(/;UNTIL=[^;]+/, '').replace(/;COUNT=[^;]+/, '')
        + `;UNTIL=${untilDate}`
      await cal.events.patch({
        calendarId: fresh.calendar_id ?? 'primary',
        eventId: masterId,
        requestBody: { recurrence: [updatedRrule] },
      })
    }
    const newBody = buildGooglePatchBody(patch, instTz)
    if (inst.data.recurrence) newBody.recurrence = inst.data.recurrence
    newBody.start = patch.start_at
      ? { dateTime: patch.start_at.toISOString(), timeZone: instTz }
      : inst.data.start ?? undefined
    newBody.end = patch.end_at
      ? { dateTime: patch.end_at.toISOString(), timeZone: instTz }
      : inst.data.end ?? undefined
    await cal.events.insert({
      calendarId: fresh.calendar_id ?? 'primary',
      requestBody: newBody,
    })
    return
  }

  // THIS — Timezone der Instanz lesen und beibehalten
  const instForThis = await cal.events.get({
    calendarId: fresh.calendar_id ?? 'primary',
    eventId: externalId,
  })
  const thisTz = instForThis.data.start?.timeZone ?? 'UTC'
  await cal.events.patch({
    calendarId: fresh.calendar_id ?? 'primary',
    eventId: externalId,
    requestBody: buildGooglePatchBody(patch, thisTz),
  })
}

export async function deleteGoogleEvent(
  account: CalendarAccount,
  externalId: string,
  recurringMode: RecurringMode,
): Promise<void> {
  const fresh = await refreshTokenIfNeeded(account)
  const oauth2 = buildOAuth2Client(fresh)
  const cal = google.calendar({ version: 'v3', auth: oauth2 })

  if (recurringMode === 'ALL') {
    const inst = await cal.events.get({
      calendarId: fresh.calendar_id ?? 'primary',
      eventId: externalId,
    })
    const masterId = inst.data.recurringEventId ?? externalId
    await cal.events.delete({ calendarId: fresh.calendar_id ?? 'primary', eventId: masterId })
    return
  }

  if (recurringMode === 'THIS_AND_FOLLOWING') {
    const inst = await cal.events.get({
      calendarId: fresh.calendar_id ?? 'primary',
      eventId: externalId,
    })
    const masterId = inst.data.recurringEventId ?? externalId
    const origStart = inst.data.originalStartTime?.dateTime
    if (masterId !== externalId && origStart) {
      const untilDate = new Date(new Date(origStart).getTime() - 1000)
        .toISOString()
        .replace(/[-:]/g, '')
        .slice(0, 15) + 'Z'
      const master = await cal.events.get({
        calendarId: fresh.calendar_id ?? 'primary',
        eventId: masterId,
      })
      const existingRrule = master.data.recurrence?.find((r) => r.startsWith('RRULE:')) ?? ''
      const updatedRrule = existingRrule.replace(/;UNTIL=[^;]+/, '').replace(/;COUNT=[^;]+/, '')
        + `;UNTIL=${untilDate}`
      await cal.events.patch({
        calendarId: fresh.calendar_id ?? 'primary',
        eventId: masterId,
        requestBody: { recurrence: [updatedRrule] },
      })
    }
    return
  }

  // THIS
  await cal.events.delete({ calendarId: fresh.calendar_id ?? 'primary', eventId: externalId })
}

export async function getGoogleSyncToken(account: CalendarAccount): Promise<string | null> {
  const fresh = await refreshTokenIfNeeded(account)
  const oauth2 = buildOAuth2Client(fresh)
  const cal = google.calendar({ version: 'v3', auth: oauth2 })

  const res = await cal.events.list({
    calendarId: fresh.calendar_id ?? 'primary',
    maxResults: 1,
  })
  return res.data.nextSyncToken ?? null
}

export async function listGoogleEventsDelta(
  account: CalendarAccount,
  syncToken: string,
): Promise<{ events: NormalizedEvent[]; nextSyncToken: string | null }> {
  const fresh = await refreshTokenIfNeeded(account)
  const oauth2 = buildOAuth2Client(fresh)
  const cal = google.calendar({ version: 'v3', auth: oauth2 })

  try {
    const res = await cal.events.list({
      calendarId: fresh.calendar_id ?? 'primary',
      syncToken,
      singleEvents: true,
      maxResults: 2500,
    })
    return {
      events: (res.data.items ?? []).map(mapGoogleEvent),
      nextSyncToken: res.data.nextSyncToken ?? null,
    }
  } catch {
    // syncToken abgelaufen → Vollsync erforderlich
    return { events: [], nextSyncToken: null }
  }
}

function buildGooglePatchBody(
  patch: {
    title?: string
    description?: string | null
    location?: string | null
    start_at?: Date
    end_at?: Date
    is_all_day?: boolean
    attendees?: Array<{ email: string }>
  },
  tz = 'UTC',
): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (patch.title !== undefined) body['summary'] = patch.title
  if (patch.description !== undefined) body['description'] = patch.description
  if (patch.location !== undefined) body['location'] = patch.location
  if (patch.attendees !== undefined) body['attendees'] = patch.attendees.map((a) => ({ email: a.email }))
  if (patch.start_at !== undefined) {
    body['start'] = patch.is_all_day
      ? { date: patch.start_at.toISOString().slice(0, 10) }
      : { dateTime: patch.start_at.toISOString(), timeZone: tz }
  }
  if (patch.end_at !== undefined) {
    body['end'] = patch.is_all_day
      ? { date: patch.end_at.toISOString().slice(0, 10) }
      : { dateTime: patch.end_at.toISOString(), timeZone: tz }
  }
  return body
}
