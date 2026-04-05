import { NeorgHeading, NeorgListItem, NeorgContentBlock, NeorgContentParseResult } from '../models/NeorgContent';

export class NeorgContentParser {
  static parseContent(content: string): NeorgContentParseResult {
    try {
      const lines = content.split('\n');
      const blocks: NeorgContentBlock[] = [];
      let currentList: NeorgListItem[] | null = null;
      let currentCodeBlock: { language?: string; lines: string[] } | null = null;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        if (!trimmed) {
          if (currentList) {
            blocks.push({ type: 'list', listItems: currentList });
            currentList = null;
          }
          if (currentCodeBlock) {
            this.finalizeCodeBlock(currentCodeBlock, blocks);
            currentCodeBlock = null;
          }
          continue;
        }
        
        // Check for code block start/end
        const codeBlockInfo = this.parseCodeBlockLine(line, i === 0);
        if (codeBlockInfo) {
          if (codeBlockInfo.isOpen) {
            // Start new code block
            currentCodeBlock = {
              language: codeBlockInfo.language,
              lines: []
            };
          } else if (currentCodeBlock && codeBlockInfo.isClose) {
            // Close current code block
            this.finalizeCodeBlock(currentCodeBlock, blocks);
            currentCodeBlock = null;
          }
          continue;
        }
        
        // If inside a code block, add content
        if (currentCodeBlock) {
          currentCodeBlock.lines.push(line);
          continue;
        }
        
        const heading = this.parseHeading(line);
        if (heading) {
          if (currentList) {
            blocks.push({ type: 'list', listItems: currentList });
            currentList = null;
          }
          blocks.push({ type: 'heading', heading });
          continue;
        }
        
        const listItem = this.parseListItem(line);
        if (listItem) {
          if (!currentList) {
            currentList = [];
          }
          currentList.push(listItem);
          continue;
        }
        
        if (currentList) {
          blocks.push({ type: 'list', listItems: currentList });
          currentList = null;
        }
        
        blocks.push({ type: 'paragraph', text: trimmed });
      }
      
      if (currentList) {
        blocks.push({ type: 'list', listItems: currentList });
      }
      
      if (currentCodeBlock) {
        this.finalizeCodeBlock(currentCodeBlock, blocks);
      }
      
      return { success: true, blocks };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown parsing error',
      };
    }
  }

  static parseHeading(line: string): NeorgHeading | null {
    const match = line.match(/^(\*{1,6})\s+(.+)$/);
    if (!match) return null;
    
    const level = match[1].length;
    const text = match[2].trim();
    
    return { level, text };
  }

  static parseListItem(line: string): NeorgListItem | null {
    const trimmed = line;
    const indentMatch = trimmed.match(/^(\s*)(.*)$/);
    if (!indentMatch) return null;
    
    const spaces = indentMatch[1];
    const indentLevel = Math.floor(spaces.length / 2);
    const content = indentMatch[2];
    
    const unorderedMatch = content.match(/^-\s+(.+)$/);
    if (unorderedMatch) {
      return {
        type: 'unordered',
        text: unorderedMatch[1].trim(),
        indentLevel,
      };
    }
    
    const orderedMatch = content.match(/^~\s+(.+)$/);
    if (orderedMatch) {
      return {
        type: 'ordered',
        text: orderedMatch[1].trim(),
        indentLevel,
      };
    }
    
    const taskMatch = content.match(/^\(( )\)\s+(.+)$/);
    if (taskMatch) {
      return {
        type: 'task',
        text: taskMatch[2].trim(),
        status: 'todo',
        indentLevel,
      };
    }
    
    const taskDoneMatch = content.match(/^\(x\)\s+(.+)$/);
    if (taskDoneMatch) {
      return {
        type: 'task',
        text: taskDoneMatch[1].trim(),
        status: 'done',
        indentLevel,
      };
    }
    
    const taskImportantMatch = content.match(/^\(!\)\s+(.+)$/);
    if (taskImportantMatch) {
      return {
        type: 'task',
        text: taskImportantMatch[1].trim(),
        status: 'important',
        indentLevel,
      };
    }
    
    const taskUncertainMatch = content.match(/^\(\?\)\s+(.+)$/);
    if (taskUncertainMatch) {
      return {
        type: 'task',
        text: taskUncertainMatch[1].trim(),
        status: 'uncertain',
        indentLevel,
      };
    }
    
    return null;
  }

  static headingToMarkdown(heading: NeorgHeading): string {
    const prefix = '#'.repeat(heading.level);
    return `${prefix} ${heading.text}`;
  }

  static parseCodeBlockLine(line: string, isFirst: boolean): { isOpen: boolean; isClose: boolean; language?: string } | null {
    const openMatch = line.match(/^```(\w*)$/);
    if (openMatch) {
      return { isOpen: true, isClose: false, language: openMatch[1] || undefined };
    }
    
    if (line.trim() === '```') {
      return { isOpen: false, isClose: true };
    }
    
    return null;
  }

  static finalizeCodeBlock(codeBlock: { language?: string; lines: string[] }, blocks: NeorgContentBlock[]): void {
    blocks.push({
      type: 'code',
      code: {
        language: codeBlock.language,
        content: codeBlock.lines.join('\n'),
      },
    });
  }

  static listToMarkdown(items: NeorgListItem[]): string {
    return items.map(item => {
      const indent = '  '.repeat(item.indentLevel);
      const prefix = item.type === 'ordered' ? '1.' : '-';
      
      if (item.type === 'task') {
        const checkbox = item.status === 'done' ? '[x]' : '[ ]';
        return `${indent}- ${checkbox} ${item.text}`;
      }
      
      return `${indent}${prefix} ${item.text}`;
    }).join('\n');
  }

  static contentToMarkdown(blocks: NeorgContentBlock[]): string {
    return blocks.map(block => {
      switch (block.type) {
        case 'heading':
          return block.heading ? this.headingToMarkdown(block.heading) : '';
        case 'list':
          return block.listItems ? this.listToMarkdown(block.listItems) : '';
        case 'paragraph':
          return block.text || '';
        default:
          return '';
      }
    }).join('\n\n');
  }
}