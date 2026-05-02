import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Text,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { ChatMessageBubble } from '../components/ai/ChatMessageBubble';
import { ChatInputBar } from '../components/ai/ChatInputBar';
import ContextPickerModal from '../components/ai/ContextPickerModal';
import { Button, ScreenHeader, Surface } from '../components/ui';
import { useTokens } from '../contexts/ThemeContext';
import type { AIContextItem, AIProviderConfig } from '../models/AIProvider';
import type { ChatMessage } from '../models/Chat';
import type { RootStackParamList } from '../navigation/types';
import * as AIService from '../services/AIService';
import * as ChatStorageService from '../services/ChatStorageService';
import { executeToolCall } from '../services/ai/actionExecutor';
import { chatTools } from '../services/ai/tools';
import { buildSystemPrompt } from '../services/ai/systemPrompt';
import { buildContextString } from '../services/ContextService';
import { useAIStore } from '../stores/aiStore';
import { useChatStore } from '../stores/chatStore';
import { useNoteStore } from '../stores/noteStore';
import { useTodoStore } from '../stores/todoStore';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'ChatScreen'>;
type ChatScreenRouteProp = RouteProp<RootStackParamList, 'ChatScreen'>;

type ToolEvent = {
  type: 'tool-call' | 'tool-call-streaming-start' | 'tool-call-delta' | 'tool-result';
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  argsTextDelta?: string;
  result?: unknown;
};

type PendingConfirmation = {
  toolName: string;
  args: Record<string, unknown>;
  description: string;
  details: Record<string, unknown>;
  messageId: string;
};

type RetryPayload = {
  text: string;
  contexts: AIContextItem[];
};

type ChatRequestMessage = Parameters<typeof AIService.streamChatResponse>[1][number];

const TOOL_EVENT_TYPES = new Set<ToolEvent['type']>([
  'tool-call',
  'tool-call-streaming-start',
  'tool-call-delta',
  'tool-result',
]);

function generateMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseToolEvent(chunk: string): ToolEvent | null {
  try {
    const parsed = JSON.parse(chunk) as ToolEvent;
    return TOOL_EVENT_TYPES.has(parsed.type) ? parsed : null;
  } catch {
    return null;
  }
}

function parseToolArgs(value: unknown, fallback = ''): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }

  if (!fallback.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(fallback);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function formatHistoryMessage(message: ChatMessage): ChatRequestMessage {
  const content =
    message.content ||
    (message.toolCallName
      ? `${message.toolCallName}: ${JSON.stringify(message.toolCallArgs ?? {})}${message.toolCallResult ? `\nResult: ${message.toolCallResult}` : ''}`
      : '');

  return {
    role: message.role,
    content,
  };
}

function formatToolResult(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value == null) {
    return 'Done.';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return 'Done.';
  }
}

function formatExecutorResult(result: Awaited<ReturnType<typeof executeToolCall>>): string {
  if (!result.success) {
    return result.error ?? 'Tool execution failed.';
  }

  if (result.requiresConfirmation && result.proposedChanges) {
    return result.proposedChanges.description;
  }

  return formatToolResult(result.data);
}

export default function ChatScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ChatScreenRouteProp>();
  const { colors, spacing, type } = useTokens();
  const { threadId } = route.params;

  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const toolArgsBufferRef = useRef<Record<string, string>>({});

  const noteCount = useNoteStore((state) => state.notes.length);
  const todoCount = useTodoStore((state) => state.todos.length);

  const activeThread = useChatStore((state) => state.activeThread);
  const isLoading = useChatStore((state) => state.isLoading);
  const storeError = useChatStore((state) => state.error);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const storageAdapter = useChatStore((state) => state.storageAdapter);
  const loadThread = useChatStore((state) => state.loadThread);
  const addMessage = useChatStore((state) => state.addMessage);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const setStreaming = useChatStore((state) => state.setStreaming);
  const clearError = useChatStore((state) => state.clearError);
  const setStorageAdapter = useChatStore((state) => state.setStorageAdapter);

  const [attachedContexts, setAttachedContexts] = useState<AIContextItem[]>([]);
  const [isContextPickerVisible, setIsContextPickerVisible] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [retryPayload, setRetryPayload] = useState<RetryPayload | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const thread = activeThread?.id === threadId ? activeThread : null;
  const messages = thread?.messages ?? [];

  const saveActiveThread = useCallback(async () => {
    const latestThread = useChatStore.getState().activeThread;
    if (!latestThread) {
      return;
    }
    await ChatStorageService.saveThread(latestThread);
  }, []);

  const getSelectedModelConfig = useCallback(() => {
    const aiState = useAIStore.getState();
    const model = aiState.getSelectedModel();

    if (!model) {
      throw new Error('Select an AI model before sending a message.');
    }

    const provider = aiState.providers.find((item) => item.id === model.providerId);
    return { model, provider };
  }, []);

  const runToolCall = useCallback(async (
    toolName: string,
    args: Record<string, unknown>,
    options?: { allowConfirmation?: boolean; messageId?: string }
  ) => {
    const mode = useAIStore.getState().actionMode;
    const effectiveMode = options?.allowConfirmation === false ? 'auto' : mode;
    const result = await executeToolCall(toolName, args, effectiveMode);
    const resultText = formatExecutorResult(result);

    if (options?.messageId) {
      updateMessage(options.messageId, { toolCallResult: resultText });
    }

    if (result.requiresConfirmation && result.proposedChanges && options?.messageId) {
      setPendingConfirmation({
        toolName,
        args,
        description: result.proposedChanges.description,
        details: result.proposedChanges.details,
        messageId: options.messageId,
      });
    }

    if (!result.requiresConfirmation) {
      addMessage({
        id: generateMessageId(),
        role: 'system',
        content: result.success ? `Tool result: ${resultText}` : `Tool error: ${resultText}`,
        timestamp: Date.now(),
      });
    }

    return result;
  }, [addMessage, updateMessage]);

  const streamAssistantResponse = useCallback(async (text: string, contexts: AIContextItem[]) => {
    const currentThread = useChatStore.getState().activeThread;
    if (!currentThread) {
      setLocalError('Chat thread is not loaded.');
      return;
    }

    const userMessage: ChatMessage = {
      id: generateMessageId(),
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
      attachedContexts: contexts,
    };

    const assistantMessageId = generateMessageId();
    addMessage(userMessage);
    addMessage({
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    });

    setAttachedContexts([]);
    setRetryPayload({ text: userMessage.content, contexts });
    setLocalError(null);
    clearError();
    setPendingConfirmation(null);
    setStreaming(true);

    let assistantText = '';
    let handledToolCount = 0;
    let pausedForConfirmation = false;

    try {
      const contextString = contexts.length ? await buildContextString(contexts) : undefined;
      const aiState = useAIStore.getState();
      const { model, provider } = getSelectedModelConfig();
      const runtimeThread = useChatStore.getState().activeThread;

      if (!runtimeThread) {
        throw new Error('Chat thread is not available.');
      }

      const history = runtimeThread.messages
        .filter((message) => message.id !== assistantMessageId)
        .map(formatHistoryMessage);
      const prompt = buildSystemPrompt({
        attachedContexts: contextString,
        noteCount,
        todoCount,
        actionMode: aiState.actionMode,
      });

      const modelInstance = await AIService.initializeModel(model, provider as AIProviderConfig | undefined);
      const requestMessages: Parameters<typeof AIService.streamChatResponse>[1] = [
        { role: 'system', content: prompt },
        ...history,
      ];

      for await (const chunk of AIService.streamChatResponse(modelInstance, requestMessages, chatTools)) {
        const toolEvent = parseToolEvent(chunk);
        if (!toolEvent) {
          assistantText += chunk;
          updateMessage(assistantMessageId, { content: assistantText });
          continue;
        }

        const toolCallId = toolEvent.toolCallId ?? generateMessageId();
        const existingArgs = toolArgsBufferRef.current[toolCallId] ?? '';

        if (toolEvent.type === 'tool-call-streaming-start') {
          toolArgsBufferRef.current[toolCallId] = existingArgs;
          continue;
        }

        if (toolEvent.type === 'tool-call-delta') {
          toolArgsBufferRef.current[toolCallId] = existingArgs + (toolEvent.argsTextDelta ?? '');
          continue;
        }

        if (toolEvent.type === 'tool-result') {
          continue;
        }

        const toolName = toolEvent.toolName;
        if (!toolName) {
          continue;
        }

        const args = parseToolArgs(toolEvent.input, toolArgsBufferRef.current[toolCallId]);
        const toolMessageId = generateMessageId();
        handledToolCount += 1;

        addMessage({
          id: toolMessageId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          toolCallId,
          toolCallName: toolName,
          toolCallArgs: args,
        });

        const result = await runToolCall(toolName, args, { messageId: toolMessageId });
        delete toolArgsBufferRef.current[toolCallId];

        if (result.requiresConfirmation) {
          pausedForConfirmation = true;
          break;
        }
      }

      if (!assistantText.trim() && handledToolCount > 0 && !pausedForConfirmation) {
        updateMessage(assistantMessageId, { content: 'Done.' });
      }

      await saveActiveThread();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send message.';
      setLocalError(message);
      updateMessage(assistantMessageId, {
        content: assistantText || 'Something went wrong while streaming this response.',
      });
    } finally {
      setStreaming(false);
    }
  }, [addMessage, clearError, getSelectedModelConfig, noteCount, runToolCall, saveActiveThread, setStreaming, todoCount, updateMessage]);

  useEffect(() => {
    if (storageAdapter) {
      return;
    }

    setStorageAdapter({
      loadThreadSummaries: ChatStorageService.loadThreadSummaries,
      loadThread: (owner, repo, branch, activeThreadId) =>
        ChatStorageService.loadThread(owner, repo, activeThreadId, branch),
      saveThread: ChatStorageService.saveThread,
      deleteThread: (owner, repo, branch, activeThreadId) =>
        ChatStorageService.deleteThread(owner, repo, activeThreadId, branch).then(() => undefined),
    });
  }, [setStorageAdapter, storageAdapter]);

  useEffect(() => {
    if (thread || !storageAdapter) {
      return;
    }

    const { chatRepoOwner, chatRepoName, chatRepoBranch } = useAIStore.getState();
    if (!chatRepoOwner || !chatRepoName) {
      setLocalError('Chat storage repo is not configured yet.');
      return;
    }

    void loadThread({
      owner: chatRepoOwner,
      repo: chatRepoName,
      branch: chatRepoBranch,
      threadId,
    });
  }, [loadThread, storageAdapter, thread, threadId]);

  useEffect(() => {
    if (!messages.length) {
      return;
    }

    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages.length, isStreaming]);

  const handleRetry = useCallback(() => {
    if (!retryPayload || isStreaming) {
      return;
    }

    void streamAssistantResponse(retryPayload.text, retryPayload.contexts);
  }, [isStreaming, retryPayload, streamAssistantResponse]);

  const handleConfirmApply = useCallback(async () => {
    if (!pendingConfirmation) {
      return;
    }

    setPendingConfirmation(null);
    setLocalError(null);

    try {
      await runToolCall(pendingConfirmation.toolName, pendingConfirmation.args, {
        allowConfirmation: false,
        messageId: pendingConfirmation.messageId,
      });
      await saveActiveThread();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Failed to apply tool action.');
    }
  }, [pendingConfirmation, runToolCall, saveActiveThread]);

  const handleConfirmCancel = useCallback(async () => {
    if (!pendingConfirmation) {
      return;
    }

    updateMessage(pendingConfirmation.messageId, { toolCallResult: 'Cancelled.' });
    addMessage({
      id: generateMessageId(),
      role: 'system',
      content: `Cancelled: ${pendingConfirmation.description}`,
      timestamp: Date.now(),
    });
    setPendingConfirmation(null);
    await saveActiveThread();
  }, [addMessage, pendingConfirmation, saveActiveThread, updateMessage]);

  const handleSend = useCallback((text: string) => {
    if (!text.trim() || isStreaming || isLoading) {
      return;
    }

    void streamAssistantResponse(text, attachedContexts);
  }, [attachedContexts, isLoading, isStreaming, streamAssistantResponse]);

  const renderConfirmationCard = () => {
    if (!pendingConfirmation) {
      return null;
    }

    return (
      <Surface
        elevation="raised"
        radius="md"
        style={{
          marginHorizontal: spacing[4],
          marginBottom: spacing[3],
          padding: spacing[4],
          borderWidth: 1,
          borderColor: colors.accent,
        }}
      >
        <Text style={{ color: colors.text, fontSize: type.lg, fontWeight: '700', marginBottom: spacing[2] }}>
          {pendingConfirmation.description}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: type.sm, marginBottom: spacing[3] }}>
          {JSON.stringify(pendingConfirmation.details, null, 2)}
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          <Button variant="primary" onPress={() => void handleConfirmApply()} style={{ flex: 1 }}>
            Apply
          </Button>
          <Button variant="secondary" onPress={() => void handleConfirmCancel()} style={{ flex: 1 }}>
            Cancel
          </Button>
        </View>
      </Surface>
    );
  };

  const renderErrorCard = () => {
    const message = localError || storeError;
    if (!message) {
      return null;
    }

    return (
      <Surface
        elevation="raised"
        radius="md"
        style={{
          marginHorizontal: spacing[4],
          marginBottom: spacing[3],
          padding: spacing[4],
          borderWidth: 1,
          borderColor: '#d66b6b',
        }}
      >
        <Text style={{ color: colors.text, fontSize: type.md, fontWeight: '600', marginBottom: spacing[2] }}>
          {message}
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          <Button variant="primary" onPress={handleRetry} disabled={!retryPayload || isStreaming}>
            Retry
          </Button>
          <Button
            variant="secondary"
            onPress={() => {
              setLocalError(null);
              clearError();
            }}
          >
            Dismiss
          </Button>
        </View>
      </Surface>
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScreenHeader
          title={thread?.title ?? 'GitNotes Chat'}
          subtitle={thread ? `${messages.length} messages` : 'Loading conversation'}
          onBack={() => navigation.goBack()}
        />

        <View style={styles.content}>
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{
              paddingHorizontal: spacing[4],
              paddingBottom: spacing[4],
              gap: spacing[1],
              flexGrow: messages.length === 0 ? 1 : 0,
            }}
            renderItem={({ item }) => (
              <ChatMessageBubble
                message={item}
                isStreaming={isStreaming && item.id === messages[messages.length - 1]?.id && item.role === 'assistant'}
              />
            )}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <View style={[styles.emptyState, { padding: spacing[6] }]}> 
                <Text style={{ color: colors.text, fontSize: type.xl, fontWeight: '700', marginBottom: spacing[2] }}>
                  Start the conversation
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: type.md, textAlign: 'center' }}>
                  Ask about your notes, attach context, or let GitNotes AI make changes for you.
                </Text>
              </View>
            }
          />

          {renderConfirmationCard()}
          {renderErrorCard()}

          <ChatInputBar
            onSend={handleSend}
            onAttach={() => setIsContextPickerVisible(true)}
            attachedContexts={attachedContexts}
            onRemoveContext={(index) => {
              setAttachedContexts((current) => current.filter((_, itemIndex) => itemIndex !== index));
            }}
            isStreaming={isStreaming}
            disabled={!thread && !isLoading}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
