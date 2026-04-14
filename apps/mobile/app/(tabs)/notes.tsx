import { useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useNotes } from '@/hooks/use-notes'

function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diff = now - date
  const minutes = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)

  if (minutes < 1) return 'Gerade eben'
  if (minutes < 60) return `vor ${minutes} Min.`
  if (hours < 24) return `vor ${hours} Std.`
  if (days < 7) return `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

interface NoteItem {
  id: string
  title: string | null
  content_text: string | null
  is_pinned: boolean
  created_at: string
  updated_at: string
}

export default function NotesScreen() {
  const router = useRouter()
  const { data, isLoading, refetch, isRefetching } = useNotes()

  const notes: NoteItem[] = (data ?? []) as NoteItem[]

  const sorted = [...notes].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  })

  const renderItem = useCallback(
    ({ item }: { item: NoteItem }) => (
      <TouchableOpacity
        style={styles.noteCard}
        activeOpacity={0.7}
        onPress={() => router.push(`/note/${item.id}`)}
      >
        <View style={styles.noteHeader}>
          <Text style={styles.noteTitle} numberOfLines={1}>
            {item.title || 'Ohne Titel'}
          </Text>
          {item.is_pinned && (
            <Ionicons name="pin" size={14} color="#E8713A" />
          )}
        </View>
        {item.content_text ? (
          <Text style={styles.notePreview} numberOfLines={2}>
            {item.content_text.slice(0, 80)}
          </Text>
        ) : null}
        <Text style={styles.noteTime}>
          {formatRelativeTime(item.updated_at)}
        </Text>
      </TouchableOpacity>
    ),
    [router],
  )

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="document-text-outline" size={18} color="#6b7280" />
        <Text style={styles.headerTitle}>Notizen</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{sorted.length}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={() => router.push('/note/new')}
          style={styles.addBtn}
        >
          <Ionicons name="add" size={22} color="#E8713A" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#E8713A" />
        </View>
      ) : sorted.length === 0 ? (
        <View style={styles.center}>
          <Ionicons
            name="document-text-outline"
            size={48}
            color="#d1d5db"
          />
          <Text style={styles.emptyText}>Noch keine Notizen</Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onRefresh={refetch}
          refreshing={isRefetching}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  badge: {
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
  },
  addBtn: {
    padding: 4,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  noteCard: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  notePreview: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
    lineHeight: 20,
  },
  noteTime: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 6,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
  },
})
