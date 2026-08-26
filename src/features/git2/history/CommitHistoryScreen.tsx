/**
 * CommitHistoryScreen — display commit log for a Git2 repository.
 *
 * Shows commits with author, date, message, and OID.
 * Tapping a commit navigates to DiffScreen for that commit.
 *
 * Repository-aware deep links: gitnotes://repo/:repoId/history
 *
 * GPL-3.0 derivative of GitSync.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  StyleSheet,
  RefreshControl,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFileTreeStore } from '../browser/fileTreeStore';
import { Git2Client } from '../../../../modules/expo-git2-rs/src/index';
import type { LogEntry } from '../../../../modules/expo-git2-rs/src/types';
import { useTheme } from '../../../contexts/ThemeContext';
import { SafeAreaView } from '../../../components/ui/SafeAreaView';
import { HapticService } from '../../../utils/haptics';

// ─── Navigation types ──────────────────────────────────────────────────────────

type CommitHistoryRouteProp = RouteProp<{
  CommitHistory: { repoId: string; repoPath: string; branch: string };
}, 'CommitHistory'>;

type CommitHistoryStackParamList = {
  CommitHistory: { repoId: string; repoPath: string; branch: string };
  Diff: { repoId: string; repoPath: string; branch: string; commitOid?: string; path?: string };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(timeSecs: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timeSecs;

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;

  const date = new Date(timeSecs * 1000);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatOid(oid: string): string {
  return oid.slice(0, 7);
}

function getCommitIcon(entry: LogEntry): string {
  // Placeholder — could be customized based on commit type
  return 'git-commit-outline';
}

// ─── Commit item component ────────────────────────────────────────────────────

interface CommitItemProps {
  entry: LogEntry;
  onPress: (entry: LogEntry) => void;
  onLongPress: (entry: LogEntry) => void;
  colors: { text: string; textSecondary: string; border: string; primary: string; surface: string };
}

function CommitItem({ entry, onPress, onLongPress, colors }: CommitItemProps) {
  const [isPressed, setIsPressed] = useState(false);

  const handlePressIn = () => setIsPressed(true);
  const handlePressOut = () => setIsPressed(false);

  return (
    <TouchableOpacity
      style={[
        styles.commitItem,
        { backgroundColor: isPressed ? colors.surface : 'transparent' },
      ]}
      onPress={() => {
        HapticService.light();
        onPress(entry);
      }}
      onLongPress={() => {
        HapticService.medium();
        onLongPress(entry);
      }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={0.8}
    >
      <View style={styles.commitLeft}>
        <Ionicons
          name={getCommitIcon(entry) as any}
          size={20}
          color={colors.primary}
          style={styles.commitIcon}
        />
      </View>

      <View style={styles.commitContent}>
        <Text style={[styles.commitMessage, { color: colors.text }]} numberOfLines={2}>
          {entry.message}
        </Text>
        <View style={styles.commitMeta}>
          <Text style={[styles.commitAuthor, { color: colors.textSecondary }]} numberOfLines={1}>
            {entry.authorName}
          </Text>
          <Text style={[styles.commitTime, { color: colors.textSecondary }]}>
            {formatRelativeTime(entry.timeSecs)}
          </Text>
        </View>
      </View>

      <View style={styles.commitRight}>
        <Text style={[styles.commitOid, { color: colors.textSecondary }]}>
          {formatOid(entry.oid)}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export function CommitHistoryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<CommitHistoryStackParamList>>();
  const route = useRoute<CommitHistoryRouteProp>();
  const { repoId, repoPath, branch } = route.params;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const loadCommitHistory = useFileTreeStore((s) => s.loadCommitHistory);

  const [commits, setCommits] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const loadCommits = useCallback(
    async (offset: number = 0, append: boolean = false) => {
      if (!repoPath) return;

      try {
        if (append) setIsLoadingMore(true);
        else setIsLoading(true);
        setError(null);

        const result = await Git2Client.log(repoPath, PAGE_SIZE + 1);
        const entries = result.data;

        if (entries.length > PAGE_SIZE) {
          setHasMore(true);
          setCommits(append ? [...commits, ...entries.slice(0, PAGE_SIZE)] : entries.slice(0, PAGE_SIZE));
        } else {
          setHasMore(false);
          setCommits(append ? [...commits, ...entries] : entries);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load commit history');
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [repoPath],
  );

  useEffect(() => {
    loadCommits(0, false);
  }, [loadCommits]);

  const handleCommitPress = useCallback(
    (entry: LogEntry) => {
      navigation.navigate('Diff', { repoId, repoPath, branch, commitOid: entry.oid });
    },
    [navigation, repoId, repoPath, branch],
  );

  const handleCommitLongPress = useCallback(
    (entry: LogEntry) => {
      // Could copy commit OID to clipboard
      HapticService.medium();
    },
    [],
  );

  const handleRefresh = useCallback(() => {
    loadCommits(0, false);
  }, [loadCommits]);

  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && hasMore) {
      loadCommits(commits.length, true);
    }
  }, [isLoadingMore, hasMore, loadCommits, commits.length]);

  const renderItem = useCallback(
    ({ item }: { item: LogEntry }) => (
      <CommitItem
        entry={item}
        onPress={handleCommitPress}
        onLongPress={handleCommitLongPress}
        colors={colors}
      />
    ),
    [handleCommitPress, handleCommitLongPress, colors],
  );

  const renderFooter = useCallback(() => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }, [isLoadingMore, colors.primary]);

  const renderEmpty = useCallback(() => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="git-commit-outline" size={48} color={colors.textSecondary} />
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          No commits found
        </Text>
      </View>
    );
  }, [isLoading, colors.textSecondary]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { borderBottomColor: colors.border, backgroundColor: colors.surface },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>History</Text>
          <Text style={[styles.headerMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            {branch}
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {/* Commit list */}
      {error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.error ?? '#c00'} />
          <Text style={[styles.errorText, { color: colors.error ?? '#c00' }]}>{error}</Text>
          <TouchableOpacity onPress={handleRefresh} style={styles.retryButton}>
            <Text style={{ color: colors.primary }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading commit history...
          </Text>
        </View>
      ) : (
        <FlatList
          data={commits}
          keyExtractor={(item) => item.oid}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    padding: 6,
    marginRight: 4,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  headerMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  headerSpacer: {
    width: 40,
  },
  commitItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 60,
  },
  commitLeft: {
    width: 28,
    alignItems: 'center',
    paddingTop: 2,
  },
  commitIcon: {
    marginRight: 0,
  },
  commitContent: {
    flex: 1,
    marginLeft: 8,
    marginRight: 8,
  },
  commitMessage: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20,
  },
  commitMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  commitAuthor: {
    fontSize: 12,
    flex: 1,
  },
  commitTime: {
    fontSize: 12,
  },
  commitRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  commitOid: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 52,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#5b7ef4',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
