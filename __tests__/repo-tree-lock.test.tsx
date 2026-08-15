import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert, RefreshControl, StyleSheet } from 'react-native';
import type { AlertButton } from 'react-native';
import { act, fireEvent, type RenderResult } from '@testing-library/react-native';

import { renderWithTheme } from './helpers/renderWithTheme';
import { RepoTreeItem } from '../src/components/repo/RepoTreeItem';
import { type TreeNode } from '../src/components/repo/repoTreeShared';
import { GitHubService } from '../src/services/GitHubService';
import { HapticService } from '../src/utils/haptics';
import { GitSyncGate } from '../src/services/git/GitSyncGate';
import { useGitOperationStore, gitOperationRegistry, GIT_OP_ALL_REPOS } from '../src/stores/gitOperationStore';
import { useNoteStore } from '../src/stores/noteStore';
import { StorageService } from '../src/services/StorageService';
import { SyncEngineService } from '../src/services/SyncEngineService';
import { batchDeleteFiles } from '../src/services/git/BatchGitOperations';
import ExploreScreen from '../src/screens/ExploreScreen';

jest.mock('../src/services/GitHubService', () => ({
  GitHubService: {
    getRepoContents: jest.fn(),
    getFileContent: jest.fn(),
    getFileSha: jest.fn(),
    deleteFile: jest.fn(),
    moveFile: jest.fn(),
  },
}));

jest.mock('../src/utils/haptics', () => ({
  HapticService: {
    light: jest.fn(),
    medium: jest.fn(),
    heavy: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
    selection: jest.fn(),
  },
}));

jest.mock('../src/services/SyncEngineService', () => ({
  SyncEngineService: { getMode: jest.fn(async () => 'api') },
}));

jest.mock('../src/services/git/BatchGitOperations', () => ({
  batchDeleteFiles: jest.fn(),
}));

jest.mock('../src/services/StorageService', () => ({
  StorageService: {
    deleteNote: jest.fn(async () => true),
    getAllNotes: jest.fn(async () => []),
    getSavedRepositories: jest.fn(async () => []),
  },
}));

jest.mock('../src/contexts/RepoContext', () => ({
  useRepos: () => ({
    repositories: [{ id: 1, name: 'r', path: 'github:owner/repo', branch: 'main' }],
    refreshRepos: jest.fn(async () => undefined),
  }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
  useIsFocused: () => true,
}));

jest.mock('../src/components/SearchBar', () => {
  const { TextInput } = require('react-native');
  return ({ value, onChangeText }: { value: string; onChangeText: (value: string) => void }) => (
    <TextInput value={value} onChangeText={onChangeText} />
  );
});

jest.mock('../src/components/ui', () => {
  const actual = jest.requireActual('../src/components/ui');
  const { Text, TouchableOpacity } = require('react-native');
  return {
    ...actual,
    ScreenHeader: ({ title }: { title: string }) => <Text>{title}</Text>,
    IconButton: ({ children, onPress }: { children?: React.ReactNode; onPress?: () => void }) => (
      <TouchableOpacity onPress={onPress}>{children}</TouchableOpacity>
    ),
    useScreenHeaderHeight: () => 60,
    SCREEN_HEADER_BASE_HEIGHT: 60,
    SCREEN_HEADER_SUBTITLE_HEIGHT: 88,
    useTabBarHeight: () => 84,
    TAB_BAR_BASE_HEIGHT: 84,
    EmptyState: () => null,
  };
});

jest.mock('../src/components/ui/OfflineBanner', () => ({
  OfflineBanner: () => null,
}));

jest.mock('../src/components/RepoFileTree', () => ({
  __esModule: true,
  default: () => null,
}));

const mockGitHubService = jest.mocked(GitHubService);
const mockHaptics = jest.mocked(HapticService);
const mockSyncEngine = jest.mocked(SyncEngineService);
const mockBatchDelete = jest.mocked(batchDeleteFiles);
const mockStorageDeleteNote = jest.mocked(StorageService.deleteNote);

const fileNode: TreeNode = { name: 'note.md', path: 'notes/note.md', type: 'file', size: 128 };
const fooFileNode: TreeNode = { name: 'foo.md', path: 'notes/foo.md', type: 'file', size: 10 };
const dirNode: TreeNode = { name: 'docs', path: 'docs', type: 'dir' };

const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

function renderTreeItem(
  node: TreeNode,
  callbacks: { onRefresh?: () => void; onChildDeleted?: (path: string) => void } = {},
): RenderResult {
  return renderWithTheme(
    <RepoTreeItem
      node={node}
      owner="owner"
      repo="repo"
      branch="main"
      level={0}
      onFilePress={jest.fn()}
      onRefresh={callbacks.onRefresh}
      onChildDeleted={callbacks.onChildDeleted}
    />,
  );
}

async function flushDeferredMenuAction(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 450));
  });
}

async function openMenuAndChooseDelete(tree: RenderResult, rowTestID: string): Promise<void> {
  const rows = tree.getAllByTestId(rowTestID);
  fireEvent(rows[rows.length - 1], 'longPress');
  fireEvent.press(tree.getByTestId('context-menu.item.press-delete'));
  await flushDeferredMenuAction();
}

async function confirmLatestAlert(buttonLabel: string): Promise<void> {
  const calls = alertSpy.mock.calls;
  const latest = calls[calls.length - 1];
  const buttons = (latest?.[2] ?? []) as AlertButton[];
  const button = buttons.find((candidate) => candidate.text === buttonLabel);
  expect(button).toBeDefined();
  await act(async () => {
    await button?.onPress?.();
  });
}

function mockFileListing(paths: string[]): void {
  mockGitHubService.getRepoContents.mockResolvedValue(
    paths.map((path) => ({
      name: path.split('/').pop() ?? path,
      path,
      type: 'file' as const,
      size: 10,
      download_url: null,
    })),
  );
}

function runningOps(): ReturnType<typeof useGitOperationStore.getState>['ops'] {
  return useGitOperationStore.getState().ops;
}

beforeEach(async () => {
  jest.clearAllMocks();
  GitSyncGate.__resetForTest();
  useGitOperationStore.setState({ ops: {} });
  useNoteStore.setState({ notes: [] });
  mockGitHubService.getRepoContents.mockResolvedValue([]);
  mockGitHubService.getFileSha.mockResolvedValue({ kind: 'found', sha: 'default' });
  mockGitHubService.deleteFile.mockResolvedValue({ content: null, commit: { sha: '' } });
  mockSyncEngine.getMode.mockResolvedValue('api');
  mockBatchDelete.mockResolvedValue({ success: true, deleted: [], failed: [] });
  mockStorageDeleteNote.mockResolvedValue(true);
});

describe('repo tree gate-aware locking', () => {
  it('file delete publishes a running registry op + push marker and grays the row until it completes; second delete no-ops', async () => {
    let resolveDelete: ((value: { content: null; commit: { sha: string } }) => void) | undefined;
    mockGitHubService.deleteFile.mockReturnValue(
      new Promise<{ content: null; commit: { sha: string } }>((resolve) => {
        resolveDelete = resolve;
      }),
    );
    const onChildDeleted = jest.fn();
    const onRefresh = jest.fn();
    const tree = renderTreeItem(fileNode, { onChildDeleted, onRefresh });

    await openMenuAndChooseDelete(tree, 'repo-tree-item.button.file-press');
    await confirmLatestAlert('Delete');

    const ops = runningOps();
    const deleteOp = Object.values(ops).find(
      (op) => op.kind === 'delete' && op.repo === 'owner/repo' && op.path === 'notes/note.md',
    );
    expect(deleteOp).toBeDefined();
    expect(deleteOp?.status).toBe('running');
    expect(GitSyncGate.isPushActive('owner/repo')).toBe(true);

    const row = tree.getByTestId('repo-tree-item.row');
    expect(StyleSheet.flatten(row.props.style)?.opacity).toBe(0.45);

    // Second delete press while locked must no-op: long-press is suppressed.
    const rows = tree.getAllByTestId('repo-tree-item.button.file-press');
    fireEvent(rows[rows.length - 1], 'longPress');
    expect(tree.queryByTestId('context-menu.item.press-delete')).toBeNull();
    expect(mockGitHubService.deleteFile).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveDelete?.({ content: null, commit: { sha: '' } });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(GitSyncGate.isPushActive('owner/repo')).toBe(false);
    expect(Object.values(runningOps()).some((op) => op.kind === 'delete')).toBe(false);
    expect(onChildDeleted).toHaveBeenCalledWith('notes/note.md');
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(mockHaptics.success).toHaveBeenCalledTimes(1);
  });

  it('a pull active for the repo suppresses the long-press context menu and grays every row', async () => {
    gitOperationRegistry.begin({
      kind: 'pull',
      repo: GIT_OP_ALL_REPOS,
      status: 'running',
      entityIds: [],
      attempts: 0,
    });

    const tree = renderTreeItem(fileNode);

    const rows = tree.getAllByTestId('repo-tree-item.button.file-press');
    fireEvent(rows[rows.length - 1], 'longPress');
    expect(tree.queryByTestId('context-menu.item.press-delete')).toBeNull();

    const row = tree.getByTestId('repo-tree-item.row');
    expect(StyleSheet.flatten(row.props.style)?.opacity).toBe(0.45);
  });

  it('folder delete in api mode calls batchDeleteFiles once with all collected paths', async () => {
    mockFileListing(['docs/a.md', 'docs/b.md', 'docs/c.md', 'docs/d.md']);
    mockBatchDelete.mockResolvedValue({
      success: true,
      deleted: ['docs/a.md', 'docs/b.md', 'docs/c.md', 'docs/d.md'],
      failed: [],
    });
    const onChildDeleted = jest.fn();
    const onRefresh = jest.fn();
    const tree = renderTreeItem(dirNode, { onChildDeleted, onRefresh });

    await openMenuAndChooseDelete(tree, 'repo-tree-item.button.toggle');
    await confirmLatestAlert('Delete');

    expect(mockBatchDelete).toHaveBeenCalledTimes(1);
    expect(mockBatchDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'owner',
        repo: 'repo',
        branch: 'main',
        paths: ['docs/a.md', 'docs/b.md', 'docs/c.md', 'docs/d.md'],
      }),
    );
    expect(onChildDeleted).toHaveBeenCalledWith('docs');
    expect(GitSyncGate.isPushActive('owner/repo')).toBe(false);
  });

  it('deleting a note file from the tree purges the matching local note via dropByFilePaths', async () => {
    useNoteStore.setState({
      notes: [
        {
          id: 'n1',
          title: 'foo',
          content: 'x',
          createdAt: 1,
          updatedAt: 1,
          tags: [],
          repo: 'owner/repo',
          branch: 'main',
          filePath: 'notes/foo.md',
          format: 'markdown',
        },
      ],
    });

    const onChildDeleted = jest.fn();
    const onRefresh = jest.fn();
    const tree = renderTreeItem(fooFileNode, { onChildDeleted, onRefresh });

    await openMenuAndChooseDelete(tree, 'repo-tree-item.button.file-press');
    await confirmLatestAlert('Delete');

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockStorageDeleteNote).toHaveBeenCalledWith('n1');
    expect(useNoteStore.getState().notes.some((note) => note.id === 'n1')).toBe(false);
  });

  it('Explore disables pull-to-refresh while the gate reports the repo busy', async () => {
    GitSyncGate.markPushActive('owner/repo');

    const tree = renderWithTheme(<ExploreScreen />);

    const controls = tree.UNSAFE_getAllByType(RefreshControl);
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      expect(control.props.enabled).toBe(false);
    }
  });
});
