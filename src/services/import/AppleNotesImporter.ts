import { ImportedFile, ImportedNote } from './types';
import { htmlToMarkdown } from '../../utils/htmlToMarkdown';

export function parseAppleNotesExport(files: ImportedFile[]): ImportedNote[] {
  const notes: ImportedNote[] = [];

  for (const file of files) {
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext !== 'txt' && ext !== 'html' && ext !== 'htm') continue;

    let title = '';
    let content = '';
    const folder = extractFolder(file.relativePath);

    if (ext === 'html' || ext === 'htm') {
      title = extractTitleFromHtml(file.content);
      content = htmlToMarkdown(file.content);
    } else {
      const result = parseTextFile(file.content);
      title = result.title;
      content = result.content;
    }

    const now = new Date();
    notes.push({
      title: title || sanitizeFilename(file.name),
      content,
      tags: folder ? [folder] : [],
      createdAt: now,
      updatedAt: now,
      pinned: false,
      folder,
    });
  }

  return notes;
}

function extractTitleFromHtml(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch && titleMatch[1].trim()) {
    return titleMatch[1].trim();
  }
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) return h1Match[1].trim();
  return '';
}

function parseTextFile(content: string): { title: string; content: string } {
  const lines = content.split('\n');
  const title = lines[0]?.trim() || '';
  const body = lines.slice(1).join('\n').trim();
  return { title, content: body };
}

function extractFolder(relativePath: string | undefined): string | undefined {
  if (!relativePath) return undefined;
  const parts = relativePath.split('/').filter(Boolean);
  if (parts.length <= 1) return undefined;
  return parts.slice(0, -1).join('/');
}

function sanitizeFilename(name: string): string {
  return name.replace(/\.(txt|html?|rtf)$/i, '').trim() || 'Untitled';
}
