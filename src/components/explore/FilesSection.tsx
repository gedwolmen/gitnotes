import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/text';
import { Button, ButtonText } from '@/components/ui/Button';
import { FlatList } from '@/components/ui/flat-list';
import * as GitEngine from '@/services/git/engine/GitEngine';
import type { FileStatus } from '@/services/git/engine/GitEngine';
import { GitHubService } from '@/services/GitHubService';
import { GitFsService } from '@/services/git/GitFsService';
import type { RootStackParamList } from '@/navigation/types';
import {
  buildFileTreeRows,
  changedFileAncestors,
  isBinaryPath,
  STATUS_META,
  walkWorkingTree,
  type FileTreeRow,
  type SectionProps,
} from './exploreShared';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface FilesData {
  files: string[];
  truncated: boolean;
  statuses: Record<string, FileStatus>;
}

export function FilesSection({ repo, active }: SectionProps) {
  const navigation = useNavigation<NavigationProp>();
  const [data, setData] = useState<FilesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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

      let files: string[] = [];
      let truncated = false;

      try {
        const tree = walkWorkingTree(repo.localPath);
        files = tree.files;
        truncated = tree.truncated;
      } catch {
        const parts = repo.path.split('/');
        const owner = parts[0];
        const repoName = parts[1] ?? parts[0];
        const branch = repo.branch ?? 'main';
        const treeEntries = await GitHubService.getTreeRecursiveOrThrow(owner, repoName, branch);
        files = treeEntries.map((e) => e.path);
      }

      let entries: FileStatus[] = [];
      try {
        entries = await GitEngine.statuses(repo.localPath);
      } catch {
        entries = [];
      }
      const statuses: Record<string, FileStatus> = {};
      for (const entry of entries) statuses[entry.path] = entry;
      setData({ files, truncated, statuses });
      setExpanded(changedFileAncestors(entries.map((entry) => entry.path)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [repo.localPath, repo.path, repo.branch]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const rows = useMemo(
    () => (data ? buildFileTreeRows(data.files, expanded) : []),
    [data, expanded],
  );

  const toggleDir = useCallback((dirPath: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: FileTreeRow }) => {
      if (item.kind === 'dir') {
        return (
          <Pressable
            onPress={() => toggleDir(item.path)}
            accessibilityRole="button"
            testID={`explore.files.dir.${item.path}`}
            className="mx-4 mb-1 flex-row items-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
            style={{ marginLeft: 16 + item.depth * 16 }}
          >
            <Ionicons
              name={item.expanded ? 'folder-open-outline' : 'folder-outline'}
              size={16}
              color="#6b7280"
            />
            <Text className="ml-2 min-w-0 flex-1 text-sm font-semibold text-black" numberOfLines={1}>
              {item.name}
            </Text>
            <Text className="mr-1 text-[11px] text-gray-500">{item.fileCount}</Text>
            <Ionicons
              name={item.expanded ? 'chevron-down' : 'chevron-forward'}
              size={14}
              color="#9ca3af"
            />
          </Pressable>
        );
      }
      const status = data?.statuses[item.path];
      const meta = status ? STATUS_META[status.status] : null;
      return (
        <Pressable
          onPress={() => navigation.navigate('ExploreFile', { repoId: repo.id, path: item.path })}
          accessibilityRole="button"
          testID={`explore.file.${item.path}`}
          className="mx-4 mb-1.5 flex-row items-center rounded-lg border border-gray-200 bg-white px-3 py-2"
          style={{ marginLeft: 16 + item.depth * 16 }}
        >
          <Ionicons
            name={meta?.icon ?? 'document-outline'}
            size={16}
            color={meta?.iconColor ?? '#9ca3af'}
          />
          <Text className="ml-2 min-w-0 flex-1 text-sm text-black" numberOfLines={1}>
            {item.name}
          </Text>
          {isBinaryPath(item.path) && (
            <View className="mr-1.5 rounded bg-gray-100 px-1.5 py-0.5">
              <Text className="text-[10px] font-semibold text-gray-600">binary</Text>
            </View>
          )}
          {meta && (
            <View className={`rounded px-1.5 py-0.5 ${meta.badgeClass}`}>
              <Text className="text-[10px] font-semibold">{meta.label}</Text>
            </View>
          )}
        </Pressable>
      );
    },
    [data, navigation, repo.id, toggleDir],
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
      data={rows}
      keyExtractor={(item) => `${item.kind}:${item.path}`}
      renderItem={renderItem}
      contentContainerStyle={{ paddingTop: 10, paddingBottom: 96 }}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor="#7b8cde" />
      }
      ListHeaderComponent={
        <View className="flex-row items-center justify-between px-4 pb-2">
          <Text className="text-xs text-gray-500" testID="explore.files.count">
            {data ? `${data.files.length} file(s)${data.truncated ? ' (truncated)' : ''}` : 'Reading working tree…'}
          </Text>
          {loading && <ActivityIndicator size="small" color="#7b8cde" />}
        </View>
      }
      ListEmptyComponent={
        !loading ? (
          <Text className="mt-8 text-center text-gray-500">Empty working tree.</Text>
        ) : undefined
      }
      testID="explore.files.list"
    />
  );
}
