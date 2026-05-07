import React, { useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { useConflictStore } from '../stores/conflictStore';
import type { FileConflict } from '../services/conflict/types';

function formatChip(format: string): string {
  switch (format) {
    case 'text': return 'TXT';
    case 'json': return 'JSON';
    case 'binary': return 'BIN';
    default: return format.toUpperCase();
  }
}

function kindLabel(kind: string): string {
  switch (kind) {
    case 'both-changed-different': return 'Needs attention';
    case 'local-deleted-remote-modified': return 'Deleted locally, modified remotely';
    case 'local-modified-remote-deleted': return 'Modified locally, deleted remotely';
    case 'both-renamed': return 'Renamed on both sides';
    default: return kind;
  }
}

export default function SyncStatusScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const conflicts = useConflictStore((s) => s.conflicts);
  const removeConflict = useConflictStore((s) => s.removeConflict);

  const allFiles: (FileConflict & { repoPath: string; branch: string })[] = [];
  for (const cs of conflicts) {
    for (const f of cs.files) {
      if (!f.autoResolved) {
        allFiles.push({ ...f, repoPath: cs.repoPath, branch: cs.branch });
      }
    }
  }

  const handleFilePress = useCallback(
    (item: FileConflict & { repoPath: string; branch: string }) => {
      (navigation as any).navigate('ConflictResolver', {
        repoPath: item.repoPath,
        branch: item.branch,
        filePath: item.path,
      });
    },
    [navigation],
  );

  const handleDismiss = useCallback(
    (repoPath: string, branch: string) => {
      const cs = conflicts.find((c) => c.repoPath === repoPath && c.branch === branch);
      if (cs && cs.files.every((f) => f.autoResolved)) {
        removeConflict(repoPath, branch);
      }
    },
    [conflicts, removeConflict],
  );

  const renderItem = useCallback(
    ({ item }: { item: FileConflict & { repoPath: string; branch: string } }) => (
      <TouchableOpacity
        onPress={() => handleFilePress(item)}
        style={[styles.fileRow, { borderBottomColor: colors.border }]}
      >
        <View style={styles.fileInfo}>
          <Text style={[styles.filePath, { color: colors.text }]} numberOfLines={1}>
            {item.path}
          </Text>
          <Text style={[styles.kindLabel, { color: colors.textSecondary }]}>
            {kindLabel(item.kind)}
          </Text>
        </View>
        <View style={styles.badges}>
          <View style={[styles.formatBadge, { backgroundColor: `${colors.primary ?? colors.text}20` }]}>
            <Text style={[styles.formatBadgeText, { color: colors.primary ?? colors.text }]}>
              {formatChip(item.format)}
            </Text>
          </View>
          {!item.autoResolved && (
            <View style={[styles.dot, { backgroundColor: colors.error ?? '#ef4444' }]} />
          )}
        </View>
      </TouchableOpacity>
    ),
    [colors, handleFilePress],
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => (navigation as any).goBack()}>
          <Text style={[styles.backButton, { color: colors.primary }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Sync Conflicts</Text>
        <View style={{ width: 50 }} />
      </View>

      {allFiles.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No unresolved conflicts
          </Text>
        </View>
      ) : (
        <FlatList
          data={allFiles}
          keyExtractor={(item) => `${item.repoPath}:${item.branch}:${item.path}`}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 32 }}
        />
      )}
    </SafeAreaView>
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
  },
  backButton: { fontSize: 16, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '700' },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fileInfo: { flex: 1, marginRight: 12 },
  filePath: { fontSize: 15, fontWeight: '500' },
  kindLabel: { fontSize: 13, marginTop: 2 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  formatBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  formatBadgeText: { fontSize: 11, fontWeight: '700' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 16 },
});
