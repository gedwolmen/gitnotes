import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, TouchableOpacity, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { formatDistanceToNow } from 'date-fns';

import { useChatStore } from '../stores/chatStore';
import { useAIStore } from '../stores/aiStore';
import * as ChatStorageService from '../services/ChatStorageService';
import { githubActivity } from '../stores/githubActivityStore';
import { useTokens } from '../contexts/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { ChatThreadSummary } from '../models/Chat';
import { ScreenHeader, Card, Button, useScreenHeaderHeight } from '../components/ui';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ChatThreadListScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors, type, spacing } = useTokens();
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

  const handleRenameThread = (thread: ChatThreadSummary) => {
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

  const handleDeleteThread = (thread: ChatThreadSummary) => {
    Alert.alert('Delete Chat', 'Are you sure you want to delete this chat?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
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
          } catch (err: any) {
            Alert.alert('Delete failed', err?.message || 'Could not delete chat.');
          } finally {
            githubActivity.end();
          }
        },
      },
    ]);
  };

  const renderRightActions = (thread: ChatThreadSummary) => {
    return (
      <View style={styles.swipeActions}>
        <TouchableOpacity
          style={[styles.swipeAction, { backgroundColor: colors.primary }]}
          onPress={() => handleRenameThread(thread)}
        >
          <Ionicons name="pencil" size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.swipeAction, { backgroundColor: colors.error }]}
          onPress={() => handleDeleteThread(thread)}
        >
          <Ionicons name="trash" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderItem = ({ item }: { item: ChatThreadSummary }) => {
    const timeAgo = formatDistanceToNow(item.updatedAt, { addSuffix: true });

    return (
      <ReanimatedSwipeable
        renderRightActions={() => renderRightActions(item)}
        friction={2}
        containerStyle={{ marginBottom: spacing[3] }}
      >
        <Card onPress={() => handleThreadPress(item.id)} radius="md">
          <View style={styles.threadContent}>
            <View style={styles.threadHeader}>
              <Text style={[styles.threadTitle, { color: colors.text, fontSize: type.md, fontWeight: '600' }]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={[styles.threadTime, { color: colors.textSecondary, fontSize: type.xs }]}>
                {timeAgo}
              </Text>
            </View>
            {item.preview && (
              <Text style={{ color: colors.textSecondary, fontSize: type.sm, marginBottom: 8 }} numberOfLines={2}>
                {item.preview}
              </Text>
            )}
            <View style={styles.threadFooter}>
              <Text style={[styles.messageCount, { color: colors.primary, fontSize: type.xs, fontWeight: '600' }]}>
                {item.messageCount} messages
              </Text>
            </View>
          </View>
        </Card>
      </ReanimatedSwipeable>
    );
  };

  const renderEmptyState = () => {
    if (isLoading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    return (
      <View style={styles.centerContainer}>
        <Ionicons name="sparkles" size={48} color={colors.primary} style={styles.emptyIcon} />
        <Text style={[styles.emptyText, { color: colors.textSecondary, fontSize: type.md }]}>
          Start your first AI chat
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      <View
        style={[
          styles.headerControls,
          {
            paddingTop: headerHeight + spacing[4],
            paddingHorizontal: spacing[4],
            paddingBottom: spacing[3],
          },
        ]}
      >
        <Button
          label="New Chat"
          onPress={handleNewChat}
          variant="primary"
          leadingIcon={<Ionicons name="add" size={20} color="#FFFFFF" />}
          fullWidth
        />
      </View>

      <FlatList
        data={threads}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingHorizontal: spacing[4], paddingBottom: spacing[6] }]}
        ListEmptyComponent={renderEmptyState}
        refreshing={isPullRefreshing}
        onRefresh={handleRefresh}
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
  headerControls: {
  },
  listContent: {
  },
  threadContent: {
    flex: 1,
  },
  threadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  threadTitle: {
    flex: 1,
    marginRight: 16,
  },
  threadTime: {
    flexShrink: 0,
  },
  threadFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  messageCount: {
  },
  swipeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
    height: '100%',
  },
  swipeAction: {
    width: 60,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    marginLeft: 8,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 64,
  },
  emptyIcon: {
    marginBottom: 16,
    opacity: 0.5,
  },
  emptyText: {
    textAlign: 'center',
  },
});
