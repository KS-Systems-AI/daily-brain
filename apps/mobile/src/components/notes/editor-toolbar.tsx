import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { BLOCK_TYPES, type TextMarkKey } from '@/lib/tiptap-blocks'

interface EditorToolbarProps {
  activeBlockType: string
  activeAttrs: Record<string, unknown>
  activeMarks?: Record<TextMarkKey, boolean>
  onChangeBlockType: (type: string, attrs?: Record<string, unknown>) => void
  onInsertBlock: (type: string, attrs?: Record<string, unknown>) => void
  onOpenBlockMenu?: () => void
  hasSubNotes?: boolean
  textMarksEnabled?: boolean
  onToggleTextMark?: (mark: TextMarkKey) => void
}

export function EditorToolbar({
  activeBlockType,
  activeAttrs,
  activeMarks,
  onChangeBlockType,
  onInsertBlock,
  onOpenBlockMenu,
  hasSubNotes,
  textMarksEnabled,
  onToggleTextMark,
}: EditorToolbarProps) {
  const currentLabel = getBlockLabel(activeBlockType, activeAttrs)

  return (
    <View style={styles.toolbarOuter}>
      <View style={styles.pill}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillContent}
          keyboardShouldPersistTaps="always"
        >
          <PillBtn
            label={currentLabel}
            isTypeBtn
            onPress={onOpenBlockMenu ?? (() => {})}
          />

          {textMarksEnabled && onToggleTextMark ? (
            <>
              <Sep />
              <PillBtn
                label="B"
                active={activeMarks?.bold ?? !!activeAttrs.bold}
                onPress={() => onToggleTextMark('bold')}
              />
              <PillBtn
                label="I"
                active={activeMarks?.italic ?? !!activeAttrs.italic}
                onPress={() => onToggleTextMark('italic')}
              />
              <PillBtn
                label="U"
                active={activeMarks?.underline ?? !!activeAttrs.underline}
                onPress={() => onToggleTextMark('underline')}
              />
              <PillBtn
                label="S"
                active={activeMarks?.strike ?? !!activeAttrs.strike}
                onPress={() => onToggleTextMark('strike')}
              />
            </>
          ) : null}

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
    </View>
  )
}

interface BlockTypeMenuProps {
  visible: boolean
  onClose: () => void
  onChangeBlockType: (type: string, attrs?: Record<string, unknown>) => void
  onInsertBlock: (type: string, attrs?: Record<string, unknown>) => void
  hasSubNotes?: boolean
}

export function BlockTypeMenu({
  visible,
  onClose,
  onChangeBlockType,
  onInsertBlock,
  hasSubNotes,
}: BlockTypeMenuProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.menuSheet} onStartShouldSetResponder={() => true}>
          <View style={styles.menuHandle} />
          <Text style={styles.menuTitle}>Block-Typ</Text>
          {BLOCK_TYPES.filter((bt) => bt.type !== 'sub_note' || hasSubNotes).map((bt, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.menuItem}
              onPress={() => {
                if (bt.type === 'hr' || bt.type === 'sub_note') {
                  onInsertBlock(bt.type)
                } else {
                  onChangeBlockType(bt.type, 'attrs' in bt ? bt.attrs : undefined)
                }
                onClose()
              }}
            >
              <Ionicons name={bt.icon} size={20} color="#374151" />
              <Text style={styles.menuItemText}>{bt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  )
}

function PillBtn({
  icon,
  active,
  onPress,
  label,
  isTypeBtn,
}: {
  icon?: keyof typeof Ionicons.glyphMap
  active?: boolean
  onPress: () => void
  label?: string
  isTypeBtn?: boolean
}) {
  if (isTypeBtn) {
    return (
      <TouchableOpacity style={styles.typeButton} onPress={onPress}>
        <Text style={styles.typeButtonText}>{label}</Text>
        <Ionicons name="chevron-forward" size={12} color="#9ca3af" />
      </TouchableOpacity>
    )
  }

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
    paddingVertical: 2,
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
