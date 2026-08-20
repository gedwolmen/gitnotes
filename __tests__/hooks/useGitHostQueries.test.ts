import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';

const mockListPullRequests = jest.fn();
const mockListIssues = jest.fn();

const mockService = {
  listPullRequests: (...args: unknown[]) => mockListPullRequests(...args),
  listIssues: (...args: unknown[]) => mockListIssues(...args),
};

jest.mock('../../src/services/git/gitHostFactory', () => ({
  getGitHostService: () => mockService,
}));

import { useGitHostPullRequests, useGitHostIssues } from '../../src/hooks/useGitHostQueries';

const makeWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return Wrapper;
};

beforeEach(() => {
  mockListPullRequests.mockReset();
  mockListIssues.mockReset();
});

describe('useGitHostPullRequests', () => {
  it('resolves with normalized pull request fixtures', async () => {
    mockListPullRequests.mockResolvedValue([
      {
        id: 1,
        number: 7,
        title: 'Add hub',
        state: 'open',
        webUrl: 'https://github.com/o/r/pull/7',
        headBranch: 'feat/x',
        baseBranch: 'main',
        author: 'octocat',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
    const { result } = renderHook(() => useGitHostPullRequests('github', 'o', 'r', 'open'), {
      wrapper: makeWrapper(),
    });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockListPullRequests).toHaveBeenCalledWith('o', 'r', 'open');
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].webUrl).toBe('https://github.com/o/r/pull/7');
  });

  it('does not fire the query when owner or repo is empty', () => {
    const wrapper = makeWrapper();
    renderHook(() => useGitHostPullRequests('github', '', 'r'), { wrapper });
    expect(mockListPullRequests).not.toHaveBeenCalled();
    renderHook(() => useGitHostPullRequests('github', 'o', ''), { wrapper });
    expect(mockListPullRequests).not.toHaveBeenCalled();
  });

  it('uses open as default state', async () => {
    mockListPullRequests.mockResolvedValue([]);
    const { result } = renderHook(() => useGitHostPullRequests('gitlab', 'o', 'r'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockListPullRequests).toHaveBeenCalledWith('o', 'r', 'open');
  });
});

describe('useGitHostIssues', () => {
  it('resolves with normalized issue fixtures', async () => {
    mockListIssues.mockResolvedValue([
      {
        id: 9,
        number: 9,
        title: 'Bug',
        state: 'open',
        webUrl: 'https://github.com/o/r/issues/9',
        labels: ['bug'],
        author: 'reporter',
        createdAt: '2026-02-01T00:00:00Z',
      },
    ]);
    const { result } = renderHook(() => useGitHostIssues('github', 'o', 'r', 'open'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockListIssues).toHaveBeenCalledWith('o', 'r', 'open');
    expect(result.current.data?.[0].labels).toEqual(['bug']);
  });

  it('does not fire the query when owner or repo is empty', () => {
    renderHook(() => useGitHostIssues('gitea', '', 'r'), { wrapper: makeWrapper() });
    expect(mockListIssues).not.toHaveBeenCalled();
  });
});
