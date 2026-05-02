import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { parseCSV, type ColumnMap } from '@/server/lib/budget/csv-parser'
import { applyRules, detectPairedTransfers, detectTransfer } from '@/server/lib/budget/rule-engine'
import { SEED_CATEGORIES, SEED_RULES } from '@/server/lib/budget/seed-data'

function computeImportHash(tx: {
  date: Date
  amount: number
  recipient: string | null
  subject: string | null
  iban: string | null
}): string {
  const key = [
    tx.date.toISOString().split('T')[0],
    tx.amount.toString(),
    tx.recipient ?? '',
    tx.subject ?? '',
    tx.iban ?? '',
  ].join('|')
  return createHash('sha256').update(key).digest('hex')
}

function parseColumnMap(raw: FormDataEntryValue | null): Partial<ColumnMap> | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const read = (key: keyof ColumnMap): string | null | undefined => {
      const value = parsed[key]
      return typeof value === 'string' && value.trim() ? value : null
    }

    return {
      date: read('date'),
      amount: read('amount'),
      debit: read('debit'),
      credit: read('credit'),
      recipient: read('recipient'),
      sender: read('sender'),
      subject: read('subject'),
      iban: read('iban'),
    }
  } catch {
    return undefined
  }
}

async function ensureSeedData(workspaceId: string): Promise<void> {
  const count = await prisma.budgetCategory.count({
    where: { workspace_id: workspaceId, is_system: true, deleted_at: null },
  })
  if (count > 0) return

  const categories = await prisma.$transaction(
    SEED_CATEGORIES.map((cat) =>
      prisma.budgetCategory.create({
        data: {
          workspace_id: workspaceId,
          name: cat.name,
          type: cat.type,
          color: cat.color,
          icon: cat.icon,
          is_system: cat.is_system,
        },
      })
    )
  )

  const catMap = new Map(categories.map((c) => [c.name, c.id]))
  const rules = SEED_RULES.filter((r) => catMap.has(r.categoryKey)).map((r) => ({
    workspace_id: workspaceId,
    category_id: catMap.get(r.categoryKey)!,
    match_field: r.match_field,
    match_value: r.match_value,
    match_type: r.match_type,
    priority: r.priority,
    is_system: true,
  }))
  await prisma.budgetRule.createMany({ data: rules })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const member = await prisma.workspaceMember.findFirst({
    where: { user_id: user.id, deleted_at: null },
  })
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const workspaceId = member.workspace_id

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Keine Datei übermittelt' }, { status: 400 })
  const columnMapOverride = parseColumnMap(formData.get('mapping'))

  const csvText = await file.text()
  const { transactions: parsed, errors, headers, columnMap } = columnMapOverride
    ? parseCSV(csvText, columnMapOverride)
    : parseCSV(csvText)

  if (!parsed.length) {
    const hasAmountMapping = !!(columnMap.amount || columnMap.debit || columnMap.credit)
    const needsMapping = headers.length > 0 && (!columnMap.date || !hasAmountMapping)
    return NextResponse.json(
      {
        error: needsMapping ? 'Spaltenzuordnung erforderlich' : 'Keine Buchungen erkannt',
        details: errors,
        needsMapping,
        headers,
        columnMap,
      },
      { status: needsMapping ? 422 : 400 },
    )
  }

  await ensureSeedData(workspaceId)

  const rules = await prisma.budgetRule.findMany({
    where: { workspace_id: workspaceId, deleted_at: null },
    include: { category: true },
  })
  const transferCategoryId =
    rules.find((rule) => rule.category.type === 'transfer')?.category_id ??
    null

  const data = parsed.map((tx) => {
    return {
      workspace_id: workspaceId,
      category_id: null as string | null,
      date: tx.date,
      amount: tx.amount,
      recipient: tx.recipient,
      sender: tx.sender,
      subject: tx.subject,
      iban: tx.iban,
      import_hash: computeImportHash({ date: tx.date, amount: tx.amount, recipient: tx.recipient, subject: tx.subject, iban: tx.iban }),
      raw_data: tx.rawData as object,
      is_transfer: false,
      source_file: file.name,
    }
  })

  const pairedTransfers = detectPairedTransfers(parsed)

  data.forEach((row, index) => {
    const tx = parsed[index]
    let isTransfer = detectTransfer({
      recipient: tx.recipient,
      sender: tx.sender,
      subject: tx.subject,
      iban: tx.iban,
    })
    if (pairedTransfers.has(index)) {
      isTransfer = true
    }
    let categoryId: string | null = isTransfer ? transferCategoryId : null

    const cat = applyRules(
      { recipient: tx.recipient, sender: tx.sender, subject: tx.subject, iban: tx.iban },
      rules,
    )

    if (cat) {
      categoryId = cat.id
      if (cat.type === 'transfer') {
        isTransfer = true
      }
    }

    if (isTransfer && !categoryId) {
      categoryId = transferCategoryId
    }
    row.is_transfer = isTransfer
    row.category_id = categoryId
  })

  const before = await prisma.budgetTransaction.count({ where: { workspace_id: workspaceId, deleted_at: null } })
  await prisma.budgetTransaction.createMany({ data, skipDuplicates: true })
  const after = await prisma.budgetTransaction.count({ where: { workspace_id: workspaceId, deleted_at: null } })

  const imported = after - before
  const skipped = data.length - imported
  const categorized = data.filter((d) => d.category_id !== null).length
  const transfers = data.filter((d) => d.is_transfer).length

  return NextResponse.json({
    imported,
    skipped,
    categorized,
    transfers,
    uncategorized: data.length - categorized - transfers,
    parseErrors: errors,
  })
}
