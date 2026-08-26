import type { ProviderClient, ProviderId } from '../types';

export type MutationType =
  | 'create_issue'
  | 'create_comment'
  | 'create_pull_request'
  | 'review_pull_request'
  | 'trigger_workflow';

export interface ProviderToolDefinition {
  name: string;
  description: string;
  provider: ProviderId;
  isMutation: boolean;
  inputSchema: Record<string, unknown>;
}

export interface ToolExecutionContext {
  client: ProviderClient;
  owner: string;
  repo: string;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

const GITHUB_TOOLS: ProviderToolDefinition[] = [
  {
    name: 'list_issues',
    description: 'List issues in a GitHub repository',
    provider: 'github',
    isMutation: false,
    inputSchema: { type: 'object', properties: { state: { type: 'string', enum: ['open', 'closed', 'all'] } } },
  },
  {
    name: 'create_issue',
    description: 'Create a new issue in a GitHub repository',
    provider: 'github',
    isMutation: true,
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' }, labels: { type: 'array', items: { type: 'string' } } } },
  },
  {
    name: 'list_pull_requests',
    description: 'List pull requests in a GitHub repository',
    provider: 'github',
    isMutation: false,
    inputSchema: { type: 'object', properties: { state: { type: 'string', enum: ['open', 'closed', 'all'] } } },
  },
  {
    name: 'create_pull_request',
    description: 'Create a new pull request in a GitHub repository',
    provider: 'github',
    isMutation: true,
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' }, head: { type: 'string' }, base: { type: 'string' } } },
  },
  {
    name: 'review_pull_request',
    description: 'Review a pull request (approve, request changes, or comment)',
    provider: 'github',
    isMutation: true,
    inputSchema: { type: 'object', properties: { pullNumber: { type: 'number' }, body: { type: 'string' }, event: { type: 'string', enum: ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'] } } },
  },
  {
    name: 'list_releases',
    description: 'List releases in a GitHub repository',
    provider: 'github',
    isMutation: false,
    inputSchema: { type: 'object', properties: { perPage: { type: 'number' } } },
  },
  {
    name: 'list_workflow_runs',
    description: 'List GitHub Actions workflow runs',
    provider: 'github',
    isMutation: false,
    inputSchema: { type: 'object', properties: { branch: { type: 'string' }, status: { type: 'string' } } },
  },
];

const GITLAB_TOOLS: ProviderToolDefinition[] = [
  {
    name: 'list_issues',
    description: 'List issues in a GitLab project',
    provider: 'gitlab',
    isMutation: false,
    inputSchema: { type: 'object', properties: { state: { type: 'string', enum: ['open', 'closed', 'all'] } } },
  },
  {
    name: 'create_issue',
    description: 'Create a new issue in a GitLab project',
    provider: 'gitlab',
    isMutation: true,
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' }, labels: { type: 'array', items: { type: 'string' } } } },
  },
  {
    name: 'list_merge_requests',
    description: 'List merge requests in a GitLab project',
    provider: 'gitlab',
    isMutation: false,
    inputSchema: { type: 'object', properties: { state: { type: 'string', enum: ['open', 'closed', 'all'] } } },
  },
  {
    name: 'create_merge_request',
    description: 'Create a new merge request in a GitLab project',
    provider: 'gitlab',
    isMutation: true,
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' }, head: { type: 'string' }, base: { type: 'string' } } },
  },
  {
    name: 'list_releases',
    description: 'List releases in a GitLab project',
    provider: 'gitlab',
    isMutation: false,
    inputSchema: { type: 'object', properties: { perPage: { type: 'number' } } },
  },
  {
    name: 'list_pipelines',
    description: 'List CI/CD pipelines in a GitLab project',
    provider: 'gitlab',
    isMutation: false,
    inputSchema: { type: 'object', properties: { branch: { type: 'string' }, status: { type: 'string' } } },
  },
];

const GITEA_TOOLS: ProviderToolDefinition[] = [
  {
    name: 'list_issues',
    description: 'List issues in a Gitea/Forgejo repository',
    provider: 'gitea',
    isMutation: false,
    inputSchema: { type: 'object', properties: { state: { type: 'string', enum: ['open', 'closed', 'all'] } } },
  },
  {
    name: 'create_issue',
    description: 'Create a new issue in a Gitea/Forgejo repository',
    provider: 'gitea',
    isMutation: true,
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' }, labels: { type: 'array', items: { type: 'string' } } } },
  },
  {
    name: 'list_pull_requests',
    description: 'List pull requests in a Gitea/Forgejo repository',
    provider: 'gitea',
    isMutation: false,
    inputSchema: { type: 'object', properties: { state: { type: 'string', enum: ['open', 'closed', 'all'] } } },
  },
  {
    name: 'create_pull_request',
    description: 'Create a new pull request in a Gitea/Forgejo repository',
    provider: 'gitea',
    isMutation: true,
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' }, head: { type: 'string' }, base: { type: 'string' } } },
  },
  {
    name: 'list_releases',
    description: 'List releases in a Gitea/Forgejo repository',
    provider: 'gitea',
    isMutation: false,
    inputSchema: { type: 'object', properties: { perPage: { type: 'number' } } },
  },
  {
    name: 'list_actions_runs',
    description: 'List Gitea Actions workflow runs',
    provider: 'gitea',
    isMutation: false,
    inputSchema: { type: 'object', properties: { branch: { type: 'string' } } },
  },
];

export const ALL_PROVIDER_TOOLS: ProviderToolDefinition[] = [
  ...GITHUB_TOOLS,
  ...GITLAB_TOOLS,
  ...GITEA_TOOLS,
];

export const DEFAULT_ALLOWLIST: Record<ProviderId, string[]> = {
  github: GITHUB_TOOLS.filter((t) => !t.isMutation).map((t) => t.name),
  gitlab: GITLAB_TOOLS.filter((t) => !t.isMutation).map((t) => t.name),
  gitea: GITEA_TOOLS.filter((t) => !t.isMutation).map((t) => t.name),
  forgejo: GITEA_TOOLS.filter((t) => !t.isMutation).map((t) => t.name),
};

export function getToolsForProvider(provider: ProviderId): ProviderToolDefinition[] {
  switch (provider) {
    case 'github': return GITHUB_TOOLS;
    case 'gitlab': return GITLAB_TOOLS;
    case 'gitea': return GITEA_TOOLS;
    case 'forgejo': return GITEA_TOOLS;
  }
}

export function isToolAllowed(
  toolName: string,
  provider: ProviderId,
  allowlist: Record<ProviderId, string[]>,
): boolean {
  return allowlist[provider]?.includes(toolName) ?? false;
}

export function requiresConfirmation(toolName: string, provider: ProviderId): boolean {
  const tool = ALL_PROVIDER_TOOLS.find(
    (t) => t.name === toolName && t.provider === provider,
  );
  return tool?.isMutation ?? false;
}

export function getMutationToolsForProvider(provider: ProviderId): ProviderToolDefinition[] {
  return getToolsForProvider(provider).filter((t) => t.isMutation);
}
