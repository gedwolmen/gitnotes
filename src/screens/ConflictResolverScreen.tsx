import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, SafeAreaView, Alert } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { useConflictStore } from '../stores/conflictStore';
import { ConflictResolverService } from '../services/conflict/ConflictResolverService';
import { GitFsService } from '../services/git/GitFsService';
import { LocalGitWriter } from '../services/git/LocalGitWriter';
import { AuthService } from '../services/AuthService';
import type { FileConflict } from '../services/conflict/types';
import type { RootStackParamList } from '../navigation/types';
import { ScreenHeader } from '../components/ui';
import { cn } from '../lib/utils';

type Tab = 'merged' | 'local' | 'remote';
type Nav = NativeStackNavigationProp<RootStackParamList, 'ConflictResolver'>;
type ConflictRoute = RouteProp<RootStackParamList, 'ConflictResolver'>;

export default function ConflictResolverScreen() {
  const route = useRoute<ConflictRoute>();
  const { repoPath, branch, filePath } = route.params;
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();

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
        navigation.goBack();
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
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <View className="flex-1 items-center justify-center">
          <Text className="text-base" style={{ color: colors.textSecondary }}>
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
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <ScreenHeader
        title={filePath}
        onBack={() => navigation.goBack()}
      />

      <View
        className="flex-row p-1 mx-4 mt-2 rounded-[10px]"
        style={{ backgroundColor: `${colors.text}08` }}
      >
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            className={cn(
              'flex-1 py-2 items-center rounded-lg',
              activeTab === tab.key && 'bg-opacity-10'
            )}
            style={activeTab === tab.key ? { backgroundColor: `${colors.primary ?? colors.text}15` } : undefined}
          >
            <Text
              className="text-sm font-semibold"
              style={{ color: activeTab === tab.key ? (colors.primary ?? colors.text) : colors.textSecondary }}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView className="flex-1" contentContainerClassName="p-4">
        <Text className="font-mono text-sm leading-[22px]" style={{ color: colors.text }}>{displayContent}</Text>
      </ScrollView>

      <View
        className="flex-row gap-2 px-4 py-3 border-t"
        style={{ borderTopWidth: 0.5, borderTopColor: colors.border }}
      >
        {isBinary || isDeleteVsModify ? (
          <>
            <TouchableOpacity
              className="flex-1 py-3 rounded-[10px] items-center"
              style={{ backgroundColor: `${colors.error ?? '#ef4444'}15` }}
              onPress={handleKeepLocal}
              disabled={isResolving}
            >
              <Text className="text-sm font-bold" style={{ color: colors.error ?? '#ef4444' }}>
                Keep mine
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 py-3 rounded-[10px] items-center"
              style={{ backgroundColor: `${colors.primary ?? colors.text}15` }}
              onPress={handleKeepRemote}
              disabled={isResolving}
            >
              <Text className="text-sm font-bold" style={{ color: colors.primary ?? colors.text }}>
                Keep theirs
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              className="flex-1 py-3 rounded-[10px] items-center"
              style={{ backgroundColor: `${colors.error ?? '#ef4444'}15` }}
              onPress={handleKeepLocal}
              disabled={isResolving}
            >
              <Text className="text-sm font-bold" style={{ color: colors.error ?? '#ef4444' }}>
                Keep mine
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 py-3 rounded-[10px] items-center"
              style={{ backgroundColor: `${colors.primary ?? colors.text}15` }}
              onPress={handleKeepRemote}
              disabled={isResolving}
            >
              <Text className="text-sm font-bold" style={{ color: colors.primary ?? colors.text }}>
                Keep theirs
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 py-3 rounded-[10px] items-center"
              style={{ backgroundColor: colors.primary ?? colors.text }}
              onPress={handleSaveMerged}
              disabled={isResolving}
            >
              <Text className="text-sm font-bold" style={{ color: '#ffffff' }}>
                Save merged
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
