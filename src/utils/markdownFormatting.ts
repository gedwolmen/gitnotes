export type Selection = { start: number; end: number };

export type FormatAction = {
  type: 'wrap' | 'line' | 'insert';
  before: string;
  after?: string;
};

export type FormatResult = {
  text: string;
  selection: Selection;
};

function lineRange(text: string, pos: number): { lineStart: number; lineEnd: number } {
  let lineStart = pos;
  while (lineStart > 0 && text[lineStart - 1] !== '\n') lineStart--;
  let lineEnd = pos;
  while (lineEnd < text.length && text[lineEnd] !== '\n') lineEnd++;
  return { lineStart, lineEnd };
}

function modifyLine(
  text: string,
  selection: Selection,
  transform: (line: string) => string,
): FormatResult {
  const { lineStart, lineEnd } = lineRange(text, selection.start);
  const line = text.slice(lineStart, lineEnd);
  const newLine = transform(line);
  const newText = text.slice(0, lineStart) + newLine + text.slice(lineEnd);
  const delta = newLine.length - line.length;
  return {
    text: newText,
    selection: {
      start: Math.max(lineStart, selection.start + delta),
      end: Math.max(lineStart, selection.end + delta),
    },
  };
}

function wrapInline(
  text: string,
  selection: Selection,
  marker: string,
): FormatResult {
  const { start, end } = selection;
  const selected = text.slice(start, end);

  if (
    selected.startsWith(marker) &&
    selected.endsWith(marker) &&
    selected.length >= marker.length * 2
  ) {
    const inner = selected.slice(marker.length, selected.length - marker.length);
    return {
      text: text.slice(0, start) + inner + text.slice(end),
      selection: { start, end: start + inner.length },
    };
  }

  const wrapped = marker + selected + marker;
  return {
    text: text.slice(0, start) + wrapped + text.slice(end),
    selection: { start, end: start + wrapped.length },
  };
}

export function toggleBold(text: string, selection: Selection): FormatResult {
  return wrapInline(text, selection, '**');
}

export function toggleItalic(text: string, selection: Selection): FormatResult {
  return wrapInline(text, selection, '*');
}

export function toggleHeading(
  text: string,
  selection: Selection,
  level: number,
): FormatResult {
  const prefix = '#'.repeat(level) + ' ';
  return modifyLine(text, selection, (line) => {
    const stripped = line.replace(/^#{1,6} /, '');
    const existingPrefix = line.match(/^(#{1,6}) /);
    if (existingPrefix && existingPrefix[1].length === level) {
      return stripped;
    }
    return prefix + stripped;
  });
}

export function toggleList(text: string, selection: Selection): FormatResult {
  return modifyLine(text, selection, (line) => {
    if (line.startsWith('- ')) return line.slice(2);
    return '- ' + line;
  });
}

export function toggleChecklist(text: string, selection: Selection): FormatResult {
  return modifyLine(text, selection, (line) => {
    if (/^- \[[ x]\] /.test(line)) return line.replace(/^- \[[ x]\] /, '');
    return '- [ ] ' + line;
  });
}

export function toggleCode(text: string, selection: Selection): FormatResult {
  return wrapInline(text, selection, '`');
}

export function insertLink(text: string, selection: Selection): FormatResult {
  const { start, end } = selection;
  const selected = text.slice(start, end);
  const label = selected || 'text';
  const inserted = `[${label}](url)`;
  return {
    text: text.slice(0, start) + inserted + text.slice(end),
    selection: { start, end: start + inserted.length },
  };
}

export function addTab(text: string, selection: Selection): FormatResult {
  const { lineStart } = lineRange(text, selection.start);
  const newText = text.slice(0, lineStart) + '  ' + text.slice(lineStart);
  return {
    text: newText,
    selection: {
      start: selection.start + 2,
      end: selection.end + 2,
    },
  };
}
