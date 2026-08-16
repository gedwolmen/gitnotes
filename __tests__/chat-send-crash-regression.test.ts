/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Regression: "sending a message from chat crashes the app".
 *
 * Two crash sites in the chat send path were confirmed by driving the real
 * code paths:
 *
 * 1. ChatMessageBubble rendered `formatDistanceToNow(message.timestamp)`
 *    unconditionally. date-fns throws `RangeError: Invalid time value` for a
 *    missing/NaN timestamp (e.g. a message persisted before timestamps were
 *    uniformly applied, or a partially-synced thread), and since this is a
 *    render error nothing in the stream's try/catch can contain it — the
 *    whole chat screen crashes the moment the list re-renders (which happens
 *    right when a message is sent and new bubbles are appended).
 *
 * 2. formatHistoryMessage called `JSON.stringify(message.toolCallArgs)`
 *    unguarded; a tool bubble whose args are not serialisable (circular ref,
 *    BigInt) threw `TypeError: Converting circular structure to JSON` /
 *    `TypeError: Do not know how to serialize a BigInt` and aborted the
 *    request-history build.
 */
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (value: string) => value }),
}));

jest.mock('../src/services/AIService', () => ({
  initializeModel: jest.fn(async () => ({})),
  streamChatResponse: jest.fn(),
}));

jest.mock('../src/services/ContextService', () => ({
  buildContextString: jest.fn(async () => ''),
}));

jest.mock('../src/services/ChatStorageService', () => ({
  loadThreadSummaries: jest.fn(async () => []),
  loadThread: jest.fn(async () => null),
  saveThread: jest.fn(async () => undefined),
  deleteThread: jest.fn(async () => true),
  setChatRepoAccount: jest.fn(),
}));

jest.mock('../src/services/ai/systemPrompt', () => ({
  buildSystemPrompt: jest.fn(() => 'system prompt'),
}));

jest.mock('../src/services/ai/modelLimits', () => ({
  checkContextBudget: jest.fn(() => ({ warningLevel: 'none', message: '' })),
}));

jest.mock('../src/services/ai/actionExecutor', () => ({
  executeToolCall: jest.fn(async () => ({ success: true, requiresConfirmation: false })),
}));

jest.mock('../src/services/ai/tools', () => ({
  chatTools: {
    create_note: { description: 'Create a note' },
    create_todo: { description: 'Create a todo' },
    search_notes: { description: 'Search notes' },
    get_todos: { description: 'Get todos' },
  },
}));

jest.mock('react-native-marked', () => ({
  useMarkdown: jest.fn(() => []),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

import React from 'react';
import { act, render, renderHook, waitFor } from '@testing-library/react-native';

import * as AIService from '../src/services/AIService';
import { useChatScreenController } from '../src/components/chat/useChatScreenController';
import { ChatMessageBubble } from '../src/components/ai/ChatMessageBubble';
import { formatHistoryMessage } from '../src/components/chat/chatScreenShared';
import type { ChatMessage } from '../src/models/Chat';
import { useAIStore } from '../src/stores/aiStore';
import { useChatStore } from '../src/stores/chatStore';
import { useNoteStore } from '../src/stores/noteStore';
import { useTodoStore } from '../src/stores/todoStore';
import { TestThemeProvider } from './ui/testThemeProvider';

const setupDefaultStore = (initialMessages: ChatMessage[] = []) => {
  useNoteStore.setState({ notes: [] } as any);
  useTodoStore.setState({ todos: [] } as any);
  useAIStore.setState({
    isEnabled: true,
    selectedModelId: 'model-1',
    actionMode: 'auto',
    chatRepoOwner: 'owner',
    chatRepoName: 'repo',
    chatRepoBranch: 'main',
    chatRepoAccountId: null,
    providers: [{
      id: 'provider-1',
      type: 'openai-compatible',
      name: 'Provider',
      isEnabled: true,
      addedAt: 0,
      models: [{
        id: 'model-1',
        name: 'Model 1',
        providerId: 'provider-1',
        providerType: 'openai-compatible',
        requiresDownload: false,
      }],
    }],
    isLoading: false,
    error: null,
  } as any);

  useChatStore.setState({
    threads: [{ id: 'thread-1', title: 'Old Chat', updatedAt: 1, messageCount: initialMessages.length }],
    activeThread: {
      id: 'thread-1',
      title: 'Old Chat',
      messages: initialMessages,
      createdAt: 1,
      updatedAt: 1,
      repoOwner: 'owner',
      repoName: 'repo',
      branch: 'main',
      filePath: 'chat/thread-1.json',
    },
    isLoading: false,
    error: null,
    isStreaming: false,
    storageAdapter: null,
  } as any);
};

function renderBubble(message: ChatMessage, isStreaming = false) {
  return render(
    React.createElement(
      TestThemeProvider,
      null,
      React.createElement(ChatMessageBubble, { message, isStreaming }),
    ),
  );
}

describe('chat send crash regression', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ChatMessageBubble render guard', () => {
    test('bubble with a missing timestamp renders without crashing', () => {
      // Previously: `formatDistanceToNow(undefined)` threw
      // `RangeError: Invalid time value`, an uncaught render error that
      // killed the chat screen. Now renders with an empty timestamp label.
      expect(() =>
        renderBubble({ id: 'legacy-1', role: 'assistant', content: 'hello' } as any),
      ).not.toThrow();
    });

    test('bubble with NaN timestamp renders without crashing', () => {
      expect(() =>
        renderBubble({ id: 'legacy-2', role: 'assistant', content: 'hello', timestamp: NaN }),
      ).not.toThrow();
    });

    test('streaming tool-call bubble with missing timestamp renders without crashing', () => {
      expect(() =>
        renderBubble(
          { id: 'legacy-3', role: 'assistant', content: '', toolCallName: 'create_note', toolCallArgs: {} } as any,
          true,
        ),
      ).not.toThrow();
    });

    test('valid timestamps still render a distance label', () => {
      const { getByText } = renderBubble({
        id: 'ok-1',
        role: 'assistant',
        content: 'hello',
        timestamp: Date.now(),
      });
      expect(getByText(/ago/i)).toBeTruthy();
    });
  });

  describe('send path end-to-end', () => {
    test('sending with a legacy message missing its timestamp completes without throwing', async () => {
      // This is the exact crash shape: a thread whose persisted messages are
      // missing timestamps. Sending appends new bubbles and re-renders the
      // whole list; the unguarded formatDistanceToNow used to throw.
      setupDefaultStore([
        { id: 'legacy-user', role: 'user', content: 'old message' } as any,
      ]);

      const toolCallStream = (async function* () {
        yield JSON.stringify({ type: 'tool-call-streaming-start', toolCallId: 'tc-1', toolName: 'create_note' });
        yield JSON.stringify({ type: 'tool-call-delta', toolCallId: 'tc-1', argsTextDelta: '{"title":' });
        yield JSON.stringify({ type: 'tool-call-delta', toolCallId: 'tc-1', argsTextDelta: '"T"}' });
        yield JSON.stringify({ type: 'tool-call', toolCallId: 'tc-1', toolName: 'create_note', input: { title: 'T' } });
      }) as any;
      jest.mocked(AIService.streamChatResponse).mockImplementation(toolCallStream);

      const { result } = renderHook(() => useChatScreenController('thread-1'));

      await act(async () => {
        result.current.handleSend('Create a note about testing');
        await jest.runAllTimersAsync();
      });

      await waitFor(() => {
        expect(useChatStore.getState().isStreaming).toBe(false);
      }, { timeout: 3000 });

      const messages = useChatStore.getState().activeThread?.messages ?? [];
      // Consistent message list: the legacy message, the new user message,
      // and the tool bubble — no stray empty assistant bubble.
      expect(messages.some((m) => m.role === 'user' && m.content === 'Create a note about testing')).toBe(true);
      const toolBubble = messages.find((m) => m.toolCallName === 'create_note');
      expect(toolBubble).toBeTruthy();
      expect(toolBubble?.toolCallArgs).toEqual({ title: 'T' });
      expect(messages.filter((m) => m.role === 'assistant' && !m.toolCallName && !m.content)).toHaveLength(0);

      // The exact render path that crashed the app must survive the whole
      // resulting message list.
      expect(() => messages.forEach((m) => renderBubble(m))).not.toThrow();
    });

    test('send path with a tool-call part sequence resolves without throwing', async () => {
      setupDefaultStore();

      const partStream = (async function* () {
        yield 'Sure, here is a note:';
        yield JSON.stringify({ type: 'tool-call-streaming-start', toolCallId: 'tc-2', toolName: 'create_todo' });
        yield JSON.stringify({ type: 'tool-call-delta', toolCallId: 'tc-2', argsTextDelta: '{"text":' });
        yield JSON.stringify({ type: 'tool-call-delta', toolCallId: 'tc-2', argsTextDelta: '"buy milk"}' });
        yield JSON.stringify({ type: 'tool-call', toolCallId: 'tc-2', toolName: 'create_todo', input: { text: 'buy milk' } });
      }) as any;
      jest.mocked(AIService.streamChatResponse).mockImplementation(partStream);

      const { result } = renderHook(() => useChatScreenController('thread-1'));

      await act(async () => {
        result.current.handleSend('Create a todo');
        await jest.runAllTimersAsync();
      });

      await waitFor(() => {
        expect(useChatStore.getState().isStreaming).toBe(false);
      }, { timeout: 3000 });

      const messages = useChatStore.getState().activeThread?.messages ?? [];
      const toolBubble = messages.find((m) => m.toolCallName === 'create_todo');
      expect(toolBubble?.toolCallArgs).toEqual({ text: 'buy milk' });
      const assistant = messages.find((m) => m.role === 'assistant' && !m.toolCallName);
      expect(assistant?.content).toContain('Sure, here is a note:');
    });

    test('send path resolves when the mocked stream yields nothing (empty body)', async () => {
      setupDefaultStore();
      jest.mocked(AIService.streamChatResponse).mockImplementation((async function* () {}) as any);

      const { result } = renderHook(() => useChatScreenController('thread-1'));
      await act(async () => {
        result.current.handleSend('Hello');
        await jest.runAllTimersAsync();
      });
      await waitFor(() => {
        expect(useChatStore.getState().isStreaming).toBe(false);
      }, { timeout: 3000 });
    });
  });

  describe('formatHistoryMessage guard', () => {
    const base: ChatMessage = { id: 'm1', role: 'assistant', content: '', timestamp: Date.now() };

    test('toolCallArgs with a circular reference serialises instead of throwing', () => {
      const circular: any = { title: 'x' };
      circular.self = circular;
      const out = formatHistoryMessage({ ...base, toolCallName: 'create_note', toolCallArgs: circular });
      expect(typeof out.content).toBe('string');
    });

    test('toolCallArgs with BigInt serialises instead of throwing', () => {
      const out = formatHistoryMessage({ ...base, toolCallName: 'create_note', toolCallArgs: { n: 1n } as any });
      expect(typeof out.content).toBe('string');
    });

    test('toolCallArgs with a throwing toJSON serialises instead of throwing', () => {
      const evil: any = { title: 'x' };
      evil.toJSON = () => { throw new Error('boom'); };
      const out = formatHistoryMessage({ ...base, toolCallName: 'create_note', toolCallArgs: evil });
      expect(typeof out.content).toBe('string');
    });
  });
});
