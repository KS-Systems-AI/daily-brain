import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useNote, useUpdateNote, useDeleteNote, useSaveNoteContent } from '@/hooks/use-notes'
import { BlockEditor } from '@/components/notes/block-editor'
import { tiptapToBlocks, type EditorBlock } from '@/lib/tiptap-blocks'

const TITLE_DEBOUNCE = 800

export default function NoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const { data: note, isLoading } = useNote(id)
  const updateNote = useUpdateNote()
  const deleteNote = useDeleteNote()
  const saveContent = useSaveNoteContent()

  const updateRef = useRef(updateNote)
  updateRef.current = updateNote
  const saveRef = useRef(saveContent)
  saveRef.current = saveContent

  const [title, setTitle] = useState('')
  const [titleInit, setTitleInit] = useState(false)
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (note && !titleInit) {
      setTitle(note.title ?? '')
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
    (tiptapJson: Record<string, unknown>, blocks: EditorBlock[]) => {
      saveRef.current.mutate({ noteId: id!, blocks })
    },
    [id],
  )

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
        onPress: () => deleteNote.mutate(id!, { onSuccess: () => router.back() }),
      },
    ])
  }, [id, deleteNote, router])

  const [menuOpen, setMenuOpen] = useState(false)

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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
          <Text style={styles.backText}>Note</Text>
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

      <View style={styles.titleWrap}>
        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={handleTitleChange}
          placeholder="Titel"
          placeholderTextColor="#9ca3af"
        />
      </View>

      <BlockEditor
        initialContent={initialContent}
        onSave={handleSaveContent}
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
  backBtn: { flexDirection: 'row', alignItems: 'center' },
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
  titleWrap: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  titleInput: { fontSize: 26, fontWeight: '700', color: '#111827', padding: 0 },
})
