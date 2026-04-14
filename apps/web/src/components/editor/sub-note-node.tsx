'use client'

import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type ReactNodeViewProps,
} from '@tiptap/react'
import { FileText, ChevronRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc/provider'
import { useEditorNote } from './editor-context'

const subNoteRemoveKey = new PluginKey('sub-note-remove')

function SubNoteComponent({ node }: ReactNodeViewProps) {
  const router = useRouter()
  const { noteId } = node.attrs as { noteId: string; title: string }

  const { data } = trpc.notes.getById.useQuery(
    { id: noteId },
    { enabled: !!noteId, refetchOnWindowFocus: false },
  )

  const displayTitle = data?.title || node.attrs.title || 'Ohne Titel'

  return (
    <NodeViewWrapper className="my-2" data-sub-note>
      <button
        type="button"
        onClick={() => router.push(`/notes/${noteId}`)}
        contentEditable={false}
        className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-3.5 py-2.5 text-left transition-colors hover:bg-muted"
      >
        <FileText size={15} className="shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-[13px] font-medium text-foreground">
          {displayTitle}
        </span>
        <ChevronRight size={14} className="shrink-0 text-muted-foreground/50" />
      </button>
    </NodeViewWrapper>
  )
}

let removeHandler: ((noteId: string) => void) | null = null

export function setSubNoteRemoveHandler(handler: ((noteId: string) => void) | null) {
  removeHandler = handler
}

export const SubNoteExtension = Node.create({
  name: 'subNote',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      noteId: { default: null },
      title: { default: 'Ohne Titel' },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-sub-note]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-sub-note': '' }, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(SubNoteComponent)
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: subNoteRemoveKey,
        props: {
          handleKeyDown(view, event) {
            if (event.key !== 'Backspace' && event.key !== 'Delete') return false

            const { state } = view
            const { selection } = state
            const { $from } = selection

            if (selection.empty) {
              let nodeToCheck: { node: typeof state.doc | null; pos: number } = { node: null, pos: -1 }

              if (event.key === 'Backspace' && $from.nodeBefore?.type.name === 'subNote') {
                nodeToCheck = { node: $from.nodeBefore, pos: $from.pos - $from.nodeBefore.nodeSize }
              } else if (event.key === 'Delete' && $from.nodeAfter?.type.name === 'subNote') {
                nodeToCheck = { node: $from.nodeAfter, pos: $from.pos }
              }

              if (nodeToCheck.node && removeHandler) {
                const noteId = nodeToCheck.node.attrs.noteId as string
                if (noteId) {
                  event.preventDefault()
                  removeHandler(noteId)
                  return true
                }
              }
            }

            // Node selection (user clicked/selected the atom node directly)
            if ('node' in selection && (selection as { node: { type: { name: string }; attrs: Record<string, unknown> } }).node?.type.name === 'subNote') {
              const subNode = (selection as { node: { attrs: Record<string, unknown> } }).node
              const noteId = subNode.attrs.noteId as string
              if (noteId && removeHandler) {
                event.preventDefault()
                removeHandler(noteId)
                return true
              }
            }

            return false
          },
        },
      }),
    ]
  },
})
