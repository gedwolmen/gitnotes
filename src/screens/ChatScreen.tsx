import { useCallback, useEffect, useMemo, useRef } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { ChatMessageBubble } from '../components/ai/ChatMessageBubble';
import { ChatInputBar } from '../components/ai/ChatInputBar';
import { ChatLoadingStrip } from '../components/ai/ChatLoadingStrip';
import ContextPickerModal from '../components/ai/ContextPickerModal';
import { ScreenHeader, useScreenHeaderHeight } from '../components/ui';
import { useTokens } from '../contexts/ThemeContext';
import type { ChatMessage } from '../models/Chat';
import type { RootStackParamList } from '../navigation/types';
import { ChatConfirmationCard } from '../components/chat/ChatConfirmationCard';
import { ChatErrorCard } from '../components/chat/ChatErrorCard';
import { useChatScreenController } from '../components/chat/useChatScreenController';
import { useAIStore } from '../stores/aiStore';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'ChatScreen'>;
type ChatScreenRouteProp = RouteProp<RootStackParamList, 'ChatScreen'>;

export default function ChatScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ChatScreenRouteProp>();
  const { colors, spacing, type } = useTokens();
  const headerHeight = useScreenHeaderHeight({ subtitle: true });
  const { threadId } = route.params;
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const listViewportHeightRef = useRef(0);
  const listContentHeightRef = useRef(0);

  const {
    attachedContexts,
    setAttachedContexts,
    isContextPickerVisible,
    setIsContextPickerVisible,
    pendingConfirmation,
    retryPayload,
    localError,
    setLocalError,
    storeError,
    thread,
    messages,
    isLoading,
    isStreaming,
    streamStartedAt,
    contextBudget,
    handleSend,
    stopStreaming,
    handleMessageLongPress,
    handleRetry,
    handleConfirmApply,
    handleConfirmCancel,
    clearError,
  } = useChatScreenController(threadId);

  const selectedModelId = useAIStore((state) => state.selectedModelId);
  const providers = useAIStore((state) => state.providers);
  const { activeModel, activeProvider } = useMemo(() => {
    if (!selectedModelId) return { activeModel: undefined, activeProvider: undefined };
    for (const p of providers) {
      if (!p.isEnabled) continue;
      const m = p.models.find((mm) => mm.id === selectedModelId);
      if (m) return { activeModel: m, activeProvider: p };
    }
    return { activeModel: undefined, activeProvider: undefined };
  }, [selectedModelId, providers]);

  const maybeScrollToBottom = useCallback((animated: boolean) => {
    if (!messages.length) return;
    const viewportHeight = listViewportHeightRef.current;
    const contentHeight = listContentHeightRef.current;
    if (viewportHeight <= 0 || contentHeight <= viewportHeight) return;
    requestAnimationFrame(() => flatListRef.current?.scrollToEnd({ animated }));
  }, [messages.length]);

  useEffect(() => {
    maybeScrollToBottom(true);
  }, [messages.length, isStreaming, maybeScrollToBottom]);

  const errorMessage = localError || storeError;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View style={styles.content}>
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            onLayout={(event) => {
              listViewportHeightRef.current = event.nativeEvent.layout.height;
            }}
            onContentSizeChange={(_, contentHeight) => {
              listContentHeightRef.current = contentHeight;
            }}
            contentContainerStyle={{
              paddingTop: headerHeight,
              paddingHorizontal: spacing[4],
              paddingBottom: spacing[4],
              flexGrow: messages.length === 0 ? 1 : undefined,
            }}
            ItemSeparatorComponent={() => <View style={{ height: spacing[1] }} />}
            renderItem={({ item }) => {
              const isLastMessage = item.id === messages[messages.length - 1]?.id;
              const isToolCallInFlight = Boolean(item.toolCallName) && !item.toolCallResult;
              const showStreaming = isStreaming && ((isLastMessage && item.role === 'assistant') || isToolCallInFlight);
              return (
                <ChatMessageBubble
                  message={item}
                  isStreaming={showStreaming}
                  onLongPress={handleMessageLongPress}
                />
              );
            }}
            ListEmptyComponent={
              <View style={[styles.emptyState, { padding: spacing[6] }]}> 
                <Text style={{ color: colors.text, fontSize: type.xl, fontWeight: '700', marginBottom: spacing[2] }}>Start the conversation</Text>
                <Text style={{ color: colors.textSecondary, fontSize: type.md, textAlign: 'center' }}>
                  Ask about your notes, attach context, or let GitNotes AI make changes for you.
                </Text>
              </View>
            }
          />

          <ChatConfirmationCard
            pendingConfirmation={pendingConfirmation}
            colors={colors}
            spacing={spacing}
            type={type}
            onApply={() => void handleConfirmApply()}
            onCancel={() => void handleConfirmCancel()}
          />
          <ChatErrorCard
            message={errorMessage}
            colors={colors}
            spacing={spacing}
            type={type}
            canRetry={!!retryPayload}
            isStreaming={isStreaming}
            onRetry={handleRetry}
            onDismiss={() => {
              setLocalError(null);
              clearError();
            }}
          />

          <ChatLoadingStrip
            visible={isStreaming}
            model={activeModel?.name}
            provider={activeProvider?.name}
            startedAt={streamStartedAt}
            onCancel={stopStreaming}
          />

          <ChatInputBar
            onSend={handleSend}
            onAttach={() => setIsContextPickerVisible(true)}
            attachedContexts={attachedContexts}
            onRemoveContext={(index) => setAttachedContexts((current) => current.filter((_, itemIndex) => itemIndex !== index))}
            isStreaming={isStreaming}
            onStop={stopStreaming}
            disabled={!thread && !isLoading}
            contextWarning={contextBudget.message ? { level: contextBudget.warningLevel, message: contextBudget.message } : null}
          />
        </View>
      </KeyboardAvoidingView>

      <ContextPickerModal
        visible={isContextPickerVisible}
        onClose={() => setIsContextPickerVisible(false)}
        initialSelected={attachedContexts}
        onConfirm={(items) => {
          setAttachedContexts(items);
          setIsContextPickerVisible(false);
        }}
      />
      <ScreenHeader
        title={thread?.title ?? 'GitNotes AI'}
        subtitle={thread ? `${messages.length} messages` : 'Loading conversation'}
        onBack={() => navigation.goBack()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  keyboardAvoidingView: { flex: 1 },
  content: { flex: 1 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
