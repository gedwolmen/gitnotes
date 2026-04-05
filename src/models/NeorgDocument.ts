/**
 * Neorg Document Metadata Interface
 * 
 * Represents the metadata block in a .norg file:
 * @document.meta
 * title: Note Title
 * description: A description
 * author: Author Name
 * categories: [tag1, tag2]
 * created: 2021-09-05
 * version: 0.1
 * @end
 */

export interface NeorgMetadata {
  title?: string;
  description?: string;
  author?: string;
  categories?: string[];
  created?: string; // ISO date string
  version?: string;
  [key: string]: string | string[] | undefined;
}

export interface NeorgDocument {
  metadata: NeorgMetadata;
  content: string; // Raw content after metadata block
  rawContent: string; // Full file content including metadata
}

/**
 * Parse result interface
 */
export interface NeorgParseResult {
  success: boolean;
  document?: NeorgDocument;
  error?: string;
}

/**
 * Metadata parsing options
 */
export interface NeorgParseOptions {
  includeCustomFields?: boolean;
  validateRequired?: boolean;
}