import { GitHubService } from './GitHubService';
import { GitService } from './GitService';
import { StorageService } from './StorageService';
import { createNote, isNoteColor, NoteColor } from '../models/Note';
import { createCanvas, updateCanvas, CanvasScene } from '../models/Canvas';
import { createTodoItem, applyTodoUpdate, reorderTodos } from '../models/Todo';
import { parseRepoPath } from '../utils/gitPathParser';
import { canPersistNoteTags } from '../utils/noteTagSupport';
import { TemplateRepoPreferenceService } from './TemplateRepoPreferenceService';
import { parseTemplateMarkdown } from './TemplateMarkdownService';
import type { NoteTemplate } from './TemplateService';
import { SyncEngineService } from './SyncEngineService';
import { GitFsService } from './git/GitFsService';
import { resolveBranch } from './git/branchResolver';
import { AuthService } from './AuthService';
import { ConflictResolverService } from './conflict/ConflictResolverService';
import { useConflictStore } from '../stores/conflictStore';

/**
 * Picks the read transport for a repo based on the user's per-repo
 * SyncEngineService toggle. In 'clone' mode the working copy is cloned
 * lazily on first pull (and fetched on subsequent pulls); in 'api' mode the
 * existing GitHub Contents API path is used. Output shapes match — both
 * `listTree` returns `{ path, type, sha }[]` and `readFile` returns
 * `string | null` — so callers can swap transports without branching.
 */
async function getRepoReader(
  repoPath: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<{
  mode: 'api' | 'clone';
  listTree: () => Promise<{ path: string; type: 'blob' | 'tree'; sha: string; size?: number }[]>;
  readFile: (path: string) => Promise<string | null>;
}> {
  const mode = await SyncEngineService.getMode(repoPath);
  if (mode === 'clone') {
    const token = (await AuthService.getToken()) ?? undefined;
    const cloned = await GitFsService.isCloned({ repoPath });
    if (!cloned) {
      await GitFsService.clone({ repoPath, branch, token });
    } else {
      // Phase 5: fast-forward instead of bare fetch so local unpushed commits
      // can't be silently shadowed by stale reconcile. When the local branch
      // has diverged we now keep going against `origin/<branch>` instead of
      // throwing (#629) — the user still sees the freshest remote state in
      // their notes list while their unpushed local commits stay safely in
      // the clone, and the conflict resolver / banner separately drives the
      // merge UI.
      const result = await GitFsService.pullWithFastForward({ repoPath, branch, token });
      if (!result.ok) {
        if (result.reason === 'diverged') {
          try {
            const localRef = `refs/heads/${branch}`;
            const remoteRef = `refs/remotes/origin/${branch}`;
            const mergeBase = await GitFsService.findMergeBase({ repoPath, ref1: localRef, ref2: remoteRef });
            if (mergeBase) {
              const conflictSet = await ConflictResolverService.detectConflicts({
                repoPath, branch, localRef, remoteRef, mergeBaseRef: mergeBase,
              });
              const resolved = await ConflictResolverService.autoResolve(conflictSet);
              await useConflictStore.getState().addConflict(resolved);
            }
          } catch (error) {
            console.warn(`[RepoPullService] conflict-resolve failed for ${repoPath}@${branch}:`, error);
          }
          // Read against origin so the user keeps seeing remote changes.
          // Their local commits remain in the clone and the conflict store
          // is now populated for the merge UI to drive resolution.
          const remoteRefName = `refs/remotes/origin/${branch}`;
          return {
            mode,
            listTree: () => GitFsService.listTree({ repoPath, ref: remoteRefName }),
            readFile: (path: string) =>
              GitFsService.readFile({ repoPath, ref: remoteRefName, filepath: path }),
          };
        }
        throw new Error(
          `Local repo ${repoPath}@${branch} pull failed (${result.reason}). ` +
            `Push or reset your local commits before the next pull.`,
        );
      }
    }
    return {
      mode,
      listTree: () => GitFsService.listTree({ repoPath, ref: branch }),
      readFile: (path: string) =>
        GitFsService.readFile({ repoPath, ref: branch, filepath: path }),
    };
  }
  return {
    mode,
    listTree: () => GitHubService.getTreeRecursiveOrThrow(owner, repo, branch),
    readFile: (path: string) => GitHubService.getFileContent(owner, repo, path, branch),
  };
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
    } catch (error) { void error;
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
    const reader = await getRepoReader(repoPath, owner, repo, branch);
    // Use the strict listTree contract so an actual API/clone failure (auth /
    // rate-limit / network / fsck) throws and is caught below, returning early
    // *without* running the reconciliation pass. A successful fetch that
    // returns zero note blobs is authoritative — the user has deleted every
    // notes file on the remote — and must run reconcile so local copies for
    // this scope are dropped.
    const tree = await reader.listTree();
    const noteBlobs = tree.filter((item) => {
      if (item.type !== 'blob') return false;
      if (!item.path.startsWith('notes/')) return false;
      if (item.path.startsWith('notes/images/')) return false;
      const ext = item.path.split('.').pop()?.toLowerCase();
      return NOTE_EXTS.includes(ext as (typeof NOTE_EXTS)[number]);
    });

    const fetched = await fetchInBatches(
      noteBlobs,
      async (blob) => {
        const content = await reader.readFile(blob.path);
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
    //     repo). Local-only drafts and pending uploads have no filePath until
    //     `NoteSyncQueueService` writes one back after a successful push.
    //   * Tree fetch uses the throwing `getTreeRecursiveOrThrow`, so we only
    //     reach this point when the GitHub API responded successfully. An
    //     empty `remoteFilePaths` means "the user actually deleted every note
    //     on the remote," which is a legitimate signal to wipe local copies.
    //     Transient failures throw and are caught below, returning 0 without
    //     running this pass.
    const beforeCount = allNotes.length;
    allNotes = allNotes.filter((n) => {
      if (n.repo !== repoPath) return true;
      if (n.branch !== branch) return true;
      if (!n.filePath) return true;
      return remoteFilePaths.has(n.filePath);
    });
    await StorageService.saveAllNotes(allNotes);

    // Also invalidate the folders cache so editor folder dropdowns reflect
    // the freshly pulled tree (ignored if the cache layer fails — best
    // effort).
    try {
      await GitService.invalidateRepoFoldersCache(repoPath, branch);
    } catch (error) {
      void error;
      // best-effort; cache will expire on its own TTL.
    }

    return pulled;
  } catch (error) {
    // Surface the real cause (#629). Without this, divergence, auth issues,
    // rate limits, and network failures all looked identical in Metro logs.
    console.warn(
      `[RepoPullService] notes pull from ${owner}/${repo}@${branch} failed:`,
      error instanceof Error ? error.message : error,
    );
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
  let files: { path: string; content: string }[] = [];
  let directoryExists = false;

  try {
    files = await fetchDirectoryFiles(owner, repo, 'canvases', branch);
    directoryExists = true;
  } catch {
    // Directory doesn't exist remotely (404) — treat as all canvases deleted.
    directoryExists = false;
  }

  try {
    await StorageService.mutateCanvases((allCanvases) => {
      // Upsert: add / update canvases from files that still exist remotely.
      if (directoryExists) {
        const remotePaths = new Set<string>();
        for (const file of files) {
          if (!file.path.endsWith('.json')) continue;
          remotePaths.add(file.path);

          let scene: CanvasScene;
          try {
            scene = JSON.parse(file.content);
          } catch (error) {
            void error;
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

        // Reconcile: drop local canvases whose backing file was deleted remotely.
        // Safety mirrors the notes reconcile — scoped to (repoPath, branch),
        // only touches canvases with a filePath (local-only drafts kept).
        const before = allCanvases.length;
        const survivors = allCanvases.filter((c) => {
          if (c.repo !== repoPath) return true;
          if (c.branch !== branch) return true;
          if (!c.filePath) return true;
          return remotePaths.has(c.filePath);
        });
        allCanvases.length = 0;
        allCanvases.push(...survivors);
        void before;
      } else {
        // Directory gone — remove all canvases from this repo+branch that
        // originated from a remote file. Local-only canvases stay.
        const survivors = allCanvases.filter((c) => {
          if (c.repo !== repoPath) return true;
          if (c.branch !== branch) return true;
          if (!c.filePath) return true;
          return false;
        });
        allCanvases.length = 0;
        allCanvases.push(...survivors);
      }
    });
  } catch (error) {
    void error;
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
  let files: { path: string; content: string }[] = [];
  let directoryExists = false;

  try {
    files = await fetchDirectoryFiles(owner, repo, 'todos', branch);
    directoryExists = true;
  } catch {
    directoryExists = false;
  }

  try {
    const allTodos = await StorageService.getAllTodos();
    let dirty = false;
    const remotePaths = new Set<string>();

    if (directoryExists) {
      for (const file of files) {
        if (!file.path.endsWith('.json')) continue;
        remotePaths.add(file.path);

        let data: Record<string, any>;
        try {
          data = JSON.parse(file.content);
        } catch (error) {
          void error;
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
    }

    // Reconcile: drop local todos whose backing file was deleted remotely.
    // Same safety scoping as notes and canvases reconcile.
    const before = allTodos.length;
    const reconciled = allTodos.filter((t) => {
      if (t.repo !== repoPath) return true;
      if (t.branch !== branch) return true;
      if (!t.filePath) return true;
      if (!directoryExists) return false;
      return remotePaths.has(t.filePath);
    });
    if (reconciled.length !== before) {
      dirty = true;
    }

    if (dirty) {
      await StorageService.saveAllTodos(reorderTodos(reconciled));
    }
  } catch (error) {
    void error;
    console.warn(`[RepoPullService] Failed to pull todos from ${owner}/${repo}`);
  }
  return pulled;
}

const TEMPLATE_EXTS = ['md', 'markdown'] as const;

async function pullTemplatesFromRepo(
  owner: string,
  repo: string,
  branch: string,
): Promise<number> {
  try {
    const tree = await GitHubService.getTreeRecursiveOrThrow(owner, repo, branch);
    const blobs = tree.filter((item) => {
      if (item.type !== 'blob') return false;
      if (!item.path.startsWith('templates/')) return false;
      const ext = item.path.split('.').pop()?.toLowerCase();
      return TEMPLATE_EXTS.includes(ext as (typeof TEMPLATE_EXTS)[number]);
    });

    const fetched = await fetchInBatches(
      blobs,
      async (b) => {
        const content = await GitHubService.getFileContent(owner, repo, b.path, branch);
        return content === null ? null : { path: b.path, content };
      },
      FILE_FETCH_CONCURRENCY,
    );

    const remote: NoteTemplate[] = [];
    for (const f of fetched) {
      if (!f) continue;
      const parsed = parseTemplateMarkdown(f.path, f.content);
      if (parsed) remote.push(parsed);
    }

    const remotePaths = new Set(blobs.map((b) => b.path));
    const local = await StorageService.loadCustomTemplates();

    // Reconcile: drop locals that originated in this repo (have filePath) and
    // are no longer on the remote. Local-only customs (no filePath) stay.
    const survivors = local.filter((t) => !t.filePath || remotePaths.has(t.filePath));

    const byId = new Map<string, NoteTemplate>();
    for (const t of survivors) byId.set(t.id, t);
    let count = 0;
    for (const t of remote) {
      const existing = byId.get(t.id);
      if (!existing || existing.content !== t.content || existing.name !== t.name) {
        byId.set(t.id, { ...existing, ...t, isCustom: true });
        count++;
      }
    }

    await StorageService.saveCustomTemplates([...byId.values()]);
    return count;
  } catch (error) { void error;
    console.warn(`[RepoPullService] Failed to pull templates from ${owner}/${repo}`);
    return 0;
  }
}

export async function pullTemplatesFromConfiguredRepo(): Promise<number> {
  if (!GitHubService.isAuthenticated()) return 0;
  const pref = await TemplateRepoPreferenceService.get();
  if (!pref) return 0;
  const info = parseRepoPath(pref.repoPath);
  if (!info) return 0;
  return pullTemplatesFromRepo(info.owner, info.repo, pref.branch);
}

export interface PullResult {
  repos: number;
  notes: number;
  canvases: number;
  todos: number;
  templates: number;
}

export async function pullFromSingleRepo(repoPath: string): Promise<PullResult> {
  if (!GitHubService.isAuthenticated()) {
    return { repos: 0, notes: 0, canvases: 0, todos: 0, templates: 0 };
  }

  const repos = await StorageService.getSavedRepositories();
  const repo = repos.find((r) => r.path === repoPath);
  if (!repo) {
    return { repos: 0, notes: 0, canvases: 0, todos: 0, templates: 0 };
  }

  const repoInfo = parseRepoPath(repo.path);
  if (!repoInfo) {
    return { repos: 0, notes: 0, canvases: 0, todos: 0, templates: 0 };
  }
  const branch = await resolveBranch(repo.path, repo.branch);

  const [notes, canvases, todos] = await Promise.all([
    pullNotesFromRepo(repoInfo.owner, repoInfo.repo, repo.path, branch),
    pullCanvasesFromRepo(repoInfo.owner, repoInfo.repo, repo.path, branch),
    pullTodosFromRepo(repoInfo.owner, repoInfo.repo, repo.path, branch),
  ]);

  const pref = await TemplateRepoPreferenceService.get();
  const templates =
    pref && pref.repoPath === repoPath ? await pullTemplatesFromConfiguredRepo() : 0;
  return { repos: 1, notes, canvases, todos, templates };
}

export async function pullAllFromRepos(): Promise<PullResult> {
  if (!GitHubService.isAuthenticated()) {
    return { repos: 0, notes: 0, canvases: 0, todos: 0, templates: 0 };
  }

  const repos = await StorageService.getSavedRepositories();
  let totalNotes = 0;
  let totalCanvases = 0;
  let totalTodos = 0;
  let reposProcessed = 0;

  for (const repo of repos) {
    const repoInfo = parseRepoPath(repo.path);
    if (!repoInfo) continue;

    const branch = await resolveBranch(repo.path, repo.branch);

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

  const templates = await pullTemplatesFromConfiguredRepo();
  return { repos: reposProcessed, notes: totalNotes, canvases: totalCanvases, todos: totalTodos, templates };
}
