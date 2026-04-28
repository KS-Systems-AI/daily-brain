export interface MarkRange {
  start: number
  end: number
  bold?: true
  italic?: true
  underline?: true
  strike?: true
}

export interface EditorBlock {
  id: string
  block_type: string
  plaintext: string
  markRanges: MarkRange[]
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

interface CharMark {
  bold?: true
  italic?: true
  underline?: true
  strike?: true
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

function textToCharMarks(text: string, ranges: MarkRange[]): CharMark[] {
  const marks: CharMark[] = Array.from({ length: text.length }, () => ({}))
  for (const r of ranges) {
    const s = Math.max(0, r.start)
    const e = Math.min(text.length, r.end)
    for (let i = s; i < e; i++) {
      if (r.bold) marks[i].bold = true
      if (r.italic) marks[i].italic = true
      if (r.underline) marks[i].underline = true
      if (r.strike) marks[i].strike = true
    }
  }
  return marks
}

function charMarksToRanges(charMarks: CharMark[]): MarkRange[] {
  const ranges: MarkRange[] = []
  let i = 0
  while (i < charMarks.length) {
    const m = charMarks[i]
    if (!m.bold && !m.italic && !m.underline && !m.strike) {
      i++
      continue
    }
    let j = i + 1
    while (
      j < charMarks.length &&
      charMarks[j].bold === m.bold &&
      charMarks[j].italic === m.italic &&
      charMarks[j].underline === m.underline &&
      charMarks[j].strike === m.strike
    )
      j++
    const r: MarkRange = { start: i, end: j }
    if (m.bold) r.bold = true
    if (m.italic) r.italic = true
    if (m.underline) r.underline = true
    if (m.strike) r.strike = true
    ranges.push(r)
    i = j
  }
  return ranges
}

export function toggleMarkInRange(
  ranges: MarkRange[],
  text: string,
  start: number,
  end: number,
  mark: TextMarkKey,
): MarkRange[] {
  if (text.length === 0) return ranges
  const s = Math.max(0, Math.min(start, text.length))
  const e = Math.max(0, Math.min(end, text.length))
  if (s >= e) return ranges

  const charMarks = textToCharMarks(text, ranges)
  const slice = charMarks.slice(s, e)
  const fullyActive = slice.length > 0 && slice.every((m) => !!m[mark])

  for (let i = s; i < e; i++) {
    if (fullyActive) delete charMarks[i][mark]
    else (charMarks[i] as Record<string, unknown>)[mark] = true
  }

  return charMarksToRanges(charMarks)
}

export function adjustMarkRangesForEdit(
  ranges: MarkRange[],
  oldText: string,
  newText: string,
): MarkRange[] {
  if (ranges.length === 0) return []
  if (oldText === newText) return ranges
  if (oldText.length === 0) return []

  const charMarks = textToCharMarks(oldText, ranges)

  let prefixLen = 0
  const minLen = Math.min(oldText.length, newText.length)
  while (prefixLen < minLen && oldText[prefixLen] === newText[prefixLen]) prefixLen++

  let oldSuffix = oldText.length
  let newSuffix = newText.length
  while (
    oldSuffix > prefixLen &&
    newSuffix > prefixLen &&
    oldText[oldSuffix - 1] === newText[newSuffix - 1]
  ) {
    oldSuffix--
    newSuffix--
  }

  const before = charMarks.slice(0, prefixLen)
  const after = charMarks.slice(oldSuffix)
  const inserted: CharMark[] = Array.from({ length: newSuffix - prefixLen }, () => ({}))

  return charMarksToRanges([...before, ...inserted, ...after])
}

export function getActiveMarksAtSelection(
  ranges: MarkRange[],
  text: string,
  start: number,
  end: number,
): Record<TextMarkKey, boolean> {
  const result: Record<TextMarkKey, boolean> = {
    bold: false,
    italic: false,
    underline: false,
    strike: false,
  }
  if (text.length === 0) return result

  const s = Math.max(0, Math.min(start, text.length - 1))
  const e = Math.max(s + 1, Math.min(end, text.length))
  if (s >= text.length) return result

  const charMarks = textToCharMarks(text, ranges)
  const slice = charMarks.slice(s, e)
  if (slice.length === 0) return result

  for (const mark of TEXT_MARK_KEYS) {
    result[mark] = slice.every((m) => !!m[mark])
  }
  return result
}

export function buildStyledSegments(
  text: string,
  ranges: MarkRange[],
): Array<{ text: string; bold?: true; italic?: true; underline?: true; strike?: true }> {
  if (!text) return [{ text: '' }]
  if (ranges.length === 0) return [{ text }]

  type Seg = { text: string; bold?: true; italic?: true; underline?: true; strike?: true }
  const charMarks = textToCharMarks(text, ranges)
  const segments: Seg[] = []
  let i = 0
  while (i < text.length) {
    const m = charMarks[i]
    let j = i + 1
    while (
      j < text.length &&
      charMarks[j].bold === m.bold &&
      charMarks[j].italic === m.italic &&
      charMarks[j].underline === m.underline &&
      charMarks[j].strike === m.strike
    )
      j++
    const seg: Seg = { text: text.slice(i, j) }
    if (m.bold) seg.bold = true
    if (m.italic) seg.italic = true
    if (m.underline) seg.underline = true
    if (m.strike) seg.strike = true
    segments.push(seg)
    i = j
  }
  return segments
}

export function getCurrentWordRange(
  text: string,
  pos: number,
): { start: number; end: number } {
  let start = pos
  while (start > 0 && /\S/.test(text[start - 1])) start--
  let end = pos
  while (end < text.length && /\S/.test(text[end])) end++
  if (start === end) return { start: Math.max(0, pos), end: Math.min(text.length, pos + 1) }
  return { start, end }
}

function parseMarkRanges(nodes?: TiptapNode[]): MarkRange[] {
  if (!nodes?.length) return []
  const ranges: MarkRange[] = []
  let pos = 0
  for (const node of nodes) {
    if (node.type === 'text' && node.text) {
      const start = pos
      const end = pos + node.text.length
      if (node.marks?.length) {
        const r: MarkRange = { start, end }
        let hasAny = false
        for (const m of node.marks) {
          if (m.type === 'bold') { r.bold = true; hasAny = true }
          if (m.type === 'italic') { r.italic = true; hasAny = true }
          if (m.type === 'strike') { r.strike = true; hasAny = true }
          if (m.type === 'underline') { r.underline = true; hasAny = true }
        }
        if (hasAny) ranges.push(r)
      }
      pos = end
    } else if (node.type === 'hardBreak') {
      pos++
    }
  }
  return ranges
}

function blockInlineContent(block: EditorBlock): TiptapNode[] | undefined {
  const { plaintext, markRanges } = block
  if (!plaintext) return undefined

  if (markRanges.length === 0) {
    if (!plaintext.includes('\n')) return [{ type: 'text', text: plaintext }]
    const parts = plaintext.split('\n')
    const nodes: TiptapNode[] = []
    parts.forEach((part, idx) => {
      if (part) nodes.push({ type: 'text', text: part })
      if (idx < parts.length - 1) nodes.push({ type: 'hardBreak' })
    })
    return nodes.length > 0 ? nodes : undefined
  }

  const charMarks = textToCharMarks(plaintext, markRanges)
  const boundaries = new Set<number>([0, plaintext.length])
  for (const r of markRanges) {
    if (r.start > 0 && r.start < plaintext.length) boundaries.add(r.start)
    if (r.end > 0 && r.end < plaintext.length) boundaries.add(r.end)
  }
  for (let i = 0; i < plaintext.length; i++) {
    if (plaintext[i] === '\n') { boundaries.add(i); boundaries.add(i + 1) }
  }

  const sorted = Array.from(boundaries).sort((a, b) => a - b)
  const nodes: TiptapNode[] = []

  for (let i = 0; i < sorted.length - 1; i++) {
    const segStart = sorted[i]
    const segEnd = sorted[i + 1]
    if (segStart >= segEnd) continue
    const segText = plaintext.slice(segStart, segEnd)

    if (segText === '\n') {
      nodes.push({ type: 'hardBreak' })
      continue
    }

    const m = charMarks[segStart]
    const marks: { type: string }[] = []
    if (m?.bold) marks.push({ type: 'bold' })
    if (m?.italic) marks.push({ type: 'italic' })
    if (m?.strike) marks.push({ type: 'strike' })
    if (m?.underline) marks.push({ type: 'underline' })

    nodes.push({ type: 'text', text: segText, ...(marks.length ? { marks } : {}) })
  }

  return nodes.length > 0 ? nodes : undefined
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
        markRanges: parseMarkRanges(node.content),
        attrs: { level: node.attrs?.level ?? 1 },
        indent: 0,
      })
    } else if (node.type === 'bulletList') {
      for (const item of node.content ?? []) {
        const inner = item.content?.[0]?.content
        blocks.push({
          id: uid(),
          block_type: 'ul',
          plaintext: extractText(inner),
          markRanges: parseMarkRanges(inner),
          attrs: {},
          indent: 0,
        })
      }
    } else if (node.type === 'orderedList') {
      for (const item of node.content ?? []) {
        const inner = item.content?.[0]?.content
        blocks.push({
          id: uid(),
          block_type: 'ol',
          plaintext: extractText(inner),
          markRanges: parseMarkRanges(inner),
          attrs: {},
          indent: 0,
        })
      }
    } else if (node.type === 'taskList') {
      for (const item of node.content ?? []) {
        const inner = item.content?.[0]?.content
        blocks.push({
          id: uid(),
          block_type: 'task_item',
          plaintext: extractText(inner),
          markRanges: parseMarkRanges(inner),
          attrs: { checked: item.attrs?.checked ?? false },
          indent: 0,
        })
      }
    } else if (node.type === 'blockquote') {
      for (const inner of node.content ?? []) {
        blocks.push({
          id: uid(),
          block_type: 'blockquote',
          plaintext: extractText(inner.content),
          markRanges: parseMarkRanges(inner.content),
          attrs: {},
          indent: 0,
        })
      }
    } else if (node.type === 'codeBlock') {
      blocks.push({
        id: uid(),
        block_type: 'code_block',
        plaintext: extractText(node.content),
        markRanges: [],
        attrs: { language: node.attrs?.language ?? null },
        indent: 0,
      })
    } else if (node.type === 'subNote') {
      blocks.push({
        id: uid(),
        block_type: 'sub_note',
        plaintext: (node.attrs?.title as string) ?? '',
        markRanges: [],
        attrs: { noteId: node.attrs?.noteId ?? '' },
        indent: 0,
      })
    } else if (node.type === 'horizontalRule') {
      blocks.push({
        id: uid(),
        block_type: 'hr',
        plaintext: '',
        markRanges: [],
        attrs: {},
        indent: 0,
      })
    } else {
      blocks.push({
        id: uid(),
        block_type: 'unstyled',
        plaintext: extractText(node.content),
        markRanges: parseMarkRanges(node.content),
        attrs: {},
        indent: 0,
      })
    }
  }

  return blocks.length > 0 ? blocks : [emptyBlock()]
}

export const TEXT_MARK_KEYS = ['bold', 'italic', 'underline', 'strike'] as const
export type TextMarkKey = (typeof TEXT_MARK_KEYS)[number]

export function blockSupportsTextMarks(blockType: string): boolean {
  return ['unstyled', 'heading', 'ul', 'ol', 'task_item', 'blockquote'].includes(blockType)
}

export function emptyBlock(type = 'unstyled'): EditorBlock {
  return {
    id: uid(),
    block_type: type,
    plaintext: '',
    markRanges: [],
    attrs: type === 'heading' ? { level: 1 } : {},
    indent: 0,
  }
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
        content: blockInlineContent(block),
      })
      i++
      continue
    }

    if (block.block_type === 'ul') {
      const items: TiptapNode[] = []
      while (i < blocks.length && blocks[i].block_type === 'ul') {
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: blockInlineContent(blocks[i]) }],
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
          content: [{ type: 'paragraph', content: blockInlineContent(blocks[i]) }],
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
          content: [{ type: 'paragraph', content: blockInlineContent(blocks[i]) }],
        })
        i++
      }
      content.push({ type: 'taskList', content: items })
      continue
    }

    if (block.block_type === 'blockquote') {
      const children: TiptapNode[] = []
      while (i < blocks.length && blocks[i].block_type === 'blockquote') {
        children.push({ type: 'paragraph', content: blockInlineContent(blocks[i]) })
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
      content: blockInlineContent(block),
    })
    i++
  }

  return { type: 'doc', content }
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
