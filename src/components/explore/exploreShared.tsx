import { Directory, File } from 'expo-file-system';

import type { FileStatusKind, RepoStatus } from '@/services/git/engine/GitEngine';
import type { GitHostProvider } from '@/services/git/GitHost';

export interface RepoLike {
  id: string;
  path: string;
  name: string;
  localPath: string;
  branch?: string;
  provider?: GitHostProvider | string;
  hostId?: string;
  full_name?: string;
  lastSyncedAt?: number | null;
  remoteUrl?: string;
  accountId?: string;
}

/** Explore workspace sections (todo 23 shell). Order = tab row order. */
export const EXPLORE_SECTIONS = [
  { id: 'files', label: 'Files' },
  { id: 'changes', label: 'Changes' },
  { id: 'staging', label: 'Staging' },
  { id: 'commits', label: 'Commits' },
  { id: 'branches', label: 'Branches' },
  { id: 'remotes', label: 'Remotes' },
  { id: 'conflicts', label: 'Conflicts' },
  { id: 'pulls', label: 'Pull Requests' },
  { id: 'issues', label: 'Issues' },
  { id: 'info', label: 'Repo Info' },
] as const;

export type ExploreSection = (typeof EXPLORE_SECTIONS)[number]['id'];

export interface SectionProps {
  repo: RepoLike;
  status: RepoStatus | null;
  /** True while this section's tab is selected. */
  active: boolean;
  /** Called after a mutating op so the shell header + other sections refresh. */
  onChanged: () => void;
}

export function relativeTime(timestamp: number | null): string {
  if (!timestamp) return 'never';
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatBytes(size: number | null): string {
  if (size === null || Number.isNaN(size)) return 'unknown size';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif', 'bmp', 'ico', 'icns',
  'pdf', 'zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar',
  'jar', 'class', 'so', 'dylib', 'a', 'o', 'bin', 'exe', 'dll',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'mp3', 'm4a', 'wav', 'flac', 'mp4', 'mov', 'avi', 'mkv', 'webm',
  'sqlite', 'db', 'pak', 'idx', 'pack',
]);

/** Extension-based heuristic: true when a working-tree file should open in
 * the read-only binary viewer instead of the unified editor. */
export function isBinaryPath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return BINARY_EXTENSIONS.has(ext);
}

export type StatusIcon =
  | 'document-outline'
  | 'add-circle-outline'
  | 'create-outline'
  | 'trash-outline'
  | 'swap-horizontal-outline'
  | 'warning-outline';

export interface StatusMeta {
  label: string;
  badgeClass: string;
  icon: StatusIcon;
  /** Icon tint matching the badge palette (Ionicons need a color value). */
  iconColor: string;
}

export const STATUS_META: Record<FileStatusKind, StatusMeta> = {
  Unmodified: { label: 'clean', badgeClass: 'bg-gray-100 text-gray-600', icon: 'document-outline', iconColor: '#6b7280' },
  Untracked: { label: 'new', badgeClass: 'bg-sky-100 text-sky-700', icon: 'add-circle-outline', iconColor: '#0369a1' },
  Added: { label: 'added', badgeClass: 'bg-emerald-100 text-emerald-700', icon: 'add-circle-outline', iconColor: '#047857' },
  Modified: { label: 'modified', badgeClass: 'bg-amber-100 text-amber-700', icon: 'create-outline', iconColor: '#b45309' },
  Deleted: { label: 'deleted', badgeClass: 'bg-red-100 text-red-700', icon: 'trash-outline', iconColor: '#b91c1c' },
  Renamed: { label: 'renamed', badgeClass: 'bg-violet-100 text-violet-700', icon: 'swap-horizontal-outline', iconColor: '#6d28d9' },
  TypeChange: { label: 'type', badgeClass: 'bg-violet-100 text-violet-700', icon: 'swap-horizontal-outline', iconColor: '#6d28d9' },
  Conflicted: { label: 'conflict', badgeClass: 'bg-red-100 text-red-700', icon: 'warning-outline', iconColor: '#b91c1c' },
};

const SKIP_DIRECTORIES = new Set(['.git', 'node_modules', '.svn', '.hg']);

/** Max working-tree files enumerated in the Files tab (shell-level listing;
 * full tree browser with pagination lands in todo 24). */
export const MAX_LISTED_FILES = 800;

/** Recursively list working-tree files (relative POSIX paths), skipping git
 * metadata. Sync like `Directory.list()`; bounded by MAX_LISTED_FILES. */
export function walkWorkingTree(rootPath: string): { files: string[]; truncated: boolean } {
  const root = new Directory(rootPath);
  const files: string[] = [];
  let truncated = false;

  const walk = (dir: Directory, prefix: string) => {
    if (truncated) return;
    let entries: (Directory | File)[] = [];
    try {
      entries = dir.list();
    } catch {
      return;
    }
    for (const entry of entries) {
      if (truncated) return;
      if (entry instanceof Directory) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        walk(entry, `${prefix}${entry.name}/`);
      } else {
        files.push(`${prefix}${entry.name}`);
        if (files.length >= MAX_LISTED_FILES) {
          truncated = true;
          return;
        }
      }
    }
  };

  walk(root, '');
  files.sort((a, b) => a.localeCompare(b));
  return { files, truncated };
}

export type FileTreeRow =
  | { kind: 'dir'; path: string; name: string; depth: number; fileCount: number; expanded: boolean }
  | { kind: 'file'; path: string; name: string; depth: number };

interface DirNode {
  dirs: Map<string, DirNode>;
  files: string[];
  count: number;
}

/** Flatten a working-tree file list into folder-grouped rows: directories
 * (alphabetical, with recursive file counts) before files, depth-indented.
 * Only directories present in `expanded` emit their children. */
export function buildFileTreeRows(files: string[], expanded: ReadonlySet<string>): FileTreeRow[] {
  const root: DirNode = { dirs: new Map(), files: [], count: 0 };
  for (const file of files) {
    const parts = file.split('/');
    let node = root;
    node.count += 1;
    for (const dir of parts.slice(0, -1)) {
      let child = node.dirs.get(dir);
      if (!child) {
        child = { dirs: new Map(), files: [], count: 0 };
        node.dirs.set(dir, child);
      }
      child.count += 1;
      node = child;
    }
    node.files.push(parts[parts.length - 1]);
  }

  const rows: FileTreeRow[] = [];
  const emit = (node: DirNode, prefix: string, depth: number) => {
    const dirs = [...node.dirs.entries()].sort(([a], [b]) => a.localeCompare(b));
    const files = [...node.files].sort((a, b) => a.localeCompare(b));
    for (const [name, child] of dirs) {
      const dirPath = `${prefix}${name}`;
      const isExpanded = expanded.has(dirPath);
      rows.push({ kind: 'dir', path: dirPath, name, depth, fileCount: child.count, expanded: isExpanded });
      if (isExpanded) emit(child, `${dirPath}/`, depth + 1);
    }
    for (const name of files) {
      rows.push({ kind: 'file', path: `${prefix}${name}`, name, depth });
    }
  };
  emit(root, '', 0);
  return rows;
}

/** Ancestor directory paths of every file whose status marks it changed. */
export function changedFileAncestors(changedPaths: string[]): Set<string> {
  const ancestors = new Set<string>();
  for (const path of changedPaths) {
    const parts = path.split('/');
    for (let depth = 1; depth < parts.length; depth += 1) {
      ancestors.add(parts.slice(0, depth).join('/'));
    }
  }
  return ancestors;
}
