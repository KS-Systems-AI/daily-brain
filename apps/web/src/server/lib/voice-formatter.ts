import Anthropic from '@anthropic-ai/sdk'

const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY)
const anthropic = hasAnthropicKey ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }) : null

type TiptapTextNode = { type: 'text'; text: string }
type TiptapNode = {
  type: string
  content?: TiptapNode[]
  attrs?: Record<string, unknown>
} | TiptapTextNode

export type VoiceFormatResult = {
  title: string
  tiptapDoc: Record<string, unknown>
  plainText: string
}

function textNode(text: string): TiptapTextNode {
  return { type: 'text', text }
}

function paragraphNode(text: string): TiptapNode {
  return { type: 'paragraph', content: [textNode(text)] }
}

function markdownToTiptap(markdown: string): Record<string, unknown> {
  const lines = markdown.split('\n')
  const content: TiptapNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i].trim()

    if (!line) {
      i++
      continue
    }

    if (line.startsWith('# ')) {
      content.push({ type: 'heading', attrs: { level: 1 }, content: [textNode(line.slice(2).trim())] })
      i++
      continue
    }

    if (line.startsWith('## ')) {
      content.push({ type: 'heading', attrs: { level: 2 }, content: [textNode(line.slice(3).trim())] })
      i++
      continue
    }

    if (line.startsWith('### ')) {
      content.push({ type: 'heading', attrs: { level: 3 }, content: [textNode(line.slice(4).trim())] })
      i++
      continue
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      const items: TiptapNode[] = []
      while (i < lines.length) {
        const l = lines[i].trim()
        if (!l.startsWith('- ') && !l.startsWith('* ')) break
        items.push({ type: 'listItem', content: [paragraphNode(l.slice(2).trim())] })
        i++
      }
      content.push({ type: 'bulletList', content: items })
      continue
    }

    if (/^\d+\.\s/.test(line)) {
      const items: TiptapNode[] = []
      while (i < lines.length) {
        const l = lines[i].trim()
        if (!/^\d+\.\s/.test(l)) break
        items.push({ type: 'listItem', content: [paragraphNode(l.replace(/^\d+\.\s/, '').trim())] })
        i++
      }
      content.push({ type: 'orderedList', attrs: { start: 1 }, content: items })
      continue
    }

    content.push(paragraphNode(line))
    i++
  }

  if (content.length === 0) {
    content.push({ type: 'paragraph', content: [] })
  }

  return { type: 'doc', content }
}

// Kostenlose, regelbasierte Formatierung — kein API-Key nötig
function formatFree(transcript: string): VoiceFormatResult {
  const text = transcript.trim()

  // Titel: erste Zeile / erster Satz, max 60 Zeichen
  const firstSentence = text.split(/[.!?]/)[0]?.trim() ?? text
  const title = firstSentence.length > 60 ? firstSentence.slice(0, 57) + '…' : firstSentence

  // Sätze mit Großschreibung beginnen, Satzzeichen am Ende sicherstellen
  let cleaned = text
    .replace(/\bi\b/g, 'ich')
    .replace(/(?<=[.!?]\s+)([a-zäöü])/g, (c) => c.toUpperCase())
  if (cleaned && !cleaned.match(/[.!?]$/)) cleaned += '.'
  // Erster Buchstabe groß
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1)

  // Aufzählungs-Muster erkennen und als Liste formatieren
  const listPatterns = [
    /\b(erstens|als erstes|zum ersten)[,:]?\s*/gi,
    /\b(zweitens|als zweites|zum zweiten|dann|danach|außerdem|zudem|weiterhin|als nächstes)[,:]?\s*/gi,
    /\b(drittens|als drittes|zum dritten)[,:]?\s*/gi,
    /\b(viertens|als viertes|zum vierten)[,:]?\s*/gi,
  ]
  const hasListStructure = listPatterns.some((p) => p.test(text))

  let markdown = cleaned
  if (hasListStructure) {
    // Trennpunkte: "erstens", "zweitens", "dann", "außerdem", etc.
    const parts = text
      .split(/\b(?:erstens|zweitens|drittens|viertens|dann|danach|außerdem|zudem|weiterhin|als\s+(?:erstes|zweites|drittes|nächstes))\b[,:]?\s*/i)
      .map((p) => p.trim())
      .filter(Boolean)

    if (parts.length > 1) {
      const intro = parts[0]
      const items = parts.slice(1)
      markdown = (intro ? `${intro.charAt(0).toUpperCase() + intro.slice(1)}\n\n` : '')
        + items.map((item) => {
          const s = item.trim()
          return `- ${s.charAt(0).toUpperCase() + s.slice(1)}${s.match(/[.!?]$/) ? '' : '.'}`
        }).join('\n')
    }
  }

  const plainText = markdown.replace(/^[-*]\s/gm, '').replace(/^#+\s/gm, '')
  return { title, tiptapDoc: markdownToTiptap(markdown), plainText }
}

function fallbackResult(transcript: string): VoiceFormatResult {
  return formatFree(transcript)
}

export async function formatVoiceTranscript(transcript: string): Promise<VoiceFormatResult> {
  if (!anthropic) {
    console.log('[VoiceFormatter] Kein Anthropic-Key — kostenlose Formatierung')
    return formatFree(transcript)
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      system: `Du bist ein Notiz-Assistent. Formatiere transkribierten Sprachtext in eine strukturierte Notiz.

Regeln:
- Korrigiere Erkennungsfehler der Spracherkennung und Rechtschreibfehler
- Füge Satzzeichen hinzu, wo sie fehlen
- Erkenne Aufzählungen ("erstens", "zweitens", "als nächstes", "dann", "außerdem") und formatiere sie als Markdown-Listen
- Nutze Markdown: ## für Überschriften, - für Aufzählungen, 1. für nummerierte Listen
- Behalte den Inhalt vollständig bei – ändere keine Fakten
- Antworte genau in diesem Format:
TITEL: <kurzer Titel, max 60 Zeichen>
INHALT:
<formatierter Markdown-Inhalt>`,
      messages: [{ role: 'user', content: `Transkript: ${transcript}` }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    const titleMatch = raw.match(/^TITEL:\s*(.+)$/m)
    const contentMatch = raw.match(/^INHALT:\s*\n([\s\S]*)$/m)

    const title = (titleMatch?.[1]?.trim() || transcript.slice(0, 60)).trim()
    const markdown = (contentMatch?.[1]?.trim() || transcript).trim()
    const plainText = markdown
      .replace(/^#+\s/gm, '')
      .replace(/^[-*]\s/gm, '')
      .replace(/^\d+\.\s/gm, '')

    console.log(`[VoiceFormatter] Haiku OK — Titel: "${title}" | Länge: ${markdown.length}`)
    return { title, tiptapDoc: markdownToTiptap(markdown), plainText }
  } catch (err) {
    console.error('[VoiceFormatter] Anthropic-Fehler, Fallback auf Rohtext:', err)
    return fallbackResult(transcript)
  }
}
