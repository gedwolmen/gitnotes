/**
 * ConflictResolverScreen — user resolves sync conflicts file-by-file.
 *
 * Each conflict shows:
 *   - File path
 *   - Local version (your edits)
 *   - Remote version (server edits)
 *   - Base version (common ancestor, if available)
 *
 * User picks: keep local / keep remote / merged (manual)
 *
 * GPL-3.0 derivative of GitSync.
 */

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSyncStore, ConflictEntry, MergeDecision } from './syncState';
import { useRepoStore } from '../repositories/repoStore';

type ConflictRouteParams = {
  ConflictResolver: {
    repoId: string;
  };
};

type NavigationProp = NativeStackNavigationProp<ConflictRouteParams, 'ConflictResolver'>;

export function ConflictResolverScreen() {
  const route = useRoute<RouteProp<ConflictRouteParams, 'ConflictResolver'>>();
  const navigation = useNavigation<NavigationProp>();
  const { width } = useWindowDimensions();

  const { repoId } = route.params;

  const repos = useSyncStore((s) => s.repos);
  const resolveConflict = useSyncStore((s) => s.resolveConflict);
  const commitResolutions = useSyncStore((s) => s.commitResolutions);
  const abortSync = useSyncStore((s) => s.abortSync);

  const repoState = repos[repoId];
  const conflictQueue: ConflictEntry[] = repoState?.conflictQueue ?? [];

  const [activePath, setActivePath] = useState<string | null>(
    conflictQueue[0]?.path ?? null,
  );
  const [mergedTexts] = useState<Record<string, string>>({});

  const activeEntry = conflictQueue.find((e) => e.path === activePath);

  const handleDecision = useCallback(
    async (decision: MergeDecision) => {
      if (!activePath) return;
      await resolveConflict(repoId, activePath, decision);
      const next = conflictQueue.find((e) => e.path !== activePath && !e.decision);
      setActivePath(next?.path ?? null);
    },
    [activePath, conflictQueue, repoId, resolveConflict],
  );

  const allResolved = conflictQueue.every((e) => e.decision !== null);

  const handleCommitAndPush = useCallback(async () => {
    const repositories = useRepoStore.getState().repositories;
    const repo = repositories.find((r) => r.id === repoId);
    if (!repo) {
      Alert.alert('Error', 'Repository not found');
      return;
    }
    try {
      await commitResolutions(repo);
      navigation.goBack();
    } catch (err) {
      Alert.alert('Push failed', (err as Error).message);
    }
  }, [commitResolutions, navigation, repoId]);

  const handleAbort = useCallback(() => {
    Alert.alert(
      'Abort sync?',
      'Your conflict decisions will be discarded and the sync cancelled.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Abort',
          style: 'destructive',
          onPress: () => {
            abortSync(repoId);
            navigation.goBack();
          },
        },
      ],
    );
  }, [abortSync, navigation, repoId]);

  if (conflictQueue.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>No Conflicts</Text>
        <Text style={styles.subtitle}>All files have been resolved.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.goBack()}>
          <Text style={styles.primaryButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>
          {conflictQueue.length} conflict{conflictQueue.length !== 1 ? 's' : ''}
        </Text>
        <TouchableOpacity onPress={handleAbort}>
          <Text style={styles.abortText}>Abort</Text>
        </TouchableOpacity>
      </View>

      {/* File list */}
      <ScrollView horizontal style={styles.fileList} showsHorizontalScrollIndicator={false}>
        {conflictQueue.map((entry) => (
          <TouchableOpacity
            key={entry.path}
            style={[
              styles.fileChip,
              entry.path === activePath && styles.fileChipActive,
              entry.decision !== null && styles.fileChipResolved,
            ]}
            onPress={() => setActivePath(entry.path)}
          >
            <Text
              style={[
                styles.fileChipText,
                entry.path === activePath && styles.fileChipTextActive,
              ]}
              numberOfLines={1}
            >
              {entry.path.split('/').pop()}
            </Text>
            {entry.decision !== null && (
              <Text style={styles.checkmark}>✓</Text>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Conflict viewer */}
      {activeEntry && (
        <View style={styles.conflictViewer}>
          <View style={styles.versionsRow}>
            {/* Local */}
            <View style={[styles.versionPane, { width: (width - 48) / 3 }]}>
              <View style={[styles.versionHeader, styles.localHeader]}>
                <Text style={styles.versionLabel}>Local (yours)</Text>
              </View>
              <ScrollView style={styles.versionContent}>
                <Text style={styles.versionText}>{activeEntry.localContent || '(empty)'}</Text>
              </ScrollView>
              <TouchableOpacity
                style={[
                  styles.decisionButton,
                  styles.localButton,
                  activeEntry.decision === 'keep_local' && styles.decisionButtonActive,
                ]}
                onPress={() => handleDecision('keep_local')}
              >
                <Text
                  style={[
                    styles.decisionButtonText,
                    activeEntry.decision === 'keep_local' && styles.decisionButtonTextActive,
                  ]}
                >
                  Keep mine
                </Text>
              </TouchableOpacity>
            </View>

            {/* Remote */}
            <View style={[styles.versionPane, { width: (width - 48) / 3 }]}>
              <View style={[styles.versionHeader, styles.remoteHeader]}>
                <Text style={styles.versionLabel}>Remote (server)</Text>
              </View>
              <ScrollView style={styles.versionContent}>
                <Text style={styles.versionText}>{activeEntry.remoteContent || '(empty)'}</Text>
              </ScrollView>
              <TouchableOpacity
                style={[
                  styles.decisionButton,
                  styles.remoteButton,
                  activeEntry.decision === 'keep_remote' && styles.decisionButtonActive,
                ]}
                onPress={() => handleDecision('keep_remote')}
              >
                <Text
                  style={[
                    styles.decisionButtonText,
                    activeEntry.decision === 'keep_remote' && styles.decisionButtonTextActive,
                  ]}
                >
                  Keep theirs
                </Text>
              </TouchableOpacity>
            </View>

            {/* Merged */}
            <View style={[styles.versionPane, { width: (width - 48) / 3 }]}>
              <View style={[styles.versionHeader, styles.mergedHeader]}>
                <Text style={styles.versionLabel}>Merged</Text>
              </View>
              <ScrollView style={styles.versionContent}>
                <Text style={styles.versionText}>
                  {mergedTexts[activeEntry.path] ?? activeEntry.localContent ?? ''}
                </Text>
              </ScrollView>
              <TouchableOpacity
                style={[
                  styles.decisionButton,
                  styles.mergedButton,
                  activeEntry.decision === 'merged' && styles.decisionButtonActive,
                ]}
                onPress={() => handleDecision('merged')}
              >
                <Text
                  style={[
                    styles.decisionButtonText,
                    activeEntry.decision === 'merged' && styles.decisionButtonTextActive,
                  ]}
                >
                  Use merged
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.filePath}>{activeEntry.path}</Text>
        </View>
      )}

      {/* Commit button */}
      {allResolved && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleCommitAndPush}>
            <Text style={styles.primaryButtonText}>Commit & Push</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  abortText: {
    fontSize: 14,
    color: '#c00',
  },
  fileList: {
    maxHeight: 48,
    marginBottom: 16,
  },
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  fileChipActive: {
    backgroundColor: '#5b7ef2',
    borderColor: '#5b7ef2',
  },
  fileChipResolved: {
    backgroundColor: '#e8f5e9',
    borderColor: '#a5d6a7',
  },
  fileChipText: {
    fontSize: 13,
    color: '#333',
    maxWidth: 120,
  },
  fileChipTextActive: {
    color: '#fff',
  },
  checkmark: {
    fontSize: 12,
    color: '#4caf50',
    marginLeft: 4,
  },
  conflictViewer: {
    flex: 1,
  },
  versionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  versionPane: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  versionHeader: {
    padding: 6,
    alignItems: 'center',
  },
  localHeader: { backgroundColor: '#e3f2fd' },
  remoteHeader: { backgroundColor: '#fce4ec' },
  mergedHeader: { backgroundColor: '#e8f5e9' },
  versionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#555',
  },
  versionContent: {
    padding: 8,
    maxHeight: 200,
  },
  versionText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#333',
  },
  decisionButton: {
    padding: 8,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  localButton: { backgroundColor: '#e3f2fd' },
  remoteButton: { backgroundColor: '#fce4ec' },
  mergedButton: { backgroundColor: '#e8f5e9' },
  decisionButtonActive: {
    borderWidth: 2,
    borderColor: '#5b7ef2',
  },
  decisionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
  },
  decisionButtonTextActive: {
    color: '#5b7ef2',
  },
  filePath: {
    fontSize: 11,
    color: '#999',
    marginTop: 8,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  footer: {
    paddingTop: 16,
  },
  primaryButton: {
    backgroundColor: '#5b7ef2',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
