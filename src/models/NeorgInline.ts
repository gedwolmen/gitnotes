export type MarkupType = 
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'spoiler'
  | 'code'
  | 'superscript'
  | 'subscript'
  | 'verbatim'
  | 'org-code'
  | 'org-strike';

export interface InlineMarkup {
  type: MarkupType;
  content: string;
  children?: InlineMarkup[];
}

export interface TextSegment {
  type: 'text' | 'markup';
  text?: string;
  markup?: InlineMarkup;
}

export interface ParsedInline {
  segments: TextSegment[];
  originalText: string;
}
