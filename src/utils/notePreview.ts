import type { NoteFormat } from '../models/Note';

function stripFrontMatter(text: string): string {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith('---\n')) return text;
  const close = trimmed.indexOf('\n---', 3);
  if (close === -1) return text;
  return trimmed.slice(close + 4);
}

function stripNeorgMeta(text: string): string {
  if (!text.trimStart().startsWith('@document.meta')) return text;
  const lines = text.split('\n');
  const endIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '@end');
  if (endIdx === -1) return text;
  return lines.slice(endIdx + 1).join('\n');
}

function stripOrgKeywordHeaders(text: string): string {
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length && /^\s*#\+[A-Za-z0-9_]+:/.test(lines[i])) i++;
  return lines.slice(i).join('\n');
}

function stripOrgDrawers(text: string): string {
  return text.replace(
    /^[ \t]*:[A-Za-z0-9_@#%]+:[ \t]*\n[\s\S]*?^[ \t]*:END:[ \t]*$/gim,
    '',
  );
}

function stripCheckboxes(text: string): string {
  return text
    .replace(/^[ \t]*[-*+][ \t]*\[[ xX-]\][ \t]*/gm, '')
    .replace(/\[[ xX-]\][ \t]*/g, '');
}

function stripInlineMarkup(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\*{1,7}\s+/gm, '')
    .replace(/\*{1,2}([^*\n]+)\*{1,2}/g, '$1')
    .replace(/_{1,2}([^_\n]+)_{1,2}/g, '$1')
    .replace(/(?<![A-Za-z0-9])\/([^/\n]+)\/(?![A-Za-z0-9])/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`[^`]+`/g, '')
    .replace(/\{[^}]+\}\[[^\]]+\]/g, '')
    .replace(/\{https?:\/\/[^}]+\}/g, '')
    .replace(/\{\*[^}]+\}/g, '')
    .replace(/\{:[^:]+:\}/g, '')
    .replace(/\[\[[^\]]+\]\[[^\]]+\]\]/g, '')
    .replace(/\[\[[^\]]+\]\]/g, '')
    .replace(/\+([^+\s][^+]*[^+\s]?)\+/g, '$1')
    .replace(/=([^=\s][^=]*[^=\s]?)=/g, '$1')
    .replace(/~([^~\s][^~]*[^~\s]?)~/g, '$1')
    .replace(/^>\s*/gm, '');
}

export function stripPreview(content: string, noteFormat?: NoteFormat): string {
  if (!content) return '';
  let text = stripFrontMatter(content);

  if (noteFormat === 'neorg') text = stripNeorgMeta(text);
  if (noteFormat === 'org') {
    text = stripOrgKeywordHeaders(text);
    text = stripOrgDrawers(text);
  }

  text = stripCheckboxes(text);
  text = stripInlineMarkup(text);

  return text.replace(/\s+/g, ' ').trim();
}
