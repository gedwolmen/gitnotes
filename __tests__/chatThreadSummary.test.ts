import type { ChatThread } from '../src/models/Chat';
import {
  buildThreadSummary,
  DEFAULT_CHAT_TITLE,
  deriveChatTitleFromText,
  deriveThreadPreview,
  deriveThreadTitle,
} from '../src/utils/chatThreadSummary';

function makeThread(overrides?: Partial<ChatThread>): ChatThread {
  return {
    id: 'thread-1',
    title: DEFAULT_CHAT_TITLE,
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

describe('chatThreadSummary helpers', () => {
  test('derives title from first meaningful line', () => {
    expect(deriveChatTitleFromText('  # Plan Sri Lanka trip\n- draft itinerary')).toBe('Plan Sri Lanka trip');
  });

  test('preserves custom title', () => {
    const thread = makeThread({
      title: 'Custom thread title',
      messages: [{ id: 'm1', role: 'user', content: 'Ignored', timestamp: 1 }],
    });

    expect(deriveThreadTitle(thread)).toBe('Custom thread title');
  });

  test('derives placeholder title from first user message', () => {
    const thread = makeThread({
      messages: [
        { id: 'm1', role: 'user', content: 'Create note about iOS testing strategy', timestamp: 1 },
        { id: 'm2', role: 'assistant', content: 'Done', timestamp: 2 },
      ],
    });

    expect(deriveThreadTitle(thread)).toBe('Create note about iOS testing strategy');
  });

  test('preview uses latest meaningful tool metadata when content empty', () => {
    const thread = makeThread({
      messages: [
        { id: 'm1', role: 'user', content: 'Need schedule for spaced repetition', timestamp: 1 },
        { id: 'm2', role: 'assistant', content: '', timestamp: 2, toolCallName: 'create_note' },
      ],
    });

    expect(deriveThreadPreview(thread)).toBe('Create note');
  });

  test('summary omits bogus preview for empty threads', () => {
    const summary = buildThreadSummary(makeThread());
    expect(summary.preview).toBeUndefined();
    expect(summary.title).toBe(DEFAULT_CHAT_TITLE);
  });
});
