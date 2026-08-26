/**
 * GitLab Pipelines client — typed wrapper for pipeline operations.
 */

import type { ProviderClient, ProviderWorkflowRun, GetWorkflowRunsInput } from '../types';

export async function listPipelines(
  client: ProviderClient,
  input: GetWorkflowRunsInput,
): Promise<ProviderWorkflowRun[]> {
  if (!client.listWorkflowRuns) return [];
  return client.listWorkflowRuns(input);
}

export async function getLatestPipeline(
  client: ProviderClient,
  owner: string,
  repo: string,
  branch?: string,
): Promise<ProviderWorkflowRun | null> {
  const runs = await listPipelines(client, { owner, repo, branch, perPage: 1 });
  return runs[0] ?? null;
}
