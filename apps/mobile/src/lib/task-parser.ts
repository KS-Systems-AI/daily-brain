import * as chrono from 'chrono-node'

export interface ParsedTask {
  title: string
  due_at: Date | null
  end_at: Date | null
}

const FILLER_PHRASES = [
  /^erinner[e]?\s+mich\s+(?:bitte\s+)?(?:daran\s*)?(?:,?\s*(?:dass|das)\s+ich\s+)?/i,
  /^bitte\s+erinner[e]?\s+mich\s+(?:daran\s*)?/i,
  /^vergiss\s+nicht\s+/i,
  /^nicht\s+vergessen\s+/i,
  /^denk[e]?\s+(?:bitte\s+)?daran\s+/i,
  /^ich\s+(?:muss|möchte|will|sollte|soll)\s+(?:noch\s+)?/i,
  /^kannst\s+du\s+(?:bitte\s+)?/i,
  /^bitte\s+/i,
  /^(?:mach|erstell[e]?|leg[e]?)\s+(?:mir\s+)?(?:eine?\s+)?(?:aufgabe|erinnerung|task)\s*(?::\s*)?/i,
  /^neue\s+aufgabe\s*(?::\s*)?/i,
]

function stripFillerPhrases(text: string): string {
  let result = text
  for (const re of FILLER_PHRASES) {
    result = result.replace(re, '')
  }
  return result.replace(/^\s*[,.:]\s*/, '').trim()
}

const DURATION_RE =
  /(?:dauert\s+)?(\d+(?:[,\.]\d+)?)\s*(?:stunden?|h)\b/i

const DURATION_MIN_RE =
  /(?:dauert\s+)?(\d+)\s*(?:minuten?|min)\b/i

const DURATION_MIXED_RE =
  /(?:dauert\s+)?(\d+)\s*(?:stunden?|h)\s*(?:und\s+)?(\d+)\s*(?:minuten?|min)\b/i

const DURATION_STRIP_RE =
  /\s*(?:dauert\s+)?(\d+(?:[,\.]\d+)?)\s*(?:stunden?|h)(?:\s*(?:und\s+)?(\d+)\s*(?:minuten?|min))?\s*/i

const DURATION_MIN_STRIP_RE =
  /\s*(?:dauert\s+)?(\d+)\s*(?:minuten?|min)\s*/i

const TIME_RANGE_RE =
  /(\d{1,2})[:\.]?(\d{2})?\s*[-–bis]+\s*(\d{1,2})[:\.]?(\d{2})?\s*(?:uhr)?/i

function parseDurationMs(text: string): number | null {
  const mixedMatch = text.match(DURATION_MIXED_RE)
  if (mixedMatch) {
    const hours = parseInt(mixedMatch[1], 10)
    const mins = parseInt(mixedMatch[2], 10)
    return (hours * 60 + mins) * 60 * 1000
  }

  const hourMatch = text.match(DURATION_RE)
  if (hourMatch) {
    const hours = parseFloat(hourMatch[1].replace(',', '.'))
    return Math.round(hours * 60) * 60 * 1000
  }

  const minMatch = text.match(DURATION_MIN_RE)
  if (minMatch) {
    const mins = parseInt(minMatch[1], 10)
    return mins * 60 * 1000
  }

  return null
}

function stripDuration(text: string): string {
  return text
    .replace(DURATION_MIXED_RE, ' ')
    .replace(DURATION_STRIP_RE, ' ')
    .replace(DURATION_MIN_STRIP_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseTaskInput(text: string, refDate?: Date): ParsedTask {
  const ref = refDate ?? new Date()
  const results = chrono.de.parse(text, ref, { forwardDate: true })

  let due_at: Date | null = null
  let end_at: Date | null = null
  let title = text

  if (results.length > 0) {
    const result = results[0]
    due_at = result.start.date()

    if (result.end) {
      end_at = result.end.date()
    }

    title = text.slice(0, result.index).trim()
    const after = text.slice(result.index + result.text.length).trim()
    if (after) {
      title = title ? `${title} ${after}` : after
    }
    title = title.replace(/\s+/g, ' ').trim()
  }

  if (!end_at && due_at) {
    const rangeMatch = text.match(TIME_RANGE_RE)
    if (rangeMatch) {
      const endHour = parseInt(rangeMatch[3], 10)
      const endMin = parseInt(rangeMatch[4] || '0', 10)
      if (endHour >= 0 && endHour <= 23) {
        end_at = new Date(due_at)
        end_at.setHours(endHour, endMin, 0, 0)
      }
    }
  }

  if (!end_at && due_at) {
    const durationMs = parseDurationMs(text)
    if (durationMs) {
      end_at = new Date(due_at.getTime() + durationMs)
    }
  }

  title = stripDuration(title)
  title = stripFillerPhrases(title)
  if (!title) title = text

  return { title, due_at, end_at }
}

export function formatRelativeDate(date: Date): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Heute'
  if (diffDays === 1) return 'Morgen'
  if (diffDays === -1) return 'Gestern'
  if (diffDays > 1 && diffDays <= 6) {
    return target.toLocaleDateString('de-DE', { weekday: 'short' })
  }
  return target.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

export function formatDuration(start: Date, end: Date): string {
  const diffMs = end.getTime() - start.getTime()
  if (diffMs <= 0) return ''
  const mins = Math.round(diffMs / 60000)
  if (mins < 60) return `${mins}min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

export function isOverdue(date: Date): boolean {
  return date.getTime() < Date.now()
}
