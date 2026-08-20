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
import { NoteSyncQueueService } from './NoteSyncQueueService';
import { getGitHostService } from './git/gitHostFactory';
import { FEATURE_USE_MULTI_HOST_WRITE } from './featureFlags';
import type { GitHostProvider } from './git/GitHost';

async function hasUnpushedCommits(repoPath: string, branch: string): Promise<boolean> {
  try {
    const localRef = `refs/heads/${branch}`;
    const remoteRef = `refs/remotes/origin/${branch}`;
    const localOid = await GitFsService.getCommitOid({ repoPath, ref: localRef });
    const remoteOid = await GitFsService.getCommitOid({ repoPath, ref: remoteRef });
    if (localOid === null || remoteOid === null) return false;
    if (localOid === remoteOid) return false;
    const mergeBase = await GitFsService.findMergeBase({ repoPath, ref1: localRef, ref2: remoteRef });
    if (mergeBase === null) return false;
    if (localOid === mergeBase) return false;
    return true;
  } catch {
    return false;
  }
}

async function handleCorruptionErrors<T>(fn: () => Promise<T>, repoPath: string, branch: string, token?: string): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isMissingObject = /Could not find|not foundobject|NotFoundError|Packfile trailer mismatch/i.test(errorMsg);
    if (isMissingObject) {
      console.warn(`[RepoPullService] corruption detected during operation, re-cloning...`);
      const hasLocalCommits = await hasUnpushedCommits(repoPath, branch);
      if (hasLocalCommits) {
        throw new Error(
          `Clone corruption detected in ${repoPath}@${branch} with unpushed local commits. ` +
          `Please push your changes or reset before continuing.`,
        );
      }
      await GitFsService.removeRepo({ repoPath });
      await GitFsService.cloneExclusive({ repoPath, branch, token: token ?? undefined });
      return fn();
    }
    throw error;
  }
}

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
  provider?: GitHostProvider,
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
      await GitFsService.cloneExclusive({ repoPath, branch, token });
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
            listTree: () => handleCorruptionErrors(() => GitFsService.listTree({ repoPath, ref: remoteRefName }), repoPath, branch, token),
            readFile: (path: string) =>
              handleCorruptionErrors(() => GitFsService.readFile({ repoPath, ref: remoteRefName, filepath: path }), repoPath, branch, token),
          };
        }
        const errorMsg = result.error ?? '';
const isMissingObject = /Could not find|not foundobject|NotFoundError|Packfile trailer mismatch/i.test(errorMsg);
                if (isMissingObject) {
                  console.warn(`[RepoPullService] clone appears corrupted (${errorMsg}), re-cloning...`);
                  // Check for local commits before removing - don't lose unpushed work
                  const hasLocalCommits = await hasUnpushedCommits(repoPath, branch);
                  if (hasLocalCommits) {
                    throw new Error(
                      `Clone corruption detected in ${repoPath}@${branch} with unpushed local commits. ` +
                      `Please push your changes or reset before continuing.`,
                    );
                  }
                  await GitFsService.removeRepo({ repoPath });
                  await GitFsService.cloneExclusive({ repoPath, branch, token });
                  return {
                    mode,
                    listTree: () => GitFsService.listTree({ repoPath, ref: branch }),
                    readFile: (path: string) =>
                      GitFsService.readFile({ repoPath, ref: branch, filepath: path }),
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
      listTree: () => handleCorruptionErrors(() => GitFsService.listTree({ repoPath, ref: branch }), repoPath, branch, token),
      readFile: (path: string) =>
        handleCorruptionErrors(() => GitFsService.readFile({ repoPath, ref: branch, filepath: path }), repoPath, branch, token),
    };
  }
  if (FEATURE_USE_MULTI_HOST_WRITE) {
    const host = getGitHostService(provider);
    return {
      mode,
      listTree: async () => {
        const entries = await host.getTreeRecursive(owner, repo, branch);
        return entries.map((e) => ({ path: e.path, type: e.type, sha: e.sha, size: e.size }));
      },
      readFile: (path: string) => host.getFileText(owner, repo, path, branch),
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
  repoPath: string,
  dirPath: string,
  branch: string,
  provider?: GitHostProvider,
): Promise<{ path: string; content: string }[]> {
  // Route through the mode-aware reader so clone mode reads todos/canvases
  // from the local clone (no Contents-API calls) and the recursive tree
  // pulls nested files under `dirPath/` (#885). The `dirPath + '/'` prefix
  // guards against sibling-dir false matches (e.g. `todos/` vs `todos-archive/`).
  const reader = await getRepoReader(repoPath, owner, repo, branch, provider);
  const tree = await reader.listTree();
  const files = tree.filter(
    (item) => item.type === 'blob' && item.path.startsWith(dirPath + '/'),
  );

  const fetched = await fetchInBatches(
    files,
    async (file) => {
      try {
        const content = await reader.readFile(file.path);
        return content === null ? null : { path: file.path, content };
      } catch (error) {
        console.warn(`[RepoPullService] Failed to fetch ${file.path}:`, error);
        return null;
      }
    },
    FILE_FETCH_CONCURRENCY,
  );
  return fetched.filter((f): f is { path: string; content: string } => f !== null);
}

const NOTE_EXTS = ['md', 'markdown', 'norg', 'org', 'txt'] as const;

/**
 * Paths that exist locally (staged but not yet pushed) and must be immune to
 * the remote reconcile. API mode: pending sync-queue mutations. Clone mode:
 * the local branch tree, which includes unpushed local commits — otherwise a
 * pull that races an in-flight push would see the remote without the note and
 * drop the local copy (data loss after restart).
 */
async function collectPendingPaths(
  repoPath: string,
  branch: string,
  mode: 'api' | 'clone',
  prefix: string,
): Promise<string[]> {
  if (mode === 'clone') {
    try {
      const tree = await GitFsService.listTree({ repoPath, ref: branch });
      return tree.filter((e) => e.type === 'blob' && e.path.startsWith(prefix)).map((e) => e.path);
    } catch {
      return [];
    }
  }
  try {
    const queue = await NoteSyncQueueService.getAll();
    return queue
      .filter((m) => m.params.repo === repoPath && (m.params.branch ?? 'main') === branch)
      .map((m) => m.params.filePath ?? '')
      .filter((p) => p.startsWith(prefix));
  } catch {
    return [];
  }
}

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
  provider?: GitHostProvider,
): Promise<number> {
  try {
    const reader = await getRepoReader(repoPath, owner, repo, branch, provider);
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
      if (item.path.startsWith('thoughts/')) return false;
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
    // We populate it from ALL tree blob paths — NOT just the notes/*-filtered
    // `noteBlobs` — because a note's backing file can live at the repo root or
    // in any custom folder (the editor writes filePath wherever the user
    // chooses). Restricting the set to notes/* made root-level notes look
    // "deleted on the remote" after a successful push, so the reconcile
    // dropped them from the local index — data loss after push + restart.
    const remoteFilePaths = new Set<string>(
      tree.filter((item) => item.type === 'blob').map((b) => b.path),
    );

    // Protect locally-staged-but-unpushed notes from the remote reconcile.
    // With stage-then-push, `updateNote({ filePath })` runs at SAVE time, so
    // a note can carry a filePath before its push has reached GitHub (queue
    // pending in API mode, unpushed local commit in clone mode). Dropping it
    // here would DELETE a note the user just wrote — data loss after a
    // restart mid-push. Only drop a note when we are sure the remote no
    // longer has it AND nothing local is waiting to push it.
    const protectedPaths = await collectPendingPaths(repoPath, branch, reader.mode, 'notes/');
    for (const p of protectedPaths) remoteFilePaths.add(p);

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
      const isTombstoned = await NoteSyncQueueService.isTombstoned(repoPath, branch, item.path);
      if (isTombstoned) continue;
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
    } catch {
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
  provider?: GitHostProvider,
): Promise<number> {
  let pulled = 0;
  let files: { path: string; content: string }[] = [];
  let directoryExists = false;

  try {
    files = await fetchDirectoryFiles(owner, repo, repoPath, 'canvases', branch, provider);
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
            console.warn('[RepoPullService] Failed to parse canvas JSON:', error);
            continue;
          }

          const titleFromPath = file.path
            .replace(/^canvases\//, '')
            .replace(/\.json$/, '')
            .replace(/-/g, ' ');

          const pulledScene = JSON.stringify(scene);
          const idx = allCanvases.findIndex((c) => c.filePath === file.path);
          if (idx !== -1) {
            const existing = allCanvases[idx];
            if (JSON.stringify(existing.scene) !== pulledScene) {
              allCanvases[idx] = updateCanvas(existing, { scene, lastPulledScene: pulledScene });
              pulled++;
            } else if (existing.lastPulledScene !== pulledScene) {
              allCanvases[idx] = { ...existing, lastPulledScene: pulledScene };
            }
          } else {
            allCanvases.push(
              createCanvas({
                title: titleFromPath,
                scene,
                repo: repoPath,
                branch,
                filePath: file.path,
                lastPulledScene: pulledScene,
              }),
            );
            pulled++;
          }
        }

        // Reconcile: drop local canvases whose backing file was deleted remotely.
        // Safety mirrors the notes reconcile — scoped to (repoPath, branch), only
        // touches canvases with a filePath (local-only drafts kept). A canvas whose
        // backing file is missing is dropped only when its scene still matches
        // `lastPulledScene`; a mismatch (or a missing marker) means the user edited
        // locally since the last pull, so it is kept.
        const survivors = allCanvases.filter((c) => {
          if (c.repo !== repoPath) return true;
          if (c.branch !== branch) return true;
          if (!c.filePath) return true;
          if (remotePaths.has(c.filePath)) return true;
          const dirty =
            c.lastPulledScene === undefined || c.lastPulledScene !== JSON.stringify(c.scene);
          return dirty;
        });
        allCanvases.length = 0;
        allCanvases.push(...survivors);
      } else {
        // Directory gone — remove all canvases from this repo+branch that
        // originated from a remote file and were not locally modified since the
        // last pull. Local-only drafts and dirty (unsaved-edit) canvases stay.
        const survivors = allCanvases.filter((c) => {
          if (c.repo !== repoPath) return true;
          if (c.branch !== branch) return true;
          if (!c.filePath) return true;
          const dirty =
            c.lastPulledScene === undefined || c.lastPulledScene !== JSON.stringify(c.scene);
          return dirty;
        });
        allCanvases.length = 0;
        allCanvases.push(...survivors);
      }
    });
  } catch (error) {
    console.warn('[RepoPullService] Failed to process canvases:', error);
  }
  return pulled;
}

async function pullTodosFromRepo(
  owner: string,
  repo: string,
  repoPath: string,
  branch: string,
  provider?: GitHostProvider,
): Promise<number> {
  let pulled = 0;
  let files: { path: string; content: string }[] = [];
  let directoryExists = false;

  try {
    files = await fetchDirectoryFiles(owner, repo, repoPath, 'todos', branch, provider);
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
          console.warn('[RepoPullService] Failed to parse todo JSON:', error);
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
    // Same safety scoping as notes and canvases reconcile — but never drop
    // a todo that is staged-but-unpushed (pending queue / unpushed local
    // commit), otherwise a restart mid-push loses it (data loss, mirrors the
    // notes protection).
    const todoPending = new Set<string>();
    const todoMode = await SyncEngineService.getMode(repoPath);
    for (const p of await collectPendingPaths(repoPath, branch, todoMode, 'todos/')) {
      todoPending.add(p);
    }
    const before = allTodos.length;
    const reconciled = allTodos.filter((t) => {
      if (t.repo !== repoPath) return true;
      if (t.branch !== branch) return true;
      if (!t.filePath) return true;
      if (todoPending.has(t.filePath)) return true;
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
    console.warn('[RepoPullService] Failed to pull/process todos:', error);
  }
  return pulled;
}

const TEMPLATE_EXTS = ['md', 'markdown'] as const;

async function pullTemplatesFromRepo(
  owner: string,
  repo: string,
  branch: string,
  provider?: GitHostProvider,
): Promise<number> {
  try {
    let tree: { type: string; path: string }[];
    let blobs: { type: string; path: string }[];
    let fetched: ({ path: string; content: string } | null)[];

    if (FEATURE_USE_MULTI_HOST_WRITE) {
      const host = getGitHostService(provider);
      const entries = await host.getTreeRecursive(owner, repo, branch);
      tree = entries;
      blobs = tree.filter((item) => {
        if (item.type !== 'blob') return false;
        if (!item.path.startsWith('templates/')) return false;
        const ext = item.path.split('.').pop()?.toLowerCase();
        return TEMPLATE_EXTS.includes(ext as (typeof TEMPLATE_EXTS)[number]);
      });

      fetched = await fetchInBatches(
        blobs,
        async (b) => {
          const content = await host.getFileText(owner, repo, b.path, branch);
          return content === null ? null : { path: b.path, content };
        },
        FILE_FETCH_CONCURRENCY,
      );
    } else {
      tree = await GitHubService.getTreeRecursiveOrThrow(owner, repo, branch);
      blobs = tree.filter((item) => {
        if (item.type !== 'blob') return false;
        if (!item.path.startsWith('templates/')) return false;
        const ext = item.path.split('.').pop()?.toLowerCase();
        return TEMPLATE_EXTS.includes(ext as (typeof TEMPLATE_EXTS)[number]);
      });

      fetched = await fetchInBatches(
        blobs,
        async (b) => {
          const content = await GitHubService.getFileContent(owner, repo, b.path, branch);
          return content === null ? null : { path: b.path, content };
        },
        FILE_FETCH_CONCURRENCY,
      );
    }

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
  } catch (error) {
    console.warn('[RepoPullService] Failed to pull templates:', error);
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
    pullNotesFromRepo(repoInfo.owner, repoInfo.repo, repo.path, branch, repo.provider),
    pullCanvasesFromRepo(repoInfo.owner, repoInfo.repo, repo.path, branch, repo.provider),
    pullTodosFromRepo(repoInfo.owner, repoInfo.repo, repo.path, branch, repo.provider),
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
      pullNotesFromRepo(repoInfo.owner, repoInfo.repo, repo.path, branch, repo.provider),
      pullCanvasesFromRepo(repoInfo.owner, repoInfo.repo, repo.path, branch, repo.provider),
      pullTodosFromRepo(repoInfo.owner, repoInfo.repo, repo.path, branch, repo.provider),
    ]);

    totalNotes += notes;
    totalCanvases += canvases;
    totalTodos += todos;
    reposProcessed++;
  }

  const templates = await pullTemplatesFromConfiguredRepo();
  return { repos: reposProcessed, notes: totalNotes, canvases: totalCanvases, todos: totalTodos, templates };
}
