export interface NeorgHeading {
  level: number;
  text: string;
  children?: NeorgHeading[];
  // New org-mode heading metadata:
  todoState?: string;
  priority?: string;
  tags?: string[];
  commented?: boolean;
}

export interface NeorgFootnote {
  label: string;
  content: string;
}

export interface NeorgTimestamp {
  type: 'active' | 'inactive' | 'scheduled' | 'deadline' | 'closed';
  date: string;
  time?: string;
}

export interface NeorgDrawer {
  name: string;
  properties: Record<string, string>;
}

export interface NeorgImage {
  path: string;
  caption?: string;
  width?: number;
  height?: number;
}

export interface NeorgMath {
  content: string;
  inline: boolean;
}

export interface NeorgListItem {
  type: 'unordered' | 'ordered' | 'task';
  text: string;
  status?: 'todo' | 'done' | 'important' | 'uncertain' | 'in-progress' | 'urgent' | 'cancelled' | 'on-hold' | 'recurring';
  indentLevel: number;
  children?: NeorgListItem[];
}

export interface NeorgDefinitionItem {
  term: string;
  definition: string;
  indentLevel: number;
}

export interface NeorgChecklistItem {
  text: string;
  checked: boolean;
  indentLevel: number;
}

export interface NeorgTableRow {
  cells: string[];
}

export interface NeorgContentBlock {
  type: 'heading' | 'list' | 'paragraph' | 'code' | 'checklist' | 'table' | 'quote' | 'divider' | 'definition' | 'footnote' | 'timestamp' | 'drawer' | 'image' | 'math' | 'fixed-width' | 'comment' | 'details';
  heading?: NeorgHeading;
  listItems?: NeorgListItem[];
  checklistItems?: NeorgChecklistItem[];
  definitionItems?: NeorgDefinitionItem[];
  text?: string;
  code?: {
    language?: string;
    content: string;
  };
  tableRows?: NeorgTableRow[];
  isHeaderRow?: boolean[];
  footnote?: NeorgFootnote;
  timestamp?: NeorgTimestamp;
  drawer?: NeorgDrawer;
  image?: NeorgImage;
  math?: NeorgMath;
  details?: {
    summary?: string;
    content: string;
  };
}

export interface NeorgContentParseResult {
  success: boolean;
  blocks?: NeorgContentBlock[];
  error?: string;
}
