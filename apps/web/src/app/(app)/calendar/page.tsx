import { CalendarView } from '@/components/calendar/calendar-view'

export default function CalendarPage(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <CalendarView />
    </div>
  )
}
