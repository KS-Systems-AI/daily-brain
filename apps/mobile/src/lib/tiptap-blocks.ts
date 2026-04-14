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
function uid(): string {
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
        attrs: { level: node.attrs?.level ?? 1 },
        indent: 0,
      })
    } else if (node.type === 'bulletList') {
      for (const item of node.content ?? []) {
        blocks.push({
          id: uid(),
          block_type: 'ul',
          plaintext: extractText(item.content?.[0]?.content),
          attrs: {},
          indent: 0,
        })
      }
    } else if (node.type === 'orderedList') {
      for (const item of node.content ?? []) {
        blocks.push({
          id: uid(),
          block_type: 'ol',
          plaintext: extractText(item.content?.[0]?.content),
          attrs: {},
          indent: 0,
        })
      }
    } else if (node.type === 'taskList') {
      for (const item of node.content ?? []) {
        blocks.push({
          id: uid(),
          block_type: 'task_item',
          plaintext: extractText(item.content?.[0]?.content),
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
          attrs: {},
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
        attrs: {},
        indent: 0,
      })
    }
  }

  return blocks.length > 0 ? blocks : [emptyBlock()]
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

export function blocksToTiptap(blocks: EditorBlock[]): TiptapNode {
  const content: TiptapNode[] = []
  let i = 0

  while (i < blocks.length) {
    const block = blocks[i]

    if (block.block_type === 'heading') {
      content.push({
        type: 'heading',
        attrs: { level: (block.attrs.level as number) ?? 1 },
        content: textToInline(block.plaintext),
      })
      i++
      continue
    }

    if (block.block_type === 'ul') {
      const items: TiptapNode[] = []
      while (i < blocks.length && blocks[i].block_type === 'ul') {
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: textToInline(blocks[i].plaintext) }],
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
          content: [{ type: 'paragraph', content: textToInline(blocks[i].plaintext) }],
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
          content: [{ type: 'paragraph', content: textToInline(blocks[i].plaintext) }],
        })
        i++
      }
      content.push({ type: 'taskList', content: items })
      continue
    }

    if (block.block_type === 'blockquote') {
      const children: TiptapNode[] = []
      while (i < blocks.length && blocks[i].block_type === 'blockquote') {
        children.push({ type: 'paragraph', content: textToInline(blocks[i].plaintext) })
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

    if (block.block_type === 'hr') {
      content.push({ type: 'horizontalRule' })
      i++
      continue
    }

    content.push({
      type: 'paragraph',
      content: textToInline(block.plaintext),
    })
    i++
  }

  return { type: 'doc', content }
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
