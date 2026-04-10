import { GitHubService } from './GitHubService';
import { NoteFormat } from '../models/Note';
import * as FileSystem from 'expo-file-system';

export interface NoteGitHubSyncResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

function parseRepoPath(repoPath: string): { owner: string; repo: string } | null {
  const cleaned = repoPath
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/^github\.com\//, '')
    .replace(/\.git$/, '')
    .trim();
  const parts = cleaned.split('/');
  if (parts.length >= 2) {
    return { owner: parts[0], repo: parts[1] };
  }
  return null;
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

export async function syncNoteToGitHub(params: {
  repo: string;
  branch?: string;
  filePath?: string;
  title: string;
  content: string;
  format?: NoteFormat;
}): Promise<NoteGitHubSyncResult> {
  const { repo: repoPath, branch, filePath, title, content, format } = params;

  if (!GitHubService.isAuthenticated()) {
    return { success: false, error: 'GitHub not authenticated' };
  }

  const repoInfo = parseRepoPath(repoPath);
  if (!repoInfo) {
    return { success: false, error: `Invalid repo path: ${repoPath}` };
  }

  const targetBranch = branch || 'main';
  const ext = getExtension(format);

  let targetPath = filePath;
  if (!targetPath) {
    const slug = slugify(title);
    targetPath = `notes/${slug}${ext}`;
  }

  const noteSlug = slugify(title);

  let finalContent = content;
  try {
    finalContent = await uploadLocalImages(content, repoInfo.owner, repoInfo.repo, targetBranch, noteSlug);
  } catch (error) {
    console.warn('[NoteGitHubSync] Image upload failed, syncing note without images:', error);
  }

  const message = filePath ? `Update note: ${title}` : `Create note: ${title}`;

  try {
    const result = await GitHubService.updateFile(
      repoInfo.owner,
      repoInfo.repo,
      targetPath,
      finalContent,
      message,
      targetBranch,
    );

    if (result) {
      return { success: true, filePath: targetPath };
    }
    return { success: false, error: 'GitHub API returned no result' };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
