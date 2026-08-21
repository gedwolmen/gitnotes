import git, { TREE } from 'isomorphic-git';
import { parseRepoPath } from '../../utils/gitPathParser';
import { makeGitFs as makeFs } from '../git/gitFs';
import { ConflictSet, FileConflict, FileFormat } from './types';
import { threeWayMerge } from './threeWayMerge';
import { GitFsService } from '../git/GitFsService';

const TEXT_EXTENSIONS = new Set(['md', 'markdown', 'txt', 'org', 'norg']);
const JSON_EXTENSIONS = new Set(['json']);

function fileFormat(path: string): FileFormat {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  if (JSON_EXTENSIONS.has(ext)) return 'json';
  return 'binary';
}

function classifyKind(
  localOid: string | null,
  remoteOid: string | null,
  baseOid: string | null,
): FileConflict['kind'] {
  const hasLocal = localOid !== null;
  const hasRemote = remoteOid !== null;
  const hasBase = baseOid !== null;

  if (hasLocal && !hasRemote && hasBase) return 'local-modified-remote-deleted';
  if (!hasLocal && hasRemote && hasBase) return 'local-deleted-remote-modified';
  if (hasLocal && !hasRemote && !hasBase) return 'local-only';
  if (!hasLocal && hasRemote && !hasBase) return 'remote-only';
  if (hasLocal && hasRemote) {
    if (localOid === remoteOid) return 'both-changed-same';
    return 'both-changed-different';
  }
  return 'both-changed-same';
}

function clonesRoot(): string {
  const docDir = require('expo-file-system/legacy').documentDirectory;
  if (!docDir) throw new Error('documentDirectory not available');
  const subdir = 'GitNotes/';
  return docDir.endsWith('/') ? docDir + subdir : `${docDir}/${subdir}`;
}

function repoDirVirtual(owner: string, repo: string): string {
  return `/${owner}/${repo}`;
}

export class ConflictResolverService {
  static async detectConflicts(opts: {
    repoPath: string;
    branch: string;
    localRef: string;
    remoteRef: string;
    mergeBaseRef: string;
  }): Promise<ConflictSet> {
    const info = parseRepoPath(opts.repoPath);
    if (!info) throw new Error(`Invalid repo path: ${opts.repoPath}`);
    const dir = repoDirVirtual(info.owner, info.repo);
    const root = clonesRoot();
    const fs = makeFs(root);

    const fileMap = new Map<string, { local: string | null; remote: string | null; base: string | null }>();

    const collect = async (ref: string, bucket: 'local' | 'remote' | 'base') => {
      try {
        await git.walk({
          fs,
          dir,
          trees: [TREE({ ref })],
          map: async (filepath, entries) => {
            if (filepath === '.') return;
            const entry = entries?.[0];
            if (!entry) return;
            const type = await entry.type();
            if (type !== 'blob') return;
            const oid = await entry.oid();
            if (!fileMap.has(filepath)) {
              fileMap.set(filepath, { local: null, remote: null, base: null });
            }
            fileMap.get(filepath)![bucket] = oid;
          },
        });
      } catch (error) {
        // shallow clone may not have all refs
        console.warn('[ConflictResolver] Failed to walk ref:', error);
      }
    };

    await Promise.all([
      collect(opts.localRef, 'local'),
      collect(opts.remoteRef, 'remote'),
      collect(opts.mergeBaseRef, 'base'),
    ]);

    const files: FileConflict[] = [];

    for (const [filepath, oids] of fileMap) {
      const { local, remote, base } = oids;

      if (local && remote && local === remote) continue;
      if (!local && !remote) continue;

      const kind = classifyKind(local, remote, base);
      const format = fileFormat(filepath);

      let localContent: string | null = null;
      let remoteContent: string | null = null;
      let baseContent: string | null = null;

      if (format === 'text' || format === 'json') {
        const [localBlob, remoteBlob, baseBlob] = await Promise.all([
          GitFsService.readBlobAtRef({ repoPath: opts.repoPath, ref: opts.localRef, filepath }),
          GitFsService.readBlobAtRef({ repoPath: opts.repoPath, ref: opts.remoteRef, filepath }),
          GitFsService.readBlobAtRef({ repoPath: opts.repoPath, ref: opts.mergeBaseRef, filepath }),
        ]);
        localContent = localBlob?.content ?? null;
        remoteContent = remoteBlob?.content ?? null;
        baseContent = baseBlob?.content ?? null;
      }

      files.push({
        path: filepath,
        kind,
        format,
        localContent,
        remoteContent,
        baseContent,
        mergedContent: null,
        localSha: local,
        remoteSha: remote,
        autoResolved: false,
      });
    }

    return {
      repoPath: opts.repoPath,
      branch: opts.branch,
      localRef: opts.localRef,
      remoteRef: opts.remoteRef,
      mergeBaseRef: opts.mergeBaseRef,
      files,
      detectedAt: Date.now(),
    };
  }

  static async autoResolve(conflictSet: ConflictSet): Promise<ConflictSet> {
    const files = conflictSet.files.map((f) => {
      switch (f.kind) {
        case 'both-changed-same':
          return { ...f, mergedContent: f.localContent ?? f.remoteContent, autoResolved: true };

        case 'local-only':
          return { ...f, mergedContent: f.localContent, autoResolved: true };

        case 'remote-only':
          return { ...f, mergedContent: f.remoteContent, autoResolved: true };

        case 'both-changed-different':
          if (f.format === 'text' && f.baseContent !== null && f.localContent !== null && f.remoteContent !== null) {
            const result = threeWayMerge(f.baseContent, f.localContent, f.remoteContent);
            return { ...f, mergedContent: result.merged, autoResolved: !result.hasConflicts };
          }
          return f;

        default:
          return f;
      }
    });

    return { ...conflictSet, files };
  }

  static applyResolution(
    conflictSet: ConflictSet,
    filePath: string,
    resolution: { content: string | null },
  ): ConflictSet {
    const files = conflictSet.files.map((f) =>
      f.path === filePath ? { ...f, mergedContent: resolution.content, autoResolved: true } : f,
    );
    return { ...conflictSet, files };
  }

  static isFullyResolved(conflictSet: ConflictSet): boolean {
    return conflictSet.files.every((f) => f.autoResolved);
  }
}
