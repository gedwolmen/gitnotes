export type WikiLink = {
  target: string;
  displayText: string;
  startIndex: number;
  endIndex: number;
  blockAnchor?: string;
};

const WIKI_LINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const BLOCK_ANCHOR_REGEX = /\[\[(.*?)#\^([^\]|]+)(?:\|([^\]]+))?\]\]/g;

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
      BLOCK_ANCHOR_REGEX.lastIndex = 0;

      const lineMatches: Array<{ start: number; end: number; link: WikiLink }> = [];

      let match: RegExpExecArray | null = WIKI_LINK_REGEX.exec(line);
      while (match !== null) {
        const startIndex = lineStart + match.index;

        if (!isEscaped(text, startIndex)) {
          const target = match[1].trim();
          const displayText = match[2]?.trim() ?? target;

          lineMatches.push({
            start: startIndex,
            end: startIndex + match[0].length,
            link: { target, displayText, startIndex, endIndex: startIndex + match[0].length },
          });
        }

        match = WIKI_LINK_REGEX.exec(line);
      }

      let blockMatch: RegExpExecArray | null = BLOCK_ANCHOR_REGEX.exec(line);
      while (blockMatch !== null) {
        const startIndex = lineStart + blockMatch.index;

        if (!isEscaped(text, startIndex)) {
          const target = blockMatch[1].trim();
          const blockAnchor = blockMatch[2].trim();
          const displayText = blockMatch[3]?.trim() ?? target;

          lineMatches.push({
            start: startIndex,
            end: startIndex + blockMatch[0].length,
            link: { target, displayText, startIndex, endIndex: startIndex + blockMatch[0].length, blockAnchor },
          });
        }

        blockMatch = BLOCK_ANCHOR_REGEX.exec(line);
      }

      const basicLinks = lineMatches.filter(m => m.link.blockAnchor === undefined);
      const blockAnchorLinks = lineMatches.filter(m => m.link.blockAnchor !== undefined);

      const basicPositions = new Set(basicLinks.map(m => m.start));

      for (const m of basicLinks) {
        links.push(m.link);
      }
      for (const m of blockAnchorLinks) {
        if (basicPositions.has(m.start)) {
          const idx = links.findIndex(l => l.startIndex === m.start && l.blockAnchor === undefined);
          if (idx !== -1) links.splice(idx, 1);
        }
        links.push(m.link);
      }
    }

    if (lineBreakIndex === -1) {
      break;
    }

    lineStart = lineBreakIndex + 1;
  }

  return links;
}
