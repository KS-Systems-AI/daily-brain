'use client'

import { useEffect, useState } from 'react'
import { Editor } from '@tiptap/react'
import {
  Type,
  Heading1,
  Heading2,
  Heading3,
  List,
  Quote,
  Code,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import {
  deleteTopLevelBlock,
  duplicateTopLevelBlock,
  getTopLevelBlocks,
  moveTopLevelBlock,
  setTopLevelBlockFormat,
} from './block-operations'

interface BlockContextMenuProps {
  editor: Editor
}

export function BlockContextMenu({ editor }: BlockContextMenuProps) {
  const [menu, setMenu] = useState<{ pos: number; x: number; y: number } | null>(null)

  useEffect(() => {
    const handleContextMenu = (e: Event) => {
      const evt = e as CustomEvent<{ pos: number; clientX: number; clientY: number }>
      setMenu({ pos: evt.detail.pos, x: evt.detail.clientX, y: evt.detail.clientY })
    }

    window.addEventListener('block:contextmenu', handleContextMenu)
    return () => window.removeEventListener('block:contextmenu', handleContextMenu)
  }, [])

  useEffect(() => {
    const handleClick = () => setMenu(null)
    if (menu) {
      document.addEventListener('click', handleClick)
      return () => document.removeEventListener('click', handleClick)
    }
  }, [menu])

  if (!menu || !editor) return null

  const topLevelBlocks = getTopLevelBlocks(editor)
  const blockIndex = topLevelBlocks.findIndex((block) => block.beforePos === menu.pos)

  const handleFormat = (format: string) => {
    if (blockIndex < 0) return
    setTopLevelBlockFormat(editor, blockIndex, format as Parameters<typeof setTopLevelBlockFormat>[2])
    setMenu(null)
  }

  const handleDelete = () => {
    if (blockIndex < 0) return
    deleteTopLevelBlock(editor, blockIndex)
    setMenu(null)
  }

  const handleDuplicate = () => {
    if (blockIndex < 0) return
    duplicateTopLevelBlock(editor, blockIndex)
    setMenu(null)
  }

  const handleMove = (direction: 'up' | 'down') => {
    if (blockIndex < 0) return
    const targetIndex = direction === 'up' ? blockIndex - 1 : blockIndex + 1
    if (targetIndex < 0 || targetIndex >= topLevelBlocks.length) return
    moveTopLevelBlock(editor, blockIndex, targetIndex)
    setMenu(null)
  }

  return (
    <div
      className="fixed z-50 min-w-[180px] rounded-lg border border-gray-200 bg-white shadow-lg py-1"
      style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="border-b border-gray-100">
        <p className="px-3 py-2 text-xs font-semibold uppercase text-gray-500">Format</p>
        <button
          onClick={() => handleFormat('p')}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          <Type size={16} />
          Text
        </button>
        <button
          onClick={() => handleFormat('h1')}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          <Heading1 size={16} />
          H1
        </button>
        <button
          onClick={() => handleFormat('h2')}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          <Heading2 size={16} />
          H2
        </button>
        <button
          onClick={() => handleFormat('h3')}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          <Heading3 size={16} />
          H3
        </button>
        <button
          onClick={() => handleFormat('ul')}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          <List size={16} />
          List
        </button>
        <button
          onClick={() => handleFormat('blockquote')}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          <Quote size={16} />
          Quote
        </button>
        <button
          onClick={() => handleFormat('code')}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          <Code size={16} />
          Code
        </button>
      </div>

      <div className="border-b border-gray-100">
        <button
          onClick={handleDuplicate}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          <Copy size={16} />
          Duplicate
        </button>
        <button
          onClick={() => handleMove('up')}
          disabled={blockIndex <= 0}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowUp size={16} />
          Nach oben
        </button>
        <button
          onClick={() => handleMove('down')}
          disabled={blockIndex < 0 || blockIndex >= topLevelBlocks.length - 1}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowDown size={16} />
          Nach unten
        </button>
      </div>

      <div>
        <button
          onClick={handleDelete}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
        >
          <Trash2 size={16} />
          Delete
        </button>
      </div>
    </div>
  )
}
