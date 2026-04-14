'use client'

import { Extension } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code2,
  Minus,
  type LucideIcon,
} from 'lucide-react'
import type { Editor } from '@tiptap/react'

interface SlashCommandItem {
  title: string
  description: string
  icon: LucideIcon
  command: (editor: Editor) => void
}

const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    title: 'Überschrift 1',
    description: 'Große Überschrift',
    icon: Heading1,
    command: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    title: 'Überschrift 2',
    description: 'Mittlere Überschrift',
    icon: Heading2,
    command: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    title: 'Überschrift 3',
    description: 'Kleine Überschrift',
    icon: Heading3,
    command: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    title: 'Aufzählung',
    description: 'Einfache Liste mit Punkten',
    icon: List,
    command: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    title: 'Nummerierte Liste',
    description: 'Liste mit Nummern',
    icon: ListOrdered,
    command: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    title: 'Aufgabenliste',
    description: 'Liste mit Checkboxen',
    icon: CheckSquare,
    command: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    title: 'Zitat',
    description: 'Eingerücktes Zitat',
    icon: Quote,
    command: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    title: 'Code-Block',
    description: 'Code mit Syntax-Highlighting',
    icon: Code2,
    command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    title: 'Trennlinie',
    description: 'Horizontale Linie einfügen',
    icon: Minus,
    command: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
]

const slashPluginKey = new PluginKey('slash-commands')

export const SlashCommands = Extension.create({
  name: 'slashCommands',

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: slashPluginKey,
        state: {
          init: () => ({ active: false, query: '', from: 0 }),
          apply(tr, prev) {
            const meta = tr.getMeta(slashPluginKey)
            if (meta) return meta
            if (prev.active) {
              const { from } = prev
              const $pos = tr.doc.resolve(tr.selection.from)
              const text = $pos.parent.textContent
              const nodeStart = tr.selection.from - $pos.parentOffset
              const slashIndex = from - nodeStart
              if (tr.selection.from < from || slashIndex < 0) {
                return { active: false, query: '', from: 0 }
              }
              const query = text.slice(slashIndex, tr.selection.from - nodeStart)
              if (query.startsWith('/')) {
                return { active: true, query: query.slice(1), from }
              }
              return { active: false, query: '', from: 0 }
            }
            return prev
          },
        },
        props: {
          handleKeyDown(view, event) {
            if (event.key === '/') {
              const { $from } = view.state.selection
              const textBefore = $from.parent.textContent.slice(0, $from.parentOffset)
              if (textBefore === '' || textBefore.endsWith(' ')) {
                const slashPos = $from.pos
                setTimeout(() => {
                  view.dispatch(
                    view.state.tr.setMeta(slashPluginKey, {
                      active: true,
                      query: '',
                      from: slashPos,
                    }),
                  )
                }, 0)
              }
            }
            if (event.key === 'Escape') {
              const state = slashPluginKey.getState(view.state)
              if (state?.active) {
                view.dispatch(
                  view.state.tr.setMeta(slashPluginKey, {
                    active: false,
                    query: '',
                    from: 0,
                  }),
                )
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

export function SlashCommandMenu({ editor }: { editor: Editor }) {
  const [active, setActive] = useState(false)
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)

  const filtered = SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.title.toLowerCase().includes(query.toLowerCase()) ||
      cmd.description.toLowerCase().includes(query.toLowerCase()),
  )

  useEffect(() => {
    const update = () => {
      const state = slashPluginKey.getState(editor.state)
      if (!state) return
      setActive(state.active)
      setQuery(state.query)
      if (state.active) {
        const coords = editor.view.coordsAtPos(state.from)
        setPosition({ top: coords.bottom + 4, left: coords.left })
        setSelectedIndex(0)
      }
    }

    editor.on('transaction', update)
    return () => {
      editor.off('transaction', update)
    }
  }, [editor])

  const executeCommand = useCallback(
    (index: number) => {
      const cmd = filtered[index]
      if (!cmd) return

      const state = slashPluginKey.getState(editor.state)
      if (state?.active) {
        const from = state.from
        const to = editor.state.selection.from
        editor.chain().focus().deleteRange({ from, to }).run()
      }

      editor.view.dispatch(
        editor.state.tr.setMeta(slashPluginKey, {
          active: false,
          query: '',
          from: 0,
        }),
      )

      cmd.command(editor)
    },
    [editor, filtered],
  )

  useEffect(() => {
    if (!active) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => (i + 1) % filtered.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        executeCommand(selectedIndex)
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [active, selectedIndex, filtered.length, executeCommand])

  if (!active || filtered.length === 0 || !position) return null

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[220px] max-h-[300px] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
      style={{ top: position.top, left: position.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {filtered.map((cmd, i) => {
        const Icon = cmd.icon
        return (
          <button
            key={cmd.title}
            onMouseDown={(e) => {
              e.preventDefault()
              executeCommand(i)
            }}
            onMouseEnter={() => setSelectedIndex(i)}
            className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors ${
              i === selectedIndex ? 'bg-accent text-accent-foreground' : 'text-popover-foreground'
            }`}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background">
              <Icon size={15} className="text-muted-foreground" />
            </div>
            <div>
              <p className="text-[13px] font-medium leading-tight">{cmd.title}</p>
              <p className="text-[11px] text-muted-foreground/60">{cmd.description}</p>
            </div>
          </button>
        )
      })}
    </div>,
    document.body,
  )
}
