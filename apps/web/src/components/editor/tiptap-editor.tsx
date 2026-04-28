'use client'

import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Highlight from '@tiptap/extension-highlight'
import Typography from '@tiptap/extension-typography'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Underline from '@tiptap/extension-underline'
import { SlashCommands, SlashCommandMenu } from './slash-commands'
import { SubNoteExtension } from './sub-note-node'
import { cn } from '@/lib/utils'
import {
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Link as LinkIcon,
  Minus,
  Undo2,
  Redo2,
  Underline as UnderlineIcon,
} from 'lucide-react'

interface TiptapEditorProps {
  content: Record<string, unknown>
  onChange: (content: Record<string, unknown>) => void
  placeholder?: string
  onEditorReady?: (editor: { getJSON: () => Record<string, unknown> }) => void
}

export function TiptapEditor({ content, onChange, placeholder = 'Schreib etwas oder drücke / für Befehle...', onEditorReady }: TiptapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true },
      }),
      Placeholder.configure({ placeholder }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      Typography,
      Image,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      Underline,
      SlashCommands,
      SubNoteExtension,
    ],
    content,
    onUpdate: ({ editor: e }) => {
      onChange(e.getJSON() as Record<string, unknown>)
    },
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'tiptap min-h-[200px] text-[14px] leading-normal focus:outline-none',
      },
    },
  })

  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady({ getJSON: () => editor.getJSON() as Record<string, unknown> })
    }
  }, [editor, onEditorReady])

  if (!editor) return null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-10 mx-auto w-full max-w-2xl border-b border-border/40 bg-background px-6 py-2">
        <div className="flex flex-wrap items-center gap-0.5">
          <ToolbarGroup>
            <ToolbarButton
              active={editor.isActive('heading', { level: 1 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              title="Überschrift 1"
            >
              <Heading1 size={14} />
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive('heading', { level: 2 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              title="Überschrift 2"
            >
              <Heading2 size={14} />
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive('heading', { level: 3 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              title="Überschrift 3"
            >
              <Heading3 size={14} />
            </ToolbarButton>
          </ToolbarGroup>

          <ToolbarDivider />

          <ToolbarGroup>
            <ToolbarButton
              active={editor.isActive('bold')}
              onClick={() => editor.chain().focus().toggleBold().run()}
              title="Fett"
            >
              <Bold size={14} />
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive('italic')}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              title="Kursiv"
            >
              <Italic size={14} />
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive('underline')}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              title="Unterstrichen"
            >
              <UnderlineIcon size={14} />
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive('strike')}
              onClick={() => editor.chain().focus().toggleStrike().run()}
              title="Durchgestrichen"
            >
              <Strikethrough size={14} />
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive('code')}
              onClick={() => editor.chain().focus().toggleCode().run()}
              title="Code"
            >
              <Code2 size={14} />
            </ToolbarButton>
          </ToolbarGroup>

          <ToolbarDivider />

          <ToolbarGroup>
            <ToolbarButton
              active={editor.isActive('bulletList')}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              title="Aufzählung"
            >
              <List size={14} />
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive('orderedList')}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              title="Nummerierte Liste"
            >
              <ListOrdered size={14} />
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive('taskList')}
              onClick={() => editor.chain().focus().toggleTaskList().run()}
              title="Aufgabenliste"
            >
              <CheckSquare size={14} />
            </ToolbarButton>
          </ToolbarGroup>

          <ToolbarDivider />

          <ToolbarGroup>
            <ToolbarButton
              active={editor.isActive('blockquote')}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              title="Zitat"
            >
              <Quote size={14} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
              title="Trennlinie"
            >
              <Minus size={14} />
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive('link')}
              onClick={() => {
                const url = window.prompt('URL')
                if (url) editor.chain().focus().setLink({ href: url }).run()
              }}
              title="Link"
            >
              <LinkIcon size={14} />
            </ToolbarButton>
          </ToolbarGroup>

          <div className="flex-1" />

          <ToolbarGroup>
            <ToolbarButton
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
              title="Rückgängig"
            >
              <Undo2 size={14} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
              title="Wiederholen"
            >
              <Redo2 size={14} />
            </ToolbarButton>
          </ToolbarGroup>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-4">
          <EditorContent editor={editor} />
          <SlashCommandMenu editor={editor} />
        </div>
      </div>
    </div>
  )
}

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>
}

function ToolbarDivider() {
  return <div className="mx-1 h-4 w-px bg-border/60" />
}

function ToolbarButton({
  children,
  active,
  disabled,
  onClick,
  title,
}: {
  children: React.ReactNode
  active?: boolean
  disabled?: boolean
  onClick?: () => void
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'rounded p-1.5 transition-colors',
        active
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground/60 hover:bg-accent/60 hover:text-foreground',
        disabled && 'cursor-not-allowed opacity-30',
      )}
    >
      {children}
    </button>
  )
}
