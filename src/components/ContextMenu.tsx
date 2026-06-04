import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { Modal } from './ui';

export interface ContextMenuItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  subtitle?: string;
  testID?: string;
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
  bottomSheet?: boolean;
}

export default function ContextMenu({
  visible,
  onClose,
  title,
  subtitle,
  headerIcon,
  sections,
  items,
  bottomSheet,
}: ContextMenuProps) {
  const { colors } = useTheme();
  const groups: ContextMenuSection[] = sections ?? (items ? [{ items }] : []);

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      bottomSheet={bottomSheet}
      contentStyle={{ padding: 0, overflow: 'hidden', minWidth: 280 }}
    >
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
            <View key={i} testID="context-menu.item.press">
              <TouchableOpacity
                key={i}
                testID={item.testID ?? `context-menu.item.press-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              style={styles.item}
              onPress={() => {
                onClose();
                if (Platform.OS === 'ios') {
                  // Defer until parent modal finishes dismissing — otherwise UIKit
                  // refuses to present sheets opened by item.onPress (share, alerts, etc.)
                  setTimeout(item.onPress, 350);
                } else {
                  item.onPress();
                }
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
            </View>
          ))}
        </View>
      ))}
    </Modal>
  );
}

const styles = StyleSheet.create({
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
