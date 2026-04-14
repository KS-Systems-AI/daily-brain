import { useCallback, useRef, useState, useEffect } from 'react'
import {
  View,
  TextInput,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  type TextStyle,
  Platform,
  Keyboard,
  Dimensions,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native'

const _screenHeight = Dimensions.get('window').height
import { Ionicons } from '@expo/vector-icons'
import { EditorToolbar, BlockTypeMenu } from './editor-toolbar'
import {
  type EditorBlock,
  type TextMarkKey,
  tiptapToBlocks,
  blocksToTiptap,
  emptyBlock,
  uid,
  blockSupportsTextMarks,
  copyTextMarks,
} from '@/lib/tiptap-blocks'

interface BlockEditorProps {
  initialContent: Record<string, unknown> | null
  onSave: (tiptapJson: Record<string, unknown>, blocks: EditorBlock[]) => void
  onSubNotePress?: (noteId: string) => void
  onSubNoteLongPress?: (noteId: string, title: string) => void
  onCreateSubNote?: () => Promise<{ id: string; title: string } | null>
  childNotes?: { id: string; title: string | null }[]
}

export function BlockEditor({ initialContent, onSave, onSubNotePress, onSubNoteLongPress, onCreateSubNote, childNotes }: BlockEditorProps) {
  const [blocks, setBlocks] = useState<EditorBlock[]>(() => {
    if (initialContent) {
      const parsed = tiptapToBlocks(initialContent as any)
      // Only filter when parent passed a resolved list; `undefined` = still loading,
      // do not treat that like "no children" (empty array would remove every sub_note).
      if (childNotes !== undefined) {
        const validIds = new Set(childNotes.map((c) => c.id))
        return parsed.filter(
          (b) => b.block_type !== 'sub_note' || validIds.has(b.attrs.noteId as string),
        )
      }
      return parsed
    }
    return [emptyBlock()]
  })
  const [focusedIndex, setFocusedIndex] = useState<number>(0)
  const [showBlockMenu, setShowBlockMenu] = useState(false)
  const inputRefs = useRef<(TextInput | null)[]>([])
  const blockRowRefs = useRef<(View | null)[]>([])
  const scrollRef = useRef<ScrollView>(null)
  const scrollOffsetRef = useRef(0)
  const keyboardHeightRef = useRef(0)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const blocksRef = useRef(blocks)
  blocksRef.current = blocks

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const currentBlocks = blocksRef.current
      const tiptap = blocksToTiptap(currentBlocks)
      onSave(tiptap as unknown as Record<string, unknown>, currentBlocks)
    }, 1000)
  }, [onSave])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      const currentBlocks = blocksRef.current
      const tiptap = blocksToTiptap(currentBlocks)
      onSave(tiptap as unknown as Record<string, unknown>, currentBlocks)
    }
  }, [onSave])

  const handleTextChange = useCallback(
    (index: number, text: string) => {
      if (text.endsWith('\n\n')) {
        const cleanText = text.slice(0, -2)
        setBlocks((prev) => {
          const next = [...prev]
          next[index] = { ...next[index], plaintext: cleanText }
          return next
        })
        createNewBlockAfter(index)
        return
      }

      setBlocks((prev) => {
        const next = [...prev]
        next[index] = { ...next[index], plaintext: text }
        return next
      })
      scheduleSave()
    },
    [scheduleSave],
  )

  const createNewBlockAfter = useCallback(
    (index: number) => {
      setBlocks((prev) => {
        const currentBlock = prev[index]
        const newType =
          currentBlock.block_type === 'ul' ||
          currentBlock.block_type === 'ol' ||
          currentBlock.block_type === 'task_item'
            ? currentBlock.block_type
            : 'unstyled'

        const markAttrs = copyTextMarks(currentBlock.attrs)
        const newAttrs =
          newType === 'task_item' ? { checked: false, ...markAttrs } : { ...markAttrs }

        if (
          currentBlock.plaintext === '' &&
          (newType === 'ul' || newType === 'ol' || newType === 'task_item')
        ) {
          const next = [...prev]
          next[index] = { ...next[index], block_type: 'unstyled', attrs: {} }
          return next
        }

        const newBlock = emptyBlock(newType)
        newBlock.attrs = newAttrs
        const next = [...prev]
        next.splice(index + 1, 0, newBlock)
        return next
      })

      const nextIdx = index + 1
      setFocusedIndex(nextIdx)
      setTimeout(() => {
        inputRefs.current[nextIdx]?.focus()
        setTimeout(() => scrollBlockIntoView(nextIdx), 100)
      }, 50)
      scheduleSave()
    },
    [scheduleSave, scrollBlockIntoView],
  )

  const handleKeyPress = useCallback(
    (index: number, e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (e.nativeEvent.key === 'Backspace' && blocks[index].plaintext === '' && blocks.length > 1) {
        e.preventDefault?.()
        setBlocks((prev) => {
          const next = [...prev]
          next.splice(index, 1)
          return next
        })
        const prevIdx = Math.max(0, index - 1)
        setFocusedIndex(prevIdx)
        setTimeout(() => inputRefs.current[prevIdx]?.focus(), 50)
        scheduleSave()
      }
    },
    [blocks, scheduleSave],
  )

  const handleChangeBlockType = useCallback(
    (type: string, attrs?: Record<string, unknown>) => {
      if (focusedIndex < 0 || focusedIndex >= blocks.length) return
      setBlocks((prev) => {
        const next = [...prev]
        const mergedAttrs = { ...next[focusedIndex].attrs, ...(attrs ?? {}) }
        if (type === 'heading' && !attrs?.level) mergedAttrs.level = 1
        next[focusedIndex] = {
          ...next[focusedIndex],
          block_type: type,
          attrs: mergedAttrs,
        }
        return next
      })
      scheduleSave()
    },
    [focusedIndex, blocks, scheduleSave],
  )

  const handleToggleTextMark = useCallback(
    (mark: TextMarkKey) => {
      setBlocks((prev) => {
        const i = focusedIndex
        if (i < 0 || i >= prev.length) return prev
        const b = prev[i]
        if (!blockSupportsTextMarks(b.block_type)) return prev
        const next = [...prev]
        const cur = !!b.attrs[mark]
        const newAttrs = { ...b.attrs }
        if (cur) delete newAttrs[mark]
        else newAttrs[mark] = true
        next[i] = { ...b, attrs: newAttrs }
        return next
      })
      scheduleSave()
    },
    [focusedIndex, scheduleSave],
  )

  const handleInsertBlock = useCallback(
    async (type: string, attrs?: Record<string, unknown>) => {
      if (type === 'sub_note' && onCreateSubNote) {
        const child = await onCreateSubNote()
        if (!child) return
        const newBlock: EditorBlock = {
          id: uid(),
          block_type: 'sub_note',
          plaintext: child.title || 'Ohne Titel',
          attrs: { noteId: child.id },
          indent: 0,
        }
        const insertAt = focusedIndex + 1
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current)
          saveTimerRef.current = null
        }
        const prev = blocksRef.current
        const next = [...prev]
        next.splice(insertAt, 0, newBlock)
        blocksRef.current = next
        setBlocks(next)
        const tiptap = blocksToTiptap(next)
        onSave(tiptap as unknown as Record<string, unknown>, next)
        return
      }

      const newBlock = emptyBlock(type)
      if (attrs) newBlock.attrs = attrs
      const insertAt = focusedIndex + 1
      setBlocks((prev) => {
        const next = [...prev]
        next.splice(insertAt, 0, newBlock)
        return next
      })

      if (type !== 'hr') {
        setFocusedIndex(insertAt)
        setTimeout(() => inputRefs.current[insertAt]?.focus(), 50)
      } else {
        const afterHr = emptyBlock()
        setBlocks((prev) => {
          const next = [...prev]
          next.splice(insertAt + 1, 0, afterHr)
          return next
        })
        setFocusedIndex(insertAt + 1)
        setTimeout(() => inputRefs.current[insertAt + 1]?.focus(), 80)
      }
      scheduleSave()
    },
    [focusedIndex, scheduleSave, onCreateSubNote, onSave],
  )

  const handleToggleCheck = useCallback(
    (index: number) => {
      setBlocks((prev) => {
        const next = [...prev]
        next[index] = {
          ...next[index],
          attrs: { ...next[index].attrs, checked: !next[index].attrs.checked },
        }
        return next
      })
      scheduleSave()
    },
    [scheduleSave],
  )

  const focusedBlock = blocks[focusedIndex] ?? blocks[0]

  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const keyboardVisible = keyboardHeight > 0

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const h = e.endCoordinates.height
      setKeyboardHeight(h)
      keyboardHeightRef.current = h
    })
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0)
      keyboardHeightRef.current = 0
    })
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [])

  const scrollBlockIntoView = useCallback((index: number) => {
    const row = blockRowRefs.current[index]
    if (!row) return

    requestAnimationFrame(() => {
      row.measureInWindow((_x, y, _w, h) => {
        const kbH = keyboardHeightRef.current
        if (kbH === 0) return
        const toolbarH = 46
        const visibleBottom = _screenHeight - kbH - toolbarH
        const blockBottom = y + h

        if (blockBottom > visibleBottom) {
          const overflowBy = blockBottom - visibleBottom + 40
          scrollRef.current?.scrollTo({
            y: (scrollOffsetRef.current ?? 0) + overflowBy,
            animated: true,
          })
        }
      })
    })
  }, [])

  const TOOLBAR_HEIGHT = 46

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          keyboardVisible && {
            paddingBottom: keyboardHeight + TOOLBAR_HEIGHT + 20,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onScroll={(e) => {
          scrollOffsetRef.current = e.nativeEvent.contentOffset.y
        }}
        scrollEventThrottle={16}
      >
        {blocks.map((block, index) => {
            if (block.block_type === 'sub_note') {
              const noteId = block.attrs.noteId as string
              const child = childNotes?.find((c) => c.id === noteId)
              const displayTitle = child?.title || block.plaintext || 'Ohne Titel'
              return (
                <View
                  key={block.id}
                  style={styles.subNoteCard}
                  ref={(ref) => { blockRowRefs.current[index] = ref }}
                >
                  <TouchableOpacity
                    style={styles.subNoteMainTap}
                    activeOpacity={0.7}
                    onPress={() => onSubNotePress?.(noteId)}
                    onLongPress={() => onSubNoteLongPress?.(noteId, displayTitle)}
                    delayLongPress={400}
                  >
                    <Ionicons name="document-text-outline" size={16} color="#6b7280" />
                    <Text style={styles.subNoteTitle} numberOfLines={1}>{displayTitle}</Text>
                    <Ionicons name="chevron-forward" size={14} color="#d1d5db" />
                  </TouchableOpacity>
                  {onSubNoteLongPress ? (
                    <TouchableOpacity
                      style={styles.subNoteMenuBtn}
                      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                      onPress={() => onSubNoteLongPress(noteId, displayTitle)}
                      accessibilityLabel="Unternotiz entfernen oder verschieben"
                    >
                      <Ionicons name="ellipsis-horizontal" size={20} color="#9ca3af" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              )
            }

            let olNumber: number | undefined
            if (block.block_type === 'ol') {
              olNumber = 1
              for (let j = index - 1; j >= 0; j--) {
                if (blocks[j].block_type === 'ol') olNumber++
                else break
              }
            }
            return (
              <EditorBlockRow
                key={block.id}
                block={block}
                index={index}
                olNumber={olNumber}
                isFocused={index === focusedIndex}
                onChangeText={(text) => handleTextChange(index, text)}
                onKeyPress={(e) => handleKeyPress(index, e)}
                onFocus={() => {
                  setFocusedIndex(index)
                  setTimeout(() => scrollBlockIntoView(index), 300)
                }}
                onToggleCheck={() => handleToggleCheck(index)}
                refCallback={(ref) => {
                  inputRefs.current[index] = ref
                }}
                rowRefCallback={(ref) => {
                  blockRowRefs.current[index] = ref
                }}
              />
            )
          })}
      </ScrollView>

      {keyboardVisible && (
        <View style={[styles.toolbarWrap, { bottom: keyboardHeight }]}>
          <EditorToolbar
            activeBlockType={focusedBlock?.block_type ?? 'unstyled'}
            activeAttrs={focusedBlock?.attrs ?? {}}
            onChangeBlockType={handleChangeBlockType}
            onInsertBlock={handleInsertBlock}
            onOpenBlockMenu={() => setShowBlockMenu(true)}
            hasSubNotes={!!onCreateSubNote}
            textMarksEnabled={blockSupportsTextMarks(focusedBlock?.block_type ?? '')}
            onToggleTextMark={handleToggleTextMark}
          />
        </View>
      )}

      <BlockTypeMenu
        visible={showBlockMenu}
        onClose={() => setShowBlockMenu(false)}
        onChangeBlockType={handleChangeBlockType}
        onInsertBlock={handleInsertBlock}
        hasSubNotes={!!onCreateSubNote}
      />
    </View>
  )
}

interface EditorBlockRowProps {
  block: EditorBlock
  index: number
  olNumber?: number
  isFocused: boolean
  onChangeText: (text: string) => void
  onKeyPress: (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => void
  onFocus: () => void
  onToggleCheck: () => void
  refCallback: (ref: TextInput | null) => void
  rowRefCallback: (ref: View | null) => void
}

function EditorBlockRow({
  block,
  index,
  olNumber,
  isFocused,
  onChangeText,
  onKeyPress,
  onFocus,
  onToggleCheck,
  refCallback,
  rowRefCallback,
}: EditorBlockRowProps) {
  if (block.block_type === 'hr') {
    return <View ref={rowRefCallback} style={styles.hr} />
  }

  const textStyle = getTextStyle(block)
  const markStyle = getMarkStyle(block.attrs)
  const prefix = getPrefix(block, olNumber)

  return (
    <View ref={rowRefCallback} style={styles.blockRow}>
      {block.block_type === 'task_item' && (
        <TouchableOpacity onPress={onToggleCheck} style={styles.checkboxWrap}>
          <View
            style={[
              styles.checkbox,
              !!block.attrs.checked && styles.checkboxChecked,
            ]}
          >
            {!!block.attrs.checked && (
              <Ionicons name="checkmark" size={12} color="#fff" />
            )}
          </View>
        </TouchableOpacity>
      )}

      {block.block_type === 'blockquote' && (
        <View style={styles.quoteLine} />
      )}

      {prefix !== null && block.block_type !== 'task_item' && (
        <Text style={styles.prefix}>{prefix}</Text>
      )}

      <TextInput
        ref={refCallback}
        style={[
          styles.input,
          textStyle,
          markStyle,
          block.block_type === 'task_item' && !!block.attrs.checked && styles.checkedText,
        ]}
        value={block.plaintext}
        onChangeText={onChangeText}
        onKeyPress={onKeyPress}
        onFocus={onFocus}
        placeholder={index === 0 && block.plaintext === '' ? 'Schreib etwas...' : undefined}
        placeholderTextColor="#9ca3af"
        multiline
        blurOnSubmit={false}
        autoCapitalize={block.block_type === 'code_block' ? 'none' : 'sentences'}
      />
    </View>
  )
}

function getMarkStyle(attrs: Record<string, unknown>): TextStyle {
  const bold = !!attrs.bold
  const italic = !!attrs.italic
  const underline = !!attrs.underline
  const strike = !!attrs.strike
  let textDecorationLine: TextStyle['textDecorationLine']
  if (underline && strike) textDecorationLine = 'underline line-through'
  else if (underline) textDecorationLine = 'underline'
  else if (strike) textDecorationLine = 'line-through'
  return {
    fontWeight: bold ? '700' : undefined,
    fontStyle: italic ? 'italic' : undefined,
    textDecorationLine,
  }
}

function getTextStyle(block: EditorBlock) {
  switch (block.block_type) {
    case 'heading': {
      const level = (block.attrs.level as number) ?? 1
      if (level === 1) return styles.h1
      if (level === 2) return styles.h2
      return styles.h3
    }
    case 'code_block':
      return styles.codeText
    case 'blockquote':
      return styles.quoteText
    default:
      return styles.bodyText
  }
}

function getPrefix(block: EditorBlock, olNumber?: number): string | null {
  switch (block.block_type) {
    case 'ul':
      return '•'
    case 'ol':
      return `${olNumber ?? 1}.`
    default:
      return null
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  blockRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 26,
  },
  prefix: {
    fontSize: 15,
    color: '#6b7280',
    width: 24,
    lineHeight: 20,
    paddingTop: 4,
  },
  checkboxWrap: {
    paddingTop: 4,
    paddingRight: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#E8713A',
    borderColor: '#E8713A',
  },
  checkedText: {
    textDecorationLine: 'line-through',
    color: '#9ca3af',
  },
  quoteLine: {
    width: 3,
    backgroundColor: '#E8713A',
    borderRadius: 1.5,
    marginRight: 10,
    alignSelf: 'stretch',
    marginVertical: 4,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    lineHeight: 20,
    paddingVertical: 2,
    paddingHorizontal: 0,
    margin: 0,
  },
  h1: {
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 30,
    paddingVertical: 3,
  },
  h2: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 26,
    paddingVertical: 2,
  },
  h3: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 22,
    paddingVertical: 1,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 20,
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    lineHeight: 18,
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    padding: 8,
  },
  quoteText: {
    fontSize: 15,
    lineHeight: 20,
    fontStyle: 'italic',
    color: '#4b5563',
  },
  subNoteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fafafa',
    paddingRight: 6,
  },
  subNoteMainTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
  },
  subNoteMenuBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    justifyContent: 'center',
  },
  subNoteTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  hr: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 10,
  },
  toolbarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
})
