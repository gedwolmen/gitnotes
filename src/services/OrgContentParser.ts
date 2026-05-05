import {
  NeorgChecklistItem,
  NeorgContentBlock,
  NeorgContentParseResult,
  NeorgDefinitionItem,
  NeorgDrawer,
  NeorgHeading,
  NeorgListItem,
  NeorgTableRow,
  NeorgTimestamp,
} from '../models/NeorgContent';

type OrgCodeBlock = {
  kind: 'code' | 'quote' | 'paragraph';
  language?: string;
  lines: string[];
};

type OrgDrawerState = {
  name: string;
  lines: string[];
};

export class OrgContentParser {
  private static readonly TODO_STATES = [
    'TODO',
    'DONE',
    'IN-PROGRESS',
    'WAITING',
    'CANCELED',
    'CANCELLED',
    'SCHEDULED',
    'HOLD',
    'PROJ',
  ] as const;

  static parseContent(content: string): NeorgContentParseResult {
    if (typeof content !== 'string') {
      return { success: false, blocks: [], error: 'Invalid content: expected string' };
    }

    try {
      const lines = content.split('\n');
      const blocks: NeorgContentBlock[] = [];
      let currentList: NeorgListItem[] | null = null;
      let currentChecklist: NeorgChecklistItem[] | null = null;
      let currentDefinitions: NeorgDefinitionItem[] | null = null;
      let currentTableRows: NeorgTableRow[] | null = null;
      let tableHasHeader: boolean[] = [];
      let currentFixedWidth: string[] | null = null;
      let currentBlock: OrgCodeBlock | null = null;
      let currentDrawer: OrgDrawerState | null = null;
      let listIndentWidth: number | null = null;
      let checklistIndentWidth: number | null = null;
      let definitionIndentWidth: number | null = null;
      let pendingParagraphLines: string[] = [];

      const flushList = () => {
        if (currentList) {
          blocks.push({ type: 'list', listItems: currentList });
          currentList = null;
        }
        listIndentWidth = null;
      };

      const flushChecklist = () => {
        if (currentChecklist) {
          blocks.push({ type: 'checklist', checklistItems: currentChecklist });
          currentChecklist = null;
        }
        checklistIndentWidth = null;
      };

      const flushDefinitions = () => {
        if (currentDefinitions) {
          blocks.push({ type: 'definition', definitionItems: currentDefinitions });
          currentDefinitions = null;
        }
        definitionIndentWidth = null;
      };

      const flushTable = () => {
        if (currentTableRows && currentTableRows.length > 0) {
          blocks.push({ type: 'table', tableRows: currentTableRows, isHeaderRow: tableHasHeader });
          currentTableRows = null;
          tableHasHeader = [];
        }
      };

      const flushParagraph = () => {
        if (pendingParagraphLines.length > 0) {
          const text = pendingParagraphLines.join(' ').trim();
          if (text) {
            blocks.push({ type: 'paragraph', text });
          }
          pendingParagraphLines = [];
        }
      };

      const flushFixedWidth = () => {
        if (currentFixedWidth && currentFixedWidth.length > 0) {
          blocks.push({ type: 'fixed-width', text: currentFixedWidth.join('\n') });
        }
        currentFixedWidth = null;
      };

      const flushAll = () => {
        flushParagraph();
        flushList();
        flushChecklist();
        flushDefinitions();
        flushTable();
        flushFixedWidth();
      };

      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const trimmed = line.trim();

        if (currentDrawer) {
          if (/^:END:\s*$/i.test(trimmed)) {
            flushFixedWidth();
            blocks.push({ type: 'drawer', drawer: this.finalizeDrawer(currentDrawer) });
            currentDrawer = null;
          } else {
            currentDrawer.lines.push(line);
          }
          continue;
        }

        if (currentBlock) {
          if (/^#\+END_\w+\s*$/i.test(trimmed)) {
            blocks.push(this.finalizeBlock(currentBlock));
            currentBlock = null;
          } else {
            currentBlock.lines.push(line);
          }
          continue;
        }

        if (!trimmed) {
          flushAll();
          continue;
        }

        if (this.shouldSkipLine(trimmed)) {
          flushAll();
          continue;
        }

        const drawerMatch = trimmed.match(/^:([A-Z0-9_@#%]+):\s*$/i);
        if (drawerMatch && !/^:[^\s]+\s+/.test(trimmed)) {
          flushAll();
          currentDrawer = { name: drawerMatch[1], lines: [] };
          continue;
        }

        const blockStart = this.parseBlockStart(trimmed);
        if (blockStart) {
          flushAll();
          currentBlock = blockStart;
          continue;
        }

        const heading = this.parseHeading(line);
        if (heading) {
          flushAll();
          blocks.push({ type: 'heading', heading });
          continue;
        }

        const timestamp = this.parseTimestampLine(trimmed);
        if (timestamp) {
          flushAll();
          blocks.push({ type: 'timestamp', timestamp });
          continue;
        }

        if (/^\|.+\|\s*$/.test(trimmed)) {
          flushParagraph();
          flushList();
          flushChecklist();
          flushDefinitions();
          flushFixedWidth();

          if (/^\|[\s\-+:]+\|\s*$/.test(trimmed)) {
            if (currentTableRows && currentTableRows.length > 0) {
              tableHasHeader[currentTableRows.length - 1] = true;
            }
            continue;
          }

          const cells = trimmed
            .split('|')
            .filter((_, index, values) => index > 0 && index < values.length - 1)
            .map(cell => cell.trim());

          if (!currentTableRows) {
            currentTableRows = [];
            tableHasHeader = [];
          }

          currentTableRows.push({ cells });
          if (tableHasHeader.length < currentTableRows.length) {
            tableHasHeader.push(false);
          }
          continue;
        }

        if (/^-{5,}\s*$/.test(trimmed)) {
          flushAll();
          blocks.push({ type: 'divider' });
          continue;
        }

        if (/^:\s+/.test(line)) {
          flushParagraph();
          flushList();
          flushChecklist();
          flushDefinitions();
          flushTable();
          if (!currentFixedWidth) {
            currentFixedWidth = [];
          }
          currentFixedWidth.push(line.replace(/^:\s?/, ''));
          continue;
        }

        const nextDefinitionIndentWidth = this.resolveIndentWidth(definitionIndentWidth, line);
        const definitionItem = this.parseDefinitionItem(line, nextDefinitionIndentWidth ?? undefined);
        if (definitionItem) {
          flushParagraph();
          flushList();
          flushChecklist();
          flushTable();
          flushFixedWidth();
          if (!currentDefinitions) {
            currentDefinitions = [];
          }
          definitionIndentWidth = nextDefinitionIndentWidth;
          currentDefinitions.push(definitionItem);
          continue;
        }

        const nextChecklistIndentWidth = this.resolveIndentWidth(checklistIndentWidth, line);
        const checklistItem = this.parseChecklistItem(line, nextChecklistIndentWidth ?? undefined);
        if (checklistItem) {
          flushParagraph();
          flushList();
          flushDefinitions();
          flushTable();
          flushFixedWidth();
          if (!currentChecklist) {
            currentChecklist = [];
          }
          checklistIndentWidth = nextChecklistIndentWidth;
          currentChecklist.push(checklistItem);
          continue;
        }

        const nextListIndentWidth = this.resolveIndentWidth(listIndentWidth, line);
        const listItem = this.parseListItem(line, nextListIndentWidth ?? undefined);
        if (listItem) {
          flushParagraph();
          flushChecklist();
          flushDefinitions();
          flushTable();
          flushFixedWidth();
          if (!currentList) {
            currentList = [];
          }
          listIndentWidth = nextListIndentWidth;
          currentList.push(listItem);
          continue;
        }

        flushList();
        flushChecklist();
        flushDefinitions();
        flushTable();
        flushFixedWidth();
        pendingParagraphLines.push(trimmed);
      }

      flushAll();

      if (currentBlock) {
        blocks.push(this.finalizeBlock(currentBlock));
      }

      if (currentDrawer) {
        blocks.push({ type: 'drawer', drawer: this.finalizeDrawer(currentDrawer) });
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
    const match = line.match(/^(\*{1,7})\s+(.+)$/);
    if (!match) {
      return null;
    }

    const level = match[1].length;
    let text = match[2].trim();
    let commented = false;
    let todoState: string | undefined;
    let priority: string | undefined;
    let tags: string[] | undefined;

    const tagMatch = text.match(/\s+:(?:[^\s:]+:)+\s*$/);
    if (tagMatch) {
      const tagText = tagMatch[0].trim();
      tags = tagText.split(':').filter(Boolean);
      text = text.slice(0, text.length - tagMatch[0].length).trim();
    }

    if (/^COMMENT\b/i.test(text)) {
      commented = true;
      text = text.replace(/^COMMENT\s+/i, '').trim();
    }

    const todoPattern = new RegExp(`^(${this.TODO_STATES.join('|')})\\b`, 'i');
    const todoMatch = text.match(todoPattern);
    if (todoMatch) {
      todoState = todoMatch[1].toUpperCase();
      text = text.slice(todoMatch[0].length).trim();
    }

    const priorityMatch = text.match(/^\[#([A-C])\]\s*/i);
    if (priorityMatch) {
      priority = priorityMatch[1].toUpperCase();
      text = text.slice(priorityMatch[0].length).trim();
    }

    return {
      level,
      text,
      ...(todoState ? { todoState } : {}),
      ...(priority ? { priority } : {}),
      ...(tags && tags.length > 0 ? { tags } : {}),
      ...(commented ? { commented: true } : {}),
    };
  }

  static parseListItem(line: string, indentWidth = 2): NeorgListItem | null {
    const indentMatch = line.match(/^(\s*)(.*)$/);
    if (!indentMatch) {
      return null;
    }

    const indentLevel = this.getIndentLevel(indentMatch[1], indentWidth);
    const content = indentMatch[2];

    const unorderedMatch = content.match(/^([-+])\s+(.+)$/);
    if (unorderedMatch) {
      return { type: 'unordered', text: unorderedMatch[2].trim(), indentLevel };
    }

    const orderedMatch = content.match(/^(\d+)[.)]\s+(.+)$/);
    if (orderedMatch) {
      return { type: 'ordered', text: orderedMatch[2].trim(), indentLevel };
    }

    return null;
  }

  static parseChecklistItem(line: string, indentWidth = 2): NeorgChecklistItem | null {
    const indentMatch = line.match(/^(\s*)(.*)$/);
    if (!indentMatch) {
      return null;
    }

    const indentLevel = this.getIndentLevel(indentMatch[1], indentWidth);
    const content = indentMatch[2];

    const match = content.match(/^[-+]\s+\[([ Xx\-])\]\s*(.*)$/);
    if (!match) {
      return null;
    }

    const marker = match[1].toUpperCase();
    return {
      text: match[2].trim(),
      checked: marker === 'X',
      indentLevel,
    };
  }

  static parseDefinitionItem(line: string, indentWidth = 2): NeorgDefinitionItem | null {
    const indentMatch = line.match(/^(\s*)(.*)$/);
    if (!indentMatch) {
      return null;
    }

    const indentLevel = this.getIndentLevel(indentMatch[1], indentWidth);
    const content = indentMatch[2];
    const match = content.match(/^[-+]\s+(.+?)\s+::\s+(.+)$/);

    if (!match) {
      return null;
    }

    return {
      term: match[1].trim(),
      definition: match[2].trim(),
      indentLevel,
    };
  }

  static parseTimestampLine(line: string): NeorgTimestamp | null {
    const keywordMatch = line.match(/^(SCHEDULED|DEADLINE|CLOSED):\s*([<[].*[>\]])\s*$/i);
    if (keywordMatch) {
      const parsed = this.parseTimestampToken(keywordMatch[2]);
      if (!parsed) {
        return null;
      }

      const typeMap: Record<string, NeorgTimestamp['type']> = {
        SCHEDULED: 'scheduled',
        DEADLINE: 'deadline',
        CLOSED: 'closed',
      };

      return {
        ...parsed,
        type: typeMap[keywordMatch[1].toUpperCase()],
      };
    }

    return this.parseTimestampToken(line);
  }

  private static parseTimestampToken(token: string): NeorgTimestamp | null {
    const trimmed = token.trim();
    const match = trimmed.match(/^([<\[])(\d{4}-\d{2}-\d{2})(?:\s+[^>\]]+)?([>\]])$/);
    if (!match) {
      return null;
    }

    return {
      type: match[1] === '<' ? 'active' : 'inactive',
      date: match[2],
    };
  }

  private static parseBlockStart(line: string): OrgCodeBlock | null {
    const match = line.match(/^#\+BEGIN_(SRC|QUOTE|VERSE|EXPORT|CENTER|EXAMPLE)\b\s*(.*)$/i);
    if (!match) {
      return null;
    }

    const blockType = match[1].toUpperCase();
    const args = match[2].trim();

    if (blockType === 'SRC') {
      const language = args.split(/\s+/).filter(Boolean)[0];
      return { kind: 'code', language: language || undefined, lines: [] };
    }

    if (blockType === 'QUOTE' || blockType === 'VERSE') {
      return { kind: 'quote', lines: [] };
    }

    if (blockType === 'CENTER') {
      return { kind: 'paragraph', lines: [] };
    }

    if (blockType === 'EXPORT') {
      const language = args.split(/\s+/).filter(Boolean)[0];
      return { kind: 'code', language: language || undefined, lines: [] };
    }

    return { kind: 'code', lines: [] };
  }

  private static finalizeBlock(block: OrgCodeBlock): NeorgContentBlock {
    if (block.kind === 'quote') {
      return { type: 'quote', text: block.lines.join('\n').trim() };
    }

    if (block.kind === 'paragraph') {
      return { type: 'paragraph', text: block.lines.join(' ').trim() };
    }

    return {
      type: 'code',
      code: {
        ...(block.language ? { language: block.language } : {}),
        content: block.lines.join('\n'),
      },
    };
  }

  private static finalizeDrawer(drawer: OrgDrawerState): NeorgDrawer {
    const properties: Record<string, string> = {};

    drawer.lines.forEach((line, index) => {
      const trimmed = line.trim();
      const propertyMatch = trimmed.match(/^:([^:\s]+):\s*(.*)$/);
      if (propertyMatch) {
        properties[propertyMatch[1]] = propertyMatch[2].trim();
        return;
      }

      if (trimmed) {
        properties[`LINE_${index + 1}`] = trimmed;
      }
    });

    return {
      name: drawer.name,
      properties,
    };
  }

  private static shouldSkipLine(line: string): boolean {
    return (
      /^#\s/.test(line) ||
      /^#\+(?!BEGIN_)(?!END_)(TITLE|AUTHOR|DATE|NAME|OPTIONS|TBLFM|RESULTS|ATTR(?:_[A-Z]+)?|CAPTION|STARTUP|PROPERTY|SEQ_TODO|TAGS|LANGUAGE|EMAIL|SETUPFILE|INCLUDE|MACRO|LINK|FILETAGS|DESCRIPTION|SUBTITLE):/i.test(line) ||
      /^CLOCK:/i.test(line) ||
      /^-\s+State\s+"/i.test(line)
    );
  }

  private static getIndentLevel(spaces: string, indentWidth = 2): number {
    let level = 0;
    let consecutiveSpaces = 0;

    for (const char of spaces) {
      if (char === '\t') {
        level += 1;
        consecutiveSpaces = 0;
      } else {
        consecutiveSpaces += 1;
        if (consecutiveSpaces >= indentWidth) {
          level += 1;
          consecutiveSpaces = 0;
        }
      }
    }

    if (consecutiveSpaces > 0) {
      level += 1;
    }

    return level;
  }

  private static resolveIndentWidth(currentIndentWidth: number | null, line: string): number | null {
    if (currentIndentWidth) {
      return currentIndentWidth;
    }

    const spaces = line.match(/^(\s*)/)?.[1] ?? '';
    if (!spaces || spaces.includes('\t')) {
      return currentIndentWidth;
    }

    return spaces.length > 0 ? spaces.length : currentIndentWidth;
  }
}
