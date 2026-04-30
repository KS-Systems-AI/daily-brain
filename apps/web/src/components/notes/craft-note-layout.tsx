'use client'

import { ReactNode } from 'react'
import { NoteOutlineSidebar } from './note-outline-sidebar'

interface CraftNoteLayoutProps {
  noteId: string
  children: ReactNode
}

export function CraftNoteLayout({ noteId, children }: CraftNoteLayoutProps) {
  return (
    <div className="flex h-full w-full overflow-hidden bg-[radial-gradient(circle_at_top,_#F8FBFF_0%,_#F4F6F8_44%,_#EEF2F6_100%)]">
      {/* Left Outline Sidebar */}
      <div className="w-[220px] shrink-0 overflow-y-auto border-r border-[#E7ECF2] bg-white/78 backdrop-blur">
        <NoteOutlineSidebar noteId={noteId} />
      </div>

      {/* Center Editor Canvas */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-3 my-4 md:mx-6 md:my-8">
          {children}
        </div>
      </div>

      {/* Right Gutter (empty for future use) */}
      <div className="hidden w-[96px] shrink-0 border-l border-[#E7ECF2] bg-white/58 backdrop-blur lg:block" />
    </div>
  )
}
