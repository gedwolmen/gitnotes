/**
 * Runtime instrumentation for git HTTP and filesystem operations.
 *
 * Wraps `gitHttp.request` in place and the `makeGitFs` factory so every HTTP
 * request and every FS operation passes through a single choke point where
 * timing is recorded.  `enableSyncTiming()` installs both wrappers and
 * `disableSyncTiming()` removes them.  `flushSyncTiming()` returns collected
 * entries and clears the buffer.  `attachMode()` labels subsequent entries.
 *
 * The FS factory is patched through the module namespace (`import * as fsMod`)
 * because ES module bindings are read-only; the runtime mutation must happen on
 * the exports object.  This works under Metro (React Native) and Jest (Babel
 * CJS interop) where module exports objects are mutable plain objects.
 */

import type { GitHttpRequest, GitHttpResponse, PromiseFsClient } from 'isomorphic-git';

import { gitHttp } from './gitHttp';
import * as gitFsModule from './gitFs';
import { makeGitFs } from './gitFs';

export type SyncMode = 'api' | 'clone';

export interface SyncTimingEntry {
  kind: 'http' | 'fs';
  op: string;
  method?: string;
  url?: string;
  filepath?: string;
  bytes?: number;
  durationMs: number;
  at: number;
  mode: SyncMode;
}

let enabled = false;
let currentMode: SyncMode = 'clone';
const entries: SyncTimingEntry[] = [];
let httpWrapped = false;
let fsWrapped = false;
let _origHttpRequest: ((req: GitHttpRequest) => Promise<GitHttpResponse>) | null = null;
let _origMakeGitFs: typeof makeGitFs | null = null;

const WRAPPED_FS_KEYS = ['readFile', 'writeFile', 'unlink', 'mkdir', 'readdir', 'stat'] as const;

type AnyAsyncFn = (...args: unknown[]) => Promise<unknown>;

function wrapFsMethod(name: string, fn: AnyAsyncFn): AnyAsyncFn {
  return async (...args: unknown[]): Promise<unknown> => {
    const t0 = performance.now();
    const result = await fn(...args);
    entries.push({
      kind: 'fs',
      op: `fs:${name}`,
      filepath: args[0] !== undefined ? String(args[0]) : undefined,
      durationMs: performance.now() - t0,
      at: Date.now(),
      mode: currentMode,
    });
    return result;
  };
}

function buildInstrumentedFs(root: string): PromiseFsClient {
  const fs = _origMakeGitFs!(root);
  const originalPromises = fs.promises;
  const wrappedPromises: Record<string, unknown> = { ...originalPromises };
  for (const key of WRAPPED_FS_KEYS) {
    const original = (originalPromises as unknown as Record<string, AnyAsyncFn>)[key];
    if (typeof original === 'function') {
      wrappedPromises[key] = wrapFsMethod(key, original);
    }
  }
  return { ...fs, promises: wrappedPromises as PromiseFsClient['promises'] };
}

export function enableSyncTiming(): void {
  if (enabled) return;
  enabled = true;
  currentMode = 'clone';

  if (!httpWrapped) {
    _origHttpRequest = gitHttp.request.bind(gitHttp);
    const orig = _origHttpRequest;
    gitHttp.request = async (req: GitHttpRequest): Promise<GitHttpResponse> => {
      const t0 = performance.now();
      const res = await orig(req);
      entries.push({
        kind: 'http',
        op: `request:${req.method ?? 'GET'} ${req.url}`,
        method: req.method,
        url: req.url,
        durationMs: performance.now() - t0,
        at: Date.now(),
        mode: currentMode,
      });
      return res;
    };
    httpWrapped = true;
  }

  if (!fsWrapped) {
    _origMakeGitFs = makeGitFs;
    (gitFsModule as unknown as { makeGitFs: typeof makeGitFs }).makeGitFs = buildInstrumentedFs;
    fsWrapped = true;
  }
}

export function disableSyncTiming(): void {
  if (!enabled) return;
  enabled = false;
  entries.length = 0;
  if (httpWrapped && _origHttpRequest) {
    gitHttp.request = _origHttpRequest;
    httpWrapped = false;
    _origHttpRequest = null;
  }
  if (fsWrapped && _origMakeGitFs) {
    (gitFsModule as unknown as { makeGitFs: typeof makeGitFs }).makeGitFs = _origMakeGitFs;
    fsWrapped = false;
    _origMakeGitFs = null;
  }
}

export function flushSyncTiming(): SyncTimingEntry[] {
  const out = entries.slice();
  entries.length = 0;
  return out;
}

export function attachMode(label: SyncMode): void {
  currentMode = label;
}

export function isSyncTimingEnabled(): boolean {
  return enabled;
}