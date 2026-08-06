import JSZip from 'jszip';
import * as Print from 'expo-print';
import { Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { Canvas } from '../models/Canvas';
import { Note } from '../models/Note';
import { Todo } from '../models/Todo';

export type ExportFormat = 'pdf' | 'docx';

export interface ExportArtifact {
  filename: string;
  mimeType: string;
  uri?: string;
  webData?: string | Uint8Array;
  webMimeType?: string;
}

interface DocxContentInput {
  title: string;
  bodyText: string;
  metadataLines?: string[];
}

interface ExportSource {
  filenameStem: string;
  title: string;
  bodyText: string;
  metadataLines: string[];
  html: string;
}

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(value?: number): string {
  if (!value) return 'Unknown';
  return new Date(value).toLocaleString();
}

function sanitizeFilename(value: string | undefined, fallback: string): string {
  const slug = (value ?? fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function createHtmlDocument(title: string, metadataLines: string[], bodyText: string): string {
  const metadataMarkup = metadataLines.length
    ? `<section class="metadata">${metadataLines
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join('')}</section>`
    : '';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 32px 28px; color: #111827; }
      h1 { margin: 0 0 16px; font-size: 28px; }
      .metadata { margin-bottom: 20px; color: #4b5563; font-size: 13px; }
      .metadata p { margin: 4px 0; }
      .content { white-space: pre-wrap; line-height: 1.55; font-size: 15px; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    ${metadataMarkup}
    <div class="content">${escapeHtml(bodyText)}</div>
  </body>
</html>`;
}

function paragraphXml(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function writeDownloadFile(filename: string, mimeType: string, content: Uint8Array) {
  const file = Paths.cache.createFile(filename, mimeType);
  file.write(content);
  return file;
}

function buildNoteMetadata(note: Note, includeMetadata: boolean): string[] {
  if (!includeMetadata) return [];
  return [
    `Created: ${formatDate(note.createdAt)}`,
    `Updated: ${formatDate(note.updatedAt)}`,
    note.tags.length ? `Tags: ${note.tags.join(', ')}` : '',
    note.folderPath ? `Folder: ${note.folderPath}` : '',
    note.repo ? `Repository: ${note.repo}` : '',
    note.branch ? `Branch: ${note.branch}` : '',
  ].filter(Boolean);
}

export class ExportService {
  static formatTodoAsText(todo: Todo): string {
    return [
      todo.text || 'Untitled Todo',
      '='.repeat((todo.text || 'Untitled Todo').length),
      '',
      `Status: ${todo.completed ? 'Completed' : 'Open'}`,
      `Priority: ${todo.priority ? todo.priority[0].toUpperCase() + todo.priority.slice(1) : 'Medium'}`,
      `Due: ${todo.dueDate ? formatDate(todo.dueDate) : 'None'}`,
      todo.tags?.length ? `Tags: ${todo.tags.join(', ')}` : 'Tags: None',
      '',
      'Notes:',
      todo.notes?.trim() || 'None',
    ].join('\n');
  }

  static formatCanvasAsText(canvas: Canvas): string {
    const counts = canvas.scene.elements.reduce(
      (acc, element) => {
        acc[element.type] += 1;
        return acc;
      },
      { stroke: 0, shape: 0, text: 0, chart: 0, image: 0 },
    );

    const snippets = canvas.scene.elements
      .filter((element): element is Extract<Canvas['scene']['elements'][number], { type: 'text' }> => element.type === 'text')
      .map((element) => element.text.trim())
      .filter(Boolean);

    return [
      canvas.title || 'Untitled Canvas',
      '='.repeat((canvas.title || 'Untitled Canvas').length),
      '',
      `Canvas size: ${canvas.scene.width} × ${canvas.scene.height}`,
      `Background: ${canvas.scene.background}`,
      `Updated: ${formatDate(canvas.updatedAt)}`,
      canvas.tags.length ? `Tags: ${canvas.tags.join(', ')}` : 'Tags: None',
      '',
      `${canvas.scene.elements.length} elements`,
      `- ${counts.stroke} stroke${counts.stroke === 1 ? '' : 's'}`,
      `- ${counts.shape} shape${counts.shape === 1 ? '' : 's'}`,
      `- ${counts.text} text block${counts.text === 1 ? '' : 's'}`,
      `- ${counts.chart} chart${counts.chart === 1 ? '' : 's'}`,
      `- ${counts.image} image${counts.image === 1 ? '' : 's'}`,
      snippets.length ? `Text snippets: ${snippets.join(', ')}` : 'Text snippets: None',
    ].join('\n');
  }

  static buildNoteHtml(note: Note, includeMetadata = true): string {
    return createHtmlDocument(
      note.title || 'Untitled Note',
      buildNoteMetadata(note, includeMetadata),
      note.content || '',
    );
  }

  static buildTodoHtml(todo: Todo): string {
    const bodyText = this.formatTodoAsText(todo);
    const metadataLines = [
      `Updated: ${formatDate(todo.updatedAt)}`,
      todo.repo ? `Repository: ${todo.repo}` : '',
      todo.branch ? `Branch: ${todo.branch}` : '',
    ].filter(Boolean);

    return createHtmlDocument(todo.text || 'Untitled Todo', metadataLines, bodyText);
  }

  static buildCanvasHtml(canvas: Canvas): string {
    const metadataLines = [
      `Created: ${formatDate(canvas.createdAt)}`,
      `Updated: ${formatDate(canvas.updatedAt)}`,
      canvas.folderPath ? `Folder: ${canvas.folderPath}` : '',
      canvas.tags.length ? `Tags: ${canvas.tags.join(', ')}` : '',
    ].filter(Boolean);

    return createHtmlDocument(canvas.title || 'Untitled Canvas', metadataLines, this.formatCanvasAsText(canvas));
  }

  static async generateDocxBytes({ title, bodyText, metadataLines = [] }: DocxContentInput): Promise<Uint8Array> {
    const zip = new JSZip();

    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
    );

    zip.folder('_rels')?.file(
      '.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
    );

    zip.folder('docProps')?.file(
      'app.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
  xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>GitNotēs</Application>
</Properties>`,
    );

    const isoNow = new Date().toISOString();
    zip.folder('docProps')?.file(
      'core.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:dcmitype="http://purl.org/dc/dcmitype/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title)}</dc:title>
  <dc:creator>GitNotēs</dc:creator>
  <cp:lastModifiedBy>GitNotēs</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${isoNow}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${isoNow}</dcterms:modified>
</cp:coreProperties>`,
    );

    const bodyParagraphs = [
      paragraphXml(title),
      ...metadataLines.map(paragraphXml),
      ...(metadataLines.length ? [paragraphXml('')] : []),
      ...bodyText.split(/\r?\n/).map(paragraphXml),
    ].join('');

    zip.folder('word')?.file(
      'document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyParagraphs}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`,
    );

    return zip.generateAsync({ type: 'uint8array' });
  }

  static createNoteArtifact(note: Note, format: ExportFormat, includeMetadata = true): Promise<ExportArtifact> {
    return this.createArtifact(format, this.buildNoteSource(note, includeMetadata));
  }

  static createTodoArtifact(todo: Todo, format: ExportFormat): Promise<ExportArtifact> {
    return this.createArtifact(format, this.buildTodoSource(todo));
  }

  static createCanvasArtifact(canvas: Canvas, format: ExportFormat): Promise<ExportArtifact> {
    return this.createArtifact(format, this.buildCanvasSource(canvas));
  }

  private static buildNoteSource(note: Note, includeMetadata: boolean): ExportSource {
    return {
      filenameStem: sanitizeFilename(note.title, 'untitled-note'),
      title: note.title || 'Untitled Note',
      bodyText: note.content || '',
      metadataLines: buildNoteMetadata(note, includeMetadata),
      html: this.buildNoteHtml(note, includeMetadata),
    };
  }

  private static buildTodoSource(todo: Todo): ExportSource {
    return {
      filenameStem: sanitizeFilename(todo.text, 'untitled-todo'),
      title: todo.text || 'Untitled Todo',
      bodyText: this.formatTodoAsText(todo),
      metadataLines: [
        `Updated: ${formatDate(todo.updatedAt)}`,
        todo.repo ? `Repository: ${todo.repo}` : '',
        todo.branch ? `Branch: ${todo.branch}` : '',
      ].filter(Boolean),
      html: this.buildTodoHtml(todo),
    };
  }

  private static buildCanvasSource(canvas: Canvas): ExportSource {
    return {
      filenameStem: sanitizeFilename(canvas.title, 'untitled-canvas'),
      title: canvas.title || 'Untitled Canvas',
      bodyText: this.formatCanvasAsText(canvas),
      metadataLines: [
        `Created: ${formatDate(canvas.createdAt)}`,
        `Updated: ${formatDate(canvas.updatedAt)}`,
        canvas.folderPath ? `Folder: ${canvas.folderPath}` : '',
        canvas.tags.length ? `Tags: ${canvas.tags.join(', ')}` : '',
      ].filter(Boolean),
      html: this.buildCanvasHtml(canvas),
    };
  }

  private static async createArtifact(format: ExportFormat, source: ExportSource): Promise<ExportArtifact> {
    const filename = `${source.filenameStem}.${format}`;

    if (format === 'pdf') {
      if (Platform.OS === 'web') {
        return {
          filename: `${source.filenameStem}.html`,
          mimeType: 'text/html',
          webData: source.html,
          webMimeType: 'text/html',
        };
      }

      const { uri } = await Print.printToFileAsync({ html: source.html });
      return { filename, mimeType: 'application/pdf', uri };
    }

    const bytes = await this.generateDocxBytes({
      title: source.title,
      bodyText: source.bodyText,
      metadataLines: source.metadataLines,
    });

    if (Platform.OS === 'web') {
      return {
        filename,
        mimeType: DOCX_MIME_TYPE,
        webData: bytes,
        webMimeType: DOCX_MIME_TYPE,
      };
    }

    const file = writeDownloadFile(filename, DOCX_MIME_TYPE, bytes);
    return { filename, mimeType: DOCX_MIME_TYPE, uri: file.uri };
  }
}

export default ExportService;
