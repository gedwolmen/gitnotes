import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import type { AIContextItem, AIModelConfig, AIProviderConfig } from '../../models/AIProvider';
import type { ChatMessage } from '../../models/Chat';
import * as AIService from '../../services/AIService';
import { AuthService } from '../../services/AuthService';
import * as ChatStorageService from '../../services/ChatStorageService';
import { executeToolCall } from '../../services/ai/actionExecutor';
import { chatTools, githubTools } from '../../services/ai/tools';
import { buildSystemPrompt } from '../../services/ai/systemPrompt';
import { checkContextBudget, getModelContextLimit } from '../../services/ai/modelLimits';
import { buildContextString } from '../../services/ContextService';
import { STREAM_RENDER_FLUSH_MS, BYTES_PER_TOKEN } from '../../services/ai/config';
import { aiMemoryIndex } from '../../services/ai/AIMemoryIndexService';
import type { MemorySearchResult } from '../../services/ai/AIMemoryIndexService';
import { ProviderUnavailableError } from '../../services/ai/providerAvailability';
import { describeAvailability } from '../../services/ai/providerAvailabilityCopy';
import { useTranslation } from 'react-i18next';
import { useAIStore } from '../../stores/aiStore';
import { useChatStore } from '../../stores/chatStore';
import { useNoteStore } from '../../stores/noteStore';
import { useTodoStore } from '../../stores/todoStore';
import { generateId } from '../../utils/ids';
import {
  decodeOverEscapedChunk,
  dedupeContexts,
  formatExecutorResult,
  formatToolResult,
  formatHistoryMessage,
  parseToolArgs,
  parseToolEvent,
  type PendingConfirmation,
  type RetryPayload,
} from './chatScreenShared';

type ToolListItem = {
  title?: string;
  text?: string;
  completed?: boolean;
};

function buildChatToolsMap(enabled: boolean = useAIStore.getState().githubToolsEnabled) {
  return enabled ? { ...chatTools, ...githubTools } : chatTools;
}

function sanitizeToolName(raw: string | undefined, knownToolNames: ReadonlySet<string>): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if (knownToolNames.has(trimmed)) return trimmed;
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx > 0) {
    const prefix = trimmed.slice(0, colonIdx).trim();
    if (knownToolNames.has(prefix)) return prefix;
  }
  return null;
}

function parseToolListItems(raw: string): ToolListItem[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is ToolListItem => !!item && typeof item === 'object');
  } catch {
    return null;
  }
}

function formatBulletList(items: string[], noun: string): string {
  if (items.length === 0) return `No ${noun} found.`;
  const visibleItems = items.slice(0, 8);
  const extraCount = items.length - visibleItems.length;
  return [
    `Found ${items.length} ${noun}:`,
    ...visibleItems.map((item) => `- ${item}`),
    ...(extraCount > 0 ? [`- and ${extraCount} more`] : []),
  ].join('\n');
}

function buildFallbackToolResponse(toolName: string, rawResult: string): string | null {
  if (!rawResult.trim()) return null;
  if (toolName === 'search_notes') {
    const items = parseToolListItems(rawResult);
    if (!items) return null;
    return formatBulletList(
      items.map((item) => item.title?.trim()).filter((item): item is string => !!item),
      'notes',
    );
  }
  if (toolName === 'search_todos' || toolName === 'get_todos') {
    const items = parseToolListItems(rawResult);
    if (!items) return null;
    return formatBulletList(
      items
        .map((item) => {
          const label = item.text?.trim();
          if (!label) return null;
          return item.completed ? `${label} (done)` : label;
        })
        .filter((item): item is string => !!item),
      'todos',
    );
  }
  return null;
}

function hasMeaningfulAssistantText(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const normalized = trimmed.toLowerCase();
  return normalized !== 'show' && normalized !== 'hide';
}

const TOOL_ACTION_PATTERN = /^\s*(create|delete|edit|update|add|remove|modify)\s+(a\s+|an\s+|the\s+)?(note|todo|task)/i;

function isToolActionShaped(query: string): boolean {
  return TOOL_ACTION_PATTERN.test(query.trim());
}

function extractDateFromThoughtDumpPath(filePath: string): string {
  const match = filePath.match(/thoughts\/(\d{4})(\d{2})(\d{2})/);
  if (!match) return '';
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function formatMemoryBlock(results: MemorySearchResult[], budgetBytes: number): string | null {
  if (results.length === 0) return null;

  const sorted = [...results].sort((a, b) => b.score - a.score);
  const lines: string[] = [];
  let currentBytes = 0;

  for (const result of sorted) {
    const date = extractDateFromThoughtDumpPath(result.filePath);
    const prefix = date ? `[${date}] ` : '';
    const line = `${prefix}${result.snippet}`;
    const lineBytes = line.length;

    if (currentBytes + lineBytes > budgetBytes && lines.length > 0) break;
    lines.push(line);
    currentBytes += lineBytes;
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

async function buildMemoryBlockForQuery(
  query: string,
  model: AIModelConfig | undefined,
  existingPromptBytes: number,
): Promise<string | null> {
  if (aiMemoryIndex.getEntryCount() === 0) return null;
  if (isToolActionShaped(query)) return null;

  try {
    const results = await aiMemoryIndex.search(query, 5);
    if (results.length === 0) return null;

    let budgetBytes = 2000;
    if (model) {
      const limit = getModelContextLimit(model);
      if (limit) {
        const totalBudgetBytes = (limit.totalTokens - limit.reservedTokens) * BYTES_PER_TOKEN;
        const available = totalBudgetBytes - existingPromptBytes;
        budgetBytes = Math.max(200, Math.min(available, totalBudgetBytes * 0.15));
      }
    }

    return formatMemoryBlock(results, budgetBytes);
  } catch {
    return null;
  }
}

function mergeAssistantWithToolFallback(
  assistantText: string,
  fallbackToolText: string,
  handledToolCount: number,
): string {
  const assistant = assistantText.trim();
  const fallback = fallbackToolText.trim();
  const assistantIsMeaningful = hasMeaningfulAssistantText(assistant);

  if (!fallback) {
    if (assistantIsMeaningful) return assistant;
    return handledToolCount > 0 ? '' : assistant || 'Done.';
  }

  if (handledToolCount <= 0) {
    return assistantIsMeaningful ? assistant : fallback;
  }

  if (!assistantIsMeaningful) return fallback;

  // Keep the model's narrative text, but always include concrete tool output
  // when tools actually ran so the user sees a usable final answer.
  if (assistant.includes(fallback)) return assistant;
  return `${assistant}\n\n${fallback}`;
}

export function useChatScreenController(threadId: string) {
  const noteCount = useNoteStore((state) => state.notes.length);
  const todoCount = useTodoStore((state) => state.todos.length);
  const githubToolsEnabled = useAIStore((state) => state.githubToolsEnabled);
  const knownToolNames = useMemo(
    () => new Set(Object.keys(buildChatToolsMap(githubToolsEnabled))),
    [githubToolsEnabled],
  );
  const activeThread = useChatStore((state) => state.activeThread);
  const isLoading = useChatStore((state) => state.isLoading);
  const storeError = useChatStore((state) => state.error);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const storageAdapter = useChatStore((state) => state.storageAdapter);
  const loadThread = useChatStore((state) => state.loadThread);
  const addMessage = useChatStore((state) => state.addMessage);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const removeMessage = useChatStore((state) => state.removeMessage);
  const setStreaming = useChatStore((state) => state.setStreaming);
  const clearError = useChatStore((state) => state.clearError);
  const setStorageAdapter = useChatStore((state) => state.setStorageAdapter);
  const truncateAfter = useChatStore((state) => state.truncateAfter);

  const toolArgsBufferRef = useRef<Record<string, string>>({});
  // Maps each in-flight `toolCallId` to the chat message bubble we created
  // when the tool call started streaming, so subsequent deltas + the final
  // tool-call event can update the same bubble (rather than creating a
  // second one once execution finishes).
  const toolMessageIdsRef = useRef<Record<string, string>>({});
  const abortRef = useRef<AbortController | null>(null);
  const { t } = useTranslation();

  const [attachedContexts, setAttachedContexts] = useState<AIContextItem[]>([]);
  const [isContextPickerVisible, setIsContextPickerVisible] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [retryPayload, setRetryPayload] = useState<RetryPayload | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [streamStartedAt, setStreamStartedAt] = useState<number>(0);

  const thread = activeThread?.id === threadId ? activeThread : null;
  const messages = thread?.messages ?? [];

  const saveActiveThread = useCallback(async () => {
    const latestThread = useChatStore.getState().activeThread;
    if (latestThread) await ChatStorageService.saveThread(latestThread);
  }, []);

  const persistPrimedThread = useCallback(async (threadId: string) => {
    const latestThread = useChatStore.getState().activeThread;
    if (!latestThread || latestThread.id !== threadId) {
      return;
    }

    await ChatStorageService.saveThread(latestThread).catch(() => { return; });
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
    try {
      const mode = useAIStore.getState().actionMode;
      const effectiveMode = options?.allowConfirmation === false ? 'auto' : mode;
      const result = await executeToolCall(toolName, args, effectiveMode);
      const resultText = formatExecutorResult(result);

      if (options?.messageId) updateMessage(options.messageId, { toolCallResult: resultText });

      if (result.requiresConfirmation && result.proposedChanges && options?.messageId) {
        setPendingConfirmation({ toolName, args, description: result.proposedChanges.description, details: result.proposedChanges.details, messageId: options.messageId });
      }

      if (!result.requiresConfirmation && !result.success) {
        addMessage({ id: generateId(), role: 'system', content: `Tool error: ${resultText}`, timestamp: Date.now() });
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tool execution failed.';
      if (options?.messageId) updateMessage(options.messageId, { toolCallResult: message });
      addMessage({ id: generateId(), role: 'system', content: `Tool error: ${message}`, timestamp: Date.now() });
      return {
        success: false,
        error: message,
        requiresConfirmation: false,
      };
    }
  }, [addMessage, updateMessage]);

  const streamAssistantResponse = useCallback(async (text: string, contexts: AIContextItem[]) => {
    const currentThread = useChatStore.getState().activeThread;
    if (!currentThread) {
      setLocalError('Chat thread is not loaded.');
      return;
    }

    const trimmedText = text.trim();
    const userMessage: ChatMessage = { id: generateId(), role: 'user', content: trimmedText, timestamp: Date.now(), attachedContexts: contexts };
    const assistantMessageId = generateId();
    addMessage(userMessage);
    void persistPrimedThread(currentThread.id);
    addMessage({ id: assistantMessageId, role: 'assistant', content: '', timestamp: Date.now() });
    setAttachedContexts([]);
    setRetryPayload({ text: userMessage.content, contexts });
    setLocalError(null);
    clearError();
    setPendingConfirmation(null);
    setStreamStartedAt(Date.now());
    setStreaming(true);

    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;
    let assistantText = '';
    let handledToolCount = 0;
    let pausedForConfirmation = false;
    let pendingFlush: ReturnType<typeof setTimeout> | null = null;
    const fallbackToolResponses: string[] = [];

    const flushAssistantText = () => {
      pendingFlush = null;
      updateMessage(assistantMessageId, { content: assistantText });
    };

    const scheduleFlush = () => {
      if (!pendingFlush) pendingFlush = setTimeout(flushAssistantText, STREAM_RENDER_FLUSH_MS);
    };

    try {
      const aiState = useAIStore.getState();
      const githubAccountLogin = githubToolsEnabled
        ? (await AuthService.checkAuthState()).user?.login
        : undefined;
      const { model, provider } = getSelectedModelConfig();
      const runtimeThread = useChatStore.getState().activeThread;
      if (!runtimeThread) throw new Error('Chat thread is not available.');

      const aggregatedContexts = dedupeContexts([...runtimeThread.messages.flatMap((message) => message.attachedContexts ?? []), ...contexts]);
      const contextString = aggregatedContexts.length ? await buildContextString(aggregatedContexts) : undefined;
      const history = runtimeThread.messages.filter((message) => message.id !== assistantMessageId).map(formatHistoryMessage);
      const basePrompt = buildSystemPrompt({ attachedContexts: contextString, noteCount, todoCount, actionMode: aiState.actionMode, githubToolsEnabled, githubAccountLogin });
      const memoryBlock = await buildMemoryBlockForQuery(trimmedText, model, basePrompt.length);
      const prompt = memoryBlock
        ? buildSystemPrompt({ attachedContexts: contextString, noteCount, todoCount, actionMode: aiState.actionMode, memoryBlock, githubToolsEnabled, githubAccountLogin })
        : basePrompt;
      const modelInstance = await AIService.initializeModel(model, provider as AIProviderConfig | undefined);
      const requestMessages: Parameters<typeof AIService.streamChatResponse>[1] = [{ role: 'system', content: prompt }, ...history];

      for await (const chunk of AIService.streamChatResponse(modelInstance, requestMessages, buildChatToolsMap(), abortController.signal)) {
        if (abortController.signal.aborted) break;
        const toolEvent = parseToolEvent(chunk);
        if (!toolEvent) {
          assistantText += decodeOverEscapedChunk(chunk);
          scheduleFlush();
          continue;
        }

        const toolCallId = toolEvent.toolCallId ?? generateId();
        const existingArgs = toolArgsBufferRef.current[toolCallId] ?? '';
        if (toolEvent.type === 'tool-call-streaming-start') {
          // Pre-create the bubble so the user immediately sees
          // "create_note…" appear; otherwise nothing renders until the
          // model finishes streaming the args and the tool actually runs.
          toolArgsBufferRef.current[toolCallId] = existingArgs;
          if (!toolMessageIdsRef.current[toolCallId]) {
            const streamingToolName = sanitizeToolName(toolEvent.toolName, knownToolNames);
            if (!streamingToolName) continue;
            const streamingMessageId = generateId();
            toolMessageIdsRef.current[toolCallId] = streamingMessageId;
            addMessage({
              id: streamingMessageId,
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
              toolCallId,
              toolCallName: streamingToolName,
              toolCallArgs: {},
            });
            // Flush any pending assistant text so the new bubble lands
            // after everything streamed so far, not mid-debounce.
            if (pendingFlush) {
              clearTimeout(pendingFlush);
              flushAssistantText();
            }
          }
          continue;
        }
        if (toolEvent.type === 'tool-call-delta') {
          toolArgsBufferRef.current[toolCallId] = existingArgs + (toolEvent.argsTextDelta ?? '');
          continue;
        }
        if (toolEvent.type === 'tool-result') {
          const streamedResultText = formatToolResult(toolEvent.result);
          const existingToolMessageId = toolMessageIdsRef.current[toolCallId];
          if (existingToolMessageId) {
            const eventToolName = sanitizeToolName(toolEvent.toolName, knownToolNames);
            updateMessage(existingToolMessageId, {
              ...(eventToolName ? { toolCallName: eventToolName } : null),
              toolCallResult: streamedResultText,
            });
            const fallbackToolResponse = eventToolName
              ? buildFallbackToolResponse(eventToolName, streamedResultText)
              : null;
            if (fallbackToolResponse) fallbackToolResponses.push(fallbackToolResponse);
          }
          continue;
        }

        const resolvedToolName = sanitizeToolName(toolEvent.toolName, knownToolNames);
        if (!resolvedToolName) continue;

        const args = parseToolArgs(toolEvent.input, toolArgsBufferRef.current[toolCallId]);
        // Re-use the streaming bubble if we already showed one, otherwise
        // (older providers that skip the streaming start event) create
        // the bubble here.
        const toolMessageId = toolMessageIdsRef.current[toolCallId] ?? generateId();
        if (!toolMessageIdsRef.current[toolCallId]) {
          toolMessageIdsRef.current[toolCallId] = toolMessageId;
          addMessage({ id: toolMessageId, role: 'assistant', content: '', timestamp: Date.now(), toolCallId, toolCallName: resolvedToolName, toolCallArgs: args });
        } else {
          updateMessage(toolMessageId, { toolCallName: resolvedToolName, toolCallArgs: args });
        }
        handledToolCount += 1;
        const result = await runToolCall(resolvedToolName, args, { messageId: toolMessageId });
        const resultText = formatExecutorResult(result);
        const fallbackToolResponse = buildFallbackToolResponse(resolvedToolName, resultText);
        if (fallbackToolResponse) fallbackToolResponses.push(fallbackToolResponse);
        delete toolArgsBufferRef.current[toolCallId];
        delete toolMessageIdsRef.current[toolCallId];
        if (result.requiresConfirmation) {
          pausedForConfirmation = true;
          break;
        }
      }

      if (pendingFlush) clearTimeout(pendingFlush);

      if (abortController.signal.aborted) {
        updateMessage(assistantMessageId, { content: assistantText || 'Stopped.' });
      } else if (!assistantText.trim() && !pausedForConfirmation) {
        const fallbackToolText = fallbackToolResponses.join('\n\n').trim();
        // Stream finished with no text. If the model invoked tools the
        // tool bubbles carry the actual output — keep this bubble as
        // "Done." Otherwise the model really did return nothing
        // (free-tier OpenRouter routes occasionally do this on the first
        // try). Surface it as a retryable error so the toast's Retry
        // button appears instead of leaving the user staring at a
        // dead-end "No response received." bubble.
        if (handledToolCount > 0) {
          if (fallbackToolText) {
            assistantText = fallbackToolText;
            updateMessage(assistantMessageId, { content: assistantText });
          } else {
            removeMessage(assistantMessageId);
          }
        } else {
          updateMessage(assistantMessageId, { content: 'No response received. Tap Retry to try again.' });
          setLocalError('The model returned an empty response.');
        }
      } else {
        const fallbackToolText = fallbackToolResponses.join('\n\n').trim();
        const nextContent = mergeAssistantWithToolFallback(assistantText, fallbackToolText, handledToolCount);
        if (!nextContent && handledToolCount > 0) removeMessage(assistantMessageId);
        else updateMessage(assistantMessageId, { content: nextContent });
      }

      if (abortRef.current === abortController) abortRef.current = null;
      setStreaming(false);
      setStreamStartedAt(0);
      saveActiveThread().catch((err) => console.warn('[ChatScreen] saveActiveThread failed:', err));
    } catch (error) {
      if (pendingFlush) clearTimeout(pendingFlush);
      if (abortRef.current === abortController) abortRef.current = null;
      setStreaming(false);
      setStreamStartedAt(0);
      const aborted = (error as Error)?.name === 'AbortError' || abortController.signal.aborted;
      if (aborted) updateMessage(assistantMessageId, { content: assistantText || 'Stopped.' });
      else {
        const message =
          error instanceof ProviderUnavailableError
            ? describeAvailability(t, error.reason)
            : error instanceof Error
              ? error.message
              : 'Failed to send message.';
        const fallbackToolText = fallbackToolResponses.join('\n\n').trim();
        if (hasMeaningfulAssistantText(assistantText) || handledToolCount > 0 || fallbackToolText) {
          const nextContent = mergeAssistantWithToolFallback(assistantText, fallbackToolText, handledToolCount);
          if (!nextContent && handledToolCount > 0) removeMessage(assistantMessageId);
          else updateMessage(assistantMessageId, { content: nextContent });
          console.warn('[ChatScreen] stream finished with visible output but failed while persisting or post-processing:', message);
        } else {
          removeMessage(assistantMessageId);
          setLocalError(message);
        }
      }
    } finally {
      if (abortRef.current === abortController) abortRef.current = null;
      setStreaming(false);
      setStreamStartedAt(0);
    }
  }, [addMessage, clearError, getSelectedModelConfig, githubToolsEnabled, knownToolNames, noteCount, persistPrimedThread, removeMessage, runToolCall, saveActiveThread, setStreaming, t, todoCount, updateMessage]);

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

  // Rebuild `pendingConfirmation` from the persisted message list when this
  // controller mounts (e.g. user navigated away from a thread that paused
  // for confirmation and came back). The chip itself rides on the persisted
  // assistant message, but Apply/Cancel only work when the controller's
  // local `pendingConfirmation` state is populated — without this the chip
  // renders as a dead end. Re-issuing the tool call in confirm mode is
  // non-mutating: the executor returns `proposedChanges` instead of
  // applying them, which is exactly what we need to repopulate the state.
  useEffect(() => {
    if (isStreaming) return;
    if (pendingConfirmation) return;
    if (useAIStore.getState().actionMode !== 'confirm') return;
    if (!messages.length) return;

    const pendingMessage = [...messages].reverse().find(
      (message) =>
        message.role === 'assistant'
        && !!message.toolCallName
        && !message.toolCallResult,
    );
    if (!pendingMessage?.toolCallName) return;

    let cancelled = false;
    void (async () => {
      try {
        const result = await executeToolCall(
          pendingMessage.toolCallName as string,
          pendingMessage.toolCallArgs ?? {},
          'confirm',
        );
        if (cancelled) return;
        if (!result.requiresConfirmation || !result.proposedChanges) return;
        setPendingConfirmation({
          toolName: pendingMessage.toolCallName as string,
          args: pendingMessage.toolCallArgs ?? {},
          description: result.proposedChanges.description,
          details: result.proposedChanges.details,
          messageId: pendingMessage.id,
        });
      } catch (error) {
        console.warn('[useChatScreenController] executeToolCall for pending confirmation failed:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
    // We intentionally key off `messages.length` instead of `messages` so this
    // effect doesn't refire every render (the array identity changes). When a
    // new tool call arrives mid-stream the live setter in `runToolCall`
    // populates `pendingConfirmation` directly, so we don't need to react to
    // every message mutation here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, messages.length, pendingConfirmation, threadId]);

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
    streamStartedAt,
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
