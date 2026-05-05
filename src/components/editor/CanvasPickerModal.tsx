import React, { useCallback } from 'react';
import { Modal as RNModal, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../contexts/ThemeContext';
import { Canvas } from '../../models/Canvas';

interface CanvasPickerModalProps {
  visible: boolean;
  canvases: Canvas[];
  onSelect: (canvasId: string, canvasTitle: string) => void;
  onClose: () => void;
}

export function CanvasPickerModal({ visible, canvases, onSelect, onClose }: CanvasPickerModalProps) {
  const { colors } = useTheme();

  const renderItem = useCallback(
    ({ item }: { item: Canvas }) => (
      <TouchableOpacity
        style={[styles.item, { borderBottomColor: colors.border }]}
        onPress={() => onSelect(item.id, item.title)}
      >
        <Ionicons name="easel-outline" size={18} color={colors.primary} />
        <View style={styles.itemContent}>
          <Text style={[styles.itemTitle, { color: colors.text }]}>{item.title}</Text>
          <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
            {item.scene?.elements?.length ?? 0} elements
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    ),
    [colors, onSelect],
  );

  return (
    <RNModal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView edges={['top', 'bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={[styles.closeText, { color: colors.primary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Link Canvas</Text>
          <View style={styles.closeBtn} />
        </View>

        <FlatList
          data={canvases}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No canvases yet. Create one from the Canvases tab first.</Text>
            </View>
          }
        />
      </SafeAreaView>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3a3a3c',
  },
  closeBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  closeText: { fontSize: 16 },
  title: { fontSize: 17, fontWeight: '600' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemContent: { flex: 1 },
  itemTitle: { fontSize: 16, fontWeight: '500' },
  itemMeta: { fontSize: 13, marginTop: 2 },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 15, textAlign: 'center' },
});
