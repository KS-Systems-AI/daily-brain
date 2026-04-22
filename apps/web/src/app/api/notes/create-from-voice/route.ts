import { type NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { formatVoiceTranscript } from '@/server/lib/voice-formatter'
import { tiptapJsonToBlocks, generateSortOrder } from '@/lib/block-converter'
import type { Prisma } from '@prisma/client'

export const maxDuration = 30

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = serviceClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as { transcript?: string }
  const transcript = body.transcript?.trim()
  if (!transcript || transcript.length < 1 || transcript.length > 10000) {
    return NextResponse.json({ error: 'Invalid transcript' }, { status: 400 })
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { user_id: user.id },
    select: { workspace_id: true },
  })
  if (!member) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 403 })
  }

  const { title, tiptapDoc, plainText } = await formatVoiceTranscript(transcript)

  const note = await prisma.note.create({
    data: {
      workspace_id: member.workspace_id,
      author_id: user.id,
      title,
      content: tiptapDoc as Prisma.InputJsonValue,
      content_text: plainText,
    },
  })

  const newBlocks = tiptapJsonToBlocks(tiptapDoc as unknown as Parameters<typeof tiptapJsonToBlocks>[0])

  if (newBlocks.length > 0) {
    await prisma.noteBlock.createMany({
      data: newBlocks.map((b) => ({
        id: b.id,
        note_id: note.id,
        block_type: b.block_type,
        plaintext: b.plaintext,
        styles: b.styles as unknown as Prisma.InputJsonValue,
        sort_order: b.sort_order,
        indent: b.indent,
        attrs: b.attrs as Prisma.InputJsonValue,
      })),
    })
  } else {
    await prisma.noteBlock.create({
      data: {
        note_id: note.id,
        block_type: 'unstyled',
        plaintext: '',
        styles: [],
        sort_order: generateSortOrder(0, 1),
        indent: 0,
        attrs: {},
      },
    })
  }

  return NextResponse.json({ id: note.id, title })
}
