export type MathSegment = {
  type: 'inline' | 'block';
  content: string;
  startIndex: number;
  endIndex: number;
};

function isEscaped(text: string, index: number): boolean {
  let backslashCount = 0;

  for (let i = index - 1; i >= 0 && text[i] === '\\'; i -= 1) {
    backslashCount += 1;
  }

  return backslashCount % 2 === 1;
}

function findNextSingleDollar(text: string, fromIndex: number): number {
  for (let i = fromIndex; i < text.length; i += 1) {
    if (text[i] !== '$') {
      continue;
    }

    if (text[i + 1] === '$') {
      i += 1;
      continue;
    }

    if (!isEscaped(text, i)) {
      return i;
    }
  }

  return -1;
}

function findNextDoubleDollar(text: string, fromIndex: number): number {
  for (let i = fromIndex; i < text.length - 1; i += 1) {
    if (text[i] !== '$' || text[i + 1] !== '$') {
      continue;
    }

    if (!isEscaped(text, i)) {
      return i;
    }
  }

  return -1;
}

function isValidInlineContent(content: string): boolean {
  if (content.length === 0) {
    return false;
  }

  if (content.trim().length === 0) {
    return false;
  }

  return !/\n/.test(content) && !/^\s/.test(content) && !/\s$/.test(content) && !content.includes('$');
}

export function parseMath(text: string): MathSegment[] {
  const segments: MathSegment[] = [];

  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '$' || isEscaped(text, i)) {
      continue;
    }

    if (text[i + 1] === '$') {
      const end = findNextDoubleDollar(text, i + 2);

      if (end === -1) {
        continue;
      }

      segments.push({
        type: 'block',
        content: text.slice(i + 2, end),
        startIndex: i,
        endIndex: end + 2,
      });

      i = end + 1;
      continue;
    }

    const end = findNextSingleDollar(text, i + 1);

    if (end === -1) {
      continue;
    }

    const content = text.slice(i + 1, end);

    if (!isValidInlineContent(content)) {
      continue;
    }

    segments.push({
      type: 'inline',
      content,
      startIndex: i,
      endIndex: end + 1,
    });

    i = end;
  }

  return segments;
}
