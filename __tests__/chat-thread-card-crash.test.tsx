/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Regression: "AI chat crashes instantly on open".
 *
 * The chat-thread list renders a summary card for every thread, and
 * ChatThreadCard called `formatDistanceToNow(thread.updatedAt)` unguarded.
 * date-fns throws `RangeError: Invalid time value` for a missing/NaN
 * updatedAt (e.g. a thread persisted before timestamps were uniformly
 * applied, or a partially-synced summary), and since this is a render error
 * the whole chat screen crashes the moment the list opens. This is the same
 * crash class #864 fixed for message bubbles but missed for thread cards.
 *
 * buildThreadSummary also copied `updatedAt` through unnormalized, so a bad
 * value reached the card. Both sites are fixed and locked here.
 */
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (value: string) => value }),
}));

import React from 'react';
import { render } from '@testing-library/react-native';

import { ChatThreadCard } from '../src/components/chat/ChatThreadCard';
import type { ChatThread, ChatThreadSummary } from '../src/models/Chat';
import { buildThreadSummary } from '../src/utils/chatThreadSummary';
import { TestThemeProvider } from './ui/testThemeProvider';

function makeThread(overrides?: Partial<ChatThread>): ChatThread {
  return {
    id: 'thread-1',
    title: 'Test thread',
    messages: [],
    createdAt: 1,
    updatedAt: 2,
    repoOwner: 'o',
    repoName: 'r',
    branch: 'main',
    filePath: 'chat/thread-1.json',
    ...overrides,
  };
}

function renderCard(thread: ChatThreadSummary) {
  return render(
    React.createElement(
      TestThemeProvider,
      null,
      React.createElement(ChatThreadCard, {
        thread,
        onPress: () => undefined,
        onLongPress: () => undefined,
      }),
    ),
  );
}

describe('chat thread card crash regression', () => {
  test('card with NaN updatedAt renders without crashing', () => {
    // Previously: `formatDistanceToNow(NaN)` threw `RangeError: Invalid time
    // value`, an uncaught render error that killed the chat screen on open.
    expect(() =>
      renderCard({ id: 'legacy-1', title: 'Legacy', updatedAt: NaN, messageCount: 0 }),
    ).not.toThrow();
  });

  test('card with missing updatedAt renders without crashing', () => {
    expect(() =>
      renderCard({ id: 'legacy-2', title: 'Legacy', messageCount: 0 } as ChatThreadSummary),
    ).not.toThrow();
  });

  test('card with valid updatedAt renders the ago label', () => {
    const { getByText } = renderCard({
      id: 'ok-1',
      title: 'Fine',
      updatedAt: Date.now(),
      messageCount: 3,
    });
    expect(getByText(/ago/i)).toBeTruthy();
  });

  test('buildThreadSummary with NaN updatedAt returns a finite timestamp', () => {
    const summary = buildThreadSummary(makeThread({ updatedAt: NaN }));
    expect(Number.isFinite(summary.updatedAt)).toBe(true);
  });

  test('buildThreadSummary with missing updatedAt returns a finite timestamp', () => {
    const thread = makeThread() as any;
    delete thread.updatedAt;
    const summary = buildThreadSummary(thread);
    expect(Number.isFinite(summary.updatedAt)).toBe(true);
  });
});
