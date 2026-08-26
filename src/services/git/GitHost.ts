export interface GitHostUser {
  id: number;
  login: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
}

export interface GitHostBranch {
  name: string;
  isDefault?: boolean;
}

export interface GitHostContent {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size?: number;
  sha?: string;
  downloadUrl?: string | null;
}

export interface GitHostTreeEntry {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
}

export type GitHostItemState = 'open' | 'closed' | 'all';

export interface GitHostIssue {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  webUrl: string;
  labels: string[];
  author?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface GitHostPullRequest {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  webUrl: string;
  headBranch: string;
  baseBranch: string;
  author?: string;
  draft?: boolean;
  createdAt: string;
}

export type GitHostShaResult =
  | { kind: 'found'; sha: string }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string };

export interface GitHostService {
  readonly provider: string;
  isAuthenticated(): boolean;
  getUser(): unknown;
  initialize(): Promise<void>;
  getDefaultBranch(owner: string, repo: string): Promise<string | null>;
  listBranches(owner: string, repo: string): Promise<GitHostBranch[]>;
  getTreeRecursive(owner: string, repo: string, ref: string): Promise<GitHostTreeEntry[]>;
  listContents(owner: string, repo: string, path: string, ref?: string): Promise<GitHostContent[]>;
  getFileText(owner: string, repo: string, path: string, ref?: string): Promise<string | null>;
  listIssues(owner: string, repo: string, state?: GitHostItemState): Promise<GitHostIssue[]>;
  listPullRequests(owner: string, repo: string, state?: GitHostItemState): Promise<GitHostPullRequest[]>;
}

export interface GitHostWriteService {
  getFileSha(owner: string, repo: string, path: string, ref?: string): Promise<GitHostShaResult>;
  updateFile(owner: string, repo: string, path: string, content: string, commitMessage: string, branch: string, knownSha?: string): Promise<string>;
  deleteFile(owner: string, repo: string, path: string, commitMessage: string, sha: string, branch: string): Promise<void>;
  uploadBinaryFile(owner: string, repo: string, path: string, base64Content: string, commitMessage: string, branch: string): Promise<string>;
}

export type GitHostProvider = 'github' | 'gitlab' | 'gitea' | 'forgejo';

export const GIT_HOST_LABELS: Record<GitHostProvider, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  gitea: 'Gitea',
  forgejo: 'Forgejo',
};
