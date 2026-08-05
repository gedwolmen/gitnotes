import { InteractionManager } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { aiMemoryIndex } from './AIMemoryIndexService';
import { ThoughtDumpService } from '../ThoughtDumpService';
import { useAIStore } from '../../stores/aiStore';
import type { ThoughtDump } from '../../models/ThoughtDump';

const MANIFEST_FILENAME = 'thought-dump-manifest.json';

interface ManifestEntry {
  hash: string;
}

interface Manifest {
  version: 1;
  entries: Record<string, ManifestEntry>;
}

function getManifestUri(): string {
  return `${FileSystem.documentDirectory}${MANIFEST_FILENAME}`;
}

export async function loadManifest(): Promise<Manifest> {
  try {
    const raw = await FileSystem.readAsStringAsync(getManifestUri());
    return JSON.parse(raw);
  } catch {
    return { version: 1, entries: {} };
  }
}

async function saveManifest(manifest: Manifest): Promise<void> {
  await FileSystem.writeAsStringAsync(getManifestUri(), JSON.stringify(manifest));
}

export function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const chr = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return String(hash);
}

let embedderResolved = false;

async function ensureEmbedderResolved(): Promise<void> {
  if (embedderResolved) return;
  const { providers, getSelectedModel } = useAIStore.getState();
  await aiMemoryIndex.resolveEmbedder(providers, getSelectedModel());
  embedderResolved = true;
}

function runIdle(fn: () => Promise<void>): void {
  InteractionManager.runAfterInteractions(() => {
    fn().catch((err) => {
      if (__DEV__) console.warn('[ThoughtDumpIndexing] idle task failed:', err);
    });
  });
}

export function indexDump(dump: ThoughtDump): void {
  runIdle(async () => {
    await ensureEmbedderResolved();
    const hash = simpleHash(dump.text);
    await aiMemoryIndex.upsert(dump.filePath, dump.text);
    const manifest = await loadManifest();
    manifest.entries[dump.filePath] = { hash };
    await saveManifest(manifest);
  });
}

export function removeDump(filePath: string): void {
  runIdle(async () => {
    await aiMemoryIndex.remove(filePath);
    const manifest = await loadManifest();
    delete manifest.entries[filePath];
    await saveManifest(manifest);
  });
}

export async function reconcile(repoPath?: string, branch?: string): Promise<void> {
  await ensureEmbedderResolved();
  const dumps = await ThoughtDumpService.list(
    repoPath ? { repoPath, branch } : undefined,
  );

  const manifest = await loadManifest();
  const repoFiles = new Map<string, ThoughtDump>();

  for (const dump of dumps) {
    repoFiles.set(dump.filePath, dump);
  }

  const indexedPaths = new Set(Object.keys(manifest.entries));

  for (const [filePath, dump] of repoFiles) {
    const hash = simpleHash(dump.text);
    const existing = manifest.entries[filePath];
    if (!existing || existing.hash !== hash) {
      await aiMemoryIndex.upsert(filePath, dump.text);
      manifest.entries[filePath] = { hash };
    }
  }

  for (const filePath of indexedPaths) {
    if (!repoFiles.has(filePath)) {
      await aiMemoryIndex.remove(filePath);
      delete manifest.entries[filePath];
    }
  }

  await saveManifest(manifest);

  const activePaths = Array.from(repoFiles.keys());
  if (aiMemoryIndex.isStale(activePaths)) {
    await aiMemoryIndex.clear();
    const freshManifest: Manifest = { version: 1, entries: {} };
    for (const [filePath, dump] of repoFiles) {
      await aiMemoryIndex.upsert(filePath, dump.text);
      freshManifest.entries[filePath] = { hash: simpleHash(dump.text) };
    }
    await saveManifest(freshManifest);
  }
}

export async function reconcileThoughtDumps(): Promise<void> {
  await reconcile();
}
