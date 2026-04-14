import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Keyboard, Modal, Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useCreateTask, useUpdateTask, useDeleteTask } from '@/hooks/use-tasks'
import { parseTaskInput, formatRelativeDate, formatTime } from '@/lib/task-parser'
import { RecordSelector, type SelectedRecord } from '@/components/record-selector'

function timeToMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

function minutesToDate(base: Date, mins: number): Date {
  const r = new Date(base)
  r.setHours(Math.floor(mins / 60) % 24, mins % 60, 0, 0)
  return r
}

function formatDurationMin(mins: number): string {
  if (mins <= 0) return ''
  return `${mins}`
}

function parseDurationText(text: string): number | null {
  const digits = text.replace(/\D/g, '')
  if (!digits) return null
  const num = parseInt(digits, 10)
  return Number.isFinite(num) && num > 0 ? num : null
}

interface TaskData {
  id: string
  title: string
  description: string | null
  due_at: string | null
  end_at: string | null
  status: string | null
  contact_id?: string | null
  company_id?: string | null
  contact?: { id: string; first_name: string; last_name: string | null } | { id: string; first_name: string; last_name: string | null }[] | null
  company?: { id: string; name: string } | { id: string; name: string }[] | null
}

type ActivePicker = 'date' | 'startTime' | 'endTime' | null

interface TaskFormProps {
  task?: TaskData | null
}

export default function TaskForm({ task }: TaskFormProps) {
  const router = useRouter()
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const isEdit = !!task

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState<Date | null>(null)
  const [dueTime, setDueTime] = useState<Date | null>(null)
  const [endTime, setEndTime] = useState<Date | null>(null)
  const [durationMin, setDurationMin] = useState<number | null>(null)
  const [durationText, setDurationText] = useState('')
  const [isDurationFocused, setIsDurationFocused] = useState(false)
  const [linkedRecord, setLinkedRecord] = useState<SelectedRecord | null>(null)
  const [activePicker, setActivePicker] = useState<ActivePicker>(null)
  const [initialized, setInitialized] = useState(false)
  const pickerSnapshotRef = useRef<{
    dueDate: Date | null
    dueTime: Date | null
    endTime: Date | null
  } | null>(null)

  useEffect(() => {
    if (!task || initialized) return
    setTitle(task.title)
    setDescription(task.description ?? '')

    const due = task.due_at ? new Date(task.due_at) : null
    const end = task.end_at ? new Date(task.end_at) : null
    setDueDate(due)
    if (due && (due.getHours() !== 0 || due.getMinutes() !== 0)) {
      setDueTime(due)
    }
    const contact = Array.isArray(task.contact) ? task.contact[0] : task.contact
    const company = Array.isArray(task.company) ? task.company[0] : task.company
    if (task.contact_id) {
      const label = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ') || 'Kontakt'
      setLinkedRecord({ id: task.contact_id, type: 'contact', label })
    } else if (task.company_id) {
      setLinkedRecord({ id: task.company_id, type: 'company', label: company?.name || 'Unternehmen' })
    } else {
      setLinkedRecord(null)
    }
    if (end) {
      setEndTime(end)
      if (due) {
        const d = Math.round((end.getTime() - due.getTime()) / 60000)
        if (d > 0) {
          setDurationMin(d)
          setDurationText(formatDurationMin(d))
        }
      }
    }
    setInitialized(true)
  }, [task, initialized])

  const parsedPreview = useMemo(() => {
    if (isEdit || !title.trim()) return null
    const p = parseTaskInput(title)
    if (p.due_at && p.title !== title) return p
    return null
  }, [title, isEdit])

  const applyParsing = useCallback(() => {
    if (isEdit) return
    const parsed = parseTaskInput(title)
    if (!parsed.due_at || parsed.title === title) return
    setTitle(parsed.title)
    setDueDate(parsed.due_at)
    if (parsed.due_at.getHours() !== 0 || parsed.due_at.getMinutes() !== 0) {
      setDueTime(parsed.due_at)
    }
    if (parsed.end_at) {
      setEndTime(parsed.end_at)
      const d = Math.round((parsed.end_at.getTime() - parsed.due_at.getTime()) / 60000)
      if (d > 0) {
        setDurationMin(d)
        setDurationText(formatDurationMin(d))
      }
    }
  }, [title, isEdit])

  const handleDateChange = useCallback((_: any, selected?: Date) => {
    if (Platform.OS === 'android') setActivePicker(null)
    if (selected) setDueDate(selected)
  }, [])

  const handleStartTimeChange = useCallback((_: any, selected?: Date) => {
    if (Platform.OS === 'android') setActivePicker(null)
    if (!selected) return
    setDueTime(selected)
    if (durationMin && durationMin > 0) {
      setEndTime(minutesToDate(selected, timeToMinutes(selected) + durationMin))
    }
  }, [durationMin])

  const handleEndTimeChange = useCallback((_: any, selected?: Date) => {
    if (Platform.OS === 'android') setActivePicker(null)
    if (!selected) return
    setEndTime(selected)
    if (dueTime) {
      const d = timeToMinutes(selected) - timeToMinutes(dueTime)
      if (d > 0) {
        setDurationMin(d)
        setDurationText(formatDurationMin(d))
      }
    }
  }, [dueTime])

  const handleDurationBlur = useCallback(() => {
    const mins = parseDurationText(durationText)
    setDurationMin(mins)
    if (mins && mins > 0) {
      setDurationText(formatDurationMin(mins))
      if (dueTime) {
        setEndTime(minutesToDate(dueTime, timeToMinutes(dueTime) + mins))
      }
    }
  }, [durationText, dueTime])

  const togglePicker = useCallback((picker: Exclude<ActivePicker, null>) => {
    Keyboard.dismiss()
    setActivePicker((prev) => {
      const next = prev === picker ? null : picker
      if (next) {
        pickerSnapshotRef.current = {
          dueDate,
          dueTime,
          endTime,
        }
      }
      return next
    })
  }, [dueDate, dueTime, endTime])

  const handlePickerCancel = useCallback(() => {
    const snapshot = pickerSnapshotRef.current
    if (snapshot) {
      setDueDate(snapshot.dueDate)
      setDueTime(snapshot.dueTime)
      setEndTime(snapshot.endTime)
    }
    setActivePicker(null)
    pickerSnapshotRef.current = null
  }, [])

  const handlePickerDone = useCallback(() => {
    setActivePicker(null)
    pickerSnapshotRef.current = null
  }, [])

  const buildISODate = useCallback((): string | null => {
    if (!dueDate) return null
    const d = new Date(dueDate)
    if (dueTime) {
      d.setHours(dueTime.getHours(), dueTime.getMinutes(), 0, 0)
    } else {
      d.setHours(0, 0, 0, 0)
    }
    return d.toISOString()
  }, [dueDate, dueTime])

  const buildEndISO = useCallback((): string | null => {
    if (!dueDate || !endTime) return null
    const d = new Date(dueDate)
    d.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0)
    return d.toISOString()
  }, [dueDate, endTime])

  const handleSubmit = useCallback(() => {
    if (!title.trim()) return
    if (isEdit && task) {
      updateTask.mutate(
        {
          id: task.id,
          title: title.trim(),
          description: description.trim() || null,
          due_at: buildISODate(),
          end_at: buildEndISO(),
          contact_id: linkedRecord?.type === 'contact' ? linkedRecord.id : null,
          company_id: linkedRecord?.type === 'company' ? linkedRecord.id : null,
        },
        {
          onSuccess: () => router.back(),
          onError: (err) => Alert.alert('Fehler', err.message || 'Aufgabe konnte nicht gespeichert werden.'),
        },
      )
    } else {
      createTask.mutate(
        {
          title: title.trim(),
          description: description.trim() || undefined,
          due_at: buildISODate(),
          end_at: buildEndISO(),
          contact_id: linkedRecord?.type === 'contact' ? linkedRecord.id : null,
          company_id: linkedRecord?.type === 'company' ? linkedRecord.id : null,
        },
        {
          onSuccess: () => router.back(),
          onError: (err) => Alert.alert('Fehler', err.message || 'Aufgabe konnte nicht erstellt werden.'),
        },
      )
    }
  }, [title, description, buildISODate, buildEndISO, linkedRecord, isEdit, task, createTask, updateTask, router])

  const handleDelete = useCallback(() => {
    if (!task) return
    Alert.alert(
      'Aufgabe löschen',
      'Möchtest du diese Aufgabe wirklich löschen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () => deleteTask.mutate(task.id, { onSuccess: () => router.back() }),
        },
      ],
    )
  }, [task, deleteTask, router])

  const submitting = createTask.isPending || updateTask.isPending

  const pickerDate = activePicker === 'date'
    ? (dueDate ?? new Date())
    : activePicker === 'startTime'
      ? (dueTime ?? new Date())
      : activePicker === 'endTime'
        ? (endTime ?? (dueTime ?? new Date()))
        : new Date()

  const pickerMode = activePicker === 'date' ? 'date' as const : 'time' as const

  const pickerOnChange = activePicker === 'date'
    ? handleDateChange
    : activePicker === 'startTime'
      ? handleStartTimeChange
      : handleEndTimeChange

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={24} color="#E8713A" />
          <Text style={styles.backText}>Zurück</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {isEdit && (
          <TouchableOpacity onPress={handleDelete} hitSlop={10}>
            <Ionicons name="trash-outline" size={20} color="#ef4444" />
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.heading}>{isEdit ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}</Text>
          {!isEdit && (
            <Text style={styles.subtitle}>Gib einen Titel ein — Datum und Uhrzeit werden erkannt.</Text>
          )}

          <View style={styles.form}>
            {/* Title */}
            <View style={styles.field}>
              <Text style={styles.label}>{isEdit ? 'Titel' : 'Aufgabe'}<Text style={styles.required}> *</Text></Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder={isEdit ? 'Aufgabentitel' : 'z.B. Markus anrufen morgen um 15:00'}
                placeholderTextColor="#9ca3af"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={isEdit ? undefined : applyParsing}
              />
              {parsedPreview && (
                <TouchableOpacity style={styles.previewChip} onPress={applyParsing} activeOpacity={0.7}>
                  <Ionicons name="calendar-outline" size={12} color="#E8713A" />
                  <Text style={styles.previewText}>
                    {formatRelativeDate(parsedPreview.due_at!)}
                    {(parsedPreview.due_at!.getHours() !== 0 || parsedPreview.due_at!.getMinutes() !== 0)
                      ? ` ${formatTime(parsedPreview.due_at!)}`
                      : ''}
                    {parsedPreview.end_at ? ` – ${formatTime(parsedPreview.end_at)}` : ''}
                  </Text>
                  <Text style={styles.previewHint}>Übernehmen</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Description */}
            <View style={styles.field}>
              <Text style={styles.label}>Beschreibung</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Optionale Details..."
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {/* Date */}
            <View style={styles.field}>
              <Text style={styles.label}>Verknüpft mit</Text>
              <RecordSelector value={linkedRecord} onChange={setLinkedRecord} />
            </View>

            {/* Date */}
            <View style={styles.field}>
              <Text style={styles.label}>Datum</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => togglePicker('date')}
                activeOpacity={0.7}
              >
                <Ionicons name="calendar-outline" size={16} color="#6b7280" />
                <Text style={[styles.pickerText, !dueDate && styles.pickerPlaceholder]}>
                  {dueDate ? dueDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Datum auswählen'}
                </Text>
                {dueDate && (
                  <TouchableOpacity onPress={() => { setDueDate(null); setDueTime(null); setEndTime(null); setDurationMin(null); setDurationText('') }} hitSlop={10}>
                    <Ionicons name="close-circle" size={16} color="#d1d5db" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            </View>

            {/* Start + End Time */}
            <View style={styles.row}>
              <View style={[styles.field, styles.halfField]}>
                <Text style={styles.label}>Uhrzeit</Text>
                <TouchableOpacity
                  style={styles.pickerButton}
                  onPress={() => togglePicker('startTime')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="time-outline" size={16} color="#6b7280" />
                  <Text style={[styles.pickerText, !dueTime && styles.pickerPlaceholder]}>
                    {dueTime ? formatTime(dueTime) : '--:--'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.field, styles.halfField]}>
                <Text style={styles.label}>Endzeit</Text>
                <TouchableOpacity
                  style={styles.pickerButton}
                  onPress={() => togglePicker('endTime')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="time-outline" size={16} color="#6b7280" />
                  <Text style={[styles.pickerText, !endTime && styles.pickerPlaceholder]}>
                    {endTime ? formatTime(endTime) : '--:--'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Duration */}
            <View style={styles.field}>
              <Text style={styles.label}>Dauer (Minuten)</Text>
              <View style={styles.durationRow}>
                <TextInput
                  style={[styles.input, styles.durationInput]}
                  value={durationText}
                  onChangeText={(value) => setDurationText(value.replace(/\D/g, ''))}
                  onBlur={() => {
                    setIsDurationFocused(false)
                    handleDurationBlur()
                  }}
                  onFocus={() => {
                    setActivePicker(null)
                    setIsDurationFocused(true)
                  }}
                  placeholder="z.B. 30"
                  placeholderTextColor="#9ca3af"
                  keyboardType="number-pad"
                  inputMode="numeric"
                />
                {isDurationFocused && (
                  <TouchableOpacity
                    style={styles.durationApplyBtn}
                    onPress={() => {
                      handleDurationBlur()
                      Keyboard.dismiss()
                      setIsDurationFocused(false)
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  </TouchableOpacity>
                )}
                {durationMin && durationMin > 0 && (
                  <View style={styles.durationBadge}>
                    <Ionicons name="hourglass-outline" size={12} color="#3b82f6" />
                    <Text style={styles.durationBadgeText}>{durationMin} min</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Summary */}
            {dueDate && (
              <View style={styles.summaryBox}>
                <Ionicons name="calendar" size={14} color="#E8713A" />
                <Text style={styles.summaryText}>
                  {formatRelativeDate(dueDate)}
                  {dueTime ? ` um ${formatTime(dueTime)}` : ''}
                  {endTime ? ` – ${formatTime(endTime)}` : ''}
                  {durationMin && durationMin > 0 ? ` (${durationMin} min)` : ''}
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={[styles.submitButton, (submitting || !title.trim()) && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            activeOpacity={0.7}
            disabled={submitting || !title.trim()}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>{isEdit ? 'Speichern' : 'Erstellen'}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={activePicker !== null}
        transparent
        animationType="slide"
        onRequestClose={handlePickerCancel}
      >
        <Pressable style={styles.pickerBackdrop} onPress={handlePickerCancel} />
        <View style={styles.pickerSheet}>
          <View style={styles.pickerHeader}>
            <TouchableOpacity style={styles.pickerDoneBtn} onPress={handlePickerCancel}>
              <Text style={styles.pickerCancelText}>Abbrechen</Text>
            </TouchableOpacity>
            <Text style={styles.pickerTitle}>
              {activePicker === 'date'
                ? 'Datum auswählen'
                : activePicker === 'startTime'
                  ? 'Uhrzeit auswählen'
                  : 'Endzeit auswählen'}
            </Text>
            <TouchableOpacity style={styles.pickerDoneBtn} onPress={handlePickerDone}>
              <Text style={styles.pickerDoneText}>Fertig</Text>
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={pickerDate}
            mode={pickerMode}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={pickerOnChange}
            locale="de-DE"
            is24Hour
          />
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  navBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  backButton: { flexDirection: 'row', alignItems: 'center' },
  backText: { fontSize: 17, color: '#E8713A', marginLeft: 2 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 60 },
  heading: { fontSize: 28, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6b7280', marginTop: 4, marginBottom: 28 },
  form: { gap: 20 },
  field: { gap: 6 },
  label: { fontSize: 15, fontWeight: '600', color: '#111827' },
  required: { color: '#ef4444' },
  input: {
    height: 48, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12,
    paddingHorizontal: 16, fontSize: 15, color: '#111827', backgroundColor: '#f9fafb',
  },
  textArea: { height: 90, paddingTop: 14 },
  pickerButton: {
    height: 48, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12,
    paddingHorizontal: 16, backgroundColor: '#f9fafb',
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  pickerText: { fontSize: 15, color: '#111827', flex: 1 },
  pickerPlaceholder: { color: '#9ca3af' },
  row: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  durationInput: { flex: 1 },
  durationApplyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#eff6ff', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  durationBadgeText: { fontSize: 12, fontWeight: '500', color: '#3b82f6' },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  pickerSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  pickerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  pickerCancelText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#6b7280',
  },
  pickerDoneBtn: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  pickerDoneText: { fontSize: 15, fontWeight: '600', color: '#E8713A' },
  previewChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff7ed', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    alignSelf: 'flex-start', borderWidth: 1, borderColor: '#fdba74',
  },
  previewText: { fontSize: 12, color: '#E8713A', fontWeight: '500' },
  previewHint: { fontSize: 11, color: '#9ca3af', marginLeft: 4 },
  summaryBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f9fafb', borderRadius: 12,
    borderWidth: 1, borderColor: '#e5e7eb',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  summaryText: { fontSize: 13, color: '#111827', flex: 1 },
  submitButton: {
    backgroundColor: '#E8713A', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center', marginTop: 32,
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { fontSize: 17, fontWeight: '600', color: '#fff' },
})
