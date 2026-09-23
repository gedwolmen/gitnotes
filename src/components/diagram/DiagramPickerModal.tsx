import React, { useCallback, useMemo } from 'react';
import { Modal as RNModal, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../contexts/ThemeContext';
import { useProGate } from '../../hooks/useProGate';
import type { Diagram } from '../../models/Diagram';
import DiagramThumbnail from './DiagramThumbnail';

interface DiagramPickerModalProps {
  visible: boolean;
  diagrams: Diagram[];
  currentRepo?: string;
  currentBranch?: string;
  onSelect: (diagramId: string, diagramTitle: string) => void;
  onClose: () => void;
}

/**
 * Filters diagrams by the active repo/branch context.
 * A diagram is accessible if:
 * - It has no repo (local/unassigned), OR
 * - Its repo matches the current repo AND (it has no branch OR its branch matches the current branch)
 */
function filterDiagramsByContext(
  diagrams: Diagram[],
  currentRepo?: string,
  currentBranch?: string,
): Diagram[] {
  return diagrams.filter((diagram) => {
    // Diagram with no repo is accessible from any context
    if (!diagram.repo) return true;
    // Repo must match
    if (diagram.repo !== currentRepo) return false;
    // If diagram has a branch, it must match
    if (diagram.branch && diagram.branch !== currentBranch) return false;
    return true;
  });
}

export function DiagramPickerModal({
  visible,
  diagrams,
  currentRepo,
  currentBranch,
  onSelect,
  onClose,
}: DiagramPickerModalProps) {
  const { colors } = useTheme();
  const { isPro, openPaywall } = useProGate();

  const accessibleDiagrams = useMemo(
    () => filterDiagramsByContext(diagrams, currentRepo, currentBranch),
    [diagrams, currentRepo, currentBranch],
  );

  const renderItem = useCallback(
    ({ item }: { item: Diagram }) => (
      <TouchableOpacity
        testID="diagram-picker-modal.button.select"
        style={[styles.item, { borderBottomColor: colors.border }]}
        onPress={() => onSelect(item.id, item.title)}
      >
        <View style={styles.thumbnailWrapper}>
          <DiagramThumbnail
            diagram={item}
            width={48}
            height={48}
          />
        </View>
        <View style={styles.itemContent}>
          <Text style={[styles.itemTitle, { color: colors.text }]}>{item.title || 'Untitled Diagram'}</Text>
          <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
            {item.document?.objects?.length ?? 0} objects
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    ),
    [colors, onSelect],
  );

  return (
    <RNModal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView edges={['top', 'bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <TouchableOpacity testID="diagram-picker-modal.button.close" onPress={onClose} style={styles.closeBtn}>
            <Text style={[styles.closeText, { color: colors.primary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Link Diagram</Text>
          <View style={styles.closeBtn} />
        </View>

        {!isPro && (
          <TouchableOpacity
            testID="diagram-picker-modal.button.pro-gate"
            style={[styles.proBanner, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}
            onPress={openPaywall}
          >
            <Ionicons name="lock-closed" size={16} color={colors.primary} />
            <Text style={[styles.proBannerText, { color: colors.primary }]}>
              Upgrade to Pro to link diagrams
            </Text>
          </TouchableOpacity>
        )}

        <FlatList
          data={accessibleDiagrams}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {isPro
                  ? 'No diagrams yet. Create one from the Diagrams tab first.'
                  : 'No diagrams available. Upgrade to Pro to create diagrams.'}
              </Text>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3a3a3c',
  },
  closeBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  closeText: { fontSize: 16 },
  title: { flex: 1, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  proBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  proBannerText: {
    fontSize: 14,
    fontWeight: '500',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thumbnailWrapper: {
    borderRadius: 6,
    overflow: 'hidden',
  },
  itemContent: { flex: 1 },
  itemTitle: { fontSize: 16, fontWeight: '500' },
  itemMeta: { fontSize: 13, marginTop: 2 },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 15, textAlign: 'center' },
});
