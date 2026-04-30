'use client'

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc/provider'

interface HeadingItem {
  id: string
  text: string
  level: number
  pos: number
}

interface CraftOutlineSidebarProps {
  noteId: string
}

export function NoteOutlineSidebar({ noteId }: CraftOutlineSidebarProps) {
  const [headings, setHeadings] = useState<HeadingItem[]>([])
  const { data: note } = trpc.notes.getById.useQuery({ id: noteId }, { refetchOnWindowFocus: false })

  useEffect(() => {
    if (!note) return

    const extractHeadings = () => {
      const content = note.tiptap_content as Record<string, unknown> | undefined
      if (!content || typeof content !== 'object') {
        setHeadings([])
        return
      }

      const doc = content as {
        content?: Array<{
          type?: string
          attrs?: Record<string, unknown>
          content?: Array<{ type?: string; text?: string }>
        }>
      }

      const extracted: HeadingItem[] = []
      let pos = 0

      if (Array.isArray(doc.content)) {
        doc.content.forEach((node) => {
          if (node.type === 'heading' && Array.isArray(node.content)) {
            const level = (node.attrs?.level as number) || 1
            const text = node.content.map((c) => c.text || '').join('')
            if (text.trim()) {
              extracted.push({
                id: `heading-${pos}`,
                text,
                level,
                pos,
              })
            }
          }
          pos++
        })
      }

      setHeadings(extracted)
    }

    extractHeadings()
  }, [note])

  return (
    <div className="p-4">
      <h3 className="text-[11px] font-semibold uppercase text-muted-foreground mb-3">Outline</h3>
      {headings.length === 0 ? (
        <p className="text-[12px] text-muted-foreground/60">No headings yet</p>
      ) : (
        <nav className="space-y-1">
          {headings.map((heading) => (
            <button
              key={heading.id}
              onClick={() => {
                // Scroll to heading (implementation in Phase 2 with scroll-into-view)
              }}
              className={`block w-full text-left px-2 py-1.5 rounded-md text-[13px] transition-colors hover:bg-muted ${
                heading.level === 1 ? 'font-semibold' : heading.level === 2 ? 'font-medium ml-3' : 'font-normal ml-6 text-muted-foreground'
              }`}
            >
              {heading.text}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
