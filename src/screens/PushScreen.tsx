import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { ScreenHeader, useScreenHeaderHeight } from '../components/ui';
import { SafeAreaView } from '../components/ui/SafeAreaView';
import { UnpushedCommitsService } from '../services/git/UnpushedCommitsService';
import type { CommitSummary, ChangedFile } from '../services/git/UnpushedCommitsService';
import { LocalGitWriter } from '../services/git/LocalGitWriter';
import { AuthService } from '../services/AuthService';
import { pullFromSingleRepo } from '../services/RepoPullService';
import { useSafeBack } from '../hooks/useSafeBack';
import { useGitActivityStore } from '../stores/gitActivityStore';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Push'>;
type PushRoute = RouteProp<RootStackParamList, 'Push'>;

function formatTimestamp(ts: number): string {
  const now = Date.now();
  const diffMs = now - ts * 1000;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function FileChangeChip({ file }: { file: ChangedFile }) {
  const { colors } = useTheme();
  const colorMap: Record<ChangedFile['status'], string> = {
    added: '#22c55e',
    modified: colors.primary,
    deleted: colors.error,
  };
  const labelMap: Record<ChangedFile['status'], string> = {
    added: 'A',
    modified: 'M',
    deleted: 'D',
  };
  const chipColor = colorMap[file.status];

  return (
    <View
      className="flex-row items-center gap-1.5 px-2 py-0.5 rounded-md"
      style={{ backgroundColor: `${chipColor}18` }}
    >
      <Text className="text-[10px] font-bold" style={{ color: chipColor }}>
        {labelMap[file.status]}
      </Text>
      <Text
        className="text-[11px] flex-1"
        style={{ color: colors.text }}
        numberOfLines={1}
      >
        {file.path}
      </Text>
    </View>
  );
}

function CommitRow({
  commit,
  repoPath,
  branch,
}: {
  commit: CommitSummary;
  repoPath: string;
  branch: string;
}) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [files, setFiles] = useState<readonly ChangedFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const handleToggle = useCallback(async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (files.length === 0 && !loadingFiles) {
      setLoadingFiles(true);
      try {
        const result = await UnpushedCommitsService.listFiles({
          repo: repoPath,
          branch,
          oid: commit.oid,
        });
        setFiles(result);
      } finally {
        setLoadingFiles(false);
      }
    }
  }, [expanded, files.length, loadingFiles, repoPath, branch, commit.oid]);

  return (
    <View
      className="border-b"
      style={{ borderBottomWidth: 0.5, borderBottomColor: colors.border }}
    >
      <TouchableOpacity
        testID={`push.commit.${commit.oid}`}
        onPress={handleToggle}
        className="flex-row items-start justify-between px-4 py-3"
        accessibilityRole="button"
        accessibilityLabel={`Commit: ${commit.subject}`}
        accessibilityHint="Tap to expand and see changed files"
      >
        <View className="flex-1 mr-3">
          <Text
            className="text-[15px] font-medium"
            style={{ color: colors.text }}
            numberOfLines={2}
          >
            {commit.subject}
          </Text>
          <View className="flex-row items-center gap-2 mt-1">
            <Text
              className="text-xs"
              style={{ color: colors.textSecondary }}
              numberOfLines={1}
            >
              {commit.author}
            </Text>
            <Text className="text-[10px]" style={{ color: colors.textSecondary }}>
              ·
            </Text>
            <Text className="text-xs" style={{ color: colors.textSecondary }}>
              {formatTimestamp(commit.timestamp)}
            </Text>
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          <View
            className="px-2 py-0.5 rounded-md"
            style={{ backgroundColor: `${colors.primary}20` }}
          >
            <Text className="text-[11px] font-bold" style={{ color: colors.primary }}>
              {commit.filesChangedCount} file{commit.filesChangedCount !== 1 ? 's' : ''}
            </Text>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textSecondary}
          />
        </View>
      </TouchableOpacity>

      {expanded ? (
        <View className="px-4 pb-3">
          {loadingFiles ? (
            <View className="flex-row items-center justify-center py-3">
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : files.length === 0 ? (
            <Text
              className="text-xs py-1"
              style={{ color: colors.textSecondary }}
            >
              No file details available
            </Text>
          ) : (
            <View className="gap-1">
              {files.map((file) => (
                <FileChangeChip key={file.path} file={file} />
              ))}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

export default function PushScreen() {
  const route = useRoute<PushRoute>();
  const { repoPath, branch } = route.params;
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const safeBack = useSafeBack();
  const headerHeight = useScreenHeaderHeight();
  const [headerBlurHeight, setHeaderBlurHeight] = useState(headerHeight);

  const [commits, setCommits] = useState<readonly CommitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pushing, setPushing] = useState(false);

  const loadCommits = useCallback(async () => {
    try {
      const result = await UnpushedCommitsService.list({
        repo: repoPath,
        branch,
      });
      setCommits(result);
    } finally {
      setLoading(false);
    }
  }, [repoPath, branch]);

  useEffect(() => {
    void loadCommits();
  }, [loadCommits]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadCommits();
    } finally {
      setRefreshing(false);
    }
  }, [loadCommits]);

  const handlePushAll = useCallback(async () => {
    if (pushing) return;
    setPushing(true);
    try {
      const token = (await AuthService.getToken()) ?? undefined;
      const pushPromise = LocalGitWriter.push({
        repoPath,
        branch,
        token,
      });
      const timeoutMs = 60_000;
      const timeoutPromise = new Promise<{ success: false; error: string }>((_, reject) =>
        setTimeout(() => reject(new Error('Push timed out after 60s. Pull and try again.')), timeoutMs)
      );
      const result = await Promise.race([pushPromise, timeoutPromise]);
      if (result.success) {
        await pullFromSingleRepo(repoPath);
        useGitActivityStore.getState().incrementRevision();
        Alert.alert('Pushed', 'All commits have been pushed to GitHub.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        const error = result.error ?? 'Unknown error';
        if (error.includes('conflict-detected')) {
          navigation.navigate('Conflicts', { repoPath, branch });
        } else {
          Alert.alert('Push failed', error);
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('60s')) {
        Alert.alert('Push timed out', 'Push timed out after 60s. Pull and try again.');
      } else {
        Alert.alert('Push failed', error instanceof Error ? error.message : 'Unknown error');
      }
    } finally {
      setPushing(false);
    }
  }, [pushing, repoPath, branch, navigation]);

  const renderCommit = useCallback(
    ({ item }: { item: CommitSummary }) => (
      <CommitRow commit={item} repoPath={repoPath} branch={branch} />
    ),
    [repoPath, branch],
  );

  const renderEmpty = useCallback(
    () => (
      <View className="flex-1 items-center justify-center">
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : (
          <View className="items-center">
            <Ionicons
              name="checkmark-circle-outline"
              size={48}
              color={colors.textSecondary}
            />
            <Text
              testID="push.empty"
              className="text-base mt-3"
              style={{ color: colors.textSecondary }}
            >
              No unpushed commits
            </Text>
          </View>
        )}
      </View>
    ),
    [loading, colors],
  );

  const repoName = repoPath.split('/').pop() ?? repoPath;

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: colors.background }}>
      <ScreenHeader
        title="Push"
        subtitle={`${repoName} · ${branch}`}
        onBack={safeBack}
        onLayout={(event) => setHeaderBlurHeight(event.nativeEvent.layout.height)}
        actions={
          commits.length > 0 ? (
            <TouchableOpacity
              testID="push.push-all"
              onPress={handlePushAll}
              disabled={pushing}
              accessibilityRole="button"
              accessibilityLabel="Push all commits"
              accessibilityState={{ disabled: pushing }}
              className="px-3 py-1.5 rounded-md"
              style={{ backgroundColor: pushing ? colors.border : colors.primary }}
            >
              {pushing ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text className="text-xs font-bold" style={{ color: '#ffffff' }}>
                  Push all
                </Text>
              )}
            </TouchableOpacity>
          ) : null
        }
      />

      <FlatList
        data={commits}
        keyExtractor={(item) => item.oid}
        renderItem={renderCommit}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={{
          paddingTop: headerBlurHeight + 8,
          paddingBottom: 32,
          ...(commits.length === 0 ? { flexGrow: 1 } : null),
        }}
        refreshControl={
          <RefreshControl
            testID="push.pull-refresh"
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      />

      {commits.length > 0 && !loading ? (
        <View
          className="px-4 py-3 border-t"
          style={{ borderTopWidth: 0.5, borderTopColor: colors.border }}
        >
          <TouchableOpacity
            testID="push.push-all-bottom"
            onPress={handlePushAll}
            disabled={pushing}
            accessibilityRole="button"
            accessibilityLabel="Push all commits"
            accessibilityState={{ disabled: pushing }}
            className="py-3 rounded-[10px] items-center"
            style={{ backgroundColor: pushing ? colors.border : colors.primary }}
          >
            {pushing ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text className="text-sm font-bold" style={{ color: '#ffffff' }}>
                Push {commits.length} commit{commits.length !== 1 ? 's' : ''}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
