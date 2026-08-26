/**
 * GitLab Comments client — typed wrapper for issue/MR note operations.
 */

import type { ProviderClient, ProviderComment } from '../types';

export async function listComments(
  client: ProviderClient,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<ProviderComment[]> {
  return client.listComments(owner, repo, issueNumber);
}

export async function createComment(
  client: ProviderClient,
  input: { owner: string; repo: string; issueNumber: number; body: string },
): Promise<ProviderComment | null> {
  return client.createComment(input);
}
