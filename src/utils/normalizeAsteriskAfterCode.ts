/**
 * react-native-marked / marked has a quirk where `*italic*` or `**bold**`
 * placed immediately after a closing inline-code backtick (inside a list
 * item) renders raw — the asterisks are not interpreted as emphasis. The
 * underscore form (`_italic_` / `__bold__`) does not have this problem.
 *
 * Rewrite asterisk emphasis to underscore emphasis in that specific
 * position. The contents of the code span are left untouched (so an
 * asterisk *inside* the backticks stays literal, as it should).
 */
export function normalizeAsteriskAfterCode(text: string): string {
  if (!text.includes('`') || !text.includes('*')) return text;

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    lines[i] = rewriteLine(lines[i]);
  }
  return lines.join('\n');
}

function rewriteLine(line: string): string {
  let out = '';
  let cursor = 0;
  let lastEmittedWasCode = false;

  while (cursor < line.length) {
    const tickStart = line.indexOf('`', cursor);
    if (tickStart === -1) {
      out += rewriteAfterCode(line.slice(cursor), lastEmittedWasCode);
      break;
    }

    const tickEnd = line.indexOf('`', tickStart + 1);
    if (tickEnd === -1) {
      out += rewriteAfterCode(line.slice(cursor), lastEmittedWasCode);
      break;
    }

    out += rewriteAfterCode(line.slice(cursor, tickStart), lastEmittedWasCode);
    out += line.slice(tickStart, tickEnd + 1);
    cursor = tickEnd + 1;
    lastEmittedWasCode = true;
  }

  return out;
}

function rewriteAfterCode(segment: string, afterCode: boolean): string {
  if (!afterCode) return segment;

  let result = segment.replace(/(\s|^)\*\*([^*\n]+?)\*\*(?!\*)/g, (_match, lead, inner) => {
    return `${lead}__${inner}__`;
  });

  result = result.replace(/(\s|^)\*([^*\n]+?)\*(?!\*)/g, (_match, lead, inner) => {
    return `${lead}_${inner}_`;
  });

  return result;
}
