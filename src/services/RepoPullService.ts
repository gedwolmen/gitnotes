import { GitHubService } from './GitHubService';
import { StorageService } from './StorageService';
import { createNote } from '../models/Note';
import { createCanvas, updateCanvas, CanvasScene } from '../models/Canvas';
import { createTodoItem, applyTodoUpdate } from '../models/Todo';

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

    const allNotes = await StorageService.getAllNotes();
    let pulled = 0;

    for (const item of fetched) {
      if (!item) continue;
      const ext = item.path.split('.').pop()?.toLowerCase() ?? 'md';
      const titleFromPath = item.path
        .replace(/^notes\//, '')
        .replace(/\.[^.]+$/, '')
        .replace(/[-_/]/g, ' ');

      const existingIdx = allNotes.findIndex(
        (n) => n.repo === repoPath && n.filePath === item.path,
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
            updatedAt: Date.now(),
          };
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
            format: noteFormatFromExt(ext),
          }),
        );
        pulled++;
      }
    }

    await StorageService.saveAllNotes(allNotes);
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
    const allCanvases = await StorageService.getAllCanvases();

    for (const file of files) {
      if (!file.path.endsWith('.json')) continue;

      let scene: CanvasScene;
      try {
        scene = JSON.parse(file.content);
      } catch {
        continue;
      }

      const existing = allCanvases.find((c) => c.filePath === file.path);
      const titleFromPath = file.path
        .replace(/^canvases\//, '')
        .replace(/\.json$/, '')
        .replace(/-/g, ' ');

      if (existing) {
        // Skip the local mutation if the scene is bytewise unchanged. Avoids
        // pushing an artificial updatedAt that would clobber cross-device LWW.
        const sceneChanged = JSON.stringify(existing.scene) !== JSON.stringify(scene);
        if (sceneChanged) {
          const updated = updateCanvas(existing, { scene });
          const idx = allCanvases.findIndex((c) => c.id === existing.id);
          if (idx !== -1) {
            allCanvases[idx] = updated;
          }
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

    if (pulled > 0) {
      await StorageService.saveAllCanvases(allCanvases);
    }
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
    const allTodos = await StorageService.getAllTodos();

    for (const file of files) {
      if (!file.path.endsWith('.json')) continue;

      let data: Record<string, any>;
      try {
        data = JSON.parse(file.content);
      } catch {
        continue;
      }

      const existing = allTodos.find((t) => t.filePath === file.path);
      const titleFromPath = file.path
        .replace(/^todos\//, '')
        .replace(/\.json$/, '')
        .replace(/-/g, ' ');

      if (existing) {
        const updated = applyTodoUpdate(existing, {
          text: data.text ?? existing.text,
          completed: data.completed ?? existing.completed,
          priority: data.priority ?? existing.priority,
          notes: data.notes ?? existing.notes,
          tags: data.tags ?? existing.tags,
          dueDate: data.dueDate ?? existing.dueDate,
        });
        const idx = allTodos.findIndex((t) => t.id === existing.id);
        if (idx !== -1) {
          allTodos[idx] = updated;
        }
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
        pulled++;
      }
    }

    if (pulled > 0) {
      await StorageService.saveAllTodos(allTodos);
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
