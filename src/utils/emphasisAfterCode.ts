/**
 * Pre-#690 strategy (#684) rewrote `*italic*` / `**bold**` placed after an
 * inline-code span to `_italic_` / `__bold__`, hoping marked's underscore
 * emphasis would pick them up. In practice the rendered Text *still*
 * keeps the literal `_` / `__` delimiters in some flows (see #690).
 *
 * Instead of trusting marked's emphasis tokenizer to clean up after a
 * codespan, replace the matched emphasis with an opaque inline token. The
 * renderer reads back the original content + kind from `emphases` and emits
 * a styled `<Text>` itself — no marked-emphasis dependency, so the
 * delimiter chars can never leak.
 *
 * Only emphasis that appears AFTER an inline-code span on the same line is
 * rewritten. The original asterisk/underscore syntax outside that position
 * still flows through marked.
 */

export const EMPH_TOKEN_PREFIX = 'GITNOTESEMPHTOKEN';

export type EmphasisEmbed = {
  token: string;
  kind: 'em' | 'strong';
  content: string;
};

export type RewriteResult = {
  text: string;
  emphases: EmphasisEmbed[];
};

export function rewriteEmphasisAfterCode(text: string, startCounter = 0): RewriteResult {
  if (!text.includes('`') || (!text.includes('*') && !text.includes('_'))) {
    return { text, emphases: [] };
  }

  const emphases: EmphasisEmbed[] = [];
  let counter = startCounter;

  const rewriteSegment = (segment: string, afterCode: boolean): string => {
    if (!afterCode) return segment;

    let result = segment.replace(/(\s|^)(\*\*|__)([^*_\n]+?)\2(?!\2)/g, (_match, lead, _delim, inner) => {
      const token = `${EMPH_TOKEN_PREFIX}${counter++}`;
      emphases.push({ token, kind: 'strong', content: inner });
      return `${lead}${token}`;
    });

    result = result.replace(/(\s|^)([*_])([^*_\n]+?)\2(?!\2)/g, (_match, lead, _delim, inner) => {
      const token = `${EMPH_TOKEN_PREFIX}${counter++}`;
      emphases.push({ token, kind: 'em', content: inner });
      return `${lead}${token}`;
    });

    return result;
  };

  const rewriteLine = (line: string): string => {
    let cursor = 0;
    let out = '';
    let afterCode = false;

    while (cursor < line.length) {
      const tickStart = line.indexOf('`', cursor);
      if (tickStart === -1) {
        out += rewriteSegment(line.slice(cursor), afterCode);
        break;
      }
      const tickEnd = line.indexOf('`', tickStart + 1);
      if (tickEnd === -1) {
        out += rewriteSegment(line.slice(cursor), afterCode);
        break;
      }
      out += rewriteSegment(line.slice(cursor, tickStart), afterCode);
      out += line.slice(tickStart, tickEnd + 1);
      cursor = tickEnd + 1;
      afterCode = true;
    }

    return out;
  };

  const rewritten = text.split('\n').map(rewriteLine).join('\n');
  return { text: rewritten, emphases };
}
