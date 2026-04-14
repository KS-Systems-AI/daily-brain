# Skill: Tiptap Notes Editor

## Packages
```bash
pnpm add @tiptap/react @tiptap/starter-kit @tiptap/extension-placeholder
pnpm add @tiptap/extension-mention @tiptap/extension-highlight
pnpm add @tiptap/extension-task-list @tiptap/extension-task-item
```

## Base Editor
```tsx
'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { useDebouncedCallback } from 'use-debounce'

export function NoteEditor({ initialContent, onSave }) {
  const debouncedSave = useDebouncedCallback(
    (content, text) => onSave(content, text), 1500
  )
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: 'Start writing... use / for commands' }),
    ],
    content: initialContent,
    onUpdate: ({ editor }) => debouncedSave(editor.getJSON(), editor.getText()),
    editorProps: { attributes: { class: 'prose prose-sm max-w-none focus:outline-none min-h-[200px] px-4 py-3' } }
  })
  return <EditorContent editor={editor} />
}
```

## Key Rules
- Autosave debounce: 1500ms
- Store JSON (for editor) + plaintext (for search) always
- Slash commands triggered by / at start of line
- No Yjs/collaboration in Phase 1 — add later
- Mobile: simple TextInput, no Tiptap
