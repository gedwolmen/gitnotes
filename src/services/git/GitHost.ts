// Stub for deleted GitHost module

export type GitHostProvider = 'github' | 'gitlab' | 'gitea' | 'forgejo';

export type GitHostItemState = 'open' | 'closed';

export const GIT_HOST_API_BASES: Record<GitHostProvider, string> = {
  github: 'https://api.github.com',
  gitlab: 'https://gitlab.com/api/v4',
  gitea: '',
  forgejo: '',
};

export const GIT_HOST_LABELS: Record<GitHostProvider, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  gitea: 'Gitea',
  forgejo: 'Forgejo',
};

export interface GitHostUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url?: string | null;
  full_name?: string | null;
  avatarUrl?: string | null;
}

export interface GitHostContent {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size?: number;
  sha?: string;
}

export interface GitHostIssue {
  id: number;
  number: number;
  title: string;
  state: GitHostItemState;
  webUrl: string;
  author?: string;
}

export interface GitHostPullRequest {
  id: number;
  number: number;
  title: string;
  state: GitHostItemState;
  webUrl: string;
  author?: string;
  draft?: boolean;
}
