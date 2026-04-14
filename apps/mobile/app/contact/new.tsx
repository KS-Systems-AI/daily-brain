import { useState } from 'react'
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useCreateContact } from '@/hooks/use-contacts'

function FormField({
  label, value, onChangeText, placeholder, required,
  keyboardType, autoCapitalize, error,
}: {
  label: string; value: string; onChangeText: (text: string) => void
  placeholder?: string; required?: boolean
  keyboardType?: 'default' | 'email-address' | 'phone-pad'
  autoCapitalize?: 'none' | 'sentences' | 'words'; error?: string
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}{required && <Text style={styles.required}> *</Text>}
      </Text>
      <TextInput
        style={[styles.input, error && styles.inputError]}
        value={value} onChangeText={onChangeText} placeholder={placeholder}
        placeholderTextColor="#9ca3af" keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? 'words'} autoCorrect={false}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  )
}

export default function NewContactScreen() {
  const router = useRouter()
  const createMutation = useCreateContact()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!firstName.trim()) newErrors.firstName = 'Vorname ist erforderlich'
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      newErrors.email = 'Bitte gib eine gültige E-Mail-Adresse ein'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return
    createMutation.mutate(
      {
        first_name: firstName.trim(),
        last_name: lastName.trim() || undefined,
        email: email.trim() ? [email.trim()] : undefined,
        phone: phone.trim() ? [phone.trim()] : undefined,
      },
      {
        onSuccess: () => router.back(),
        onError: (err) => Alert.alert('Fehler', err.message || 'Kontakt konnte nicht erstellt werden.'),
      },
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={24} color="#E8713A" />
          <Text style={styles.backText}>Zurück</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Neuer Kontakt</Text>
          <Text style={styles.subtitle}>Erstelle einen neuen Kontakt</Text>

          <View style={styles.form}>
            <FormField label="Vorname" value={firstName} required
              onChangeText={(t) => { setFirstName(t); if (errors.firstName) setErrors((e) => ({ ...e, firstName: '' })) }}
              placeholder="Max" error={errors.firstName} />
            <FormField label="Nachname" value={lastName} onChangeText={setLastName} placeholder="Mustermann" />
            <FormField label="E-Mail" value={email} placeholder="max@beispiel.de"
              keyboardType="email-address" autoCapitalize="none"
              onChangeText={(t) => { setEmail(t); if (errors.email) setErrors((e) => ({ ...e, email: '' })) }}
              error={errors.email} />
            <FormField label="Telefon" value={phone} onChangeText={setPhone}
              placeholder="+49 123 456789" keyboardType="phone-pad" autoCapitalize="none" />
          </View>

          <TouchableOpacity
            style={[styles.submitButton, createMutation.isPending && styles.submitButtonDisabled]}
            onPress={handleSubmit} activeOpacity={0.7} disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Kontakt erstellen</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
  scrollContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 15, color: '#6b7280', marginTop: 4, marginBottom: 28 },
  form: { gap: 20 },
  field: { gap: 6 },
  label: { fontSize: 15, fontWeight: '600', color: '#111827' },
  required: { color: '#ef4444' },
  input: {
    height: 48, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12,
    paddingHorizontal: 16, fontSize: 15, color: '#111827', backgroundColor: '#f9fafb',
  },
  inputError: { borderColor: '#ef4444' },
  errorText: { fontSize: 13, color: '#ef4444' },
  submitButton: {
    backgroundColor: '#E8713A', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center', marginTop: 32,
  },
  submitButtonDisabled: { opacity: 0.7 },
  submitButtonText: { fontSize: 17, fontWeight: '600', color: '#fff' },
})
