import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { BLOCK_TYPES } from '@/lib/tiptap-blocks'

interface EditorToolbarProps {
  activeBlockType: string
  activeAttrs: Record<string, unknown>
  onChangeBlockType: (type: string, attrs?: Record<string, unknown>) => void
  onInsertBlock: (type: string, attrs?: Record<string, unknown>) => void
}

export function EditorToolbar({
  activeBlockType,
  activeAttrs,
  onChangeBlockType,
  onInsertBlock,
}: EditorToolbarProps) {
  const [showBlockMenu, setShowBlockMenu] = useState(false)

  const currentLabel = getBlockLabel(activeBlockType, activeAttrs)

  const toolbar = (
    <View style={styles.toolbarOuter}>
      <View style={styles.pill}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillContent}
          keyboardShouldPersistTaps="always"
        >
          <TouchableOpacity
            style={styles.typeButton}
            onPress={() => setShowBlockMenu(true)}
          >
            <Text style={styles.typeButtonText}>{currentLabel}</Text>
            <Ionicons name="chevron-forward" size={12} color="#9ca3af" />
          </TouchableOpacity>

          <Sep />

          <PillBtn
            label="H1"
            active={activeBlockType === 'heading' && activeAttrs.level === 1}
            onPress={() => onChangeBlockType('heading', { level: 1 })}
          />
          <PillBtn
            label="H2"
            active={activeBlockType === 'heading' && activeAttrs.level === 2}
            onPress={() => onChangeBlockType('heading', { level: 2 })}
          />

          <Sep />

          <PillBtn
            icon="list-outline"
            active={activeBlockType === 'ul'}
            onPress={() => onChangeBlockType('ul')}
          />
          <PillBtn
            label="1."
            active={activeBlockType === 'ol'}
            onPress={() => onChangeBlockType('ol')}
          />
          <PillBtn
            icon="checkbox-outline"
            active={activeBlockType === 'task_item'}
            onPress={() => onChangeBlockType('task_item')}
          />

          <Sep />

          <PillBtn
            icon="chatbox-outline"
            active={activeBlockType === 'blockquote'}
            onPress={() => onChangeBlockType('blockquote')}
          />
          <PillBtn
            icon="remove-outline"
            onPress={() => onInsertBlock('hr')}
          />
        </ScrollView>
      </View>

      <Modal
        visible={showBlockMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBlockMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowBlockMenu(false)}
        >
          <View style={styles.menuSheet}>
            <View style={styles.menuHandle} />
            <Text style={styles.menuTitle}>Block-Typ</Text>
            {BLOCK_TYPES.map((bt, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.menuItem}
                onPress={() => {
                  if (bt.type === 'hr') {
                    onInsertBlock('hr')
                  } else {
                    onChangeBlockType(bt.type, 'attrs' in bt ? bt.attrs : undefined)
                  }
                  setShowBlockMenu(false)
                }}
              >
                <Ionicons name={bt.icon} size={20} color="#374151" />
                <Text style={styles.menuItemText}>{bt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  )

  return toolbar
}

function PillBtn({
  icon,
  active,
  onPress,
  label,
}: {
  icon?: keyof typeof Ionicons.glyphMap
  active?: boolean
  onPress: () => void
  label?: string
}) {
  return (
    <TouchableOpacity
      style={[styles.pillBtn, active && styles.pillBtnActive]}
      onPress={onPress}
    >
      {label ? (
        <Text style={[styles.pillBtnLabel, active && styles.pillBtnLabelActive]}>
          {label}
        </Text>
      ) : icon ? (
        <Ionicons
          name={icon}
          size={18}
          color={active ? '#E8713A' : '#6b7280'}
        />
      ) : null}
    </TouchableOpacity>
  )
}

function Sep() {
  return <View style={styles.sep} />
}

function getBlockLabel(type: string, attrs: Record<string, unknown>): string {
  if (type === 'heading') return `H${attrs.level ?? 1}`
  const found = BLOCK_TYPES.find((bt) => bt.type === type)
  return found?.label ?? 'Text'
}

const styles = StyleSheet.create({
  toolbarOuter: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'transparent',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  pillContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 1,
  },
  typeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  typeButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },
  sep: {
    width: 1,
    height: 18,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 3,
  },
  pillBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
  },
  pillBtnActive: {
    backgroundColor: '#FEF3EC',
  },
  pillBtnLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  pillBtnLabelActive: {
    color: '#E8713A',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  menuSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 34,
    paddingTop: 8,
  },
  menuHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
    alignSelf: 'center',
    marginBottom: 12,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  menuItemText: {
    fontSize: 16,
    color: '#374151',
  },
})
