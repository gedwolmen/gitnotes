import type { Note } from '../models/Note';
import type { Canvas } from '../models/Canvas';

/**
 * Discriminated union covering every entity type that can appear in the
 * Home screen "Recent" feed. Use the `kind` discriminant to render the
 * right tile + route to the right viewer.
 */
export type RecentItem =
  | { kind: 'note'; data: Note; updatedAt: number; pinned: boolean }
  | { kind: 'document'; data: Note; updatedAt: number; pinned: boolean }
  | { kind: 'canvas'; data: Canvas; updatedAt: number; pinned: boolean };

export interface BuildRecentFeedOptions {
  /** Drop items where `isPinned` is true (they belong in Quick Access). */
  excludePinned?: boolean;
  /** Cap the returned list. Defaults to no cap. */
  limit?: number;
}

function noteIsPinned(note: Note): boolean {
  return note.isPinned === true;
}

// Canvases / Todos may not yet have an `isPinned` field (waiting on
// model updates). Treat them as not-pinned via duck typing so this util
// keeps working once that field lands without another edit here.
function maybePinned(item: { isPinned?: boolean }): boolean {
  return item.isPinned === true;
}

export function buildRecentFeed(
  notes: readonly Note[],
  canvases: readonly Canvas[],
  options: BuildRecentFeedOptions = {},
): RecentItem[] {
  const { excludePinned = true, limit } = options;

  const items: RecentItem[] = [];

  for (const note of notes) {
    const pinned = noteIsPinned(note);
    if (excludePinned && pinned) continue;
    items.push({
      kind: note.format === 'pdf' ? 'document' : 'note',
      data: note,
      updatedAt: note.updatedAt,
      pinned,
    });
  }

  for (const canvas of canvases) {
    const pinned = maybePinned(canvas as unknown as { isPinned?: boolean });
    if (excludePinned && pinned) continue;
    items.push({
      kind: 'canvas',
      data: canvas,
      updatedAt: canvas.updatedAt,
      pinned,
    });
  }

  items.sort((a, b) => b.updatedAt - a.updatedAt);

  if (limit !== undefined) return items.slice(0, limit);
  return items;
}

/**
 * Pinned items across notes (and canvases / todos once those gain the
 * field). Sorted by `updatedAt` desc.
 */
export function buildPinnedFeed(
  notes: readonly Note[],
  canvases: readonly Canvas[],
  limit?: number,
): RecentItem[] {
  const items: RecentItem[] = [];

  for (const note of notes) {
    if (!noteIsPinned(note)) continue;
    items.push({
      kind: note.format === 'pdf' ? 'document' : 'note',
      data: note,
      updatedAt: note.updatedAt,
      pinned: true,
    });
  }

  for (const canvas of canvases) {
    if (!maybePinned(canvas as unknown as { isPinned?: boolean })) continue;
    items.push({
      kind: 'canvas',
      data: canvas,
      updatedAt: canvas.updatedAt,
      pinned: true,
    });
  }

  items.sort((a, b) => b.updatedAt - a.updatedAt);

  if (limit !== undefined) return items.slice(0, limit);
  return items;
}

/** Bento sizing variants. */
export type BentoSize = 'large' | 'medium' | 'small' | 'pinned';

/**
 * Map an index in the recent-feed array to a bento tile size.
 * Index 0 => large, 1-2 => medium, 3+ => small.
 */
export function bentoSizeForIndex(index: number): BentoSize {
  if (index === 0) return 'large';
  if (index < 3) return 'medium';
  return 'small';
}
