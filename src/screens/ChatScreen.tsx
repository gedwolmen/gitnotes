import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { ChatMessageBubble } from '../components/ai/ChatMessageBubble';
import { ChatHintChips } from '../components/ai/ChatHintChips';
import { ChatInputBar } from '../components/ai/ChatInputBar';
import { ChatLoadingStrip } from '../components/ai/ChatLoadingStrip';
import ContextPickerModal from '../components/ai/ContextPickerModal';
import VoiceInputModal from '../components/VoiceInputModal';
import { ScreenHeader, useScreenHeaderHeight } from '../components/ui';
import { SafeAreaView } from '../components/ui/SafeAreaView';
import { useTokens } from '../contexts/ThemeContext';
import type { ChatMessage } from '../models/Chat';
import type { RootStackParamList } from '../navigation/types';
import { ChatConfirmationCard } from '../components/chat/ChatConfirmationCard';
import { ChatErrorCard } from '../components/chat/ChatErrorCard';
import { useChatScreenController } from '../components/chat/useChatScreenController';
import { useAIStore } from '../stores/aiStore';
import { useTranslation } from 'react-i18next';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'ChatScreen'>;
type ChatScreenRouteProp = RouteProp<RootStackParamList, 'ChatScreen'>;

export default function ChatScreen() {
  const { t } = useTranslation();
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

  const [voiceModalVisible, setVoiceModalVisible] = useState(false);
  const [chatText, setChatText] = useState('');

  const handleHintPress = useCallback(
    (text: string) => {
      setChatText(text);
    },
    [],
  );

  const handleVoiceDone = useCallback((text: string) => {
    setVoiceModalVisible(false);
    const trimmed = text.trim();
    if (trimmed) {
      setChatText((prev) => (prev.trim() ? `${prev.trim()} ${trimmed}` : trimmed));
    }
  }, []);

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
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View className="flex-1">
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            extraData={isStreaming}
            onLayout={(event) => {
              listViewportHeightRef.current = event.nativeEvent.layout.height;
            }}
            onContentSizeChange={(_, contentHeight) => {
              listContentHeightRef.current = contentHeight;
            }}
            contentContainerStyle={{
              paddingTop: headerHeight,
              paddingHorizontal: messages.length === 0 ? 0 : spacing[4],
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
              <View
                className="flex-1 justify-center items-center"
                style={{ paddingVertical: spacing[6], paddingHorizontal: 0 }}
              >
                <Text className="text-xl font-bold mb-2 text-text" style={{ marginHorizontal: spacing[4] }}>
                  {t('chat.startConversation')}
                </Text>
                <Text className="text-md text-center text-text-secondary" style={{ marginHorizontal: spacing[4] }}>
                  {t('chat.emptyStateBody')}
                </Text>
                <ChatHintChips onPressHint={handleHintPress} />
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
            onVoicePress={() => setVoiceModalVisible(true)}
            attachedContexts={attachedContexts}
            onRemoveContext={(index) => setAttachedContexts((current) => current.filter((_, itemIndex) => itemIndex !== index))}
            isStreaming={isStreaming}
            onStop={stopStreaming}
            disabled={!thread && !isLoading}
            contextWarning={contextBudget.message ? { level: contextBudget.warningLevel, message: contextBudget.message } : null}
            value={chatText}
            onChangeText={setChatText}
          />
        </View>
      </KeyboardAvoidingView>

      <VoiceInputModal
        visible={voiceModalVisible}
        onDone={handleVoiceDone}
        onClose={() => setVoiceModalVisible(false)}
      />

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
        title={thread?.title ?? t('chat.title')}
        subtitle={thread ? t('chat.messageCount', { count: messages.length }) : t('chat.loadingConversation')}
        onBack={() => navigation.goBack()}
      />
    </SafeAreaView>
  );
}
