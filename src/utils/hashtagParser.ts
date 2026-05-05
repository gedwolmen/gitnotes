export type HashtagPosition = {
  start: number;
  end: number;
  tag: string;
};

export type ParsedHashtags = {
  tags: string[];
  positions: HashtagPosition[];
};

const HASHTAG_REGEX = /#([A-Za-z][A-Za-z0-9_-]*)/g;

function isHexColor(tag: string): boolean {
  return /^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(tag);
}

function isInsideRanges(index: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([start, end]) => index >= start && index < end);
}

function inlineCodeRanges(line: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let index = 0;
  let openStart = -1;

  while (index < line.length) {
    if (line[index] !== '`') {
      index += 1;
      continue;
    }

    const fenceStart = index;
    while (index < line.length && line[index] === '`') {
      index += 1;
    }

    if (openStart === -1) {
      openStart = fenceStart;
    } else {
      ranges.push([openStart, index]);
      openStart = -1;
    }
  }

  return ranges;
}

export function parseHashtags(text: string): ParsedHashtags {
  const tags: string[] = [];
  const positions: HashtagPosition[] = [];
  const seen = new Set<string>();
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
      const codeRanges = inlineCodeRanges(line);
      HASHTAG_REGEX.lastIndex = 0;

      let match: RegExpExecArray | null = HASHTAG_REGEX.exec(line);
      while (match !== null) {
        const localStart = match.index;
        const localEnd = localStart + match[0].length;
        const tag = match[1]!.toLowerCase();
        const previousChar = localStart > 0 ? line[localStart - 1] : '';
        const isWordBoundaryBefore = localStart === 0 || !/[A-Za-z0-9_]/.test(previousChar);

        if (
          isWordBoundaryBefore &&
          !isInsideRanges(localStart, codeRanges) &&
          !isHexColor(tag) &&
          !seen.has(tag)
        ) {
          seen.add(tag);
          tags.push(tag);
        }

        if (
          isWordBoundaryBefore &&
          !isInsideRanges(localStart, codeRanges) &&
          !isHexColor(tag)
        ) {
          positions.push({
            start: lineStart + localStart,
            end: lineStart + localEnd,
            tag,
          });
        }

        match = HASHTAG_REGEX.exec(line);
      }
    }

    if (lineBreakIndex === -1) {
      break;
    }

    lineStart = lineBreakIndex + 1;
  }

  return { tags, positions };
}
