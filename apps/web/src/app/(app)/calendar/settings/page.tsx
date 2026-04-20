import { Suspense } from 'react'
import { CalendarSettings } from '@/components/calendar/calendar-settings'

export default function CalendarSettingsPage(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Kalender-Einstellungen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Verbinde externe Kalender und verwalte die Synchronisierung.
        </p>
      </div>
      <Suspense>
        <CalendarSettings />
      </Suspense>
    </div>
  )
}
