import { useState, useCallback, useMemo } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Modal, Dimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useCalendarEvents, type CalendarEvent } from '@/hooks/use-calendar'

const SCREEN_WIDTH = Dimensions.get('window').width
const HOUR_HEIGHT = 60
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

type ViewMode = 'agenda' | 'day'

function fmtTime(d: Date): string {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

// ─── Mini Month Calendar ──────────────────────────────────────────
function MiniMonthCalendar({
  displayMonth,
  selectedDate,
  onSelectDate,
  eventDates,
  onPrevMonth,
  onNextMonth,
}: {
  displayMonth: Date
  selectedDate: Date
  onSelectDate: (d: Date) => void
  eventDates: Set<string>
  onPrevMonth: () => void
  onNextMonth: () => void
}) {
  const year = displayMonth.getFullYear()
  const month = displayMonth.getMonth()
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = new Date(year, month, 1).getDay()
  const startOffset = firstDay === 0 ? 6 : firstDay - 1

  const today = new Date()
  const cells: (number | null)[] = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let i = 1; i <= daysInMonth; i++) cells.push(i)

  const rows: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7))
  }
  while (rows.length > 0 && rows[rows.length - 1].length < 7) {
    rows[rows.length - 1].push(null)
  }

  return (
    <View style={mcStyles.container}>
      <View style={mcStyles.header}>
        <TouchableOpacity onPress={onPrevMonth} hitSlop={12}>
          <Ionicons name="chevron-back" size={20} color="#6b7280" />
        </TouchableOpacity>
        <Text style={mcStyles.monthLabel}>{MONTHS[month]} {year}</Text>
        <TouchableOpacity onPress={onNextMonth} hitSlop={12}>
          <Ionicons name="chevron-forward" size={20} color="#6b7280" />
        </TouchableOpacity>
      </View>

      <View style={mcStyles.weekRow}>
        {WEEKDAYS_SHORT.map((d) => (
          <Text key={d} style={mcStyles.weekDay}>{d}</Text>
        ))}
      </View>

      {rows.map((row, ri) => (
        <View key={ri} style={mcStyles.weekRow}>
          {row.map((day, ci) => {
            if (day === null) return <View key={ci} style={mcStyles.dayCell} />

            const date = new Date(year, month, day)
            const isSelected = isSameDay(date, selectedDate)
            const isToday = isSameDay(date, today)
            const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const hasEvents = eventDates.has(dateKey)

            return (
              <TouchableOpacity
                key={ci}
                style={[
                  mcStyles.dayCell,
                  isSelected && mcStyles.dayCellSelected,
                ]}
                onPress={() => onSelectDate(date)}
                activeOpacity={0.7}
              >
                <Text style={[
                  mcStyles.dayText,
                  isToday && mcStyles.dayTextToday,
                  isSelected && mcStyles.dayTextSelected,
                ]}>
                  {day}
                </Text>
                {hasEvents && !isSelected ? (
                  <View style={mcStyles.eventDot} />
                ) : null}
              </TouchableOpacity>
            )
          })}
        </View>
      ))}
    </View>
  )
}

const mcStyles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 8 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 4,
  },
  monthLabel: { fontSize: 16, fontWeight: '600', color: '#111827' },
  weekRow: { flexDirection: 'row' },
  weekDay: {
    flex: 1, textAlign: 'center',
    fontSize: 12, fontWeight: '500', color: '#9ca3af',
    paddingVertical: 4,
  },
  dayCell: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8,
  },
  dayCellSelected: {
    backgroundColor: '#E8713A', borderRadius: 20,
  },
  dayText: { fontSize: 14, color: '#374151' },
  dayTextToday: { fontWeight: '700', color: '#E8713A' },
  dayTextSelected: { color: '#fff', fontWeight: '600' },
  eventDot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: '#E8713A', marginTop: 2,
  },
})

// ─── Day Time Grid ────────────────────────────────────────────────
function DayTimeGrid({
  events,
  selectedDate,
  onEventPress,
}: {
  events: CalendarEvent[]
  selectedDate: Date
  onEventPress: (ev: CalendarEvent) => void
}) {
  const allDayEvents = events.filter((ev) => ev.is_all_day)
  const timedEvents = events.filter((ev) => !ev.is_all_day)

  return (
    <View>
      {allDayEvents.length > 0 ? (
        <View style={dgStyles.allDaySection}>
          {allDayEvents.map((ev) => (
            <TouchableOpacity
              key={ev.id}
              style={dgStyles.allDayChip}
              onPress={() => onEventPress(ev)}
              activeOpacity={0.7}
            >
              <Text style={dgStyles.allDayText} numberOfLines={1}>{ev.title}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={dgStyles.gridContainer}>
        {HOURS.map((h) => (
          <View key={h} style={dgStyles.hourRow}>
            <Text style={dgStyles.hourLabel}>
              {h.toString().padStart(2, '0')}:00
            </Text>
            <View style={dgStyles.hourLine} />
          </View>
        ))}

        {timedEvents.map((ev) => {
          const start = new Date(ev.start_at)
          const end = new Date(ev.end_at)
          const topMinutes = start.getHours() * 60 + start.getMinutes()
          const durationMinutes = Math.max((end.getTime() - start.getTime()) / 60000, 30)
          const top = (topMinutes / 60) * HOUR_HEIGHT
          const height = (durationMinutes / 60) * HOUR_HEIGHT

          return (
            <TouchableOpacity
              key={ev.id}
              style={[dgStyles.eventBlock, { top: top, height: Math.max(height, 24), left: 52, right: 8 }]}
              onPress={() => onEventPress(ev)}
              activeOpacity={0.8}
            >
              <Text style={dgStyles.eventBlockTitle} numberOfLines={1}>{ev.title}</Text>
              <Text style={dgStyles.eventBlockTime}>
                {fmtTime(start)} – {fmtTime(end)}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

const dgStyles = StyleSheet.create({
  allDaySection: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
    gap: 4,
  },
  allDayChip: {
    backgroundColor: '#dbeafe', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  allDayText: { fontSize: 12, fontWeight: '500', color: '#1e40af' },
  gridContainer: {
    height: 24 * HOUR_HEIGHT,
    position: 'relative',
  },
  hourRow: {
    height: HOUR_HEIGHT,
    flexDirection: 'row', alignItems: 'flex-start',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
  },
  hourLabel: {
    width: 48, textAlign: 'right',
    fontSize: 11, color: '#9ca3af',
    paddingRight: 8, paddingTop: 2,
  },
  hourLine: {
    flex: 1, borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb', marginTop: 8,
  },
  eventBlock: {
    position: 'absolute',
    backgroundColor: '#3b82f6',
    borderRadius: 6, padding: 6,
    overflow: 'hidden',
  },
  eventBlockTitle: { fontSize: 12, fontWeight: '600', color: '#fff' },
  eventBlockTime: { fontSize: 10, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
})

// ─── Agenda Row ───────────────────────────────────────────────────
function AgendaRow({ event, onPress }: { event: CalendarEvent; onPress: () => void }) {
  const start = new Date(event.start_at)
  const end = new Date(event.end_at)

  return (
    <TouchableOpacity style={agStyles.row} onPress={onPress} activeOpacity={0.6}>
      <View style={agStyles.timeCol}>
        <Text style={agStyles.timeText}>
          {event.is_all_day ? 'Ganztag' : fmtTime(start)}
        </Text>
        {!event.is_all_day ? (
          <Text style={agStyles.timeEndText}>{fmtTime(end)}</Text>
        ) : null}
      </View>
      <View style={agStyles.colorBar} />
      <View style={agStyles.content}>
        <Text style={agStyles.title} numberOfLines={2}>{event.title}</Text>
        {event.location ? (
          <View style={agStyles.locationRow}>
            <Ionicons name="location-outline" size={11} color="#6b7280" />
            <Text style={agStyles.locationText} numberOfLines={1}>{event.location}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  )
}

const agStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f3f4f6',
    gap: 12,
  },
  timeCol: { width: 48, alignItems: 'flex-end' },
  timeText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  timeEndText: { fontSize: 11, color: '#9ca3af', marginTop: 1 },
  colorBar: {
    width: 3, height: 36, borderRadius: 2,
    backgroundColor: '#3b82f6',
  },
  content: { flex: 1 },
  title: { fontSize: 14, fontWeight: '500', color: '#111827' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  locationText: { fontSize: 12, color: '#6b7280' },
})

// ─── Event Detail Modal ───────────────────────────────────────────
function EventDetailModal({
  event,
  visible,
  onClose,
}: {
  event: CalendarEvent | null
  visible: boolean
  onClose: () => void
}) {
  if (!event) return null
  const start = new Date(event.start_at)
  const end = new Date(event.end_at)
  const attendees = Array.isArray(event.attendees) ? event.attendees as { email: string; name?: string }[] : []

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={mdStyles.container}>
        <View style={mdStyles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color="#374151" />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={mdStyles.content}>
          <Text style={mdStyles.title}>{event.title}</Text>

          <View style={mdStyles.field}>
            <Ionicons name="time-outline" size={18} color="#6b7280" />
            <Text style={mdStyles.fieldText}>
              {event.is_all_day
                ? start.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
                : `${start.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })} ${fmtTime(start)} – ${fmtTime(end)}`}
            </Text>
          </View>

          {event.location ? (
            <View style={mdStyles.field}>
              <Ionicons name="location-outline" size={18} color="#6b7280" />
              <Text style={mdStyles.fieldText}>{event.location}</Text>
            </View>
          ) : null}

          {event.description ? (
            <View style={mdStyles.field}>
              <Ionicons name="document-text-outline" size={18} color="#6b7280" />
              <Text style={mdStyles.fieldText}>{event.description}</Text>
            </View>
          ) : null}

          {attendees.length > 0 ? (
            <View style={mdStyles.attendeesSection}>
              <View style={mdStyles.field}>
                <Ionicons name="people-outline" size={18} color="#6b7280" />
                <Text style={mdStyles.fieldLabel}>Teilnehmer ({attendees.length})</Text>
              </View>
              {attendees.map((a, i) => (
                <View key={i} style={mdStyles.attendeeRow}>
                  <View style={mdStyles.attendeeAvatar}>
                    <Text style={mdStyles.attendeeInitial}>
                      {(a.name || a.email).charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    {a.name ? <Text style={mdStyles.attendeeName}>{a.name}</Text> : null}
                    <Text style={mdStyles.attendeeEmail}>{a.email}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

const mdStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', justifyContent: 'flex-end',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  content: { padding: 20, gap: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827' },
  field: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  fieldText: { fontSize: 15, color: '#374151', flex: 1, lineHeight: 22 },
  fieldLabel: { fontSize: 15, fontWeight: '600', color: '#374151' },
  attendeesSection: { gap: 8 },
  attendeeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingLeft: 30,
  },
  attendeeAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center',
  },
  attendeeInitial: { fontSize: 12, fontWeight: '600', color: '#374151' },
  attendeeName: { fontSize: 14, fontWeight: '500', color: '#111827' },
  attendeeEmail: { fontSize: 12, color: '#6b7280' },
})

// ─── Main Calendar Screen ──────────────────────────────────────────
export default function CalendarScreen() {
  const [viewMode, setViewMode] = useState<ViewMode>('agenda')
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  })
  const [displayMonth, setDisplayMonth] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Fetch a wider range for the month dots
  const monthStart = useMemo(() => new Date(displayMonth.getFullYear(), displayMonth.getMonth(), 1), [displayMonth])
  const monthEnd = useMemo(() => new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 0, 23, 59, 59), [displayMonth])

  const { data: monthEvents = [], refetch: refetchMonth } = useCalendarEvents(monthStart, monthEnd)

  // Fetch the selected day events
  const dayStart = useMemo(() => new Date(selectedDate), [selectedDate])
  const dayEnd = useMemo(() => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + 1)
    return d
  }, [selectedDate])

  const { data: dayEvents = [], refetch: refetchDay } = useCalendarEvents(dayStart, dayEnd)

  const eventDates = useMemo(() => {
    const set = new Set<string>()
    for (const ev of monthEvents) {
      const d = new Date(ev.start_at)
      set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
    }
    return set
  }, [monthEvents])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([refetchMonth(), refetchDay()])
    setRefreshing(false)
  }, [refetchMonth, refetchDay])

  const goDay = useCallback((delta: number) => {
    setSelectedDate((prev) => {
      const d = new Date(prev)
      d.setDate(d.getDate() + delta)
      if (d.getMonth() !== displayMonth.getMonth() || d.getFullYear() !== displayMonth.getFullYear()) {
        setDisplayMonth(new Date(d.getFullYear(), d.getMonth(), 1))
      }
      return d
    })
  }, [displayMonth])

  const goToday = useCallback(() => {
    const now = new Date()
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    setSelectedDate(d)
    setDisplayMonth(new Date(d.getFullYear(), d.getMonth(), 1))
  }, [])

  const handleSelectDate = useCallback((d: Date) => {
    setSelectedDate(d)
  }, [])

  const today = new Date()
  const isToday = isSameDay(selectedDate, today)

  const sortedDayEvents = useMemo(() =>
    [...dayEvents].sort((a, b) => {
      if (a.is_all_day && !b.is_all_day) return -1
      if (!a.is_all_day && b.is_all_day) return 1
      return new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    }),
    [dayEvents],
  )

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="calendar-outline" size={18} color="#6b7280" />
          <Text style={styles.headerTitle}>Kalender</Text>
        </View>
        <View style={styles.headerRight}>
          {!isToday ? (
            <TouchableOpacity onPress={goToday} style={styles.todayButton}>
              <Text style={styles.todayButtonText}>Heute</Text>
            </TouchableOpacity>
          ) : null}

          {/* View mode toggle */}
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeBtn, viewMode === 'agenda' && styles.modeBtnActive]}
              onPress={() => setViewMode('agenda')}
            >
              <Ionicons name="list-outline" size={16} color={viewMode === 'agenda' ? '#fff' : '#6b7280'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, viewMode === 'day' && styles.modeBtnActive]}
              onPress={() => setViewMode('day')}
            >
              <Ionicons name="today-outline" size={16} color={viewMode === 'day' ? '#fff' : '#6b7280'} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Sticky: Mini month calendar + date nav */}
      <MiniMonthCalendar
        displayMonth={displayMonth}
        selectedDate={selectedDate}
        onSelectDate={handleSelectDate}
        eventDates={eventDates}
        onPrevMonth={() => setDisplayMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
        onNextMonth={() => setDisplayMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
      />

      <View style={styles.dateNav}>
        <TouchableOpacity onPress={() => goDay(-1)} hitSlop={12}>
          <Ionicons name="chevron-back" size={18} color="#6b7280" />
        </TouchableOpacity>
        <Text style={styles.dateLabel}>
          {selectedDate.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
        <TouchableOpacity onPress={() => goDay(1)} hitSlop={12}>
          <Ionicons name="chevron-forward" size={18} color="#6b7280" />
        </TouchableOpacity>
      </View>

      {/* Scrollable: Event-Liste / Timeline */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#E8713A" />}
      >
        {viewMode === 'agenda' ? (
          sortedDayEvents.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="calendar-outline" size={32} color="#d1d5db" />
              <Text style={styles.emptyText}>Keine Termine an diesem Tag</Text>
            </View>
          ) : (
            sortedDayEvents.map((ev) => (
              <AgendaRow
                key={ev.id}
                event={ev}
                onPress={() => setSelectedEvent(ev)}
              />
            ))
          )
        ) : (
          <DayTimeGrid
            events={sortedDayEvents}
            selectedDate={selectedDate}
            onEventPress={(ev) => setSelectedEvent(ev)}
          />
        )}
      </ScrollView>

      <EventDetailModal
        event={selectedEvent}
        visible={selectedEvent !== null}
        onClose={() => setSelectedEvent(null)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  todayButton: {
    backgroundColor: '#fff7ed', borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: '#fdba74',
  },
  todayButtonText: { fontSize: 12, fontWeight: '600', color: '#E8713A' },
  modeToggle: {
    flexDirection: 'row', backgroundColor: '#f3f4f6',
    borderRadius: 8, padding: 2,
  },
  modeBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6,
  },
  modeBtnActive: { backgroundColor: '#E8713A' },
  dateNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  dateLabel: { fontSize: 15, fontWeight: '600', color: '#111827' },
  scrollArea: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  emptyBox: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 60, gap: 8,
  },
  emptyText: { fontSize: 14, color: '#9ca3af' },
})
