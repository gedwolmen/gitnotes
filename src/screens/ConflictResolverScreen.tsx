import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { useConflictStore } from '../stores/conflictStore';
import { useAIStore } from '../stores/aiStore';
import { ConflictResolverService } from '../services/conflict/ConflictResolverService';
import { proposeMerge } from '../services/conflict/AiConflictResolver';
import { GitFsService } from '../services/git/GitFsService';
import { LocalGitWriter } from '../services/git/LocalGitWriter';
import { AuthService } from '../services/AuthService';
import type { FileConflict } from '../services/conflict/types';
import type { RootStackParamList } from '../navigation/types';
import { ScreenHeader } from '../components/ui';
import { SafeAreaView } from '../components/ui/SafeAreaView';
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
  const [isProposing, setIsProposing] = useState(false);
  const [aiNote, setAiNote] = useState<string | undefined>(undefined);
  const [aiConfidence, setAiConfidence] = useState<'high' | 'low' | undefined>(undefined);

  const hasAiModel = useAIStore((s) => s.getSelectedModel() !== undefined);
  const isFileResolved = file?.autoResolved === true;

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
    const merged = file?.mergedContent ?? '';
    if (!merged || merged.includes('<<<<<<<') || merged.includes('=======') || merged.includes('>>>>>>>')) {
      Alert.alert(
        'Unresolved conflict',
        'Resolve the conflict markers in the merged view before saving — otherwise the file would be persisted empty or with raw markers.',
      );
      return;
    }
    const updated = ConflictResolverService.applyResolution(conflict, filePath, {
      content: merged,
    });
    updateConflict(repoPath, branch, () => updated);
    checkAndFinish(updated);
  }, [conflict, filePath, file, repoPath, branch, updateConflict]);

  const handleAiFix = useCallback(async () => {
    if (!file || !conflict) return;
    const aiState = useAIStore.getState();
    const modelConfig = aiState.getSelectedModel();
    const providerConfig = aiState.providers.find((p) => p.id === modelConfig?.providerId);

    setIsProposing(true);
    setAiNote(undefined);
    setAiConfidence(undefined);
    try {
      const proposal = await proposeMerge(file, modelConfig, providerConfig);
      setAiNote(proposal.note);
      setAiConfidence(proposal.confidence);
      if (proposal.mergedContent !== null) {
        const updated = ConflictResolverService.applyResolution(conflict, filePath, {
          content: proposal.mergedContent,
        });
        updateConflict(repoPath, branch, () => updated);
        setActiveTab('merged');
      }
    } finally {
      setIsProposing(false);
    }
  }, [conflict, file, filePath, repoPath, branch, updateConflict]);

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
          } else if (
            f.kind === 'local-modified-remote-deleted' ||
            f.kind === 'local-deleted-remote-modified'
          ) {
            await LocalGitWriter.deleteAndCommit({
              repoPath,
              branch,
              filePath: f.path,
              message: `merge: delete ${f.path} (conflict resolution)`,
              author: { name: authorName, email: authorEmail },
              token,
              push: false,
            });
          } else {
            // Refuse to delete: this is a binary both-changed-different
            // conflict whose blob wasn't carried through the conflict model.
            // The user must re-resolve manually.
            console.warn(
              `[ConflictResolverScreen] skipping unresolved file ${f.path} (kind=${f.kind}, format=${f.format}); refusing to delete.`,
            );
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
          push: false,
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

      {hasAiModel && !isBinary && !isDeleteVsModify && (
        <View
          className="flex-row items-center gap-2 px-4 py-2 border-t"
          style={{ borderTopWidth: 0.5, borderTopColor: colors.border }}
        >
          <TouchableOpacity
            testID="conflict-resolver.ai-fix"
            onPress={handleAiFix}
            disabled={isFileResolved || isResolving || isProposing}
            className="flex-row items-center gap-1.5 px-3 py-2 rounded-lg"
            style={{
              backgroundColor: `${colors.primary ?? colors.text}15`,
              opacity: isFileResolved || isResolving || isProposing ? 0.5 : 1,
            }}
          >
            {isProposing ? (
              <ActivityIndicator size="small" color={colors.primary ?? colors.text} />
            ) : null}
            <Text className="text-[12px] font-bold" style={{ color: colors.primary ?? colors.text }}>
              {isProposing ? 'AI fixing…' : 'AI-fix'}
            </Text>
          </TouchableOpacity>
          {aiNote || aiConfidence ? (
            <Text
              testID="conflict-resolver.ai-note"
              className="text-xs flex-1"
              style={{ color: colors.textSecondary }}
              numberOfLines={2}
            >
              {aiNote ?? `AI suggestion · ${aiConfidence} confidence`}
            </Text>
          ) : null}
        </View>
      )}

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
              disabled={isResolving || isProposing}
            >
              <Text className="text-sm font-bold" style={{ color: colors.error ?? '#ef4444' }}>
                Keep mine
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 py-3 rounded-[10px] items-center"
              style={{ backgroundColor: `${colors.primary ?? colors.text}15` }}
              onPress={handleKeepRemote}
              disabled={isResolving || isProposing}
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
              disabled={isResolving || isProposing}
            >
              <Text className="text-sm font-bold" style={{ color: colors.error ?? '#ef4444' }}>
                Keep mine
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 py-3 rounded-[10px] items-center"
              style={{ backgroundColor: `${colors.primary ?? colors.text}15` }}
              onPress={handleKeepRemote}
              disabled={isResolving || isProposing}
            >
              <Text className="text-sm font-bold" style={{ color: colors.primary ?? colors.text }}>
                Keep theirs
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 py-3 rounded-[10px] items-center"
              style={{ backgroundColor: colors.primary ?? colors.text }}
              onPress={handleSaveMerged}
              disabled={isResolving || isProposing}
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
