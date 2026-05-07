import { NeorgHeading, NeorgListItem, NeorgContentBlock, NeorgChecklistItem, NeorgContentParseResult, NeorgTableRow, NeorgDefinitionItem } from '../models/NeorgContent';

export class NeorgContentParser {
  static parseContent(content: string): NeorgContentParseResult {
    if (typeof content !== 'string') {
      return { success: false, blocks: [], error: 'Invalid content: expected string' };
    }

    try {
      const lines = content.split('\n');
      const blocks: NeorgContentBlock[] = [];
      let currentList: NeorgListItem[] | null = null;
      let currentCodeBlock: { language?: string; lines: string[]; blockType?: string } | null = null;
      let currentChecklist: NeorgChecklistItem[] | null = null;
      let currentTableRows: NeorgTableRow[] | null = null;
      let currentDefinitions: NeorgDefinitionItem[] | null = null;
      let listIndentWidth: number | null = null;
      let checklistIndentWidth: number | null = null;
      let definitionIndentWidth: number | null = null;
      let tableHasHeader: boolean[] = [];
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
        definitionIndentWidth = null;
      };

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

        if (!trimmed) {
          if (currentCodeBlock) {
            currentCodeBlock.lines.push(line);
            continue;
          }
          flushAll();
          continue;
        }

        const norgBlockMatch = trimmed.match(/^=(code|raw|embed)(?:\.(\w+))?\s*$/);
        if (norgBlockMatch && !currentCodeBlock) {
          flushAll();
          currentCodeBlock = {
            language: norgBlockMatch[1] === 'code' ? norgBlockMatch[2] : undefined,
            lines: [],
          };
          continue;
        }

        const atBlockMatch = trimmed.match(/^@(code|raw|embed|math)(?:\s+(\w+))?\s*$/);
        if (atBlockMatch && !currentCodeBlock) {
          flushAll();
          currentCodeBlock = {
            language: atBlockMatch[1] === 'code' ? (atBlockMatch[2] || undefined) : undefined,
            blockType: atBlockMatch[1] as 'code' | 'raw' | 'embed' | 'math',
            lines: [],
          };
          continue;
        }

        if ((trimmed === '=' || trimmed === '@end') && currentCodeBlock) {
          this.finalizeCodeBlock(currentCodeBlock, blocks);
          currentCodeBlock = null;
          continue;
        }

        const mdCodeMatch = line.match(/^```(\w*)$/);
        if (mdCodeMatch) {
          if (currentCodeBlock) {
            this.finalizeCodeBlock(currentCodeBlock, blocks);
            currentCodeBlock = null;
          } else {
            flushAll();
            currentCodeBlock = {
              language: mdCodeMatch[1] || undefined,
              lines: [],
            };
          }
          continue;
        }

        if (currentCodeBlock) {
          currentCodeBlock.lines.push(line);
          continue;
        }

        if (trimmed === '---') {
          flushAll();
          continue;
        }

        if (/^={3,}\s*$/.test(trimmed)) {
          flushAll();
          blocks.push({ type: 'divider' });
          continue;
        }

        if (/^_{3,}\s*$/.test(trimmed) || /^\*{3,}\s*$/.test(trimmed)) {
          flushAll();
          blocks.push({ type: 'divider' });
          continue;
        }

        if (/^\.(quote|aside)\s*$/.test(trimmed)) {
          flushAll();
          const collected: string[] = [];
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

        const rangedTagMatch = trimmed.match(/^\|([A-Za-z][\w-]*)\b(.*)$/);
        if (rangedTagMatch && !/^\|.+\|\s*$/.test(trimmed)) {
          flushAll();
          const tagName = rangedTagMatch[1].toLowerCase();
          const tagParams = rangedTagMatch[2]?.trim() || '';
          const collected: string[] = [];
          for (let j = i + 1; j < lines.length; j++) {
            if (/^\|end\s*$/.test(lines[j].trim())) {
              i = j;
              break;
            }
            collected.push(lines[j]);
          }

          if (tagName === 'comment') {
            continue;
          }

          if (tagName === 'example') {
            blocks.push({
              type: 'code',
              code: { content: collected.join('\n') },
            });
            continue;
          }

          if (tagName === 'details') {
            blocks.push({
              type: 'details',
              details: {
                summary: tagParams || undefined,
                content: collected.join('\n').trim(),
              },
            });
            continue;
          }

          const text = collected.join('\n').trim();
          if (text) {
            blocks.push({ type: 'quote', text });
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
          flushDefinitions();
          const cells = trimmed.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1).map(c => c.trim());
          if (!currentTableRows) {
            currentTableRows = [];
            tableHasHeader = [];
          }
          currentTableRows.push({ cells });
          continue;
        }

        const nextChecklistIndentWidth = this.resolveIndentWidth(checklistIndentWidth, line);
        const checklistItem = this.parseChecklistItem(line, nextChecklistIndentWidth ?? undefined);
        if (checklistItem) {
          flushParagraph();
          flushList();
          flushDefinitions();
          if (!currentChecklist) currentChecklist = [];
          checklistIndentWidth = nextChecklistIndentWidth;
          currentChecklist.push(checklistItem);
          continue;
        }

        const heading = this.parseHeading(line);
        if (heading) {
          flushAll();
          blocks.push({ type: 'heading', heading });
          continue;
        }

        const footnoteMatch = line.match(/^(\s*)\^\s+(.+)$/);
        if (footnoteMatch) {
          flushAll();
          const baseIndent = footnoteMatch[1].length;
          const contentLines: string[] = [];
          let j = i + 1;

          for (; j < lines.length; j++) {
            const candidate = lines[j];
            const candidateTrimmed = candidate.trim();
            if (!candidateTrimmed) break;
            if (this.isStructuralLine(candidate) && this.getLeadingWhitespaceWidth(candidate) <= baseIndent) break;
            contentLines.push(candidate.trim());
          }

          blocks.push({
            type: 'footnote',
            footnote: {
              label: footnoteMatch[2].trim(),
              content: contentLines.join('\n').trim(),
            },
          });
          i = j - 1;
          continue;
        }

        const nextListIndentWidth = this.resolveIndentWidth(listIndentWidth, line);
        const listItem = this.parseListItem(line, nextListIndentWidth ?? undefined);
        if (listItem) {
          flushParagraph();
          flushChecklist();
          flushDefinitions();
          if (!currentList) currentList = [];
          listIndentWidth = nextListIndentWidth;
          currentList.push(listItem);
          continue;
        }

        const nextDefinitionIndentWidth = this.resolveIndentWidth(definitionIndentWidth, line);
        const definitionItem = this.parseDefinitionItem(line, nextDefinitionIndentWidth ?? undefined);
        if (definitionItem) {
          flushParagraph();
          flushList();
          flushChecklist();
          flushTable();

          const baseIndent = this.getLeadingWhitespaceWidth(line);
          const definitionLines: string[] = [];
          let j = i + 1;

          for (; j < lines.length; j++) {
            const candidate = lines[j];
            const candidateTrimmed = candidate.trim();
            if (!candidateTrimmed) break;

            const candidateIndent = this.getLeadingWhitespaceWidth(candidate);
            if (candidateIndent <= baseIndent) break;
            if (this.isStructuralLine(candidate)) break;

            definitionLines.push(candidate.trim());
          }

          definitionItem.definition = definitionLines.join('\n').trim();

          if (!currentDefinitions) currentDefinitions = [];
          definitionIndentWidth = nextDefinitionIndentWidth;
          currentDefinitions.push(definitionItem);
          i = j - 1;
          continue;
        }

        flushList();
        flushChecklist();
        flushTable();
        flushDefinitions();

        pendingParagraphLines.push(trimmed);
      }

      flushAll();

      if (currentCodeBlock) {
        const fence = '```' + (currentCodeBlock.language ?? '');
        const text = [fence, ...currentCodeBlock.lines].join('\n');
        blocks.push({ type: 'paragraph', text });
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
      return { level: starMatch[1].length, text: starMatch[2].trim() };
    }

    const mdMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (mdMatch) {
      return { level: mdMatch[1].length, text: mdMatch[2].trim() };
    }

    return null;
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

  private static getLeadingWhitespaceWidth(line: string): number {
    const spaces = line.match(/^(\s*)/)?.[1] ?? '';
    return spaces.replace(/\t/g, '  ').length;
  }

  private static resolveIndentWidth(currentIndentWidth: number | null, line: string): number | null {
    if (currentIndentWidth) return currentIndentWidth;
    const spaces = line.match(/^(\s*)/)?.[1] ?? '';
    if (!spaces || spaces.includes('\t')) return currentIndentWidth;
    return spaces.length > 0 ? spaces.length : currentIndentWidth;
  }

  private static isStructuralLine(line: string): boolean {
    const trimmed = line.trim();

    if (!trimmed) return false;
    if (trimmed === '---' || trimmed === '=' || trimmed === '@end') return true;
    if (/^=(code|raw|embed)(?:\.(\w+))?\s*$/.test(trimmed)) return true;
    if (/^@(code|raw|embed|math)(?:\s+\w+)?\s*$/.test(trimmed)) return true;
    if (/^```(\w*)$/.test(line)) return true;
    if (/^\.(quote|aside)\s*$/.test(trimmed) || /^\.end\s*$/.test(trimmed)) return true;
    if (/^\|end\s*$/.test(trimmed)) return true;
    if (/^\|([A-Za-z][\w-]*)\b.*$/.test(trimmed) && !/^\|.+\|\s*$/.test(trimmed)) return true;
    if (/^\|.+\|\s*$/.test(trimmed)) return true;
    if (/^_{3,}\s*$/.test(trimmed) || /^\*{3,}\s*$/.test(trimmed)) return true;
    if (this.parseHeading(line)) return true;
    if (this.parseChecklistItem(line)) return true;
    if (this.parseListItem(line)) return true;
    if (this.parseDefinitionItem(line)) return true;
    if (/^(\s*)\^\s+(.+)$/.test(line)) return true;

    return false;
  }

  static parseListItem(line: string, indentWidth = 2): NeorgListItem | null {
    const indentMatch = line.match(/^(\s*)(.*)$/);
    if (!indentMatch) return null;

    const spaces = indentMatch[1];
    const indentLevel = this.getIndentLevel(spaces, indentWidth);
    const content = indentMatch[2];

    const unorderedMatch = content.match(/^\-\s+(.+)$/);
    if (unorderedMatch) {
      return { type: 'unordered', text: unorderedMatch[1].trim(), indentLevel };
    }

    const norgOrdered = content.match(/^~\s+(.+)$/);
    if (norgOrdered) {
      return { type: 'ordered', text: norgOrdered[1].trim(), indentLevel };
    }

    const counterMatch = content.match(/^~~\s+(.+)$/);
    if (counterMatch) {
      return { type: 'ordered', text: counterMatch[1].trim(), indentLevel };
    }

    const numericMatch = content.match(/^(\d+)[.)]\s+(.+)$/);
    if (numericMatch) {
      return { type: 'ordered', text: numericMatch[2].trim(), indentLevel };
    }

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

  static parseChecklistItem(line: string, indentWidth = 2): NeorgChecklistItem | null {
    const indentMatch = line.match(/^(\s*)(.*)$/);
    if (!indentMatch) return null;

    const spaces = indentMatch[1];
    const indentLevel = this.getIndentLevel(spaces, indentWidth);
    const content = indentMatch[2];

    const uncheckedMatch = content.match(/^\-\s*\[\s\]\s*(.*)$/);
    if (uncheckedMatch) {
      return { text: uncheckedMatch[1].trim(), checked: false, indentLevel };
    }

    const checkedMatch = content.match(/^\-\s*\[x\]\s*(.*)$/i);
    if (checkedMatch) {
      return { text: checkedMatch[1].trim(), checked: true, indentLevel };
    }

    return null;
  }

  static parseDefinitionItem(line: string, indentWidth = 2): NeorgDefinitionItem | null {
    const indentMatch = line.match(/^(\s*)(.*)$/);
    if (!indentMatch) return null;

    const spaces = indentMatch[1];
    const indentLevel = this.getIndentLevel(spaces, indentWidth);
    const content = indentMatch[2];

    const defMatch = content.match(/^\$\s+(.+)$/);
    if (defMatch) {
      return { term: defMatch[1].trim(), definition: '', indentLevel };
    }

    return null;
  }

  static finalizeCodeBlock(codeBlock: { language?: string; lines: string[]; blockType?: string }, blocks: NeorgContentBlock[]): void {
    const content = codeBlock.lines.join('\n');
    if (codeBlock.blockType === 'math') {
      blocks.push({
        type: 'math',
        math: { content, inline: false },
      });
      return;
    }
    blocks.push({
      type: 'code',
      code: { language: codeBlock.language, content },
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
        case 'footnote': return block.footnote ? `[^${block.footnote.label}]: ${block.footnote.content}` : '';
        case 'comment': return '';
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
