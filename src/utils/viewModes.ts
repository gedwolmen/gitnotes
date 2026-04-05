export type ViewMode = 'list' | 'grid' | 'card' | 'journal';

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

export const VIEW_MODE_ICONS: Record<ViewMode, string> = {
  list: 'list',
  grid: 'grid',
  card: 'albums',
  journal: 'calendar',
};