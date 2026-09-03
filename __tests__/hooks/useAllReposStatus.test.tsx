import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

const mockRepos: { id: string; name: string; path: string }[] = [];
const mockStatusByPath: Record<string, { ahead: number; behind: number; currentBranch: string }> = {};
const mockStatusesByPath: Record<string, { path: string; status: string; staged: boolean }[]> = {};
const mockNotCloned = new Set<string>();

jest.mock('expo-file-system', () => {
  class FakeDirectory {
    name = '';
    list = () => [];
  }
  class FakeFile {
    name = '';
  }
  return { Directory: FakeDirectory, File: FakeFile };
});

jest.mock('@/services/git/GitFsService', () => ({
  GitFsService: {
    workingTreeUri: ({ repoPath }: { repoPath: string }) => `/clones/${repoPath}`,
    isCloned: jest.fn(async ({ repoPath }: { repoPath: string }) => !mockNotCloned.has(repoPath)),
  },
}));

jest.mock('@/stores/repoStore', () => ({
  useRepoStore: (selector: (s: {
    repositories: { id: string; name: string; path: string }[];
    isLoading: boolean;
  }) => unknown) => selector({ repositories: mockRepos, isLoading: false }),
}));

jest.mock('@/services/git/engine/GitEngine', () => ({
  status: jest.fn(async (_repoId: string, repoPath: string) =>
    mockStatusByPath[repoPath] ?? { ahead: 0, behind: 0, currentBranch: 'main', branch: 'main', branches: [] },
  ),
  statuses: jest.fn(async (repoPath: string) => mockStatusesByPath[repoPath] ?? []),
  conflicts: jest.fn(async () => []),
}));

function setRepo(repo: { id: string; name: string; path: string }) {
  if (!mockRepos.find((r) => r.id === repo.id)) mockRepos.push(repo);
}
function setRepoStatus(repoPath: string, status: { ahead: number; behind: number; currentBranch: string }) {
  mockStatusByPath[repoPath] = status;
}
function setRepoFiles(
  repoPath: string,
  files: { path: string; status: string; staged: boolean }[],
) {
  mockStatusesByPath[repoPath] = files;
}

import { useAllReposStatus } from '@/hooks/useAllReposStatus';

function Probe({ onValue }: { onValue: (s: ReturnType<typeof useAllReposStatus>) => void }) {
  const state = useAllReposStatus();
  onValue(state);
  return null;
}

describe('useAllReposStatus (multi-repo state)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepos.length = 0;
    mockNotCloned.clear();
    for (const k of Object.keys(mockStatusByPath)) delete mockStatusByPath[k];
    for (const k of Object.keys(mockStatusesByPath)) delete mockStatusesByPath[k];
  });

  it('aggregates per-repo uncommitted/staged/ahead and finds the latest-changed repo', async () => {
    setRepo({ id: 'a', name: 'a', path: 'owner/a' });
    setRepo({ id: 'b', name: 'b', path: 'owner/b' });
    setRepoStatus('/clones/owner/a', { ahead: 0, behind: 0, currentBranch: 'main' });
    setRepoStatus('/clones/owner/b', { ahead: 3, behind: 0, currentBranch: 'main' });
    setRepoFiles('/clones/owner/a', [
      { path: 'a.md', status: 'Modified', staged: false },
      { path: 'b.md', status: 'Added', staged: true },
    ]);
    setRepoFiles('/clones/owner/b', []);

    let captured: any = null;
    render(<Probe onValue={(s) => (captured = s)} />);

    await waitFor(() => {
      expect(captured).not.toBeNull();
      expect(captured.perRepo.get('a')?.uncommitted).toBe(1);
    });

    const state = captured;
    expect(state.perRepo.get('a')?.uncommitted).toBe(1);
    expect(state.perRepo.get('a')?.staged).toBe(1);
    expect(state.perRepo.get('a')?.ahead).toBe(0);
    expect(state.perRepo.get('b')?.ahead).toBe(3);
    expect(state.perRepo.get('b')?.uncommitted).toBe(0);
    expect(state.totalUncommitted).toBe(1);
    expect(state.totalStaged).toBe(1);
    expect(state.totalAhead).toBe(3);
    expect(state.anyConflicts).toBe(false);
    // repo 'a' is the only one with working-tree changes; it's the latest-changed
    expect(state.latestChangedRepoId).toBe('a');
  });

  it('mode is "conflicts" when any repo has conflicts', async () => {
    const { conflicts } = jest.requireMock('@/services/git/engine/GitEngine');
    setRepo({ id: 'a', name: 'a', path: 'owner/a' });
    (conflicts as jest.Mock).mockResolvedValueOnce([{ path: 'a.md' }]);

    let captured: any = null;
    render(<Probe onValue={(s) => (captured = s)} />);
    await waitFor(() => expect(captured).not.toBeNull());

    expect(captured.perRepo.get('a')?.conflicts).toBe(true);
    expect(captured.anyConflicts).toBe(true);
    expect(captured.mode).toBe('conflicts');
  });

  it('mode is "changes" when there are uncommitted or staged but no ahead and no conflicts', async () => {
    setRepo({ id: 'a', name: 'a', path: 'owner/a' });
    setRepoStatus('/clones/owner/a', { ahead: 0, behind: 0, currentBranch: 'main' });
    setRepoFiles('/clones/owner/a', [
      { path: 'a.md', status: 'Modified', staged: false },
    ]);

    let captured: any = null;
    render(<Probe onValue={(s) => (captured = s)} />);
    await waitFor(() => expect(captured?.mode).toBe('changes'));
    expect(captured.mode).toBe('changes');
  });

  it('mode is "push" when only ahead > 0 and no changes / no conflicts', async () => {
    setRepo({ id: 'a', name: 'a', path: 'owner/a' });
    setRepoStatus('/clones/owner/a', { ahead: 2, behind: 0, currentBranch: 'main' });
    setRepoFiles('/clones/owner/a', []);

    let captured: any = null;
    render(<Probe onValue={(s) => (captured = s)} />);
    await waitFor(() => expect(captured?.mode).toBe('push'));
    expect(captured.mode).toBe('push');
  });

  it('mode is "clean" when every repo has no changes, no ahead, no conflicts', async () => {
    setRepo({ id: 'a', name: 'a', path: 'owner/a' });
    setRepoStatus('/clones/owner/a', { ahead: 0, behind: 0, currentBranch: 'main' });
    setRepoFiles('/clones/owner/a', []);

    let captured: any = null;
    render(<Probe onValue={(s) => (captured = s)} />);
    await waitFor(() => expect(captured?.mode).toBe('clean'));
    expect(captured.mode).toBe('clean');
  });

  it('latestChangedRepoId is null when no repo has uncommitted/staged/ahead/conflicts', async () => {
    setRepo({ id: 'a', name: 'a', path: 'owner/a' });
    setRepoStatus('/clones/owner/a', { ahead: 0, behind: 0, currentBranch: 'main' });
    setRepoFiles('/clones/owner/a', []);

    let captured: any = null;
    render(<Probe onValue={(s) => (captured = s)} />);
    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured.latestChangedRepoId).toBeNull();
  });

  it('probes the engine with the on-disk working tree path, not the canonical repo path', async () => {
    const { status, statuses } = jest.requireMock('@/services/git/engine/GitEngine');
    setRepo({ id: 'a', name: 'a', path: 'owner/a' });
    setRepoStatus('/clones/owner/a', { ahead: 0, behind: 0, currentBranch: 'main' });
    setRepoFiles('/clones/owner/a', [{ path: 'note.md', status: 'Modified', staged: false }]);

    let captured: any = null;
    render(<Probe onValue={(s) => (captured = s)} />);
    await waitFor(() => expect(captured?.totalUncommitted).toBe(1));

    expect(statuses).toHaveBeenCalledWith('/clones/owner/a');
    expect(statuses).not.toHaveBeenCalledWith('owner/a');
    expect(status).toHaveBeenCalledWith('a', '/clones/owner/a');
  });

  it('reports clean without probing the engine when the repo is not cloned', async () => {
    const { status, statuses, conflicts } = jest.requireMock('@/services/git/engine/GitEngine');
    setRepo({ id: 'a', name: 'a', path: 'owner/a' });
    mockNotCloned.add('owner/a');

    let captured: any = null;
    render(<Probe onValue={(s) => (captured = s)} />);
    await waitFor(() => expect(captured?.perRepo?.get('a')).toBeTruthy());

    expect(captured.mode).toBe('clean');
    expect(captured.totalUncommitted).toBe(0);
    expect(statuses).not.toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
    expect(conflicts).not.toHaveBeenCalled();
  });
});