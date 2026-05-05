import { MarkupType, TextSegment, ParsedInline, InlineMarkup } from '../models/NeorgInline';

const ESCAPE_PLACEHOLDER = '\x00ESC_';

function replaceEscapes(text: string): { text: string; map: Map<number, string> } {
  const map = new Map<number, string>();
  let result = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '\\' && i + 1 < text.length) {
      const ch = text[i + 1];
      if ('*/_!`^,-'.includes(ch)) {
        const placeholder = `${ESCAPE_PLACEHOLDER}${result.length}_`;
        map.set(result.length, ch);
        result += placeholder;
        i += 2;
        continue;
      }
    }
    result += text[i];
    i++;
  }
  return { text: result, map };
}

function restoreEscapes(text: string, map: Map<number, string>): string {
  if (map.size === 0) return text;
  let result = text;
  const entries = Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  for (const [pos, ch] of entries) {
    const placeholder = `${ESCAPE_PLACEHOLDER}${pos}_`;
    result = result.replace(placeholder, ch);
  }
  return result;
}

export class NeorgInlineParser {
  private static markupPatterns: Array<{
    type: MarkupType;
    pattern: RegExp;
    delimiter: string;
    verbatim: boolean;
  }> = [
    { type: 'code', pattern: /`([^`]+)`/g, delimiter: '`', verbatim: true },
    { type: 'bold', pattern: /\*([^*]+)\*/g, delimiter: '*', verbatim: false },
    { type: 'italic', pattern: /\/([^/]+)\//g, delimiter: '/', verbatim: false },
    { type: 'underline', pattern: /_([^_]+)_/g, delimiter: '_', verbatim: false },
    { type: 'strikethrough', pattern: /-([^-]+)-/g, delimiter: '-', verbatim: false },
    { type: 'spoiler', pattern: /!([^!]+)!/g, delimiter: '!', verbatim: false },
    { type: 'superscript', pattern: /\^([^^]+)\^/g, delimiter: '^', verbatim: false },
    { type: 'subscript', pattern: /,([^,]+),/g, delimiter: ',', verbatim: false },
  ];

  static parseInline(text: string): ParsedInline {
    const { text: processedText, map: escapeMap } = replaceEscapes(text);

    const segments: TextSegment[] = [];
    let currentIndex = 0;
    const matches: Array<{
      type: MarkupType;
      start: number;
      end: number;
      content: string;
      verbatim: boolean;
    }> = [];

    for (const { type, pattern, verbatim } of this.markupPatterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      regex.lastIndex = 0;
      let match: RegExpExecArray | null = regex.exec(processedText);

      while (match !== null) {
        matches.push({
          type,
          start: match.index,
          end: regex.lastIndex,
          content: match[1],
          verbatim,
        });
        match = regex.exec(processedText);
      }
    }

    matches.sort((a, b) => a.start - b.start);

    const filteredMatches = [];
    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      let overlaps = false;

      for (const existing of filteredMatches) {
        if (
          (current.start >= existing.start && current.start < existing.end) ||
          (current.end > existing.start && current.end <= existing.end)
        ) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        filteredMatches.push(current);
      }
    }

    for (const match of filteredMatches) {
      if (match.start > currentIndex) {
        segments.push({
          type: 'text',
          text: restoreEscapes(
            processedText.substring(currentIndex, match.start),
            escapeMap,
          ),
        });
      }

      const markup = this.buildMarkup(match.type, match.content, match.verbatim, escapeMap);
      segments.push({ type: 'markup', markup });

      currentIndex = match.end;
    }

    if (currentIndex < processedText.length) {
      segments.push({
        type: 'text',
        text: restoreEscapes(processedText.substring(currentIndex), escapeMap),
      });
    }

    return {
      segments: segments.length > 0 ? segments : [{ type: 'text', text }],
      originalText: text,
    };
  }

  private static buildMarkup(
    type: MarkupType,
    content: string,
    verbatim: boolean,
    escapeMap: Map<number, string>,
  ): InlineMarkup {
    const restoredContent = restoreEscapes(content, escapeMap);

    if (verbatim) {
      return { type, content: restoredContent };
    }

    const nestedParsed = this.parseInline(restoredContent);
    const childMarkups = nestedParsed.segments
      .filter((s): s is TextSegment & { type: 'markup' } => s.type === 'markup')
      .map((s) => s.markup!);

    if (childMarkups.length > 0) {
      return { type, content: restoredContent, children: childMarkups };
    }

    return { type, content: restoredContent };
  }

  static toMarkdown(parsed: ParsedInline): string {
    return parsed.segments.map(segment => {
      if (segment.type === 'text') {
        return segment.text || '';
      }

      const markup = segment.markup;
      if (!markup) return '';

      switch (markup.type) {
        case 'bold':
          return `**${markup.content}**`;
        case 'italic':
          return `*${markup.content}*`;
        case 'strikethrough':
          return `~~${markup.content}~~`;
        case 'code':
          return `\`${markup.content}\``;
        case 'underline':
          return `<u>${markup.content}</u>`;
        case 'spoiler':
          return `||${markup.content}||`;
        case 'superscript':
          return `<sup>${markup.content}</sup>`;
        case 'subscript':
          return `<sub>${markup.content}</sub>`;
        default:
          return markup.content;
      }
    }).join('');
  }

  static toReactNativeProps(parsed: ParsedInline): Array<{
    text: string;
    style?: string[];
  }> {
    return parsed.segments.map(segment => {
      if (segment.type === 'text') {
        return { text: segment.text || '', style: [] };
      }

      const markup = segment.markup;
      if (!markup) return { text: '', style: [] };

      const styleMap: Record<MarkupType, string[]> = {
        bold: ['bold'],
        italic: ['italic'],
        underline: ['underline'],
        strikethrough: ['lineThrough'],
        spoiler: [],
        code: ['mono'],
        superscript: ['superscript'],
        subscript: ['subscript'],
        verbatim: ['mono'],
        'org-code': ['mono'],
        'org-strike': ['lineThrough'],
        link: [],
      };

      return {
        text: markup.content,
        style: styleMap[markup.type] || [],
      };
    });
  }
}
