export const TEMPLATE_MAX_TAGS = 8;
export const TEMPLATE_MAX_TAG_LENGTH = 24;

export interface ParsedTagInput {
  committed: string[];
  remainder: string;
}

function normalize(tag: string): string {
  return tag.trim().toLowerCase();
}

function isAllowedSeparator(ch: string): boolean {
  return ch === ',' || ch === ' ' || ch === '\t' || ch === '\n';
}

export function parseTagInput(
  raw: string,
  existing: string[],
  options: { maxTags?: number; maxTagLength?: number } = {},
): ParsedTagInput {
  const maxTags = options.maxTags ?? TEMPLATE_MAX_TAGS;
  const maxTagLength = options.maxTagLength ?? TEMPLATE_MAX_TAG_LENGTH;

  const committed = [...existing];
  let buffer = '';
  let lastCharWasSeparator = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (isAllowedSeparator(ch)) {
      lastCharWasSeparator = true;
      const candidate = normalize(buffer).slice(0, maxTagLength);
      buffer = '';
      if (!candidate) continue;
      if (committed.includes(candidate)) continue;
      if (committed.length >= maxTags) continue;
      committed.push(candidate);
    } else {
      lastCharWasSeparator = false;
      buffer += ch;
    }
  }

  const remainder = lastCharWasSeparator ? '' : buffer.slice(0, maxTagLength);

  return { committed, remainder };
}

export function commitPendingTag(
  pending: string,
  existing: string[],
  options: { maxTags?: number; maxTagLength?: number } = {},
): string[] {
  const maxTags = options.maxTags ?? TEMPLATE_MAX_TAGS;
  const maxTagLength = options.maxTagLength ?? TEMPLATE_MAX_TAG_LENGTH;
  const candidate = normalize(pending).slice(0, maxTagLength);
  if (!candidate) return existing;
  if (existing.includes(candidate)) return existing;
  if (existing.length >= maxTags) return existing;
  return [...existing, candidate];
}
