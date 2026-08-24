import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../contexts/ThemeContext';
import { ScreenHeader, useScreenHeaderHeight } from '../components/ui';
import { SafeAreaView } from '../components/ui/SafeAreaView';
import { groupStaged, useStageStore, type StageGroup } from '../stores/stageStore';
import { useConflictStore } from '../stores/conflictStore';
import { drainPushQueue, addOnPushFailure } from '../services/StagePushScheduler';
import { useGitHubActivityStore } from '../stores/githubActivityStore';
import type { StagedItem } from '../services/git/StagingService';
import { readDeleteFailures, parseDeleteFailureKey } from '../services/git/deleteFailures';
import { retryDeleteFailure } from '../services/git/retryDeleteFailure';
import { useSafeBack } from '../hooks/useSafeBack';
import type { RootStackParamList } from '../navigation/types';
import { pullFromSingleRepo } from '../services/RepoPullService';

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

function StageRow({ item, isConflict }: { item: StagedItem; isConflict?: boolean }) {
  const { colors } = useTheme();
  const isUpsert = item.kind === 'upsert';
  const badgeColor = isConflict ? colors.error : isUpsert ? UPSERT_COLOR : colors.error;
  const textColor = isConflict ? colors.error : colors.text;

  return (
    <View
      className="flex-row items-center justify-between px-4 py-3 border-b"
      style={{ borderBottomWidth: 0.5, borderBottomColor: isConflict ? colors.error : colors.border }}
    >
      <View className="flex-1 mr-3">
        <Text className="text-[15px] font-medium" style={{ color: textColor }} numberOfLines={1}>
          {item.filePath}
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        {isConflict ? (
          <View className="px-2 py-0.5 rounded-md" style={{ backgroundColor: `${colors.error}20` }}>
            <Text className="text-[11px] font-bold" style={{ color: colors.error }}>
              CONFLICT
            </Text>
          </View>
        ) : (
          <View className="px-2 py-0.5 rounded-md" style={{ backgroundColor: `${badgeColor}20` }}>
            <Text className="text-[11px] font-bold" style={{ color: badgeColor }}>
              {isUpsert ? 'UPDATED' : 'DELETED'}
            </Text>
          </View>
        )}
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
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const safeBack = useSafeBack();
  const staged = useStageStore((s) => s.staged);
  const isPushing = useStageStore((s) => s.isPushing);
  const globalPushing = useStageStore((s) => s.globalPushing);
  const loadStaged = useStageStore((s) => s.loadStaged);
  const registerQueueSubscription = useStageStore((s) => s.registerQueueSubscription);
  const requestPush = useStageStore((s) => s.requestPush);
  const pushAll = useStageStore((s) => s.pushAll);
  const discardStaged = useStageStore((s) => s.discardStaged);
  const conflicts = useConflictStore((s) => s.conflicts);
  const { progress, visible, label } = useGitHubActivityStore();
  const [refreshing, setRefreshing] = useState(false);
  const headerHeight = useScreenHeaderHeight();
  const [headerBlurHeight, setHeaderBlurHeight] = useState(headerHeight);
  const [deleteFailures, setDeleteFailures] = useState<readonly DeleteFailureRow[]>([]);
  const [retryingKey, setRetryingKey] = useState<string | null>(null);
  const [pushErrors, setPushErrors] = useState<Record<string, string>>({});

  // Load conflicts proactively when StageScreen mounts so per-group conflict status
  // is available immediately without requiring a push attempt first.
  useEffect(() => {
    void useConflictStore.getState().loadConflicts();
  }, []);

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

  useEffect(() => {
    const unsub = addOnPushFailure(({ key, error }) => {
      setPushErrors((prev) => ({ ...prev, [key]: error }));
    });
    return unsub;
  }, []);

  useEffect(() => {
    for (const key of Object.keys(isPushing)) {
      if (isPushing[key]) {
        setPushErrors((prev) => {
          if (prev[key]) {
            const next = { ...prev };
            delete next[key];
            return next;
          }
          return prev;
        });
      }
    }
  }, [isPushing]);

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

  const conflictFilesByGroup = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const conflict of conflicts) {
      const key = `${conflict.repoPath}::${conflict.branch}`;
      if (!map.has(key)) map.set(key, new Set());
      for (const file of conflict.files) {
        if (!file.autoResolved) {
          map.get(key)!.add(file.path);
        }
      }
    }
    return map;
  }, [conflicts]);

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

  const handlePullGroup = useCallback(
    async (group: StageGroup) => {
      try {
        const result = await pullFromSingleRepo(group.repoPath);
        if (!result || result.repos === 0) {
          Alert.alert('Pull Failed', 'Could not pull from remote. Check your network connection.');
        } else {
          void loadStaged();
          void useConflictStore.getState().loadConflicts();
        }
      } catch (error) {
        Alert.alert('Pull Failed', error instanceof Error ? error.message : 'Unknown error');
      }
    },
    [loadStaged],
  );

  const handlePushAll = useCallback(() => {
    pushAll();
    void drainPushQueue('manual');
  }, [pushAll]);

  const handleDiscardGroup = useCallback(
    (group: StageGroup) => {
      Alert.alert(
        'Discard Changes',
        `Discard all staged changes for ${repoName(group.repoPath)} / ${group.branch}? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: async () => {
              const error = await discardStaged(group.repoPath, group.branch);
              if (error) {
                Alert.alert('Discard Failed', error);
              }
            },
          },
        ],
      );
    },
    [discardStaged],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadStaged(), loadDeleteFailures(), useConflictStore.getState().loadConflicts()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadStaged, loadDeleteFailures]);

  const dismissPushError = useCallback((key: string) => {
    setPushErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const renderGroup = useCallback(
    ({ item }: { item: StageGroup }) => {
      const pushing = isPushing[item.key] ?? false;
      const pushError = pushErrors[item.key];
      const pushRejected = pushError?.includes('conflict-detected') ?? false;
      const groupConflictFiles = conflictFilesByGroup.get(item.key) ?? new Set<string>();
      const hasGroupConflicts = groupConflictFiles.size > 0;
      const unresolvedCount = groupConflictFiles.size;

      return (
        <View>
          <View className="flex-row items-center gap-2 px-4 pt-4 pb-2">
            <View className="flex-1 mr-3">
              <View className="flex-row items-center gap-2">
                <Text className="text-sm font-bold" style={{ color: colors.text }} numberOfLines={1}>
                  {repoName(item.repoPath)}
                </Text>
                {hasGroupConflicts ? (
                  <View className="px-2 py-0.5 rounded-md" style={{ backgroundColor: `${colors.error}20` }}>
                    <Text className="text-[10px] font-bold" style={{ color: colors.error }}>
                      ⚠ {unresolvedCount} CONFLICT{unresolvedCount !== 1 ? 'S' : ''}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text className="text-xs mt-0.5" style={{ color: colors.textSecondary }} numberOfLines={1}>
                {item.branch}
              </Text>
            </View>
            <TouchableOpacity
              testID={`stage.pull.${item.key}`}
              onPress={() => handlePullGroup(item)}
              disabled={pushing}
              accessibilityRole="button"
              accessibilityState={{ disabled: pushing }}
              className="px-3 py-1.5 rounded-md"
              style={{ backgroundColor: pushing ? colors.border : colors.primary }}
            >
              <Ionicons name="git-pull-request-outline" size={13} color="#ffffff" />
            </TouchableOpacity>
            <TouchableOpacity
              testID={`stage.push.${item.key}`}
              onPress={() => handlePushGroup(item)}
              disabled={pushing || hasGroupConflicts}
              accessibilityRole="button"
              accessibilityState={{ disabled: pushing || hasGroupConflicts }}
              className="px-3 py-1.5 rounded-md"
              style={{ backgroundColor: pushing || hasGroupConflicts ? colors.border : colors.primary }}
            >
              <Text className="text-xs font-bold" style={{ color: '#ffffff' }}>
                Push
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID={`stage.discard.${item.key}`}
              onPress={() => handleDiscardGroup(item)}
              disabled={pushing}
              accessibilityRole="button"
              accessibilityState={{ disabled: pushing }}
              className="px-3 py-1.5 rounded-md"
              style={{ backgroundColor: pushing ? colors.border : colors.error }}
            >
              <Ionicons name="trash" size={13} color="#ffffff" />
            </TouchableOpacity>
          </View>
          {hasGroupConflicts ? (
            <View className="flex-row items-center mx-4 mb-2">
              <TouchableOpacity
                onPress={() => navigation.navigate('Conflicts', { repoPath: item.repoPath, branch: item.branch })}
                className="flex-row items-center gap-1.5 px-3 py-2 rounded-md"
                style={{ backgroundColor: `${colors.error}15`, borderWidth: 1, borderColor: `${colors.error}40` }}
              >
                <Ionicons name="git-merge" size={14} style={{ color: colors.error }} />
                <Text className="text-xs font-medium" style={{ color: colors.error }}>
                  Resolve Conflicts ({unresolvedCount})
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {pushError ? (
            <View
              className="flex-row items-start gap-2 mx-4 mb-2 px-3 py-2 rounded-md"
              style={{ backgroundColor: `${colors.error}18`, borderWidth: 1, borderColor: `${colors.error}40` }}
            >
              <Ionicons
                name={pushRejected ? 'git-merge' : 'alert-circle'}
                size={15}
                style={{ color: colors.error, marginTop: 1 }}
              />
              <View className="flex-1 mr-2">
                <Text className="text-xs font-medium" style={{ color: colors.error }}>
                  {pushRejected
                    ? 'Push rejected: merge conflict detected. Pull latest changes or resolve conflicts manually.'
                    : `Push failed: ${pushError}`}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => dismissPushError(item.key)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Dismiss error"
              >
                <Ionicons name="close" size={14} style={{ color: colors.error }} />
              </TouchableOpacity>
            </View>
          ) : null}
          {item.items.map((row) => (
            <StageRow
              key={`${item.key}:${row.filePath}:${row.localCommitOid ?? ''}`}
              item={row}
              isConflict={groupConflictFiles.has(row.filePath)}
            />
          ))}
        </View>
      );
    },
    [colors, conflictFilesByGroup, handlePushGroup, handlePullGroup, handleDiscardGroup, isPushing, navigation, pushErrors, dismissPushError],
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

  const renderPushErrors = useCallback(() => {
    const errorKeys = Object.keys(pushErrors);
    if (errorKeys.length === 0) return null;
    return (
      <View className="px-4 py-3" style={{ backgroundColor: `${colors.error}15` }}>
        {errorKeys.map((key) => {
          const error = pushErrors[key];
          const separatorIndex = key.indexOf('::');
          const repoPath = separatorIndex !== -1 ? key.slice(0, separatorIndex) : key;
          const branch = separatorIndex !== -1 ? key.slice(separatorIndex + 2) : '';
          const isConflict = error.toLowerCase().includes('conflict');
          return (
            <View key={key} className="flex-row items-center gap-2 py-1">
              <Ionicons
                name={isConflict ? 'git-merge' : 'alert-circle'}
                size={16}
                color={colors.error}
              />
              <View className="flex-1 mr-2">
                <Text className="text-sm font-medium" style={{ color: colors.error }}>
                  {isConflict
                    ? 'Push rejected: merge conflict detected. Pull latest changes or resolve conflicts manually.'
                    : `Push failed: ${error}`}
                </Text>
                <Text className="text-xs mt-0.5" style={{ color: colors.textSecondary }} numberOfLines={1}>
                  {repoName(repoPath)} · {branch}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() =>
                  setPushErrors((prev) => {
                    const next = { ...prev };
                    delete next[key];
                    return next;
                  })
                }
                accessibilityRole="button"
                className="p-1"
              >
                <Ionicons name="close" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    );
  }, [colors, pushErrors]);

  const pushAllDisabled = staged.length === 0 || globalPushing;

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: colors.background }}>
      <ScreenHeader
        title="Staged Changes"
        onBack={safeBack}
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
          <>
            <TouchableOpacity
              testID="stage.discard-all"
              onPress={() => {
                Alert.alert(
                  'Discard All Changes',
                  'Discard all staged changes across all repositories? This cannot be undone.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Discard All',
                      style: 'destructive',
              onPress: async () => {
                const errors: string[] = [];
                for (const group of groups) {
                  const error = await discardStaged(group.repoPath, group.branch);
                  if (error) errors.push(error);
                }
                if (errors.length > 0) {
                  Alert.alert('Discard Failed', errors.join('\n'));
                }
              },
                    },
                  ],
                );
              }}
              disabled={pushAllDisabled}
              accessibilityRole="button"
              accessibilityState={{ disabled: pushAllDisabled }}
              className="px-3 py-1.5 rounded-md"
              style={{ backgroundColor: pushAllDisabled ? colors.border : colors.error }}
            >
              <Ionicons name="trash" size={13} color="#ffffff" />
            </TouchableOpacity>
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
          </>
        }
      />

      <FlatList
        data={groups}
        keyExtractor={(item) => item.key}
        renderItem={renderGroup}
        ListEmptyComponent={renderEmpty}
        ListHeaderComponent={
          pushErrors && Object.keys(pushErrors).length > 0 ? (
            <View>
              {renderPushErrors()}
              {renderFailedDeletes()}
            </View>
          ) : (
            renderFailedDeletes()
          )
        }
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
