import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/text';
import { Button, ButtonText } from '@/components/ui/Button';
import { FlatList } from '@/components/ui/flat-list';
import { DiffLineList, previewLines } from './DiffLineList';
import { CommitComposer } from './CommitComposer';
import { Modal } from '@/components/ui/Modal';
import * as GitEngine from '@/services/git/engine/GitEngine';
import type { FileDiff, FileStatus } from '@/services/git/engine/GitEngine';
import { GitFsService } from '@/services/git/GitFsService';
import type { RootStackParamList } from '@/navigation/types';
import type { SectionProps } from './exploreShared';
import { useTokens } from '@/contexts/ThemeContext';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface StagingData {
  staged: FileStatus[];
  changedPaths: string[];
  statuses: FileStatus[];
  diffs: Record<string, FileDiff>;
}

export function StagingSection({ repo, active, onChanged, chromeTopInset = 0, onNavigate }: SectionProps) {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTokens();
  const [data, setData] = useState<StagingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [notCloned, setNotCloned] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotCloned(false);
    try {
      const cloned = await GitFsService.isCloned({ repoPath: repo.path });
      if (!cloned) {
        setNotCloned(true);
        setLoading(false);
        return;
      }
      const statuses = await GitEngine.statuses(repo.localPath);
      const staged = statuses.filter((entry) => entry.staged);
      const changedPaths = statuses.map((entry) => entry.path);
      const diffResults = await Promise.all(
        staged
          .filter((entry) => entry.status !== 'Untracked')
          .map(async (entry) => {
            try {
              return await GitEngine.diffFile(repo.localPath, entry.path);
            } catch {
              return null;
            }
          }),
      );
      const diffs: Record<string, FileDiff> = {};
      for (const diff of diffResults) {
        if (diff && diff.path) diffs[diff.path] = diff;
      }
      setData({ staged, changedPaths, statuses, diffs });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [repo.localPath, repo.path]);

  useEffect(() => {
    if (active) void load();
  }, [active, load, version]);

  useFocusEffect(
    useCallback(() => {
      if (active) void load();
    }, [active, load]),
  );

  const unstage = useCallback(
    async (path: string) => {
      setBusyPath(path);
      try {
        await GitEngine.unstage(repo.localPath, [path]);
        onChanged();
        setVersion((value) => value + 1);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusyPath(null);
      }
    },
    [repo.localPath, onChanged],
  );

  const unstageAll = useCallback(async () => {
    const paths = data?.staged.map((entry) => entry.path) ?? [];
    if (paths.length === 0) return;
    setBusyPath('*');
    try {
      await GitEngine.unstage(repo.localPath, paths);
      onChanged();
      setVersion((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPath(null);
    }
  }, [data, repo.localPath, onChanged]);

  const discardFile = useCallback(
    async (path: string) => {
      setBusyPath(path);
      try {
        await GitEngine.unstage(repo.localPath, [path]);
        await GitEngine.discardFiles(repo.localPath, [path]);
        onChanged();
        setVersion((value) => value + 1);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusyPath(null);
      }
    },
    [repo.localPath, onChanged],
  );

  const renderItem = useCallback(
    ({ item }: { item: FileStatus }) => {
      const diff = data?.diffs[item.path];
      return (
        <View className="mx-4 mb-3 rounded-sm p-3" style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}>
          <Pressable
            onPress={() => navigation.navigate('ExploreDiff', { repoId: repo.id, path: item.path })}
            accessibilityRole="button"
            testID={`explore.staged.${item.path}`}
          >
            <View className="flex-row items-center gap-2">
              <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: `${colors.accent}26` }}>
                <Text className="text-[10px] font-semibold" style={{ color: colors.accent }}>staged</Text>
              </View>
              <Text className="min-w-0 flex-1 text-sm font-semibold" style={{ color: colors.text }} numberOfLines={1}>
                {item.path}
              </Text>
              {diff && (
                <Text className="text-[11px] font-mono" style={{ color: colors.textSecondary }}>
                  <Text style={{ color: colors.success }}>+{diff.added}</Text>{' '}
                  <Text style={{ color: colors.error }}>−{diff.deleted}</Text>
                </Text>
              )}
            </View>
            {diff && !diff.isBinary && (diff.lines?.length ?? 0) > 0 && (
              <View className="mt-2">
                <DiffLineList lines={previewLines(diff.lines)} />
              </View>
            )}
          </Pressable>
          <View className="mt-2 flex-row justify-end gap-2">
            <Button
              size="sm"
              variant="danger"
              disabled={busyPath !== null}
              onPress={() => void discardFile(item.path)}
              testID={`explore.discard.${item.path}`}
              label={busyPath === item.path ? '…' : 'Discard'}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busyPath !== null}
              onPress={() => void unstage(item.path)}
              testID={`explore.unstage.${item.path}`}
              label={busyPath === item.path ? '…' : 'Unstage'}
            />
          </View>
        </View>
      );
    },
    [colors, data, navigation, repo.id, unstage, discardFile, busyPath],
  );

  if (error) {
    return (
      <View className="absolute inset-0 items-center justify-center px-8 py-10 z-50" style={{ backgroundColor: colors.background + 'ee' }}>
        <Ionicons name="warning-outline" size={36} color={colors.error} />
        <Text className="mt-2 text-center text-sm" style={{ color: colors.error }}>{error}</Text>
        <Button variant="outline" size="sm" className="mt-3" onPress={() => void load()}>
          <ButtonText>Retry</ButtonText>
        </Button>
      </View>
    );
  }

  if (notCloned) {
    return (
      <View className="items-center px-8 py-10">
        <Ionicons name="folder-outline" size={36} color={colors.textSecondary} />
        <Text className="mt-2 text-center text-sm font-semibold" style={{ color: colors.text }}>Clone required</Text>
        <Text className="mt-1 text-center text-xs" style={{ color: colors.textSecondary }}>
          This repository has not been cloned to this device yet.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ flex: 1 }}>
      <FlatList
        className="flex-1"
        data={data?.staged ?? []}
        keyExtractor={(item) => item.path}
        renderItem={renderItem}
        contentContainerStyle={{ paddingTop: chromeTopInset, paddingBottom: 16 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} />
        }
        ListHeaderComponent={
          <View className="flex-row items-center justify-between px-4 pb-2">
            <Text className="text-xs" style={{ color: colors.textSecondary }} testID="explore.staging.count">
              {data ? `${data.staged.length} staged file(s)` : 'Reading index…'}
            </Text>
            <View className="flex-row items-center gap-2">
              {loading && <ActivityIndicator size="small" color={colors.accent} />}
              {(data?.changedPaths.length ?? 0) > 0 && (
                <Button size="sm" variant="primary" onPress={() => setCommitOpen(true)} testID="explore.staging.commit-open" label="Commit pending" />
              )}
              {(data?.staged.length ?? 0) > 0 && (
                <Button size="sm" variant="outline" disabled={busyPath !== null} onPress={() => void unstageAll()}>
                  <ButtonText>Unstage all</ButtonText>
                </Button>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View className="items-center justify-center py-16" testID="explore.staging.empty">
              <Ionicons name="layers-outline" size={40} color={colors.textSecondary} />
              <Text className="mt-2 text-center text-sm" style={{ color: colors.textSecondary }}>
                Nothing staged. Stage changes from the Changes tab.
              </Text>
            </View>
          ) : undefined
        }
        testID="explore.staging.list"
      />
      <Modal visible={commitOpen} bottomSheet onRequestClose={() => setCommitOpen(false)}>
        <CommitComposer
          embedded
          repo={repo}
          changedPaths={data?.changedPaths ?? []}
          statuses={data?.statuses ?? []}
          stagedCount={data?.staged.length ?? 0}
          onCommitted={() => {
            setCommitOpen(false);
            onChanged();
            setVersion((value) => value + 1);
            onNavigate?.('commits');
          }}
        />
      </Modal>
    </View>
  );
}
