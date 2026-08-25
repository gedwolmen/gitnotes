import { renderHook, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../src/navigation/types';
import { useGitOperationStore } from '../../src/stores/gitOperationStore';
import type { GitOpBeginInput } from '../../src/stores/gitOperationStore';

jest.mock('expo-image-picker', () => ({}));

jest.mock('../../src/services/GitService', () => ({
  GitService: {
    commit: jest.fn(),
    push: jest.fn(),
    getBranches: jest.fn(async () => []),
    getRepositoryFolders: jest.fn(async () => []),
  },
}));

jest.mock('../../src/services/NoteGitHubSyncService', () => ({
  syncNoteToGitHub: jest.fn(),
}));

jest.mock('../../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: { enqueueNoteUpsert: jest.fn(async () => undefined) },
}));

jest.mock('../../src/services/featureFlags', () => ({
  FEATURE_USE_MULTI_HOST_WRITE: false,
}));

jest.mock('../../src/utils/haptics', () => ({
  HapticService: { selection: jest.fn(), success: jest.fn(), error: jest.fn() },
}));

import { useNoteEditorDocument } from '../../src/components/editor/useNoteEditorDocument';

const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
} as unknown as NativeStackNavigationProp<RootStackParamList, 'NoteEditor'>;

const baseParams = {
  initialFormat: 'markdown' as const,
  activeAccountId: null,
  repositories: [],
  folders: [],
  createNote: jest.fn(),
  updateNote: jest.fn(),
  navigation,
};

function editorParams(overrides: Record<string, unknown>) {
  return {
    ...baseParams,
    ...overrides,
  };
}

function beginOp(input: Omit<GitOpBeginInput, 'attempts'> & { status?: 'queued' | 'running' }) {
  return useGitOperationStore.getState().begin({ ...input, attempts: 0 });
}

describe('useNoteEditorDocument repoBusy guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset store to clean state.
    const ids = Object.keys(useGitOperationStore.getState().ops);
    for (const id of ids) useGitOperationStore.getState().succeed(id);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.todo('retains guard behavior via CommitService');
});
