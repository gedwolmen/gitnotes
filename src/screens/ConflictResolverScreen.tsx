import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, Alert } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { useConflictStore } from '../stores/conflictStore';
import { ConflictResolverService } from '../services/conflict/ConflictResolverService';
import { GitFsService } from '../services/git/GitFsService';
import { LocalGitWriter } from '../services/git/LocalGitWriter';
import { AuthService } from '../services/AuthService';
import type { FileConflict } from '../services/conflict/types';

type Tab = 'merged' | 'local' | 'remote';

export default function ConflictResolverScreen({ route }: { route: any }) {
  const { repoPath, branch, filePath } = route.params as {
    repoPath: string;
    branch: string;
    filePath: string;
  };
  const { colors } = useTheme();
  const navigation = useNavigation();

  const conflict = useConflictStore((s) => s.getConflict(repoPath, branch));
  const updateConflict = useConflictStore((s) => s.updateConflict);
  const removeConflict = useConflictStore((s) => s.removeConflict);

  const file: FileConflict | undefined = useMemo(
    () => conflict?.files.find((f) => f.path === filePath),
    [conflict, filePath],
  );

  const [activeTab, setActiveTab] = useState<Tab>('merged');
  const [isResolving, setIsResolving] = useState(false);

  const displayContent = useMemo(() => {
    if (!file) return '';
    switch (activeTab) {
      case 'local': return file.localContent ?? '(deleted)';
      case 'remote': return file.remoteContent ?? '(deleted)';
      case 'merged': return file.mergedContent ?? file.localContent ?? file.remoteContent ?? '';
    }
  }, [file, activeTab]);

  const isDeleteVsModify =
    file?.kind === 'local-deleted-remote-modified' ||
    file?.kind === 'local-modified-remote-deleted';

  const isBinary = file?.format === 'binary';

  const handleKeepLocal = useCallback(() => {
    if (!conflict) return;
    const updated = ConflictResolverService.applyResolution(conflict, filePath, {
      content: file?.localContent ?? null,
    });
    updateConflict(repoPath, branch, () => updated);
    checkAndFinish(updated);
  }, [conflict, filePath, file, repoPath, branch, updateConflict]);

  const handleKeepRemote = useCallback(() => {
    if (!conflict) return;
    const updated = ConflictResolverService.applyResolution(conflict, filePath, {
      content: file?.remoteContent ?? null,
    });
    updateConflict(repoPath, branch, () => updated);
    checkAndFinish(updated);
  }, [conflict, filePath, file, repoPath, branch, updateConflict]);

  const handleSaveMerged = useCallback(() => {
    if (!conflict) return;
    const updated = ConflictResolverService.applyResolution(conflict, filePath, {
      content: file?.mergedContent ?? '',
    });
    updateConflict(repoPath, branch, () => updated);
    checkAndFinish(updated);
  }, [conflict, filePath, file, repoPath, branch, updateConflict]);

  const checkAndFinish = useCallback(
    (updated: typeof conflict) => {
      if (updated && ConflictResolverService.isFullyResolved(updated)) {
        Alert.alert(
          'All conflicts resolved',
          'Ready to commit and push the merge.',
          [
            {
              text: 'Commit & Push',
              onPress: () => commitAndPush(updated),
            },
            { text: 'Later', style: 'cancel' },
          ],
        );
      }
    },
    [repoPath, branch, removeConflict, navigation],
  );

  const commitAndPush = useCallback(
    async (cs: typeof conflict) => {
      if (!cs) return;
      setIsResolving(true);
      try {
        const token = (await AuthService.getToken()) ?? undefined;
        const user = token ? await AuthService.getUser(token) : null;
        const authorName = user?.name ?? user?.login ?? 'GitNotes';
        const authorEmail = user?.email ?? 'gitnotes@app.local';

        for (const f of cs.files) {
          if (f.mergedContent !== null) {
            await LocalGitWriter.writeAndCommit({
              repoPath,
              branch,
              filePath: f.path,
              content: f.mergedContent,
              message: `merge: resolve conflict in ${f.path}`,
              author: { name: authorName, email: authorEmail },
              token,
              push: false,
            });
          } else {
            await LocalGitWriter.deleteAndCommit({
              repoPath,
              branch,
              filePath: f.path,
              message: `merge: delete ${f.path} (conflict resolution)`,
              author: { name: authorName, email: authorEmail },
              token,
              push: false,
            });
          }
        }

        const result = await GitFsService.mergeCommit({
          repoPath,
          branch,
          oursRef: cs.localRef,
          theirsRef: cs.remoteRef,
          message: `Merge remote changes into ${branch}`,
          author: { name: authorName, email: authorEmail },
          token,
        });

        if ('error' in result) {
          Alert.alert('Push failed', result.error);
          return;
        }

        await removeConflict(repoPath, branch);
        (navigation as any).goBack();
      } catch (e) {
        Alert.alert('Error', e instanceof Error ? e.message : String(e));
      } finally {
        setIsResolving(false);
      }
    },
    [repoPath, branch, removeConflict, navigation],
  );

  if (!file || !conflict) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Conflict not found
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'merged', label: 'Merged' },
    { key: 'local', label: 'Local' },
    { key: 'remote', label: 'Remote' },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => (navigation as any).goBack()}>
          <Text style={[styles.backButton, { color: colors.primary }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {filePath}
        </Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={[styles.tabBar, { backgroundColor: `${colors.text}08` }]}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[
              styles.tab,
              activeTab === tab.key && styles.tabActive,
              activeTab === tab.key && { backgroundColor: `${colors.primary ?? colors.text}15` },
            ]}
          >
            <Text
              style={[
                styles.tabLabel,
                { color: activeTab === tab.key ? (colors.primary ?? colors.text) : colors.textSecondary },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.contentArea} contentContainerStyle={{ padding: 16 }}>
        <Text style={[styles.contentText, { color: colors.text }]}>{displayContent}</Text>
      </ScrollView>

      <View style={[styles.actions, { borderTopColor: colors.border }]}>
        {isBinary || isDeleteVsModify ? (
          <>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: `${colors.error ?? '#ef4444'}15` }]}
              onPress={handleKeepLocal}
              disabled={isResolving}
            >
              <Text style={[styles.actionBtnText, { color: colors.error ?? '#ef4444' }]}>
                Keep mine
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: `${colors.primary ?? colors.text}15` }]}
              onPress={handleKeepRemote}
              disabled={isResolving}
            >
              <Text style={[styles.actionBtnText, { color: colors.primary ?? colors.text }]}>
                Keep theirs
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: `${colors.error ?? '#ef4444'}15` }]}
              onPress={handleKeepLocal}
              disabled={isResolving}
            >
              <Text style={[styles.actionBtnText, { color: colors.error ?? '#ef4444' }]}>
                Keep mine
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: `${colors.primary ?? colors.text}15` }]}
              onPress={handleKeepRemote}
              disabled={isResolving}
            >
              <Text style={[styles.actionBtnText, { color: colors.primary ?? colors.text }]}>
                Keep theirs
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.primaryBtn, { backgroundColor: colors.primary ?? colors.text }]}
              onPress={handleSaveMerged}
              disabled={isResolving}
            >
              <Text style={[styles.actionBtnText, { color: '#ffffff' }]}>
                Save merged
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
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
  title: { fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center', marginHorizontal: 8 },
  tabBar: {
    flexDirection: 'row',
    padding: 4,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 10,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabActive: {},
  tabLabel: { fontSize: 14, fontWeight: '600' },
  contentArea: { flex: 1 },
  contentText: { fontFamily: 'monospace', fontSize: 14, lineHeight: 22 },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtn: {},
  actionBtnText: { fontSize: 14, fontWeight: '700' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 16 },
});
