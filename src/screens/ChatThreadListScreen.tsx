import { useEffect, useState, useCallback, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Alert, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useChatStore } from '../stores/chatStore';
import { useAIStore } from '../stores/aiStore';
import * as ChatStorageService from '../services/ChatStorageService';
import { githubActivity } from '../stores/githubActivityStore';
import { useTokens } from '../contexts/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { ChatThreadSummary } from '../models/Chat';
import { ScreenHeader, Button, EmptyState, useScreenHeaderHeight } from '../components/ui';
import { SwipeableListItem } from '../components/list/SwipeableListItem';
import { ChatThreadCard } from '../components/chat/ChatThreadCard';
import { ChatThreadContextMenu } from '../components/chat/ChatThreadContextMenu';
import { HapticService } from '../utils/haptics';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ChatThreadListScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors, spacing } = useTokens();
  const headerHeight = useScreenHeaderHeight();

  const {
    threads,
    isLoading,
    loadThreads,
    deleteThread,
    createThread,
    renameThread,
    setStorageAdapter,
  } = useChatStore();

  const { chatRepoOwner, chatRepoName, chatRepoBranch } = useAIStore();
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [longPressedThread, setLongPressedThread] = useState<ChatThreadSummary | null>(null);
  const listRef = useRef<FlatList<ChatThreadSummary>>(null);

  const selectionMode = selectedIds.size > 0;

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
    setIsPullRefreshing(true);
    await loadData();
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
    navigation.navigate('ChatScreen', { threadId });
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
          onPress: (newTitle?: string) => {
            if (newTitle) {
              renameThread({ threadId: thread.id, title: newTitle });
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
      await deleteThread({
        owner: chatRepoOwner,
        repo: chatRepoName,
        branch: chatRepoBranch,
        threadId: thread.id,
      });
      HapticService.success();
    } catch (err: any) {
      Alert.alert('Delete failed', err?.message || 'Could not delete chat.');
      HapticService.error();
    } finally {
      githubActivity.end();
    }
  };

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
        <View style={[styles.headerControls, { paddingHorizontal: spacing[4], paddingBottom: spacing[3] }]}>
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