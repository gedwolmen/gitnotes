import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import type { AIContextItem, AIProviderConfig } from '../../models/AIProvider';
import type { ChatMessage } from '../../models/Chat';
import * as AIService from '../../services/AIService';
import * as ChatStorageService from '../../services/ChatStorageService';
import { executeToolCall } from '../../services/ai/actionExecutor';
import { chatTools } from '../../services/ai/tools';
import { buildSystemPrompt } from '../../services/ai/systemPrompt';
import { checkContextBudget } from '../../services/ai/modelLimits';
import { buildContextString } from '../../services/ContextService';
import { STREAM_RENDER_FLUSH_MS } from '../../services/ai/config';
import { ProviderUnavailableError } from '../../services/ai/providerAvailability';
import { describeAvailability } from '../../services/ai/providerAvailabilityCopy';
import { useTranslation } from 'react-i18next';
import { useAIStore } from '../../stores/aiStore';
import { useChatStore } from '../../stores/chatStore';
import { useNoteStore } from '../../stores/noteStore';
import { useTodoStore } from '../../stores/todoStore';
import { generateId } from '../../utils/ids';
import {
  dedupeContexts,
  formatExecutorResult,
  formatHistoryMessage,
  parseToolArgs,
  parseToolEvent,
  type PendingConfirmation,
  type RetryPayload,
} from './chatScreenShared';

export function useChatScreenController(threadId: string) {
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

  const toolArgsBufferRef = useRef<Record<string, string>>({});
  const abortRef = useRef<AbortController | null>(null);
  const { t } = useTranslation();

  const [attachedContexts, setAttachedContexts] = useState<AIContextItem[]>([]);
  const [isContextPickerVisible, setIsContextPickerVisible] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [retryPayload, setRetryPayload] = useState<RetryPayload | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const thread = activeThread?.id === threadId ? activeThread : null;
  const messages = thread?.messages ?? [];

  const saveActiveThread = useCallback(async () => {
    const latestThread = useChatStore.getState().activeThread;
    if (latestThread) await ChatStorageService.saveThread(latestThread);
  }, []);

  const getSelectedModelConfig = useCallback(() => {
    const aiState = useAIStore.getState();
    const model = aiState.getSelectedModel();
    if (!model) throw new Error('Select an AI model before sending a message.');
    const provider = aiState.providers.find((item) => item.id === model.providerId);
    return { model, provider };
  }, []);

  const runToolCall = useCallback(async (
    toolName: string,
    args: Record<string, unknown>,
    options?: { allowConfirmation?: boolean; messageId?: string },
  ) => {
    const mode = useAIStore.getState().actionMode;
    const effectiveMode = options?.allowConfirmation === false ? 'auto' : mode;
    const result = await executeToolCall(toolName, args, effectiveMode);
    const resultText = formatExecutorResult(result);

    if (options?.messageId) updateMessage(options.messageId, { toolCallResult: resultText });

    if (result.requiresConfirmation && result.proposedChanges && options?.messageId) {
      setPendingConfirmation({ toolName, args, description: result.proposedChanges.description, details: result.proposedChanges.details, messageId: options.messageId });
    }

    if (!result.requiresConfirmation) {
      // For note-shaped tool results the tool-call bubble already shows a
      // tappable "Open note" link — adding a verbose `Tool result: {...}`
      // system line below just repeats the same info and dumps the full
      // Note JSON into the chat.
      const isNoteShapedResult =
        result.success
        && typeof result.data === 'object'
        && result.data !== null
        && 'noteId' in (result.data as Record<string, unknown>);
      if (!isNoteShapedResult) {
        addMessage({ id: generateId(), role: 'system', content: result.success ? `Tool result: ${resultText}` : `Tool error: ${resultText}`, timestamp: Date.now() });
      } else if (!result.success) {
        addMessage({ id: generateId(), role: 'system', content: `Tool error: ${resultText}`, timestamp: Date.now() });
      }
    }

    return result;
  }, [addMessage, updateMessage]);

  const streamAssistantResponse = useCallback(async (text: string, contexts: AIContextItem[]) => {
    const currentThread = useChatStore.getState().activeThread;
    if (!currentThread) {
      setLocalError('Chat thread is not loaded.');
      return;
    }

    const userMessage: ChatMessage = { id: generateId(), role: 'user', content: text.trim(), timestamp: Date.now(), attachedContexts: contexts };
    const assistantMessageId = generateId();
    addMessage(userMessage);
    addMessage({ id: assistantMessageId, role: 'assistant', content: '', timestamp: Date.now() });
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
      if (!pendingFlush) pendingFlush = setTimeout(flushAssistantText, STREAM_RENDER_FLUSH_MS);
    };

    try {
      const aiState = useAIStore.getState();
      const { model, provider } = getSelectedModelConfig();
      const runtimeThread = useChatStore.getState().activeThread;
      if (!runtimeThread) throw new Error('Chat thread is not available.');

      const aggregatedContexts = dedupeContexts([...runtimeThread.messages.flatMap((message) => message.attachedContexts ?? []), ...contexts]);
      const contextString = aggregatedContexts.length ? await buildContextString(aggregatedContexts) : undefined;
      const history = runtimeThread.messages.filter((message) => message.id !== assistantMessageId).map(formatHistoryMessage);
      const prompt = buildSystemPrompt({ attachedContexts: contextString, noteCount, todoCount, actionMode: aiState.actionMode });
      const modelInstance = await AIService.initializeModel(model, provider as AIProviderConfig | undefined);
      const requestMessages: Parameters<typeof AIService.streamChatResponse>[1] = [{ role: 'system', content: prompt }, ...history];

      for await (const chunk of AIService.streamChatResponse(modelInstance, requestMessages, chatTools, abortController.signal)) {
        if (abortController.signal.aborted) break;
        const toolEvent = parseToolEvent(chunk);
        if (!toolEvent) {
          assistantText += chunk;
          scheduleFlush();
          continue;
        }

        const toolCallId = toolEvent.toolCallId ?? generateId();
        const existingArgs = toolArgsBufferRef.current[toolCallId] ?? '';
        if (toolEvent.type === 'tool-call-streaming-start') {
          toolArgsBufferRef.current[toolCallId] = existingArgs;
          continue;
        }
        if (toolEvent.type === 'tool-call-delta') {
          toolArgsBufferRef.current[toolCallId] = existingArgs + (toolEvent.argsTextDelta ?? '');
          continue;
        }
        if (toolEvent.type === 'tool-result' || !toolEvent.toolName) continue;

        const args = parseToolArgs(toolEvent.input, toolArgsBufferRef.current[toolCallId]);
        const toolMessageId = generateId();
        handledToolCount += 1;
        addMessage({ id: toolMessageId, role: 'assistant', content: '', timestamp: Date.now(), toolCallId, toolCallName: toolEvent.toolName, toolCallArgs: args });
        const result = await runToolCall(toolEvent.toolName, args, { messageId: toolMessageId });
        delete toolArgsBufferRef.current[toolCallId];
        if (result.requiresConfirmation) {
          pausedForConfirmation = true;
          break;
        }
      }

      if (pendingFlush) clearTimeout(pendingFlush);

      if (abortController.signal.aborted) updateMessage(assistantMessageId, { content: assistantText || 'Stopped.' });
      else if (!assistantText.trim() && !pausedForConfirmation) updateMessage(assistantMessageId, { content: handledToolCount > 0 ? 'Done.' : 'No response received.' });
      else updateMessage(assistantMessageId, { content: assistantText });

      await saveActiveThread();

      const latest = useChatStore.getState().activeThread;
      if (!abortController.signal.aborted && latest && latest.title === 'New Chat' && assistantText.trim()) {
        void (async () => {
          try {
            const titleModelInstance = await AIService.initializeModel(model, provider as AIProviderConfig | undefined);
            const title = await AIService.generateChatTitle(titleModelInstance, userMessage.content, assistantText);
            const fresh = useChatStore.getState().activeThread;
            if (title && fresh?.id === latest.id && fresh.title === 'New Chat') {
              renameThread({ threadId: latest.id, title });
              await saveActiveThread();
            }
          } catch (error) { void error; }
        })();
      }
    } catch (error) {
      if (pendingFlush) clearTimeout(pendingFlush);
      const aborted = (error as Error)?.name === 'AbortError' || abortController.signal.aborted;
      if (aborted) updateMessage(assistantMessageId, { content: assistantText || 'Stopped.' });
      else {
        const message =
          error instanceof ProviderUnavailableError
            ? describeAvailability(t, error.reason)
            : error instanceof Error
              ? error.message
              : 'Failed to send message.';
        setLocalError(message);
        updateMessage(assistantMessageId, { content: assistantText || message });
      }
    } finally {
      if (abortRef.current === abortController) abortRef.current = null;
      setStreaming(false);
    }
  }, [addMessage, clearError, getSelectedModelConfig, noteCount, renameThread, runToolCall, saveActiveThread, setStreaming, t, todoCount, updateMessage]);

  const stopStreaming = useCallback(() => abortRef.current?.abort(), []);

  const handleMessageLongPress = useCallback((message: ChatMessage) => {
    if (isStreaming) return;
    if (message.role === 'user') {
      Alert.prompt?.('Edit message', 'Re-send with new text. Replies after will be discarded.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', onPress: (newText?: string) => {
          const text = (newText ?? '').trim();
          if (!text) return;
          truncateAfter(message.id, { inclusive: true });
          void streamAssistantResponse(text, message.attachedContexts ?? []);
        } },
      ], 'plain-text', message.content);
      return;
    }

    if (message.role === 'assistant' && !message.toolCallName) {
      const currentMessages = useChatStore.getState().activeThread?.messages ?? [];
      const idx = currentMessages.findIndex((item) => item.id === message.id);
      if (idx < 0) return;
      let priorUserIdx = idx - 1;
      while (priorUserIdx >= 0 && currentMessages[priorUserIdx].role !== 'user') priorUserIdx -= 1;
      if (priorUserIdx < 0) return;
      const priorUser = currentMessages[priorUserIdx];
      Alert.alert('Regenerate response', 'Discard this reply and ask the model again?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Regenerate', onPress: () => {
          truncateAfter(priorUser.id);
          void streamAssistantResponse(priorUser.content, priorUser.attachedContexts ?? []);
        } },
      ]);
    }
  }, [isStreaming, streamAssistantResponse, truncateAfter]);

  useEffect(() => {
    if (storageAdapter) return;
    setStorageAdapter({
      loadThreadSummaries: ChatStorageService.loadThreadSummaries,
      loadThread: (owner, repo, branch, activeThreadId) => ChatStorageService.loadThread(owner, repo, activeThreadId, branch),
      saveThread: ChatStorageService.saveThread,
      deleteThread: (owner, repo, branch, activeThreadId) => ChatStorageService.deleteThread(owner, repo, activeThreadId, branch).then(() => undefined),
    });
  }, [setStorageAdapter, storageAdapter]);

  useEffect(() => {
    if (thread || !storageAdapter) return;
    const { chatRepoOwner, chatRepoName, chatRepoBranch } = useAIStore.getState();
    if (!chatRepoOwner || !chatRepoName) {
      setLocalError('Chat storage repo is not configured yet.');
      return;
    }
    void loadThread({ owner: chatRepoOwner, repo: chatRepoName, branch: chatRepoBranch, threadId });
  }, [loadThread, storageAdapter, thread, threadId]);

  const handleRetry = useCallback(() => {
    if (retryPayload && !isStreaming) void streamAssistantResponse(retryPayload.text, retryPayload.contexts);
  }, [isStreaming, retryPayload, streamAssistantResponse]);

  const handleConfirmApply = useCallback(async () => {
    if (!pendingConfirmation) return;
    setPendingConfirmation(null);
    setLocalError(null);
    try {
      await runToolCall(pendingConfirmation.toolName, pendingConfirmation.args, { allowConfirmation: false, messageId: pendingConfirmation.messageId });
      await saveActiveThread();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Failed to apply tool action.');
    }
  }, [pendingConfirmation, runToolCall, saveActiveThread]);

  const handleConfirmCancel = useCallback(async () => {
    if (!pendingConfirmation) return;
    updateMessage(pendingConfirmation.messageId, { toolCallResult: 'Cancelled.' });
    addMessage({ id: generateId(), role: 'system', content: `Cancelled: ${pendingConfirmation.description}`, timestamp: Date.now() });
    setPendingConfirmation(null);
    await saveActiveThread();
  }, [addMessage, pendingConfirmation, saveActiveThread, updateMessage]);

  const contextBudget = useCallback(() => {
    const model = useAIStore.getState().getSelectedModel();
    const attachedBytes = attachedContexts.reduce((acc, item) => acc + (item.approxBytes || 0), 0);
    const historyAttachedBytes = (thread?.messages ?? []).flatMap((message) => message.attachedContexts ?? []).reduce((acc, item) => acc + (item.approxBytes || 0), 0);
    const historyTextBytes = (thread?.messages ?? []).reduce((acc, message) => acc + (message.content?.length || 0) + (message.toolCallResult?.length || 0), 0);
    return checkContextBudget(model, attachedBytes + historyAttachedBytes + historyTextBytes + 600);
  }, [attachedContexts, thread?.messages]);

  const handleSend = useCallback((text: string) => {
    if (!text.trim() || isStreaming || isLoading) return;
    void streamAssistantResponse(text, attachedContexts);
  }, [attachedContexts, isLoading, isStreaming, streamAssistantResponse]);

  return {
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
    contextBudget: contextBudget(),
    handleSend,
    stopStreaming,
    handleMessageLongPress,
    handleRetry,
    handleConfirmApply,
    handleConfirmCancel,
    clearError,
  };
}
