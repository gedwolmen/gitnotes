export type LinkKind = 'anchor' | 'note' | 'web' | 'mailto';

export interface ClassifiedHref {
  kind: LinkKind;
  target: string;
}

function slugifyFragment(fragment: string): string {
  return decodeURIComponent(fragment)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizePath(path: string): string {
  const isAbsolute = path.startsWith('/');
  const parts = path.split('/');
  const normalized: string[] = [];

  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (normalized.length > 0) normalized.pop();
      continue;
    }
    normalized.push(part);
  }

  const joined = normalized.join('/');
  return isAbsolute ? `/${joined}` : joined;
}

function dirname(path: string): string {
  const normalized = normalizePath(path);
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash < 0) return '';
  return normalized.slice(0, lastSlash);
}

function resolveNotePath(href: string, currentNotePath?: string): string {
  if (href.startsWith('/')) {
    return normalizePath(href).replace(/^\//, '');
  }

  const baseDir = currentNotePath ? dirname(currentNotePath) : '';
  return normalizePath(baseDir ? `${baseDir}/${href}` : href);
}

export function classifyHref(href: string, currentNotePath?: string): ClassifiedHref | null {
  const trimmed = href.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('#')) {
    return { kind: 'anchor', target: slugifyFragment(trimmed.slice(1)) };
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return { kind: 'web', target: trimmed };
  }

  if (/^(mailto|tel):/i.test(trimmed)) {
    return { kind: 'mailto', target: trimmed.replace(/^(mailto|tel):/i, '') };
  }

  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && /\.(md|norg|org|pdf|json)$/i.test(trimmed)) {
    return { kind: 'note', target: resolveNotePath(trimmed, currentNotePath) };
  }

  return null;
}
