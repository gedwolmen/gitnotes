import { NeorgHeading, NeorgListItem, NeorgContentBlock, NeorgChecklistItem, NeorgContentParseResult, NeorgTableRow, NeorgDefinitionItem } from '../models/NeorgContent';

export class NeorgContentParser {
  static parseContent(content: string): NeorgContentParseResult {
    try {
      const lines = content.split('\n');
      const blocks: NeorgContentBlock[] = [];
      let currentList: NeorgListItem[] | null = null;
      let currentCodeBlock: { language?: string; lines: string[] } | null = null;
      let currentChecklist: NeorgChecklistItem[] | null = null;
      let currentTableRows: NeorgTableRow[] | null = null;
      let currentDefinitions: NeorgDefinitionItem[] | null = null;
      let tableHasHeader: boolean[] = [];
      let inOrgDrawer = false;
      let inOrgBlock = false;
      let orgBlockType = '';
      let orgBlockLines: string[] = [];

      const flushList = () => {
        if (currentList) {
          blocks.push({ type: 'list', listItems: currentList });
          currentList = null;
        }
      };

      const flushChecklist = () => {
        if (currentChecklist) {
          blocks.push({ type: 'checklist', checklistItems: currentChecklist });
          currentChecklist = null;
        }
      };

      const flushTable = () => {
        if (currentTableRows && currentTableRows.length > 0) {
          blocks.push({ type: 'table', tableRows: currentTableRows, isHeaderRow: tableHasHeader });
          currentTableRows = null;
          tableHasHeader = [];
        }
      };

      const flushDefinitions = () => {
        if (currentDefinitions) {
          blocks.push({ type: 'definition', definitionItems: currentDefinitions });
          currentDefinitions = null;
        }
      };

      let pendingParagraphLines: string[] = [];

      const flushParagraph = () => {
        if (pendingParagraphLines.length > 0) {
          const joined = pendingParagraphLines.join(' ').trim();
          if (joined) {
            blocks.push({ type: 'paragraph', text: joined });
          }
          pendingParagraphLines = [];
        }
      };

      const flushAll = () => {
        flushParagraph();
        flushList();
        flushChecklist();
        flushTable();
        flushDefinitions();
      };

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (/^:\s*(PROPERTIES|LOGBOOK|END)\s*:\s*$/.test(trimmed)) {
          if (trimmed.includes(':END:')) {
            inOrgDrawer = false;
          } else {
            flushAll();
            inOrgDrawer = true;
          }
          continue;
        }
        if (inOrgDrawer) continue;

        const orgBlockBegin = trimmed.match(/^#\+BEGIN_(\w+)\s*(.*)$/i);
        if (orgBlockBegin) {
          flushAll();
          orgBlockType = orgBlockBegin[1].toUpperCase();
          orgBlockLines = [];
          inOrgBlock = true;
          continue;
        }

        if (inOrgBlock && /^#\+END_\w+\s*$/i.test(trimmed)) {
          if (orgBlockType === 'QUOTE' || orgBlockType === 'ABSTRACT') {
            blocks.push({ type: 'quote', text: orgBlockLines.join('\n').trim() });
          } else {
            blocks.push({
              type: 'code',
              code: { content: orgBlockLines.join('\n') },
            });
          }
          inOrgBlock = false;
          orgBlockLines = [];
          continue;
        }
        if (inOrgBlock) {
          orgBlockLines.push(line);
          continue;
        }

        if (/^(SCHEDULED|DEADLINE|CLOSED)\s*:/i.test(trimmed)) continue;
        if (/^#\+(NAME|TBLFM|RESULTS|ATTR|CAPTION|OPTIONS|STARTUP|PROPERTY|SEQ_TODO|TAGS|LANGUAGE|EMAIL|AUTHOR|DATE|SETUPFILE|INCLUDE|MACRO|LINK)\s*:/i.test(trimmed)) continue;
        if (/^#\+LINK\s*:/i.test(trimmed)) continue;

        if (/^CLOCK\s*:/i.test(trimmed)) continue;
        if (/^-\s+State\s+"/i.test(trimmed)) continue;

        if (!trimmed) {
          if (currentCodeBlock) {
            currentCodeBlock.lines.push(line);
            continue;
          }
          flushAll();
          continue;
        }

        const norgBlockMatch = trimmed.match(/^=(code|raw|embed(?:\.\w+)?)\s*$/);
        if (norgBlockMatch && !currentCodeBlock) {
          flushAll();
          currentCodeBlock = {
            language: norgBlockMatch[1].startsWith('code') && norgBlockMatch[1].includes('.')
              ? norgBlockMatch[1].split('.')[1]
              : undefined,
            lines: [],
          };
          continue;
        }

        if (trimmed === '=' && currentCodeBlock) {
          this.finalizeCodeBlock(currentCodeBlock, blocks);
          currentCodeBlock = null;
          continue;
        }

        if (currentCodeBlock) {
          currentCodeBlock.lines.push(line);
          continue;
        }

        const mdCodeMatch = line.match(/^```(\w*)$/);
        if (mdCodeMatch) {
          flushAll();
          currentCodeBlock = {
            language: mdCodeMatch[1] || undefined,
            lines: [],
          };
          continue;
        }

        if (/^-{3,}\s*$/.test(trimmed)) {
          flushAll();
          blocks.push({ type: 'divider' });
          continue;
        }

        if (/^\.(quote|aside|footnote)\s*$/.test(trimmed)) {
          flushAll();
          let collected: string[] = [];
          for (let j = i + 1; j < lines.length; j++) {
            if (/^\.end\s*$/.test(lines[j].trim())) {
              i = j;
              break;
            }
            collected.push(lines[j]);
          }
          if (collected.length > 0) {
            blocks.push({ type: 'quote', text: collected.join('\n').trim() });
          }
          continue;
        }

        if (/^\|.+\|\s*$/.test(trimmed)) {
          if (/^\|[\s\-+:]+\|\s*$/.test(trimmed)) {
            if (currentTableRows) {
              tableHasHeader.push(true);
            }
            continue;
          }
          flushParagraph();
          flushList();
          flushChecklist();
          const cells = trimmed.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1).map(c => c.trim());
          if (!currentTableRows) {
            currentTableRows = [];
            tableHasHeader = [];
          }
          currentTableRows.push({ cells });
          continue;
        }

        const checklistItem = this.parseChecklistItem(line);
        if (checklistItem) {
          flushParagraph();
          flushList();
          flushDefinitions();
          if (!currentChecklist) currentChecklist = [];
          currentChecklist.push(checklistItem);
          continue;
        }

        const heading = this.parseHeading(line);
        if (heading) {
          flushAll();
          blocks.push({ type: 'heading', heading });
          continue;
        }

        const listItem = this.parseListItem(line);
        if (listItem) {
          flushParagraph();
          flushChecklist();
          flushDefinitions();
          if (!currentList) currentList = [];
          currentList.push(listItem);
          continue;
        }

        const definitionItem = this.parseDefinitionItem(line);
        if (definitionItem) {
          flushParagraph();
          flushList();
          flushChecklist();
          if (!currentDefinitions) currentDefinitions = [];
          currentDefinitions.push(definitionItem);
          continue;
        }

        flushList();
        flushChecklist();
        flushTable();

        pendingParagraphLines.push(trimmed);
      }

      flushAll();

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
    const starMatch = line.match(/^(\*{1,7})\s+(.+)$/);
    if (starMatch) {
      const level = starMatch[1].length;
      let text = starMatch[2].trim();
      // Strip org TODO keywords
      text = text.replace(/^(TODO|DONE|IN-PROGRESS|WAITING|CANCELED|CANCELLED|SCHEDULED)\s+/i, '');
      // Strip priority cookie [#A]
      text = text.replace(/^\[#[A-C]\]\s*/i, '');
      // Strip trailing tags :tag1:tag2: (tags have colons on both sides)
      text = text.replace(/\s+:[\w@]+(:[\w@]+)*:\s*$/, '');
      return { level, text: text || starMatch[2].trim() };
    }

    // Markdown: # heading
    const mdMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (mdMatch) {
      return { level: mdMatch[1].length, text: mdMatch[2].trim() };
    }

    return null;
  }

  static parseListItem(line: string): NeorgListItem | null {
    const indentMatch = line.match(/^(\s*)(.*)$/);
    if (!indentMatch) return null;

    const spaces = indentMatch[1];
    const indentLevel = Math.floor(spaces.length / 2);
    const content = indentMatch[2];

    // Unordered: - item
    const unorderedMatch = content.match(/^-\s+(.+)$/);
    if (unorderedMatch) {
      return { type: 'unordered', text: unorderedMatch[1].trim(), indentLevel };
    }

    // Norg ordered: ~ item
    const norgOrdered = content.match(/^~\s+(.+)$/);
    if (norgOrdered) {
      return { type: 'ordered', text: norgOrdered[1].trim(), indentLevel };
    }

    // Norg counter list: ~~ item
    const counterMatch = content.match(/^~~\s+(.+)$/);
    if (counterMatch) {
      return { type: 'ordered', text: counterMatch[1].trim(), indentLevel };
    }

    // Numeric ordered: 1. item or 1) item
    const numericMatch = content.match(/^(\d+)[.)]\s+(.+)$/);
    if (numericMatch) {
      return { type: 'ordered', text: numericMatch[2].trim(), indentLevel };
    }

    // Norg task: ( ) item, (x) item, (!) item, (?) item, (~) in-progress, (u) urgent, (-) cancelled, (_) on-hold, (+) recurring
    const taskMatch = content.match(/^\(([ x!?~u\-_+])\)\s+(.+)$/);
    if (taskMatch) {
      const statusMap: Record<string, 'todo' | 'done' | 'important' | 'uncertain' | 'in-progress' | 'urgent' | 'cancelled' | 'on-hold' | 'recurring'> = {
        ' ': 'todo', 'x': 'done', '!': 'important', '?': 'uncertain',
        '~': 'in-progress', 'u': 'urgent', '-': 'cancelled', '_': 'on-hold', '+': 'recurring',
      };
      return { type: 'task', text: taskMatch[2].trim(), status: statusMap[taskMatch[1]] || 'todo', indentLevel };
    }

    return null;
  }

  static parseChecklistItem(line: string): NeorgChecklistItem | null {
    const indentMatch = line.match(/^(\s*)(.*)$/);
    if (!indentMatch) return null;

    const spaces = indentMatch[1];
    const indentLevel = Math.floor(spaces.length / 2);
    const content = indentMatch[2];

    // - [ ] or - [x] (markdown and norg task syntax)
    const uncheckedMatch = content.match(/^-\s*\[\s\]\s*(.*)$/);
    if (uncheckedMatch) {
      return { text: uncheckedMatch[1].trim(), checked: false, indentLevel };
    }

    const checkedMatch = content.match(/^-\s*\[x\]\s*(.*)$/i);
    if (checkedMatch) {
      return { text: checkedMatch[1].trim(), checked: true, indentLevel };
    }

    return null;
  }

  static parseDefinitionItem(line: string): NeorgDefinitionItem | null {
    const indentMatch = line.match(/^(\s*)(.*)$/);
    if (!indentMatch) return null;

    const spaces = indentMatch[1];
    const indentLevel = Math.floor(spaces.length / 2);
    const content = indentMatch[2];

    // Neorg definition: $ Term
    //   Definition text
    const defMatch = content.match(/^\$\s+(.+)$/);
    if (defMatch) {
      return { term: defMatch[1].trim(), definition: '', indentLevel };
    }

    return null;
  }

  static finalizeCodeBlock(codeBlock: { language?: string; lines: string[] }, blocks: NeorgContentBlock[]): void {
    blocks.push({
      type: 'code',
      code: { language: codeBlock.language, content: codeBlock.lines.join('\n') },
    });
  }

  static headingToMarkdown(heading: NeorgHeading): string {
    return `${'#'.repeat(heading.level)} ${heading.text}`;
  }

  static listToMarkdown(items: NeorgListItem[]): string {
    return items.map(item => {
      const indent = '  '.repeat(item.indentLevel);
      const prefix = item.type === 'ordered' ? '1.' : '-';
      if (item.type === 'task') {
        return `${indent}- ${item.status === 'done' ? '[x]' : '[ ]'} ${item.text}`;
      }
      return `${indent}${prefix} ${item.text}`;
    }).join('\n');
  }

  static checklistToMarkdown(items: NeorgChecklistItem[]): string {
    return items.map(item => {
      const indent = '  '.repeat(item.indentLevel);
      return `${indent}- ${item.checked ? '[x]' : '[ ]'} ${item.text}`;
    }).join('\n');
  }

  static contentToMarkdown(blocks: NeorgContentBlock[]): string {
    return blocks.map(block => {
      switch (block.type) {
        case 'heading': return block.heading ? this.headingToMarkdown(block.heading) : '';
        case 'list': return block.listItems ? this.listToMarkdown(block.listItems) : '';
        case 'paragraph': return block.text || '';
        case 'code': return block.code ? this.codeToMarkdown(block.code) : '';
        case 'checklist': return block.checklistItems ? this.checklistToMarkdown(block.checklistItems) : '';
        case 'table': return block.tableRows ? this.tableToMarkdown(block.tableRows) : '';
        case 'quote': return block.text ? `> ${block.text.replace(/\n/g, '\n> ')}` : '';
        case 'divider': return '---';
        case 'definition': return block.definitionItems
          ? block.definitionItems.map(d => `**${d.term}**: ${d.definition}`).join('\n')
          : '';
        default: return '';
      }
    }).join('\n\n');
  }

  private static codeToMarkdown(code: { language?: string; content: string }): string {
    return `\`\`\`${code.language || ''}\n${code.content.trim()}\n\`\`\``;
  }

  private static tableToMarkdown(rows: NeorgTableRow[]): string {
    if (rows.length === 0) return '';
    return rows.map((row, idx) => {
      const line = `| ${row.cells.join(' | ')} |`;
      if (idx === 0) return line + '\n| ' + row.cells.map(() => '---').join(' | ') + ' |';
      return line;
    }).join('\n');
  }
}
