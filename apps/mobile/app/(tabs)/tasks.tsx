import { useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTasks, useCompletedTasks, useUpdateTask, useDeleteTask } from '@/hooks/use-tasks'
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

function TaskRow({
  task,
  onToggle,
  onPress,
  onDelete,
}: {
  task: Task
  onToggle: () => void
  onPress: () => void
  onDelete: () => void
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
        <Text
          style={[
            styles.taskTitle,
            isDone && styles.taskTitleDone,
          ]}
          numberOfLines={1}
        >
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
              <Ionicons
                name="calendar-outline"
                size={10}
                color={overdue ? '#dc2626' : '#6b7280'}
              />
              <Text style={[styles.dateText, overdue && styles.dateTextOverdue]}>
                {formatRelativeDate(dueDate)}
                {(dueDate.getHours() !== 0 || dueDate.getMinutes() !== 0) &&
                  ` ${formatTime(dueDate)}`}
                {endDate && ` – ${formatTime(endDate)}`}
              </Text>
            </View>
          </View>
        )}
      </View>

      <TouchableOpacity onPress={onDelete} hitSlop={10} style={styles.deleteBtn}>
        <Ionicons name="trash-outline" size={16} color="#d1d5db" />
      </TouchableOpacity>
    </TouchableOpacity>
  )
}

export default function TasksScreen() {
  const router = useRouter()
  const { data: activeTasks, isLoading, refetch, isRefetching } = useTasks()
  const { data: completedTasks } = useCompletedTasks()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const [showCompleted, setShowCompleted] = useState(false)

  const tasks = (activeTasks ?? []) as Task[]
  const completed = (completedTasks ?? []) as Task[]

  const toggleDone = useCallback((task: Task) => {
    const isDone = task.status === 'done'
    updateTask.mutate({
      id: task.id,
      status: isDone ? 'todo' : 'done',
      completed_at: isDone ? null : new Date().toISOString(),
    })
  }, [updateTask])

  const handleDelete = useCallback((id: string) => {
    deleteTask.mutate(id)
  }, [deleteTask])

  const renderTask = useCallback(({ item }: { item: Task }) => (
    <TaskRow
      task={item}
      onToggle={() => toggleDone(item)}
      onPress={() => router.push(`/task/${item.id}`)}
      onDelete={() => handleDelete(item.id)}
    />
  ), [toggleDone, handleDelete, router])

  const ListFooter = useCallback(() => {
    if (completed.length === 0) return null
    return (
      <View style={styles.completedSection}>
        <TouchableOpacity
          style={styles.completedHeader}
          onPress={() => setShowCompleted((v) => !v)}
        >
          <Ionicons
            name={showCompleted ? 'chevron-down' : 'chevron-forward'}
            size={14}
            color="#9ca3af"
          />
          <Text style={styles.completedLabel}>Erledigt · {completed.length}</Text>
        </TouchableOpacity>
        {showCompleted &&
          completed.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={() => toggleDone(task)}
              onPress={() => router.push(`/task/${task.id}`)}
              onDelete={() => handleDelete(task.id)}
            />
          ))}
      </View>
    )
  }, [completed, showCompleted, toggleDone, handleDelete, router])

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Ionicons name="checkmark-circle-outline" size={18} color="#6b7280" />
        <Text style={styles.headerTitle}>Aufgaben</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{tasks.length}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={() => router.push('/task/voice')}
          style={styles.addBtn}
        >
          <Ionicons name="mic" size={20} color="#E8713A" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push('/task/new')}
          style={styles.addBtn}
        >
          <Ionicons name="add" size={22} color="#E8713A" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color="#E8713A" />
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          renderItem={renderTask}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>Keine Aufgaben</Text>
            </View>
          }
          ListFooterComponent={ListFooter}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor="#E8713A"
            />
          }
          contentContainerStyle={tasks.length === 0 ? styles.emptyContainer : styles.listContent}
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 13,
    color: '#9ca3af',
  },
  emptyContainer: {
    flexGrow: 1,
  },
  listContent: {
    paddingBottom: 40,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
    gap: 12,
  },
  statusBtn: {
    padding: 2,
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 14,
    color: '#111827',
    lineHeight: 20,
  },
  taskTitleDone: {
    color: '#9ca3af',
    textDecorationLine: 'line-through',
  },
  taskMeta: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 6,
  },
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
  linkedText: {
    fontSize: 11,
    color: '#6b7280',
    maxWidth: 180,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  dateBadgeOverdue: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  dateText: {
    fontSize: 11,
    color: '#6b7280',
  },
  dateTextOverdue: {
    color: '#dc2626',
  },
  deleteBtn: {
    padding: 4,
  },
  completedSection: {
    marginTop: 16,
    paddingHorizontal: 20,
  },
  completedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  completedLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9ca3af',
  },
})
