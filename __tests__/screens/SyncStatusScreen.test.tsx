import React from 'react';
import { Alert } from 'react-native';
import { act, render, fireEvent } from '@testing-library/react-native';

import SyncStatusScreen from '../../src/screens/SyncStatusScreen';
import type { ConflictSet, FileConflict } from '../../src/services/conflict/types';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

const mockConflictState: { conflicts: ConflictSet[] } = { conflicts: [] };
const mockUpdateConflict = jest.fn();
const mockProposeMerge = jest.fn();

let mockSelectedModel: { id: string } | undefined;

jest.mock('../../src/stores/conflictStore', () => ({
  useConflictStore: Object.assign(
    (selector: (state: typeof mockConflictState) => unknown) => selector(mockConflictState),
    { getState: () => ({ updateConflict: mockUpdateConflict }) },
  ),
}));

jest.mock('../../src/stores/aiStore', () => ({
  useAIStore: Object.assign(
    (selector: (state: { getSelectedModel: () => { id: string } | undefined }) => unknown) =>
      selector({ getSelectedModel: () => mockSelectedModel }),
    {
      getState: () => ({ getSelectedModel: () => mockSelectedModel, providers: [] }),
    },
  ),
}));

jest.mock('../../src/services/conflict/AiConflictResolver', () => ({
  proposeMerge: (...args: unknown[]) => mockProposeMerge(...args),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => ({ params: undefined }),
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
    ScreenHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) =>
      React.createElement(
        View,
        { testID: 'sync-conflicts.header' },
        React.createElement(Text, null, title),
        actions,
      ),
  };
});

const makeFile = (path: string, overrides: Partial<FileConflict> = {}): FileConflict => ({
  path,
  kind: 'both-changed-different',
  format: 'text',
  localContent: 'local',
  remoteContent: 'remote',
  baseContent: 'base',
  mergedContent: null,
  localSha: 'abc123',
  remoteSha: 'def456',
  autoResolved: false,
  ...overrides,
});

const makeConflictSet = (repoPath: string, branch: string, files: FileConflict[]): ConflictSet => ({
  repoPath,
  branch,
  localRef: `refs/heads/${branch}`,
  remoteRef: `refs/remotes/origin/${branch}`,
  mergeBaseRef: `refs/heads/${branch}~1`,
  files,
  detectedAt: 1000,
});

const sixFiles = [
  makeFile('notes/a.md'),
  makeFile('notes/b.md'),
  makeFile('notes/c.md'),
  makeFile('notes/d.md'),
  makeFile('notes/e.md'),
  makeFile('notes/f.md'),
];

describe('SyncStatusScreen', () => {
  beforeEach(() => {
    mockConflictState.conflicts = [];
    mockSelectedModel = undefined;
    mockNavigate.mockClear();
    mockGoBack.mockClear();
    mockUpdateConflict.mockClear();
    mockProposeMerge.mockReset();
  });

  it('renders one section per conflict set with repo name and branch', () => {
    mockConflictState.conflicts = [
      makeConflictSet('owner/repo-a', 'main', sixFiles),
      makeConflictSet('owner/repo-b', 'develop', [makeFile('notes/b.md')]),
    ];

    const { getByTestId, getByText } = render(<SyncStatusScreen />);

    expect(getByTestId('sync-conflicts.section.owner/repo-a::main')).toBeTruthy();
    expect(getByTestId('sync-conflicts.section.owner/repo-b::develop')).toBeTruthy();
    expect(getByText('repo-a')).toBeTruthy();
    expect(getByText('repo-b')).toBeTruthy();
    expect(getByText('main')).toBeTruthy();
    expect(getByText('develop')).toBeTruthy();
  });

  it('shows the Manage conflicts button only on the section with 5+ files', () => {
    mockConflictState.conflicts = [
      makeConflictSet('owner/repo-a', 'main', sixFiles),
      makeConflictSet('owner/repo-b', 'develop', [makeFile('notes/b.md')]),
    ];

    const { getByTestId, queryByTestId } = render(<SyncStatusScreen />);

    expect(getByTestId('sync-conflicts.manage.owner/repo-a::main')).toBeTruthy();
    expect(queryByTestId('sync-conflicts.manage.owner/repo-b::develop')).toBeNull();
  });

  it('navigates to ConflictResolver with the correct params on file tap', () => {
    mockConflictState.conflicts = [
      makeConflictSet('owner/repo-a', 'main', [makeFile('notes/a.md'), makeFile('notes/b.md')]),
    ];

    const { getByTestId } = render(<SyncStatusScreen />);

    fireEvent.press(getByTestId('sync-conflicts.file.owner/repo-a::main.notes/b.md'));

    expect(mockNavigate).toHaveBeenCalledWith('ConflictResolver', {
      repoPath: 'owner/repo-a',
      branch: 'main',
      filePath: 'notes/b.md',
    });
  });

  it('renders the empty state when the store has no conflicts', () => {
    const { getByText } = render(<SyncStatusScreen />);

    expect(getByText('No unresolved conflicts')).toBeTruthy();
  });

  it('shows the AI-fix remaining button only when a model is configured', () => {
    const { queryByTestId, rerender } = render(<SyncStatusScreen />);
    expect(queryByTestId('sync-conflicts.ai-fix')).toBeNull();

    mockSelectedModel = { id: 'test-model' };
    rerender(<SyncStatusScreen />);

    expect(queryByTestId('sync-conflicts.ai-fix')).toBeTruthy();
  });

  it('runs the default AI-fix batch and shows a summary alert', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockSelectedModel = { id: 'test-model' };

    const { getByTestId } = render(<SyncStatusScreen />);
    await act(async () => {
      fireEvent.press(getByTestId('sync-conflicts.ai-fix'));
    });

    expect(alertSpy).toHaveBeenCalledWith('AI conflict fixing', 'AI fixed 0 of 0 conflicts');
    alertSpy.mockRestore();
  });

  it('batch AI-fix resolves high-confidence files and reports AI fixed N of M', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockSelectedModel = { id: 'test-model' };

    mockConflictState.conflicts = [
      makeConflictSet('owner/repo-a', 'main', [
        makeFile('notes/a.md'),
        makeFile('notes/b.md'),
        makeFile('assets/logo.png', { format: 'binary' }),
      ]),
    ];

    mockProposeMerge
      .mockResolvedValueOnce({ mergedContent: 'merged-a', confidence: 'high' })
      .mockResolvedValueOnce({ mergedContent: null, confidence: 'low', note: 'no usable merge' });

    const { getByTestId } = render(<SyncStatusScreen />);
    await act(async () => {
      fireEvent.press(getByTestId('sync-conflicts.ai-fix'));
    });

    expect(mockProposeMerge).toHaveBeenCalledTimes(2);
    expect(alertSpy).toHaveBeenCalledWith('AI conflict fixing', 'AI fixed 1 of 2 conflicts');

    expect(mockUpdateConflict).toHaveBeenCalledTimes(1);
    const [repoPath, branch, updater] = mockUpdateConflict.mock.calls[0] as [
      string,
      string,
      (c: ConflictSet) => ConflictSet,
    ];
    expect(repoPath).toBe('owner/repo-a');
    expect(branch).toBe('main');
    const updatedSet = updater(mockConflictState.conflicts[0]);
    expect(updatedSet.files.find((f) => f.path === 'notes/a.md')?.mergedContent).toBe('merged-a');

    alertSpy.mockRestore();
  });

  it('calls the onAiFixRemaining prop when AI-fix is pressed', () => {
    const onAiFixRemaining = jest.fn();
    mockSelectedModel = { id: 'test-model' };

    const { getByTestId } = render(<SyncStatusScreen onAiFixRemaining={onAiFixRemaining} />);
    fireEvent.press(getByTestId('sync-conflicts.ai-fix'));

    expect(onAiFixRemaining).toHaveBeenCalledTimes(1);
  });
});
