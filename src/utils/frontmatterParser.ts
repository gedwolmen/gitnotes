export type FrontmatterResult = {
  frontmatter: Record<string, unknown>;
  body: string;
  frontmatterStart: number;
  frontmatterEnd: number;
};

const FRONTMATTER_DELIMITER = '---';

type LineInfo = {
  text: string;
  start: number;
  end: number;
  nextIndex: number;
};

function collectLines(content: string): LineInfo[] {
  const lines: LineInfo[] = [];
  const pattern = /([^\r\n]*)(\r?\n|$)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const text = match[1];
    const newline = match[2];
    const start = match.index;
    const end = start + text.length;
    const nextIndex = end + newline.length;

    lines.push({ text, start, end, nextIndex });

    if (nextIndex >= content.length) {
      break;
    }
  }

  return lines;
}

function isNumeric(value: string): boolean {
  return /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(value);
}

function isDateLike(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(?:[Tt ][^\s]+)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(value);
}

function unquote(value: string): { value: string; quoted: boolean } {
  if (value.length < 2) {
    return { value, quoted: false };
  }

  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
    return { value: value.slice(1, -1), quoted: true };
  }

  return { value, quoted: false };
}

function parseScalar(rawValue: string): unknown {
  const trimmed = rawValue.trim();
  const { value, quoted } = unquote(trimmed);

  if (quoted) {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  if (isDateLike(value)) {
    const parsedDate = new Date(value);
    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
  }

  if (isNumeric(value)) {
    const parsedNumber = Number.parseFloat(value);
    if (!Number.isNaN(parsedNumber)) {
      return parsedNumber;
    }
  }

  return value;
}

function parseArray(rawValue: string): unknown[] | null {
  const trimmed = rawValue.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return null;
  }

  const inner = trimmed.slice(1, -1).trim();
  if (inner.length === 0) {
    return [];
  }

  return inner.split(',').map((item) => parseScalar(item));
}

function parseValue(rawValue: string): unknown {
  const parsedArray = parseArray(rawValue);
  if (parsedArray !== null) {
    return parsedArray;
  }

  return parseScalar(rawValue);
}

function parseFrontmatterLine(line: string): [string, unknown] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const colonIndex = trimmed.indexOf(':');
  if (colonIndex <= 0) {
    return null;
  }

  const key = trimmed.slice(0, colonIndex).trim();
  const rawValue = trimmed.slice(colonIndex + 1);
  if (!key) {
    return null;
  }

  return [key, parseValue(rawValue)];
}

export function parseFrontmatter(text: string): FrontmatterResult {
  const lines = collectLines(text);
  if (lines.length < 2 || lines[0]?.text.trim() !== FRONTMATTER_DELIMITER) {
    return { frontmatter: {}, body: text, frontmatterStart: -1, frontmatterEnd: -1 };
  }

  let closingIndex = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.text.trim() === FRONTMATTER_DELIMITER) {
      closingIndex = index;
      break;
    }
  }

  if (closingIndex === -1) {
    return { frontmatter: {}, body: text, frontmatterStart: -1, frontmatterEnd: -1 };
  }

  const frontmatter: Record<string, unknown> = {};

  for (let index = 1; index < closingIndex; index += 1) {
    const line = lines[index]?.text ?? '';
    const parsedLine = parseFrontmatterLine(line);
    if (parsedLine === null) {
      return { frontmatter: {}, body: text, frontmatterStart: -1, frontmatterEnd: -1 };
    }

    const [key, value] = parsedLine;
    frontmatter[key] = value;
  }

  const frontmatterEnd = lines[closingIndex]?.nextIndex ?? 0;
  const body = text.slice(frontmatterEnd);
  return {
    frontmatter,
    body,
    frontmatterStart: 0,
    frontmatterEnd,
  };
}

export function serializeFrontmatter(frontmatter: Record<string, unknown>): string {
  const lines: string[] = ['---'];
  for (const [key, value] of Object.entries(frontmatter)) {
    lines.push(`${key}: ${JSON.stringify(value)}`);
  }
  lines.push('---');
  return lines.join('\n');
}
