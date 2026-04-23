import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { parseCSV } from '@/server/lib/budget/csv-parser'
import { applyRules, detectTransfer } from '@/server/lib/budget/rule-engine'
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

  const csvText = await file.text()
  const { transactions: parsed, errors } = parseCSV(csvText)

  if (!parsed.length) {
    return NextResponse.json({ error: 'Keine Buchungen erkannt', details: errors }, { status: 400 })
  }

  await ensureSeedData(workspaceId)

  const rules = await prisma.budgetRule.findMany({
    where: { workspace_id: workspaceId, deleted_at: null },
    include: { category: true },
  })

  const data = parsed.map((tx) => {
    const isTransfer = detectTransfer({ recipient: tx.recipient, sender: tx.sender, subject: tx.subject })
    let categoryId: string | null = null

    if (!isTransfer) {
      const cat = applyRules(
        { recipient: tx.recipient, sender: tx.sender, subject: tx.subject },
        rules,
      )
      if (cat) categoryId = cat.id
    }

    return {
      workspace_id: workspaceId,
      category_id: categoryId,
      date: tx.date,
      amount: tx.amount,
      recipient: tx.recipient,
      sender: tx.sender,
      subject: tx.subject,
      iban: tx.iban,
      import_hash: computeImportHash({ date: tx.date, amount: tx.amount, recipient: tx.recipient, subject: tx.subject, iban: tx.iban }),
      raw_data: tx.rawData as object,
      is_transfer: isTransfer,
      source_file: file.name,
    }
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
