export interface EditorBlock {
  id: string
  block_type: string
  plaintext: string
  attrs: Record<string, unknown>
  indent: number
}

interface TiptapNode {
  type: string
  content?: TiptapNode[]
  attrs?: Record<string, unknown>
  text?: string
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

let counter = 0
export function uid(): string {
  counter += 1
  return `blk-${Date.now()}-${counter}-${Math.random().toString(36).slice(2, 8)}`
}

function extractText(nodes?: TiptapNode[]): string {
  if (!nodes) return ''
  return nodes
    .map((n) => {
      if (n.type === 'text') return n.text ?? ''
      if (n.type === 'hardBreak') return '\n'
      return extractText(n.content)
    })
    .join('')
}

export function tiptapToBlocks(doc: TiptapNode): EditorBlock[] {
  if (!doc?.content) return [emptyBlock()]

  const blocks: EditorBlock[] = []

  for (const node of doc.content) {
    if (node.type === 'heading') {
      blocks.push({
        id: uid(),
        block_type: 'heading',
        plaintext: extractText(node.content),
        attrs: {
          level: node.attrs?.level ?? 1,
          ...textMarksFromInlineNodes(node.content),
        },
        indent: 0,
      })
    } else if (node.type === 'bulletList') {
      for (const item of node.content ?? []) {
        blocks.push({
          id: uid(),
          block_type: 'ul',
          plaintext: extractText(item.content?.[0]?.content),
          attrs: { ...textMarksFromInlineNodes(item.content?.[0]?.content) },
          indent: 0,
        })
      }
    } else if (node.type === 'orderedList') {
      for (const item of node.content ?? []) {
        blocks.push({
          id: uid(),
          block_type: 'ol',
          plaintext: extractText(item.content?.[0]?.content),
          attrs: { ...textMarksFromInlineNodes(item.content?.[0]?.content) },
          indent: 0,
        })
      }
    } else if (node.type === 'taskList') {
      for (const item of node.content ?? []) {
        blocks.push({
          id: uid(),
          block_type: 'task_item',
          plaintext: extractText(item.content?.[0]?.content),
          attrs: {
            checked: item.attrs?.checked ?? false,
            ...textMarksFromInlineNodes(item.content?.[0]?.content),
          },
          indent: 0,
        })
      }
    } else if (node.type === 'blockquote') {
      for (const inner of node.content ?? []) {
        blocks.push({
          id: uid(),
          block_type: 'blockquote',
          plaintext: extractText(inner.content),
          attrs: { ...textMarksFromInlineNodes(inner.content) },
          indent: 0,
        })
      }
    } else if (node.type === 'codeBlock') {
      blocks.push({
        id: uid(),
        block_type: 'code_block',
        plaintext: extractText(node.content),
        attrs: { language: node.attrs?.language ?? null },
        indent: 0,
      })
    } else if (node.type === 'subNote') {
      blocks.push({
        id: uid(),
        block_type: 'sub_note',
        plaintext: (node.attrs?.title as string) ?? '',
        attrs: { noteId: node.attrs?.noteId ?? '' },
        indent: 0,
      })
    } else if (node.type === 'horizontalRule') {
      blocks.push({
        id: uid(),
        block_type: 'hr',
        plaintext: '',
        attrs: {},
        indent: 0,
      })
    } else {
      blocks.push({
        id: uid(),
        block_type: 'unstyled',
        plaintext: extractText(node.content),
        attrs: { ...textMarksFromInlineNodes(node.content) },
        indent: 0,
      })
    }
  }

  return blocks.length > 0 ? blocks : [emptyBlock()]
}

const TEXT_MARK_TYPES = ['bold', 'italic', 'strike', 'underline'] as const

function markSignature(marks?: { type: string }[]): string {
  if (!marks?.length) return ''
  const set = new Set<string>()
  for (const m of marks) {
    if ((TEXT_MARK_TYPES as readonly string[]).includes(m.type)) set.add(m.type)
  }
  return TEXT_MARK_TYPES.filter((t) => set.has(t)).join(',')
}

/** When all non-empty text runs share the same marks, return them for block attrs. */
function textMarksFromInlineNodes(nodes?: TiptapNode[]): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  if (!nodes?.length) return out
  const sigs: string[] = []
  for (const n of nodes) {
    if (n.type === 'text' && n.text) {
      sigs.push(markSignature(n.marks))
    }
  }
  if (sigs.length === 0) return out
  const first = sigs[0]
  if (!sigs.every((s) => s === first) || !first) return out
  for (const t of first.split(',')) {
    if (t === 'bold') out.bold = true
    if (t === 'italic') out.italic = true
    if (t === 'strike') out.strike = true
    if (t === 'underline') out.underline = true
  }
  return out
}

function textToInline(text: string): TiptapNode[] | undefined {
  if (!text) return undefined
  if (!text.includes('\n')) return [{ type: 'text', text }]
  const parts = text.split('\n')
  const nodes: TiptapNode[] = []
  parts.forEach((part, idx) => {
    if (part) nodes.push({ type: 'text', text: part })
    if (idx < parts.length - 1) nodes.push({ type: 'hardBreak' })
  })
  return nodes.length > 0 ? nodes : undefined
}

function withTextMarks(
  nodes: TiptapNode[] | undefined,
  attrs: Record<string, unknown>,
): TiptapNode[] | undefined {
  if (!nodes) return undefined
  const marks: { type: string }[] = []
  if (attrs.bold) marks.push({ type: 'bold' })
  if (attrs.italic) marks.push({ type: 'italic' })
  if (attrs.strike) marks.push({ type: 'strike' })
  if (attrs.underline) marks.push({ type: 'underline' })
  if (marks.length === 0) return nodes
  return nodes.map((n) =>
    n.type === 'text' ? { ...n, marks: [...marks, ...(n.marks ?? [])] } : n,
  )
}

function paragraphInline(block: EditorBlock) {
  return withTextMarks(textToInline(block.plaintext), block.attrs)
}

export function blocksToTiptap(blocks: EditorBlock[]): TiptapNode {
  const content: TiptapNode[] = []
  let i = 0

  while (i < blocks.length) {
    const block = blocks[i]

    if (block.block_type === 'heading') {
      content.push({
        type: 'heading',
        attrs: { level: (block.attrs.level as number) ?? 1 },
        content: paragraphInline(block),
      })
      i++
      continue
    }

    if (block.block_type === 'ul') {
      const items: TiptapNode[] = []
      while (i < blocks.length && blocks[i].block_type === 'ul') {
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: paragraphInline(blocks[i]) }],
        })
        i++
      }
      content.push({ type: 'bulletList', content: items })
      continue
    }

    if (block.block_type === 'ol') {
      const items: TiptapNode[] = []
      while (i < blocks.length && blocks[i].block_type === 'ol') {
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: paragraphInline(blocks[i]) }],
        })
        i++
      }
      content.push({ type: 'orderedList', attrs: { start: 1 }, content: items })
      continue
    }

    if (block.block_type === 'task_item') {
      const items: TiptapNode[] = []
      while (i < blocks.length && blocks[i].block_type === 'task_item') {
        items.push({
          type: 'taskItem',
          attrs: { checked: blocks[i].attrs.checked ?? false },
          content: [{ type: 'paragraph', content: paragraphInline(blocks[i]) }],
        })
        i++
      }
      content.push({ type: 'taskList', content: items })
      continue
    }

    if (block.block_type === 'blockquote') {
      const children: TiptapNode[] = []
      while (i < blocks.length && blocks[i].block_type === 'blockquote') {
        children.push({ type: 'paragraph', content: paragraphInline(blocks[i]) })
        i++
      }
      content.push({ type: 'blockquote', content: children })
      continue
    }

    if (block.block_type === 'code_block') {
      content.push({
        type: 'codeBlock',
        attrs: { language: block.attrs.language ?? null },
        content: block.plaintext ? [{ type: 'text', text: block.plaintext }] : undefined,
      })
      i++
      continue
    }

    if (block.block_type === 'sub_note') {
      content.push({
        type: 'subNote',
        attrs: { noteId: block.attrs.noteId, title: block.plaintext || 'Ohne Titel' },
      })
      i++
      continue
    }

    if (block.block_type === 'hr') {
      content.push({ type: 'horizontalRule' })
      i++
      continue
    }

    content.push({
      type: 'paragraph',
      content: paragraphInline(block),
    })
    i++
  }

  return { type: 'doc', content }
}

export const TEXT_MARK_KEYS = ['bold', 'italic', 'underline', 'strike'] as const
export type TextMarkKey = (typeof TEXT_MARK_KEYS)[number]

export function blockSupportsTextMarks(blockType: string): boolean {
  return ['unstyled', 'heading', 'ul', 'ol', 'task_item', 'blockquote'].includes(blockType)
}

export function copyTextMarks(attrs: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of TEXT_MARK_KEYS) {
    if (attrs[k]) out[k] = true
  }
  return out
}

export function emptyBlock(type = 'unstyled'): EditorBlock {
  return {
    id: uid(),
    block_type: type,
    plaintext: '',
    attrs: type === 'heading' ? { level: 1 } : {},
    indent: 0,
  }
}

export const BLOCK_TYPES = [
  { type: 'sub_note', label: 'Unternotiz', icon: 'document-text-outline' as const },
  { type: 'unstyled', label: 'Text', icon: 'text-outline' as const },
  { type: 'heading', label: 'Überschrift 1', icon: 'text-outline' as const, attrs: { level: 1 } },
  { type: 'heading', label: 'Überschrift 2', icon: 'text-outline' as const, attrs: { level: 2 } },
  { type: 'heading', label: 'Überschrift 3', icon: 'text-outline' as const, attrs: { level: 3 } },
  { type: 'ul', label: 'Aufzählung', icon: 'list-outline' as const },
  { type: 'ol', label: 'Nummerierte Liste', icon: 'list-outline' as const },
  { type: 'task_item', label: 'Aufgabenliste', icon: 'checkbox-outline' as const },
  { type: 'blockquote', label: 'Zitat', icon: 'chatbox-outline' as const },
  { type: 'code_block', label: 'Code-Block', icon: 'code-slash-outline' as const },
  { type: 'hr', label: 'Trennlinie', icon: 'remove-outline' as const },
] as const
