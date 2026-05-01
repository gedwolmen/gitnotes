import type { Ionicons } from '@expo/vector-icons';

export type ViewMode = 'list' | 'grid' | 'card' | 'journal';

type IoniconName = keyof typeof Ionicons.glyphMap;

export interface ViewModePreference {
  global: ViewMode;
  perFolder: Record<string, ViewMode>;
}

export const DEFAULT_VIEW_MODE: ViewMode = 'list';

export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  list: 'List',
  grid: 'Grid',
  card: 'Card',
  journal: 'Journal',
};

export const VIEW_MODE_ICONS: Record<ViewMode, IoniconName> = {
  list: 'list',
  grid: 'grid',
  card: 'albums',
  journal: 'calendar',
};