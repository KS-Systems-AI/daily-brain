import { useCallback, useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useNotes, useSearchNotes } from '@/hooks/use-notes'

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
  contact_id?: string | null
  company_id?: string | null
  children_count?: number
  contact?:
    | { id: string; first_name: string | null; last_name: string | null }
    | Array<{ id: string; first_name: string | null; last_name: string | null }>
    | null
  company?:
    | { id: string; name: string | null }
    | Array<{ id: string; name: string | null }>
    | null
  created_at: string
  updated_at: string
}

export default function NotesScreen() {
  const router = useRouter()
  const { data, isLoading, refetch, isRefetching } = useNotes()
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const searchInputRef = useRef<TextInput>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const isSearching = debouncedQuery.length > 0
  const { data: searchData, isFetching: isSearchFetching } = useSearchNotes(debouncedQuery, isSearching)

  const notes: NoteItem[] = (data ?? []) as NoteItem[]
  const displayNotes: NoteItem[] = isSearching ? ((searchData ?? []) as NoteItem[]) : notes

  const sorted = [...displayNotes].sort((a, b) => {
    if (!isSearching && a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  })

  const renderItem = useCallback(
    ({ item }: { item: NoteItem }) => {
      const contact = Array.isArray(item.contact) ? item.contact[0] : item.contact
      const company = Array.isArray(item.company) ? item.company[0] : item.company
      const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ')
      const hasContact = Boolean(item.contact_id)
      const hasCompany = Boolean(item.company_id)

      return (
        <TouchableOpacity
          style={styles.noteCard}
          activeOpacity={0.7}
          onPress={() => router.push(`/note/${item.id}`)}
        >
          <View style={styles.noteHeader}>
            <Text style={styles.noteTitle} numberOfLines={1}>
              {item.title || 'Ohne Titel'}
            </Text>
            <View style={styles.noteHeaderRight}>
              {(item.children_count ?? 0) > 0 && (
                <View style={styles.childCountBadge}>
                  <Ionicons name="layers-outline" size={11} color="#6b7280" />
                  <Text style={styles.childCountText}>{item.children_count}</Text>
                </View>
              )}
              {item.is_pinned && (
                <Ionicons name="pin" size={14} color="#E8713A" />
              )}
            </View>
          </View>
          {item.content_text ? (
            <Text style={styles.notePreview} numberOfLines={2}>
              {item.content_text.slice(0, 80)}
            </Text>
          ) : null}

          {(hasContact || hasCompany) && (
            <View style={styles.linkedRow}>
              {hasContact && (
                <View style={[styles.linkedBadge, styles.contactBadge]}>
                  <Ionicons name="person-outline" size={11} color="#1d4ed8" />
                  <Text style={[styles.linkedText, styles.contactText]} numberOfLines={1}>
                    {contactName || 'Person'}
                  </Text>
                </View>
              )}
              {hasCompany && (
                <View style={[styles.linkedBadge, styles.companyBadge]}>
                  <Ionicons name="business-outline" size={11} color="#c2410c" />
                  <Text style={[styles.linkedText, styles.companyText]} numberOfLines={1}>
                    {company?.name || 'Unternehmen'}
                  </Text>
                </View>
              )}
            </View>
          )}

          <Text style={styles.noteTime}>
            {formatRelativeTime(item.updated_at)}
          </Text>
        </TouchableOpacity>
      )
    },
    [router],
  )

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="document-text-outline" size={18} color="#6b7280" />
        <Text style={styles.headerTitle}>Notizen</Text>
        {!isSearching && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{notes.length}</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={() => router.push('/note/new')}
          style={styles.addBtn}
        >
          <Ionicons name="add" size={22} color="#E8713A" />
        </TouchableOpacity>
      </View>

      {/* Suchleiste */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Ionicons name="search-outline" size={16} color="#9ca3af" style={styles.searchIcon} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Notizen durchsuchen..."
            placeholderTextColor="#9ca3af"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => { setSearchQuery(''); searchInputRef.current?.focus() }}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={18} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
        {isSearching && (
          <Text style={styles.searchInfo}>
            {isSearchFetching
              ? 'Suche...'
              : `${sorted.length} Ergebnis${sorted.length !== 1 ? 'se' : ''}`}
          </Text>
        )}
      </View>

      {isLoading && !isSearching ? (
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
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    paddingVertical: 0,
  },
  searchInfo: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 6,
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
  noteHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  childCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  childCountText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6b7280',
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
  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  linkedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: '100%',
  },
  contactBadge: {
    backgroundColor: '#eff6ff',
  },
  companyBadge: {
    backgroundColor: '#fff7ed',
  },
  linkedText: {
    fontSize: 11,
    fontWeight: '600',
  },
  contactText: {
    color: '#1d4ed8',
  },
  companyText: {
    color: '#c2410c',
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
