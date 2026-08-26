/**
 * Git2SettingsStore — persistent configuration for git2-rs features.
 *
 * Manages author identity, commit templates, sync scheduling overrides,
 * SSL policy, .gitignore rules, and per-repo behavior preferences.
 *
 * All settings are persisted to AsyncStorage and hydrated on app start.
 *
 * GPL-3.0 derivative of GitSync.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuthorIdentity {
  name: string;
  email: string;
}

export interface CommitTemplate {
  id: string;
  name: string;
  prefix: string;
  /** e.g. "feat: ", "fix: ", "chore: " */
  isDefault: boolean;
}

export interface SslPolicy {
  /** Default SSL verification enabled for all repos */
  verifySsl: boolean;
  /** Per-repo overrides (repoId → override) */
  perRepoOverrides: Record<string, boolean>;
}

export interface GitignoreRule {
  pattern: string;
  addedAt: number;
}

export interface PerRepoBehavior {
  repoId: string;
  /** Auto-commit local changes on save */
  autoCommitOnSave: boolean;
  /** Auto-push after commit */
  autoPush: boolean;
  /** Preferred remote name for push/fetch */
  preferredRemote: string;
  /** Preferred branch for push */
  preferredBranch: string;
  /** Exclude from background sync */
  excludeFromBackgroundSync: boolean;
}

export interface Git2Settings {
  author: AuthorIdentity;
  commitTemplates: CommitTemplate[];
  sslPolicy: SslPolicy;
  gitignoreRules: Record<string, GitignoreRule[]>;
  perRepoBehavior: Record<string, PerRepoBehavior>;
  /** Sync scheduling advanced overrides (mode-specific) */
  syncOverwrites: {
    /** Max number of repos to sync in a single background cycle */
    maxReposPerCycle: number;
    /** Max files to commit per sync cycle */
    maxFilesPerCycle: number;
    /** Force immediate push when online */
    pushOnOnline: boolean;
  };
}

export interface Git2SettingsState extends Git2Settings {
  /** Hydrate settings from AsyncStorage */
  hydrate(): Promise<void>;
  /** Update author identity */
  setAuthor(identity: AuthorIdentity): Promise<void>;
  /** Add a commit template */
  addCommitTemplate(template: Omit<CommitTemplate, 'id'>): Promise<void>;
  /** Remove a commit template */
  removeCommitTemplate(id: string): Promise<void>;
  /** Set default commit template */
  setDefaultCommitTemplate(id: string): Promise<void>;
  /** Update SSL policy */
  setSslPolicy(policy: Partial<SslPolicy>): Promise<void>;
  /** Override SSL for a specific repo */
  setRepoSslOverride(repoId: string, verify: boolean): Promise<void>;
  /** Set gitignore rules for a repo */
  setGitignoreRules(repoId: string, rules: GitignoreRule[]): Promise<void>;
  /** Update per-repo behavior */
  setPerRepoBehavior(repoId: string, behavior: Partial<PerRepoBehavior>): Promise<void>;
  /** Update sync scheduling overwrites */
  setSyncOverwrites(overwrites: Partial<Git2Settings['syncOverwrites']>): Promise<void>;
  /** Get effective SSL verification for a repo */
  getEffectiveSsl(repoId: string): boolean;
  /** Get commit template prefix for quick-commit messages */
  getCommitPrefix(templateId?: string): string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = '@git2:settings:v1';

const DEFAULT_AUTHOR: AuthorIdentity = {
  name: 'GitNotēs',
  email: 'app@gitnotes.dev',
};

const DEFAULT_COMMIT_TEMPLATES: CommitTemplate[] = [
  { id: 'default', name: 'Default', prefix: 'chore: sync ', isDefault: true },
  { id: 'feat', name: 'Feature', prefix: 'feat: ', isDefault: false },
  { id: 'fix', name: 'Fix', prefix: 'fix: ', isDefault: false },
  { id: 'docs', name: 'Documentation', prefix: 'docs: ', isDefault: false },
  { id: 'refactor', name: 'Refactor', prefix: 'refactor: ', isDefault: false },
];

const DEFAULT_SETTINGS: Git2Settings = {
  author: DEFAULT_AUTHOR,
  commitTemplates: DEFAULT_COMMIT_TEMPLATES,
  sslPolicy: {
    verifySsl: true,
    perRepoOverrides: {},
  },
  gitignoreRules: {},
  perRepoBehavior: {},
  syncOverwrites: {
    maxReposPerCycle: 5,
    maxFilesPerCycle: 50,
    pushOnOnline: true,
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId(): string {
  return `tpl:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useGit2SettingsStore = create<Git2SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,

  async hydrate() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Git2Settings>;
        set({ ...DEFAULT_SETTINGS, ...parsed });
      }
    } catch (err) {
      console.warn('[Git2SettingsStore] hydrate failed:', err);
    }
  },

  async setAuthor(identity) {
    const next = { ...get(), author: identity };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    set({ author: identity });
  },

  async addCommitTemplate(template) {
    const id = generateId();
    const newTemplate: CommitTemplate = { ...template, id };
    const next = [...get().commitTemplates, newTemplate];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...get(), commitTemplates: next }));
    set({ commitTemplates: next });
  },

  async removeCommitTemplate(id) {
    const next = get().commitTemplates.filter((t) => t.id !== id);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...get(), commitTemplates: next }));
    set({ commitTemplates: next });
  },

  async setDefaultCommitTemplate(id) {
    const next = get().commitTemplates.map((t) => ({
      ...t,
      isDefault: t.id === id,
    }));
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...get(), commitTemplates: next }));
    set({ commitTemplates: next });
  },

  async setSslPolicy(policy) {
    const current = get().sslPolicy;
    const next = { ...current, ...policy };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...get(), sslPolicy: next }));
    set({ sslPolicy: next });
  },

  async setRepoSslOverride(repoId, verify) {
    const current = get().sslPolicy;
    const perRepoOverrides = { ...current.perRepoOverrides, [repoId]: verify };
    const next = { ...current, perRepoOverrides };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...get(), sslPolicy: next }));
    set({ sslPolicy: next });
  },

  async setGitignoreRules(repoId, rules) {
    const gitignoreRules = { ...get().gitignoreRules, [repoId]: rules };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...get(), gitignoreRules }));
    set({ gitignoreRules });
  },

  async setPerRepoBehavior(repoId, behavior) {
    const current = get().perRepoBehavior[repoId] ?? {
      repoId,
      autoCommitOnSave: true,
      autoPush: true,
      preferredRemote: 'origin',
      preferredBranch: 'main',
      excludeFromBackgroundSync: false,
    };
    const updated = { ...current, ...behavior, repoId };
    const perRepoBehavior = { ...get().perRepoBehavior, [repoId]: updated };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...get(), perRepoBehavior }));
    set({ perRepoBehavior });
  },

  async setSyncOverwrites(overwrites) {
    const next = { ...get().syncOverwrites, ...overwrites };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...get(), syncOverwrites: next }));
    set({ syncOverwrites: next });
  },

  getEffectiveSsl(repoId) {
    const { sslPolicy } = get();
    if (repoId in sslPolicy.perRepoOverrides) {
      return sslPolicy.perRepoOverrides[repoId];
    }
    return sslPolicy.verifySsl;
  },

  getCommitPrefix(templateId) {
    const { commitTemplates } = get();
    if (templateId) {
      const match = commitTemplates.find((t) => t.id === templateId);
      if (match) return match.prefix;
    }
    const defaultTpl = commitTemplates.find((t) => t.isDefault);
    return defaultTpl?.prefix ?? 'chore: sync ';
  },
}));
