/**
 * Shared types for Git2 provider REST clients.
 * All provider clients use these common interfaces.
 */

// ─── Provider identifier ──────────────────────────────────────────────────────

export type ProviderKind = 'github' | 'gitlab' | 'gitea' | 'forgejo';

export type ProviderId = ProviderKind;

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  baseUrl: string;
  icon?: string;
}

// ─── Common item state ─────────────────────────────────────────────────────────

export type ItemState = 'open' | 'closed' | 'all';

export const ITEM_STATES: ItemState[] = ['open', 'closed', 'all'];

// ─── Provider-agnostic canonical types ─────────────────────────────────────────

export interface ProviderUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

export interface ProviderIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  webUrl: string;
  labels: string[];
  author: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderPullRequest {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  webUrl: string;
  headBranch: string;
  baseBranch: string;
  author: string | undefined;
  draft: boolean;
  createdAt: string;
}

export interface ProviderComment {
  id: number;
  body: string;
  author: string | undefined;
  createdAt: string;
  updatedAt: string;
  webUrl?: string;
}

export interface ProviderRelease {
  id: number;
  tagName: string;
  name: string | null;
  body: string | null;
  webUrl: string;
  draft: boolean;
  prerelease: boolean;
  publishedAt: string | null;
  author: string | undefined;
}

export interface ProviderWorkflowRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: string | null;
  webUrl: string;
  headBranch: string;
  headSha: string;
  event: string;
  runNumber: number;
  createdAt: string;
  updatedAt: string;
  actor: string | undefined;
}

// ─── Input types ──────────────────────────────────────────────────────────────

export interface CreateIssueInput {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
}

export interface CreateCommentInput {
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
}

export interface CreatePullRequestInput {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  head: string;
  base: string;
}

export interface ReviewInput {
  owner: string;
  repo: string;
  pullNumber: number;
  body: string;
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
}

export interface GetWorkflowRunsInput {
  owner: string;
  repo: string;
  branch?: string;
  status?: string;
  perPage?: number;
}

export interface GetReleasesInput {
  owner: string;
  repo: string;
  perPage?: number;
}

// ─── Provider client interface ────────────────────────────────────────────────

export interface ProviderClient {
  readonly kind: ProviderKind;

  getAuthenticatedUser(): Promise<ProviderUser | null>;
  isAuthenticated(): boolean;

  listIssues(owner: string, repo: string, state?: ItemState): Promise<ProviderIssue[]>;
  createIssue(input: CreateIssueInput): Promise<ProviderIssue | null>;

  listComments(owner: string, repo: string, issueNumber: number): Promise<ProviderComment[]>;
  createComment(input: CreateCommentInput): Promise<ProviderComment | null>;

  listPullRequests(owner: string, repo: string, state?: ItemState): Promise<ProviderPullRequest[]>;
  createPullRequest(input: CreatePullRequestInput): Promise<ProviderPullRequest | null>;
  reviewPullRequest(input: ReviewInput): Promise<ProviderComment | null>;

  listReleases?(owner: string, repo: string, perPage?: number): Promise<ProviderRelease[]>;
  listWorkflowRuns?(input: GetWorkflowRunsInput): Promise<ProviderWorkflowRun[]>;
}

// ─── GitHub wire types ────────────────────────────────────────────────────────

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  name: string;
  email: string;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  html_url: string;
  description: string;
  private: boolean;
  size?: number;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  html_url: string;
  milestone: GitHubMilestone | null;
  labels: Array<{ name: string; color: string }>;
  assignees: Array<{ login: string; avatar_url: string }>;
  created_at: string;
  updated_at: string;
}

export interface GitHubMilestone {
  id: number;
  number: number;
  title: string;
  description: string;
  state: 'open' | 'closed';
  html_url: string;
  open_issues: number;
  closed_issues: number;
  due_on: string | null;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  html_url: string;
  user: { login: string };
  draft: boolean;
  created_at: string;
  head: { ref: string; sha: string };
  base: { ref: string };
}

export interface GitHubPullRequestDiff {
  files: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
  }>;
}

export interface GitHubReviewInput {
  owner: string;
  repo: string;
  pull_number: number;
  body: string;
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
}

export interface GitHubReview {
  id: number;
  user: { login: string };
  body: string;
  state: string;
  submitted_at: string;
  html_url?: string;
}

export interface GitHubComment {
  id: number;
  body: string;
  user: { login: string };
  created_at: string;
  updated_at: string;
  html_url: string;
}

export interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  target_commitish: string;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string;
}

export interface GitHubWorkflowRun {
  id: number;
  name: string;
  head_branch: string;
  head_sha: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_number: number;
}

// ─── GitLab wire types ────────────────────────────────────────────────────────

export interface GitLabUser {
  id: number;
  username: string;
  name: string;
  email?: string;
  avatar_url?: string | null;
}

export interface GitLabProject {
  id: number;
  path_with_namespace: string;
  name: string;
  default_branch?: string;
  web_url: string;
  visibility: 'private' | 'internal' | 'public';
}

export interface GitLabMR {
  iid: number;
  title: string;
  state: 'opened' | 'closed' | 'merged' | 'locked' | string;
  web_url: string;
  source_branch: string;
  target_branch: string;
  draft?: boolean;
  author?: { username?: string };
  created_at: string;
}

export interface GitLabIssue {
  iid: number;
  title: string;
  state: 'opened' | 'closed' | string;
  web_url: string;
  labels?: string[];
  author?: { username?: string };
  created_at: string;
  updated_at?: string;
  description?: string;
}

export interface GitLabNote {
  id: number;
  body: string;
  author?: { username?: string };
  created_at: string;
  updated_at: string;
}

export interface GitLabRelease {
  tag_name: string;
  name: string;
  description: string;
  html_url: string;
  target_commitish: string;
  created_at: string;
  released_at: string;
}

export interface GitLabPipeline {
  id: number;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled' | 'skipped';
  web_url: string;
  ref: string;
  sha: string;
  created_at: string;
  updated_at: string;
}

// ─── Gitea wire types ─────────────────────────────────────────────────────────

export interface GiteaUser {
  id: number;
  login: string;
  full_name?: string;
  email?: string;
  avatar_url?: string;
}

export interface GiteaRepo {
  id: number;
  name: string;
  full_name: string;
  default_branch?: string;
  owner?: { login?: string };
}

export interface GiteaPR {
  number: number;
  title: string;
  state: 'open' | 'closed' | string;
  html_url: string;
  head?: { ref?: string };
  base?: { ref?: string };
  user?: { login?: string };
  draft?: boolean;
  created_at: string;
}

export interface GiteaIssue {
  number: number;
  title: string;
  state: 'open' | 'closed' | string;
  html_url: string;
  labels?: Array<{ name: string; color?: string }>;
  user?: { login?: string };
  created_at: string;
  updated_at?: string;
  pull_request?: { url?: string } | null;
}

export interface GiteaComment {
  id: number;
  body: string;
  user?: { login?: string };
  created_at: string;
  updated_at: string;
}

export interface GiteaRelease {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  target_commitish: string;
  created_at: string;
  published_at: string;
}

export interface GiteaWorkflowRun {
  id: number;
  name: string;
  head_branch: string;
  head_sha: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
}

// ─── AI tool allowlist types ───────────────────────────────────────────────────

export type GitHubToolName =
  | 'list_repos'
  | 'list_issues'
  | 'create_issue'
  | 'list_pull_requests'
  | 'create_pull_request'
  | 'get_pull_request_diff'
  | 'review_pull_request'
  | 'list_releases'
  | 'get_release'
  | 'list_workflow_runs'
  | 'trigger_workflow';

export type GitLabToolName =
  | 'list_projects'
  | 'list_issues'
  | 'create_issue'
  | 'list_merge_requests'
  | 'create_merge_request'
  | 'list_releases'
  | 'get_release'
  | 'list_pipelines'
  | 'trigger_pipeline';

export type GiteaToolName =
  | 'list_repos'
  | 'list_issues'
  | 'create_issue'
  | 'list_pull_requests'
  | 'create_pull_request'
  | 'list_releases'
  | 'get_release'
  | 'list_actions_runs'
  | 'trigger_actions';

export type ProviderToolName = GitHubToolName | GitLabToolName | GiteaToolName;

export interface ToolAllowlist {
  github: Set<GitHubToolName>;
  gitlab: Set<GitLabToolName>;
  gitea: Set<GiteaToolName>;
  forgejo: Set<GiteaToolName>;
}

// ─── Mutation confirmation ────────────────────────────────────────────────────

export interface MutationConfirmation {
  type: string;
  description: string;
  targetId?: string;
  details: Record<string, unknown>;
  provider: ProviderId;
}

// ─── Backward-compat aliases ─────────────────────────────────────────────────

export type GitHubCreateIssueInput = CreateIssueInput;
