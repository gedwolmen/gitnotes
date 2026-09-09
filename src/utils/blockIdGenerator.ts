import { createHash } from 'crypto';

/**
 * Generate a stable 8-character block ID from content.
 * Same content always produces same ID.
 */
export function generateBlockId(content: string): string {
  return createHash('sha256').update(content).digest('hex').substring(0, 8);
}

/**
 * Inject ^block-id anchors into markdown content at each heading and paragraph.
 * Only top-level blocks get anchors.
 * Idempotent: re-injecting produces the same result.
 */
export function injectBlockIds(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Top-level headings (# or ## at start) or non-empty non-code lines
    if (
      (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) ||
      (trimmed.startsWith('## ') && !trimmed.startsWith('### ')) ||
      (trimmed.length > 10 && !trimmed.startsWith('```') && !trimmed.startsWith('- ') && !trimmed.startsWith('* ') && !trimmed.startsWith('1. '))
    ) {
      // Strip existing block IDs to get stable content for hashing
      const contentForHash = trimmed.replace(/ \^[a-f0-9]{8}(?=\s*$)/g, '');
      const id = generateBlockId(contentForHash);
      if (!line.includes(`^${id}`)) {
        result.push(`${line} ^${id}`);
        continue;
      }
    }
    result.push(line);
  }

  return result.join('\n');
}

/**
 * Strip ^block-id anchors from content for display.
 */
export function stripBlockIds(content: string): string {
  return content.replace(/ \^[a-f0-9]{8}(?=\s*$)/gm, '');
}