import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { Note } from '../models/Note';

export type ShareFormat = 'text' | 'markdown' | 'org' | 'neorg';

export interface ShareOptions {
  format: ShareFormat;
  includeMetadata?: boolean;
}

const FORMAT_EXTENSION: Record<ShareFormat, string> = {
  text: '.txt',
  markdown: '.md',
  org: '.org',
  neorg: '.norg',
};

export class ShareService {
  static async isShareAvailable(): Promise<boolean> {
    return Sharing.isAvailableAsync();
  }

  static generateMarkdown(note: Note, includeMetadata = true): string {
    let content = '';

    if (includeMetadata) {
      content += '---\n';
      content += `title: "${note.title || 'Untitled Note'}"\n`;
      content += `created: ${note.createdAt || new Date().toISOString()}\n`;
      content += `updated: ${note.updatedAt || new Date().toISOString()}\n`;
      if (note.tags && note.tags.length > 0) {
        content += `tags: [${note.tags.join(', ')}]\n`;
      }
      if (note.folderPath) {
        content += `folder: "${note.folderPath}"\n`;
      }
      if (note.repo) {
        content += `repo: "${note.repo}"\n`;
      }
      if (note.branch) {
        content += `branch: "${note.branch}"\n`;
      }
      content += '---\n\n';
    }

    if (note.title) {
      content += `# ${note.title}\n\n`;
    }

    content += note.content || '';

    return content;
  }

  static generateOrg(note: Note, includeMetadata = true): string {
    let content = '';

    if (includeMetadata) {
      content += `#+TITLE: ${note.title || 'Untitled Note'}\n`;
      content += `#+DATE: ${new Date(note.updatedAt || Date.now()).toISOString()}\n`;
      if (note.tags && note.tags.length > 0) {
        content += `#+FILETAGS: :${note.tags.join(':')}:\n`;
      }
      if (note.folderPath) {
        content += `#+FOLDER: ${note.folderPath}\n`;
      }
      if (note.repo) {
        content += `#+REPO: ${note.repo}\n`;
      }
      if (note.branch) {
        content += `#+BRANCH: ${note.branch}\n`;
      }
      content += '\n';
    }

    content += note.content || '';
    return content;
  }

  static generateNeorg(note: Note, includeMetadata = true): string {
    let content = '';

    if (includeMetadata) {
      content += '@document.meta\n';
      content += `title: ${note.title || 'Untitled Note'}\n`;
      content += `updated: ${new Date(note.updatedAt || Date.now()).toISOString()}\n`;
      if (note.tags && note.tags.length > 0) {
        content += `categories: [${note.tags.join(', ')}]\n`;
      }
      content += '@end\n\n';
    }

    content += note.content || '';
    return content;
  }

  static generatePlainText(note: Note, includeMetadata = true): string {
    let content = '';

    if (note.title) {
      content += `${note.title}\n`;
      content += '='.repeat(note.title.length) + '\n\n';
    }

    content += note.content || '';

    if (includeMetadata) {
      content += '\n\n---\n';
      if (note.tags && note.tags.length > 0) {
        content += `Tags: ${note.tags.join(', ')}\n`;
      }
      if (note.folderPath) {
        content += `Folder: ${note.folderPath}\n`;
      }
      if (note.repo) {
        content += `Repository: ${note.repo}\n`;
      }
      if (note.branch) {
        content += `Branch: ${note.branch}\n`;
      }
      content += `Last updated: ${note.updatedAt || 'Unknown'}\n`;
    }

    return content;
  }

  static generateFilename(note: Note, format: ShareFormat): string {
    const title = note.title?.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() || 'untitled-note';
    const timestamp = new Date().getTime();
    return `${title}-${timestamp}${FORMAT_EXTENSION[format]}`;
  }

  private static getMimeType(format: ShareFormat): string {
    if (format === 'markdown') return 'text/markdown';
    return 'text/plain';
  }

  private static generateContent(note: Note, format: ShareFormat, includeMetadata: boolean): string {
    switch (format) {
      case 'markdown':
        return this.generateMarkdown(note, includeMetadata);
      case 'org':
        return this.generateOrg(note, includeMetadata);
      case 'neorg':
        return this.generateNeorg(note, includeMetadata);
      default:
        return this.generatePlainText(note, includeMetadata);
    }
  }

  static async shareNote(note: Note, options: ShareOptions): Promise<boolean> {
    try {
      const { format, includeMetadata = true } = options;

      const content = this.generateContent(note, format, includeMetadata);

      const filename = this.generateFilename(note, format);
      const mimeType = this.getMimeType(format);

      if (Platform.OS === 'web' || !(await this.isShareAvailable())) {
        if (Platform.OS === 'web') {
          const data = new Blob([content], { type: mimeType });
          const url = URL.createObjectURL(data);
          window.open(url, '_blank');
          return true;
        }
        return false;
      }

      const cacheDir = Paths.cache;
      const file = cacheDir.createFile(filename, mimeType);
      await file.write(content);

      await Sharing.shareAsync(file.uri, {
        mimeType,
        dialogTitle: `Share ${note.title || 'Note'}`,
      });

      return true;
    } catch (error) {
      console.error('[ShareService] Failed to share note:', error);
      return false;
    }
  }

  static async shareMultipleNotes(notes: Note[], options: ShareOptions): Promise<boolean> {
    try {
      const { format, includeMetadata = true } = options;

      if (notes.length === 0) {
        return false;
      }

      let combinedContent = '';

      if (format === 'markdown') {
        combinedContent += '# GitNotēs Export\n\n';
        combinedContent += `Exported ${notes.length} notes on ${new Date().toLocaleDateString()}\n\n`;
        combinedContent += '---\n\n';
      }

      for (const note of notes) {
        combinedContent += this.generateContent(note, format, includeMetadata);
        combinedContent += '\n\n---\n\n';
      }

      const filename = `gitnotes-export-${new Date().getTime()}${FORMAT_EXTENSION[format]}`;
      const mimeType = this.getMimeType(format);

      if (Platform.OS === 'web') {
        const data = new Blob([combinedContent], { type: mimeType });
        const url = URL.createObjectURL(data);
        window.open(url, '_blank');
        return true;
      }

      const cacheDir = Paths.cache;
      const file = cacheDir.createFile(filename, mimeType);
      await file.write(combinedContent);

      await Sharing.shareAsync(file.uri, {
        mimeType,
        dialogTitle: `Share ${notes.length} Notes`,
      });

      return true;
    } catch (error) {
      console.error('[ShareService] Failed to share multiple notes:', error);
      return false;
    }
  }

  static async shareAsText(note: Note): Promise<boolean> {
    return this.shareNote(note, { format: 'text', includeMetadata: true });
  }

  static async shareAsMarkdown(note: Note): Promise<boolean> {
    return this.shareNote(note, { format: 'markdown', includeMetadata: true });
  }

  static async shareByNoteFormat(note: Note): Promise<boolean> {
    const noteFormat = note.format ?? 'markdown';
    if (noteFormat === 'org') {
      return this.shareNote(note, { format: 'org', includeMetadata: true });
    }
    if (noteFormat === 'neorg') {
      return this.shareNote(note, { format: 'neorg', includeMetadata: true });
    }
    return this.shareAsMarkdown(note);
  }
}

export default ShareService;
