/**
 * Remote store — manages Git remotes via Git2Client.
 *
 * Provides: list, add, remove operations.
 * setUrl and rename require add + remove workaround since Git2Client lacks those ops.
 * Protects 'origin' as the default remote from removal.
 *
 * GPL-3.0 derivative of GitSync.
 */

import { create } from 'zustand';
import { Git2Client } from '../../../../modules/expo-git2-rs/src/Git2Client';

export interface RemoteInfo {
  name: string;
  url: string;
}

export interface RemoteState {
  remotes: RemoteInfo[];
  loading: boolean;
  error: string | null;
  operationLock: boolean;
  listRemotes(localPath: string): Promise<void>;
  addRemote(localPath: string, name: string, url: string): Promise<void>;
  removeRemote(localPath: string, name: string): Promise<void>;
  setUrl(localPath: string, name: string, newUrl: string): Promise<void>;
  renameRemote(localPath: string, oldName: string, newName: string): Promise<void>;
  clearError(): void;
}

export const useRemoteStore = create<RemoteState>((set, get) => ({
  remotes: [],
  loading: false,
  error: null,
  operationLock: false,

  async listRemotes(localPath: string) {
    set({ loading: true, error: null });
    try {
      const result = await Git2Client.listRemotes(localPath);
      // Git2Client.listRemotes returns string[] — URL is not available from listRemotes
      // We track names and set empty URLs until addRemote provides them
      const remotes: RemoteInfo[] = result.data.map((name: string) => ({
        name,
        url: '',
      }));
      set({ remotes, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  async addRemote(localPath: string, name: string, url: string) {
    const { remotes, operationLock } = get();
    if (operationLock) return;
    if (remotes.some((r) => r.name === name)) {
      set({ error: `Remote '${name}' already exists` });
      return;
    }

    set({ operationLock: true, error: null });
    try {
      await Git2Client.addRemote(localPath, name, url);
      await get().listRemotes(localPath);
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ operationLock: false });
    }
  },

  async removeRemote(localPath: string, name: string) {
    const { remotes, operationLock } = get();
    if (operationLock) return;
    if (name === 'origin' && remotes.some((r) => r.name === 'origin')) {
      set({ error: 'Cannot remove the default remote "origin"' });
      return;
    }

    set({ operationLock: true, error: null });
    try {
      await Git2Client.removeRemote(localPath, name);
      await get().listRemotes(localPath);
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ operationLock: false });
    }
  },

  // setUrl requires add + remove workaround since Git2Client lacks setUrl
  async setUrl(localPath: string, name: string, newUrl: string) {
    const { remotes, operationLock } = get();
    const remote = remotes.find((r) => r.name === name);
    if (!remote) {
      set({ error: `Remote '${name}' not found` });
      return;
    }

    set({ operationLock: true, error: null });
    try {
      await Git2Client.removeRemote(localPath, name);
      await Git2Client.addRemote(localPath, name, newUrl);
      await get().listRemotes(localPath);
    } catch (e) {
      // Attempt to restore on failure
      try {
        await Git2Client.addRemote(localPath, name, remote.url);
      } catch {
        // ignore restore errors
      }
      set({ error: (e as Error).message });
    } finally {
      set({ operationLock: false });
    }
  },

  // renameRemote requires add + remove workaround since Git2Client lacks rename
  async renameRemote(localPath: string, oldName: string, newName: string) {
    const { remotes, operationLock } = get();
    const remote = remotes.find((r) => r.name === oldName);
    if (!remote) {
      set({ error: `Remote '${oldName}' not found` });
      return;
    }
    if (remotes.some((r) => r.name === newName)) {
      set({ error: `Remote '${newName}' already exists` });
      return;
    }

    set({ operationLock: true, error: null });
    try {
      await Git2Client.removeRemote(localPath, oldName);
      await Git2Client.addRemote(localPath, newName, remote.url);
      await get().listRemotes(localPath);
    } catch (e) {
      // Attempt to restore on failure
      try {
        await Git2Client.addRemote(localPath, oldName, remote.url);
      } catch {
        // ignore restore errors
      }
      set({ error: (e as Error).message });
    } finally {
      set({ operationLock: false });
    }
  },

  clearError() {
    set({ error: null });
  },
}));