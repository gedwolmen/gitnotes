import { MarkupType, InlineMarkup, TextSegment, ParsedInline } from '../models/NeorgInline';

const PRE_CHARS = new Set([' ', '\t', '\n', '\r', '(', '{', "'", '"']);
const POST_CHARS = new Set([' ', '\t', '\n', '\r', '.', ',', ';', ':', '!', '?', "'", ')', '}', '"']);

type OrgMarkupDef = {
  type: MarkupType;
  delimiter: string;
  verbatim: boolean;
};

const ORG_MARKUP_DEFS: OrgMarkupDef[] = [
  { type: 'verbatim', delimiter: '=', verbatim: true },
  { type: 'org-code', delimiter: '~', verbatim: true },
  { type: 'bold', delimiter: '*', verbatim: false },
  { type: 'italic', delimiter: '/', verbatim: false },
  { type: 'underline', delimiter: '_', verbatim: false },
  { type: 'org-strike', delimiter: '+', verbatim: false },
];

interface RawMatch {
  type: MarkupType;
  start: number;
  end: number;
  content: string;
  verbatim: boolean;
}

function isPre(text: string, pos: number): boolean {
  if (pos <= 0) return true;
  return PRE_CHARS.has(text[pos - 1]);
}

function isPost(text: string, pos: number): boolean {
  if (pos >= text.length) return true;
  return POST_CHARS.has(text[pos]);
}

function findDelimiterMatch(
  text: string,
  delimiter: string,
  startPos: number,
): number | null {
  for (let i = startPos; i < text.length; i++) {
    if (text[i] === delimiter && i > startPos) {
      return i;
    }
  }
  return null;
}

function findOrgLinks(text: string): RawMatch[] {
  const results: RawMatch[] = [];
  const linkRegex = /\[\[([^\]]+)\](?:\[([^\]]*)\])?\]/g;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(text)) !== null) {
    const target = match[1];
    const label = match[2] ?? target;
    results.push({
      type: 'bold',
      start: match.index,
      end: match.index + match[0].length,
      content: label,
      verbatim: true,
    });
  }

  return results;
}

function findFootnoteRefs(text: string): RawMatch[] {
  const results: RawMatch[] = [];
  const fnRegex = /\[fn:([^\]]+)\]/g;
  let match: RegExpExecArray | null;

  while ((match = fnRegex.exec(text)) !== null) {
    const label = match[1];
    if (!label) continue;
    results.push({
      type: 'bold',
      start: match.index,
      end: match.index + match[0].length,
      content: `[fn:${label}]`,
      verbatim: true,
    });
  }

  return results;
}

function findMarkupMatches(text: string, def: OrgMarkupDef): RawMatch[] {
  const results: RawMatch[] = [];
  const d = def.delimiter;

  for (let i = 0; i < text.length; i++) {
    if (text[i] !== d) continue;
    if (i > 0 && text[i - 1] === '\\') continue;
    if (!isPre(text, i)) continue;

    const closingPos = findDelimiterMatch(text, d, i + 1);
    if (closingPos === null) continue;

    const content = text.slice(i + 1, closingPos);
    if (!content) continue;
    if (content.includes('\n')) continue;

    if (!isPost(text, closingPos + 1)) continue;

    results.push({
      type: def.type,
      start: i,
      end: closingPos + 1,
      content,
      verbatim: def.verbatim,
    });
  }

  return results;
}

export class OrgInlineParser {
  static parseInline(text: string): ParsedInline {
    const unescaped = text.replace(/\\([*/_=~+])/g, (_, ch) => `\x00ESCAPED_${ch.charCodeAt(0)}\x00`);

    let allMatches: RawMatch[] = [];

    const links = findOrgLinks(unescaped);
    const footnotes = findFootnoteRefs(unescaped);
    allMatches.push(...links, ...footnotes);

    for (const def of ORG_MARKUP_DEFS) {
      allMatches.push(...findMarkupMatches(unescaped, def));
    }

    allMatches.sort((a, b) => a.start - b.start);

    const filtered: RawMatch[] = [];
    for (const match of allMatches) {
      let overlaps = false;
      for (const existing of filtered) {
        if (
          (match.start >= existing.start && match.start < existing.end) ||
          (match.end > existing.start && match.end <= existing.end) ||
          (match.start <= existing.start && match.end >= existing.end)
        ) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) {
        filtered.push(match);
      }
    }

    const segments: TextSegment[] = [];
    let currentIndex = 0;

    for (const match of filtered) {
      if (match.start > currentIndex) {
        segments.push({
          type: 'text',
          text: restoreEscapes(unescaped.substring(currentIndex, match.start)),
        });
      }

      const markup = this.buildMarkup(match.type, match.content, match.verbatim);
      segments.push({ type: 'markup', markup });

      currentIndex = match.end;
    }

    if (currentIndex < unescaped.length) {
      segments.push({
        type: 'text',
        text: restoreEscapes(unescaped.substring(currentIndex)),
      });
    }

    return {
      segments: segments.length > 0 ? segments : [{ type: 'text', text: restoreEscapes(text) }],
      originalText: text,
    };
  }

  private static buildMarkup(type: MarkupType, content: string, verbatim: boolean): InlineMarkup {
    const restoredContent = restoreEscapes(content);

    if (verbatim) {
      return { type, content: restoredContent };
    }

    const nestedParsed = this.parseInline(content);
    const childMarkups = nestedParsed.segments
      .filter((s): s is TextSegment & { type: 'markup' } => s.type === 'markup')
      .map((s) => s.markup!);

    if (childMarkups.length > 0) {
      return { type, content: restoredContent, children: childMarkups };
    }

    return { type, content: restoredContent };
  }

  static toMarkdown(parsed: ParsedInline): string {
    return parsed.segments.map((segment) => {
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
        case 'underline':
          return `<u>${markup.content}</u>`;
        case 'org-strike':
          return `~~${markup.content}~~`;
        case 'verbatim':
          return `\`${markup.content}\``;
        case 'org-code':
          return `\`${markup.content}\``;
        default:
          return markup.content;
      }
    }).join('');
  }

  static toReactNativeProps(
    parsed: ParsedInline,
  ): Array<{ text: string; style?: string[] }> {
    return parsed.segments.map((segment) => {
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
      };

      return {
        text: markup.content,
        style: styleMap[markup.type] || [],
      };
    });
  }
}

function restoreEscapes(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x00ESCAPED_(\d+)\x00/g, (_, code) =>
    String.fromCharCode(parseInt(code, 10)),
  );
}
