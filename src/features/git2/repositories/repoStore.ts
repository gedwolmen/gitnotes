/**
 * Repository store — manages individual Git repositories.
 *
 * GPL-3.0 derivative of GitSync.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Git2Client } from '../../../../modules/expo-git2-rs/src/Git2Client';
import type { CredentialRequest } from '../../../../modules/expo-git2-rs/src/types';
import { useAuthStore } from '../auth/authStore';

export interface GitRepository {
  id: string;
  containerId: string;
  name: string;
  remoteUrl: string;
  localPath: string;
  defaultBranch: string;
  currentBranch: string;
  lastSyncedAt?: number;
  createdAt: number;
}

export interface RepoState {
  repositories: GitRepository[];
  activeRepoId: string | null;
  addRepository(
    containerId: string,
    name: string,
    remoteUrl: string,
    localPath: string,
    defaultBranch?: string,
  ): Promise<GitRepository>;
  removeRepository(id: string): Promise<void>;
  setActiveRepo(id: string | null): void;
  getActiveRepo(): GitRepository | undefined;
  cloneRepository(
    remoteUrl: string,
    localPath: string,
    cred?: CredentialRequest,
  ): Promise<GitRepository>;
  hydrate(): Promise<void>;
}

const REPO_KEY = '@git2:repositories:v1';

export const useRepoStore = create<RepoState>((set, get) => ({
  repositories: [],
  activeRepoId: null,

  async addRepository(containerId, name, remoteUrl, localPath, defaultBranch = 'main') {
    const repo: GitRepository = {
      id: `repo:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      containerId,
      name,
      remoteUrl,
      localPath,
      defaultBranch,
      currentBranch: defaultBranch,
      createdAt: Date.now(),
    };
    const next = [...get().repositories, repo];
    await AsyncStorage.setItem(REPO_KEY, JSON.stringify(next));
    set({ repositories: next });
    return repo;
  },

  async removeRepository(id) {
    const next = get().repositories.filter((r) => r.id !== id);
    await AsyncStorage.setItem(REPO_KEY, JSON.stringify(next));
    set({ repositories: next });
  },

  setActiveRepo(id) {
    set({ activeRepoId: id });
  },

  getActiveRepo() {
    const { repositories, activeRepoId } = get();
    return activeRepoId ? repositories.find((r) => r.id === activeRepoId) : undefined;
  },

  async cloneRepository(remoteUrl, localPath, cred) {
    const effectiveCred: CredentialRequest | undefined = cred ?? await (async () => {
      try {
        const url = new URL(remoteUrl);
        const stored = useAuthStore.getState().getCredentials(url.hostname);
        if (!stored) return undefined;
        if (stored.type === 'https_token') {
          return { kind: 'userpass', username: stored.username, token: stored.token };
        }
        if (stored.type === 'ssh_key') {
          return { kind: 'sshKey', username: stored.username };
        }
        if (stored.type === 'github_oauth' || stored.type === 'gitlab_oauth' || stored.type === 'gitea_oauth') {
          return { kind: 'userpass', username: 'oauth', token: stored.accessToken };
        }
        return undefined;
      } catch {
        return undefined;
      }
    })();

    await Git2Client.clone(remoteUrl, localPath, effectiveCred);

    const repoName = remoteUrl.split('/').pop()?.replace(/\.git$/, '') ?? 'repo';
    const repo = await this.addRepository('default-container', repoName, remoteUrl, localPath, 'main');
    return repo;
  },

  async hydrate() {
    const raw = await AsyncStorage.getItem(REPO_KEY);
    if (raw) {
      set({ repositories: JSON.parse(raw) });
    }
  },
}));
