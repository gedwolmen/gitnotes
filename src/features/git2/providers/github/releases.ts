/**
 * GitHub Releases client — typed wrapper for release operations.
 */

import type { ProviderClient, ProviderRelease } from '../types';

export async function listReleases(
  client: ProviderClient,
  owner: string,
  repo: string,
  perPage: number = 30,
): Promise<ProviderRelease[]> {
  if (!client.listReleases) return [];
  return client.listReleases(owner, repo, perPage);
}

export async function getLatestRelease(
  client: ProviderClient,
  owner: string,
  repo: string,
): Promise<ProviderRelease | null> {
  const releases = await listReleases(client, owner, repo, 1);
  return releases[0] ?? null;
}
