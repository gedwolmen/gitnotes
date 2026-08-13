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
    edit_note: { description: 'Edit a note' },
    delete_note: { description: 'Delete a note' },
    search_notes: { description: 'Search notes' },
    get_note: { description: 'Get a note' },
    create_todo: { description: 'Create a todo' },
    edit_todo: { description: 'Edit a todo' },
    delete_todo: { description: 'Delete a todo' },
    search_todos: { description: 'Search todos' },
    get_todos: { description: 'Get todos' },
  },
  githubTools: {
    list_repos: { description: 'List repositories' },
    list_issues: { description: 'List issues' },
    create_issue: { description: 'Create an issue' },
    list_pull_requests: { description: 'List pull requests' },
    create_pull_request: { description: 'Create a pull request' },
    get_pull_request_diff: { description: 'Get a pull request diff' },
    review_pull_request: { description: 'Review a pull request' },
  },
}));

import {
  buildChatToolsMap,
  sanitizeToolName,
} from '../src/components/chat/useChatScreenController';
import { useAIStore } from '../src/stores/aiStore';

const CHAT_TOOL_NAMES = [
  'create_note',
  'edit_note',
  'delete_note',
  'search_notes',
  'get_note',
  'create_todo',
  'edit_todo',
  'delete_todo',
  'search_todos',
  'get_todos',
];

const GITHUB_TOOL_NAMES = [
  'list_repos',
  'list_issues',
  'create_issue',
  'list_pull_requests',
  'create_pull_request',
  'get_pull_request_diff',
  'review_pull_request',
];

describe('useChatScreenController github tools gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('buildChatToolsMap', () => {
    test('includes all chat and github tools when githubToolsEnabled is true', () => {
      useAIStore.setState({ githubToolsEnabled: true });

      const toolsMap = buildChatToolsMap(true);
      const keys = Object.keys(toolsMap);

      expect(keys).toHaveLength(CHAT_TOOL_NAMES.length + GITHUB_TOOL_NAMES.length);
      for (const name of CHAT_TOOL_NAMES) {
        expect(toolsMap).toHaveProperty(name);
      }
      for (const name of GITHUB_TOOL_NAMES) {
        expect(toolsMap).toHaveProperty(name);
      }
    });

    test('includes only chat tools when githubToolsEnabled is false', () => {
      useAIStore.setState({ githubToolsEnabled: false });

      const toolsMap = buildChatToolsMap(false);
      const keys = Object.keys(toolsMap);

      expect(keys).toHaveLength(CHAT_TOOL_NAMES.length);
      for (const name of CHAT_TOOL_NAMES) {
        expect(toolsMap).toHaveProperty(name);
      }
      for (const name of GITHUB_TOOL_NAMES) {
        expect(toolsMap).not.toHaveProperty(name);
      }
      expect(toolsMap).not.toHaveProperty('list_repos');
    });

    test('defaults to the store flag when called with no argument', () => {
      useAIStore.setState({ githubToolsEnabled: true });

      const toolsMap = buildChatToolsMap();

      for (const name of GITHUB_TOOL_NAMES) {
        expect(toolsMap).toHaveProperty(name);
      }
      for (const name of CHAT_TOOL_NAMES) {
        expect(toolsMap).toHaveProperty(name);
      }
    });

    test('explicit false wins over a true store flag', () => {
      useAIStore.setState({ githubToolsEnabled: true });

      const toolsMap = buildChatToolsMap(false);

      expect(Object.keys(toolsMap)).toHaveLength(CHAT_TOOL_NAMES.length);
      for (const name of GITHUB_TOOL_NAMES) {
        expect(toolsMap).not.toHaveProperty(name);
      }
    });
  });

  describe('sanitizeToolName', () => {
    const enabledNames = new Set<string>([...CHAT_TOOL_NAMES, ...GITHUB_TOOL_NAMES]);

    test('returns the name when it is known', () => {
      expect(sanitizeToolName('list_repos', enabledNames)).toBe('list_repos');
    });

    test('returns the tool name from a colon-prefixed variant', () => {
      expect(sanitizeToolName('list_repos:xyz', enabledNames)).toBe('list_repos');
    });

    test('returns null for an unknown name', () => {
      expect(sanitizeToolName('drop_table', enabledNames)).toBeNull();
    });

    test('returns null for empty or missing input', () => {
      expect(sanitizeToolName('', enabledNames)).toBeNull();
      expect(sanitizeToolName('   ', enabledNames)).toBeNull();
      expect(sanitizeToolName(undefined, enabledNames)).toBeNull();
    });

    test('rejects github tools when the known set is built with gating off', () => {
      useAIStore.setState({ githubToolsEnabled: false });
      const gatedNames = new Set<string>(Object.keys(buildChatToolsMap(false)));

      expect(sanitizeToolName('list_repos', gatedNames)).toBeNull();
      expect(sanitizeToolName('create_note', gatedNames)).toBe('create_note');
    });
  });
});
