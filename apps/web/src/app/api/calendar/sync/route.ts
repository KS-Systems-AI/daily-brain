/**
 * Kalender-Sync-Endpunkt
 *
 * Vercel Cron: In vercel.json konfigurieren:
 * { "crons": [{ "path": "/api/calendar/sync", "schedule": "*\/15 * * * *" }] }
 *
 * Wird automatisch alle 15 Minuten aufgerufen (max. 1× täglich im Hobby-Plan).
 * Kann auch manuell über tRPC calendar.syncNow ausgelöst werden.
 */
import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { incrementalSync } from '@/server/lib/calendar/sync'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 Minuten Timeout

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Vercel Cron sendet Authorization-Header mit CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accounts = await prisma.calendarAccount.findMany({
    where: { deleted_at: null, is_active: true },
  })

  const results = await Promise.allSettled(
    accounts.map((acc) => incrementalSync(acc)),
  )

  const succeeded = results.filter((r) => r.status === 'fulfilled').length
  const failed = results.filter((r) => r.status === 'rejected').length

  return NextResponse.json({
    synced: succeeded,
    failed,
    total: accounts.length,
    at: new Date().toISOString(),
  })
}
