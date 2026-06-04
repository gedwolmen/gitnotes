import { useEffect, useState, useCallback, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Alert, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useChatStore } from '../stores/chatStore';
import { useAIStore } from '../stores/aiStore';
import * as ChatStorageService from '../services/ChatStorageService';
import { githubActivity } from '../stores/githubActivityStore';
import { useTokens } from '../contexts/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { ChatThreadSummary } from '../models/Chat';
import { ScreenHeader, Button, EmptyState, useScreenHeaderHeight, useTabBarHeight } from '../components/ui';
import { SwipeableListItem } from '../components/list/SwipeableListItem';
import { BulkActionBar } from '../components/list/BulkActionBar';
import { ChatThreadCard } from '../components/chat/ChatThreadCard';
import { ChatThreadContextMenu } from '../components/chat/ChatThreadContextMenu';
import { HapticService } from '../utils/haptics';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ChatThreadListScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors, spacing } = useTokens();
  const headerHeight = useScreenHeaderHeight();
  const tabBarHeight = useTabBarHeight();

  const {
    threads,
    isLoading,
    loadThreads,
      deleteThread,
      error: storeError,
      createThread,
      renameThread,
      setStorageAdapter,
  } = useChatStore();

  const { chatRepoOwner, chatRepoName, chatRepoBranch } = useAIStore();
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const isPullRefreshingRef = useRef(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [longPressedThread, setLongPressedThread] = useState<ChatThreadSummary | null>(null);
  const listRef = useRef<FlatList<ChatThreadSummary>>(null);

  const selectionMode = selectedIds.size > 0;
  const isFocused = useIsFocused();

  // Reset refresh state when screen loses focus (tab switch, stack push, etc.)
  useEffect(() => {
    if (!isFocused) {
      isPullRefreshingRef.current = false;
      setIsPullRefreshing(false);
    }
  }, [isFocused]);

  useEffect(() => {
    setStorageAdapter({
      ...ChatStorageService,
      loadThread: async (owner, repo, branch, threadId) => {
        return await ChatStorageService.loadThread(owner, repo, threadId, branch);
      },
      deleteThread: async (owner, repo, branch, threadId) => {
        await ChatStorageService.deleteThread(owner, repo, threadId, branch);
      },
    });
  }, [setStorageAdapter]);

  const loadData = useCallback(async () => {
    if (chatRepoOwner && chatRepoName && chatRepoBranch) {
      await loadThreads({
        owner: chatRepoOwner,
        repo: chatRepoName,
        branch: chatRepoBranch,
      });
    }
  }, [chatRepoOwner, chatRepoName, chatRepoBranch, loadThreads]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    if (isPullRefreshingRef.current) return;
    isPullRefreshingRef.current = true;
    setIsPullRefreshing(true);

    const safetyTimeout = setTimeout(() => {
      isPullRefreshingRef.current = false;
      setIsPullRefreshing(false);
    }, 30000);

    await loadData();

    clearTimeout(safetyTimeout);
    isPullRefreshingRef.current = false;
    setIsPullRefreshing(false);
  };

  const handleNewChat = () => {
    if (!chatRepoOwner || !chatRepoName || !chatRepoBranch) {
      Alert.alert('Configuration Required', 'Please set up a chat repository in AI settings first.');
      return;
    }
    const thread = createThread({
      repoOwner: chatRepoOwner,
      repoName: chatRepoName,
      branch: chatRepoBranch,
      filePath: `chats/${Date.now()}.json`,
    });
    navigation.navigate('ChatScreen', { threadId: thread.id });
  };

  const handleThreadPress = (threadId: string) => {
    if (selectionMode) {
      toggleSelected(threadId);
    } else {
      navigation.navigate('ChatScreen', { threadId });
    }
  };

  const handleThreadLongPress = (thread: ChatThreadSummary) => {
    HapticService.selection();
    setLongPressedThread(thread);
  };

  const handleOpenThread = (thread: ChatThreadSummary) => {
    setLongPressedThread(null);
    navigation.navigate('ChatScreen', { threadId: thread.id });
  };

  const handleRenameThread = (thread: ChatThreadSummary) => {
    setLongPressedThread(null);
    Alert.prompt(
      'Rename Chat',
      'Enter a new title for this chat',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async (newTitle?: string) => {
            if (!newTitle) {
              return;
            }

            const trimmedTitle = newTitle.trim() || 'New Chat';
            renameThread({ threadId: thread.id, title: trimmedTitle });

            if (!chatRepoOwner || !chatRepoName || !chatRepoBranch) {
              return;
            }

            githubActivity.begin('Renaming chat…');
            try {
              const storedThread = await ChatStorageService.loadThread(chatRepoOwner, chatRepoName, thread.id, chatRepoBranch);
              if (storedThread) {
                await ChatStorageService.saveThread({
                  ...storedThread,
                  title: trimmedTitle,
                  updatedAt: Date.now(),
                });
              }
              HapticService.success();
            } catch (err: any) {
              Alert.alert('Rename failed', err?.message || 'Could not rename chat.');
              HapticService.error();
            } finally {
              githubActivity.end();
            }
          },
        },
      ],
      'plain-text',
      thread.title
    );
  };

  const handleDeleteThread = async (thread: ChatThreadSummary) => {
    if (!chatRepoOwner || !chatRepoName || !chatRepoBranch) {
      return;
    }
    githubActivity.begin('Deleting chat…');
    try {
      const deleted = await deleteThread({
        owner: chatRepoOwner,
        repo: chatRepoName,
        branch: chatRepoBranch,
        threadId: thread.id,
      });
      if (!deleted) {
        Alert.alert('Delete failed', useChatStore.getState().error ?? storeError ?? 'Could not delete chat.');
        HapticService.error();
        return;
      }
      HapticService.success();
    } catch (err: any) {
      Alert.alert('Delete failed', err?.message || 'Could not delete chat.');
      HapticService.error();
    } finally {
      githubActivity.end();
    }
  };

  const handleBulkDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    Alert.alert(
      `Delete ${ids.length} ${ids.length === 1 ? 'chat' : 'chats'}?`,
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!chatRepoOwner || !chatRepoName || !chatRepoBranch) return;
            githubActivity.begin('Deleting chats…');
            try {
              let deletedCount = 0;
              for (const threadId of ids) {
                const deleted = await deleteThread({
                  owner: chatRepoOwner,
                  repo: chatRepoName,
                  branch: chatRepoBranch,
                  threadId,
                });
                if (!deleted) {
                  setSelectedIds(new Set());
                  const fallbackMessage = deletedCount > 0
                    ? `Deleted ${deletedCount} ${deletedCount === 1 ? 'chat' : 'chats'}, then hit a sync conflict. Pull and try again.`
                    : 'Could not delete chats.';
                  Alert.alert('Delete failed', useChatStore.getState().error ?? storeError ?? fallbackMessage);
                  HapticService.error();
                  return;
                }
                deletedCount += 1;
              }
              HapticService.success();
              setSelectedIds(new Set());
            } catch (err: any) {
              Alert.alert('Delete failed', err?.message || 'Could not delete chats.');
              HapticService.error();
            } finally {
              githubActivity.end();
            }
          },
        },
      ],
    );
  }, [chatRepoOwner, chatRepoName, chatRepoBranch, deleteThread, selectedIds]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const renderThread = useCallback(
    ({ item }: { item: ChatThreadSummary }) => (
      <SwipeableListItem
        itemId={item.id}
        selected={selectedIds.has(item.id)}
        selectionMode={selectionMode}
        onToggleSelect={() => toggleSelected(item.id)}
      >
        <ChatThreadCard
          thread={item}
          onPress={() => handleThreadPress(item.id)}
          onLongPress={() => handleThreadLongPress(item)}
        />
      </SwipeableListItem>
    ),
    [selectedIds, selectionMode, toggleSelected]
  );

  const renderEmptyState = () => {
    if (isLoading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    return (
      <EmptyState
        icon="sparkles"
        iconColor={colors.primary}
        title="Start your first AI chat"
        subtitle="Tap New Chat above to send your first prompt."
      />
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      <View style={{ flex: 1, paddingTop: headerHeight }}>
        <View style={[styles.headerControls, { paddingHorizontal: spacing[4], paddingTop: spacing[4], paddingBottom: spacing[3] }]}>
          <Button
            testID="chat-thread-list.button.new-chat"
            label="New Chat"
            onPress={handleNewChat}
            variant="primary"
            leadingIcon={<Ionicons name="add" size={20} color={colors.accent} />}
            fullWidth
          />
        </View>

        <FlatList
          ref={listRef}
          data={threads}
          renderItem={renderThread}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 12, paddingBottom: spacing[6] }}
          refreshControl={
            <RefreshControl
              refreshing={isPullRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={renderEmptyState}
          ItemSeparatorComponent={() => <View style={{ height: spacing[3] }} />}
        />
      </View>

      <ChatThreadContextMenu
        thread={longPressedThread}
        visible={longPressedThread !== null}
        onClose={() => setLongPressedThread(null)}
        onOpen={handleOpenThread}
        onRename={handleRenameThread}
        onDelete={handleDeleteThread}
        bottomSheet
      />

      <BulkActionBar
        count={selectedIds.size}
        itemNoun="chat"
        bottomOffset={Math.max(tabBarHeight + 4, 8)}
        onCancel={clearSelection}
        onDelete={handleBulkDelete}
      />

      <ScreenHeader
        title="GitNotes AI"
        badge="BETA"
        onBack={() => navigation.goBack()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerControls: {},
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 64,
  },
});
