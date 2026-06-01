import type { Ionicons } from '@expo/vector-icons';

export type ViewMode = 'list' | 'journal' | 'graph';

type IoniconName = keyof typeof Ionicons.glyphMap;

export interface ViewModePreference {
  global: ViewMode;
  perFolder: Record<string, ViewMode>;
}

export const DEFAULT_VIEW_MODE: ViewMode = 'list';

export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  list: 'List',
  journal: 'Journal',
  graph: 'Graph',
};

export const VIEW_MODE_ICONS: Record<ViewMode, IoniconName> = {
  list: 'list',
  journal: 'calendar',
  graph: 'git-network',
};

export function normalizeViewMode(value: unknown): ViewMode {
  return value === 'list' || value === 'journal' || value === 'graph' ? value : DEFAULT_VIEW_MODE;
}