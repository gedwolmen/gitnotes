const TAG_PATTERNS: Array<{ pattern: RegExp; replace: (match: string, ...groups: string[]) => string }> = [
  { pattern: /<h1[^>]*>(.*?)<\/h1>/gi, replace: (_m, c) => `# ${c}` },
  { pattern: /<h2[^>]*>(.*?)<\/h2>/gi, replace: (_m, c) => `## ${c}` },
  { pattern: /<h3[^>]*>(.*?)<\/h3>/gi, replace: (_m, c) => `### ${c}` },
  { pattern: /<h4[^>]*>(.*?)<\/h4>/gi, replace: (_m, c) => `#### ${c}` },
  { pattern: /<h5[^>]*>(.*?)<\/h5>/gi, replace: (_m, c) => `##### ${c}` },
  { pattern: /<h6[^>]*>(.*?)<\/h6>/gi, replace: (_m, c) => `###### ${c}` },
  { pattern: /<strong[^>]*>(.*?)<\/strong>/gi, replace: (_m, c) => `**${c}**` },
  { pattern: /<b[^>]*>(.*?)<\/b>/gi, replace: (_m, c) => `**${c}**` },
  { pattern: /<em[^>]*>(.*?)<\/em>/gi, replace: (_m, c) => `*${c}*` },
  { pattern: /<i[^>]*>(.*?)<\/i>/gi, replace: (_m, c) => `*${c}*` },
  { pattern: /<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, replace: (_m, href, text) => `[${text}](${href})` },
  { pattern: /<code[^>]*>(.*?)<\/code>/gi, replace: (_m, c) => `\`${c}\`` },
  { pattern: /<pre[^>]*>(.*?)<\/pre>/gis, replace: (_m, c) => `\n\`\`\`\n${c}\n\`\`\`\n` },
  { pattern: /<blockquote[^>]*>(.*?)<\/blockquote>/gis, replace: (_m, c) => c.split('\n').map((l: string) => `> ${l}`).join('\n') },
  { pattern: /<br\s*\/?>/gi, replace: () => '\n' },
];

function stripTags(html: string): string {
  return html.replace(/<\/?(?:div|span|p|section|article|header|footer|main|nav|aside|figure|figcaption|details|summary|time|small|mark|sub|sup|abbr|cite|dfn|kbd|samp|var|data|address|hgroup)[^>]*>/gi, '');
}

function convertLists(html: string): string {
  let result = html;

  result = result.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_m, inner) => {
    const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
    return items.map((m) => `1. ${m[1].trim()}`).join('\n');
  });

  result = result.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_m, inner) => {
    const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
    return items.map((m) => `- ${m[1].trim()}`).join('\n');
  });

  result = result.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, c) => `- ${c.trim()}`);

  return result;
}

function convertCheckboxes(html: string): string {
  return html.replace(
    /<li[^>]*class="([^"]*?)checked[^"]*"[^>]*>(.*?)<\/li>/gi,
    (_m, _cls, c) => `- [x] ${c.trim()}`,
  ).replace(
    /<li[^>]*class="([^"]*?)unchecked[^"]*"[^>]*>(.*?)<\/li>/gi,
    (_m, _cls, c) => `- [ ] ${c.trim()}`,
  );
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

export function htmlToMarkdown(html: string): string {
  let result = html;

  result = convertCheckboxes(result);
  result = convertLists(result);

  for (const { pattern, replace } of TAG_PATTERNS) {
    result = result.replace(pattern, replace);
  }

  result = stripTags(result);
  result = decodeEntities(result);

  result = result
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')
    .trim();

  return result;
}
