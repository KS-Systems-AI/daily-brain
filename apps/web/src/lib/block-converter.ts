/**
 * Converts between Tiptap's ProseMirror JSON and the block-based storage format
 * inspired by Attio's note structure.
 *
 * Block format (DB):
 *   { id, block_type, plaintext, styles, sort_order, indent, attrs }
 *
 * Tiptap JSON:
 *   { type: 'doc', content: [ { type: 'paragraph', content: [...] }, ... ] }
 */

// ─── Types ───────────────────────────────────────────────────

export interface NoteBlockData {
  id: string
  block_type: string
  plaintext: string
  styles: StyleSpan[]
  sort_order: string
  indent: number
  attrs: Record<string, unknown>
}

export interface StyleSpan {
  start: number
  length: number
  style: string
}

interface TiptapNode {
  type: string
  content?: TiptapNode[]
  text?: string
  marks?: TiptapMark[]
  attrs?: Record<string, unknown>
}

interface TiptapMark {
  type: string
  attrs?: Record<string, unknown>
}

// ─── Sort order helpers (fractional indexing with base-36 strings) ────

const MID_CHAR = 'n'
const SORT_PAD = 10

export function generateSortOrder(index: number, total: number): string {
  const fraction = (index + 1) / (total + 1)
  return fraction
    .toFixed(SORT_PAD)
    .replace('0.', '')
    .split('')
    .map((d) => String.fromCharCode(97 + parseInt(d, 10)))
    .join('')
}

export function midSortOrder(before: string | null, after: string | null): string {
  const a = before ?? 'a'.repeat(SORT_PAD)
  const b = after ?? 'z'.repeat(SORT_PAD)
  let result = ''
  for (let i = 0; i < Math.max(a.length, b.length, SORT_PAD); i++) {
    const ca = a.charCodeAt(i) || 97
    const cb = b.charCodeAt(i) || 123
    if (ca < cb - 1) {
      result += String.fromCharCode(Math.floor((ca + cb) / 2))
      return result.padEnd(SORT_PAD, MID_CHAR)
    }
    result += String.fromCharCode(ca)
  }
  return result + MID_CHAR
}

// ─── Tiptap JSON -> Blocks ──────────────────────────────────

const TIPTAP_TO_BLOCK_TYPE: Record<string, string> = {
  paragraph: 'unstyled',
  heading: 'heading',
  bulletList: 'ul',
  orderedList: 'ol',
  taskList: 'task_list',
  listItem: 'li',
  taskItem: 'task_item',
  blockquote: 'blockquote',
  codeBlock: 'code_block',
  horizontalRule: 'hr',
  image: 'image',
}

function extractTextAndStyles(nodes: TiptapNode[] | undefined): {
  plaintext: string
  styles: StyleSpan[]
} {
  if (!nodes) return { plaintext: '', styles: [] }

  let plaintext = ''
  const styles: StyleSpan[] = []

  for (const node of nodes) {
    if (node.type === 'text' && node.text) {
      const start = plaintext.length
      plaintext += node.text
      if (node.marks) {
        for (const mark of node.marks) {
          let styleName = mark.type
          if (mark.type === 'link' && mark.attrs?.href) {
            styleName = `link:${mark.attrs.href}`
          } else if (mark.type === 'textStyle' && mark.attrs?.color) {
            styleName = `color:${mark.attrs.color}`
          }
          styles.push({ start, length: node.text.length, style: styleName })
        }
      }
    } else if (node.type === 'hardBreak') {
      plaintext += '\n'
    }
  }

  return { plaintext, styles }
}

function flattenListItems(
  node: TiptapNode,
  blockType: string,
  indent: number,
  blocks: NoteBlockData[],
): void {
  const children = node.content ?? []
  for (const child of children) {
    if (child.type === 'listItem' || child.type === 'taskItem') {
      const itemContent = child.content ?? []
      for (const inner of itemContent) {
        if (inner.type === 'paragraph') {
          const { plaintext, styles } = extractTextAndStyles(inner.content)
          const itemBlockType =
            child.type === 'taskItem' ? 'task_item' : blockType === 'ol' ? 'ol' : 'ul'
          const attrs: Record<string, unknown> = {}
          if (child.type === 'taskItem') {
            attrs.checked = child.attrs?.checked ?? false
          }
          blocks.push({
            id: crypto.randomUUID(),
            block_type: itemBlockType,
            plaintext,
            styles,
            sort_order: generateSortOrder(blocks.length, blocks.length + 10),
            indent,
            attrs,
          })
        } else if (
          inner.type === 'bulletList' ||
          inner.type === 'orderedList' ||
          inner.type === 'taskList'
        ) {
          const nestedType =
            inner.type === 'orderedList' ? 'ol' : inner.type === 'taskList' ? 'task_list' : 'ul'
          flattenListItems(inner, nestedType, indent + 1, blocks)
        }
      }
    }
  }
}

export function tiptapJsonToBlocks(doc: TiptapNode): NoteBlockData[] {
  if (!doc.content) return []

  const blocks: NoteBlockData[] = []

  for (const node of doc.content) {
    const mappedType = TIPTAP_TO_BLOCK_TYPE[node.type]

    if (node.type === 'bulletList' || node.type === 'orderedList' || node.type === 'taskList') {
      const blockType = node.type === 'orderedList' ? 'ol' : node.type === 'taskList' ? 'task_list' : 'ul'
      flattenListItems(node, blockType, 0, blocks)
      continue
    }

    if (node.type === 'blockquote') {
      const innerContent = node.content ?? []
      for (const inner of innerContent) {
        const { plaintext, styles } = extractTextAndStyles(inner.content)
        blocks.push({
          id: crypto.randomUUID(),
          block_type: 'blockquote',
          plaintext,
          styles,
          sort_order: generateSortOrder(blocks.length, blocks.length + 10),
          indent: 0,
          attrs: {},
        })
      }
      continue
    }

    if (node.type === 'horizontalRule') {
      blocks.push({
        id: crypto.randomUUID(),
        block_type: 'hr',
        plaintext: '',
        styles: [],
        sort_order: generateSortOrder(blocks.length, blocks.length + 10),
        indent: 0,
        attrs: {},
      })
      continue
    }

    if (node.type === 'image') {
      blocks.push({
        id: crypto.randomUUID(),
        block_type: 'image',
        plaintext: '',
        styles: [],
        sort_order: generateSortOrder(blocks.length, blocks.length + 10),
        indent: 0,
        attrs: { src: node.attrs?.src, alt: node.attrs?.alt, title: node.attrs?.title },
      })
      continue
    }

    const { plaintext, styles } = extractTextAndStyles(node.content)
    const attrs: Record<string, unknown> = {}
    if (node.type === 'heading') {
      attrs.level = node.attrs?.level ?? 1
    }
    if (node.type === 'codeBlock') {
      attrs.language = node.attrs?.language ?? null
    }

    blocks.push({
      id: crypto.randomUUID(),
      block_type: mappedType ?? 'unstyled',
      plaintext,
      styles,
      sort_order: generateSortOrder(blocks.length, blocks.length + 10),
      indent: 0,
      attrs,
    })
  }

  return blocks
}

// ─── Blocks -> Tiptap JSON ──────────────────────────────────

const BLOCK_TO_TIPTAP_TYPE: Record<string, string> = {
  unstyled: 'paragraph',
  heading: 'heading',
  blockquote: 'blockquote',
  code_block: 'codeBlock',
  hr: 'horizontalRule',
  image: 'image',
}

function applyStylesToText(plaintext: string, styles: StyleSpan[]): TiptapNode[] {
  if (!plaintext && styles.length === 0) return []
  if (!plaintext) return [{ type: 'text', text: '' }]
  if (styles.length === 0) return [{ type: 'text', text: plaintext }]

  const sorted = [...styles].sort((a, b) => a.start - b.start || a.length - b.length)

  const boundaries = new Set<number>()
  boundaries.add(0)
  boundaries.add(plaintext.length)
  for (const s of sorted) {
    boundaries.add(s.start)
    boundaries.add(s.start + s.length)
  }
  const points = Array.from(boundaries).sort((a, b) => a - b)

  const nodes: TiptapNode[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i]
    const end = points[i + 1]
    const text = plaintext.slice(start, end)
    if (!text) continue

    const marks: TiptapMark[] = []
    for (const s of sorted) {
      if (s.start <= start && s.start + s.length >= end) {
        if (s.style.startsWith('link:')) {
          marks.push({ type: 'link', attrs: { href: s.style.slice(5) } })
        } else if (s.style.startsWith('color:')) {
          marks.push({ type: 'textStyle', attrs: { color: s.style.slice(6) } })
        } else {
          marks.push({ type: s.style })
        }
      }
    }

    nodes.push(marks.length > 0 ? { type: 'text', text, marks } : { type: 'text', text })
  }

  return nodes
}

export function blocksToTiptapJson(blocks: NoteBlockData[]): TiptapNode {
  const sorted = [...blocks].sort((a, b) => a.sort_order.localeCompare(b.sort_order))

  const content: TiptapNode[] = []
  let i = 0

  while (i < sorted.length) {
    const block = sorted[i]

    if (block.block_type === 'hr') {
      content.push({ type: 'horizontalRule' })
      i++
      continue
    }

    if (block.block_type === 'image') {
      content.push({
        type: 'image',
        attrs: {
          src: (block.attrs as Record<string, unknown>)?.src ?? '',
          alt: (block.attrs as Record<string, unknown>)?.alt ?? null,
          title: (block.attrs as Record<string, unknown>)?.title ?? null,
        },
      })
      i++
      continue
    }

    if (block.block_type === 'blockquote') {
      const quoteChildren: TiptapNode[] = []
      while (i < sorted.length && sorted[i].block_type === 'blockquote') {
        const textNodes = applyStylesToText(sorted[i].plaintext, sorted[i].styles)
        quoteChildren.push({
          type: 'paragraph',
          content: textNodes.length > 0 ? textNodes : undefined,
        })
        i++
      }
      content.push({ type: 'blockquote', content: quoteChildren })
      continue
    }

    if (block.block_type === 'ul' || block.block_type === 'ol' || block.block_type === 'task_item') {
      const listType = block.block_type === 'ol' ? 'orderedList' : block.block_type === 'task_item' ? 'taskList' : 'bulletList'
      const listItems: TiptapNode[] = []

      while (
        i < sorted.length &&
        (sorted[i].block_type === 'ul' ||
          sorted[i].block_type === 'ol' ||
          sorted[i].block_type === 'task_item') &&
        sorted[i].indent === block.indent
      ) {
        const item = sorted[i]
        const textNodes = applyStylesToText(item.plaintext, item.styles)
        const paragraph: TiptapNode = {
          type: 'paragraph',
          content: textNodes.length > 0 ? textNodes : undefined,
        }

        if (item.block_type === 'task_item') {
          listItems.push({
            type: 'taskItem',
            attrs: { checked: (item.attrs as Record<string, unknown>)?.checked ?? false },
            content: [paragraph],
          })
        } else {
          listItems.push({ type: 'listItem', content: [paragraph] })
        }
        i++
      }

      content.push({ type: listType, content: listItems })
      continue
    }

    if (block.block_type === 'heading') {
      const textNodes = applyStylesToText(block.plaintext, block.styles)
      content.push({
        type: 'heading',
        attrs: { level: (block.attrs as Record<string, unknown>)?.level ?? 1 },
        content: textNodes.length > 0 ? textNodes : undefined,
      })
      i++
      continue
    }

    if (block.block_type === 'code_block') {
      content.push({
        type: 'codeBlock',
        attrs: { language: (block.attrs as Record<string, unknown>)?.language ?? null },
        content: block.plaintext ? [{ type: 'text', text: block.plaintext }] : undefined,
      })
      i++
      continue
    }

    // Default: paragraph / unstyled
    const textNodes = applyStylesToText(block.plaintext, block.styles)
    content.push({
      type: 'paragraph',
      content: textNodes.length > 0 ? textNodes : undefined,
    })
    i++
  }

  return { type: 'doc', content }
}
