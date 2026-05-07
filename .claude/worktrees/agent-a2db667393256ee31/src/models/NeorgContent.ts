export interface NeorgHeading {
  level: number;
  text: string;
  children?: NeorgHeading[];
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
  type: 'heading' | 'list' | 'paragraph' | 'code' | 'checklist' | 'table' | 'quote' | 'divider' | 'definition';
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
}

export interface NeorgContentParseResult {
  success: boolean;
  blocks?: NeorgContentBlock[];
  error?: string;
}
