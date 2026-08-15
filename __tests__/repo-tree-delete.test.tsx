import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import type { AlertButton } from 'react-native';
import { act, fireEvent, type RenderResult } from '@testing-library/react-native';

import { renderWithTheme } from './helpers/renderWithTheme';
import { RepoTreeItem } from '../src/components/repo/RepoTreeItem';
import { deleteDirectory, type TreeNode } from '../src/components/repo/repoTreeShared';
import { GitHubService } from '../src/services/GitHubService';
import { HapticService } from '../src/utils/haptics';

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

const mockGitHubService = jest.mocked(GitHubService);
const mockHaptics = jest.mocked(HapticService);

const fileNode: TreeNode = { name: 'note.md', path: 'notes/note.md', type: 'file', size: 128 };
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
  // ContextMenu defers item callbacks ~350ms on iOS so the parent modal
  // can dismiss first — let the real timer fire.
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

beforeEach(() => {
  jest.clearAllMocks();
  mockGitHubService.getRepoContents.mockResolvedValue([]);
  mockGitHubService.getFileSha.mockResolvedValue({ kind: 'found', sha: 'default' });
  mockGitHubService.deleteFile.mockResolvedValue({ content: null, commit: { sha: '' } });
});

describe('repo tree delete correctness', () => {
  it('keeps the row and does not confirm deletion when sha lookup errors', async () => {
    const onChildDeleted = jest.fn();
    const onRefresh = jest.fn();
    mockGitHubService.getFileSha.mockResolvedValue({ kind: 'error', message: 'network' });
    const tree = renderTreeItem(fileNode, { onChildDeleted, onRefresh });

    await openMenuAndChooseDelete(tree, 'repo-tree-item.button.file-press');
    await confirmLatestAlert('Delete');

    expect(mockGitHubService.deleteFile).not.toHaveBeenCalled();
    expect(onChildDeleted).not.toHaveBeenCalled();
    expect(mockHaptics.success).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('Delete Failed', 'network');
    expect(tree.getAllByTestId('repo-tree-item.button.file-press').length).toBeGreaterThan(0);
  });

  it('soft-succeeds deletion when the file is already gone upstream', async () => {
    const onChildDeleted = jest.fn();
    const onRefresh = jest.fn();
    mockGitHubService.getFileSha.mockResolvedValue({ kind: 'not-found' });
    const tree = renderTreeItem(fileNode, { onChildDeleted, onRefresh });

    await openMenuAndChooseDelete(tree, 'repo-tree-item.button.file-press');
    await confirmLatestAlert('Delete');

    expect(mockGitHubService.deleteFile).not.toHaveBeenCalled();
    expect(onChildDeleted).toHaveBeenCalledTimes(1);
    expect(onChildDeleted).toHaveBeenCalledWith('notes/note.md');
    expect(mockHaptics.success).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('deletes with the looked-up sha when the file exists', async () => {
    const onChildDeleted = jest.fn();
    const onRefresh = jest.fn();
    mockGitHubService.getFileSha.mockResolvedValue({ kind: 'found', sha: 's' });
    const tree = renderTreeItem(fileNode, { onChildDeleted, onRefresh });

    await openMenuAndChooseDelete(tree, 'repo-tree-item.button.file-press');
    await confirmLatestAlert('Delete');

    expect(mockGitHubService.deleteFile).toHaveBeenCalledTimes(1);
    expect(mockGitHubService.deleteFile).toHaveBeenCalledWith(
      'owner',
      'repo',
      'notes/note.md',
      'Delete: notes/note.md',
      's',
      'main',
    );
    expect(onChildDeleted).toHaveBeenCalledTimes(1);
    expect(onChildDeleted).toHaveBeenCalledWith('notes/note.md');
    expect(mockHaptics.success).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('aggregates folder delete failures into one alert instead of dropping them', async () => {
    mockFileListing(['docs/a.md', 'docs/b.md', 'docs/c.md']);
    mockGitHubService.getFileSha.mockImplementation(async (_owner, _repo, path) => ({
      kind: 'found',
      sha: `sha-${path}`,
    }));
    mockGitHubService.deleteFile.mockImplementation(async (_owner, _repo, path) => {
      if (path === 'docs/c.md') throw new Error('boom');
      return { content: null, commit: { sha: '' } };
    });

    const result = await deleteDirectory('owner', 'repo', 'main', 'docs');
    expect(result.deleted).toEqual(['docs/a.md', 'docs/b.md']);
    expect(result.failed).toEqual([{ path: 'docs/c.md', error: 'boom' }]);

    const onChildDeleted = jest.fn();
    const onRefresh = jest.fn();
    const tree = renderTreeItem(dirNode, { onChildDeleted, onRefresh });

    await openMenuAndChooseDelete(tree, 'repo-tree-item.button.toggle');
    await confirmLatestAlert('Delete');

    expect(alertSpy).toHaveBeenCalledWith('Delete Failed', 'Deleted 2, failed 1');
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onChildDeleted).not.toHaveBeenCalled();
    expect(mockHaptics.success).not.toHaveBeenCalled();
  });
});
