import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Keyboard,
  Platform,
  AppState,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQueryClient } from '@tanstack/react-query'
import {
  useNote,
  useUpdateNote,
  useDeleteNote,
  useSaveNoteContent,
  useNoteChildren,
  useNoteBreadcrumbs,
  useCreateNote,
} from '@/hooks/use-notes'
import { BlockEditor } from '@/components/notes/block-editor'
import { SubNoteActionSheet } from '@/components/notes/sub-note-action-sheet'
import { type EditorBlock } from '@/lib/tiptap-blocks'
import { RecordSelector, type SelectedRecord } from '@/components/record-selector'

const TITLE_DEBOUNCE = 800

export default function NoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const qc = useQueryClient()
  const { data: note, isLoading } = useNote(id)
  const { data: children, isFetched: noteChildrenFetched } = useNoteChildren(id)
  const { data: breadcrumbs } = useNoteBreadcrumbs(id)
  const updateNote = useUpdateNote()
  const deleteNote = useDeleteNote()
  const saveContent = useSaveNoteContent()
  const createNote = useCreateNote()

  useFocusEffect(
    useCallback(() => {
      qc.invalidateQueries({ queryKey: ['note', id] })
      qc.invalidateQueries({ queryKey: ['note-children', id] })
      qc.invalidateQueries({ queryKey: ['note-breadcrumbs', id] })
    }, [id, qc]),
  )

  useEffect(() => {
    const onChange = (state: string) => {
      if (state !== 'active' || !id) return
      qc.invalidateQueries({ queryKey: ['note', id] })
      qc.invalidateQueries({ queryKey: ['note-children', id] })
      qc.invalidateQueries({ queryKey: ['note-breadcrumbs', id] })
    }
    const sub = AppState.addEventListener('change', onChange)
    return () => sub.remove()
  }, [id, qc])

  const updateRef = useRef(updateNote)
  updateRef.current = updateNote
  const saveRef = useRef(saveContent)
  saveRef.current = saveContent

  const [title, setTitle] = useState('')
  const [titleInit, setTitleInit] = useState(false)
  const [linkedRecord, setLinkedRecord] = useState<SelectedRecord | null>(null)
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [editorKey, setEditorKey] = useState(0)
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const s1 = Keyboard.addListener(showEvt, () => setKeyboardOpen(true))
    const s2 = Keyboard.addListener(hideEvt, () => setKeyboardOpen(false))
    return () => { s1.remove(); s2.remove() }
  }, [])

  const keyboardOpenRef = useRef(false)
  useEffect(() => {
    keyboardOpenRef.current = keyboardOpen
  }, [keyboardOpen])

  const prevNoteUpdatedAtRef = useRef<string | null>(null)
  const skipNextRemoteContentSyncRef = useRef(false)
  const pendingRemoteEditorRemountRef = useRef(false)

  useEffect(() => {
    prevNoteUpdatedAtRef.current = null
    skipNextRemoteContentSyncRef.current = false
    pendingRemoteEditorRemountRef.current = false
  }, [id])

  const noteChildren = useMemo(() => children ?? [], [children])

  const childIds = useMemo(() => noteChildren.map((c) => c.id).sort().join(','), [noteChildren])
  const prevChildIdsRef = useRef(childIds)

  useEffect(() => {
    const prev = prevChildIdsRef.current
    if (prev === '' || prev === childIds) {
      prevChildIdsRef.current = childIds
      return
    }
    const prevSet = new Set(prev.split(',').filter(Boolean))
    const nextSet = new Set(childIds.split(',').filter(Boolean))
    let childRemoved = false
    for (const cid of prevSet) {
      if (!nextSet.has(cid)) {
        childRemoved = true
        break
      }
    }
    if (childRemoved) {
      setEditorKey((k) => k + 1)
      setTitleInit(false)
    }
    prevChildIdsRef.current = childIds
  }, [childIds])

  useEffect(() => {
    if (note && !titleInit) {
      setTitle(note.title ?? '')
      const contact = Array.isArray((note as any).contact) ? (note as any).contact[0] : (note as any).contact
      const company = Array.isArray((note as any).company) ? (note as any).company[0] : (note as any).company
      if ((note as any).contact_id) {
        const label = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ') || 'Kontakt'
        setLinkedRecord({ id: (note as any).contact_id as string, type: 'contact', label })
      } else if ((note as any).company_id) {
        setLinkedRecord({
          id: (note as any).company_id as string,
          type: 'company',
          label: company?.name || 'Unternehmen',
        })
      } else {
        setLinkedRecord(null)
      }
      setTitleInit(true)
    }
  }, [note, titleInit])

  const handleTitleChange = useCallback(
    (text: string) => {
      setTitle(text)
      if (titleTimerRef.current) clearTimeout(titleTimerRef.current)
      titleTimerRef.current = setTimeout(() => {
        updateRef.current.mutate({ id: id!, title: text })
      }, TITLE_DEBOUNCE)
    },
    [id],
  )

  const handleSaveContent = useCallback(
    (_tiptapJson: Record<string, unknown>, blocks: EditorBlock[]) => {
      skipNextRemoteContentSyncRef.current = true
      saveRef.current.mutate(
        { noteId: id!, blocks },
        {
          onError: () => {
            skipNextRemoteContentSyncRef.current = false
          },
        },
      )
    },
    [id],
  )

  useEffect(() => {
    if (!note) return
    const ua = String((note as any).updated_at ?? '')
    if (prevNoteUpdatedAtRef.current === null) {
      prevNoteUpdatedAtRef.current = ua
      return
    }
    if (prevNoteUpdatedAtRef.current === ua) return
    prevNoteUpdatedAtRef.current = ua

    if (skipNextRemoteContentSyncRef.current) {
      skipNextRemoteContentSyncRef.current = false
      return
    }

    setTitle((note as any).title ?? '')
    if (keyboardOpenRef.current) {
      pendingRemoteEditorRemountRef.current = true
    } else {
      setEditorKey((k) => k + 1)
    }
  }, [note, (note as any)?.updated_at])

  useEffect(() => {
    if (!keyboardOpen && pendingRemoteEditorRemountRef.current && note) {
      pendingRemoteEditorRemountRef.current = false
      setTitle((note as any).title ?? '')
      setEditorKey((k) => k + 1)
    }
  }, [keyboardOpen, note])

  const handleTogglePin = useCallback(() => {
    if (!note) return
    updateRef.current.mutate({ id: id!, is_pinned: !note.is_pinned })
  }, [id, note])

  const handleDelete = useCallback(() => {
    Alert.alert('Notiz löschen', 'Möchtest du diese Notiz wirklich löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => {
          const parentId = (note as any)?.parent_id
          deleteNote.mutate(id!, {
            onSuccess: () => {
              if (parentId) {
                if (router.canGoBack()) {
                  router.back()
                } else {
                  router.replace(`/note/${parentId}`)
                }
              } else {
                router.navigate('/(tabs)/notes')
              }
            },
          })
        },
      },
    ])
  }, [id, deleteNote, router, note])

  const handleSubNotePress = useCallback(
    (noteId: string) => {
      router.push(`/note/${noteId}`)
    },
    [router],
  )

  const handleCreateSubNote = useCallback(async (): Promise<{ id: string; title: string } | null> => {
    try {
      const child = await createNote.mutateAsync({ parent_id: id })
      return { id: child.id, title: child.title ?? 'Ohne Titel' }
    } catch {
      return null
    }
  }, [id, createNote])

  const handleCreateAndNavigate = useCallback(async () => {
    try {
      const child = await createNote.mutateAsync({ parent_id: id })
      router.push(`/note/${child.id}`)
    } catch {}
  }, [id, createNote, router])

  const [pendingRemove, setPendingRemove] = useState<{ noteId: string; title: string } | null>(null)

  const handleSubNoteLongPress = useCallback((childNoteId: string, childTitle: string) => {
    setPendingRemove({ noteId: childNoteId, title: childTitle })
  }, [])

  const handleActionDone = useCallback(() => {
    setPendingRemove(null)
    setEditorKey((k) => k + 1)
  }, [])

  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!note || !titleInit) return
    const currentContactId = (note as any).contact_id ?? null
    const currentCompanyId = (note as any).company_id ?? null
    const nextContactId = linkedRecord?.type === 'contact' ? linkedRecord.id : null
    const nextCompanyId = linkedRecord?.type === 'company' ? linkedRecord.id : null
    if (currentContactId === nextContactId && currentCompanyId === nextCompanyId) return
    updateRef.current.mutate({
      id: id!,
      contact_id: nextContactId,
      company_id: nextCompanyId,
    })
  }, [linkedRecord, note, titleInit, id])

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#E8713A" />
        </View>
      </SafeAreaView>
    )
  }

  if (!note) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>Notiz nicht gefunden</Text>
        </View>
      </SafeAreaView>
    )
  }

  const initialContent = note.content && typeof note.content === 'object'
    ? note.content as Record<string, unknown>
    : null

  const crumbs = breadcrumbs ?? []

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if ((note as any)?.parent_id) {
              if (router.canGoBack()) {
                router.back()
              } else {
                router.replace(`/note/${(note as any).parent_id}`)
              }
            } else {
              router.navigate('/(tabs)/notes')
            }
          }}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color="#111827" />
          <Text style={styles.backText} numberOfLines={1}>
            {(note as any)?.parent_id
              ? crumbs[crumbs.length - 1]?.title || 'Zurück'
              : 'Notizen'}
          </Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleTogglePin} style={styles.iconBtn}>
            <Ionicons
              name={note.is_pinned ? 'pin' : 'pin-outline'}
              size={20}
              color={note.is_pinned ? '#E8713A' : '#6b7280'}
            />
          </TouchableOpacity>
          <View>
            <TouchableOpacity
              onPress={() => setMenuOpen((v) => !v)}
              style={styles.iconBtn}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color="#6b7280" />
            </TouchableOpacity>
            {menuOpen && (
              <View style={styles.menu}>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => { setMenuOpen(false); handleDelete() }}
                >
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  <Text style={styles.menuItemDanger}>Löschen</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>

      {crumbs.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.breadcrumbsWrap}
          contentContainerStyle={styles.breadcrumbsContent}
        >
          <TouchableOpacity onPress={() => router.navigate('/(tabs)/notes')}>
            <Text style={styles.breadcrumbText}>Notizen</Text>
          </TouchableOpacity>
          {crumbs.map((crumb) => (
            <View key={crumb.id} style={styles.breadcrumbItem}>
              <Ionicons name="chevron-forward" size={12} color="#d1d5db" />
              <TouchableOpacity onPress={() => router.navigate(`/note/${crumb.id}`)}>
                <Text style={styles.breadcrumbText} numberOfLines={1}>
                  {crumb.title || 'Ohne Titel'}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
          <View style={styles.breadcrumbItem}>
            <Ionicons name="chevron-forward" size={12} color="#d1d5db" />
            <Text style={styles.breadcrumbActive} numberOfLines={1}>
              {note.title || 'Ohne Titel'}
            </Text>
          </View>
        </ScrollView>
      )}

      <View style={styles.titleWrap}>
        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={handleTitleChange}
          placeholder="Titel"
          placeholderTextColor="#9ca3af"
        />
        <View style={{ marginTop: 10 }}>
          <RecordSelector value={linkedRecord} onChange={setLinkedRecord} />
        </View>
      </View>

      <View style={styles.editorSeparator} />

      <BlockEditor
        key={`${id}-${editorKey}`}
        initialContent={initialContent}
        onSave={handleSaveContent}
        onSubNotePress={handleSubNotePress}
        onSubNoteLongPress={handleSubNoteLongPress}
        onCreateSubNote={handleCreateSubNote}
        childNotes={noteChildrenFetched ? noteChildren : undefined}
      />

      {!keyboardOpen && noteChildren.length > 0 && (
        <View style={styles.childrenSection}>
          <View style={styles.childrenHeader}>
            <Text style={styles.childrenTitle}>Unternotizen</Text>
            <View style={styles.childrenBadge}>
              <Text style={styles.childrenBadgeText}>{noteChildren.length}</Text>
            </View>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              onPress={handleCreateAndNavigate}
              disabled={createNote.isPending}
              style={styles.childrenAddBtn}
            >
              <Ionicons name="add" size={16} color="#E8713A" />
              <Text style={styles.childrenAddText}>Erstellen</Text>
            </TouchableOpacity>
          </View>
          {noteChildren.map((child) => (
            <TouchableOpacity
              key={child.id}
              style={styles.childRow}
              activeOpacity={0.7}
              onPress={() => router.push(`/note/${child.id}`)}
            >
              <Ionicons name="document-text-outline" size={16} color="#9ca3af" />
              <View style={styles.childContent}>
                <Text style={styles.childTitle} numberOfLines={1}>
                  {child.title || 'Ohne Titel'}
                </Text>
                {child.content_text ? (
                  <Text style={styles.childPreview} numberOfLines={1}>
                    {child.content_text.slice(0, 60)}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={14} color="#d1d5db" />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {!keyboardOpen && noteChildren.length === 0 && (
        <View style={styles.childrenSection}>
          <View style={styles.childrenHeader}>
            <Text style={styles.childrenTitle}>Unternotizen</Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              onPress={handleCreateAndNavigate}
              disabled={createNote.isPending}
              style={styles.childrenAddBtn}
            >
              <Ionicons name="add" size={16} color="#E8713A" />
              <Text style={styles.childrenAddText}>Erstellen</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.childrenEmpty}>Keine Unternotizen</Text>
        </View>
      )}

      <SubNoteActionSheet
        noteId={pendingRemove?.noteId ?? null}
        currentParentId={id!}
        noteTitle={pendingRemove?.title ?? ''}
        onClose={() => setPendingRemove(null)}
        onDone={handleActionDone}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 16, color: '#6b7280' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', maxWidth: 180 },
  backText: { fontSize: 17, color: '#111827', marginLeft: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  menu: {
    position: 'absolute', top: 40, right: 0, backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 8, elevation: 4, minWidth: 140, zIndex: 10,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  menuItemDanger: { fontSize: 15, color: '#ef4444' },
  breadcrumbsWrap: { maxHeight: 36, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  breadcrumbsContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 4 },
  breadcrumbItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  breadcrumbText: { fontSize: 12, color: '#6b7280', maxWidth: 120 },
  breadcrumbActive: { fontSize: 12, fontWeight: '600', color: '#111827', maxWidth: 120 },
  titleWrap: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  editorSeparator: {
    marginTop: 14,
    marginBottom: 8,
    marginHorizontal: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
  },
  titleInput: { fontSize: 26, fontWeight: '700', color: '#111827', padding: 0 },
  childrenSection: {
    borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20,
  },
  childrenHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  childrenTitle: { fontSize: 12, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 },
  childrenBadge: { backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  childrenBadgeText: { fontSize: 10, fontWeight: '600', color: '#6b7280' },
  childrenAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  childrenAddText: { fontSize: 13, color: '#E8713A', fontWeight: '500' },
  childRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  childContent: { flex: 1 },
  childTitle: { fontSize: 14, fontWeight: '500', color: '#111827' },
  childPreview: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  childrenEmpty: { fontSize: 13, color: '#d1d5db', textAlign: 'center', paddingVertical: 12 },
})
