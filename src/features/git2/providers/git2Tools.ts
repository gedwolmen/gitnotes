/**
 * Git2 provider-aware AI tool executor.
 *
 * Wraps the raw provider clients with:
 * - Explicit tool allowlists per provider
 * - Mutation confirmation for write operations
 * - Typed result envelopes
 *
 * Provider reads/writes stay separate from Git2Client file sync.
 *
 * GPL-3.0 derivative of GitSync.
 */

import { GitHubClient } from './github';
import { GitLabClient } from './gitlab';
import { GiteaClient } from './gitea';
import { loadOAuthToken, type StoredOAuthToken } from './oauthStore';
import type {
  ProviderId,
  ProviderKind,
  GitHubToolName,
  GitLabToolName,
  GiteaToolName,
  ProviderToolName,
  MutationConfirmation,
} from './types';

// ─── Default allowlists ───────────────────────────────────────────────────────

const DEFAULT_GITHUB_TOOLS: GitHubToolName[] = [
  'list_repos',
  'list_issues',
  'list_pull_requests',
  'list_releases',
  'get_release',
  'list_workflow_runs',
];

const DEFAULT_GITLAB_TOOLS: GitLabToolName[] = [
  'list_projects',
  'list_issues',
  'list_merge_requests',
  'list_releases',
  'get_release',
  'list_pipelines',
];

const DEFAULT_GITEA_TOOLS: GiteaToolName[] = [
  'list_repos',
  'list_issues',
  'list_pull_requests',
  'list_releases',
  'get_release',
  'list_actions_runs',
];

const MUTATION_TOOLS = new Set<ProviderToolName>([
  'create_issue',
  'create_pull_request',
  'review_pull_request',
  'create_merge_request',
  'trigger_workflow',
  'trigger_pipeline',
  'trigger_actions',
]);

// ─── Result types ─────────────────────────────────────────────────────────────

export interface Git2ToolResult {
  success: boolean;
  requiresConfirmation: boolean;
  data?: unknown;
  error?: string;
  proposedChanges?: MutationConfirmation;
}

type ToolActionMode = 'auto' | 'confirm';

// ─── Client cache ─────────────────────────────────────────────────────────────

const clientCache = new Map<string, GitHubClient | GitLabClient | GiteaClient>();

function clientKey(provider: ProviderId, host: string): string {
  return `${provider}:${host}`;
}

async function getGitHubClient(host: string): Promise<GitHubClient | null> {
  const key = clientKey('github', host);
  const cached = clientCache.get(key) as GitHubClient | undefined;
  if (cached) return cached;

  const token = await loadOAuthToken('github', host);
  if (!token) return null;

  const client = new GitHubClient();
  await client.initialize(token.accessToken);
  clientCache.set(key, client);
  return client;
}

async function getGitLabClient(host: string): Promise<GitLabClient | null> {
  const key = clientKey('gitlab', host);
  const cached = clientCache.get(key) as GitLabClient | undefined;
  if (cached) return cached;

  const token = await loadOAuthToken('gitlab', host);
  if (!token) return null;

  const baseUrl = host === 'gitlab.com' ? 'https://gitlab.com/api/v4' : `https://${host}/api/v4`;
  const client = new GitLabClient();
  await client.initialize(token.accessToken, baseUrl);
  clientCache.set(key, client);
  return client;
}

async function getGiteaClient(host: string): Promise<GiteaClient | null> {
  const key = clientKey('gitea', host);
  const cached = clientCache.get(key) as GiteaClient | undefined;
  if (cached) return cached;

  const token = await loadOAuthToken('gitea', host);
  if (!token) return null;

  const baseUrl = `https://${host}`;
  const client = new GiteaClient('gitea', baseUrl);
  await client.initialize(token.accessToken);
  clientCache.set(key, client);
  return client;
}

// ─── Argument helpers ──────────────────────────────────────────────────────────

function getStringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string') throw new Error(`Missing or invalid '${key}'`);
  return value;
}

function getNumberArg(args: Record<string, unknown>, key: string): number {
  const value = args[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Missing or invalid '${key}'`);
  return value;
}

function getOptionalStringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`Invalid '${key}'`);
  return value;
}

function getOptionalStringArrayArg(args: Record<string, unknown>, key: string): string[] | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid '${key}'`);
  }
  return value;
}

function buildConfirmationResult(confirmed: MutationConfirmation): Git2ToolResult {
  return { success: true, requiresConfirmation: true, proposedChanges: confirmed };
}

function buildSuccessResult(data?: unknown): Git2ToolResult {
  return { success: true, requiresConfirmation: false, data };
}

// ─── Main executor ────────────────────────────────────────────────────────────

export async function executeGit2ProviderTool(
  toolName: ProviderToolName,
  args: Record<string, unknown>,
  mode: ToolActionMode,
  providerHost: string,
  providerKind: ProviderKind,
): Promise<Git2ToolResult> {
  try {
    switch (providerKind) {
      case 'github':
        return executeGitHubTool(toolName as GitHubToolName, args, mode, providerHost);
      case 'gitlab':
        return executeGitLabTool(toolName as GitLabToolName, args, mode, providerHost);
      case 'gitea':
      case 'forgejo':
        return executeGiteaTool(toolName as GiteaToolName, args, mode, providerHost);
      default:
        return { success: false, requiresConfirmation: false, error: `Unknown provider: ${providerKind}` };
    }
  } catch (error) {
    return {
      success: false,
      requiresConfirmation: false,
      error: error instanceof Error ? error.message : 'Provider tool execution failed',
    };
  }
}

async function executeGitHubTool(
  toolName: GitHubToolName,
  args: Record<string, unknown>,
  mode: ToolActionMode,
  host: string,
): Promise<Git2ToolResult> {
  const client = await getGitHubClient(host);
  if (!client) {
    return { success: false, requiresConfirmation: false, error: 'GitHub not authenticated. Connect in Settings.' };
  }

  const owner = args.owner ? getStringArg(args, 'owner') : undefined;
  const repo = args.repo ? getStringArg(args, 'repo') : undefined;

  switch (toolName) {
    case 'list_repos': {
      return buildSuccessResult({ message: 'Use the GitHubService.getRepositories() for repo listing (out of scope for provider client).' });
    }
    case 'list_issues': {
      if (!owner || !repo) return { success: false, requiresConfirmation: false, error: 'owner and repo required' };
      const state = getOptionalStringArg(args, 'state') as 'open' | 'closed' | 'all' | undefined;
      const issues = await client.listIssues(owner, repo, state ?? 'open');
      return buildSuccessResult(
        issues.map((i) => ({ number: i.number, title: i.title, state: i.state, url: i.webUrl })),
      );
    }
    case 'create_issue': {
      if (!owner || !repo) return { success: false, requiresConfirmation: false, error: 'owner and repo required' };
      const title = getStringArg(args, 'title');
      const body = getOptionalStringArg(args, 'body');
      const labels = getOptionalStringArrayArg(args, 'labels');
      const assignees = getOptionalStringArrayArg(args, 'assignees');
      if (mode === 'confirm') {
        return buildConfirmationResult({
          type: 'create_issue',
          description: `Create issue "${title}" in ${owner}/${repo}`,
          details: { owner, repo, title, body, labels, assignees },
          provider: 'github',
        });
      }
      const issue = await client.createIssue({ owner, repo, title, body, labels, assignees });
      if (!issue) return { success: false, requiresConfirmation: false, error: 'Failed to create issue.' };
      return buildSuccessResult({ number: issue.number, title: issue.title, url: issue.webUrl });
    }
    case 'list_pull_requests': {
      if (!owner || !repo) return { success: false, requiresConfirmation: false, error: 'owner and repo required' };
      const state = getOptionalStringArg(args, 'state') as 'open' | 'closed' | 'all' | undefined;
      const prs = await client.listPullRequests(owner, repo, state ?? 'open');
      return buildSuccessResult(
        prs.map((p) => ({ number: p.number, title: p.title, state: p.state, url: p.webUrl, draft: p.draft })),
      );
    }
    case 'create_pull_request': {
      if (!owner || !repo) return { success: false, requiresConfirmation: false, error: 'owner and repo required' };
      const title = getStringArg(args, 'title');
      const body = getOptionalStringArg(args, 'body');
      const head = getStringArg(args, 'head');
      const base = getStringArg(args, 'base');
      if (mode === 'confirm') {
        return buildConfirmationResult({
          type: 'create_pull_request',
          description: `Create PR "${title}" (${head} → ${base}) in ${owner}/${repo}`,
          details: { owner, repo, title, body, head, base },
          provider: 'github',
        });
      }
      const pr = await client.createPullRequest({ owner, repo, title, body, head, base });
      if (!pr) return { success: false, requiresConfirmation: false, error: 'Failed to create pull request.' };
      return buildSuccessResult({ number: pr.number, title: pr.title, url: pr.webUrl, draft: pr.draft });
    }
    case 'get_pull_request_diff': {
      return buildSuccessResult({ message: 'PR diff retrieval is out of scope for the provider client interface.' });
    }
    case 'review_pull_request': {
      if (!owner || !repo) return { success: false, requiresConfirmation: false, error: 'owner and repo required' };
      const pull_number = getNumberArg(args, 'pull_number');
      const body = getStringArg(args, 'body');
      const event = getStringArg(args, 'event') as 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
      if (!['APPROVE', 'REQUEST_CHANGES', 'COMMENT'].includes(event)) {
        throw new Error("Invalid 'event'");
      }
      if (mode === 'confirm') {
        return buildConfirmationResult({
          type: 'review_pull_request',
          description: `Post ${event} review on PR #${pull_number} in ${owner}/${repo}`,
          details: { owner, repo, pull_number, body, event },
          provider: 'github',
        });
      }
      const review = await client.reviewPullRequest({ owner, repo, pullNumber: pull_number, body, event });
      if (!review) return { success: false, requiresConfirmation: false, error: 'Failed to post review.' };
      return buildSuccessResult({ id: review.id, body: review.body });
    }
    case 'list_releases': {
      if (!owner || !repo) return { success: false, requiresConfirmation: false, error: 'owner and repo required' };
      const releases = await client.listReleases!(owner, repo);
      return buildSuccessResult(
        releases.map((r) => ({ tag: r.tagName, name: r.name, url: r.webUrl, published: r.publishedAt })),
      );
    }
    case 'get_release': {
      return buildSuccessResult({ message: 'Single release retrieval is out of scope for the provider client interface.' });
    }
    case 'list_workflow_runs': {
      if (!owner || !repo) return { success: false, requiresConfirmation: false, error: 'owner and repo required' };
      const runs = await client.listWorkflowRuns!({ owner, repo });
      return buildSuccessResult(
        runs.map((r) => ({
          id: r.id,
          name: r.name,
          status: r.status,
          conclusion: r.conclusion,
          url: r.webUrl,
        })),
      );
    }
    case 'trigger_workflow': {
      return buildSuccessResult({ message: 'Workflow triggering is out of scope for the provider client interface.' });
    }
    default:
      return { success: false, requiresConfirmation: false, error: `Unknown GitHub tool: ${toolName}` };
  }
}

async function executeGitLabTool(
  toolName: GitLabToolName,
  args: Record<string, unknown>,
  mode: ToolActionMode,
  host: string,
): Promise<Git2ToolResult> {
  const client = await getGitLabClient(host);
  if (!client) {
    return { success: false, requiresConfirmation: false, error: 'GitLab not authenticated. Connect in Settings.' };
  }

  const owner = args.owner ? getStringArg(args, 'owner') : undefined;
  const repo = args.repo ? getStringArg(args, 'repo') : undefined;

  switch (toolName) {
    case 'list_projects': {
      return buildSuccessResult({ message: 'Use the GitLabService.listOwnedProjects() for project listing (out of scope for provider client).' });
    }
    case 'list_issues': {
      if (!owner || !repo) return { success: false, requiresConfirmation: false, error: 'owner and repo required' };
      const state = getOptionalStringArg(args, 'state') as 'open' | 'closed' | 'all' | undefined;
      const issues = await client.listIssues(owner, repo, state ?? 'open');
      return buildSuccessResult(
        issues.map((i) => ({ number: i.number, title: i.title, state: i.state, url: i.webUrl })),
      );
    }
    case 'create_issue': {
      if (!owner || !repo) return { success: false, requiresConfirmation: false, error: 'owner and repo required' };
      const title = getStringArg(args, 'title');
      const description = getOptionalStringArg(args, 'description');
      const labels = getOptionalStringArrayArg(args, 'labels');
      if (mode === 'confirm') {
        return buildConfirmationResult({
          type: 'create_issue',
          description: `Create issue "${title}" in ${owner}/${repo}`,
          details: { owner, repo, title, description, labels },
          provider: 'gitlab',
        });
      }
      const issue = await client.createIssue({ owner, repo, title, body: description, labels });
      if (!issue) return { success: false, requiresConfirmation: false, error: 'Failed to create issue.' };
      return buildSuccessResult({ number: issue.number, title: issue.title, url: issue.webUrl });
    }
    case 'list_merge_requests': {
      if (!owner || !repo) return { success: false, requiresConfirmation: false, error: 'owner and repo required' };
      const state = getOptionalStringArg(args, 'state') as 'open' | 'closed' | 'all' | undefined;
      const mrs = await client.listPullRequests(owner, repo, state ?? 'open');
      return buildSuccessResult(
        mrs.map((m) => ({ number: m.number, title: m.title, state: m.state, url: m.webUrl, draft: m.draft })),
      );
    }
    case 'create_merge_request': {
      if (!owner || !repo) return { success: false, requiresConfirmation: false, error: 'owner and repo required' };
      const title = getStringArg(args, 'title');
      const description = getOptionalStringArg(args, 'description');
      const sourceBranch = getStringArg(args, 'source_branch');
      const targetBranch = getStringArg(args, 'target_branch');
      if (mode === 'confirm') {
        return buildConfirmationResult({
          type: 'create_merge_request',
          description: `Create MR "${title}" (${sourceBranch} → ${targetBranch}) in ${owner}/${repo}`,
          details: { owner, repo, title, description, sourceBranch, targetBranch },
          provider: 'gitlab',
        });
      }
      const mr = await client.createPullRequest({ owner, repo, title, body: description, head: sourceBranch, base: targetBranch });
      if (!mr) return { success: false, requiresConfirmation: false, error: 'Failed to create merge request.' };
      return buildSuccessResult({ number: mr.number, title: mr.title, url: mr.webUrl });
    }
    case 'list_releases': {
      if (!owner || !repo) return { success: false, requiresConfirmation: false, error: 'owner and repo required' };
      const releases = await client.listReleases!(owner, repo);
      return buildSuccessResult(
        releases.map((r) => ({ tag: r.tagName, name: r.name, url: r.webUrl, published: r.publishedAt })),
      );
    }
    case 'get_release': {
      return buildSuccessResult({ message: 'Single release retrieval is out of scope for the provider client interface.' });
    }
    case 'list_pipelines': {
      if (!owner || !repo) return { success: false, requiresConfirmation: false, error: 'owner and repo required' };
      const runs = await client.listWorkflowRuns!({ owner, repo });
      return buildSuccessResult(
        runs.map((p) => ({ id: p.id, status: p.status, branch: p.headBranch, url: p.webUrl })),
      );
    }
    case 'trigger_pipeline': {
      return buildSuccessResult({ message: 'Pipeline triggering is out of scope for the provider client interface.' });
    }
    default:
      return { success: false, requiresConfirmation: false, error: `Unknown GitLab tool: ${toolName}` };
  }
}

async function executeGiteaTool(
  toolName: GiteaToolName,
  args: Record<string, unknown>,
  mode: ToolActionMode,
  host: string,
): Promise<Git2ToolResult> {
  const client = await getGiteaClient(host);
  if (!client) {
    return { success: false, requiresConfirmation: false, error: 'Gitea not authenticated. Connect in Settings.' };
  }

  const owner = args.owner ? getStringArg(args, 'owner') : undefined;
  const repo = args.repo ? getStringArg(args, 'repo') : undefined;

  switch (toolName) {
    case 'list_repos': {
      return buildSuccessResult({ message: 'Use the GiteaService.listOwnedRepos() for repo listing (out of scope for provider client).' });
    }
    case 'list_issues': {
      if (!owner || !repo) return { success: false, requiresConfirmation: false, error: 'owner and repo required' };
      const state = getOptionalStringArg(args, 'state') as 'open' | 'closed' | 'all' | undefined;
      const issues = await client.listIssues(owner, repo, state ?? 'open');
      return buildSuccessResult(
        issues.map((i) => ({ number: i.number, title: i.title, state: i.state, url: i.webUrl })),
      );
    }
    case 'create_issue': {
      if (!owner || !repo) return { success: false, requiresConfirmation: false, error: 'owner and repo required' };
      const title = getStringArg(args, 'title');
      const body = getOptionalStringArg(args, 'body');
      if (mode === 'confirm') {
        return buildConfirmationResult({
          type: 'create_issue',
          description: `Create issue "${title}" in ${owner}/${repo}`,
          details: { owner, repo, title, body },
          provider: 'gitea',
        });
      }
      const issue = await client.createIssue({ owner, repo, title, body });
      if (!issue) return { success: false, requiresConfirmation: false, error: 'Failed to create issue.' };
      return buildSuccessResult({ number: issue.number, title: issue.title, url: issue.webUrl });
    }
    case 'list_pull_requests': {
      if (!owner || !repo) return { success: false, requiresConfirmation: false, error: 'owner and repo required' };
      const state = getOptionalStringArg(args, 'state') as 'open' | 'closed' | 'all' | undefined;
      const prs = await client.listPullRequests(owner, repo, state ?? 'open');
      return buildSuccessResult(
        prs.map((p) => ({ number: p.number, title: p.title, state: p.state, url: p.webUrl, draft: p.draft })),
      );
    }
    case 'create_pull_request': {
      if (!owner || !repo) return { success: false, requiresConfirmation: false, error: 'owner and repo required' };
      const title = getStringArg(args, 'title');
      const body = getOptionalStringArg(args, 'body');
      const head = getStringArg(args, 'head');
      const base = getStringArg(args, 'base');
      if (mode === 'confirm') {
        return buildConfirmationResult({
          type: 'create_pull_request',
          description: `Create PR "${title}" (${head} → ${base}) in ${owner}/${repo}`,
          details: { owner, repo, title, body, head, base },
          provider: 'gitea',
        });
      }
      const pr = await client.createPullRequest({ owner, repo, title, body, head, base });
      if (!pr) return { success: false, requiresConfirmation: false, error: 'Failed to create pull request.' };
      return buildSuccessResult({ number: pr.number, title: pr.title, url: pr.webUrl });
    }
    case 'list_releases': {
      if (!owner || !repo) return { success: false, requiresConfirmation: false, error: 'owner and repo required' };
      const releases = await client.listReleases!(owner, repo);
      return buildSuccessResult(
        releases.map((r) => ({ tag: r.tagName, name: r.name, url: r.webUrl, published: r.publishedAt })),
      );
    }
    case 'get_release': {
      return buildSuccessResult({ message: 'Single release retrieval is out of scope for the provider client interface.' });
    }
    case 'list_actions_runs': {
      return buildSuccessResult({ message: 'Gitea Actions runs listing requires the Actions API (not in current provider client).' });
    }
    case 'trigger_actions': {
      return buildSuccessResult({ message: 'Gitea Actions triggering requires the Actions API (not in current provider client).' });
    }
    default:
      return { success: false, requiresConfirmation: false, error: `Unknown Gitea tool: ${toolName}` };
  }
}

// ─── Allowlist builder ─────────────────────────────────────────────────────────

export function buildProviderAllowlist(
  provider: ProviderId,
  includeMutations: boolean = false,
): ProviderToolName[] {
  const readTools =
    provider === 'github'
      ? [...DEFAULT_GITHUB_TOOLS]
      : provider === 'gitlab'
        ? [...DEFAULT_GITLAB_TOOLS]
        : [...DEFAULT_GITEA_TOOLS];

  if (!includeMutations) return readTools;

  const mutationTools =
    provider === 'github'
      ? (['create_issue', 'create_pull_request', 'review_pull_request', 'trigger_workflow'] as GitHubToolName[])
      : provider === 'gitlab'
        ? (['create_issue', 'create_merge_request', 'trigger_pipeline'] as GitLabToolName[])
        : (['create_issue', 'create_pull_request', 'trigger_actions'] as GiteaToolName[]);

  return [...readTools, ...mutationTools];
}
