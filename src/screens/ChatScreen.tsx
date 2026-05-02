import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Text,
  Alert,
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
import { checkContextBudget } from '../services/ai/modelLimits';
import { buildContextString } from '../services/ContextService';
import { STREAM_RENDER_FLUSH_MS } from '../services/ai/config';
import { useAIStore } from '../stores/aiStore';
import { useChatStore } from '../stores/chatStore';
import { useNoteStore } from '../stores/noteStore';
import { useTodoStore } from '../stores/todoStore';
import { generateId } from '../utils/ids';

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

const generateMessageId = generateId;

function dedupeContexts(items: AIContextItem[]): AIContextItem[] {
  const map = new Map<string, AIContextItem>();
  for (const item of items) {
    const key = `${item.type}:${item.owner}/${item.repo}/${item.path}@${item.branch ?? ''}`;
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()];
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
  const abortRef = useRef<AbortController | null>(null);

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
  const renameThread = useChatStore((state) => state.renameThread);
  const truncateAfter = useChatStore((state) => state.truncateAfter);

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

    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    let assistantText = '';
    let handledToolCount = 0;
    let pausedForConfirmation = false;

    let pendingFlush: ReturnType<typeof setTimeout> | null = null;
    const flushAssistantText = () => {
      pendingFlush = null;
      updateMessage(assistantMessageId, { content: assistantText });
    };
    const scheduleFlush = () => {
      if (pendingFlush) return;
      pendingFlush = setTimeout(flushAssistantText, STREAM_RENDER_FLUSH_MS);
    };

    try {
      const aiState = useAIStore.getState();
      const { model, provider } = getSelectedModelConfig();
      const runtimeThread = useChatStore.getState().activeThread;

      if (!runtimeThread) {
        throw new Error('Chat thread is not available.');
      }

      const aggregatedContexts = dedupeContexts([
        ...runtimeThread.messages.flatMap((m) => m.attachedContexts ?? []),
        ...contexts,
      ]);
      const contextString = aggregatedContexts.length
        ? await buildContextString(aggregatedContexts)
        : undefined;

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

      for await (const chunk of AIService.streamChatResponse(
        modelInstance,
        requestMessages,
        chatTools,
        abortController.signal,
      )) {
        if (abortController.signal.aborted) break;
        const toolEvent = parseToolEvent(chunk);
        if (!toolEvent) {
          assistantText += chunk;
          scheduleFlush();
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

      if (pendingFlush) {
        clearTimeout(pendingFlush);
        pendingFlush = null;
      }

      if (abortController.signal.aborted) {
        updateMessage(assistantMessageId, { content: assistantText || 'Stopped.' });
      } else if (!assistantText.trim() && !pausedForConfirmation) {
        updateMessage(assistantMessageId, {
          content: handledToolCount > 0 ? 'Done.' : 'No response received.',
        });
      } else {
        updateMessage(assistantMessageId, { content: assistantText });
      }

      await saveActiveThread();

      const latest = useChatStore.getState().activeThread;
      if (
        !abortController.signal.aborted
        && latest
        && latest.title === 'New Chat'
        && assistantText.trim()
      ) {
        void (async () => {
          try {
            const titleModelInstance = await AIService.initializeModel(
              model,
              provider as AIProviderConfig | undefined,
            );
            const title = await AIService.generateChatTitle(
              titleModelInstance,
              userMessage.content,
              assistantText,
            );
            if (!title) return;
            const fresh = useChatStore.getState().activeThread;
            if (fresh?.id === latest.id && fresh.title === 'New Chat') {
              renameThread({ threadId: latest.id, title });
              await saveActiveThread();
            }
          } catch {
            // title generation is best-effort
          }
        })();
      }
    } catch (error) {
      if (pendingFlush) {
        clearTimeout(pendingFlush);
        pendingFlush = null;
      }
      const aborted = (error as Error)?.name === 'AbortError' || abortController.signal.aborted;
      if (aborted) {
        updateMessage(assistantMessageId, { content: assistantText || 'Stopped.' });
      } else {
        const message = error instanceof Error ? error.message : 'Failed to send message.';
        setLocalError(message);
        updateMessage(assistantMessageId, {
          content: assistantText || 'Something went wrong while streaming this response.',
        });
      }
    } finally {
      if (abortRef.current === abortController) {
        abortRef.current = null;
      }
      setStreaming(false);
    }
  }, [addMessage, clearError, getSelectedModelConfig, noteCount, renameThread, runToolCall, saveActiveThread, setStreaming, todoCount, updateMessage]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleMessageLongPress = useCallback((message: ChatMessage) => {
    if (isStreaming) return;
    if (message.role === 'user') {
      Alert.prompt?.(
        'Edit message',
        'Re-send with new text. Replies after will be discarded.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Send',
            onPress: (newText?: string) => {
              const text = (newText ?? '').trim();
              if (!text) return;
              truncateAfter(message.id, { inclusive: true });
              void streamAssistantResponse(text, message.attachedContexts ?? []);
            },
          },
        ],
        'plain-text',
        message.content,
      );
      return;
    }
    if (message.role === 'assistant' && !message.toolCallName) {
      const currentMessages = useChatStore.getState().activeThread?.messages ?? [];
      const idx = currentMessages.findIndex((m) => m.id === message.id);
      if (idx < 0) return;
      let priorUserIdx = idx - 1;
      while (priorUserIdx >= 0 && currentMessages[priorUserIdx].role !== 'user') priorUserIdx -= 1;
      if (priorUserIdx < 0) return;
      const priorUser = currentMessages[priorUserIdx];
      Alert.alert('Regenerate response', 'Discard this reply and ask the model again?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          onPress: () => {
            truncateAfter(priorUser.id);
            void streamAssistantResponse(priorUser.content, priorUser.attachedContexts ?? []);
          },
        },
      ]);
    }
  }, [isStreaming, streamAssistantResponse, truncateAfter]);

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

  const selectedModel = useAIStore((state) => state.selectedModelId);
  const contextBudget = React.useMemo(() => {
    const model = useAIStore.getState().getSelectedModel();
    const attachedBytes = attachedContexts.reduce((acc, c) => acc + (c.approxBytes || 0), 0);
    const historyAttachedBytes = (thread?.messages ?? [])
      .flatMap((m) => m.attachedContexts ?? [])
      .reduce((acc, c) => acc + (c.approxBytes || 0), 0);
    const historyTextBytes = (thread?.messages ?? []).reduce(
      (acc, m) => acc + (m.content?.length || 0) + (m.toolCallResult?.length || 0),
      0,
    );
    // ~600 chars baseline for system prompt + headroom for current user message
    const totalBytes = attachedBytes + historyAttachedBytes + historyTextBytes + 600;
    return checkContextBudget(model, totalBytes);
  }, [attachedContexts, selectedModel, thread?.messages]);

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
          title={thread?.title ?? 'GitNotes AI'}
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
                onLongPress={handleMessageLongPress}
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
