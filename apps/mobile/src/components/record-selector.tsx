import { useMemo, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView, Keyboard } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useContacts } from '@/hooks/use-contacts'
import { useCompanies } from '@/hooks/use-companies'

export type SelectedRecord = {
  id: string
  type: 'contact' | 'company'
  label: string
}

type Props = {
  value: SelectedRecord | null
  onChange: (record: SelectedRecord | null) => void
}

export function RecordSelector({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const searchRef = useRef<TextInput>(null)
  const { data: contacts = [] } = useContacts(search || undefined)
  const { data: companies = [] } = useCompanies(search || undefined)

  const contactItems = useMemo(
    () =>
      contacts.map((c: any) => ({
        id: c.id as string,
        type: 'contact' as const,
        label: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Kontakt',
      })),
    [contacts],
  )
  const companyItems = useMemo(
    () =>
      companies.map((c: any) => ({
        id: c.id as string,
        type: 'company' as const,
        label: (c.name as string) || 'Unternehmen',
      })),
    [companies],
  )

  return (
    <View>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => {
          Keyboard.dismiss()
          if (value) onChange(null)
          setSearch('')
          setOpen(true)
          setTimeout(() => searchRef.current?.focus(), 0)
        }}
        activeOpacity={0.7}
      >
        <Ionicons name={value ? 'person-outline' : 'search-outline'} size={15} color="#6b7280" />
        <Text style={[styles.triggerText, !value && styles.placeholder]} numberOfLines={1}>
          {value?.label || 'Person oder Firma verknüpfen...'}
        </Text>
        {value ? (
          <TouchableOpacity
            onPress={() => onChange(null)}
            hitSlop={8}
            style={styles.clearBtn}
          >
            <Ionicons name="close" size={14} color="#9ca3af" />
          </TouchableOpacity>
        ) : (
          <Ionicons name="chevron-down" size={15} color="#9ca3af" />
        )}
      </TouchableOpacity>

      {open && (
        <View style={styles.menu}>
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={14} color="#9ca3af" />
            <TextInput
              ref={searchRef}
              value={search}
              onChangeText={setSearch}
              placeholder="Suchen..."
              placeholderTextColor="#9ca3af"
              style={styles.searchInput}
            />
          </View>
          <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
            {contactItems.map((item) => (
              <TouchableOpacity
                key={`c-${item.id}`}
                style={styles.item}
                onPress={() => {
                  onChange(item)
                  setOpen(false)
                }}
              >
                <Ionicons name="person-outline" size={14} color="#3b82f6" />
                <Text style={styles.itemText} numberOfLines={1}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
            {companyItems.map((item) => (
              <TouchableOpacity
                key={`co-${item.id}`}
                style={styles.item}
                onPress={() => {
                  onChange(item)
                  setOpen(false)
                }}
              >
                <Ionicons name="business-outline" size={14} color="#f97316" />
                <Text style={styles.itemText} numberOfLines={1}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
            {contactItems.length === 0 && companyItems.length === 0 && (
              <Text style={styles.empty}>Keine Ergebnisse</Text>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  trigger: {
    height: 48,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: '#f9fafb',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  triggerText: { flex: 1, fontSize: 15, color: '#111827' },
  placeholder: { color: '#9ca3af' },
  clearBtn: { marginLeft: 'auto', padding: 2 },
  menu: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 42,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
  },
  itemText: { flex: 1, fontSize: 14, color: '#111827' },
  empty: { padding: 12, textAlign: 'center', color: '#9ca3af', fontSize: 13 },
})
