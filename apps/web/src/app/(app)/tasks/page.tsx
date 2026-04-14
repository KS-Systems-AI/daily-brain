import type { Metadata } from 'next'
import { TaskList } from '@/components/tasks/task-list'

export const metadata: Metadata = {
  title: 'Aufgaben — Daily Brain',
}

export default function TasksPage(): React.JSX.Element {
  return <TaskList />
}
