import { GitHubService } from './GitHubService';
import { StorageService } from './StorageService';
import { NoteFormat } from '../models/Note';
import { parseRepoPath } from '../utils/gitPathParser';

export interface SyncResult {
  total: number;
  created: number;
  skipped: number;
  errors: string[];
}

// JSON intentionally excluded: canvases live in /canvases/*.json with their
// own storage and shouldn't pollute the notes list. Including JSON here also
// surfaces unrelated repo configs (package.json, tsconfig.json) as notes.
const SUPPORTED_EXTENSIONS: Record<string, NoteFormat> = {
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.norg': 'neorg',
  '.org': 'org',
  '.pdf': 'pdf',
};

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot >= 0 ? filename.substring(lastDot).toLowerCase() : '';
}

function detectFormat(filename: string): NoteFormat | null {
  const ext = getExtension(filename);
  return SUPPORTED_EXTENSIONS[ext] || null;
}

function encodeGitHubPath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function buildGitHubContentsApiUrl(owner: string, repo: string, path: string, branch?: string): string {
  const encodedPath = encodeGitHubPath(path);
  const refQuery = branch ? `?ref=${encodeURIComponent(branch)}` : '';
  return `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}${refQuery}`;
}

class RepoFileSyncServiceClass {
  async syncRepoFiles(repoPath: string, branch?: string): Promise<SyncResult> {
    const result: SyncResult = { total: 0, created: 0, skipped: 0, errors: [] };

    const repoInfo = parseRepoPath(repoPath);
    if (!repoInfo) {
      result.errors.push(`Invalid repository path: ${repoPath}`);
      return result;
    }

    try {
      await this.syncDirectory(repoInfo.owner, repoInfo.repo, '', repoPath, branch, result);
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }

    return result;
  }

  private async syncDirectory(
    owner: string,
    repo: string,
    path: string,
    repoPath: string,
    branch: string | undefined,
    result: SyncResult
  ): Promise<void> {
    const contents = await GitHubService.getRepoContents(owner, repo, path);

    for (const item of contents) {
      if (item.type === 'dir') {
        await this.syncDirectory(owner, repo, item.path, repoPath, branch, result);
      } else if (item.type === 'file') {
        const format = detectFormat(item.name);
        if (!format) continue;

        result.total++;

        try {
          let content: string | null = null;

          if (format === 'pdf') {
            content = buildGitHubContentsApiUrl(owner, repo, item.path, branch);
          } else {
            content = await GitHubService.getFileContent(owner, repo, item.path);
          }

          if (!content) {
            result.skipped++;
            continue;
          }

          const existingNotes = await StorageService.getAllNotes();
          const exists = existingNotes.some(
            (n) => n.repo === repoPath && n.filePath === item.path
          );

          if (exists) {
            result.skipped++;
            continue;
          }

          const title = item.name.replace(/\.[^.]+$/, '');
          const lastSlash = item.path.lastIndexOf('/');
          const folderPath = lastSlash > 0 ? item.path.substring(0, lastSlash) : undefined;
          await StorageService.createNote({
            title,
            content,
            repo: repoPath,
            branch,
            format,
            tags: [],
            filePath: item.path,
            folderPath,
          });

          result.created++;
        } catch (error) {
          result.errors.push(`Failed to sync ${item.path}: ${error}`);
        }
      }
    }
  }
}

export const RepoFileSyncService = new RepoFileSyncServiceClass();
