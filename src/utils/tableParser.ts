export type TableAlignment = 'left' | 'center' | 'right';

export type TableSegment = {
  headers: string[];
  aligns: TableAlignment[];
  rows: string[][];
  startIndex: number;
  endIndex: number;
};

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

function splitTableRow(line: string): string[] {
  let normalized = line.trim();

  if (normalized.startsWith('|')) {
    normalized = normalized.slice(1);
  }

  if (normalized.endsWith('|')) {
    normalized = normalized.slice(0, -1);
  }

  if (normalized.length === 0) {
    return [''];
  }

  return normalized.split('|').map((cell) => cell.trim());
}

function parseAlignment(cell: string): TableAlignment | null {
  const trimmed = cell.trim();

  if (!/^:?-{3,}:?$/.test(trimmed)) {
    return null;
  }

  const left = trimmed.startsWith(':');
  const right = trimmed.endsWith(':');

  if (left && right) return 'center';
  if (right) return 'right';
  return 'left';
}

function isTableStart(currentLine: string, nextLine: string): boolean {
  if (!currentLine.trimStart().startsWith('|')) {
    return false;
  }

  const headerCells = splitTableRow(currentLine);
  const separatorCells = splitTableRow(nextLine);

  if (headerCells.length !== separatorCells.length) {
    return false;
  }

  return separatorCells.every((cell) => parseAlignment(cell) !== null);
}

export function parseTables(text: string): TableSegment[] {
  const lines = collectLines(text);
  const segments: TableSegment[] = [];

  let i = 0;

  while (i < lines.length - 1) {
    const current = lines[i];
    const next = lines[i + 1];

    if (!isTableStart(current.text, next.text)) {
      i += 1;
      continue;
    }

    const headers = splitTableRow(current.text);
    const aligns = splitTableRow(next.text).map((cell) => parseAlignment(cell) ?? 'left');
    const rows: string[][] = [];
    const startIndex = current.start;
    let endIndex = next.end;

    let rowIndex = i + 2;
    while (rowIndex < lines.length) {
      const rowLine = lines[rowIndex];

      if (!rowLine.text.trimStart().startsWith('|')) {
        break;
      }

      const cells = splitTableRow(rowLine.text);
      while (cells.length < headers.length) {
        cells.push('');
      }

      rows.push(cells);
      endIndex = rowLine.end;
      rowIndex += 1;
    }

    segments.push({ headers, aligns, rows, startIndex, endIndex });
    i = rowIndex;
  }

  return segments;
}
