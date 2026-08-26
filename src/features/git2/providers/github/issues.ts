/**
 * GitHub Issues client — typed wrapper for issue operations.
 */

import type { ProviderClient, ProviderIssue, ItemState } from '../types';

export async function listIssues(
  client: ProviderClient,
  owner: string,
  repo: string,
  state: ItemState = 'open',
): Promise<ProviderIssue[]> {
  return client.listIssues(owner, repo, state);
}

export async function getIssue(
  client: ProviderClient,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<ProviderIssue | null> {
  const issues = await client.listIssues(owner, repo, 'all');
  return issues.find((i) => i.number === issueNumber) ?? null;
}

export async function createIssue(
  client: ProviderClient,
  input: { owner: string; repo: string; title: string; body?: string; labels?: string[]; assignees?: string[] },
): Promise<ProviderIssue | null> {
  return client.createIssue(input);
}
