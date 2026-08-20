import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../contexts/ThemeContext';
import { ScreenHeader, useScreenHeaderHeight } from '../components/ui';
import { SafeAreaView } from '../components/ui/SafeAreaView';
import { groupStaged, useStageStore, type StageGroup } from '../stores/stageStore';
import { drainPushQueue } from '../services/StagePushScheduler';
import { useGitHubActivityStore } from '../stores/githubActivityStore';
import type { StagedItem } from '../services/git/StagingService';
import type { RootStackParamList } from '../navigation/types';
import { readDeleteFailures, parseDeleteFailureKey } from '../services/git/deleteFailures';
import { retryDeleteFailure } from '../services/git/retryDeleteFailure';

const UPSERT_COLOR = '#22c55e';

interface DeleteFailureRow {
  readonly key: string;
  readonly repo: string;
  readonly branch: string;
  readonly path: string;
  readonly error: string;
}

function formatChip(filePath: string): string {
  const dot = filePath.lastIndexOf('.');
  if (dot === -1) return 'FILE';
  const extension = filePath.slice(dot + 1).toLowerCase();
  switch (extension) {
    case 'md': return 'MD';
    case 'json': return 'JSON';
    case 'org': return 'ORG';
    case 'norg': return 'NEORG';
    case 'txt': return 'TXT';
    default: return extension.toUpperCase();
  }
}

function repoName(repoPath: string): string {
  const segments = repoPath.split('/');
  return segments[segments.length - 1] || repoPath;
}

function StageRow({ item }: { item: StagedItem }) {
  const { colors } = useTheme();
  const isUpsert = item.kind === 'upsert';
  const badgeColor = isUpsert ? UPSERT_COLOR : colors.error;

  return (
    <View
      className="flex-row items-center justify-between px-4 py-3 border-b"
      style={{ borderBottomWidth: 0.5, borderBottomColor: colors.border }}
    >
      <View className="flex-1 mr-3">
        <Text className="text-[15px] font-medium" style={{ color: colors.text }} numberOfLines={1}>
          {item.filePath}
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        <View className="px-2 py-0.5 rounded-md" style={{ backgroundColor: `${badgeColor}20` }}>
          <Text className="text-[11px] font-bold" style={{ color: badgeColor }}>
            {isUpsert ? 'UPDATED' : 'DELETED'}
          </Text>
        </View>
        <View className="px-2 py-0.5 rounded-md" style={{ backgroundColor: `${colors.primary}20` }}>
          <Text className="text-[11px] font-bold" style={{ color: colors.primary }}>
            {formatChip(item.filePath)}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function StageScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const staged = useStageStore((s) => s.staged);
  const isPushing = useStageStore((s) => s.isPushing);
  const globalPushing = useStageStore((s) => s.globalPushing);
  const loadStaged = useStageStore((s) => s.loadStaged);
  const registerQueueSubscription = useStageStore((s) => s.registerQueueSubscription);
  const requestPush = useStageStore((s) => s.requestPush);
  const pushAll = useStageStore((s) => s.pushAll);
  const { progress, visible, label } = useGitHubActivityStore();
  const [refreshing, setRefreshing] = useState(false);
  const headerHeight = useScreenHeaderHeight();
  const [headerBlurHeight, setHeaderBlurHeight] = useState(headerHeight);
  const [deleteFailures, setDeleteFailures] = useState<readonly DeleteFailureRow[]>([]);
  const [retryingKey, setRetryingKey] = useState<string | null>(null);

  const loadDeleteFailures = useCallback(async () => {
    const map = await readDeleteFailures();
    const rows: DeleteFailureRow[] = Object.entries(map)
      .map(([mapKey, entry]) => {
        const parts = parseDeleteFailureKey(mapKey);
        if (!parts || !parts.repo || !parts.path) return null;
        return { key: mapKey, repo: parts.repo, branch: parts.branch, path: parts.path, error: entry.error };
      })
      .filter((row): row is DeleteFailureRow => row !== null);
    setDeleteFailures(rows);
  }, []);

  useEffect(() => {
    void loadDeleteFailures();
  }, [loadDeleteFailures]);

  const handleRetryDelete = useCallback(async (row: DeleteFailureRow) => {
    setRetryingKey(row.key);
    try {
      await retryDeleteFailure(row.repo, row.branch, row.path);
    } finally {
      setRetryingKey(null);
    }
    void loadDeleteFailures();
  }, [loadDeleteFailures]);

  const groups = groupStaged(staged);

  useEffect(() => {
    void loadStaged();
    registerQueueSubscription();
  }, [loadStaged, registerQueueSubscription]);

  const handlePushGroup = useCallback(
    (group: StageGroup) => {
      requestPush(group.repoPath, group.branch);
      void drainPushQueue('manual');
    },
    [requestPush],
  );

  const handlePushAll = useCallback(() => {
    pushAll();
    void drainPushQueue('manual');
  }, [pushAll]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadStaged(), loadDeleteFailures()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadStaged, loadDeleteFailures]);

  const renderGroup = useCallback(
    ({ item }: { item: StageGroup }) => {
      const pushing = isPushing[item.key] ?? false;
      return (
        <View>
          <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
            <View className="flex-1 mr-3">
              <Text className="text-sm font-bold" style={{ color: colors.text }} numberOfLines={1}>
                {repoName(item.repoPath)}
              </Text>
              <Text className="text-xs mt-0.5" style={{ color: colors.textSecondary }} numberOfLines={1}>
                {item.branch}
              </Text>
            </View>
            <TouchableOpacity
              testID={`stage.push.${item.key}`}
              onPress={() => handlePushGroup(item)}
              disabled={pushing}
              accessibilityRole="button"
              accessibilityState={{ disabled: pushing }}
              className="px-3 py-1.5 rounded-md"
              style={{ backgroundColor: pushing ? colors.border : colors.primary }}
            >
              <Text className="text-xs font-bold" style={{ color: '#ffffff' }}>
                Push
              </Text>
            </TouchableOpacity>
          </View>
          {item.items.map((row) => (
            <StageRow key={`${item.key}:${row.filePath}:${row.localCommitOid ?? ''}`} item={row} />
          ))}
        </View>
      );
    },
    [colors, handlePushGroup, isPushing],
  );

  const renderEmpty = useCallback(
    () => (
      <View className="flex-1 items-center justify-center">
        <Text testID="stage.empty" className="text-base" style={{ color: colors.textSecondary }}>
          No staged changes
        </Text>
      </View>
    ),
    [colors],
  );

  const renderFailedDeletes = useCallback(() => {
    if (deleteFailures.length === 0) return null;
    return (
      <View className="px-4 pb-2">
        <Text className="text-sm font-bold pt-4 pb-2" style={{ color: colors.text }}>
          Failed to delete
        </Text>
        {deleteFailures.map((row) => (
          <View
            key={row.key}
            className="flex-row items-center justify-between py-2 border-b"
            style={{ borderBottomWidth: 0.5, borderBottomColor: colors.border }}
          >
            <View className="flex-1 mr-3">
              <Text className="text-[15px] font-medium" style={{ color: colors.text }} numberOfLines={1}>
                {row.path}
              </Text>
              <Text className="text-xs mt-0.5" style={{ color: colors.textSecondary }} numberOfLines={1}>
                {row.repo} · {row.branch}
              </Text>
              <Text className="text-xs mt-0.5" style={{ color: colors.error }} numberOfLines={1}>
                {row.error}
              </Text>
            </View>
            <TouchableOpacity
              testID={`stage.retry-delete.${row.key}`}
              onPress={() => handleRetryDelete(row)}
              disabled={retryingKey === row.key}
              accessibilityRole="button"
              accessibilityState={{ disabled: retryingKey === row.key }}
              className="px-3 py-1.5 rounded-md"
              style={{ backgroundColor: retryingKey === row.key ? colors.border : colors.primary }}
            >
              <Text className="text-xs font-bold" style={{ color: '#ffffff' }}>
                Retry
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    );
  }, [colors, deleteFailures, handleRetryDelete, retryingKey]);

  const pushAllDisabled = staged.length === 0 || globalPushing;

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: colors.background }}>
      <ScreenHeader
        title="Staged Changes"
        onBack={() => navigation.goBack()}
        onLayout={(event) => setHeaderBlurHeight(event.nativeEvent.layout.height)}
        footer={
          visible ? (
            <View
              className="px-4 py-2 border-b"
              style={{ backgroundColor: `${colors.primary}14`, borderBottomColor: colors.border }}
            >
              <Text className="text-xs font-medium" style={{ color: colors.textSecondary }} numberOfLines={1}>
                {label ?? 'Syncing with GitHub'}
                {progress?.total != null ? ` — ${progress.loaded}/${progress.total}` : ''}
              </Text>
            </View>
          ) : null
        }
        actions={
          <TouchableOpacity
            testID="stage.push-all"
            onPress={handlePushAll}
            disabled={pushAllDisabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: pushAllDisabled }}
            className="px-3 py-1.5 rounded-md"
            style={{ backgroundColor: pushAllDisabled ? colors.border : colors.primary }}
          >
            <Text className="text-xs font-bold" style={{ color: '#ffffff' }}>
              Push all
            </Text>
          </TouchableOpacity>
        }
      />

      <FlatList
        data={groups}
        keyExtractor={(item) => item.key}
        renderItem={renderGroup}
        ListEmptyComponent={renderEmpty}
        ListHeaderComponent={renderFailedDeletes}
        contentContainerStyle={{
          paddingTop: headerBlurHeight + 8,
          paddingBottom: 32,
          ...(groups.length === 0 ? { flexGrow: 1 } : null),
        }}
        refreshControl={
          <RefreshControl
            testID="stage.pull-refresh"
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      />
    </SafeAreaView>
  );
}
