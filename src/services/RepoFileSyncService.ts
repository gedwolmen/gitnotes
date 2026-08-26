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

// PDF content is fetched as raw base64 (not UTF-8 decoded) via GitHubService,
 // then stored as a data: URI. When git2-rs read support is available, this
 // will be replaced with native git cat-file from the local clone.
 async function fetchPdfContent(owner: string, repo: string, path: string, branch?: string): Promise<string | null> {
   try {
     const base64 = await GitHubService.getFileBase64(owner, repo, path, branch);
     if (!base64) return null;
     return `data:application/pdf;base64,${base64}`;
   } catch (error) {
     console.warn('[RepoFileSyncService] Failed to fetch PDF:', path, error);
     return null;
   }
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
        if (item.path === 'thoughts' || item.path.startsWith('thoughts/')) continue;
        await this.syncDirectory(owner, repo, item.path, repoPath, branch, result);
      } else if (item.type === 'file') {
        if (item.path.startsWith('thoughts/')) continue;
        const format = detectFormat(item.name);
        if (!format) continue;

        result.total++;

        try {
          let content: string | null = null;

          if (format === 'pdf') {
            content = await fetchPdfContent(owner, repo, item.path, branch);
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
