import { NoteFormat } from '../../models/Note';
import { NeorgParser } from '../../services/NeorgParser';

export interface TocEntry {
  level: number;
  text: string;
  lineIndex: number;
}

export const APPROX_LINE_PX = 22;

export const FORMAT_OPTIONS: { label: string; value: NoteFormat }[] = [
  { label: '.md', value: 'markdown' },
  { label: '.norg', value: 'neorg' },
  { label: '.org', value: 'org' },
];

export function normalizeNotePathForLookup(path: string): string {
  return path.replace(/^\/+/, '').replace(/\/+/g, '/');
}

export function extractTocFromMarkdown(content: string): TocEntry[] {
  const out: TocEntry[] = [];
  const lines = content.split('\n');
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (match) {
      out.push({ level: match[1].length, text: match[2].trim(), lineIndex: i });
    }
  }

  return out;
}

export function extractTocFromNorg(content: string): TocEntry[] {
  const out: TocEntry[] = [];
  const lines = content.split('\n');
  let inCode = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*@code/.test(line)) { inCode = true; continue; }
    if (/^\s*@end/.test(line) && inCode) { inCode = false; continue; }
    if (inCode) continue;

    const match = line.match(/^(\*{1,6})\s+(.+?)\s*$/);
    if (match) {
      out.push({ level: match[1].length, text: match[2].trim(), lineIndex: i });
    }
  }

  return out;
}

export function extractTocFromOrg(content: string): TocEntry[] {
  const out: TocEntry[] = [];
  const lines = content.split('\n');
  let inSrc = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*#\+BEGIN_SRC/.test(line)) { inSrc = true; continue; }
    if (/^\s*#\+END_SRC/.test(line) && inSrc) { inSrc = false; continue; }
    if (inSrc) continue;

    const match = line.match(/^(\*{1,6})\s+(?:TODO|DONE|IN-PROGRESS|WAITING|HOLD|CANCELLED|NEXT)?\s*(.+?)\s*$/i);
    if (match) {
      out.push({ level: match[1].length, text: match[2].trim(), lineIndex: i });
    }
  }

  return out;
}

export function slugifyLocal(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
}

export function getExtensionForFormat(format?: NoteFormat): string {
  switch (format) {
    case 'neorg':
      return '.norg';
    case 'org':
      return '.org';
    default:
      return '.md';
  }
}

export function extractCanvasJsonRefs(content: string): string[] {
  const re = /!\[[^\]]*\]\((file:[^)]+\/canvas-drawings\/canvas-[^)]+\.(?:json|png))\)/g;
  const out: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = re.exec(content)) !== null) {
    const clean = match[1].split('?')[0].replace(/\.png$/i, '.json');
    if (!seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  }

  return out;
}

function stripTopMetadata(raw: string, format: NoteFormat): string {
  if (format === 'markdown') {
    const lines = raw.split('\n');
    if (lines[0]?.trim() !== '---') return raw;
    const closingIndex = lines.findIndex((line, idx) => idx > 0 && line.trim() === '---');
    if (closingIndex === -1) return raw;
    return lines.slice(closingIndex + 1).join('\n').trimStart();
  }

  if (format === 'org') {
    const lines = raw.split('\n');
    let i = 0;
    while (i < lines.length && /^\s*#\+[A-Za-z0-9_]+:\s*.*$/.test(lines[i])) {
      i += 1;
    }
    while (i < lines.length && lines[i].trim() === '') {
      i += 1;
    }
    return i > 0 ? lines.slice(i).join('\n') : raw;
  }

  if (format === 'neorg') {
    const lines = raw.split('\n');
    if (!lines[0]?.trim().startsWith('@document.meta')) return raw;
    const endIndex = lines.findIndex((line, idx) => idx > 0 && line.trim() === '@end');
    if (endIndex === -1) return raw;
    return lines.slice(endIndex + 1).join('\n').trimStart();
  }

  return raw;
}

export function getPreviewContent(content: string, noteFormat: NoteFormat): string {
  if (noteFormat === 'pdf') return content.trim();
  if (noteFormat === 'markdown') return stripTopMetadata(content, 'markdown');

  if (noteFormat === 'neorg') {
    const stripped = stripTopMetadata(content, 'neorg');
    const parsed = NeorgParser.parseDocument(stripped);
    if (parsed.success && parsed.document) {
      return parsed.document.content;
    }
    return stripped;
  }

  return stripTopMetadata(content, 'org');
}

export function getSpeakableContent(previewContent: string): string {
  return previewContent
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~]{1,2}([^*_~]+)[*_~]{1,2}/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\n{2,}/g, '. ')
    .trim();
}
