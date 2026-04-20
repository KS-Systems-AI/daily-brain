import type { PrismaClient, Prisma } from '@prisma/client'

// ─── Activity types ────────────────────────────────────────────────────────────
// contact.*
export const ACT_CONTACT_CREATED = 'contact.created'
export const ACT_CONTACT_FIELD_UPDATED = 'contact.field_updated'

// task.*
export const ACT_TASK_CREATED = 'task.created'
export const ACT_TASK_UPDATED = 'task.updated'
export const ACT_TASK_COMPLETED = 'task.completed'
export const ACT_TASK_ASSIGNED = 'task.assigned'

// note.*
export const ACT_NOTE_CREATED = 'note.created'
export const ACT_NOTE_UPDATED = 'note.updated'

// email.*  (placeholder for later)
export const ACT_EMAIL_RECEIVED = 'email.received'
export const ACT_EMAIL_SENT = 'email.sent'

// meeting.*
export const ACT_MEETING_CREATED = 'meeting.created'
export const ACT_MEETING_UPDATED = 'meeting.updated'

// ─── Data shapes ───────────────────────────────────────────────────────────────
export type ActivityData =
  | { type: typeof ACT_CONTACT_FIELD_UPDATED; field: string; label: string; oldValue: string; newValue: string }
  | { type: typeof ACT_TASK_CREATED; taskId: string; title: string; dueAt?: string }
  | { type: typeof ACT_TASK_UPDATED; taskId: string; title: string }
  | { type: typeof ACT_TASK_COMPLETED; taskId: string; title: string }
  | { type: typeof ACT_TASK_ASSIGNED; taskId: string; title: string; assigneeName: string }
  | { type: typeof ACT_NOTE_CREATED; noteId: string; noteTitle?: string }
  | { type: typeof ACT_NOTE_UPDATED; noteId: string; noteTitle?: string }
  | { type: typeof ACT_CONTACT_CREATED }
  | { type: typeof ACT_MEETING_CREATED; eventId: string; title: string; startAt: string }
  | { type: typeof ACT_MEETING_UPDATED; eventId: string; title: string; startAt: string }

interface LogActivityInput {
  prisma: PrismaClient
  workspaceId: string
  actorId: string
  type: string
  data: Prisma.InputJsonValue
  /** The primary record this activity belongs to */
  recordType: 'contact' | 'company' | 'deal'
  recordId: string
  /** Optional denormalised FKs for fast lookups */
  contactId?: string | null
  companyId?: string | null
  dealId?: string | null
}

export async function logActivity(input: LogActivityInput): Promise<void> {
  await input.prisma.activity.create({
    data: {
      workspace_id: input.workspaceId,
      actor_id: input.actorId,
      type: input.type,
      data: input.data as Prisma.InputJsonValue,
      record_type: input.recordType,
      record_id: input.recordId,
      contact_id: input.contactId ?? null,
      company_id: input.companyId ?? null,
      deal_id: input.dealId ?? null,
    },
  })
}

// Human-readable labels for contact fields
export const FIELD_LABELS: Record<string, string> = {
  first_name: 'Vorname',
  last_name: 'Nachname',
  email: 'E-Mail',
  phone: 'Telefon',
  company_id: 'Unternehmen',
  attrs: 'Attribute',
  'attrs.description': 'Beschreibung',
  'attrs.job_title': 'Jobtitel',
  'attrs.website': 'Website',
  'attrs.linkedin': 'LinkedIn',
  'attrs.twitter': 'Twitter',
}
