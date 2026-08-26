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
import { SyncEngineService } from '../services/SyncEngineService';
import { CloneSyncService } from '../services/CloneSyncService';
import { pullFromSingleRepo } from '../services/RepoPullService';
import { AuthService } from '../services/AuthService';
import type { FileConflict } from '../services/conflict/types';
import type { RootStackParamList } from '../navigation/types';
import { ScreenHeader } from '../components/ui';
import { SafeAreaView } from '../components/ui/SafeAreaView';
import { cn } from '../lib/utils';
import MarkdownEditor from '../components/MarkdownEditor';
import type { NoteFormat } from '../models/Note';

type Tab = 'merged' | 'local' | 'remote';
type Nav = NativeStackNavigationProp<RootStackParamList, 'ConflictResolver'>;
type ConflictRoute = RouteProp<RootStackParamList, 'ConflictResolver'>;

function noteFormatFromPath(path: string): NoteFormat {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'org': return 'org';
    case 'norg': return 'neorg';
    case 'json': return 'json';
    default: return 'markdown';
  }
}

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
  // User's manual edits to the merged content, seeded from the last known
  // mergedContent. `null` means "not yet edited — fall back to the store value".
  const [editedMergedContent, setEditedMergedContent] = useState<string | null>(null);

  const hasAiModel = useAIStore((s) => s.getSelectedModel() !== undefined);
  const isFileResolved = file?.autoResolved === true;

  const displayContent = useMemo(() => {
    if (!file) return '';
    switch (activeTab) {
      case 'local': return file.localContent ?? '(deleted)';
      case 'remote': return file.remoteContent ?? '(deleted)';
      case 'merged':
        return editedMergedContent ?? file.mergedContent ?? file.localContent ?? file.remoteContent ?? '';
    }
  }, [file, activeTab, editedMergedContent]);

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
    const merged = editedMergedContent ?? file?.mergedContent ?? '';
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
  }, [conflict, filePath, file, repoPath, branch, updateConflict, editedMergedContent]);

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
        setEditedMergedContent(null);
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
      const skippedFiles: string[] = [];
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
            skippedFiles.push(f.path);
          }
        }

        if (skippedFiles.length > 0) {
          Alert.alert(
            'Some conflicts could not be resolved',
            `The following files still have unresolved conflicts and were skipped: ${skippedFiles.join(', ')}. Please resolve them manually before the next sync.`,
            [{ text: 'OK' }],
          );
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

        const isApiMode = (await SyncEngineService.getMode(repoPath)) === 'api';
        if (isApiMode) {
          const pushResult = await LocalGitWriter.push({ repoPath, branch, token });
          if (!pushResult.success) {
            Alert.alert('Push failed', pushResult.error ?? 'Unknown error', [
              { text: 'OK', onPress: () => navigation.goBack() },
            ]);
            return;
          }
          Alert.alert('Conflicts resolved', 'Your changes have been pushed to GitHub.', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        } else {
          // Clone mode — push through CloneSyncService
          const pushResult = await CloneSyncService.pushPending(repoPath, branch);
          if (pushResult.conflicted) {
            Alert.alert('Push conflicted', 'A new conflict was detected. Please resolve it.', [
              { text: 'OK', onPress: () => navigation.goBack() },
            ]);
          } else if (pushResult.succeeded > 0) {
            await pullFromSingleRepo(repoPath);
            Alert.alert('Conflicts resolved', 'Your changes have been pushed to GitHub.', [
              { text: 'OK', onPress: () => navigation.goBack() },
            ]);
          } else {
            Alert.alert('Push failed', 'Changes committed but could not be pushed. Try again manually.', [
              { text: 'OK', onPress: () => navigation.goBack() },
            ]);
          }
        }
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

      {activeTab === 'merged' && !isBinary && !isDeleteVsModify ? (
        <View className="flex-1 px-4 py-2">
          <MarkdownEditor
            content={displayContent}
            onContentChange={setEditedMergedContent}
            showToolbar
            inputTestID="conflict-resolver.merged-editor"
            format={noteFormatFromPath(file?.path ?? '')}
          />
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerClassName="p-4">
          <Text className="font-mono text-sm leading-[22px]" style={{ color: colors.text }}>{displayContent}</Text>
        </ScrollView>
      )}

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

      {isResolving && (
        <View
          testID="conflict-resolver.committing-overlay"
          pointerEvents="auto"
          className="absolute inset-0 items-center justify-center z-50"
        >
          <View className="absolute inset-0 bg-black/40" />
          <View className="items-center gap-3 bg-components-bg-secondary rounded-2xl p-6 shadow-xl border border-components-border">
            <ActivityIndicator size="large" color={colors.primary ?? colors.text} />
            <Text className="text-sm font-semibold" style={{ color: colors.text }}>
              Resolving conflict…
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
