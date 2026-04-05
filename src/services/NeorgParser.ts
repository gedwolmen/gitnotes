import { NeorgDocument, NeorgMetadata, NeorgParseResult, NeorgParseOptions } from '../models/NeorgDocument';

const METADATA_START = '@document.meta';
const METADATA_END = '@end';

export class NeorgParser {
  static parseDocument(content: string, options: NeorgParseOptions = {}): NeorgParseResult {
    try {
      const trimmedContent = content.trim();
      const metadataEndIndex = trimmedContent.indexOf(METADATA_END);
      
      if (trimmedContent.startsWith(METADATA_START) && metadataEndIndex !== -1) {
        const metadataBlock = trimmedContent.substring(0, metadataEndIndex + METADATA_END.length);
        const contentAfterMetadata = trimmedContent.substring(metadataEndIndex + METADATA_END.length).trim();
        
        const metadata = this.parseMetadata(metadataBlock, options);
        
        if (options.validateRequired) {
          if (!metadata.title) {
            return { success: false, error: 'Missing required field: title' };
          }
          if (!metadata.created) {
            return { success: false, error: 'Missing required field: created' };
          }
        }
        
        return {
          success: true,
          document: {
            metadata,
            content: contentAfterMetadata,
            rawContent: content,
          },
        };
      }
      
      return {
        success: true,
        document: {
          metadata: {},
          content: trimmedContent,
          rawContent: content,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown parsing error',
      };
    }
  }

  static parseMetadata(block: string, options: NeorgParseOptions = {}): NeorgMetadata {
    const metadata: NeorgMetadata = {};
    const lines = block.split('\n').slice(1);
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === METADATA_END || !trimmed) continue;
      
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex === -1) continue;
      
      const key = trimmed.substring(0, colonIndex).trim().toLowerCase();
      const value = trimmed.substring(colonIndex + 1).trim();
      
      if (!key|| !value) continue;
      
      const parsedValue = this.parseValue(value);
      const standardFields = ['title', 'description', 'author', 'categories', 'created', 'version'];
      
      if (standardFields.includes(key)) {
        metadata[key] = parsedValue;
      } else if (options.includeCustomFields) {
        metadata[key] = parsedValue;
      }
    }
    
    return metadata;
  }

  static parseValue(value: string): string | string[] {
    if (value.startsWith('[') && value.endsWith(']')) {
      const arrayContent = value.slice(1, -1).trim();
      if (!arrayContent) return [];
      
      return arrayContent
        .split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0);
    }
    
    return value;
  }

  static metadataToNoteProperties(metadata: NeorgMetadata): {
    title: string;
    tags: string[];
    content: string;
    createdAt?: number;
  } {
    const createdAt = metadata.created 
      ? new Date(metadata.created).getTime()
      : undefined;
    
    return {
      title: metadata.title || 'Untitled',
      tags: metadata.categories || [],
      content: metadata.description || '',
      createdAt,
    };
  }
}