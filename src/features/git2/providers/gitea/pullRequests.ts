/**
 * Gitea Pull Requests client — typed wrapper for PR operations.
 */

import type { ProviderClient, ProviderPullRequest, ItemState } from '../types';

export async function listPullRequests(
  client: ProviderClient,
  owner: string,
  repo: string,
  state: ItemState = 'open',
): Promise<ProviderPullRequest[]> {
  return client.listPullRequests(owner, repo, state);
}

export async function createPullRequest(
  client: ProviderClient,
  input: { owner: string; repo: string; title: string; body?: string; head: string; base: string },
): Promise<ProviderPullRequest | null> {
  return client.createPullRequest(input);
}
