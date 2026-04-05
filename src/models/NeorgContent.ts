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

export interface NeorgContentBlock {
  type: 'heading' | 'list' | 'paragraph' | 'code';
  heading?: NeorgHeading;
  listItems?: NeorgListItem[];
  text?: string;
}

export interface NeorgContentParseResult {
  success: boolean;
  blocks?: NeorgContentBlock[];
  error?: string;
}