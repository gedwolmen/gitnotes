import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/text';
import { Button, ButtonText } from '@/components/ui/Button';
import { FlatList } from '@/components/ui/flat-list';
import { DiffLineList, previewLines } from './DiffLineList';
import * as GitEngine from '@/services/git/engine/GitEngine';
import type { FileDiff, FileStatus } from '@/services/git/engine/GitEngine';
import { GitFsService } from '@/services/git/GitFsService';
import type { RootStackParamList } from '@/navigation/types';
import { STATUS_META, type SectionProps } from './exploreShared';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface ChangesData {
  statuses: FileStatus[];
  diffs: Record<string, FileDiff>;
}

export function ChangesSection({ repo, active, onChanged }: SectionProps) {
  const navigation = useNavigation<NavigationProp>();
  const [data, setData] = useState<ChangesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [notCloned, setNotCloned] = useState(false);

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
      const [statuses, diffs] = await Promise.all([
        GitEngine.statuses(repo.localPath),
        GitEngine.diffAll(repo.localPath),
      ]);
      setData({
        statuses,
        diffs: Object.fromEntries(diffs.map((diff) => [diff.path, diff])),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [repo.localPath, repo.path]);

  useEffect(() => {
    if (active) void load();
  }, [active, load, version]);

  const stageFile = useCallback(
    async (path: string) => {
      try {
        await GitEngine.stage(repo.localPath, [path]);
        onChanged();
        setVersion((value) => value + 1);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [repo.localPath, onChanged],
  );

  const stageAll = useCallback(async () => {
    if (!data?.statuses) return;
    const unstaged = data.statuses.filter((s) => !s.staged);
    if (unstaged.length === 0) return;
    try {
      await Promise.all(unstaged.map((s) => GitEngine.stage(repo.localPath, [s.path])));
      onChanged();
      setVersion((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [data, repo.localPath, onChanged]);

  const renderItem = useCallback(
    ({ item }: { item: FileStatus }) => {
      const meta = STATUS_META[item.status];
      const diff = data?.diffs[item.path];
      return (
        <View className="mx-4 mb-3 rounded-lg border border-gray-200 bg-white p-3">
          <Pressable
            onPress={() => navigation.navigate('ExploreDiff', { repoId: repo.id, path: item.path })}
            accessibilityRole="button"
            testID={`explore.change.${item.path}`}
          >
            <View className="flex-row items-center gap-2">
              <View className={`rounded px-1.5 py-0.5 ${meta.badgeClass}`}>
                <Text className="text-[10px] font-semibold">{meta.label}</Text>
              </View>
              <Text className="min-w-0 flex-1 text-sm font-semibold text-black" numberOfLines={1}>
                {item.path}
              </Text>
              {diff && (
                <Text className="text-[11px] font-mono text-gray-500">
                  <Text className="text-emerald-600">+{diff.added}</Text>{' '}
                  <Text className="text-red-500">−{diff.deleted}</Text>
                </Text>
              )}
            </View>
            {diff && !diff.isBinary && (diff.lines?.length ?? 0) > 0 && (
              <View className="mt-2">
                <DiffLineList lines={previewLines(diff.lines)} />
              </View>
            )}
            {diff?.isBinary && (
              <Text className="mt-1 text-[11px] text-gray-500">binary file</Text>
            )}
          </Pressable>
          {!item.staged && (
            <View className="mt-2 flex-row justify-end">
              <Button size="sm" variant="outline" onPress={() => void stageFile(item.path)}>
                <ButtonText>Stage</ButtonText>
              </Button>
            </View>
          )}
        </View>
      );
    },
    [data, navigation, repo.id, stageFile],
  );

  if (error) {
    return (
      <View className="items-center px-8 py-10">
        <Ionicons name="warning-outline" size={36} color="#dc2626" />
        <Text className="mt-2 text-center text-sm text-red-600">{error}</Text>
        <Button variant="outline" size="sm" className="mt-3" onPress={() => void load()}>
          <ButtonText>Retry</ButtonText>
        </Button>
      </View>
    );
  }

  if (notCloned) {
    return (
      <View className="items-center px-8 py-10">
        <Ionicons name="folder-outline" size={36} color="#9ca3af" />
        <Text className="mt-2 text-center text-sm font-semibold text-gray-700">Clone required</Text>
        <Text className="mt-1 text-center text-xs text-gray-500">
          This repository has not been cloned to this device yet.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={data?.statuses ?? []}
      keyExtractor={(item) => item.path}
      renderItem={renderItem}
      contentContainerStyle={{ paddingTop: 10, paddingBottom: 96 }}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor="#7b8cde" />
      }
      ListHeaderComponent={
        <View className="flex-row items-center justify-between px-4 pb-2">
          <Text className="text-xs text-gray-500" testID="explore.changes.count">
            {data ? `${data.statuses.length} changed file(s)` : 'Reading status…'}
          </Text>
          <View className="flex-row items-center gap-2">
            {data && data.statuses.some((s) => !s.staged) && (
              <Button size="xs" variant="outline" onPress={() => void stageAll()}>
                <ButtonText>Stage All</ButtonText>
              </Button>
            )}
            {loading && <ActivityIndicator size="small" color="#7b8cde" />}
          </View>
        </View>
      }
      ListEmptyComponent={
        !loading ? (
          <View className="items-center px-8 py-10" testID="explore.changes.empty">
            <Ionicons name="checkmark-circle-outline" size={40} color="#22c55e" />
            <Text className="mt-2 text-center text-sm text-gray-500">
              Working tree clean — no changes.
            </Text>
          </View>
        ) : undefined
      }
      testID="explore.changes.list"
    />
  );
}
