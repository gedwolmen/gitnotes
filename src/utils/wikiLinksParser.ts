export type WikiLink = {
  target: string;
  displayText: string;
  startIndex: number;
  endIndex: number;
};

const WIKI_LINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

function isEscaped(text: string, startIndex: number): boolean {
  let backslashCount = 0;

  for (let index = startIndex - 1; index >= 0 && text[index] === '\\'; index -= 1) {
    backslashCount += 1;
  }

  return backslashCount % 2 === 1;
}

export function parseWikiLinks(text: string): WikiLink[] {
  const links: WikiLink[] = [];
  let inCodeBlock = false;
  let lineStart = 0;

  while (lineStart <= text.length) {
    const lineBreakIndex = text.indexOf('\n', lineStart);
    const lineEnd = lineBreakIndex === -1 ? text.length : lineBreakIndex;
    const line = text.slice(lineStart, lineEnd);
    const trimmedLine = line.trimStart();

    if (trimmedLine.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
    } else if (!inCodeBlock) {
      WIKI_LINK_REGEX.lastIndex = 0;

      let match: RegExpExecArray | null = WIKI_LINK_REGEX.exec(line);
      while (match !== null) {
        const startIndex = lineStart + match.index;

        if (!isEscaped(text, startIndex)) {
          const target = match[1].trim();
          const displayText = match[2]?.trim() ?? target;

          links.push({
            target,
            displayText,
            startIndex,
            endIndex: startIndex + match[0].length,
          });
        }

        match = WIKI_LINK_REGEX.exec(line);
      }
    }

    if (lineBreakIndex === -1) {
      break;
    }

    lineStart = lineBreakIndex + 1;
  }

  return links;
}
