import { createTRPCRouter } from '../trpc'
import { attachmentsRouter } from './attachments'
import { budgetRouter } from './budget'
import { calendarRouter } from './calendar'
import { companiesRouter } from './companies'
import { contactsRouter } from './contacts'
import { notesRouter } from './notes'
import { notificationsRouter } from './notifications'
import { tasksRouter } from './tasks'

export const appRouter = createTRPCRouter({
  attachments: attachmentsRouter,
  budget: budgetRouter,
  calendar: calendarRouter,
  contacts: contactsRouter,
  companies: companiesRouter,
  notes: notesRouter,
  notifications: notificationsRouter,
  tasks: tasksRouter,
})

export type AppRouter = typeof appRouter
