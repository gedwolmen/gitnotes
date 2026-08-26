/**
 * Provider clients barrel export.
 *
 * Each provider (GitHub, GitLab, Gitea) exports a typed REST client
 * for collaboration features: issues, PRs, comments, releases, workflows.
 *
 * These clients are SEPARATE from Git2Client file sync. Never use
 * provider APIs as file transport — file transport goes through
 * Git2Client (git2-rs native clone/fetch/push).
 */

// Types
export type {
  ProviderKind,
  ProviderId,
  ProviderConfig,
  ProviderClient,
  ProviderUser,
  ProviderIssue,
  ProviderComment,
  ProviderPullRequest,
  ProviderRelease,
  ProviderWorkflowRun,
  ItemState,
  CreateIssueInput,
  CreateCommentInput,
  CreatePullRequestInput,
  ReviewInput,
  GetWorkflowRunsInput,
  GetReleasesInput,
  MutationConfirmation,
  ToolAllowlist,
  ProviderToolName,
  GitHubToolName,
  GitLabToolName,
  GiteaToolName,
  // Wire types
  GitHubUser,
  GitHubRepository,
  GitHubIssue,
  GitHubMilestone,
  GitHubPullRequest,
  GitHubPullRequestDiff,
  GitHubReviewInput,
  GitHubReview,
  GitHubRelease,
  GitHubWorkflowRun,
  GitLabUser,
  GitLabProject,
  GitLabMR,
  GitLabIssue,
  GitLabRelease,
  GitLabPipeline,
  GiteaUser,
  GiteaRepo,
  GiteaPR,
  GiteaIssue,
  GiteaRelease,
  GiteaWorkflowRun,
} from './types';

export { ITEM_STATES } from './types';

// REST client
export { TypedRestClient, RestError } from './restClient';
export type { AuthStrategy } from './restClient';

// OAuth store
export { storeOAuthToken, loadOAuthToken, removeOAuthToken, listStoredTokens } from './oauthStore';
export type { StoredOAuthToken } from './oauthStore';

// Provider clients
export { GitHubClient } from './github';
export { GitLabClient } from './gitlab';
export { GiteaClient } from './gitea';

// AI tools
export {
  ALL_PROVIDER_TOOLS,
  DEFAULT_ALLOWLIST,
  getToolsForProvider,
  isToolAllowed,
  requiresConfirmation,
  getMutationToolsForProvider,
} from './ai';
export type {
  ProviderToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
  MutationType,
} from './ai';
