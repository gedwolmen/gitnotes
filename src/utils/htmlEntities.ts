const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

function decodeEntity(entity: string): string {
  if (entity.startsWith('#x') || entity.startsWith('#X')) {
    const codePoint = Number.parseInt(entity.slice(2), 16);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : `&${entity};`;
  }

  if (entity.startsWith('#')) {
    const codePoint = Number.parseInt(entity.slice(1), 10);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : `&${entity};`;
  }

  return NAMED_ENTITIES[entity] ?? `&${entity};`;
}

function decodeText(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (_match, entity: string) => decodeEntity(entity));
}

function isFenceLine(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith('```') || trimmed.startsWith('~~~');
}

export function decodeHtmlEntities(text: string): string {
  const pattern = /([^\r\n]*)(\r?\n|$)/g;
  let match: RegExpExecArray | null;
  let inCodeBlock = false;
  let out = '';

  while ((match = pattern.exec(text)) !== null) {
    const line = match[1];
    const newline = match[2];

    if (isFenceLine(line)) {
      out += line + newline;
      inCodeBlock = !inCodeBlock;
    } else if (inCodeBlock) {
      out += line + newline;
    } else {
      out += decodeText(line) + newline;
    }

    if (!newline && pattern.lastIndex >= text.length) {
      break;
    }
  }

  return out;
}
