import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const SCOPES = ['Calendars.ReadWrite', 'offline_access', 'User.Read', 'profile', 'email'].join(' ')

export function GET(): NextResponse {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: process.env.MICROSOFT_CALENDAR_REDIRECT_URI!,
    scope: SCOPES,
    response_mode: 'query',
    prompt: 'consent',
  })

  const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
  return NextResponse.redirect(url)
}
