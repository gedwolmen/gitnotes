/**
 * GitLab Merge Requests client — typed wrapper for MR operations.
 */

import type { ProviderClient, ProviderPullRequest, ProviderComment, ItemState, ReviewInput } from '../types';

export async function listMergeRequests(
  client: ProviderClient,
  owner: string,
  repo: string,
  state: ItemState = 'open',
): Promise<ProviderPullRequest[]> {
  return client.listPullRequests(owner, repo, state);
}

export async function createMergeRequest(
  client: ProviderClient,
  input: { owner: string; repo: string; title: string; body?: string; head: string; base: string },
): Promise<ProviderPullRequest | null> {
  return client.createPullRequest(input);
}
