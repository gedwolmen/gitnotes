export type LinkKind = 'anchor' | 'note' | 'web' | 'mailto';

export interface ClassifiedHref {
  kind: LinkKind;
  target: string;
  /**
   * Slugified anchor inside the target note. Only set when the href was
   * `path/to/file.md#section` — the receiver opens the note and scrolls
   * to this slug after content lays out.
   */
  fragment?: string;
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

  // Cross-file note links can carry a heading fragment, e.g.
  // `notes/foo.md#section-1`. Split the fragment off before the
  // extension test so we still recognise the path part as a note.
  const hashIdx = trimmed.indexOf('#');
  const pathPart = hashIdx >= 0 ? trimmed.slice(0, hashIdx) : trimmed;
  const fragmentPart = hashIdx >= 0 ? trimmed.slice(hashIdx + 1) : '';

  if (!/^[a-z][a-z0-9+.-]*:/i.test(pathPart) && /\.(md|norg|org|pdf|json)$/i.test(pathPart)) {
    return {
      kind: 'note',
      target: resolveNotePath(pathPart, currentNotePath),
      fragment: fragmentPart ? slugifyFragment(fragmentPart) : undefined,
    };
  }

  return null;
}
