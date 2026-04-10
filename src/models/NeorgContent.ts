export interface NeorgHeading {
  level: number;
  text: string;
  children?: NeorgHeading[];
}

export interface NeorgListItem {
  type: 'unordered' | 'ordered' | 'task';
  text: string;
  status?: 'todo' | 'done' | 'important' | 'uncertain';
  indentLevel: number;
  children?: NeorgListItem[];
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
  type: 'heading' | 'list' | 'paragraph' | 'code' | 'checklist' | 'table' | 'quote' | 'divider';
  heading?: NeorgHeading;
  listItems?: NeorgListItem[];
  checklistItems?: NeorgChecklistItem[];
  text?: string;
  code?: {
    language?: string;
    content: string;
  };
  tableRows?: NeorgTableRow[];
  isHeaderRow?: boolean[];
}

export interface NeorgContentParseResult {
  success: boolean;
  blocks?: NeorgContentBlock[];
  error?: string;
}
