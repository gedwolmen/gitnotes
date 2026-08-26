/**
 * Branch store — manages Git branches via Git2Client.
 *
 * Provides: list, create, checkout, delete operations.
 * Protects the current branch from deletion.
 *
 * GPL-3.0 derivative of GitSync.
 */

import { create } from 'zustand';
import { Git2Client } from '../../../../modules/expo-git2-rs/src/Git2Client';
import type { BranchEntry } from '../../../../modules/expo-git2-rs/src/types';

export interface BranchState {
  branches: BranchEntry[];
  currentBranch: string | null;
  loading: boolean;
  error: string | null;
  operationLock: boolean;
  listBranches(localPath: string): Promise<void>;
  createBranch(localPath: string, branchName: string, commitOid?: string): Promise<void>;
  checkoutBranch(localPath: string, branchName: string): Promise<void>;
  deleteBranch(localPath: string, branchName: string): Promise<void>;
  renameBranch(localPath: string, oldName: string, newName: string): Promise<void>;
  clearError(): void;
}

export const useBranchStore = create<BranchState>((set, get) => ({
  branches: [],
  currentBranch: null,
  loading: false,
  error: null,
  operationLock: false,

  async listBranches(localPath: string) {
    set({ loading: true, error: null });
    try {
      const result = await Git2Client.listBranches(localPath);
      const branches = result.data;
      const current = branches.find((b: BranchEntry) => b.isCurrent && !b.isRemote)?.name ?? null;
      set({ branches, currentBranch: current, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  async createBranch(localPath: string, branchName: string, commitOid?: string) {
    const { branches, operationLock } = get();
    if (operationLock) return;
    set({ operationLock: true, error: null });

    // Use current HEAD if no commitOid provided
    const targetOid = commitOid ?? branches.find((b) => b.isCurrent && !b.isRemote)?.oid ?? '';
    if (!targetOid) {
      set({ error: 'No commit reference available', operationLock: false });
      return;
    }

    try {
      await Git2Client.createBranch(localPath, branchName, targetOid);
      await get().listBranches(localPath);
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ operationLock: false });
    }
  },

  async checkoutBranch(localPath: string, branchName: string) {
    const { currentBranch, operationLock } = get();
    if (operationLock) return;
    if (branchName === currentBranch) return;

    set({ operationLock: true, error: null });
    try {
      await Git2Client.checkoutBranch(localPath, branchName);
      await get().listBranches(localPath);
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ operationLock: false });
    }
  },

  async deleteBranch(localPath: string, branchName: string) {
    const { currentBranch, operationLock } = get();
    if (operationLock) return;
    if (branchName === currentBranch) {
      set({ error: 'Cannot delete the currently checked-out branch' });
      return;
    }

    set({ operationLock: true, error: null });
    try {
      await Git2Client.deleteBranch(localPath, branchName);
      await get().listBranches(localPath);
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ operationLock: false });
    }
  },

  // renameBranch is a delete + create sequence since Git2Client doesn't have rename
  async renameBranch(localPath: string, oldName: string, newName: string) {
    const { operationLock } = get();
    if (operationLock) return;

    set({ operationLock: true, error: null });
    try {
      const { branches } = get();
      const branch = branches.find((b) => b.name === oldName);
      if (!branch?.oid) {
        set({ error: 'Branch not found or has no OID' });
        return;
      }
      await Git2Client.createBranch(localPath, newName, branch.oid);
      await Git2Client.deleteBranch(localPath, oldName);
      await get().listBranches(localPath);
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ operationLock: false });
    }
  },

  clearError() {
    set({ error: null });
  },
}));