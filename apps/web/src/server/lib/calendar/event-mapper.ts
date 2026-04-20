import type { calendar_v3 } from 'googleapis'
import type { Event as GraphEvent } from '@microsoft/microsoft-graph-types'

export type NormalizedAttendee = {
  email: string
  name: string | null
  responseStatus: 'accepted' | 'declined' | 'tentative' | 'needsAction' | 'none'
}

export type NormalizedEvent = {
  external_id: string
  title: string
  description: string | null
  location: string | null
  start_at: Date
  end_at: Date
  is_all_day: boolean
  attendees: NormalizedAttendee[]
  organizer_email: string | null
  status: 'confirmed' | 'tentative' | 'cancelled'
  recurrence_rule: string | null
  recurring_event_id: string | null  // externe Master-ID (Google recurringEventId)
  original_start_at: Date | null
}

export function mapGoogleEvent(event: calendar_v3.Schema$Event): NormalizedEvent {
  const isAllDay = Boolean(event.start?.date && !event.start?.dateTime)

  const startAt = isAllDay
    ? new Date(event.start!.date! + 'T00:00:00Z')
    : new Date(event.start!.dateTime!)

  const endAt = isAllDay
    ? new Date(event.end!.date! + 'T00:00:00Z')
    : new Date(event.end!.dateTime!)

  const attendees: NormalizedAttendee[] = (event.attendees ?? []).map((a) => ({
    email: a.email ?? '',
    name: a.displayName ?? null,
    responseStatus: (a.responseStatus as NormalizedAttendee['responseStatus']) ?? 'needsAction',
  }))

  const recurrenceRule = event.recurrence
    ? event.recurrence.find((r) => r.startsWith('RRULE:')) ?? null
    : null

  const originalStartAt = event.originalStartTime?.dateTime
    ? new Date(event.originalStartTime.dateTime)
    : event.originalStartTime?.date
      ? new Date(event.originalStartTime.date + 'T00:00:00Z')
      : null

  let status: NormalizedEvent['status'] = 'confirmed'
  if (event.status === 'tentative') status = 'tentative'
  if (event.status === 'cancelled') status = 'cancelled'

  return {
    external_id: event.id!,
    title: event.summary ?? '(Kein Titel)',
    description: event.description ?? null,
    location: event.location ?? null,
    start_at: startAt,
    end_at: endAt,
    is_all_day: isAllDay,
    attendees,
    organizer_email: event.organizer?.email ?? null,
    status,
    recurrence_rule: recurrenceRule,
    recurring_event_id: event.recurringEventId ?? null,
    original_start_at: originalStartAt,
  }
}

export function mapMicrosoftEvent(event: GraphEvent): NormalizedEvent {
  const isAllDay = event.isAllDay ?? false

  const startAt = isAllDay
    ? new Date(event.start!.dateTime! + 'Z')
    : new Date(event.start!.dateTime! + (event.start!.timeZone === 'UTC' ? '' : 'Z'))

  const endAt = isAllDay
    ? new Date(event.end!.dateTime! + 'Z')
    : new Date(event.end!.dateTime! + (event.end!.timeZone === 'UTC' ? '' : 'Z'))

  const attendees: NormalizedAttendee[] = (event.attendees ?? []).map((a) => {
    let rs: NormalizedAttendee['responseStatus'] = 'needsAction'
    const status = a.status?.response
    if (status === 'accepted') rs = 'accepted'
    else if (status === 'declined') rs = 'declined'
    else if (status === 'tentativelyAccepted') rs = 'tentative'
    return {
      email: a.emailAddress?.address ?? '',
      name: a.emailAddress?.name ?? null,
      responseStatus: rs,
    }
  })

  // Microsoft Graph recurrence → RRULE string
  let recurrenceRule: string | null = null
  if (event.recurrence?.pattern) {
    recurrenceRule = buildRRuleFromMicrosoft(event.recurrence)
  }

  let status: NormalizedEvent['status'] = 'confirmed'
  if (event.showAs === 'tentative') status = 'tentative'
  if (event.isCancelled) status = 'cancelled'

  return {
    external_id: event.id!,
    title: event.subject ?? '(Kein Titel)',
    description: event.body?.content ?? null,
    location: event.location?.displayName ?? null,
    start_at: startAt,
    end_at: endAt,
    is_all_day: isAllDay,
    attendees,
    organizer_email: event.organizer?.emailAddress?.address ?? null,
    status,
    recurrence_rule: recurrenceRule,
    recurring_event_id: event.seriesMasterId ?? null,
    original_start_at: null,
  }
}

function buildRRuleFromMicrosoft(recurrence: NonNullable<GraphEvent['recurrence']>): string {
  const p = recurrence.pattern!
  const r = recurrence.range!

  const parts: string[] = []

  const freqMap: Record<string, string> = {
    daily: 'DAILY',
    weekly: 'WEEKLY',
    absoluteMonthly: 'MONTHLY',
    relativeMonthly: 'MONTHLY',
    absoluteYearly: 'YEARLY',
    relativeYearly: 'YEARLY',
  }
  const freq = freqMap[p.type ?? ''] ?? 'DAILY'
  parts.push(`FREQ=${freq}`)

  if (p.interval && p.interval > 1) parts.push(`INTERVAL=${p.interval}`)

  if (p.daysOfWeek && p.daysOfWeek.length > 0) {
    const dayMap: Record<string, string> = {
      sunday: 'SU', monday: 'MO', tuesday: 'TU', wednesday: 'WE',
      thursday: 'TH', friday: 'FR', saturday: 'SA',
    }
    const days = p.daysOfWeek.map((d) => dayMap[d] ?? d.toUpperCase().slice(0, 2)).join(',')
    parts.push(`BYDAY=${days}`)
  }

  if (r.type === 'endDate' && r.endDate) {
    parts.push(`UNTIL=${r.endDate.replace(/-/g, '')}T000000Z`)
  } else if (r.type === 'numbered' && r.numberOfOccurrences) {
    parts.push(`COUNT=${r.numberOfOccurrences}`)
  }

  return `RRULE:${parts.join(';')}`
}
