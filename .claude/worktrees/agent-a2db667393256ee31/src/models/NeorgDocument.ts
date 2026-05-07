/**
 * Neorg Document Metadata Interface
 * 
 * Represents the metadata block in a .norg file:
 * @document.meta
 * title: Example Note
 * description: A short description
 * authors: [Your Name]
 * categories: [notes, work]
 * created: 2021-09-05T12:34:56+0000
 * updated: 2021-09-06T10:00:00+0000
 * version: 9
 * @end
 */

export interface NeorgMetadata {
  title?: string;
  description?: string;
  authors?: string[];
  categories?: string[];
  created?: string;
  updated?: string;
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