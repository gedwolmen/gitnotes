import React from 'react';
import { Modal, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

export interface ContextMenuItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  subtitle?: string;
}

export interface ContextMenuSection {
  items: ContextMenuItem[];
}

interface ContextMenuProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  headerIcon?: keyof typeof Ionicons.glyphMap;
  sections?: ContextMenuSection[];
  items?: ContextMenuItem[];
}

export default function ContextMenu({
  visible,
  onClose,
  title,
  subtitle,
  headerIcon,
  sections,
  items,
}: ContextMenuProps) {
  const { colors } = useTheme();
  const groups: ContextMenuSection[] = sections ?? (items ? [{ items }] : []);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => undefined}>
          <View style={[styles.menu, { backgroundColor: colors.surface }]}>
            {(title || subtitle) ? (
              <View style={[styles.header, { borderBottomColor: colors.border }]}>
                {headerIcon ? (
                  <Ionicons name={headerIcon} size={16} color={colors.textSecondary} />
                ) : null}
                <View style={styles.headerTextContainer}>
                  {title ? (
                    <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                      {title}
                    </Text>
                  ) : null}
                  {subtitle ? (
                    <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}
            {groups.map((group, gi) => (
              <View key={gi}>
                {gi > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
                {group.items.map((item, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.item}
                    onPress={() => {
                      onClose();
                      item.onPress();
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={item.icon}
                      size={20}
                      color={item.destructive ? colors.error : colors.primary}
                    />
                    <View style={styles.itemTextContainer}>
                      <Text
                        style={[
                          styles.itemText,
                          { color: item.destructive ? colors.error : colors.text },
                        ]}
                      >
                        {item.label}
                      </Text>
                      {item.subtitle ? (
                        <Text
                          style={[styles.itemSubtitle, { color: colors.textSecondary }]}
                          numberOfLines={1}
                        >
                          {item.subtitle}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  menu: {
    width: 320,
    maxWidth: '100%',
    borderRadius: 14,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  headerTextContainer: { flex: 1, gap: 2 },
  headerTitle: { fontSize: 14, fontWeight: '600' },
  headerSubtitle: { fontSize: 12 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  itemTextContainer: { flex: 1, gap: 2 },
  itemText: { fontSize: 16 },
  itemSubtitle: { fontSize: 12 },
  divider: { height: StyleSheet.hairlineWidth },
});
