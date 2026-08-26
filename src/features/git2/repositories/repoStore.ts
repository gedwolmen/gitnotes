/**
 * Repository store — manages individual Git repositories.
 *
 * GPL-3.0 derivative of GitSync.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CredentialRequest {
  kind: 'userpass' | 'sshKey';
  username: string;
  token?: string;
}

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
    // TODO: Wire through Git2Client from expo-git2-rs (Todo 5 integration)
    throw new Error('cloneRepository not yet wired — see Todo 5');
  },

  async hydrate() {
    const raw = await AsyncStorage.getItem(REPO_KEY);
    if (raw) {
      set({ repositories: JSON.parse(raw) });
    }
  },
}));
