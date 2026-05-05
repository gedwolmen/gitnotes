import { ImportedFile, ImportedNote } from './types';
import { htmlToMarkdown } from '../../utils/htmlToMarkdown';

interface GoogleKeepJson {
  title?: string;
  content?: string;
  labels?: Array<{ name: string }>;
  color?: string;
  isPinned?: boolean;
  isArchived?: boolean;
  timestamps?: {
    created?: string;
    updated?: string;
  };
  userEditedTimestampUsec?: string;
  createdTimestampUsec?: string;
}

function extractTitleFromHtml(html: string): string {
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (headMatch) {
    const titleMatch = headMatch[1].match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch && titleMatch[1].trim()) {
      return titleMatch[1].trim();
    }
  }
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) return h1Match[1].trim();
  return '';
}

function extractBodyFromHtml(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const raw = bodyMatch ? bodyMatch[1] : html;
  return htmlToMarkdown(raw);
}

function parseTimestampUsec(usecStr: string | undefined): Date | undefined {
  if (!usecStr) return undefined;
  const usec = Number(usecStr);
  if (!Number.isFinite(usec)) return undefined;
  return new Date(usec / 1000);
}

function parseColor(color: string | undefined): string | undefined {
  if (!color) return undefined;
  const colorMap: Record<string, string> = {
    RED: 'red',
    ORANGE: 'orange',
    YELLOW: 'yellow',
    GREEN: 'green',
    TEAL: 'blue',
    BLUE: 'blue',
    PURPLE: 'purple',
    PINK: 'pink',
    WHITE: '',
    DEFAULT: '',
  };
  return colorMap[color.toUpperCase()] || undefined;
}

export function parseGoogleKeepTakeout(files: ImportedFile[]): ImportedNote[] {
  const htmlFiles = files.filter((f) => f.name.endsWith('.html'));
  const jsonFiles = new Map<string, ImportedFile>();
  for (const f of files) {
    if (f.name.endsWith('.json')) {
      jsonFiles.set(f.name, f);
    }
  }

  const notes: ImportedNote[] = [];

  for (const htmlFile of htmlFiles) {
    const baseName = htmlFile.name.replace(/\.html$/i, '');
    const jsonFile = jsonFiles.get(`${baseName}.json`);

    let title = extractTitleFromHtml(htmlFile.content);
    const body = extractBodyFromHtml(htmlFile.content);

    let tags: string[] = [];
    let color: string | undefined;
    let pinned = false;
    let createdAt: Date = new Date();
    let updatedAt: Date = new Date();

    if (jsonFile) {
      try {
        const meta: GoogleKeepJson = JSON.parse(jsonFile.content);
        if (meta.title && !title) {
          title = meta.title;
        }
        if (meta.labels) {
          tags = meta.labels.map((l) => l.name).filter(Boolean);
        }
        color = parseColor(meta.color);
        pinned = meta.isPinned ?? false;
        createdAt = parseTimestampUsec(meta.createdTimestampUsec) ?? new Date();
        updatedAt = parseTimestampUsec(meta.userEditedTimestampUsec) ?? createdAt;
      } catch {
        // skip malformed JSON, continue with HTML-only data
      }
    }

    notes.push({
      title: title || 'Untitled',
      content: body,
      tags,
      createdAt,
      updatedAt,
      color,
      pinned,
    });
  }

  return notes;
}
