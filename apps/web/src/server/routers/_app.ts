import { createTRPCRouter } from '../trpc'
import { companiesRouter } from './companies'
import { contactsRouter } from './contacts'
import { notesRouter } from './notes'
import { notificationsRouter } from './notifications'
import { tasksRouter } from './tasks'

export const appRouter = createTRPCRouter({
  contacts: contactsRouter,
  companies: companiesRouter,
  notes: notesRouter,
  notifications: notificationsRouter,
  tasks: tasksRouter,
})

export type AppRouter = typeof appRouter
