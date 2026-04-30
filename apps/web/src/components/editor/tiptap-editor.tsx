'use client'

import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
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
import { DragHandleExtension } from './drag-handle-extension'
import { BlockContextMenu } from './block-context-menu'
import { DividerExtension, type DividerVariant } from './divider-extension'
import { useEditorNote } from './editor-context'
import { cn } from '@/lib/utils'
import {
  AlignLeft,
  Bold,
  CheckSquare,
  Copy,
  Code2,
  Heading1,
  Heading2,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Sparkles,
  Strikethrough,
  TextCursorInput,
  Trash2,
  UnderlineIcon,
  ArrowUp,
  ArrowDown,
  Grip,
  MoreHorizontal,
} from 'lucide-react'
import {
  createHorizontalRuleNode,
  deleteTopLevelBlock,
  duplicateTopLevelBlock,
  getBlockPresentation,
  getBlockPreviewText,
  getSelectedTopLevelBlock,
  getTopLevelBlocks,
  insertBlockAfterSelection,
  insertHorizontalRule,
  insertTopLevelBlockAtIndex,
  moveTopLevelBlock,
  setTopLevelBlockFormat,
  setTopLevelHorizontalRuleVariant,
} from './block-operations'

interface TiptapEditorProps {
  content: Record<string, unknown>
  onChange: (content: Record<string, unknown>) => void
  placeholder?: string
  onEditorReady?: (editor: { getJSON: () => Record<string, unknown> }) => void
}

export function TiptapEditor({
  content,
  onChange,
  placeholder = 'Schreib etwas oder drücke / für Befehle...',
  onEditorReady,
}: TiptapEditorProps) {
  const editorNote = useEditorNote()
  const editorShellRef = useRef<HTMLDivElement>(null)
  const [renderTick, setRenderTick] = useState(0)
  const [dragState, setDragState] = useState<{
    fromIndex: number | null
    targetSlot: number | null
    previewText: string
  }>({ fromIndex: null, targetSlot: null, previewText: '' })
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        horizontalRule: false,
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
      DividerExtension,
      SlashCommands,
      SubNoteExtension,
      DragHandleExtension,
    ],
    content,
    onUpdate: ({ editor: e }) => {
      onChange(e.getJSON() as Record<string, unknown>)
    },
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'craft-editor focus:outline-none',
      },
    },
  })

  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady({ getJSON: () => editor.getJSON() as Record<string, unknown> })
    }
  }, [editor, onEditorReady])

  useEffect(() => {
    if (!editor) return

    const rerender = () => setRenderTick((v) => v + 1)
    editor.on('selectionUpdate', rerender)
    editor.on('transaction', rerender)

    return () => {
      editor.off('selectionUpdate', rerender)
      editor.off('transaction', rerender)
    }
  }, [editor])

  if (!editor) return null

  const selectedBlock = getSelectedTopLevelBlock(editor)
  const selectedBlockPresentation = selectedBlock
    ? getBlockPresentation(selectedBlock.node)
    : { label: 'Text', detail: 'Absatz', type: 'p' as const }
  return (
    <div ref={editorShellRef} className="relative flex min-h-[480px] flex-1 gap-3 overflow-visible pl-4">
      <BlockHandleRail
        editor={editor}
        containerRef={editorShellRef}
        renderTick={renderTick}
        dragState={dragState}
        onDragStateChange={setDragState}
      />

      <div className="min-w-0 flex-1 pb-4">
        <EditorContent editor={editor} />
      </div>

      <FormatRail
        editor={editor}
        blockCount={getTopLevelBlocks(editor).length}
        selectedBlockIndex={selectedBlock?.index ?? null}
        selectedBlockLabel={selectedBlockPresentation.label}
        selectedBlockDetail={selectedBlockPresentation.detail}
        selectedBlockType={selectedBlockPresentation.type}
        onCreateSubNote={editorNote.createChildNote}
      />

      {SlashCommandMenu && <SlashCommandMenu editor={editor} />}
      {editor && <BlockContextMenu editor={editor} />}
    </div>
  )
}

function BlockHandleRail({
  editor,
  containerRef,
  renderTick,
  dragState,
  onDragStateChange,
}: {
  editor: Editor
  containerRef: RefObject<HTMLDivElement | null>
  renderTick: number
  dragState: { fromIndex: number | null; targetSlot: number | null; previewText: string }
  onDragStateChange: Dispatch<
    SetStateAction<{ fromIndex: number | null; targetSlot: number | null; previewText: string }>
  >
}) {
  const [blockRects, setBlockRects] = useState<
    Array<{
      anchorCenter: number
      anchorFontSize: number
      anchorLineHeight: number
      anchorRectHeight: number
      anchorTextHeight: number
      anchorTextTop: number
      anchorTopRaw: number
      exactHeight: number
      exactTop: number
      handleTop: number
      height: number
      index: number
      rawLeft: number
      rawWidth: number
      rawHeight: number
      rawTop: number
      top: number
    }>
  >([])
  const [editorMetrics, setEditorMetrics] = useState<{ left: number; top: number; width: number }>({
    left: 0,
    top: 0,
    width: 0,
  })
  const [hoveredBlockIndex, setHoveredBlockIndex] = useState<number | null>(null)
  const [hoveredVisualRect, setHoveredVisualRect] = useState<{
    height: number
    index: number
    left: number
    top: number
    width: number
  } | null>(null)
  const blockRectsRef = useRef(blockRects)
  const dragFromIndexRef = useRef<number | null>(dragState.fromIndex)
  const dragTargetSlotRef = useRef<number | null>(dragState.targetSlot)
  const dragCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    blockRectsRef.current = blockRects
  }, [blockRects])

  useEffect(() => {
    dragFromIndexRef.current = dragState.fromIndex
    dragTargetSlotRef.current = dragState.targetSlot
  }, [dragState.fromIndex, dragState.targetSlot])

  const refreshRects = useCallback(() => {
    const shell = containerRef.current
    if (!shell) return
    const proseMirror = shell.querySelector('.ProseMirror')
    if (!(proseMirror instanceof HTMLElement)) return

    const shellRect = shell.getBoundingClientRect()
    setEditorMetrics({
      left: proseMirror.getBoundingClientRect().left - shellRect.left,
      top: proseMirror.getBoundingClientRect().top - shellRect.top,
      width: proseMirror.clientWidth,
    })

    const proseMirrorRect = proseMirror.getBoundingClientRect()
    const children = Array.from(proseMirror.children) as HTMLElement[]
    const childRects = children.map((child) => child.getBoundingClientRect())
    const nextRects = children.map((child, index) => {
      const childRect = childRects[index]
      const rawLeft = childRect.left - proseMirrorRect.left + proseMirror.scrollLeft
      const rawTop = childRect.top - proseMirrorRect.top + proseMirror.scrollTop
      const rawBottom = childRect.bottom - proseMirrorRect.top + proseMirror.scrollTop
      const prevRect = index > 0 ? childRects[index - 1] : null
      const nextRect = index < childRects.length - 1 ? childRects[index + 1] : null
      const prevBottom = prevRect
        ? prevRect.bottom - proseMirrorRect.top + proseMirror.scrollTop
        : rawTop
      const nextTop = nextRect
        ? nextRect.top - proseMirrorRect.top + proseMirror.scrollTop
        : rawBottom
      const visualBounds = getVisualBlockBounds(child, rawTop, rawBottom, prevBottom, nextTop)
      const exactTop = visualBounds.top
      const exactBottom = visualBounds.bottom
      const exactHeight = Math.max(exactBottom - exactTop, child.tagName === 'HR' ? 26 : 24)
      const anchorMetrics = getFirstRenderedLineMetrics(child)
      const anchorCenter = exactTop + exactHeight / 2
      const handleTop = getHandleTopForBlock(
        child,
        proseMirrorRect,
        proseMirror.scrollTop,
        exactTop,
        exactHeight,
        anchorMetrics,
      )

      return {
        anchorCenter,
        anchorFontSize: anchorMetrics?.fontSize ?? 0,
        anchorLineHeight: anchorMetrics?.lineHeight ?? 0,
        anchorRectHeight: anchorMetrics?.rect.height ?? 0,
        anchorTextHeight: anchorMetrics?.textHeight ?? 0,
        anchorTextTop: anchorMetrics?.textTop ?? 0,
        anchorTopRaw: anchorMetrics?.top ?? 0,
        index,
        exactTop,
        exactHeight,
        handleTop,
        rawLeft,
        rawWidth: Math.max(childRect.width, 1),
        rawTop,
        rawHeight: Math.max(childRect.height, 1),
        top: Math.max(0, exactTop - 2),
        height: exactHeight + 4,
      }
    })

    setBlockRects(nextRects)
  }, [containerRef])

  useEffect(() => {
    refreshRects()
  }, [refreshRects, renderTick])

  useEffect(() => {
    const shell = containerRef.current
    const proseMirror = shell?.querySelector('.ProseMirror')
    if (!(proseMirror instanceof HTMLElement)) return

    const updateHoveredBlock = (event: MouseEvent) => {
      const rect = proseMirror.getBoundingClientRect()
      const relativeY = event.clientY - rect.top + proseMirror.scrollTop
      const hoveredTarget = getHoveredBlockTarget(proseMirror, event.target)
      const hovered = hoveredTarget?.index ?? getHoveredBlockIndex(blockRects, relativeY)
      const hoveredRect = hoveredTarget?.element
        ? getOverlayRectFromElement(hoveredTarget.element, proseMirror)
        : getOverlayRectFromBlockRect(blockRects.find((block) => block.index === hovered) ?? null)
      setHoveredBlockIndex((current) => (current === hovered ? current : hovered))
      setHoveredVisualRect((current) => {
        if (!hoveredRect) return null
        if (
          current &&
          current.index === hoveredRect.index &&
          current.top === hoveredRect.top &&
          current.left === hoveredRect.left &&
          current.width === hoveredRect.width &&
          current.height === hoveredRect.height
        ) {
          return current
        }
        return hoveredRect
      })
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (dragState.fromIndex !== null) return
      updateHoveredBlock(event)
    }

    const handleMouseLeave = (event: MouseEvent) => {
      const nextTarget = event.relatedTarget
      if (nextTarget instanceof Node && shell?.contains(nextTarget)) return
      if (dragState.fromIndex === null) {
        setHoveredBlockIndex(null)
        setHoveredVisualRect(null)
      }
    }

    const resizeObserver = new ResizeObserver(() => refreshRects())
    resizeObserver.observe(proseMirror)
    Array.from(proseMirror.children).forEach((child) => {
      if (child instanceof HTMLElement) resizeObserver.observe(child)
    })

    proseMirror.addEventListener('mousemove', handleMouseMove)
    proseMirror.addEventListener('mouseleave', handleMouseLeave)
    window.addEventListener('resize', refreshRects)
    return () => {
      resizeObserver.disconnect()
      proseMirror.removeEventListener('mousemove', handleMouseMove)
      proseMirror.removeEventListener('mouseleave', handleMouseLeave)
      window.removeEventListener('resize', refreshRects)
    }
  }, [blockRects, containerRef, dragState.fromIndex, refreshRects, renderTick])

  const commitMove = useCallback(
    (fromIndex: number, slotIndex: number) => {
      let nextIndex = slotIndex
      if (slotIndex > fromIndex) nextIndex -= 1

      const maxIndex = Math.max(0, getTopLevelBlocks(editor).length - 1)
      nextIndex = Math.max(0, Math.min(nextIndex, maxIndex))

      if (nextIndex !== fromIndex) {
        moveTopLevelBlock(editor, fromIndex, nextIndex)
      }
    },
    [editor],
  )

  const getDropSlots = useCallback((rects: typeof blockRects) => {
    const slots = rects.map((block, index) => ({
      slotIndex: index,
      top: block.top,
    }))
    if (rects.length > 0) {
      const last = rects[rects.length - 1]
      slots.push({
        slotIndex: rects.length,
        top: last.exactTop + Math.max(last.exactHeight, 28),
      })
    }
    return slots
  }, [])

  const updatePointerDrag = useCallback(
    (clientY: number) => {
      const shell = containerRef.current
      const proseMirror = shell?.querySelector('.ProseMirror')
      if (!(proseMirror instanceof HTMLElement)) return

      const rects = blockRectsRef.current
      if (rects.length === 0) return

      const slots = getDropSlots(rects)
      const proseMirrorRect = proseMirror.getBoundingClientRect()
      const relativeY = clientY - proseMirrorRect.top + proseMirror.scrollTop

      let nextSlot = slots[slots.length - 1]?.slotIndex ?? 0
      for (let index = 0; index < slots.length - 1; index += 1) {
        const midpoint = (slots[index].top + slots[index + 1].top) / 2
        if (relativeY < midpoint) {
          nextSlot = slots[index].slotIndex
          break
        }
      }

      dragTargetSlotRef.current = nextSlot
      onDragStateChange((prev) => ({
        ...prev,
        targetSlot: nextSlot,
      }))

      const activeBlock =
        nextSlot >= rects.length
          ? rects[rects.length - 1]?.index ?? null
          : rects[nextSlot]?.index ?? null
      setHoveredBlockIndex(activeBlock)
    },
    [containerRef, getDropSlots, onDragStateChange],
  )

  const finishPointerDrag = useCallback(() => {
    dragCleanupRef.current?.()
    dragCleanupRef.current = null
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    const fromIndex = dragFromIndexRef.current
    const targetSlot = dragTargetSlotRef.current
    dragFromIndexRef.current = null
    dragTargetSlotRef.current = null
    onDragStateChange({ fromIndex: null, targetSlot: null, previewText: '' })
    setHoveredBlockIndex(null)
    setHoveredVisualRect(null)

    if (fromIndex !== null && targetSlot !== null) {
      requestAnimationFrame(() => {
        commitMove(fromIndex, targetSlot)
      })
    }
  }, [commitMove, onDragStateChange])

  const beginPointerDrag = useCallback(
    (blockIndex: number, clientY: number) => {
      dragCleanupRef.current?.()
      const blockEntry = getTopLevelBlocks(editor)[blockIndex]
      const hoveredRect = getOverlayRectFromBlockRect(blockRectsRef.current[blockIndex] ?? null)
      dragFromIndexRef.current = blockIndex
      dragTargetSlotRef.current = blockIndex
      onDragStateChange({
        fromIndex: blockIndex,
        targetSlot: blockIndex,
        previewText: blockEntry ? getBlockPreviewText(blockEntry.node) : `Block ${blockIndex + 1}`,
      })
      setHoveredBlockIndex(blockIndex)
      setHoveredVisualRect(hoveredRect)
      refreshRects()
      updatePointerDrag(clientY)
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'grabbing'

      const handleMove = (event: MouseEvent) => {
        if (event.buttons === 0) {
          finishPointerDrag()
          return
        }
        updatePointerDrag(event.clientY)
      }
      const handleUp = () => {
        finishPointerDrag()
      }
      const handleCancel = () => {
        finishPointerDrag()
      }
      const handleVisibilityChange = () => {
        if (document.visibilityState !== 'visible') {
          handleCancel()
        }
      }

      dragCleanupRef.current = () => {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
        window.removeEventListener('blur', handleCancel)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
      window.addEventListener('blur', handleCancel)
      document.addEventListener('visibilitychange', handleVisibilityChange)
    },
    [editor, finishPointerDrag, onDragStateChange, refreshRects, updatePointerDrag],
  )

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.()
      dragCleanupRef.current = null
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [])

  const dropSlots = getDropSlots(blockRects)
  const overlayTop = dragState.targetSlot !== null ? dropSlots.find((slot) => slot.slotIndex === dragState.targetSlot)?.top ?? null : null

  return (
    <div className="pointer-events-none absolute inset-y-0 left-0 z-20 hidden w-0 overflow-visible lg:block">
      {dragState.fromIndex !== null ? (
        <div className="pointer-events-none absolute inset-0 overflow-visible">
          {blockRects.map((block) => (
            <div
              key={`bg-${block.index}`}
              className={cn(
                'absolute rounded-md transition-colors',
                hoveredBlockIndex === block.index && 'bg-[#E8713A]/12',
                block.index === dragState.fromIndex && 'bg-[#E8713A]/16',
              )}
              style={{
                top: editorMetrics.top + block.top,
                left: editorMetrics.left - 2,
                width: Math.max(120, editorMetrics.width + 4),
                height: block.height,
              }}
            />
          ))}
        </div>
      ) : null}

      {dragState.fromIndex === null && hoveredVisualRect ? (
        <div className="pointer-events-none absolute inset-0 overflow-visible">
          <div
            className="absolute rounded-md bg-[#E8713A]/12"
            style={{
              top: editorMetrics.top + hoveredVisualRect.top,
              left: editorMetrics.left + hoveredVisualRect.left,
              width: hoveredVisualRect.width,
              height: hoveredVisualRect.height,
            }}
          />
        </div>
      ) : null}

      {blockRects.map((block) => {
        return (
          <div
            key={block.index}
            className="group absolute"
            style={{ top: editorMetrics.top + block.handleTop, left: editorMetrics.left - 20, height: 16, width: 14 }}
            onMouseEnter={() => {
              if (dragState.fromIndex === null) {
                setHoveredBlockIndex(block.index)
                setHoveredVisualRect(getOverlayRectFromBlockRect(block))
              }
            }}
          >
            <div className="pointer-events-auto flex h-full items-center justify-center">
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  beginPointerDrag(block.index, event.clientY)
                }}
                onMouseEnter={() => {
                  if (dragState.fromIndex === null) {
                    setHoveredBlockIndex(block.index)
                    setHoveredVisualRect(getOverlayRectFromBlockRect(block))
                  }
                }}
                className={cn(
                  'flex h-5 w-5 cursor-grab items-center justify-center bg-transparent text-[#8B95A7] opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:text-[#475467] active:cursor-grabbing',
                  hoveredBlockIndex === block.index && 'opacity-100',
                  dragState.fromIndex === block.index && 'text-[#D56A34] opacity-100',
                )}
                aria-label={`Block ${block.index + 1} verschieben`}
              >
                <DragDots />
              </button>
            </div>
          </div>
        )
      })}

      {dragState.fromIndex !== null && overlayTop !== null ? (
        <div className="pointer-events-none absolute inset-0 overflow-visible">
          <div
            className="absolute h-0.5 rounded-full bg-[#E8713A]"
            style={{
              top: editorMetrics.top + overlayTop,
              left: editorMetrics.left,
              width: Math.max(120, editorMetrics.width),
            }}
          />
          <div
            className="absolute text-[13px] font-medium text-[#C86633]"
            style={{
              top: editorMetrics.top + overlayTop - 18,
              left: editorMetrics.left,
              maxWidth: Math.max(120, editorMetrics.width),
            }}
          >
            {dragState.previewText}
          </div>
        </div>
      ) : null}

    </div>
  )
}

function FormatRail({
  editor,
  blockCount,
  selectedBlockIndex,
  selectedBlockLabel,
  selectedBlockDetail,
  selectedBlockType,
  onCreateSubNote,
}: {
  editor: Editor
  blockCount: number
  selectedBlockIndex: number | null
  selectedBlockLabel: string
  selectedBlockDetail: string
  selectedBlockType: string
  onCreateSubNote: () => Promise<{ id: string; title: string } | null>
}) {
  const [panel, setPanel] = useState<'edit' | 'insert'>('edit')
  const activeDividerVariant = getSelectedDividerVariant(editor)
  const handleFormatChange = (format: 'blockquote' | 'code' | 'h1' | 'h2' | 'h3' | 'ol' | 'p' | 'ul') => {
    if (selectedBlockIndex === null) {
      if (format === 'p') editor.chain().focus().setParagraph().run()
      else if (format === 'h1') editor.chain().focus().setHeading({ level: 1 }).run()
      else if (format === 'h2') editor.chain().focus().setHeading({ level: 2 }).run()
      else if (format === 'ul') editor.chain().focus().toggleBulletList().run()
      else if (format === 'ol') editor.chain().focus().toggleOrderedList().run()
      else if (format === 'blockquote') editor.chain().focus().toggleBlockquote().run()
      else if (format === 'code') editor.chain().focus().toggleCodeBlock().run()
      return
    }

    setTopLevelBlockFormat(editor, selectedBlockIndex, format)
  }

  const insertBlock = (node: Parameters<typeof insertBlockAfterSelection>[1]) => {
    insertTopLevelBlockAtIndex(editor, selectedBlockIndex, node)
  }

  const insertSubNote = async () => {
    const child = await onCreateSubNote()
    if (!child) return

    insertBlock({
      type: 'subNote',
      attrs: { noteId: child.id, title: child.title || 'Ohne Titel' },
    })
  }

  return (
    <aside className="hidden w-[192px] shrink-0 lg:block">
      <div className="sticky top-3 max-h-[calc(100vh-1.5rem)] overflow-hidden rounded-[18px] border border-[#E7EBF0] bg-white/94 p-2 shadow-[0_10px_24px_rgba(15,23,42,0.06)] backdrop-blur">
        <div className="mb-2 px-1.5 pt-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#98A2B3]">
            Inspector
          </p>
        </div>

        <div className="mb-2 grid grid-cols-2 gap-1.5">
          <InspectorTabButton active={panel === 'edit'} label="Bearbeiten" onClick={() => setPanel('edit')} />
          <InspectorTabButton active={panel === 'insert'} label="Einfügen" onClick={() => setPanel('insert')} />
        </div>

        <div className="max-h-[calc(100vh-6rem)] overflow-y-auto pr-0.5">
          <div className="mb-2 flex items-center justify-between rounded-[14px] border border-[#EEF2F6] bg-[#FAFBFC] px-3 py-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#98A2B3]">
                {panel === 'edit' ? 'Block' : 'Einfügen'}
              </p>
              <p className="truncate text-[13px] font-semibold text-[#101828]">
                {panel === 'edit' ? selectedBlockDetail : 'Neuer Block'}
              </p>
            </div>
            <span className="ml-2 rounded-md bg-white px-2 py-1 text-[10px] font-medium text-[#475467] shadow-[inset_0_0_0_1px_rgba(16,24,40,0.06)]">
              {panel === 'edit' ? selectedBlockLabel : 'Neu'}
            </span>
          </div>

          {panel === 'edit' ? (
            <>
              <div className="mb-2 px-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#98A2B3]">
                  Block
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <RailButton label="Text" icon={Pilcrow} active={selectedBlockType === 'p'} onClick={() => handleFormatChange('p')} compact />
                <RailButton label="H1" icon={Heading1} active={selectedBlockType === 'h1'} onClick={() => handleFormatChange('h1')} compact />
                <RailButton label="H2" icon={Heading2} active={selectedBlockType === 'h2'} onClick={() => handleFormatChange('h2')} compact />
                <RailButton label="Liste" icon={List} active={selectedBlockType === 'ul'} onClick={() => handleFormatChange('ul')} compact />
                <RailButton label="Todo" icon={CheckSquare} active={selectedBlockType === 'taskList'} onClick={() => convertCurrentBlockToTaskList(editor, selectedBlockIndex)} compact />
                <RailButton label="Code" icon={Code2} active={selectedBlockType === 'code'} onClick={() => handleFormatChange('code')} compact />
              </div>

              <div className="my-3 h-px bg-[#EEF1F4]" />

              <div className="mb-2 px-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#98A2B3]">
                  Inline
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <MiniRailButton icon={Bold} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
                <MiniRailButton icon={Italic} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
                <MiniRailButton icon={UnderlineIcon} active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
                <MiniRailButton icon={Strikethrough} active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} />
                <MiniRailButton icon={Highlighter} active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()} />
                <MiniRailButton icon={AlignLeft} active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} />
              </div>

              <div className="my-3 h-px bg-[#EEF1F4]" />

              <div className="mb-2 px-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#98A2B3]">
                  Aktionen
                </p>
              </div>

              <div className="space-y-2">
                <ActionButton
                  icon={ArrowUp}
                  label="Block nach oben"
                  disabled={selectedBlockIndex === null || selectedBlockIndex <= 0}
                  onClick={() => {
                    if (selectedBlockIndex === null || selectedBlockIndex <= 0) return
                    moveTopLevelBlock(editor, selectedBlockIndex, selectedBlockIndex - 1)
                  }}
                />
                <ActionButton
                  icon={ArrowDown}
                  label="Block nach unten"
                  disabled={selectedBlockIndex === null || selectedBlockIndex >= blockCount - 1}
                  onClick={() => {
                    if (selectedBlockIndex === null || selectedBlockIndex >= blockCount - 1) return
                    moveTopLevelBlock(editor, selectedBlockIndex, selectedBlockIndex + 1)
                  }}
                />
                <ActionButton
                  icon={Copy}
                  label="Block duplizieren"
                  disabled={selectedBlockIndex === null}
                  onClick={() => {
                    if (selectedBlockIndex === null) return
                    duplicateTopLevelBlock(editor, selectedBlockIndex)
                  }}
                />
                <ActionButton
                  icon={Trash2}
                  label="Block löschen"
                  tone="danger"
                  disabled={selectedBlockIndex === null}
                  onClick={() => {
                    if (selectedBlockIndex === null) return
                    deleteTopLevelBlock(editor, selectedBlockIndex)
                  }}
                />
              </div>
            </>
          ) : (
            <>
              <div className="mb-2 px-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#98A2B3]">
                  Einfügen
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <RailButton label="Text" icon={TextCursorInput} onClick={() => insertBlock({ type: 'paragraph' })} compact />
                <RailButton label="H1" icon={Heading1} onClick={() => insertBlock({ type: 'heading', attrs: { level: 1 } })} compact />
                <RailButton label="H2" icon={Heading2} onClick={() => insertBlock({ type: 'heading', attrs: { level: 2 } })} compact />
                <RailButton label="Bullet" icon={List} onClick={() => insertBlock(makeListNode('bulletList'))} compact />
                <RailButton label="Nummern" icon={ListOrdered} onClick={() => insertBlock(makeListNode('orderedList'))} compact />
                <RailButton label="Todo" icon={CheckSquare} onClick={() => insertBlock(makeTaskListNode())} compact />
                <RailButton label="Code" icon={Code2} onClick={() => insertBlock({ type: 'codeBlock' })} compact />
                <RailButton label="Zitat" icon={Quote} onClick={() => insertBlock({ type: 'blockquote', content: [{ type: 'paragraph' }] })} compact />
              </div>

              <div className="my-3 h-px bg-[#EEF1F4]" />

              <div className="mb-2 px-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#98A2B3]">
                  Trennlinien
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <RailButton label="Fein" icon={Minus} onClick={() => insertBlock(createHorizontalRuleNode('solid'))} compact />
                <RailButton label="Dick" icon={Grip} onClick={() => insertBlock(createHorizontalRuleNode('thick'))} compact />
                <RailButton label="Gestr." icon={MoreHorizontal} onClick={() => insertBlock(createHorizontalRuleNode('dashed'))} compact />
                <RailButton label="Punkte" icon={MoreHorizontal} onClick={() => insertBlock(createHorizontalRuleNode('dotted'))} compact />
              </div>

              <div className="my-3 h-px bg-[#EEF1F4]" />

              <ActionButton
                icon={Sparkles}
                label="Unternotiz einfügen"
                onClick={() => {
                  void insertSubNote()
                }}
              />
            </>
          )}
        </div>
      </div>
    </aside>
  )
}

function RailButton({
  icon: Icon,
  label,
  active,
  onClick,
  compact = false,
}: {
  icon: typeof Pilcrow
  label: string
  active?: boolean
  onClick: () => void
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault()
        onClick()
      }}
      onClick={(event) => {
        if (event.detail === 0) onClick()
      }}
      className={cn(
        'flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[10px] font-medium transition-all',
        compact && 'rounded-lg py-2.5',
        active
          ? 'bg-[#FFF6F1] text-[#C86633] shadow-[inset_0_0_0_1px_rgba(232,113,58,0.14)]'
          : 'text-[#667085] hover:bg-[#F8FAFC] hover:text-[#111827]',
      )}
    >
      <Icon size={16} />
      <span>{label}</span>
    </button>
  )
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white px-3 py-2 shadow-[inset_0_0_0_1px_rgba(16,24,40,0.05)]">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#98A2B3]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#101828]">{value}</p>
    </div>
  )
}

function InspectorTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault()
        onClick()
      }}
      onClick={(event) => {
        if (event.detail === 0) onClick()
      }}
      className={cn(
        'rounded-xl px-2 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] transition-all',
        active
          ? 'bg-[#111827] text-white shadow-[0_8px_18px_rgba(17,24,39,0.14)]'
          : 'bg-[#F8FAFC] text-[#667085] hover:bg-[#EEF2F6] hover:text-[#111827]',
      )}
    >
      {label}
    </button>
  )
}

function MiniRailButton({
  icon: Icon,
  active,
  onClick,
}: {
  icon: typeof Bold
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault()
        onClick()
      }}
      onClick={(event) => {
        if (event.detail === 0) onClick()
      }}
      className={cn(
        'flex h-9 items-center justify-center rounded-lg transition-all',
        active
          ? 'bg-[#111827] text-white shadow-[0_8px_16px_rgba(17,24,39,0.12)]'
          : 'bg-[#F8FAFC] text-[#667085] hover:bg-[#EEF2F6] hover:text-[#111827]',
      )}
    >
      <Icon size={15} />
    </button>
  )
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  tone = 'default',
}: {
  icon: typeof ArrowUp
  label: string
  onClick: () => void
  disabled?: boolean
  tone?: 'danger' | 'default'
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault()
        if (!disabled) onClick()
      }}
      onClick={(event) => {
        if (event.detail === 0 && !disabled) onClick()
      }}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40',
        tone === 'danger'
          ? 'border-[#F3D0C3] bg-[#FFF7F4] text-[#C2410C] hover:border-[#E8713A] hover:bg-[#FFF1EA]'
          : 'border-[#E4E7EC] bg-white text-[#475467] hover:border-[#D0D5DD] hover:bg-[#F8FAFC] hover:text-[#101828]',
      )}
    >
      <Icon size={15} />
      <span>{label}</span>
    </button>
  )
}

function InsertButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof TextCursorInput
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-transparent bg-[#F8FAFC] px-3 py-2 text-[12px] font-medium text-[#475467] transition-all hover:border-[#E4E7EC] hover:bg-white hover:text-[#111827]"
    >
      <Icon size={14} />
      <span>{label}</span>
    </button>
  )
}

function makeListNode(type: 'bulletList' | 'orderedList') {
  return {
    type,
    content: [
      {
        type: 'listItem',
        content: [{ type: 'paragraph' }],
      },
    ],
  }
}

function makeTaskListNode() {
  return {
    type: 'taskList',
    content: [
      {
        type: 'taskItem',
        attrs: { checked: false },
        content: [{ type: 'paragraph' }],
      },
    ],
  }
}

function convertCurrentBlockToTaskList(editor: Editor, selectedBlockIndex: number | null) {
  if (selectedBlockIndex === null) {
    editor.chain().focus().toggleTaskList().run()
    return
  }

  const target = getTopLevelBlocks(editor)[selectedBlockIndex]
  if (!target) return

  editor.commands.setTextSelection(target.startPos)
  editor.commands.focus()
  editor.commands.toggleTaskList()
}

function getHandleTopForBlock(
  child: HTMLElement,
  proseMirrorRect: DOMRect,
  scrollTop: number,
  exactTop: number,
  exactHeight: number,
  anchorMetrics: {
    center: number
    fontSize?: number
    lineHeight?: number
    rect: DOMRect
    textHeight?: number
    textTop?: number
    top: number
  } | null = null,
) {
  const blockCenter = exactTop + exactHeight / 2
  return blockCenter - 8
}

function getVisualBlockBounds(
  child: HTMLElement,
  rawTop: number,
  rawBottom: number,
  prevBottom: number,
  nextTop: number,
) {
  const upperGap = Math.max(0, rawTop - prevBottom)
  const lowerGap = Math.max(0, nextTop - rawBottom)
  const contentHeight = Math.max(1, rawBottom - rawTop)

  if (child.tagName === 'HR') {
    return {
      top: rawTop - upperGap / 2,
      bottom: rawBottom + lowerGap / 2,
    }
  }

  if (child.matches('h1, h2, h3')) {
    const top = rawTop - Math.min(upperGap * 0.08, contentHeight * 0.08)
    const bottom = rawBottom + Math.min(lowerGap * 0.08, contentHeight * 0.08)
    return {
      top,
      bottom,
    }
  }

  const top = rawTop - Math.min(upperGap * 0.04, contentHeight * 0.04)
  const bottom = rawBottom + Math.min(lowerGap * 0.04, contentHeight * 0.04)
  return {
    top,
    bottom,
  }
}

function getHoveredBlockIndex(
  rects: Array<{ height: number; index: number; top: number }>,
  relativeY: number,
) {
  const candidates = rects.filter((block) => relativeY >= block.top && relativeY <= block.top + block.height)
  if (candidates.length > 0) {
    return candidates.reduce((closest, block) => {
      const closestDistance = Math.abs(relativeY - (closest.top + closest.height / 2))
      const blockDistance = Math.abs(relativeY - (block.top + block.height / 2))
      return blockDistance < closestDistance ? block : closest
    }).index
  }

  const closest = rects.reduce<{ distance: number; index: number } | null>((best, block) => {
    const center = block.top + block.height / 2
    const distance = Math.abs(relativeY - center)
    if (!best || distance < best.distance) {
      return { distance, index: block.index }
    }
    return best
  }, null)

  return closest?.index ?? null
}

function getHoveredBlockTarget(proseMirror: HTMLElement, target: EventTarget | null) {
  if (!(target instanceof Node)) return null

  let current: Node | null = target
  while (current && current !== proseMirror) {
    if (current instanceof HTMLElement && current.parentElement === proseMirror) {
      return {
        element: current,
        index: Array.from(proseMirror.children).indexOf(current),
      }
    }
    current = current.parentNode
  }

  return null
}

function getOverlayRectFromElement(element: HTMLElement, proseMirror: HTMLElement) {
  const proseMirrorRect = proseMirror.getBoundingClientRect()
  const rect = element.getBoundingClientRect()

  return {
    height: Math.max(rect.height, 1),
    index: Array.from(proseMirror.children).indexOf(element),
    left: rect.left - proseMirrorRect.left + proseMirror.scrollLeft,
    top: rect.top - proseMirrorRect.top + proseMirror.scrollTop,
    width: Math.max(rect.width, 1),
  }
}

function getOverlayRectFromBlockRect(
  block:
    | {
        index: number
        rawHeight: number
        rawLeft: number
        rawTop: number
        rawWidth: number
      }
    | null,
) {
  if (!block) return null

  return {
    height: block.rawHeight,
    index: block.index,
    left: block.rawLeft,
    top: block.rawTop,
    width: block.rawWidth,
  }
}

function getFirstRenderedLineMetrics(element: HTMLElement): {
  center: number
  fontSize?: number
  lineHeight?: number
  rect: DOMRect
  textHeight?: number
  textTop?: number
  top: number
} | null {
  const anchor = getBlockAnchorElement(element)
  if (!anchor) return null

  const textRect = getFirstTextRect(anchor)
  const anchorRect = anchor.getBoundingClientRect()
  const rect = textRect ?? anchorRect
  const computed = window.getComputedStyle(anchor)
  const lineHeight = Number.parseFloat(computed.lineHeight || '')
  const fontSize = Number.parseFloat(computed.fontSize || '')
  const center = anchorRect.top + anchorRect.height / 2

  return {
    center,
    fontSize: Number.isFinite(fontSize) ? fontSize : undefined,
    rect,
    textHeight: textRect?.height,
    textTop: textRect?.top,
    top: anchorRect.top,
    lineHeight: Number.isFinite(lineHeight) ? lineHeight : undefined,
  }
}

function getBlockAnchorElement(element: HTMLElement): HTMLElement | null {
  if (element.tagName === 'HR') return element

  if (element.matches('ul[data-type="taskList"], ol, ul')) {
    const firstItem = element.querySelector(':scope > li')
    if (firstItem instanceof HTMLElement) {
      const rowContent = firstItem.querySelector(':scope > div, :scope > p, :scope > blockquote, :scope > pre')
      if (rowContent instanceof HTMLElement) return rowContent
      return firstItem
    }
  }

  const primaryContent = element.querySelector(':scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > blockquote, :scope > pre')
  if (primaryContent instanceof HTMLElement) return primaryContent

  const mediaLike = element.querySelector(':scope > img, :scope > [data-type="subNote"], :scope > input')
  if (mediaLike instanceof HTMLElement) return mediaLike

  return element
}

function getFirstTextRect(element: HTMLElement): DOMRect | null {
  const range = document.createRange()
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
    },
  })

  const firstTextNode = walker.nextNode()
  if (!firstTextNode || firstTextNode.nodeType !== Node.TEXT_NODE) return null

  const textNode = firstTextNode as Text
  const text = textNode.textContent ?? ''
  const startOffset = text.search(/\S/)
  if (startOffset < 0) return null

  range.setStart(textNode, startOffset)
  range.setEnd(textNode, text.length)

  const firstRect = Array.from(range.getClientRects()).find((rect) => rect.width > 0 && rect.height > 0)
  if (firstRect) return firstRect

  const boundingRect = range.getBoundingClientRect()
  return boundingRect.width > 0 && boundingRect.height > 0 ? boundingRect : null
}

function DragDots() {
  return (
    <span className="grid grid-cols-2 gap-[2px]">
      {Array.from({ length: 6 }).map((_, index) => (
        <span key={index} className="h-[2px] w-[2px] rounded-full bg-current" />
      ))}
    </span>
  )
}

function getSelectedDividerVariant(editor: Editor): DividerVariant | null {
  if (!editor.isActive('horizontalRule')) return null

  const { selection } = editor.state
  const { $from } = selection
  const currentNode = $from.nodeAfter ?? $from.nodeBefore
  const variant = currentNode?.type.name === 'horizontalRule' ? currentNode.attrs?.variant : null

  return variant === 'thick' || variant === 'dashed' || variant === 'dotted' ? variant : 'solid'
}

function handleDividerAction(editor: Editor, selectedBlockIndex: number | null, variant: DividerVariant) {
  if (selectedBlockIndex !== null && editor.isActive('horizontalRule')) {
    setTopLevelHorizontalRuleVariant(editor, selectedBlockIndex, variant)
    return
  }

  insertHorizontalRule(editor, variant)
}
