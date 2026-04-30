import Papa from 'papaparse'

export type ParsedTransaction = {
  date: Date
  amount: number // cents
  recipient: string | null
  sender: string | null
  subject: string | null
  iban: string | null
  rawData: Record<string, string>
}

export type ColumnMap = {
  date: string | null
  amount: string | null
  recipient: string | null
  sender: string | null
  subject: string | null
  iban: string | null
}

const DATE_PATTERNS = [
  /buchungstag/i,
  /buchungsdatum/i,
  /^datum$/i,
  /wertstellungsdatum/i,
  /valutadatum/i,
  /^wertstellung$/i,
  /^buchung$/i,
  /^date$/i,
  /transaktionsdatum/i,
  /^posting.date/i,
]

const AMOUNT_PATTERNS = [
  /^betrag$/i,
  /betrag.*[€(]/i,
  /betrag.*eur/i,
  /umsatz.*eur/i,
  /umsatz in eur/i,
  /^umsatz$/i,
  /^amount$/i,
  /amount.*eur/i,
  /^value$/i,
  /^summe$/i,
  /soll.*haben/i,
  /^gutschrift.*lastschrift/i,
  /transaktionsbetrag/i,
  /^eur.betrag/i,
  /betrag.in.eur/i,
  /^debit.*credit/i,
  /^soll$/i,
  /^haben$/i,
  /^gutschrift$/i,
  /^lastschrift$/i,
]

const RECIPIENT_PATTERNS = [
  /auftraggeber.*beg[üu]nstigter/i,
  /beg[üu]nstigter.*auftraggeber/i,
  /auftraggeber.*empf[äa]nger/i,
  /empf[äa]nger.*auftraggeber/i,
  /zahlungsempf[äa]nger/i,  // matches Zahlungsempfänger*in too
  /name.*empf[äa]nger/i,
  /empf[äa]nger/i,
  /beg[üu]nstigter/i,
  /^payee$/i,
  /^name$/i,
  /auftraggeber/i,
  /absender/i,
]

// sender (Zahlungspflichtige*r = payer)
const SENDER_PATTERNS = [
  /zahlungspflichtige/i,  // matches Zahlungspflichtige*r
  /zahler/i,
  /payer/i,
  /debitor/i,
]

const SUBJECT_PATTERNS = [
  /verwendungszweck/i,
  /buchungstext/i,
  /^betreff$/i,
  /^subject$/i,
  /zahlungsreferenz/i,
  /kundenreferenz/i,
  /payment.reference/i,
  /transaction.type/i,
  /^referenz$/i,
  /^beschreibung$/i,
  /^memo$/i,
  /^note$/i,
  /^text$/i,
]

const IBAN_PATTERNS = [
  /iban.*auftraggeber/i,
  /auftraggeber.*iban/i,
  /glaeubiger.*iban/i,
  /gläubiger.*iban/i,
  /kontonummer.*iban/i,
  /account.number/i,
  /^iban$/i,
  /gegenkontonummer/i,
  /gegenkonto/i,
]

function detectColumn(headers: string[], patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = headers.find((h) => pattern.test(h.trim()))
    if (match) return match
  }
  return null
}

function detectColumnMap(headers: string[]): ColumnMap {
  return {
    date: detectColumn(headers, DATE_PATTERNS),
    amount: detectColumn(headers, AMOUNT_PATTERNS),
    recipient: detectColumn(headers, RECIPIENT_PATTERNS),
    sender: detectColumn(headers, SENDER_PATTERNS),
    subject: detectColumn(headers, SUBJECT_PATTERNS),
    iban: detectColumn(headers, IBAN_PATTERNS),
  }
}

function detectDelimiter(csvContent: string): string {
  const firstLines = csvContent.split('\n').slice(0, 5).join('\n')
  const semicolons = (firstLines.match(/;/g) ?? []).length
  const commas = (firstLines.match(/,/g) ?? []).length
  const tabs = (firstLines.match(/\t/g) ?? []).length
  if (semicolons > commas && semicolons > tabs) return ';'
  if (tabs > commas && tabs > semicolons) return '\t'
  return ','
}

// Find the actual header row — skips metadata lines (common in DKB, ING exports)
function findHeaderRowIndex(lines: string[], delimiter: string): number {
  const allPatterns = [
    ...DATE_PATTERNS,
    ...AMOUNT_PATTERNS,
    ...RECIPIENT_PATTERNS,
    ...SUBJECT_PATTERNS,
  ]
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const cols = lines[i].split(delimiter).map((c) => c.replace(/^["']|["']$/g, '').trim())
    const matches = cols.filter((c) => allPatterns.some((p) => p.test(c))).length
    if (matches >= 2) return i
  }
  return 0
}

function parseGermanAmount(raw: string): number | null {
  // Remove currency symbols, quotes, spaces
  let cleaned = raw.replace(/[€$£\s"']/g, '').trim()
  if (!cleaned || cleaned === '-') return null

  // Handle formats: "1.234,56" or "1,234.56" or "1234.56" or "1234,56"
  const hasCommaDecimal = /,\d{2}$/.test(cleaned)
  const hasDotDecimal = /\.\d{2}$/.test(cleaned)

  if (hasCommaDecimal) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (hasDotDecimal) {
    cleaned = cleaned.replace(/,/g, '')
  } else {
    // No clear decimal — try replacing last comma/dot as decimal
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  }

  const num = parseFloat(cleaned)
  if (isNaN(num)) return null
  return Math.round(num * 100)
}

function parseGermanDate(raw: string): Date | null {
  const cleaned = raw.replace(/["']/g, '').trim()
  if (!cleaned) return null

  const ddmmyyyy = cleaned.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy
    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
  }
  const yyyymmdd = cleaned.match(/^(\d{4})[./-](\d{2})[./-](\d{2})$/)
  if (yyyymmdd) {
    const [, y, m, d] = yyyymmdd
    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
  }
  const ddmmyy = cleaned.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2})$/)
  if (ddmmyy) {
    const [, d, m, y] = ddmmyy
    const year = parseInt(y) + (parseInt(y) < 50 ? 2000 : 1900)
    return new Date(year, parseInt(m) - 1, parseInt(d))
  }
  const parsed = new Date(cleaned)
  return isNaN(parsed.getTime()) ? null : parsed
}

type ParseFn = (input: string, config: object) => Papa.ParseResult<Record<string, string>>
const papaParse = Papa.parse as unknown as ParseFn

export function parseCSV(csvContent: string): {
  transactions: ParsedTransaction[]
  columnMap: ColumnMap
  headers: string[]
  errors: string[]
}
export function parseCSV(csvContent: string, overrides: Partial<ColumnMap>): {
  transactions: ParsedTransaction[]
  columnMap: ColumnMap
  headers: string[]
  errors: string[]
}
export function parseCSV(csvContent: string, overrides?: Partial<ColumnMap>): {
  transactions: ParsedTransaction[]
  columnMap: ColumnMap
  headers: string[]
  errors: string[]
} {
  const errors: string[] = []

  // Normalize line endings
  const normalized = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const delimiter = detectDelimiter(normalized)
  const lines = normalized.split('\n').filter((l) => l.trim())

  // Skip metadata rows before actual header
  const headerIndex = findHeaderRowIndex(lines, delimiter)
  const csvFromHeader = lines.slice(headerIndex).join('\n')

  const result = papaParse(csvFromHeader, {
    header: true,
    skipEmptyLines: true,
    delimiter,
    transformHeader: (h: string) => h.replace(/^["']|["']$/g, '').trim(),
  })

  if (!result.data.length) {
    return {
      transactions: [],
      columnMap: { date: null, amount: null, recipient: null, sender: null, subject: null, iban: null },
      headers: [],
      errors: ['CSV leer oder ungültig'],
    }
  }

  const headers = result.meta.fields ?? []
  const detectedMap = detectColumnMap(headers)
  const columnMap: ColumnMap = {
    date: overrides?.date && headers.includes(overrides.date) ? overrides.date : detectedMap.date,
    amount: overrides?.amount && headers.includes(overrides.amount) ? overrides.amount : detectedMap.amount,
    recipient: overrides?.recipient && headers.includes(overrides.recipient) ? overrides.recipient : detectedMap.recipient,
    sender: overrides?.sender && headers.includes(overrides.sender) ? overrides.sender : detectedMap.sender,
    subject: overrides?.subject && headers.includes(overrides.subject) ? overrides.subject : detectedMap.subject,
    iban: overrides?.iban && headers.includes(overrides.iban) ? overrides.iban : detectedMap.iban,
  }

  if (!columnMap.date) errors.push(`Datumsspalte nicht erkannt (alle Spalten: ${headers.join(' | ')})`)
  if (!columnMap.amount) errors.push(`Betragsspalte nicht erkannt (alle Spalten: ${headers.join(' | ')})`)

  const transactions: ParsedTransaction[] = []

  for (const [i, row] of result.data.entries()) {
    if (!columnMap.date || !columnMap.amount) continue

    const rawDate = row[columnMap.date]
    const rawAmount = row[columnMap.amount]

    if (!rawDate?.trim() || !rawAmount?.trim()) continue

    const date = parseGermanDate(rawDate)
    if (!date) {
      errors.push(`Zeile ${i + 2}: Datum "${rawDate}" nicht parsebar`)
      continue
    }

    const amount = parseGermanAmount(rawAmount)
    if (amount === null) {
      errors.push(`Zeile ${i + 2}: Betrag "${rawAmount}" nicht parsebar`)
      continue
    }

    const recipientCol = columnMap.recipient
    const senderCol = columnMap.sender
    const subjectCol = columnMap.subject
    const ibanCol = columnMap.iban

    transactions.push({
      date,
      amount,
      recipient: recipientCol ? (row[recipientCol]?.replace(/^["']|["']$/g, '').trim() || null) : null,
      sender: senderCol ? (row[senderCol]?.replace(/^["']|["']$/g, '').trim() || null) : null,
      subject: subjectCol ? (row[subjectCol]?.replace(/^["']|["']$/g, '').trim() || null) : null,
      iban: ibanCol ? (row[ibanCol]?.replace(/^["']|["']$/g, '').trim() || null) : null,
      rawData: row,
    })
  }

  return { transactions, columnMap, headers, errors }
}
