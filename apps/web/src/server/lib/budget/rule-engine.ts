import type { BudgetRule, BudgetCategory } from '@prisma/client'

type RuleWithCategory = BudgetRule & { category: BudgetCategory }

type TransactionFields = {
  recipient?: string | null
  sender?: string | null
  subject?: string | null
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
  const TRANSFER_KEYWORDS = [
    'UMBUCHUNG',
    'ÜBERTRAG',
    'UEBERTRAG',
    'EIGENE BUCHUNG',
    'GUTSCHRIFT EIGENES KONTO',
    'DEPOTBUCHUNG',
    'SPARPLAN',
  ]

  const combined = [tx.recipient, tx.sender, tx.subject]
    .filter(Boolean)
    .join(' ')
    .toUpperCase()

  return TRANSFER_KEYWORDS.some((kw) => combined.includes(kw))
}
