import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { processAttachment } from '@/server/lib/attachment-ocr'

export const maxDuration = 60 // seconds (Vercel Pro allows up to 300s)

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { attachmentId } = (await req.json()) as { attachmentId: string }
  if (!attachmentId) {
    return NextResponse.json({ error: 'Missing attachmentId' }, { status: 400 })
  }

  console.log(`[OCR] ▶ Start — attachmentId: ${attachmentId}`)

  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, deleted_at: null },
  })
  if (!attachment) {
    console.log(`[OCR] ✗ Attachment nicht gefunden`)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  console.log(`[OCR] Datei: "${attachment.filename}" | MIME: ${attachment.mime_type} | ${(attachment.size_bytes / 1024).toFixed(1)} KB`)
  console.log(`[OCR] Storage-Key: ${attachment.storage_key}`)

  try {
    const supabase = serviceClient()
    console.log(`[OCR] ⬇ Lade Datei aus Storage…`)
    const { data: fileData, error } = await supabase.storage
      .from('attachments')
      .download(attachment.storage_key)

    if (error || !fileData) throw new Error(error?.message ?? 'Download failed')
    console.log(`[OCR] ✓ Download OK`)

    const buffer = Buffer.from(await fileData.arrayBuffer())
    console.log(`[OCR] ⚙ Starte Verarbeitung (${buffer.length} Bytes)…`)

    const result = await processAttachment(buffer, attachment.mime_type, attachment.filename)

    console.log(`[OCR] ✓ Fertig — Methode: ${result.method} | Text: ${result.text.length} Zeichen | Summary: ${result.summary.slice(0, 80)}…`)

    await prisma.attachment.update({
      where: { id: attachment.id },
      data: {
        ocr_text: result.text || null,
        ai_summary: result.summary || null,
        ocr_status: 'done',
        ocr_method: result.method,
      },
    })

    console.log(`[OCR] ✓ DB gespeichert`)
    return NextResponse.json({ ok: true, method: result.method })
  } catch (err) {
    console.error(`[OCR] ✗ Fehler:`, err)
    await prisma.attachment.update({
      where: { id: attachment.id },
      data: { ocr_status: 'skipped', ocr_method: 'skipped' },
    })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
