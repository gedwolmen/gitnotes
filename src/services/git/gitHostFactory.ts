// Stub for deleted gitHostFactory module

import type { GitHostProvider, GitHostContent, GitHostUser, GitHostPullRequest, GitHostIssue, GitHostItemState } from './GitHost';

export const getGitHostService = (_provider: GitHostProvider) => ({
  listContents: async (_owner: string, _repo: string, _path: string, _branch?: string): Promise<GitHostContent[]> => [],
  getAuthenticatedUser: async (): Promise<GitHostUser | null> => null,
  setToken: async (_token: string, _baseUrl?: string): Promise<GitHostUser | null> => null,
  listPullRequests: async (_owner: string, _repo: string, _state: GitHostItemState): Promise<GitHostPullRequest[]> => [],
  listIssues: async (_owner: string, _repo: string, _state: GitHostItemState): Promise<GitHostIssue[]> => [],
});

// Export the host services as named exports
export const giteaHostService = {
  getUser: () => null,
  isAuthenticated: () => false,
  getBaseUrl: () => '',
  initialize: async () => {},
  setToken: async (_token: string, _baseUrl?: string) => null,
  clearToken: async () => {},
  setBaseUrl: (_url: string) => {},
};

export const forgejoHostService = {
  getUser: () => null,
  isAuthenticated: () => false,
  getBaseUrl: () => '',
  initialize: async () => {},
  setToken: async (_token: string, _baseUrl?: string) => null,
  clearToken: async () => {},
  setBaseUrl: (_url: string) => {},
};
