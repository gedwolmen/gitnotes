export interface WikiLink {
  type: 'wiki';
  target: string;
  displayText: string;
  range: { start: number; end: number };
}

export interface Backlink {
  noteId: string;
  noteTitle: string;
  context: string;
}

const WIKI_LINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export function parseWikiLinks(content: string): WikiLink[] {
  const links: WikiLink[] = [];
  WIKI_LINK_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null = WIKI_LINK_REGEX.exec(content);
  
  while (match !== null) {
    const target = match[1].trim();
    const displayText = match[2]?.trim() || target;

    links.push({
      type: 'wiki',
      target,
      displayText,
      range: {
        start: match.index,
        end: match.index + match[0].length,
      },
    });
    match = WIKI_LINK_REGEX.exec(content);
  }

  return links;
}

export function extractWikiLinkTargets(content: string): string[] {
  const links = parseWikiLinks(content);
  return links.map((link) => link.target);
}

export function replaceWikiLinksWithText(content: string): string {
  return content.replace(WIKI_LINK_REGEX, (_, target, displayText) => {
    return displayText || target;
  });
}

export function buildBacklinkContext(content: string, targetTitle: string, maxLength = 150): string {
  const lowerContent = content.toLowerCase();
  const lowerTarget = targetTitle.toLowerCase();
  const index = lowerContent.indexOf(lowerTarget);

  if (index === -1) {
    return content.slice(0, maxLength);
  }

  const start = Math.max(0, index - 30);
  const end = Math.min(content.length, index + targetTitle.length + 30);

  let context = content.slice(start, end);

  if (start > 0) context = '...' + context;
  if (end < content.length) context = context + '...';

  return context;
}

export function isValidWikiLinkTarget(title: string, existingTitles: string[]): boolean {
  const normalizedTitle = title.toLowerCase().trim();
  return existingTitles.some((t) => t.toLowerCase().trim() === normalizedTitle);
}
