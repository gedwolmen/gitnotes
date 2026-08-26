/**
 * OAuth token store — persists provider tokens in SecureStore.
 *
 * Tokens are keyed by provider+host so the same device can hold
 * tokens for multiple providers simultaneously.
 */

import * as SecureStore from 'expo-secure-store';
import type { ProviderKind } from './types';

export interface StoredOAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  host: string;
  provider: ProviderKind;
}

const TOKEN_PREFIX = 'git2:provider:';

export function tokenKey(provider: ProviderKind, host: string): string {
  return `${TOKEN_PREFIX}${provider}:${host}`;
}

export async function storeOAuthToken(stored: StoredOAuthToken): Promise<void> {
  const key = tokenKey(stored.provider, stored.host);
  await SecureStore.setItemAsync(key, JSON.stringify(stored));
}

export async function loadOAuthToken(
  provider: ProviderKind,
  host: string,
): Promise<StoredOAuthToken | null> {
  const key = tokenKey(provider, host);
  const raw = await SecureStore.getItemAsync(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredOAuthToken;
  } catch {
    return null;
  }
}

export async function removeOAuthToken(
  provider: ProviderKind,
  host: string,
): Promise<void> {
  const key = tokenKey(provider, host);
  await SecureStore.deleteItemAsync(key);
}

export async function listStoredTokens(): Promise<StoredOAuthToken[]> {
  const all = await SecureStore.getItemAsync('git2:provider:keys');
  if (!all) return [];
  try {
    return JSON.parse(all) as StoredOAuthToken[];
  } catch {
    return [];
  }
}
