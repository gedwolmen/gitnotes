import { MarkupType, InlineMarkup, TextSegment, ParsedInline } from '../models/NeorgInline';

export class NeorgInlineParser {
  private static markupPatterns: Array<{
    type: MarkupType;
    pattern: RegExp;
    delimiter: string;
  }> = [
    { type: 'bold', pattern: /\*([^*]+)\*/g, delimiter: '*' },
    { type: 'italic', pattern: /\/([^/]+)\//g, delimiter: '/' },
    { type: 'underline', pattern: /_([^_]+)_/g, delimiter: '_' },
    { type: 'strikethrough', pattern: /-([^-]+)-/g, delimiter: '-' },
    { type: 'spoiler', pattern: /!([^!]+)!/g, delimiter: '!' },
    { type: 'code', pattern: /`([^`]+)`/g, delimiter: '`' },
    { type: 'superscript', pattern: /\^([^^]+)\^/g, delimiter: '^' },
    { type: 'subscript', pattern: /,([^,]+),/g, delimiter: ',' },
  ];

  static parseInline(text: string): ParsedInline {
    const segments: TextSegment[] = [];
    let currentIndex = 0;
    const matches: Array<{
      type: MarkupType;
      start: number;
      end: number;
      content: string;
    }> = [];

    for (const { type, pattern } of this.markupPatterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      regex.lastIndex = 0;
      let match: RegExpExecArray | null = regex.exec(text);
      
      while (match !== null) {
        matches.push({
          type,
          start: match.index,
          end: regex.lastIndex,
          content: match[1],
        });
        match = regex.exec(text);
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
          text: text.substring(currentIndex, match.start),
        });
      }

      segments.push({
        type: 'markup',
        markup: {
          type: match.type,
          content: match.content,
        },
      });

      currentIndex = match.end;
    }

    if (currentIndex < text.length) {
      segments.push({
        type: 'text',
        text: text.substring(currentIndex),
      });
    }

    return {
      segments: segments.length > 0 ? segments : [{ type: 'text', text }],
      originalText: text,
    };
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
      };

      return {
        text: markup.content,
        style: styleMap[markup.type] || [],
      };
    });
  }
}