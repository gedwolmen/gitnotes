import type { NoteTemplate, NoteTemplateIcon } from './TemplateService';

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

export function templateSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'untitled';
}

function quoteIfNeeded(value: string): string {
  if (value === '') return "''";
  if (/[:#-?&*!|>'"%@`,[\]{}]/.test(value) || /^\s|\s$/.test(value)) {
    return `'${value.replace(/'/g, "''")}'`;
  }
  return value;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

export function serializeTemplate(t: NoteTemplate): string {
  const lines: string[] = ['---'];
  lines.push(`id: ${t.id}`);
  lines.push(`name: ${quoteIfNeeded(t.name)}`);
  lines.push(`icon: ${t.icon}`);
  if (t.description) lines.push(`description: ${quoteIfNeeded(t.description)}`);
  if (t.title) lines.push(`title: ${quoteIfNeeded(t.title)}`);
  const tagList = (t.tags ?? []).map((tag) => quoteIfNeeded(tag)).join(', ');
  lines.push(`tags: [${tagList}]`);
  if (t.createdAt) lines.push(`createdAt: ${t.createdAt}`);
  if (t.updatedAt) lines.push(`updatedAt: ${t.updatedAt}`);
  lines.push('---');
  lines.push('');
  return lines.join('\n') + t.content;
}

function parseTagList(raw: string): string[] {
  const inner = raw.trim().replace(/^\[/, '').replace(/\]$/, '').trim();
  if (!inner) return [];
  return inner
    .split(',')
    .map((tag) => unquote(tag))
    .filter((tag) => tag.length > 0);
}

function nameFromPath(path: string): string {
  return path
    .replace(/^templates\//, '')
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]/g, ' ');
}

export function parseTemplateMarkdown(path: string, raw: string): NoteTemplate | null {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) return null;

  const fields = new Map<string, string>();
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim().toLowerCase();
    const v = line.slice(idx + 1);
    fields.set(k, v);
  }

  const fallbackName = nameFromPath(path);
  const id = fields.has('id') ? unquote(fields.get('id')!) : `custom-${fallbackName.replace(/\s+/g, '-')}`;
  const name = fields.has('name') ? unquote(fields.get('name')!) : fallbackName;
  const icon = (fields.has('icon') ? unquote(fields.get('icon')!) : 'document-outline') as NoteTemplateIcon;
  const description = fields.has('description') ? unquote(fields.get('description')!) : '';
  const title = fields.has('title') ? unquote(fields.get('title')!) : undefined;
  const tags = fields.has('tags') ? parseTagList(fields.get('tags')!) : [];
  const createdAt = fields.has('createdat') ? Number(fields.get('createdat')) : undefined;
  const updatedAt = fields.has('updatedat') ? Number(fields.get('updatedat')) : undefined;

  const rawContent = raw.slice(match[0].length);
  const content = rawContent.startsWith('\n') ? rawContent.slice(1) : rawContent;

  return {
    id,
    name,
    icon,
    description,
    title,
    tags,
    content,
    isCustom: true,
    filePath: path,
    createdAt: Number.isFinite(createdAt) ? createdAt : undefined,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : undefined,
  };
}
