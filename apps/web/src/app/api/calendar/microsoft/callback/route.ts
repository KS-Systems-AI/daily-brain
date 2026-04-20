import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { fullSync } from '@/server/lib/calendar/sync'

export const runtime = 'nodejs'

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  scope: string
  token_type: string
}

interface MsGraphUser {
  mail: string | null
  userPrincipalName: string
  displayName: string | null
}

async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
    code,
    redirect_uri: process.env.MICROSOFT_CALENDAR_REDIRECT_URI!,
    grant_type: 'authorization_code',
  })

  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Microsoft token exchange fehlgeschlagen: ${body}`)
  }

  return res.json() as Promise<TokenResponse>
}

async function getMicrosoftUserInfo(accessToken: string): Promise<MsGraphUser> {
  const res = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Microsoft Graph /me fehlgeschlagen')
  return res.json() as Promise<MsGraphUser>
}

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

  const tokens = await exchangeCodeForTokens(code)
  const msUser = await getMicrosoftUserInfo(tokens.access_token)
  const email = msUser.mail ?? msUser.userPrincipalName
  const displayName = msUser.displayName ?? email
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)

  const member = await prisma.workspaceMember.findFirst({
    where: { user_id: user.id, deleted_at: null },
  })
  if (!member) {
    return NextResponse.redirect(new URL('/calendar/settings?error=no_workspace', request.url))
  }

  const account = await prisma.calendarAccount.upsert({
    where: {
      workspace_id_email_provider: {
        workspace_id: member.workspace_id,
        email,
        provider: 'microsoft',
      },
    },
    create: {
      workspace_id: member.workspace_id,
      user_id: user.id,
      provider: 'microsoft',
      email,
      display_name: displayName,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_scope: tokens.scope,
      expires_at: expiresAt,
      is_active: true,
      deleted_at: null,
    },
    update: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_scope: tokens.scope,
      expires_at: expiresAt,
      is_active: true,
      deleted_at: null,
      display_name: displayName,
    },
  })

  fullSync(account).catch(console.error)

  return NextResponse.redirect(new URL('/calendar/settings?connected=microsoft', request.url))
}
