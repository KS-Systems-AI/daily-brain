import type { Editor, JSONContent } from '@tiptap/react'
import type { DividerVariant } from './divider-extension'

interface TopLevelBlockEntry {
  beforePos: number
  index: number
  node: JSONContent
  startPos: number
}

export function getTopLevelBlocks(editor: Editor): TopLevelBlockEntry[] {
  const doc = editor.getJSON() as JSONContent
  const content = Array.isArray(doc.content) ? doc.content : []
  const entries: TopLevelBlockEntry[] = []
  let beforePos = 0

  content.forEach((node, index) => {
    entries.push({
      index,
      node,
      beforePos,
      startPos: beforePos + 1,
    })

    beforePos += estimateNodeSize(node)
  })

  return entries
}

export function getSelectedTopLevelBlock(editor: Editor): TopLevelBlockEntry | null {
  const blocks = getTopLevelBlocks(editor)
  const selectionFrom = editor.state.selection.from

  return (
    blocks.find((block, index) => {
      const next = blocks[index + 1]
      const upperBound = next ? next.beforePos : Number.POSITIVE_INFINITY
      return selectionFrom >= block.beforePos && selectionFrom < upperBound
    }) ?? blocks[0] ?? null
  )
}

export function moveTopLevelBlock(editor: Editor, fromIndex: number, toIndex: number) {
  const doc = editor.getJSON() as JSONContent
  const content = Array.isArray(doc.content) ? [...doc.content] : []
  if (fromIndex < 0 || fromIndex >= content.length || toIndex < 0 || toIndex >= content.length) return
  if (fromIndex === toIndex) return

  const [moved] = content.splice(fromIndex, 1)
  content.splice(toIndex, 0, moved)

  editor.commands.setContent({ ...doc, content })
  focusTopLevelBlock(editor, toIndex)
}

export function duplicateTopLevelBlock(editor: Editor, index: number) {
  const doc = editor.getJSON() as JSONContent
  const content = Array.isArray(doc.content) ? [...doc.content] : []
  if (index < 0 || index >= content.length) return

  const duplicate = cloneJson(content[index])
  content.splice(index + 1, 0, duplicate)
  editor.commands.setContent({ ...doc, content })
  focusTopLevelBlock(editor, index + 1)
}

export function deleteTopLevelBlock(editor: Editor, index: number) {
  const doc = editor.getJSON() as JSONContent
  const content = Array.isArray(doc.content) ? [...doc.content] : []
  if (index < 0 || index >= content.length) return

  content.splice(index, 1)
  const nextContent = content.length > 0 ? content : [{ type: 'paragraph' }]
  editor.commands.setContent({ ...doc, content: nextContent })
  focusTopLevelBlock(editor, Math.max(0, Math.min(index, nextContent.length - 1)))
}

export function setTopLevelBlockFormat(editor: Editor, index: number, format: BlockFormat) {
  focusTopLevelBlock(editor, index)

  if (format === 'p') {
    editor.commands.setParagraph()
  } else if (format === 'h1') {
    editor.commands.setHeading({ level: 1 })
  } else if (format === 'h2') {
    editor.commands.setHeading({ level: 2 })
  } else if (format === 'h3') {
    editor.commands.setHeading({ level: 3 })
  } else if (format === 'ul') {
    editor.commands.setParagraph()
    editor.commands.toggleBulletList()
  } else if (format === 'ol') {
    editor.commands.setParagraph()
    editor.commands.toggleOrderedList()
  } else if (format === 'blockquote') {
    editor.commands.setParagraph()
    editor.commands.toggleBlockquote()
  } else if (format === 'code') {
    editor.commands.toggleCodeBlock()
  }
}

export type BlockFormat = 'blockquote' | 'code' | 'h1' | 'h2' | 'h3' | 'ol' | 'p' | 'ul'
export type BlockNodeType = BlockFormat | 'horizontalRule' | 'orderedList' | 'subNote' | 'taskList'

export function createHorizontalRuleNode(variant: DividerVariant = 'solid'): JSONContent {
  return {
    type: 'horizontalRule',
    attrs: { variant },
  }
}

export function insertHorizontalRule(editor: Editor, variant: DividerVariant = 'solid') {
  editor.commands.insertContent(createHorizontalRuleNode(variant))
}

export function setTopLevelHorizontalRuleVariant(editor: Editor, index: number, variant: DividerVariant) {
  const doc = editor.getJSON() as JSONContent
  const content = Array.isArray(doc.content) ? [...doc.content] : []
  const target = content[index]
  if (!target || target.type !== 'horizontalRule') return

  content[index] = {
    ...target,
    attrs: {
      ...target.attrs,
      variant,
    },
  }

  editor.commands.setContent({ ...doc, content })
  focusTopLevelBlock(editor, index)
}

export function insertTopLevelBlock(editor: Editor, afterIndex: number, node: JSONContent) {
  const doc = editor.getJSON() as JSONContent
  const content = Array.isArray(doc.content) ? [...doc.content] : []
  const insertionIndex = Math.max(0, Math.min(afterIndex + 1, content.length))

  content.splice(insertionIndex, 0, cloneJson(node))

  editor.commands.setContent({ ...doc, content })
  focusTopLevelBlock(editor, insertionIndex)
}

export function insertTopLevelBlockAtIndex(editor: Editor, index: number | null, node: JSONContent) {
  const doc = editor.getJSON() as JSONContent
  const content = Array.isArray(doc.content) ? [...doc.content] : []

  if (index === null || index < 0) {
    const nextContent = [cloneJson(node), ...content]
    editor.commands.setContent({ ...doc, content: nextContent })
    focusTopLevelBlock(editor, 0)
    return
  }

  const insertionIndex = Math.max(0, Math.min(index + 1, content.length))
  content.splice(insertionIndex, 0, cloneJson(node))

  editor.commands.setContent({ ...doc, content })
  focusTopLevelBlock(editor, insertionIndex)
}

export function insertBlockAfterSelection(editor: Editor, node: JSONContent) {
  const selected = getSelectedTopLevelBlock(editor)

  if (!selected) {
    editor.commands.setContent({ type: 'doc', content: [cloneJson(node)] })
    focusTopLevelBlock(editor, 0)
    return
  }

  insertTopLevelBlock(editor, selected.index, node)
}

export function getBlockPresentation(node: JSONContent): { detail: string; label: string; type: BlockNodeType } {
  switch (node.type) {
    case 'heading': {
      const level = typeof node.attrs?.level === 'number' ? node.attrs.level : 1
      return { label: `H${level}`, detail: `Überschrift ${level}`, type: `h${Math.min(3, Math.max(1, level))}` as BlockNodeType }
    }
    case 'bulletList':
      return { label: 'Liste', detail: 'Aufzählung', type: 'ul' }
    case 'orderedList':
      return { label: 'Nummeriert', detail: 'Nummerierte Liste', type: 'orderedList' }
    case 'taskList':
      return { label: 'Todo', detail: 'Checkliste', type: 'taskList' }
    case 'blockquote':
      return { label: 'Zitat', detail: 'Zitatblock', type: 'blockquote' }
    case 'codeBlock':
      return { label: 'Code', detail: 'Code-Block', type: 'code' }
    case 'horizontalRule':
      return { label: 'Linie', detail: getDividerVariantLabel(node), type: 'horizontalRule' }
    case 'subNote':
      return { label: 'Notiz', detail: 'Unternotiz', type: 'subNote' }
    default:
      return { label: 'Text', detail: 'Absatz', type: 'p' }
  }
}

export function getBlockPreviewText(node: JSONContent): string {
  if (node.type === 'horizontalRule') return getDividerVariantLabel(node)
  if (node.type === 'subNote') return String(node.attrs?.title ?? 'Unternotiz')

  const text = extractText(node).trim()
  return text || getBlockPresentation(node).detail
}

function focusTopLevelBlock(editor: Editor, index: number) {
  const blocks = getTopLevelBlocks(editor)
  const target = blocks[index]
  if (!target) return

  requestAnimationFrame(() => {
    editor.commands.setTextSelection(target.startPos)
    editor.commands.focus()
  })
}

function estimateNodeSize(node: JSONContent): number {
  let size = 2

  if (typeof node.text === 'string') {
    size += node.text.length
  }

  if (Array.isArray(node.content)) {
    size += node.content.reduce((sum, child) => sum + estimateNodeSize(child), 0)
  }

  return size
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function extractText(node: JSONContent): string {
  let text = typeof node.text === 'string' ? node.text : ''

  if (Array.isArray(node.content)) {
    text += node.content.map(extractText).join(' ')
  }

  return text
}

function getDividerVariantLabel(node: JSONContent): string {
  switch (node.attrs?.variant) {
    case 'thick':
      return 'Dicke Trennlinie'
    case 'dashed':
      return 'Gestrichelte Trennlinie'
    case 'dotted':
      return 'Gepunktete Trennlinie'
    default:
      return 'Trennlinie'
  }
}
