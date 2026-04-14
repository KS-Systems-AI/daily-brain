import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useContact, useDeleteContact } from '@/hooks/use-contacts'

const AVATAR_COLORS = [
  '#E8713A', '#3B82F6', '#10B981', '#8B5CF6',
  '#F59E0B', '#EC4899', '#06B6D4', '#84CC16',
]

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getInitials(firstName?: string, lastName?: string): string {
  const first = firstName?.charAt(0)?.toUpperCase() ?? ''
  const last = lastName?.charAt(0)?.toUpperCase() ?? ''
  return first + last || '?'
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  )
}

function InfoRow({
  icon, label, onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  onPress?: () => void
}) {
  return (
    <TouchableOpacity style={styles.infoRow} onPress={onPress} disabled={!onPress} activeOpacity={0.6}>
      <Ionicons name={icon} size={20} color="#E8713A" style={styles.infoIcon} />
      <Text style={[styles.infoLabel, onPress && styles.infoLabelTappable]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

export default function ContactDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const { data: contact, isLoading } = useContact(id)
  const deleteMutation = useDeleteContact()

  const handleDelete = () => {
    Alert.alert(
      'Kontakt löschen',
      'Möchtest du diesen Kontakt wirklich löschen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(id!, { onSuccess: () => router.back() }),
        },
      ],
    )
  }

  if (isLoading || !contact) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#E8713A" />
        </View>
      </SafeAreaView>
    )
  }

  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ')
  const initials = getInitials(contact.first_name, contact.last_name)
  const avatarColor = getAvatarColor(fullName)

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={24} color="#E8713A" />
          <Text style={styles.backText}>Zurück</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.profileHeader}>
          <View style={[styles.avatarLarge, { backgroundColor: avatarColor }]}>
            <Text style={styles.avatarLargeText}>{initials}</Text>
          </View>
          <Text style={styles.fullName}>{fullName}</Text>
          {contact.company && (
            <Text style={styles.companyName}>{contact.company.name}</Text>
          )}
        </View>

        {contact.email?.length > 0 && (
          <Section title="E-Mail">
            {contact.email.map((email: string, i: number) => (
              <InfoRow key={i} icon="mail-outline" label={email}
                onPress={() => Linking.openURL(`mailto:${email}`)} />
            ))}
          </Section>
        )}

        {contact.phone?.length > 0 && (
          <Section title="Telefon">
            {contact.phone.map((phone: string, i: number) => (
              <InfoRow key={i} icon="call-outline" label={phone}
                onPress={() => Linking.openURL(`tel:${phone}`)} />
            ))}
          </Section>
        )}

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}
          activeOpacity={0.7}
          disabled={deleteMutation.isPending}
        >
          {deleteMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="trash-outline" size={18} color="#fff" />
              <Text style={styles.deleteButtonText}>Kontakt löschen</Text>
            </>
          )}
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  backButton: { flexDirection: 'row', alignItems: 'center' },
  backText: { fontSize: 17, color: '#E8713A', marginLeft: 2 },
  scrollContent: { paddingHorizontal: 20 },
  profileHeader: { alignItems: 'center', paddingTop: 28, paddingBottom: 24 },
  avatarLarge: {
    width: 88, height: 88, borderRadius: 44, alignItems: 'center',
    justifyContent: 'center', marginBottom: 16,
  },
  avatarLargeText: { fontSize: 32, fontWeight: '700', color: '#fff' },
  fullName: { fontSize: 28, fontWeight: '700', color: '#111827', textAlign: 'center' },
  companyName: { fontSize: 15, color: '#6b7280', marginTop: 4, textAlign: 'center' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 17, fontWeight: '600', color: '#111827', marginBottom: 10 },
  sectionContent: { backgroundColor: '#f9fafb', borderRadius: 12, overflow: 'hidden' },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
    paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  infoIcon: { marginRight: 12 },
  infoLabel: { fontSize: 15, color: '#111827', flex: 1 },
  infoLabelTappable: { color: '#E8713A' },
  deleteButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#ef4444', borderRadius: 12, paddingVertical: 14, marginTop: 12, gap: 8,
  },
  deleteButtonText: { fontSize: 15, fontWeight: '600', color: '#fff' },
})
