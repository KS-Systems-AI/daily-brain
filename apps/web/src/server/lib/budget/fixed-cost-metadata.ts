type FixedCostMetadata = {
  fixedCostGroupKey: string | null
  fixedCostLabel: string | null
  userNotes: string | null
}

const PREFIX = '[[db-fixed:'
const SUFFIX = ']]'

export function parseFixedCostMetadata(notes: string | null | undefined): FixedCostMetadata {
  if (!notes) {
    return { fixedCostGroupKey: null, fixedCostLabel: null, userNotes: null }
  }

  const trimmed = notes.trim()
  if (!trimmed.startsWith(PREFIX)) {
    return {
      fixedCostGroupKey: null,
      fixedCostLabel: null,
      userNotes: trimmed || null,
    }
  }

  const end = trimmed.indexOf(SUFFIX)
  if (end === -1) {
    return {
      fixedCostGroupKey: null,
      fixedCostLabel: null,
      userNotes: trimmed || null,
    }
  }

  const rawMeta = trimmed.slice(PREFIX.length, end)
  const userNotes = trimmed.slice(end + SUFFIX.length).trim() || null

  const meta = new URLSearchParams(rawMeta)
  return {
    fixedCostGroupKey: meta.get('group') || null,
    fixedCostLabel: meta.get('label') || null,
    userNotes,
  }
}

export function buildFixedCostNotes({
  existingNotes,
  nextUserNotes,
  fixedCostGroupKey,
  fixedCostLabel,
}: {
  existingNotes?: string | null
  nextUserNotes?: string | null
  fixedCostGroupKey?: string | null
  fixedCostLabel?: string | null
}): string | null {
  const existing = parseFixedCostMetadata(existingNotes)
  const userNotes = (nextUserNotes ?? existing.userNotes ?? '').trim()
  const groupKey = fixedCostGroupKey ?? existing.fixedCostGroupKey
  const label = fixedCostLabel ?? existing.fixedCostLabel

  if (!groupKey && !label) {
    return userNotes || null
  }

  const params = new URLSearchParams()
  if (groupKey) params.set('group', groupKey)
  if (label) params.set('label', label)

  const prefix = `${PREFIX}${params.toString()}${SUFFIX}`
  return userNotes ? `${prefix}\n${userNotes}` : prefix
}
