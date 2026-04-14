import { useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useContacts } from '@/hooks/use-contacts'

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

interface Contact {
  id: string
  first_name: string
  last_name: string
  email: string[]
  phone: string[]
  company: { id: string; name: string } | null
}

function ContactItem({ contact, onPress }: { contact: Contact; onPress: () => void }) {
  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ')
  const initials = getInitials(contact.first_name, contact.last_name)
  const color = getAvatarColor(fullName)

  return (
    <TouchableOpacity style={styles.contactItem} onPress={onPress} activeOpacity={0.6}>
      <View style={[styles.avatar, { backgroundColor: color }]}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={styles.contactInfo}>
        <Text style={styles.contactName} numberOfLines={1}>
          {fullName}
        </Text>
        {contact.company && (
          <Text style={styles.contactCompany} numberOfLines={1}>
            {contact.company.name}
          </Text>
        )}
        {contact.email.length > 0 && (
          <Text style={styles.contactEmail} numberOfLines={1}>
            {contact.email[0]}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
    </TouchableOpacity>
  )
}

export default function ContactsScreen() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const { data, isLoading, refetch, isRefetching } = useContacts(search || undefined)

  const contacts = (data ?? []) as Contact[]

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Ionicons name="people-outline" size={18} color="#6b7280" />
        <Text style={styles.headerTitle}>Kontakte</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{contacts.length}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={() => router.push('/contact/new')}
          style={styles.addBtn}
        >
          <Ionicons name="add" size={22} color="#E8713A" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color="#9ca3af" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Kontakte durchsuchen…"
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#E8713A" />
        </View>
      ) : contacts.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="people-outline" size={56} color="#d1d5db" />
          <Text style={styles.emptyTitle}>Noch keine Kontakte</Text>
          <Text style={styles.emptySubtitle}>
            {search
              ? 'Keine Ergebnisse für diese Suche'
              : 'Erstelle deinen ersten Kontakt mit dem + Button'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ContactItem
              contact={item}
              onPress={() => router.push(`/contact/${item.id}`)}
            />
          )}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor="#E8713A"
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  headerTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  badge: {
    backgroundColor: '#f3f4f6', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#6b7280' },
  addBtn: { padding: 4 },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginTop: 12, marginBottom: 12,
    backgroundColor: '#f3f4f6', borderRadius: 12, paddingHorizontal: 12, height: 44,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#111827', height: 44 },
  centered: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40,
  },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#111827', marginTop: 16 },
  emptySubtitle: { fontSize: 13, color: '#6b7280', marginTop: 6, textAlign: 'center', lineHeight: 18 },
  list: { paddingHorizontal: 20, paddingBottom: 20 },
  contactItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  contactInfo: { flex: 1, marginLeft: 14, marginRight: 8 },
  contactName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  contactCompany: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  contactEmail: { fontSize: 13, color: '#6b7280', marginTop: 1 },
  separator: { height: 1, backgroundColor: '#e5e7eb', marginLeft: 60 },
})
