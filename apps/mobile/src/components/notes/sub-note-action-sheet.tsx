import { useState, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useDeleteNote, useUpdateNote, useSearchNotes } from '@/hooks/use-notes'

interface SubNoteActionSheetProps {
  noteId: string | null
  currentParentId: string
  noteTitle: string
  onClose: () => void
  onDone: () => void
}

type SheetView = 'choose' | 'move'

export function SubNoteActionSheet({
  noteId,
  currentParentId,
  noteTitle,
  onClose,
  onDone,
}: SubNoteActionSheetProps) {
  const [view, setView] = useState<SheetView>('choose')
  const [search, setSearch] = useState('')

  const deleteNote = useDeleteNote()
  const updateNote = useUpdateNote()
  const { data: searchResults, isLoading } = useSearchNotes(search, view === 'move')

  const moveTargets = (searchResults ?? []).filter(
    (n) => n.id !== noteId && n.id !== currentParentId,
  )

  const handleDelete = useCallback(() => {
    if (!noteId) return
    deleteNote.mutate(noteId, { onSuccess: onDone })
  }, [noteId, deleteNote, onDone])

  const handleDetach = useCallback(() => {
    if (!noteId) return
    updateNote.mutate({ id: noteId, parent_id: null }, { onSuccess: onDone })
  }, [noteId, updateNote, onDone])

  const handleMoveTo = useCallback(
    (targetId: string) => {
      if (!noteId) return
      updateNote.mutate({ id: noteId, parent_id: targetId }, { onSuccess: onDone })
    },
    [noteId, updateNote, onDone],
  )

  const handleClose = useCallback(() => {
    setView('choose')
    setSearch('')
    onClose()
  }, [onClose])

  const isPending = deleteNote.isPending || updateNote.isPending

  return (
    <Modal visible={!!noteId} transparent animationType="slide" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.handle} />

          {view === 'choose' ? (
            <>
              <Text style={styles.title}>Unternotiz entfernen</Text>
              <Text style={styles.description}>
                Was soll mit &ldquo;{noteTitle}&rdquo; passieren?
              </Text>

              <TouchableOpacity
                style={styles.actionRow}
                onPress={handleDelete}
                disabled={isPending}
                activeOpacity={0.7}
              >
                <View style={[styles.actionIcon, styles.actionIconDanger]}>
                  <Ionicons name="trash-outline" size={16} color="#ef4444" />
                </View>
                <View style={styles.actionTextWrap}>
                  <Text style={styles.actionLabel}>Notiz löschen</Text>
                  <Text style={styles.actionHint}>Notiz und Inhalt endgültig entfernen</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => setView('move')}
                disabled={isPending}
                activeOpacity={0.7}
              >
                <View style={styles.actionIcon}>
                  <Ionicons name="arrow-forward-outline" size={16} color="#6b7280" />
                </View>
                <View style={styles.actionTextWrap}>
                  <Text style={styles.actionLabel}>In andere Notiz verschieben</Text>
                  <Text style={styles.actionHint}>Einer anderen Elternnotiz zuordnen</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionRow}
                onPress={handleDetach}
                disabled={isPending}
                activeOpacity={0.7}
              >
                <View style={styles.actionIcon}>
                  <Ionicons name="unlink-outline" size={16} color="#6b7280" />
                </View>
                <View style={styles.actionTextWrap}>
                  <Text style={styles.actionLabel}>Eigenständig speichern</Text>
                  <Text style={styles.actionHint}>Wird zur Top-Level Notiz</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
                <Text style={styles.cancelText}>Abbrechen</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.moveHeader}>
                <TouchableOpacity onPress={() => { setView('choose'); setSearch('') }}>
                  <Ionicons name="chevron-back" size={22} color="#111827" />
                </TouchableOpacity>
                <Text style={styles.title}>Notiz verschieben</Text>
              </View>

              <View style={styles.searchWrap}>
                <Ionicons name="search-outline" size={16} color="#9ca3af" />
                <TextInput
                  style={styles.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Notiz suchen..."
                  placeholderTextColor="#9ca3af"
                  autoFocus
                />
              </View>

              {isLoading ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator size="small" color="#E8713A" />
                </View>
              ) : moveTargets.length === 0 ? (
                <Text style={styles.emptyText}>Keine Notizen gefunden</Text>
              ) : (
                <FlatList
                  data={moveTargets}
                  keyExtractor={(item) => item.id}
                  style={styles.noteList}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.noteRow}
                      onPress={() => handleMoveTo(item.id)}
                      disabled={isPending}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="document-text-outline" size={16} color="#9ca3af" />
                      <Text style={styles.noteRowTitle} numberOfLines={1}>
                        {item.title || 'Ohne Titel'}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              )}
            </>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 34,
    paddingTop: 8,
    maxHeight: '80%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    paddingHorizontal: 20,
  },
  description: {
    fontSize: 14,
    color: '#6b7280',
    paddingHorizontal: 20,
    marginTop: 4,
    marginBottom: 16,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconDanger: {
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  actionTextWrap: {
    flex: 1,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
  },
  actionHint: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 1,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 8,
    marginHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#6b7280',
  },
  moveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    padding: 0,
  },
  loadingWrap: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#9ca3af',
    paddingVertical: 24,
  },
  noteList: {
    maxHeight: 250,
    marginHorizontal: 20,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  noteRowTitle: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },
})
