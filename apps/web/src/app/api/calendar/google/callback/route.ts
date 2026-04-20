import { type NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { fullSync } from '@/server/lib/calendar/sync'

export const runtime = 'nodejs'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL('/calendar/settings?error=access_denied', request.url))
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_CALENDAR_REDIRECT_URI!,
  )

  const { tokens } = await oauth2.getToken(code)
  oauth2.setCredentials(tokens)

  // E-Mail-Adresse des Google-Kontos abrufen
  const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2 })
  const userInfo = await oauth2Api.userinfo.get()
  const email = userInfo.data.email!
  const displayName = userInfo.data.name ?? email

  // Workspace-Mitgliedschaft des Users ermitteln
  const member = await prisma.workspaceMember.findFirst({
    where: { user_id: user.id, deleted_at: null },
  })
  if (!member) {
    return NextResponse.redirect(new URL('/calendar/settings?error=no_workspace', request.url))
  }

  // CalendarAccount anlegen oder aktualisieren
  const account = await prisma.calendarAccount.upsert({
    where: {
      workspace_id_email_provider: {
        workspace_id: member.workspace_id,
        email,
        provider: 'google',
      },
    },
    create: {
      workspace_id: member.workspace_id,
      user_id: user.id,
      provider: 'google',
      email,
      display_name: displayName,
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token!,
      token_scope: tokens.scope ?? null,
      expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      is_active: true,
      deleted_at: null,
    },
    update: {
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token ?? undefined,
      token_scope: tokens.scope ?? null,
      expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      is_active: true,
      deleted_at: null,
      display_name: displayName,
    },
  })

  // Vollsync im Hintergrund starten (fire-and-forget)
  fullSync(account).catch(console.error)

  return NextResponse.redirect(new URL('/calendar/settings?connected=google', request.url))
}
