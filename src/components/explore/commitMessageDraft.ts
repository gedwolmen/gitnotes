import type { FileStatus } from '@/services/git/engine/GitEngine';

type DraftCategory = 'Add' | 'Edit' | 'Delete' | 'Update';

const CATEGORY_ORDER: readonly DraftCategory[] = ['Add', 'Edit', 'Delete', 'Update'];

const MAX_PATHS_PER_CATEGORY = 8;

function categoryForStatus(status: string): DraftCategory | null {
  switch (status) {
    case 'Added':
    case 'Untracked':
      return 'Add';
    case 'Modified':
      return 'Edit';
    case 'Deleted':
      return 'Delete';
    case 'Unmodified':
      return null;
    default:
      return 'Update';
  }
}

/** Draft a conventional-commit-style message from working-tree statuses:
 * one `Label: path, path` line per non-empty category (Add → Edit → Delete →
 * Update), capped at 8 paths with a `… (+N more)` overflow suffix. */
export function buildCommitMessageDraft(statuses: FileStatus[]): string {
  const buckets: Record<DraftCategory, string[]> = { Add: [], Edit: [], Delete: [], Update: [] };
  for (const entry of statuses) {
    const path = entry.path.trim();
    if (path.length === 0) continue;
    const category = categoryForStatus(entry.status);
    if (category === null) continue;
    buckets[category].push(path);
  }
  return CATEGORY_ORDER.filter((category) => buckets[category].length > 0)
    .map((category) => {
      const paths = buckets[category];
      const shown = paths.slice(0, MAX_PATHS_PER_CATEGORY);
      const hidden = paths.length - shown.length;
      const suffix = hidden > 0 ? `, … (+${hidden} more)` : '';
      return `${category}: ${shown.join(', ')}${suffix}`;
    })
    .join('\n');
}
