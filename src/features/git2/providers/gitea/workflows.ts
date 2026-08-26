/**
 * Gitea Workflows (Actions) client — typed wrapper for workflow run operations.
 */

import type { ProviderClient, ProviderWorkflowRun, GetWorkflowRunsInput } from '../types';

export async function listWorkflowRuns(
  client: ProviderClient,
  input: GetWorkflowRunsInput,
): Promise<ProviderWorkflowRun[]> {
  if (!client.listWorkflowRuns) return [];
  return client.listWorkflowRuns(input);
}

export async function getLatestWorkflowRun(
  client: ProviderClient,
  owner: string,
  repo: string,
  branch?: string,
): Promise<ProviderWorkflowRun | null> {
  const runs = await listWorkflowRuns(client, { owner, repo, branch, perPage: 1 });
  return runs[0] ?? null;
}
