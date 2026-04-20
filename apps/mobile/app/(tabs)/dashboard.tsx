import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Keyboard,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTasks, useUpdateTask } from '@/hooks/use-tasks'
import { useCalendarEvents, type CalendarEvent } from '@/hooks/use-calendar'
import { useSearchNotes } from '@/hooks/use-notes'
import { formatRelativeDate, formatTime, isOverdue } from '@/lib/task-parser'

interface Task {
  id: string
  title: string
  description: string | null
  due_at: string | null
  end_at: string | null
  completed_at: string | null
  status: string | null
  priority: string | null
  position: number | null
  contact_id: string | null
  company_id: string | null
  contact?:
    | { id: string; first_name: string; last_name: string | null }
    | { id: string; first_name: string; last_name: string | null }[]
    | null
  company?: { id: string; name: string } | { id: string; name: string }[] | null
  created_at: string
  updated_at: string
}

type TimelineItem =
  | { kind: 'event'; sortTime: number; event: CalendarEvent }
  | { kind: 'task'; sortTime: number; task: Task }

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Guten Morgen'
  if (h < 18) return 'Guten Tag'
  return 'Guten Abend'
}

function isTodayOrOverdue(task: Task): boolean {
  const isDone = task.status === 'done' || task.status === 'cancelled'
  if (isDone) return false
  if (!task.due_at) return true
  const now = new Date()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return new Date(task.due_at) < todayEnd
}

function fmtTime(d: Date): string {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function EventRow({ event }: { event: CalendarEvent }) {
  const start = new Date(event.start_at)
  const end = new Date(event.end_at)

  return (
    <View style={styles.eventRow}>
      <View style={styles.eventDot} />
      <View style={styles.eventContent}>
        <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
        <View style={styles.eventMeta}>
          <Text style={styles.eventTime}>
            {event.is_all_day ? 'Ganztägig' : `${fmtTime(start)} – ${fmtTime(end)}`}
          </Text>
          {event.location ? (
            <View style={styles.eventLocationBadge}>
              <Ionicons name="location-outline" size={10} color="#6b7280" />
              <Text style={styles.eventLocationText} numberOfLines={1}>{event.location}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  )
}

function TaskRow({
  task, onToggle, onPress,
}: {
  task: Task; onToggle: () => void; onPress: () => void
}) {
  const isDone = task.status === 'done' || task.status === 'cancelled'
  const dueDate = task.due_at ? new Date(task.due_at) : null
  const endDate = task.end_at ? new Date(task.end_at) : null
  const overdue = dueDate && !isDone && isOverdue(dueDate)
  const contact = Array.isArray(task.contact) ? task.contact[0] : task.contact
  const company = Array.isArray(task.company) ? task.company[0] : task.company
  const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ')
  const linkedLabel = contactName || company?.name || null

  return (
    <TouchableOpacity style={styles.taskRow} onPress={onPress} activeOpacity={0.6}>
      <TouchableOpacity onPress={onToggle} hitSlop={12} style={styles.statusBtn}>
        <Ionicons
          name={isDone ? 'checkmark-circle' : 'ellipse-outline'}
          size={22}
          color={isDone ? '#22c55e' : '#d1d5db'}
        />
      </TouchableOpacity>
      <View style={styles.taskContent}>
        <Text style={[styles.taskTitle, isDone && styles.taskTitleDone]} numberOfLines={1}>
          {task.title}
        </Text>
        {linkedLabel && (
          <View style={styles.linkedBadge}>
            <Ionicons name="person-outline" size={10} color="#6b7280" />
            <Text style={styles.linkedText} numberOfLines={1}>
              {linkedLabel}
            </Text>
          </View>
        )}
        {dueDate && (
          <View style={styles.taskMeta}>
            <View style={[styles.dateBadge, overdue && styles.dateBadgeOverdue]}>
              <Ionicons name="calendar-outline" size={10} color={overdue ? '#dc2626' : '#6b7280'} />
              <Text style={[styles.dateText, overdue && styles.dateTextOverdue]}>
                {formatRelativeDate(dueDate)}
                {(dueDate.getHours() !== 0 || dueDate.getMinutes() !== 0) && ` ${formatTime(dueDate)}`}
                {endDate && ` – ${formatTime(endDate)}`}
              </Text>
            </View>
          </View>
        )}
      </View>
    </TouchableOpacity>
  )
}

export default function DashboardScreen() {
  const router = useRouter()
  const { data: activeTasks, isLoading, refetch } = useTasks()
  const [manualRefreshing, setManualRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const searchRef = useRef<TextInput>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  const isSearching = debouncedSearch.length > 0
  const { data: searchResults, isFetching: isSearchFetching } = useSearchNotes(debouncedSearch, isSearching)

  const todayStart = useMemo(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }, [])
  const todayEnd = useMemo(() => {
    const d = new Date(todayStart)
    d.setDate(d.getDate() + 1)
    return d
  }, [todayStart])

  const { data: calendarEvents, refetch: refetchCal } = useCalendarEvents(todayStart, todayEnd)

  const handleRefresh = useCallback(async () => {
    setManualRefreshing(true)
    await Promise.all([refetch(), refetchCal()])
    setManualRefreshing(false)
  }, [refetch, refetchCal])
  const updateTask = useUpdateTask()

  const tasks = (activeTasks ?? []) as Task[]

  const timeline = useMemo(() => {
    const items: TimelineItem[] = []

    for (const ev of calendarEvents ?? []) {
      items.push({
        kind: 'event',
        sortTime: ev.is_all_day ? -1 : new Date(ev.start_at).getTime(),
        event: ev,
      })
    }

    const todayTasks = tasks.filter(isTodayOrOverdue)
    for (const task of todayTasks) {
      const dueAt = task.due_at ? new Date(task.due_at) : null
      const hasTime = dueAt && (dueAt.getHours() !== 0 || dueAt.getMinutes() !== 0)
      items.push({
        kind: 'task',
        sortTime: hasTime ? dueAt!.getTime() : Infinity,
        task,
      })
    }

    items.sort((a, b) => {
      if (a.sortTime === -1 && b.sortTime !== -1) return -1
      if (b.sortTime === -1 && a.sortTime !== -1) return 1
      return a.sortTime - b.sortTime
    })

    return items
  }, [calendarEvents, tasks])

  const badgeCount = useMemo(
    () => tasks.filter((t) => {
      const isDone = t.status === 'done' || t.status === 'cancelled'
      if (isDone) return false
      if (!t.due_at) return true
      return new Date(t.due_at).getTime() < Date.now()
    }).length,
    [tasks],
  )

  const toggleDone = useCallback((task: Task) => {
    const isDone = task.status === 'done'
    updateTask.mutate({
      id: task.id,
      status: isDone ? 'todo' : 'done',
      completed_at: isDone ? null : new Date().toISOString(),
    })
  }, [updateTask])

  const today = new Date()

  const renderItem = useCallback(({ item }: { item: TimelineItem }) => {
    if (item.kind === 'event') {
      return <EventRow event={item.event} />
    }
    return (
      <TaskRow
        task={item.task}
        onToggle={() => toggleDone(item.task)}
        onPress={() => router.push(`/task/${item.task.id}`)}
      />
    )
  }, [toggleDone, router])

  const ListHeader = useCallback(() => (
    <View>
      <Text style={styles.greeting}>{getGreeting()}.</Text>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.quickAction}
          activeOpacity={0.7}
          onPress={() => router.push('/task/voice')}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: '#fef3c7' }]}>
            <Ionicons name="mic" size={20} color="#d97706" />
          </View>
          <Text style={styles.quickActionLabel}>Diktieren</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.quickAction}
          activeOpacity={0.7}
          onPress={() => router.push('/task/new')}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: '#fff7ed' }]}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#E8713A" />
          </View>
          <Text style={styles.quickActionLabel}>Aufgabe</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.quickAction}
          activeOpacity={0.7}
          onPress={() => router.push('/contact/new')}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: '#f0f9ff' }]}>
            <Ionicons name="person-add-outline" size={20} color="#3b82f6" />
          </View>
          <Text style={styles.quickActionLabel}>Kontakt</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.quickAction}
          activeOpacity={0.7}
          onPress={() => router.push('/note/new')}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: '#f0fdf4' }]}>
            <Ionicons name="document-text-outline" size={20} color="#22c55e" />
          </View>
          <Text style={styles.quickActionLabel}>Notiz</Text>
        </TouchableOpacity>
      </View>

      {/* Timeline Header */}
      {!isSearching && (
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Tagesplan</Text>
            {badgeCount > 0 && (
              <View style={styles.badgeRed}>
                <Text style={styles.badgeRedText}>{badgeCount}</Text>
              </View>
            )}
          </View>
          <View style={styles.sectionActions}>
            <Text style={styles.todayLabel}>
              Heute, {today.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}
            </Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/tasks')} hitSlop={10}>
              <Text style={styles.allLink}>Alle</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  ), [badgeCount, today, router, isSearching])

  const searchResultItems = useMemo(
    () => (searchResults ?? []).map((n) => ({ kind: 'search-result' as const, note: n })),
    [searchResults],
  )

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Ionicons name="home-outline" size={18} color="#6b7280" />
        <Text style={styles.headerTitle}>Start</Text>
      </View>

      {isLoading && !activeTasks ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color="#E8713A" />
        </View>
      ) : (
        <FlatList
          data={isSearching ? searchResultItems : timeline}
          keyExtractor={(item) => {
            if (item.kind === 'search-result') return `sr-${item.note.id}`
            return item.kind === 'event' ? `ev-${item.event.id}` : `task-${item.task.id}`
          }}
          renderItem={({ item }) => {
            if (item.kind === 'search-result') {
              const note = item.note
              return (
                <TouchableOpacity
                  style={styles.searchResultRow}
                  activeOpacity={0.6}
                  onPress={() => {
                    setSearchQuery('')
                    Keyboard.dismiss()
                    router.push(`/note/${note.id}`)
                  }}
                >
                  <Ionicons name="document-text-outline" size={16} color="#6b7280" />
                  <View style={styles.searchResultContent}>
                    <Text style={styles.searchResultTitle} numberOfLines={1}>
                      {note.title || 'Ohne Titel'}
                    </Text>
                    {note.content_text ? (
                      <Text style={styles.searchResultPreview} numberOfLines={1}>
                        {note.content_text.slice(0, 80)}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={14} color="#d1d5db" />
                </TouchableOpacity>
              )
            }
            return renderItem({ item })
          }}
          ListHeaderComponent={
            <View>
              <ListHeader />

              {/* Suchleiste — stabiler JSX-Knoten, kein Funktions-Wrapper */}
              <View style={styles.searchContainer}>
                <View style={styles.searchInputWrapper}>
                  <Ionicons name="search-outline" size={16} color="#9ca3af" style={{ marginRight: 8 }} />
                  <TextInput
                    ref={searchRef}
                    style={styles.searchInput}
                    placeholder="Suchen..."
                    placeholderTextColor="#9ca3af"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    returnKeyType="search"
                    autoCorrect={false}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity
                      onPress={() => { setSearchQuery(''); Keyboard.dismiss() }}
                      hitSlop={8}
                    >
                      <Ionicons name="close-circle" size={18} color="#9ca3af" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {isSearching && (
                <View style={styles.searchResultsHeader}>
                  <Ionicons name="document-text-outline" size={13} color="#9ca3af" />
                  <Text style={styles.searchResultsLabel}>
                    {isSearchFetching
                      ? 'Suche...'
                      : `${searchResultItems.length} Notiz${searchResultItems.length !== 1 ? 'en' : ''}`}
                  </Text>
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            isSearching
              ? (isSearchFetching ? null : (
                  <View style={styles.searchEmptyBox}>
                    <Text style={styles.searchEmptyText}>Keine Ergebnisse</Text>
                  </View>
                ))
              : (
                <View style={styles.emptyBox}>
                  <Ionicons name="checkmark-done-circle-outline" size={32} color="#d1d5db" />
                  <Text style={styles.emptyText}>Keine Einträge für heute</Text>
                </View>
              )
          }
          refreshControl={
            <RefreshControl refreshing={manualRefreshing} onRefresh={handleRefresh} tintColor="#E8713A" />
          }
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  headerTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingBottom: 40 },
  greeting: {
    fontSize: 28, fontWeight: '700', color: '#111827',
    paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8,
  },
  quickActions: {
    flexDirection: 'row', gap: 12,
    paddingHorizontal: 20, paddingVertical: 16,
  },
  quickAction: {
    flex: 1, alignItems: 'center', gap: 8,
    backgroundColor: '#f9fafb', borderRadius: 16,
    paddingVertical: 16, borderWidth: 1, borderColor: '#e5e7eb',
  },
  quickActionIcon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  quickActionLabel: {
    fontSize: 12, fontWeight: '600', color: '#374151',
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8,
  },
  sectionTitleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  badgeRed: {
    backgroundColor: '#fef2f2', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  badgeRedText: { fontSize: 11, fontWeight: '600', color: '#dc2626' },
  sectionActions: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  todayLabel: { fontSize: 12, color: '#9ca3af' },
  allLink: { fontSize: 12, fontWeight: '600', color: '#E8713A' },
  // Event styles
  eventRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f3f4f6',
    gap: 12,
  },
  eventDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#60a5fa',
  },
  eventContent: { flex: 1 },
  eventTitle: { fontSize: 14, color: '#374151', fontWeight: '500' },
  eventMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  eventTime: { fontSize: 12, color: '#9ca3af' },
  eventLocationBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
  },
  eventLocationText: { fontSize: 11, color: '#6b7280', maxWidth: 120 },
  // Task styles
  taskRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f3f4f6',
    gap: 12,
  },
  statusBtn: { padding: 2 },
  taskContent: { flex: 1 },
  taskTitle: { fontSize: 14, color: '#111827', lineHeight: 20 },
  taskTitleDone: { color: '#9ca3af', textDecorationLine: 'line-through' },
  taskMeta: { flexDirection: 'row', marginTop: 4, gap: 6 },
  linkedBadge: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  linkedText: { fontSize: 11, color: '#6b7280', maxWidth: 180 },
  dateBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#f9fafb', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  dateBadgeOverdue: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  dateText: { fontSize: 11, color: '#6b7280' },
  dateTextOverdue: { color: '#dc2626' },
  emptyBox: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 40, gap: 8,
  },
  emptyText: { fontSize: 13, color: '#9ca3af' },
  // Search
  searchContainer: {
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    padding: 0,
  },
  searchResults: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  searchResultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchResultsLabel: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '500',
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
  },
  searchResultContent: {
    flex: 1,
  },
  searchResultTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  searchResultPreview: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 1,
  },
  searchEmptyBox: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  searchEmptyText: {
    fontSize: 13,
    color: '#9ca3af',
  },
})
