export const INLINE_MATH_TOKEN_PREFIX = 'GITNOTESINLINEMATHTOKEN';
export const WIKI_LINK_TOKEN_PREFIX = 'GITNOTESWIKILINKTOKEN';
export const INLINE_TOKEN_REGEX = /GITNOTES(?:INLINEMATH|WIKILINK)TOKEN\d+/g;

export type InlineSegment =
  | { type: 'text'; value: string }
  | { type: 'token'; value: string };

export function splitInlineTokens(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(INLINE_TOKEN_REGEX)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      segments.push({ type: 'text', value: text.slice(cursor, start) });
    }
    segments.push({ type: 'token', value: match[0] });
    cursor = start + match[0].length;
  }

  if (cursor < text.length) {
    segments.push({ type: 'text', value: text.slice(cursor) });
  }

  if (segments.length === 0) {
    segments.push({ type: 'text', value: text });
  }

  return segments;
}
