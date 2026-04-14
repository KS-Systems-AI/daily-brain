import { View, StyleSheet, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams } from 'expo-router'
import { useTask } from '@/hooks/use-tasks'
import TaskForm from '@/components/task-form'

export default function EditTaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: task, isLoading } = useTask(id)

  if (isLoading || !task) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#E8713A" />
        </View>
      </SafeAreaView>
    )
  }

  return <TaskForm task={task} />
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
