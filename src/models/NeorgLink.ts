export type LinkType = 
  | 'heading'
  | 'file'
  | 'url'
  | 'anchor';

export interface NeorgLink {
  type: LinkType;
  target: string;
  displayText?: string;
  original: string;
}

export interface LinkParseResult {
  success: boolean;
  links: NeorgLink[];
  text: string;
}