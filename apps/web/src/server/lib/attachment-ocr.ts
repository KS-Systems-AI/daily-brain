import Anthropic from '@anthropic-ai/sdk'
// pdf-parse v1 — simple function API
async function pdfParse(buf: Buffer): Promise<{ text: string; numpages: number }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fn = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string; numpages: number }>
  return fn(buf)
}

const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY)
const anthropic = hasAnthropicKey ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }) : null

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const PDF_TYPE = 'application/pdf'

export type OcrResult = {
  text: string
  summary: string
  method: 'pdf-text' | 'claude-vision' | 'skipped'
}

/**
 * OCR pipeline:
 * 1. PDF with embedded text  → pdf-parse (free, instant)
 * 2. Scanned PDF / image     → Claude Vision (~$0.01 per page)
 * 3. Plain text              → summarise with Claude Haiku
 * 4. Unsupported type        → skipped
 */
export async function processAttachment(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<OcrResult> {
  if (mimeType === PDF_TYPE) {
    return processPdf(buffer, filename)
  }
  if (IMAGE_TYPES.has(mimeType)) {
    return claudeVision(buffer, mimeType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif', filename)
  }
  if (mimeType === 'text/plain') {
    const text = buffer.toString('utf-8').slice(0, 50_000)
    const summary = await summariseWithClaude(text, filename)
    return { text, summary, method: 'skipped' }
  }
  return { text: '', summary: '', method: 'skipped' }
}

async function processPdf(buffer: Buffer, filename: string): Promise<OcrResult> {
  try {
    const parsed = await pdfParse(buffer)
    const text = parsed.text.trim()
    console.log(`[OCR] pdf-parse: ${parsed.numpages} Seiten, ${text.length} Zeichen extrahiert`)
    if (text.length > 0) console.log(`[OCR] pdf-parse Vorschau: "${text.slice(0, 200).replace(/\n/g, '↵')}"`)

    if (text.length > 100) {
      // Embedded text found — no vision needed
      const truncated = text.slice(0, 50_000)
      const summary = await summariseWithClaude(truncated, filename).catch(() => '')
      return { text: truncated, summary, method: 'pdf-text' }
    }
    console.log(`[OCR] pdf-parse: Text zu kurz (${text.length} < 100) → falle auf Claude Vision zurück`)
  } catch (err) {
    console.log(`[OCR] pdf-parse Fehler: ${String(err)} → falle auf Claude Vision zurück`)
  }

  // Scanned PDF: send as document to Claude Vision
  if (!anthropic) return { text: '', summary: '', method: 'skipped' }
  const base64 = buffer.toString('base64')
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 },
          },
          {
            type: 'text',
            text: 'Extrahiere den gesamten Text aus diesem Dokument. Danach schreibe eine kurze Zusammenfassung (2-3 Sätze). Format:\nTEXT:\n<extrahierter Text>\n\nZUSAMMENFASSUNG:\n<Zusammenfassung>',
          },
        ],
      },
    ],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  const textMatch = raw.match(/TEXT:\n([\s\S]*?)(?:\n\nZUSAMMENFASSUNG:|$)/)
  const summaryMatch = raw.match(/ZUSAMMENFASSUNG:\n([\s\S]*)$/)

  return {
    text: textMatch?.[1]?.trim() ?? raw,
    summary: summaryMatch?.[1]?.trim() ?? '',
    method: 'claude-vision',
  }
}

async function claudeVision(
  buffer: Buffer,
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
  filename: string,
): Promise<OcrResult> {
  if (!anthropic) return { text: '', summary: '', method: 'skipped' }
  const base64 = buffer.toString('base64')

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          {
            type: 'text',
            text: 'Extrahiere den gesamten Text aus diesem Bild. Danach schreibe eine kurze Zusammenfassung (2-3 Sätze). Format:\nTEXT:\n<extrahierter Text>\n\nZUSAMMENFASSUNG:\n<Zusammenfassung>',
          },
        ],
      },
    ],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  const textMatch = raw.match(/TEXT:\n([\s\S]*?)(?:\n\nZUSAMMENFASSUNG:|$)/)
  const summaryMatch = raw.match(/ZUSAMMENFASSUNG:\n([\s\S]*)$/)

  return {
    text: textMatch?.[1]?.trim() ?? raw,
    summary: summaryMatch?.[1]?.trim() ?? '',
    method: 'claude-vision',
  }
}

async function summariseWithClaude(text: string, filename: string): Promise<string> {
  if (!anthropic) return ''
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: `Schreibe eine kurze Zusammenfassung (2-3 Sätze) dieses Dokuments "${filename}":\n\n${text.slice(0, 8000)}`,
      },
    ],
  })
  return response.content[0].type === 'text' ? response.content[0].text.trim() : ''
}
