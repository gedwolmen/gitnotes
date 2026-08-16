import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

import ConflictResolverScreen from '../../src/screens/ConflictResolverScreen';
import type { ConflictSet, FileConflict } from '../../src/services/conflict/types';
import type { AIModelConfig } from '../../src/models/AIProvider';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

let mockConflictSet: ConflictSet | null = null;
let mockSelectedModel: AIModelConfig | undefined = undefined;

const mockUpdateConflict = jest.fn(
  (_repoPath: string, _branch: string, updater: (c: ConflictSet) => ConflictSet) => {
    if (mockConflictSet) {
      mockConflictSet = updater(mockConflictSet);
    }
  },
);
const mockRemoveConflict = jest.fn(async () => undefined);

const mockProposeMerge = jest.fn();
const mockWriteAndCommit = jest.fn(async () => undefined);
const mockDeleteAndCommit = jest.fn(async () => undefined);
const mockMergeCommit = jest.fn(async () => ({}));
const mockGetToken = jest.fn(async () => null);
const mockGetUser = jest.fn();

let alertSpy: jest.SpyInstance;
let alertButtons: { text: string; onPress?: () => void; style?: string }[] = [];

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => ({ params: { repoPath: 'owner/repo', branch: 'main', filePath: 'notes/a.md' } }),
}));

jest.mock('../../src/stores/conflictStore', () => ({
  useConflictStore: (selector: (state: unknown) => unknown) =>
    selector({
      getConflict: () => mockConflictSet,
      updateConflict: mockUpdateConflict,
      removeConflict: mockRemoveConflict,
    }),
}));

jest.mock('../../src/stores/aiStore', () => ({
  useAIStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({ getSelectedModel: () => mockSelectedModel, providers: [] }),
    {
      getState: () => ({ getSelectedModel: () => mockSelectedModel, providers: [] }),
    },
  ),
}));

jest.mock('../../src/services/conflict/AiConflictResolver', () => ({
  proposeMerge: (...args: unknown[]) => mockProposeMerge(...args),
}));

jest.mock('../../src/services/git/GitFsService', () => ({
  GitFsService: { mergeCommit: (...args: unknown[]) => mockMergeCommit(...args) },
}));

jest.mock('../../src/services/git/LocalGitWriter', () => ({
  LocalGitWriter: {
    writeAndCommit: (...args: unknown[]) => mockWriteAndCommit(...args),
    deleteAndCommit: (...args: unknown[]) => mockDeleteAndCommit(...args),
  },
}));

jest.mock('../../src/services/AuthService', () => ({
  AuthService: {
    getToken: () => mockGetToken(),
    getUser: (token: string) => mockGetUser(token),
  },
}));

jest.mock('../../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#fff',
      surface: '#f4f4f4',
      primary: '#2563eb',
      text: '#111',
      textSecondary: '#666',
      border: '#ddd',
      error: '#dc2626',
    },
  }),
}));

jest.mock('../../src/components/ui', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    ScreenHeader: ({ title }: { title: string }) =>
      React.createElement(View, null, React.createElement(Text, null, title)),
  };
});

const TEST_MODEL: AIModelConfig = {
  id: 'test-model',
  name: 'Test Model',
  providerId: 'test-provider',
  providerType: 'anthropic',
  requiresDownload: false,
};

function makeFile(overrides: Partial<FileConflict> = {}): FileConflict {
  return {
    path: 'notes/a.md',
    kind: 'both-changed-different',
    format: 'text',
    localContent: '# Local',
    remoteContent: '# Remote',
    baseContent: '# Base',
    mergedContent: null,
    localSha: 'abc123',
    remoteSha: 'def456',
    autoResolved: false,
    ...overrides,
  };
}

function makeConflictSet(files: FileConflict[]): ConflictSet {
  return {
    repoPath: 'owner/repo',
    branch: 'main',
    localRef: 'refs/heads/main',
    remoteRef: 'refs/remotes/origin/main',
    mergeBaseRef: 'refs/heads/main~1',
    files,
    detectedAt: 1000,
  };
}

describe('ConflictResolverScreen AI-fix flow', () => {
  beforeEach(() => {
    mockConflictSet = makeConflictSet([makeFile()]);
    mockSelectedModel = undefined;
    mockNavigate.mockClear();
    mockGoBack.mockClear();
    mockUpdateConflict.mockClear();
    mockRemoveConflict.mockClear();
    mockProposeMerge.mockReset();
    mockWriteAndCommit.mockClear();
    mockDeleteAndCommit.mockClear();
    mockMergeCommit.mockClear();
    mockGetToken.mockClear();
    mockGetUser.mockClear();
    alertButtons = [];
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((...args: unknown[]) => {
      alertButtons = (args[2] ?? []) as { text: string; onPress?: () => void; style?: string }[];
      return undefined;
    });
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('shows the AI-fix button only when a model is configured', () => {
    const { queryByTestId, rerender } = render(<ConflictResolverScreen />);
    expect(queryByTestId('conflict-resolver.ai-fix')).toBeNull();

    mockSelectedModel = TEST_MODEL;
    rerender(<ConflictResolverScreen />);

    expect(queryByTestId('conflict-resolver.ai-fix')).toBeTruthy();
  });

  it('clicking AI-fix proposes a merge, fills the merged tab, and shows the note', async () => {
    mockSelectedModel = TEST_MODEL;
    mockProposeMerge.mockResolvedValue({
      mergedContent: '# AI merged',
      confidence: 'high',
      note: 'Combined both changes',
    });

    const { getByTestId, getByText } = render(<ConflictResolverScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('conflict-resolver.ai-fix'));
    });

    expect(mockProposeMerge).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'notes/a.md', format: 'text' }),
      expect.objectContaining({ id: 'test-model' }),
      undefined,
    );
    expect(getByText('# AI merged')).toBeTruthy();
    expect(getByText('Combined both changes')).toBeTruthy();
    expect(mockUpdateConflict).toHaveBeenCalledTimes(1);
  });

  it('disables AI-fix once the file is resolved', async () => {
    mockSelectedModel = TEST_MODEL;
    mockProposeMerge.mockResolvedValue({ mergedContent: '# AI merged', confidence: 'high' });

    const { getByTestId } = render(<ConflictResolverScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('conflict-resolver.ai-fix'));
    });

    expect(getByTestId('conflict-resolver.ai-fix').props.accessibilityState.disabled).toBe(true);
  });

  it('Accept & Push commits an AI-merged file via writeAndCommit and mergeCommit', async () => {
    mockSelectedModel = TEST_MODEL;
    mockProposeMerge.mockResolvedValue({ mergedContent: '# AI merged', confidence: 'high' });

    const { getByTestId, getByText } = render(<ConflictResolverScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('conflict-resolver.ai-fix'));
    });
    expect(getByText('# AI merged')).toBeTruthy();

    fireEvent.press(getByText('Save merged'));

    const commitButton = alertButtons.find((b) => b.text === 'Commit & Push');
    expect(commitButton).toBeTruthy();

    await act(async () => {
      commitButton?.onPress?.();
    });

    expect(mockWriteAndCommit).toHaveBeenCalledTimes(1);
    const writeCall = mockWriteAndCommit.mock.calls[0][0];
    expect(writeCall).toMatchObject({
      repoPath: 'owner/repo',
      branch: 'main',
      filePath: 'notes/a.md',
      content: '# AI merged',
      push: false,
    });

    expect(mockMergeCommit).toHaveBeenCalledTimes(1);
    const mergeCall = mockMergeCommit.mock.calls[0][0];
    expect(mergeCall).toMatchObject({
      repoPath: 'owner/repo',
      branch: 'main',
      message: 'Merge remote changes into main',
    });

    expect(mockRemoveConflict).toHaveBeenCalledWith('owner/repo', 'main');
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('hides AI-fix for binary conflicts and without a model, keeping manual tabs', () => {
    mockSelectedModel = TEST_MODEL;
    mockConflictSet = makeConflictSet([
      makeFile({ format: 'binary', localContent: null, remoteContent: null, baseContent: null }),
    ]);

    const binaryRender = render(<ConflictResolverScreen />);
    expect(binaryRender.queryByTestId('conflict-resolver.ai-fix')).toBeNull();
    expect(binaryRender.getByText('Keep mine')).toBeTruthy();
    expect(binaryRender.getByText('Keep theirs')).toBeTruthy();
    binaryRender.unmount();

    mockConflictSet = makeConflictSet([makeFile()]);
    mockSelectedModel = undefined;
    const noModelRender = render(<ConflictResolverScreen />);
    expect(noModelRender.queryByTestId('conflict-resolver.ai-fix')).toBeNull();
    expect(noModelRender.getByText('Save merged')).toBeTruthy();
  });
});
