import type { BudgetRule, BudgetCategory } from '@prisma/client'

type RuleWithCategory = BudgetRule & { category: BudgetCategory }

type TransactionFields = {
  recipient?: string | null
  sender?: string | null
  subject?: string | null
  iban?: string | null
}

export type TransferCandidate = TransactionFields & {
  amount: number
  date: Date
}

function matches(value: string | null | undefined, rule: BudgetRule): boolean {
  if (!value) return false
  const v = value.toUpperCase()
  const m = rule.match_value.toUpperCase()

  if (rule.match_type === 'exact') return v === m
  if (rule.match_type === 'startswith') return v.startsWith(m)
  return v.includes(m) // contains
}

export function applyRules(
  tx: TransactionFields,
  rules: RuleWithCategory[],
): BudgetCategory | null {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority)

  for (const rule of sorted) {
    if (rule.deleted_at) continue

    if (rule.match_field === 'any') {
      if (
        matches(tx.recipient, rule) ||
        matches(tx.sender, rule) ||
        matches(tx.subject, rule)
      ) {
        return rule.category
      }
    } else if (rule.match_field === 'recipient' && matches(tx.recipient, rule)) {
      return rule.category
    } else if (rule.match_field === 'sender' && matches(tx.sender, rule)) {
      return rule.category
    } else if (rule.match_field === 'subject' && matches(tx.subject, rule)) {
      return rule.category
    }
  }

  return null
}

export function detectTransfer(tx: TransactionFields): boolean {
  const STRONG_TRANSFER_KEYWORDS = [
    'UMBUCHUNG',
    'ÜBERTRAG',
    'UEBERTRAG',
    'EIGENE BUCHUNG',
    'GUTSCHRIFT EIGENES KONTO',
    'DEPOTBUCHUNG',
    'SPARPLAN',
  ]

  const ACCOUNT_TARGET_KEYWORDS = [
    'TAGESGELD',
    'SPARKONTO',
    'VERRECHNUNGSKONTO',
    'REFERENZKONTO',
    'GIROKONTO',
    'DEPOT',
    'HAUPTKONTO',
    'RÜCKLAGE',
    'RUECKLAGE',
    'SPAREN',
  ]

  const INTERNAL_HINTS = [
    'EIGEN',
    'INTERN',
    'UMBUCH',
    'UEBERTRAG',
    'ÜBERTRAG',
    'KONTO',
  ]

  const combined = [tx.recipient, tx.sender, tx.subject, tx.iban]
    .filter(Boolean)
    .join(' ')
    .toUpperCase()

  if (STRONG_TRANSFER_KEYWORDS.some((kw) => combined.includes(kw))) {
    return true
  }

  return (
    ACCOUNT_TARGET_KEYWORDS.some((kw) => combined.includes(kw)) &&
    INTERNAL_HINTS.some((kw) => combined.includes(kw))
  )
}

function normalizeActor(value: string | null | undefined): string | null {
  if (!value) return null
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
}

function hasTransferSubject(tx: TransactionFields): boolean {
  const subject = normalizeActor(tx.subject)
  if (!subject) return false

  return [
    'DEBIT TRANSFER',
    'CREDIT TRANSFER',
    'INCOMING TRANSFER',
    'OUTGOING TRANSFER',
  ].some((keyword) => subject.includes(keyword))
}

function isMirroredCounterparty(a: TransferCandidate, b: TransferCandidate): boolean {
  const aRecipient = normalizeActor(a.recipient)
  const aSender = normalizeActor(a.sender)
  const bRecipient = normalizeActor(b.recipient)
  const bSender = normalizeActor(b.sender)

  return !!(
    aRecipient &&
    aSender &&
    bRecipient &&
    bSender &&
    aRecipient === bSender &&
    aSender === bRecipient
  )
}

export function detectPairedTransfers(transactions: TransferCandidate[]): Set<number> {
  const matched = new Set<number>()

  for (let i = 0; i < transactions.length; i += 1) {
    if (matched.has(i)) continue

    for (let j = i + 1; j < transactions.length; j += 1) {
      if (matched.has(j)) continue

      const a = transactions[i]
      const b = transactions[j]

      if (!isSameCalendarDay(a.date, b.date)) continue
      if (a.amount !== -b.amount) continue
      if (!hasTransferSubject(a) || !hasTransferSubject(b)) continue
      if (!isMirroredCounterparty(a, b)) continue

      matched.add(i)
      matched.add(j)
      break
    }
  }

  return matched
}
