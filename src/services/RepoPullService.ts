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

async function pullNotesFromRepo(
  owner: string,
  repo: string,
  repoPath: string,
  branch: string,
): Promise<number> {
  let pulled = 0;
  try {
    const files = await fetchDirectoryFiles(owner, repo, 'notes', branch);
    const localNotes = await StorageService.getAllNotes();

    for (const file of files) {
      const ext = file.path.split('.').pop()?.toLowerCase();
      if (!['md', 'norg', 'org', 'txt'].includes(ext ?? '')) continue;

      const existing = localNotes.find((n) => n.filePath === file.path);
      const titleFromPath = file.path
        .replace(/^notes\//, '')
        .replace(/\.[^.]+$/, '')
        .replace(/-/g, ' ');

      if (existing) {
        await StorageService.updateNote({ id: existing.id, content: file.content });
        pulled++;
      } else {
        const newNote = createNote({
          title: titleFromPath,
          content: file.content,
          repo: repoPath,
          branch,
          filePath: file.path,
          format: ext === 'norg' ? 'neorg' : ext === 'org' ? 'org' : 'markdown',
        });
        const allNotes = await StorageService.getAllNotes();
        allNotes.push(newNote);
        await StorageService.saveAllNotes(allNotes);
        pulled++;
      }
    }
  } catch {
    console.warn(`[RepoPullService] Failed to pull notes from ${owner}/${repo}`);
  }
  return pulled;
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
    const localCanvases = await StorageService.getAllCanvases();

    for (const file of files) {
      if (!file.path.endsWith('.json')) continue;

      let scene: CanvasScene;
      try {
        scene = JSON.parse(file.content);
      } catch {
        continue;
      }

      const existing = localCanvases.find((c) => c.filePath === file.path);
      const titleFromPath = file.path
        .replace(/^canvases\//, '')
        .replace(/\.json$/, '')
        .replace(/-/g, ' ');

      if (existing) {
        const updated = updateCanvas(existing, { scene });
        const allCanvases = await StorageService.getAllCanvases();
        const idx = allCanvases.findIndex((c) => c.id === existing.id);
        if (idx !== -1) {
          allCanvases[idx] = updated;
          await StorageService.saveAllCanvases(allCanvases);
        }
        pulled++;
      } else {
        const newCanvas = createCanvas({
          title: titleFromPath,
          scene,
          repo: repoPath,
          branch,
          filePath: file.path,
        });
        const allCanvases = await StorageService.getAllCanvases();
        allCanvases.push(newCanvas);
        await StorageService.saveAllCanvases(allCanvases);
        pulled++;
      }
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
    const localTodos = await StorageService.getAllTodos();

    for (const file of files) {
      if (!file.path.endsWith('.json')) continue;

      let data: Record<string, any>;
      try {
        data = JSON.parse(file.content);
      } catch {
        continue;
      }

      const existing = localTodos.find((t) => t.filePath === file.path);
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
        const allTodos = await StorageService.getAllTodos();
        const idx = allTodos.findIndex((t) => t.id === existing.id);
        if (idx !== -1) {
          allTodos[idx] = updated;
          await StorageService.saveAllTodos(allTodos);
        }
        pulled++;
      } else {
        const newTodo = createTodoItem({
          text: data.text ?? titleFromPath,
          completed: data.completed ?? false,
          priority: data.priority,
          notes: data.notes,
          tags: data.tags,
          dueDate: data.dueDate,
          repo: repoPath,
          branch,
          filePath: file.path,
        });
        const allTodos = await StorageService.getAllTodos();
        allTodos.push(newTodo);
        await StorageService.saveAllTodos(allTodos);
        pulled++;
      }
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
