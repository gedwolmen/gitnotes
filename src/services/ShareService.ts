import * as Sharing from 'expo-sharing';
import { Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { Canvas } from '../models/Canvas';
import { Note } from '../models/Note';
import { Todo } from '../models/Todo';
import { ExportArtifact, ExportService } from './ExportService';

export type ShareFormat = 'text' | 'markdown' | 'org' | 'neorg' | 'pdf' | 'docx';

export interface ShareOptions {
  format: ShareFormat;
  includeMetadata?: boolean;
}

const FORMAT_EXTENSION: Record<ShareFormat, string> = {
  text: '.txt',
  markdown: '.md',
  org: '.org',
  neorg: '.norg',
  pdf: '.pdf',
  docx: '.docx',
};

function normalizeBlobPart(content: string | Uint8Array): string | ArrayBuffer {
  if (typeof content === 'string') {
    return content;
  }

  const bytes = Uint8Array.from(content);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function downloadBlob(filename: string, mimeType: string, content: string | Uint8Array): boolean {
  if (Platform.OS !== 'web') {
    return false;
  }

  const url = URL.createObjectURL(new Blob([normalizeBlobPart(content)], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}

async function shareExportArtifact(title: string, artifact: ExportArtifact): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (!artifact.webData) {
      return false;
    }
    return downloadBlob(artifact.filename, artifact.webMimeType ?? artifact.mimeType, artifact.webData);
  }

  if (!artifact.uri || !(await Sharing.isAvailableAsync())) {
    return false;
  }

  await Sharing.shareAsync(artifact.uri, {
    mimeType: artifact.mimeType,
    dialogTitle: `Share ${title}`,
    UTI: artifact.filename.endsWith('.pdf') ? '.pdf' : undefined,
  });

  return true;
}

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
      if (note.tags.length > 0) content += `tags: [${note.tags.join(', ')}]\n`;
      if (note.folderPath) content += `folder: "${note.folderPath}"\n`;
      if (note.repo) content += `repo: "${note.repo}"\n`;
      if (note.branch) content += `branch: "${note.branch}"\n`;
      content += '---\n\n';
    }

    if (note.title) content += `# ${note.title}\n\n`;
    content += note.content || '';
    return content;
  }

  static generateOrg(note: Note, includeMetadata = true): string {
    let content = '';

    if (includeMetadata) {
      content += `#+TITLE: ${note.title || 'Untitled Note'}\n`;
      content += `#+DATE: ${new Date(note.updatedAt || Date.now()).toISOString()}\n`;
      if (note.tags.length > 0) content += `#+FILETAGS: :${note.tags.join(':')}:\n`;
      if (note.folderPath) content += `#+FOLDER: ${note.folderPath}\n`;
      if (note.repo) content += `#+REPO: ${note.repo}\n`;
      if (note.branch) content += `#+BRANCH: ${note.branch}\n`;
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
      if (note.tags.length > 0) content += `categories: [${note.tags.join(', ')}]\n`;
      content += '@end\n\n';
    }

    content += note.content || '';
    return content;
  }

  static generatePlainText(note: Note, includeMetadata = true): string {
    let content = '';

    if (note.title) {
      content += `${note.title}\n`;
      content += `${'='.repeat(note.title.length)}\n\n`;
    }

    content += note.content || '';

    if (includeMetadata) {
      content += '\n\n---\n';
      if (note.tags.length > 0) content += `Tags: ${note.tags.join(', ')}\n`;
      if (note.folderPath) content += `Folder: ${note.folderPath}\n`;
      if (note.repo) content += `Repository: ${note.repo}\n`;
      if (note.branch) content += `Branch: ${note.branch}\n`;
      content += `Last updated: ${note.updatedAt || 'Unknown'}\n`;
    }

    return content;
  }

  static generateFilename(note: Note, format: ShareFormat): string {
    const title = note.title?.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() || 'untitled-note';
    return `${title}-${Date.now()}${FORMAT_EXTENSION[format]}`;
  }

  static getAvailableFormats(note: Note): ShareFormat[] {
    const formats: ShareFormat[] = ['pdf', 'docx', 'markdown', 'text'];
    if (note.format === 'org') formats.push('org');
    if (note.format === 'neorg') formats.push('neorg');
    return formats;
  }

  private static getMimeType(format: ShareFormat): string {
    switch (format) {
      case 'markdown':
        return 'text/markdown';
      case 'pdf':
        return 'application/pdf';
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      default:
        return 'text/plain';
    }
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

      if (Platform.OS === 'web') {
        return downloadBlob(filename, mimeType, content);
      }

      if (!(await this.isShareAvailable())) {
        return false;
      }

      const file = Paths.cache.createFile(filename, mimeType);
      file.write(content);

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
      if (notes.length === 0) return false;

      let combinedContent = '';
      if (format === 'markdown') {
        combinedContent += '# GitNotēs Export\n\n';
        combinedContent += `Exported ${notes.length} notes on ${new Date().toLocaleDateString()}\n\n---\n\n`;
      }

      for (const note of notes) {
        combinedContent += this.generateContent(note, format, includeMetadata);
        combinedContent += '\n\n---\n\n';
      }

      const filename = `gitnotes-export-${Date.now()}${FORMAT_EXTENSION[format]}`;
      const mimeType = this.getMimeType(format);

      if (Platform.OS === 'web') {
        return downloadBlob(filename, mimeType, combinedContent);
      }

      const file = Paths.cache.createFile(filename, mimeType);
      file.write(combinedContent);

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

  static async shareAsPdf(note: Note): Promise<boolean> {
    try {
      return await shareExportArtifact(note.title || 'Note', await ExportService.createNoteArtifact(note, 'pdf', true));
    } catch (error) {
      console.error('[ShareService] Failed to share PDF:', error);
      return false;
    }
  }

  static async shareAsDocx(note: Note): Promise<boolean> {
    try {
      return await shareExportArtifact(note.title || 'Note', await ExportService.createNoteArtifact(note, 'docx', true));
    } catch (error) {
      console.error('[ShareService] Failed to share DOCX:', error);
      return false;
    }
  }

  static async exportTodoAsPdf(todo: Todo): Promise<boolean> {
    try {
      return await shareExportArtifact(todo.text || 'Todo', await ExportService.createTodoArtifact(todo, 'pdf'));
    } catch (error) {
      console.error('[ShareService] Failed to export todo PDF:', error);
      return false;
    }
  }

  static async exportCanvasAsPdf(canvas: Canvas): Promise<boolean> {
    try {
      return await shareExportArtifact(canvas.title || 'Canvas', await ExportService.createCanvasArtifact(canvas, 'pdf'));
    } catch (error) {
      console.error('[ShareService] Failed to export canvas PDF:', error);
      return false;
    }
  }

  static async shareInFormat(note: Note, format: ShareFormat): Promise<boolean> {
    switch (format) {
      case 'pdf':
        return this.shareAsPdf(note);
      case 'docx':
        return this.shareAsDocx(note);
      case 'org':
      case 'neorg':
      case 'markdown':
      case 'text':
        return this.shareNote(note, { format, includeMetadata: true });
    }
  }

  static async shareByNoteFormat(note: Note): Promise<boolean> {
    if (note.format === 'org') return this.shareNote(note, { format: 'org', includeMetadata: true });
    if (note.format === 'neorg') return this.shareNote(note, { format: 'neorg', includeMetadata: true });
    return this.shareAsMarkdown(note);
  }
}

export default ShareService;
