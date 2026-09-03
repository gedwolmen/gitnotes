import { Directory, File } from 'expo-file-system';

import type { FileStatusKind, RepoStatus } from '@/services/git/engine/GitEngine';
import type { GitHostProvider } from '@/services/git/GitHost';
import type { Palette } from '@/theme/tokens';

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
  { id: 'changes', label: 'Changes' },
  { id: 'staging', label: 'Staging' },
  { id: 'commits', label: 'Commits' },
  { id: 'files', label: 'Files' },
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
  active: boolean;
  onChanged: () => void;
  chromeTopInset?: number;
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

/** Semantic tone for a status badge. Mapped to theme tokens at render time so
 * the same tone reads correctly in light and dark mode (darker shade in light,
 * lighter shade in dark — see `resolveStatusTone`). */
export type StatusTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export interface StatusMeta {
  label: string;
  tone: StatusTone;
  icon: StatusIcon;
}

/** Resolve a status tone to the { bg, fg } pair used by status badges. The bg
 * is the tone's hex color rendered at low opacity (~16%) — it tints the
 * surface below rather than overriding it, so it works on both light and dark
 * cards. The fg is the saturated tone color (which has been pre-tuned per
 * palette in tokens.ts to clear WCAG AA against the bg tint). */
export function resolveStatusTone(colors: Palette, tone: StatusTone): { bg: string; fg: string } {
  switch (tone) {
    case 'success':
      return { bg: hexWithAlpha(colors.success, 0.16), fg: colors.success };
    case 'warning':
      return { bg: hexWithAlpha(colors.warning, 0.18), fg: colors.warning };
    case 'danger':
      return { bg: hexWithAlpha(colors.error, 0.16), fg: colors.error };
    case 'accent':
      return { bg: hexWithAlpha(colors.accent, 0.18), fg: colors.accent };
    case 'neutral':
    default:
      return { bg: hexWithAlpha(colors.textSecondary, 0.18), fg: colors.textSecondary };
  }
}

function hexWithAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export const STATUS_META: Record<FileStatusKind, StatusMeta> = {
  Unmodified: { label: 'clean', tone: 'neutral', icon: 'document-outline' },
  Untracked: { label: 'new', tone: 'accent', icon: 'add-circle-outline' },
  Added: { label: 'added', tone: 'success', icon: 'add-circle-outline' },
  Modified: { label: 'modified', tone: 'warning', icon: 'create-outline' },
  Deleted: { label: 'deleted', tone: 'danger', icon: 'trash-outline' },
  Renamed: { label: 'renamed', tone: 'accent', icon: 'swap-horizontal-outline' },
  TypeChange: { label: 'type', tone: 'accent', icon: 'swap-horizontal-outline' },
  Conflicted: { label: 'conflict', tone: 'danger', icon: 'warning-outline' },
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
