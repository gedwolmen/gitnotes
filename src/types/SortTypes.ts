export type SortField = 'modified' | 'created' | 'title';
export type SortDirection = 'asc' | 'desc';
export type SortMode = { field: SortField; direction: SortDirection };
export type EntityType = 'notes' | 'todos' | 'canvases';
