/**
 * Tag store — manages Git tags via Git2Client.
 *
 * NOTE: Git2Client does NOT currently expose tag operations:
 *   - listTags, createTag, deleteTag, getTag are missing
 *
 * This store is a stub that reflects the current API surface.
 * Once expo-git2-rs adds tag support, implement:
 *   - listTags(localPath) -> TagEntry[]
 *   - createTag(localPath, tagName, commitOid, message?) -> TagEntry
 *   - deleteTag(localPath, tagName) -> void
 *   - getTag(localPath, tagName) -> TagEntry
 *
 * GPL-3.0 derivative of GitSync.
 */

import { create } from 'zustand';

export interface TagEntry {
  name: string;
  oid: string;
  message?: string;
  taggerName?: string;
  taggerEmail?: string;
}

export interface TagState {
  tags: TagEntry[];
  loading: boolean;
  error: string | null;
  operationLock: boolean;
  listTags(_localPath: string): Promise<void>;
  createTag(_localPath: string, _tagName: string, _commitOid?: string, _message?: string): Promise<void>;
  deleteTag(_localPath: string, _tagName: string): Promise<void>;
  clearError(): void;
}

// Flag to track if tag operations are available in Git2Client
export const TAG_OPERATIONS_AVAILABLE = false;

export const useTagStore = create<TagState>((set, get) => ({
  tags: [],
  loading: false,
  error: 'Tag operations not yet available in Git2Client',
  operationLock: false,

  async listTags(_localPath: string) {
    set({ loading: true, error: 'Tag operations not yet available in Git2Client' });
    set({ tags: [], loading: false });
  },

  async createTag(_localPath: string, _tagName: string, _commitOid: string, _message?: string) {
    set({ error: 'Tag operations not yet available in Git2Client' });
  },

  async deleteTag(_localPath: string, _tagName: string) {
    set({ error: 'Tag operations not yet available in Git2Client' });
  },

  clearError() {
    set({ error: null });
  },
}));