// Stub for deleted GitLabService module

import type { GitHostUser } from './GitHost';

export const gitLabService = {
  getUser: (): GitHostUser | null => null,
  isAuthenticated: () => false,
  getBaseUrl: () => '',
  initialize: async () => {},
  setToken: async (_token: string, _baseUrl?: string): Promise<GitHostUser | null> => null,
  clearToken: async () => {},
  setBaseUrl: (_url: string) => {},
};
