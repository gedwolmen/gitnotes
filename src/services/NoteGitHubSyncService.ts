import { GitHubService } from './GitHubService';
import { NoteColor, NoteFormat } from '../models/Note';
import * as FileSystem from 'expo-file-system/legacy';
import { parseRepoPath } from '../utils/gitPathParser';
import { AuthService } from './AuthService';
import { SyncEngineService } from './SyncEngineService';
import { LocalGitWriter } from './git/LocalGitWriter';
import { resolveBranch } from './git/branchResolver';

async function resolveAuthor(): Promise<{ name: string; email: string }> {
  const user = GitHubService.getUser();
  return {
    name: user?.name || user?.login || 'gitnotes',
    email: user?.email || `${user?.login ?? 'gitnotes'}@users.noreply.github.com`,
  };
}

async function resolveToken(accountId?: string): Promise<string | undefined> {
  if (!accountId) return undefined;
  const t = await AuthService.getTokenById(accountId);
  return t ?? undefined;
}

export interface NoteGitHubSyncResult {
  success: boolean;
  filePath?: string;
  finalContent?: string;
  error?: string;
}

export function canPersistNoteTags(format?: string): boolean {
  return format === 'markdown' || format === 'neorg' || format === 'org';
}

function joinTags(tags: string[]): string {
  return tags.map((tag) => tag.trim()).filter(Boolean).join(', ');
}

function splitLines(value: string): string[] {
  return value.length === 0 ? [] : value.split('\n');
}

function upsertMarkdownTags(content: string, tags: string[]): string {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return tags.length > 0 ? `---\ntags: [${joinTags(tags)}]\n---\n\n${content}` : content;
  }

  const body = content.slice(match[0].length);
  const lines = splitLines(match[1]).filter((line) => !/^tags\s*:/i.test(line.trim()));
  if (tags.length > 0) {
    lines.push(`tags: [${joinTags(tags)}]`);
  }

  if (lines.length === 0) {
    return body.replace(/^\n+/, '');
  }

  return `---\n${lines.join('\n')}\n---\n\n${body.replace(/^\n+/, '')}`;
}

// Mutates / inserts a `color: <value>` line in the markdown frontmatter.
// `color === null/undefined` removes the field. Adds a frontmatter block
// when none exists and the color is set; leaves un-fronted notes untouched
// when clearing.
function upsertMarkdownColor(content: string, color: NoteColor | null | undefined): string {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    if (!color) return content;
    return `---\ncolor: ${color}\n---\n\n${content}`;
  }

  const body = content.slice(match[0].length);
  const lines = splitLines(match[1]).filter((line) => !/^color\s*:/i.test(line.trim()));
  if (color) {
    lines.push(`color: ${color}`);
  }

  if (lines.length === 0) {
    return body.replace(/^\n+/, '');
  }

  return `---\n${lines.join('\n')}\n---\n\n${body.replace(/^\n+/, '')}`;
}

function upsertOrgColor(content: string, color: NoteColor | null | undefined): string {
  const lines = splitLines(content);
  const index = lines.findIndex((line) => /^#\+COLOR:/i.test(line.trim()));

  if (index === -1) {
    if (!color) return content;
    return `#+COLOR: ${color}\n${content}`;
  }

  if (!color) {
    lines.splice(index, 1);
    return lines.join('\n').replace(/^\n+/, '');
  }

  lines[index] = `#+COLOR: ${color}`;
  return lines.join('\n');
}

function upsertNeorgColor(content: string, color: NoteColor | null | undefined): string {
  const lines = splitLines(content);
  const startIndex = lines.findIndex((line) => line.trim() === '@document.meta');

  if (startIndex === -1) {
    if (!color) return content;
    return `@document.meta\ncolor: ${color}\n@end\n\n${content}`;
  }

  const endIndex = lines.findIndex((line, idx) => idx > startIndex && line.trim() === '@end');
  if (endIndex === -1) return content;

  const metaLines = lines.slice(startIndex + 1, endIndex).filter((line) => !/^color\s*:/i.test(line.trim()));
  if (color) {
    metaLines.push(`color: ${color}`);
  }

  return [
    ...lines.slice(0, startIndex + 1),
    ...metaLines,
    ...lines.slice(endIndex),
  ].join('\n');
}

export function applyNoteColorToContent(
  content: string,
  format: NoteFormat | undefined,
  color: NoteColor | null | undefined,
): string {
  if (!canPersistNoteTags(format)) return content;
  if (format === 'markdown') return upsertMarkdownColor(content, color);
  if (format === 'org') return upsertOrgColor(content, color);
  if (format === 'neorg') return upsertNeorgColor(content, color);
  return content;
}

function upsertOrgTags(content: string, tags: string[]): string {
  const lines = splitLines(content);
  const index = lines.findIndex((line) => /^#\+FILETAGS:/i.test(line.trim()));

  if (index === -1) {
    if (tags.length === 0) return content;
    return `#+FILETAGS: :${tags.map((tag) => tag.trim()).filter(Boolean).join(':')}:\n\n${content}`;
  }

  if (tags.length === 0) {
    lines.splice(index, 1);
    return lines.join('\n').replace(/^\n+/, '');
  }

  lines[index] = `#+FILETAGS: :${tags.map((tag) => tag.trim()).filter(Boolean).join(':')}:`;
  return lines.join('\n');
}

function upsertNeorgTags(content: string, tags: string[]): string {
  const lines = splitLines(content);
  const startIndex = lines.findIndex((line) => line.trim() === '@document.meta');

  if (startIndex === -1) {
    if (tags.length === 0) return content;
    return `@document.meta\ncategories: [${joinTags(tags)}]\n@end\n\n${content}`;
  }

  const endIndex = lines.findIndex((line, idx) => idx > startIndex && line.trim() === '@end');
  if (endIndex === -1) return content;

  const metaLines = lines.slice(startIndex + 1, endIndex).filter((line) => !/^categories\s*:/i.test(line.trim()));
  if (tags.length > 0) {
    metaLines.push(`categories: [${joinTags(tags)}]`);
  }

  if (metaLines.length === 0) {
    return content;
  }

  return [
    ...lines.slice(0, startIndex + 1),
    ...metaLines,
    ...lines.slice(endIndex),
  ].join('\n');
}

export function applyNoteTagsToContent(content: string, format?: NoteFormat, tags: string[] = []): string {
  if (!canPersistNoteTags(format)) return content;
  if (format === 'markdown') return upsertMarkdownTags(content, tags);
  if (format === 'org') return upsertOrgTags(content, tags);
  if (format === 'neorg') return upsertNeorgTags(content, tags);
  return content;
}

function getExtension(format?: NoteFormat): string {
  switch (format) {
    case 'neorg': return '.norg';
    case 'org': return '.org';
    default: return '.md';
  }
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'untitled';
}

function isLocalUri(uri: string): boolean {
  return uri.startsWith('file://') ||
    uri.startsWith('asset://') ||
    uri.startsWith('ph://') ||
    uri.startsWith('content://');
}

function sanitizeImageName(uri: string): string {
  const segments = uri.split('/');
  const rawName = segments[segments.length - 1] || `image-${Date.now()}.jpg`;
  const cleaned = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (cleaned.includes('.')) return cleaned;
  return `${cleaned}.jpg`;
}

async function uploadLocalImages(
  content: string,
  owner: string,
  repo: string,
  branch: string,
  noteSlug: string,
): Promise<string> {
  const imageRegex = /(!\[[^\]]*\]\()([^)]+)(\))/g;
  let updatedContent = content;
  const matches: { fullPrefix: string; uri: string; fullSuffix: string }[] = [];

  let match: RegExpExecArray | null = imageRegex.exec(content);
  while (match !== null) {
    const uri = match[2];
    if (isLocalUri(uri)) {
      matches.push({ fullPrefix: match[1], uri, fullSuffix: match[3] });
    }
    match = imageRegex.exec(content);
  }

  for (const img of matches) {
    try {
      const base64 = await FileSystem.readAsStringAsync(img.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (!base64) {
        console.warn('[NoteGitHubSync] Empty base64 for image:', img.uri);
        continue;
      }

      const imageName = sanitizeImageName(img.uri);
      const imagePath = `notes/images/${noteSlug}/${imageName}`;

      const uploadResult = await GitHubService.uploadBinaryFile(
        owner,
        repo,
        imagePath,
        base64,
        `Upload image: ${imageName}`,
        branch,
      );

      if (uploadResult) {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${imagePath}`;
        updatedContent = updatedContent.replace(
          `${img.fullPrefix}${img.uri}${img.fullSuffix}`,
          `${img.fullPrefix}${rawUrl}${img.fullSuffix}`,
        );
      } else {
        console.warn('[NoteGitHubSync] Failed to upload image:', imageName);
      }
    } catch (error) {
      console.warn('[NoteGitHubSync] Error uploading image:', img.uri, error);
    }
  }

  return updatedContent;
}

export async function deleteNoteFromGitHub(params: {
  repo: string;
  branch?: string;
  filePath: string;
  title?: string;
  accountId?: string;
  /**
   * Clone-mode only. When false, the delete commit is created locally
   * but the push to origin is deferred. The drain in
   * `NoteSyncQueueService` uses this to coalesce delete+upsert pushes
   * into one round-trip per `(repo, branch)` group (issue #565 phases
   * B.1 + A). Ignored on the Contents-API path.
   */
  push?: boolean;
}): Promise<NoteGitHubSyncResult> {
  const { repo: repoPath, branch, filePath, title, accountId, push } = params;
  const tokenOverride = await resolveToken(accountId);

  if (!tokenOverride && !GitHubService.isAuthenticated()) {
    return { success: false, error: 'GitHub not authenticated' };
  }

  const repoInfo = parseRepoPath(repoPath);
  if (!repoInfo) {
    return { success: false, error: `Invalid repo path: ${repoPath}` };
  }

  const targetBranch = await resolveBranch(repoPath, branch);
  const opts = tokenOverride ? { tokenOverride } : undefined;

  const mode = await SyncEngineService.getMode(repoPath);
  if (mode === 'clone') {
    const author = await resolveAuthor();
    const tokenForPush = tokenOverride ?? (await AuthService.getToken()) ?? undefined;
    return LocalGitWriter.deleteAndCommit({
      repoPath,
      branch: targetBranch,
      filePath,
      message: `Delete note: ${title || filePath}`,
      author,
      token: tokenForPush,
      push,
    });
  }

  try {
    // Cache-first lookup (#565 phase C). When the editor saved this note
    // a moment ago, the sha is already in memory and we skip the GET.
    const lookup = await GitHubService.getFileShaCached(
      repoInfo.owner,
      repoInfo.repo,
      filePath,
      targetBranch,
      opts,
    );
    if (lookup.kind === 'not-found') {
      return { success: true, filePath };
    }
    if (lookup.kind === 'error') {
      // Sha lookup itself failed (network blip, 5xx, …). Do NOT
      // soft-succeed — letting the local row delete here would let the
      // upstream copy come back on the next pull (#567 fix A).
      return { success: false, error: lookup.message };
    }

    const result = await GitHubService.deleteFile(
      repoInfo.owner,
      repoInfo.repo,
      filePath,
      `Delete note: ${title || filePath}`,
      lookup.sha,
      targetBranch,
      opts,
    );

    if (result) {
      return { success: true, filePath };
    }
    return { success: false, error: 'GitHub API returned no result' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (/404/.test(message)) {
      return { success: true, filePath };
    }
    return { success: false, error: message };
  }
}

export async function syncNoteToGitHub(params: {
  repo: string;
  branch?: string;
  filePath?: string;
  title: string;
  content: string;
  format?: NoteFormat;
  accountId?: string;
  tags?: string[];
  color?: NoteColor | null;
  /**
   * Clone-mode only. When false, the local working tree is updated and a
   * commit is created but the push to origin is deferred. The drain in
   * `NoteSyncQueueService` uses this to coalesce N writes into 1 push round-
   * trip per `(repo, branch)` group (issue #565 phase B.1). Ignored on the
   * Contents-API path — every API call is its own round-trip.
   */
  push?: boolean;
}): Promise<NoteGitHubSyncResult> {
  const { repo: repoPath, branch, filePath, title, content, format, accountId, tags = [], color, push } = params;
  const tokenOverride = await resolveToken(accountId);

  if (!tokenOverride && !GitHubService.isAuthenticated()) {
    return { success: false, error: 'GitHub not authenticated' };
  }

  const repoInfo = parseRepoPath(repoPath);
  if (!repoInfo) {
    return { success: false, error: `Invalid repo path: ${repoPath}` };
  }

  const targetBranch = await resolveBranch(repoPath, branch);
  const ext = getExtension(format);
  const opts = tokenOverride ? { tokenOverride } : undefined;

  let targetPath = filePath;
  if (!targetPath) {
    const slug = slugify(title);
    targetPath = `notes/${slug}${ext}`;
  }

  const noteSlug = slugify(title);

  let finalContent = applyNoteTagsToContent(content, format, tags);
  finalContent = applyNoteColorToContent(finalContent, format, color);
  try {
    finalContent = await uploadLocalImages(finalContent, repoInfo.owner, repoInfo.repo, targetBranch, noteSlug);
  } catch (error) {
    console.warn('[NoteGitHubSync] Image upload failed, syncing note without images:', error);
  }

  const message = filePath ? `Update note: ${title}` : `Create note: ${title}`;

  // Clone-mode write path (#514). We deliberately use the same `targetPath`
  // and `finalContent` as the API path, so the on-disk markdown is byte-
  // identical to what the Contents API would publish — that means a user can
  // flip modes without their next pull seeing churn.
  const mode = await SyncEngineService.getMode(repoPath);
  if (mode === 'clone') {
    const author = await resolveAuthor();
    const tokenForPush = tokenOverride ?? (await AuthService.getToken()) ?? undefined;
    const writeResult = await LocalGitWriter.writeAndCommit({
      repoPath,
      branch: targetBranch,
      filePath: targetPath,
      content: finalContent,
      message,
      author,
      token: tokenForPush,
      push,
    });
    if (writeResult.success) {
      return { success: true, filePath: targetPath, finalContent };
    }
    return { success: false, error: writeResult.error };
  }

  try {
    const result = await GitHubService.updateFile(
      repoInfo.owner,
      repoInfo.repo,
      targetPath,
      finalContent,
      message,
      targetBranch,
      opts,
    );

    if (result) {
      return { success: true, filePath: targetPath, finalContent };
    }
    return { success: false, error: 'GitHub API returned no result' };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
