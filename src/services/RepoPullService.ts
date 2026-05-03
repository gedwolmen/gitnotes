import { GitHubService } from './GitHubService';
import { GitService } from './GitService';
import { StorageService } from './StorageService';
import { createNote, isNoteColor, NoteColor } from '../models/Note';
import { createCanvas, updateCanvas, CanvasScene } from '../models/Canvas';
import { createTodoItem, applyTodoUpdate, reorderTodos } from '../models/Todo';
import { parseRepoPath } from '../utils/gitPathParser';
import { canPersistNoteTags } from '../utils/noteTagSupport';

async function fetchDirectoryFiles(
  owner: string,
  repo: string,
  dirPath: string,
  branch: string,
): Promise<{ path: string; content: string }[]> {
  const contents = await GitHubService.getRepoContents(owner, repo, dirPath, branch);
  const files = contents.filter((item) => item.type === 'file' && item.download_url);

  const results: { path: string; content: string }[] = [];
  for (const file of files) {
    try {
      const content = await GitHubService.getFileContent(owner, repo, file.path, branch);
      if (content) {
        results.push({ path: file.path, content });
      }
    } catch {
      console.warn(`[RepoPullService] Failed to fetch ${file.path}`);
    }
  }
  return results;
}

const NOTE_EXTS = ['md', 'markdown', 'norg', 'org', 'txt'] as const;

function noteFormatFromExt(ext: string): 'markdown' | 'neorg' | 'org' {
  if (ext === 'norg') return 'neorg';
  if (ext === 'org') return 'org';
  return 'markdown';
}

const FILE_FETCH_CONCURRENCY = 8;

async function fetchInBatches<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchOut = await Promise.all(batch.map(fn));
    out.push(...batchOut);
  }
  return out;
}

function extractTagsFromMarkdown(content: string): string[] {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return [];

  const tagsLine = match[1].split('\n').find((line) => /^tags\s*:/i.test(line.trim()));
  if (!tagsLine) return [];

  const raw = tagsLine.replace(/^tags\s*:\s*/i, '').trim();
  const inner = raw.replace(/^\[/, '').replace(/\]$/, '').trim();
  if (!inner) return [];

  return inner.split(',').map((tag) => tag.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}

function extractTagsFromOrg(content: string): string[] {
  const match = content.match(/^#\+FILETAGS:\s*:(.+?):\s*$/im);
  if (!match) return [];
  return match[1].split(':').map((tag) => tag.trim()).filter(Boolean);
}

function extractTagsFromNeorg(content: string): string[] {
  const match = content.match(/^categories:\s*\[(.+?)\]\s*$/im);
  if (!match) return [];
  return match[1].split(',').map((tag) => tag.trim()).filter(Boolean);
}

function extractTagsFromContent(content: string, format: 'markdown' | 'neorg' | 'org' | 'pdf' | 'json'): string[] {
  if (!canPersistNoteTags(format)) return [];
  if (format === 'markdown') return extractTagsFromMarkdown(content);
  if (format === 'org') return extractTagsFromOrg(content);
  if (format === 'neorg') return extractTagsFromNeorg(content);
  return [];
}

function extractColorFromMarkdown(content: string): string | undefined {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return undefined;
  const colorLine = match[1].split('\n').find((line) => /^color\s*:/i.test(line.trim()));
  if (!colorLine) return undefined;
  return colorLine.replace(/^\s*color\s*:\s*/i, '').trim().replace(/^['"]|['"]$/g, '');
}

function extractColorFromOrg(content: string): string | undefined {
  const match = content.match(/^#\+COLOR:\s*(.+?)\s*$/im);
  return match ? match[1].trim() : undefined;
}

function extractColorFromNeorg(content: string): string | undefined {
  const lines = content.split('\n');
  const startIndex = lines.findIndex((line) => line.trim() === '@document.meta');
  if (startIndex === -1) return undefined;
  const endIndex = lines.findIndex((line, idx) => idx > startIndex && line.trim() === '@end');
  if (endIndex === -1) return undefined;
  const colorLine = lines.slice(startIndex + 1, endIndex).find((line) => /^color\s*:/i.test(line.trim()));
  if (!colorLine) return undefined;
  return colorLine.replace(/^\s*color\s*:\s*/i, '').trim();
}

function extractColorFromContent(
  content: string,
  format: 'markdown' | 'neorg' | 'org' | 'pdf' | 'json',
): NoteColor | undefined {
  if (!canPersistNoteTags(format)) return undefined;
  let raw: string | undefined;
  if (format === 'markdown') raw = extractColorFromMarkdown(content);
  else if (format === 'org') raw = extractColorFromOrg(content);
  else if (format === 'neorg') raw = extractColorFromNeorg(content);
  if (!raw) return undefined;
  return isNoteColor(raw) ? raw : undefined;
}

async function pullNotesFromRepo(
  owner: string,
  repo: string,
  repoPath: string,
  branch: string,
): Promise<number> {
  try {
    const tree = await GitHubService.getTreeRecursive(owner, repo, branch);
    const noteBlobs = tree.filter((item) => {
      if (item.type !== 'blob') return false;
      if (!item.path.startsWith('notes/')) return false;
      if (item.path.startsWith('notes/images/')) return false;
      const ext = item.path.split('.').pop()?.toLowerCase();
      return NOTE_EXTS.includes(ext as (typeof NOTE_EXTS)[number]);
    });

    if (noteBlobs.length === 0) return 0;

    const fetched = await fetchInBatches(
      noteBlobs,
      async (blob) => {
        const content = await GitHubService.getFileContent(owner, repo, blob.path, branch);
        return content === null ? null : { path: blob.path, content };
      },
      FILE_FETCH_CONCURRENCY,
    );

    // Build a set of remote file paths we successfully observed. The set is
    // the basis for reconciling local notes against the remote tree below.
    // We populate it from `noteBlobs` (the full list of relevant remote
    // entries) — not `fetched` — so a transient per-file fetch failure does
    // not cause us to drop a still-existing local note.
    const remoteFilePaths = new Set<string>(noteBlobs.map((b) => b.path));

    let allNotes = await StorageService.getAllNotes();
    let pulled = 0;

    const seen = new Set<string>();
    const hadDupes = allNotes.some((n) => {
      const key = n.repo && n.filePath ? `${n.repo}::${n.filePath}` : null;
      if (!key) return false;
      if (seen.has(key)) return true;
      seen.add(key);
      return false;
    });

    if (hadDupes) {
      const seen2 = new Set<string>();
      allNotes = allNotes.filter((n) => {
        const key = n.repo && n.filePath ? `${n.repo}::${n.filePath}` : null;
        if (!key) return true;
        if (seen2.has(key)) return false;
        seen2.add(key);
        return true;
      });
    }

    for (const item of fetched) {
      if (!item) continue;
      const ext = item.path.split('.').pop()?.toLowerCase() ?? 'md';
      const format = noteFormatFromExt(ext);
      const tags = extractTagsFromContent(item.content, format);
      const color = extractColorFromContent(item.content, format);
      const titleFromPath = item.path
        .replace(/^notes\//, '')
        .replace(/\.[^.]+$/, '')
        .replace(/[-_/]/g, ' ');

      const existingIdx = allNotes.findIndex(
        (n) =>
          (n.repo === repoPath && n.filePath === item.path) ||
          (n.repo === repoPath && n.filePath == null && n.title === titleFromPath),
      );
      if (existingIdx !== -1) {
        const existing = allNotes[existingIdx];
        // Only mutate the local note if the remote content actually differs.
        // Bumping updatedAt unconditionally clobbered cross-device LWW: a
        // pure read on device B would defeat a real write on device A whose
        // pull happened a moment later.
        if (existing.content !== item.content) {
          allNotes[existingIdx] = {
            ...existing,
            content: item.content,
            tags,
            color: color ?? existing.color,
            updatedAt: Date.now(),
          };
          pulled++;
        } else if (color && color !== existing.color) {
          allNotes[existingIdx] = { ...existing, color };
          pulled++;
        }
      } else {
        allNotes.push(
          createNote({
            title: titleFromPath,
            content: item.content,
            repo: repoPath,
            branch,
            filePath: item.path,
            format,
            tags,
            color,
          }),
        );
        pulled++;
      }
    }

    // Reconcile: drop local notes that were pulled from this same repo+branch
    // but whose backing file no longer exists in the remote tree. Without
    // this, deleting a file on the remote (or moving/renaming it) leaves a
    // stale local note around forever — which surfaces in the folder filter
    // chips on the Notes list.
    //
    // Safety:
    //   * Scoped to this (repoPath, branch) — never touches notes from other
    //     repos or branches.
    //   * Only deletes notes that have a `filePath` (i.e. originated from the
    //     repo). Local-only drafts have no filePath and are preserved.
    //   * The early return when `noteBlobs.length === 0` above acts as the
    //     empty-tree guardrail: a transient empty/errored fetch skips
    //     reconciliation entirely rather than wiping everything.
    const beforeCount = allNotes.length;
    allNotes = allNotes.filter((n) => {
      if (n.repo !== repoPath) return true;
      if (n.branch !== branch) return true;
      if (!n.filePath) return true;
      return remoteFilePaths.has(n.filePath);
    });
    const removed = beforeCount - allNotes.length;
    if (removed > 0) {
      console.log(
        `[RepoPullService] Reconciled ${removed} stale note(s) for ${repoPath}@${branch}`,
      );
    }

    await StorageService.saveAllNotes(allNotes);

    // Also invalidate the folders cache so editor folder dropdowns reflect
    // the freshly pulled tree (ignored if the cache layer fails — best
    // effort).
    try {
      await GitService.invalidateRepoFoldersCache(repoPath, branch);
    } catch {
      // best-effort; cache will expire on its own TTL.
    }

    return pulled;
  } catch {
    console.warn(`[RepoPullService] Failed to pull notes from ${owner}/${repo}`);
    return 0;
  }
}

async function pullCanvasesFromRepo(
  owner: string,
  repo: string,
  repoPath: string,
  branch: string,
): Promise<number> {
  let pulled = 0;
  try {
    const files = await fetchDirectoryFiles(owner, repo, 'canvases', branch);
    if (files.length === 0) return 0;

    await StorageService.mutateCanvases((allCanvases) => {
      for (const file of files) {
        if (!file.path.endsWith('.json')) continue;

        let scene: CanvasScene;
        try {
          scene = JSON.parse(file.content);
        } catch {
          continue;
        }

        const titleFromPath = file.path
          .replace(/^canvases\//, '')
          .replace(/\.json$/, '')
          .replace(/-/g, ' ');

        const idx = allCanvases.findIndex((c) => c.filePath === file.path);
        if (idx !== -1) {
          const existing = allCanvases[idx];
          if (JSON.stringify(existing.scene) !== JSON.stringify(scene)) {
            allCanvases[idx] = updateCanvas(existing, { scene });
            pulled++;
          }
        } else {
          allCanvases.push(
            createCanvas({
              title: titleFromPath,
              scene,
              repo: repoPath,
              branch,
              filePath: file.path,
            }),
          );
          pulled++;
        }
      }
    });
  } catch {
    console.warn(`[RepoPullService] Failed to pull canvases from ${owner}/${repo}`);
  }
  return pulled;
}

async function pullTodosFromRepo(
  owner: string,
  repo: string,
  repoPath: string,
  branch: string,
): Promise<number> {
  let pulled = 0;
  try {
    const files = await fetchDirectoryFiles(owner, repo, 'todos', branch);
    if (files.length === 0) return 0;

    const allTodos = await StorageService.getAllTodos();
    let dirty = false;

    for (const file of files) {
      if (!file.path.endsWith('.json')) continue;

      let data: Record<string, any>;
      try {
        data = JSON.parse(file.content);
      } catch {
        continue;
      }

      const titleFromPath = file.path
        .replace(/^todos\//, '')
        .replace(/\.json$/, '')
        .replace(/-/g, ' ');

      const idx = allTodos.findIndex((t) => t.filePath === file.path);
      if (idx !== -1) {
        const existing = allTodos[idx];
        const updated = applyTodoUpdate(existing, {
          text: data.text ?? existing.text,
          completed: data.completed ?? existing.completed,
          priority: data.priority ?? existing.priority,
          notes: data.notes ?? existing.notes,
          tags: data.tags ?? existing.tags,
          dueDate: data.dueDate ?? existing.dueDate,
        });
        allTodos[idx] = updated;
        dirty = true;
        pulled++;
      } else {
        allTodos.push(
          createTodoItem({
            text: data.text ?? titleFromPath,
            completed: data.completed ?? false,
            priority: data.priority,
            notes: data.notes,
            tags: data.tags,
            dueDate: data.dueDate,
            repo: repoPath,
            branch,
            filePath: file.path,
          }),
        );
        dirty = true;
        pulled++;
      }
    }

    if (dirty) {
      await StorageService.saveAllTodos(reorderTodos(allTodos));
    }
  } catch {
    console.warn(`[RepoPullService] Failed to pull todos from ${owner}/${repo}`);
  }
  return pulled;
}

export interface PullResult {
  repos: number;
  notes: number;
  canvases: number;
  todos: number;
}

export async function pullFromSingleRepo(repoPath: string): Promise<PullResult> {
  if (!GitHubService.isAuthenticated()) {
    return { repos: 0, notes: 0, canvases: 0, todos: 0 };
  }

  const repos = await StorageService.getSavedRepositories();
  const repo = repos.find((r) => r.path === repoPath);
  if (!repo) {
    return { repos: 0, notes: 0, canvases: 0, todos: 0 };
  }

  const repoInfo = parseRepoPath(repo.path);
  if (!repoInfo) {
    return { repos: 0, notes: 0, canvases: 0, todos: 0 };
  }
  const branch = repo.branch || 'main';

  const [notes, canvases, todos] = await Promise.all([
    pullNotesFromRepo(repoInfo.owner, repoInfo.repo, repo.path, branch),
    pullCanvasesFromRepo(repoInfo.owner, repoInfo.repo, repo.path, branch),
    pullTodosFromRepo(repoInfo.owner, repoInfo.repo, repo.path, branch),
  ]);

  return { repos: 1, notes, canvases, todos };
}

export async function pullAllFromRepos(): Promise<PullResult> {
  if (!GitHubService.isAuthenticated()) {
    return { repos: 0, notes: 0, canvases: 0, todos: 0 };
  }

  const repos = await StorageService.getSavedRepositories();
  let totalNotes = 0;
  let totalCanvases = 0;
  let totalTodos = 0;
  let reposProcessed = 0;

  for (const repo of repos) {
    const repoInfo = parseRepoPath(repo.path);
    if (!repoInfo) continue;

    const branch = repo.branch || 'main';

    const [notes, canvases, todos] = await Promise.all([
      pullNotesFromRepo(repoInfo.owner, repoInfo.repo, repo.path, branch),
      pullCanvasesFromRepo(repoInfo.owner, repoInfo.repo, repo.path, branch),
      pullTodosFromRepo(repoInfo.owner, repoInfo.repo, repo.path, branch),
    ]);

    totalNotes += notes;
    totalCanvases += canvases;
    totalTodos += todos;
    reposProcessed++;
  }

  return { repos: reposProcessed, notes: totalNotes, canvases: totalCanvases, todos: totalTodos };
}
