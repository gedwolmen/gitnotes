import { StorageService } from '../StorageService';
import { GitHubService } from '../GitHubService';
import { LocalGitWriter } from './LocalGitWriter';
import { NoteSyncQueueService } from '../NoteSyncQueueService';
import { TemplateRepoPreferenceService } from '../TemplateRepoPreferenceService';
import { useTemplateStore } from '../../stores/templateStore';
import { serializeTemplate, templateSlug } from '../TemplateMarkdownService';
import { applyNoteTagsToContent, applyNoteColorToContent } from '../NoteGitHubSyncService';
import type { Note } from '../../models/Note';
import type { Todo } from '../../models/Todo';
import type { Canvas } from '../../models/Canvas';
import type { NoteTemplate } from '../TemplateService';

export interface MigrationReport {
  success: boolean;
  notes: number;
  todos: number;
  canvases: number;
  templates: number;
  failures: { kind: string; filePath: string; error: string }[];
}

function authorFromUser() {
  const user = GitHubService.getUser();
  return {
    name: user?.name || user?.login || 'gitnotes',
    email: user?.email || `${user?.login ?? 'gitnotes'}@users.noreply.github.com`,
  };
}

function serializeTodo(todo: Partial<Todo>): string {
  return JSON.stringify(
    {
      text: todo.text ?? '',
      completed: todo.completed ?? false,
      priority: todo.priority,
      notes: todo.notes,
      tags: todo.tags ?? [],
      dueDate: todo.dueDate,
      createdAt: todo.createdAt,
      updatedAt: todo.updatedAt,
    },
    null,
    2,
  );
}

/**
 * One-shot import that copies every locally-tracked file with `repo ===
 * repoPath` into the cloned working tree, staging + committing each one
 * without pushing. The point is to lift offline edits (notes the user wrote
 * in API mode that never reached the remote) into the new clone before the
 * first pull-fast-forward — without this step the next pull would fast-forward
 * over them. Pushes are owned by the stage/push engine.
 *
 * Safe to re-run: writeAndCommit is idempotent at the working-tree level
 * (overwrites + git-add will produce a no-op commit if content matches HEAD).
 *
 * Caller must ensure `SyncEngineService.getMode(repoPath) === 'clone'` and
 * the working copy already exists (the Settings "Clone" action does both).
 */
export class CloneMigrationService {
  static async migrateRepo(repoPath: string, branch: string): Promise<MigrationReport> {
    const report: MigrationReport = {
      success: true,
      notes: 0,
      todos: 0,
      canvases: 0,
      templates: 0,
      failures: [],
    };

    const author = authorFromUser();

    const allNotes = await StorageService.getAllNotes();
    const localNotes = allNotes.filter((n: Note) => n.repo === repoPath && n.filePath);
    for (const n of localNotes) {
      let content = n.content ?? '';
      content = applyNoteTagsToContent(content, n.format, n.tags ?? []);
      content = applyNoteColorToContent(content, n.format, n.color);
      const result = await LocalGitWriter.writeAndCommit({
        repoPath,
        branch,
        filePath: n.filePath!,
        content,
        message: `Migrate note: ${n.title}`,
        author,
        push: false,
      });
      if (result.success) report.notes++;
      else
        report.failures.push({
          kind: 'note',
          filePath: n.filePath!,
          error: result.error ?? 'unknown',
        });
    }

    const allTodos = await StorageService.getAllTodos();
    const localTodos = allTodos.filter((t: Todo) => t.repo === repoPath && t.filePath);
    for (const t of localTodos) {
      const result = await LocalGitWriter.writeAndCommit({
        repoPath,
        branch,
        filePath: t.filePath!,
        content: serializeTodo(t),
        message: `Migrate todo: ${t.text}`,
        author,
        push: false,
      });
      if (result.success) report.todos++;
      else
        report.failures.push({
          kind: 'todo',
          filePath: t.filePath!,
          error: result.error ?? 'unknown',
        });
    }

    let allCanvases: Canvas[] = [];
    await StorageService.mutateCanvases((cs) => {
      allCanvases = [...cs];
    });
    const localCanvases = allCanvases.filter((c) => c.repo === repoPath && c.filePath);
    for (const c of localCanvases) {
      const result = await LocalGitWriter.writeAndCommit({
        repoPath,
        branch,
        filePath: c.filePath!,
        content: JSON.stringify(c.scene, null, 2),
        message: `Migrate canvas: ${c.title}`,
        author,
        push: false,
      });
      if (result.success) report.canvases++;
      else
        report.failures.push({
          kind: 'canvas',
          filePath: c.filePath!,
          error: result.error ?? 'unknown',
        });
    }

    // Templates only migrate when the configured templates repo matches the
    // repo we're enabling clone mode for. Otherwise the user's templates live
    // elsewhere and aren't part of this migration.
    const tplPref = await TemplateRepoPreferenceService.get();
    if (tplPref?.repoPath === repoPath) {
      const customs = useTemplateStore.getState().customTemplates;
      for (const t of customs) {
        const targetPath = t.filePath || `templates/${templateSlug(t.name)}.md`;
        const body = serializeTemplate({ ...t, filePath: undefined } as NoteTemplate);
        const result = await LocalGitWriter.writeAndCommit({
          repoPath,
          branch,
          filePath: targetPath,
          content: body,
          message: `Migrate template ${t.name}`,
          author,
          push: false,
        });
        if (result.success) report.templates++;
        else
          report.failures.push({
            kind: 'template',
            filePath: targetPath,
            error: result.error ?? 'unknown',
          });
      }
    }

    // Migration supersedes this repo's API-mode queue: drop leftovers so
    // the Stage cannot show a mixed API/clone state (issue #902).
    await NoteSyncQueueService.purgeForRepo(repoPath);

    if (report.failures.length > 0) report.success = report.failures.length === 0;
    return report;
  }
}
