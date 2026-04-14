import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useCreateNote } from '@/hooks/use-notes'

export default function NewNoteScreen() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const createMutation = useCreateNote()

  const handleCreate = () => {
    createMutation.mutate(
      { title: title.trim() || undefined },
      {
        onSuccess: (data) => {
          router.replace(`/note/${data.id}`)
        },
      },
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Neue Notiz</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.content}>
        <Text style={styles.label}>Titel</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Titel der Notiz"
          placeholderTextColor="#9ca3af"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleCreate}
        />

        <TouchableOpacity
          style={[styles.createButton, createMutation.isPending && styles.createButtonDisabled]}
          onPress={handleCreate}
          disabled={createMutation.isPending}
          activeOpacity={0.8}
        >
          {createMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.createButtonText}>Notiz erstellen</Text>
          )}
        </TouchableOpacity>

        {createMutation.isError && (
          <Text style={styles.errorText}>
            Fehler beim Erstellen. Bitte versuche es erneut.
          </Text>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#111827' },
  content: { padding: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: {
    fontSize: 16, color: '#111827', borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 24,
  },
  createButton: {
    backgroundColor: '#E8713A', borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  createButtonDisabled: { opacity: 0.6 },
  createButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  errorText: { fontSize: 14, color: '#ef4444', marginTop: 12, textAlign: 'center' },
})
