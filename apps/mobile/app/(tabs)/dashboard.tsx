import { useState, useCallback, useMemo } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTasks, useUpdateTask } from '@/hooks/use-tasks'
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
  created_at: string
  updated_at: string
}

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

function TaskRow({
  task, onToggle, onPress,
}: {
  task: Task; onToggle: () => void; onPress: () => void
}) {
  const isDone = task.status === 'done' || task.status === 'cancelled'
  const dueDate = task.due_at ? new Date(task.due_at) : null
  const endDate = task.end_at ? new Date(task.end_at) : null
  const overdue = dueDate && !isDone && isOverdue(dueDate)

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
  const { data: activeTasks, isLoading, refetch, isRefetching } = useTasks()
  const updateTask = useUpdateTask()

  const tasks = (activeTasks ?? []) as Task[]
  const todayTasks = useMemo(() => tasks.filter(isTodayOrOverdue), [tasks])

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

  const renderTask = useCallback(({ item }: { item: Task }) => (
    <TaskRow
      task={item}
      onToggle={() => toggleDone(item)}
      onPress={() => router.push(`/task/${item.id}`)}
    />
  ), [toggleDone, router])

  const ListHeader = useCallback(() => (
    <View>
      {/* Greeting */}
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

      {/* Tasks Header */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>Aufgaben</Text>
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
    </View>
  ), [badgeCount, today, router])

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Ionicons name="home-outline" size={18} color="#6b7280" />
        <Text style={styles.headerTitle}>Start</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color="#E8713A" />
        </View>
      ) : (
        <FlatList
          data={todayTasks}
          keyExtractor={(item) => item.id}
          renderItem={renderTask}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="checkmark-done-circle-outline" size={32} color="#d1d5db" />
              <Text style={styles.emptyText}>Keine Aufgaben für heute</Text>
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#E8713A" />
          }
          contentContainerStyle={styles.listContent}
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
})
