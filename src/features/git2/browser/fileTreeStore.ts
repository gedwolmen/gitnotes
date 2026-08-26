/**
 * fileTreeStore — Zustand store for Git repository file tree state.
 *
 * Manages tree structure, selection state, staging, and file content
 * cache for the Git2 browser UI.
 *
 * GPL-3.0 derivative of GitSync.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Git2Client } from '../../../../modules/expo-git2-rs/src/Git2Client';
import type { StatusEntry, StatusResult } from '../../../../modules/expo-git2-rs/src/types';

// ─── File tree node types ─────────────────────────────────────────────────────

export type FileNodeKind = 'tree' | 'blob';

export interface FileNode {
  path: string; // full path from repo root, e.g. "src/App.tsx"
  name: string;
  kind: FileNodeKind;
  children?: FileNode[];
  size?: number;
  isStaged?: boolean;
  isModified?: boolean;
  isNew?: boolean;
  isDeleted?: boolean;
}

export interface StagedChange {
  path: string;
  isStaged: boolean;
}

// ─── Store state ──────────────────────────────────────────────────────────────

export interface FileTreeState {
  // Active repository
  repoPath: string | null;
  currentBranch: string | null;

  // File tree structure
  rootNodes: FileNode[];
  expandedPaths: Set<string>;
  selectedPath: string | null;

  // Staging state (from git status)
  stagedPaths: Set<string>;
  unstagedPaths: Set<string>;
  statusEntries: StatusEntry[];

  // File content cache (keyed by path)
  fileContents: Map<string, string>;

  // Loading / error states
  isLoadingTree: boolean;
  isLoadingStatus: boolean;
  isLoadingFile: boolean;
  treeError: string | null;
  fileError: string | null;

  // Actions
  setRepo(repoPath: string, branch: string): Promise<void>;
  loadTree(): Promise<void>;
  toggleExpanded(path: string): void;
  selectFile(path: string): Promise<void>;
  refreshStatus(): Promise<void>;
  stageFile(path: string): Promise<void>;
  unstageFile(path: string): Promise<void>;
  loadFileContent(path: string): Promise<string | null>;
  clearSelection(): void;
  hydrate(): Promise<void>;
  loadCommitHistory(maxCount?: number): Promise<import('../../../../modules/expo-git2-rs/src/types').LogEntry[]>;
}

const FILE_TREE_KEY = '@git2:filetree:v1';

function buildTree(entries: StatusEntry[], basePath: string = ''): FileNode[] {
  const nodeMap = new Map<string, FileNode>();

  for (const entry of entries) {
    const parts = entry.path.split('/');
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isDir = i < parts.length - 1;

      if (!nodeMap.has(currentPath)) {
        const node: FileNode = {
          path: currentPath,
          name: part,
          kind: isDir ? 'tree' : 'blob',
          children: isDir ? [] : undefined,
          isNew: entry.isNew,
          isModified: entry.isModified,
          isDeleted: entry.isDeleted,
        };
        nodeMap.set(currentPath, node);
      }
    }
  }

  // Build tree hierarchy
  const roots: FileNode[] = [];
  for (const node of nodeMap.values()) {
    const parentPath = node.path.includes('/')
      ? node.path.substring(0, node.path.lastIndexOf('/'))
      : '';
    if (parentPath && nodeMap.has(parentPath)) {
      nodeMap.get(parentPath)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort: dirs first, then alphabetically
  function sortNodes(nodes: FileNode[]): FileNode[] {
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'tree' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children) sortNodes(node.children);
    }
    return nodes;
  }

  return sortNodes(roots);
}

function getFilePathsFromTree(nodes: FileNode[]): string[] {
  const paths: string[] = [];
  function traverse(n: FileNode) {
    if (n.kind === 'blob') paths.push(n.path);
    n.children?.forEach(traverse);
  }
  nodes.forEach(traverse);
  return paths;
}

// Read directory listing from local file system using native FS calls.
// git2-rs exposes a `listDir` operation (not yet in the typed client, using status as proxy).
async function listRepoFiles(repoPath: string): Promise<string[]> {
  // Fallback: use status to enumerate all tracked files.
  // TODO: Wire native `listDir` op once exposed via Git2Client.
  try {
    const result = await Git2Client.status(repoPath);
    return result.data.entries.map((e) => e.path);
  } catch {
    return [];
  }
}

export const useFileTreeStore = create<FileTreeState>((set, get) => ({
  repoPath: null,
  currentBranch: null,
  rootNodes: [],
  expandedPaths: new Set(),
  selectedPath: null,
  stagedPaths: new Set(),
  unstagedPaths: new Set(),
  statusEntries: [],
  fileContents: new Map(),
  isLoadingTree: false,
  isLoadingStatus: false,
  isLoadingFile: false,
  treeError: null,
  fileError: null,

  async setRepo(repoPath, branch) {
    set({ repoPath, currentBranch: branch, rootNodes: [], selectedPath: null });
    await get().loadTree();
    await get().refreshStatus();
  },

  async loadTree() {
    const { repoPath } = get();
    if (!repoPath) return;

    set({ isLoadingTree: true, treeError: null });
    try {
      const paths = await listRepoFiles(repoPath);
      // Build synthetic status entries for file tree display
      const entries: StatusEntry[] = paths.map((path) => ({
        path,
        isNew: false,
        isModified: false,
        isDeleted: false,
        isRenamed: false,
        isIgnored: false,
      }));
      const tree = buildTree(entries);
      set({ rootNodes: tree, isLoadingTree: false });
    } catch (err: unknown) {
      set({
        treeError: err instanceof Error ? err.message : 'Failed to load file tree',
        isLoadingTree: false,
      });
    }
  },

  toggleExpanded(path) {
    set((state) => {
      const next = new Set(state.expandedPaths);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return { expandedPaths: next };
    });
  },

  async selectFile(path) {
    set({ selectedPath: path });
    await get().loadFileContent(path);
  },

  async refreshStatus() {
    const { repoPath } = get();
    if (!repoPath) return;

    set({ isLoadingStatus: true });
    try {
      const result: StatusResult = await Git2Client.status(repoPath);
      const { entries } = result.data;
      const staged = new Set<string>();
      const unstaged = new Set<string>();

      for (const entry of entries) {
        if (entry.isNew || entry.isModified || entry.isDeleted) {
          unstaged.add(entry.path);
        }
      }

      set({
        statusEntries: entries,
        stagedPaths: staged,
        unstagedPaths: unstaged,
        isLoadingStatus: false,
      });

      // Refresh tree with status info
      const tree = buildTree(entries);
      set({ rootNodes: tree });
    } catch (err: unknown) {
      set({ isLoadingStatus: false });
    }
  },

  async stageFile(path) {
    const { repoPath } = get();
    if (!repoPath) return;

    try {
      await Git2Client.stage(repoPath, path);
      set((state) => {
        const next = new Set(state.stagedPaths);
        next.add(path);
        const unstagedNext = new Set(state.unstagedPaths);
        unstagedNext.delete(path);
        return { stagedPaths: next, unstagedPaths: unstagedNext };
      });
    } catch (err: unknown) {
      // Stage failure is non-fatal; status refresh will sync state
    }
  },

  async unstageFile(path) {
    // git2-rs stage operates as a toggle; to unstage we use the index to revert.
    // Unstage is not yet exposed — placeholder until native API is extended.
    set((state) => {
      const next = new Set(state.stagedPaths);
      next.delete(path);
      return { stagedPaths: next };
    });
  },

  async loadFileContent(path) {
    const { repoPath, fileContents } = get();
    if (!repoPath) return null;

    if (fileContents.has(path)) {
      return fileContents.get(path) ?? null;
    }

    set({ isLoadingFile: true, fileError: null });
    try {
      // Read file content directly from local repo path.
      // TODO: Add readBlob / catFile to Git2Client for efficient binary/text split.
      const result = await Git2Client.diffFile(repoPath, 'HEAD', path);
      const content = result.data.content;
      set((state) => {
        const next = new Map(state.fileContents);
        next.set(path, content);
        return { fileContents: next, isLoadingFile: false };
      });
      return content;
    } catch (err: unknown) {
      set({
        fileError: err instanceof Error ? err.message : 'Failed to load file',
        isLoadingFile: false,
      });
      return null;
    }
  },

  clearSelection() {
    set({ selectedPath: null, fileError: null });
  },

  async hydrate() {
    const raw = await AsyncStorage.getItem(FILE_TREE_KEY);
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        if (saved.repoPath) {
          await get().setRepo(saved.repoPath, saved.branch ?? 'main');
        }
      } catch {
        // Ignore hydration errors
      }
    }
  },

  async loadCommitHistory(maxCount = 100) {
    const { repoPath } = get();
    if (!repoPath) return [];

    try {
      const result = await Git2Client.log(repoPath, maxCount);
      return result.data;
    } catch {
      return [];
    }
  },
}));
