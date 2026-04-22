import { ConfidentialClientApplication } from '@azure/msal-node'
import { Client } from '@microsoft/microsoft-graph-client'
import type { Event as GraphEvent } from '@microsoft/microsoft-graph-types'
import type { CalendarAccount } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { mapMicrosoftEvent, type NormalizedEvent } from './event-mapper'
import type { RecurringMode } from './google-calendar'

function getMsalApp(): ConfidentialClientApplication {
  return new ConfidentialClientApplication({
    auth: {
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      authority: 'https://login.microsoftonline.com/common',
    },
  })
}

async function refreshMicrosoftToken(account: CalendarAccount): Promise<CalendarAccount> {
  if (!account.expires_at || account.expires_at.getTime() > Date.now() + 60_000) {
    return account
  }
  const app = getMsalApp()
  const result = await app.acquireTokenByRefreshToken({
    refreshToken: account.refresh_token,
    scopes: ['Calendars.ReadWrite', 'offline_access', 'User.Read'],
  })
  if (!result) throw new Error('Microsoft token refresh fehlgeschlagen')
  const updated = await prisma.calendarAccount.update({
    where: { id: account.id },
    data: {
      access_token: result.accessToken,
      expires_at: result.expiresOn ?? null,
    },
  })
  return updated
}

function buildGraphClient(account: CalendarAccount): Client {
  return Client.init({
    authProvider: (done) => done(null, account.access_token),
  })
}

export async function listMicrosoftEvents(
  account: CalendarAccount,
  timeMin: Date,
  timeMax: Date,
): Promise<NormalizedEvent[]> {
  const fresh = await refreshMicrosoftToken(account)
  const client = buildGraphClient(fresh)

  const events: GraphEvent[] = []
  let url = `/me/calendarView?startDateTime=${timeMin.toISOString()}&endDateTime=${timeMax.toISOString()}&$top=100&$select=id,subject,body,start,end,isAllDay,attendees,organizer,location,recurrence,isCancelled,showAs,seriesMasterId,type`

  while (url) {
    const res = await client.api(url).get() as { value: GraphEvent[]; '@odata.nextLink'?: string }
    events.push(...(res.value ?? []))
    url = res['@odata.nextLink'] ?? ''
  }

  return events.map(mapMicrosoftEvent)
}

export async function createMicrosoftEvent(
  account: CalendarAccount,
  event: {
    title: string
    description?: string | null
    location?: string | null
    start_at: Date
    end_at: Date
    is_all_day: boolean
    attendees?: Array<{ email: string; name?: string }>
  },
): Promise<string> {
  const fresh = await refreshMicrosoftToken(account)
  const client = buildGraphClient(fresh)

  const body: Partial<GraphEvent> = {
    subject: event.title,
    body: event.description ? { contentType: 'text', content: event.description } : undefined,
    location: event.location ? { displayName: event.location } : undefined,
    isAllDay: event.is_all_day,
    start: { dateTime: event.start_at.toISOString().replace('Z', ''), timeZone: 'UTC' },
    end: { dateTime: event.end_at.toISOString().replace('Z', ''), timeZone: 'UTC' },
    attendees: event.attendees?.map((a) => ({
      emailAddress: { address: a.email, name: a.name ?? a.email },
      type: 'required' as const,
    })),
  }

  const res = await client.api('/me/events').post(body) as GraphEvent
  return res.id!
}

export async function updateMicrosoftEvent(
  account: CalendarAccount,
  externalId: string,
  patch: {
    title?: string
    description?: string | null
    location?: string | null
    start_at?: Date
    end_at?: Date
    is_all_day?: boolean
    attendees?: Array<{ email: string; name?: string }>
  },
  recurringMode: RecurringMode,
): Promise<void> {
  const fresh = await refreshMicrosoftToken(account)
  const client = buildGraphClient(fresh)

  if (recurringMode === 'ALL') {
    const inst = await client.api(`/me/events/${externalId}`).get() as GraphEvent
    const masterId = inst.seriesMasterId ?? externalId
    await client.api(`/me/events/${masterId}`).patch(buildMicrosoftPatchBody(patch))
    return
  }

  if (recurringMode === 'THIS_AND_FOLLOWING') {
    const inst = await client.api(`/me/events/${externalId}`).get() as GraphEvent
    const masterId = inst.seriesMasterId ?? externalId

    if (masterId !== externalId) {
      // Master-Serie beenden: endDate auf den Tag vor dieser Instanz setzen
      const master = await client.api(`/me/events/${masterId}`).get() as GraphEvent
      const startDt = inst.start?.dateTime ?? ''
      const endDate = new Date(new Date(startDt).getTime() - 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
      await client.api(`/me/events/${masterId}`).patch({
        recurrence: {
          ...master.recurrence,
          range: {
            ...master.recurrence?.range,
            type: 'endDate',
            endDate,
          },
        },
      })
    }

    // Neue Serie ab dieser Instanz
    const newBody = buildMicrosoftPatchBody(patch)
    const origInst = await client.api(`/me/events/${externalId}`).get() as GraphEvent
    newBody['start'] = patch.start_at
      ? { dateTime: patch.start_at.toISOString().replace('Z', ''), timeZone: 'UTC' }
      : origInst.start
    newBody['end'] = patch.end_at
      ? { dateTime: patch.end_at.toISOString().replace('Z', ''), timeZone: 'UTC' }
      : origInst.end
    if (origInst.recurrence) newBody['recurrence'] = origInst.recurrence
    await client.api('/me/events').post(newBody)
    return
  }

  // THIS — erzeugt eine Exception in der Serie
  await client.api(`/me/events/${externalId}`).patch(buildMicrosoftPatchBody(patch))
}

export async function deleteMicrosoftEvent(
  account: CalendarAccount,
  externalId: string,
  recurringMode: RecurringMode,
): Promise<void> {
  const fresh = await refreshMicrosoftToken(account)
  const client = buildGraphClient(fresh)

  if (recurringMode === 'ALL') {
    const inst = await client.api(`/me/events/${externalId}`).get() as GraphEvent
    const masterId = inst.seriesMasterId ?? externalId
    await client.api(`/me/events/${masterId}`).delete()
    return
  }

  if (recurringMode === 'THIS_AND_FOLLOWING') {
    const inst = await client.api(`/me/events/${externalId}`).get() as GraphEvent
    const masterId = inst.seriesMasterId ?? externalId

    if (masterId !== externalId) {
      const master = await client.api(`/me/events/${masterId}`).get() as GraphEvent
      const startDt = inst.start?.dateTime ?? ''
      const endDate = new Date(new Date(startDt).getTime() - 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
      await client.api(`/me/events/${masterId}`).patch({
        recurrence: {
          ...master.recurrence,
          range: { ...master.recurrence?.range, type: 'endDate', endDate },
        },
      })
      return
    }
    await client.api(`/me/events/${externalId}`).delete()
    return
  }

  // THIS
  await client.api(`/me/events/${externalId}`).delete()
}

export async function getMicrosoftDeltaLink(account: CalendarAccount): Promise<string | null> {
  const fresh = await refreshMicrosoftToken(account)
  const client = buildGraphClient(fresh)
  try {
    const res = await client.api('/me/calendarView/delta?$top=1').get() as { '@odata.deltaLink'?: string }
    return res['@odata.deltaLink'] ?? null
  } catch {
    return null
  }
}

export async function listMicrosoftEventsDelta(
  account: CalendarAccount,
  deltaLink: string,
): Promise<{ events: NormalizedEvent[]; nextDeltaLink: string | null }> {
  const fresh = await refreshMicrosoftToken(account)
  const client = buildGraphClient(fresh)

  try {
    const events: GraphEvent[] = []
    let url = deltaLink
    let nextDeltaLink: string | null = null

    while (url) {
      const res = await client.api(url).header('Prefer', 'deltashowremoved').get() as {
        value: GraphEvent[]
        '@odata.nextLink'?: string
        '@odata.deltaLink'?: string
      }
      events.push(...(res.value ?? []))
      if (res['@odata.deltaLink']) {
        nextDeltaLink = res['@odata.deltaLink']
        break
      }
      url = res['@odata.nextLink'] ?? ''
    }

    return { events: events.map(mapMicrosoftEvent), nextDeltaLink }
  } catch {
    return { events: [], nextDeltaLink: null }
  }
}

function buildMicrosoftPatchBody(patch: {
  title?: string
  description?: string | null
  location?: string | null
  start_at?: Date
  end_at?: Date
  is_all_day?: boolean
  attendees?: Array<{ email: string; name?: string }>
}): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (patch.title !== undefined) body['subject'] = patch.title
  if (patch.description !== undefined) body['body'] = { contentType: 'text', content: patch.description ?? '' }
  if (patch.location !== undefined) body['location'] = { displayName: patch.location ?? '' }
  if (patch.is_all_day !== undefined) body['isAllDay'] = patch.is_all_day
  if (patch.start_at !== undefined) {
    body['start'] = { dateTime: patch.start_at.toISOString().replace('Z', ''), timeZone: 'UTC' }
  }
  if (patch.end_at !== undefined) {
    body['end'] = { dateTime: patch.end_at.toISOString().replace('Z', ''), timeZone: 'UTC' }
  }
  if (patch.attendees !== undefined) {
    body['attendees'] = patch.attendees.map((a) => ({
      emailAddress: { address: a.email, name: a.name ?? a.email },
      type: 'required',
    }))
  }
  return body
}
