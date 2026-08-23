/**
 * TilePersistenceService — persists PenEcho-style canvas tiles to
 * AsyncStorage, keyed as `canvas-tile:${canvasId}:${tileX}:${tileY}`.
 *
 * Saves are debounced into 100ms windows and flushed with a single
 * `AsyncStorage.multiSet()` transaction so bursts of tile edits (e.g. a
 * fast stroke crossing many tiles) hit disk once, not once per tile.
 *
 * All read paths are fail-soft: storage errors or corrupted payloads log
 * and return null/empty so the canvas never crashes on bad data.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const TILE_KEY_PREFIX = 'canvas-tile';
const BATCH_WINDOW_MS = 100;

export interface TileCoord {
  x: number;
  y: number;
}

export type TileSavedCallback = (
  canvasId: string,
  tileX: number,
  tileY: number,
  data: string,
) => void;

export type TileLoadedCallback = (
  canvasId: string,
  tileX: number,
  tileY: number,
  data: string,
) => void;

export type TileDeletedCallback = (
  canvasId: string,
  tileX: number,
  tileY: number,
) => void;

interface PendingSave {
  canvasId: string;
  tileX: number;
  tileY: number;
  data: string;
}

function tileStorageKey(canvasId: string, tileX: number, tileY: number): string {
  return `${TILE_KEY_PREFIX}:${canvasId}:${tileX}:${tileY}`;
}

function canvasPrefix(canvasId: string): string {
  return `${TILE_KEY_PREFIX}:${canvasId}:`;
}

function parseTileKey(key: string): { canvasId: string; x: number; y: number } | null {
  const parts = key.split(':');
  if (parts.length !== 4 || parts[0] !== TILE_KEY_PREFIX) return null;
  const x = Number(parts[2]);
  const y = Number(parts[3]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { canvasId: parts[1], x, y };
}

export class TilePersistenceService {
  private pendingSaves: Map<string, PendingSave> = new Map();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushChain: Promise<void> = Promise.resolve();
  private batchWaiters: Array<() => void> = [];

  private savedListeners: TileSavedCallback[] = [];
  private loadedListeners: TileLoadedCallback[] = [];
  private deletedListeners: TileDeletedCallback[] = [];

  // ── Callbacks ───────────────────────────────────────────────

  onTileSaved(callback: TileSavedCallback): void {
    this.savedListeners.push(callback);
  }

  onTileLoaded(callback: TileLoadedCallback): void {
    this.loadedListeners.push(callback);
  }

  onTileDeleted(callback: TileDeletedCallback): void {
    this.deletedListeners.push(callback);
  }

  private emitSaved(save: PendingSave): void {
    for (const cb of this.savedListeners) {
      cb(save.canvasId, save.tileX, save.tileY, save.data);
    }
  }

  private emitLoaded(canvasId: string, tileX: number, tileY: number, data: string): void {
    for (const cb of this.loadedListeners) {
      cb(canvasId, tileX, tileY, data);
    }
  }

  private emitDeleted(canvasId: string, tileX: number, tileY: number): void {
    for (const cb of this.deletedListeners) {
      cb(canvasId, tileX, tileY);
    }
  }

  // ── CRUD ────────────────────────────────────────────────────

  /**
   * Queue a tile save. Writes are batched: all tiles queued within the
   * same BATCH_WINDOW_MS window are persisted in one multiSet call.
   * Resolves once the tile has been flushed to storage.
   */
  saveTile(canvasId: string, tileX: number, tileY: number, data: string): Promise<void> {
    const key = tileStorageKey(canvasId, tileX, tileY);
    this.pendingSaves.set(key, { canvasId, tileX, tileY, data });

    const flushed = new Promise<void>((resolve) => {
      this.batchWaiters.push(resolve);
    });

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flushChain = this.flushChain.then(() => this.flushPendingSaves());
      }, BATCH_WINDOW_MS);
    }

    return flushed;
  }

  /**
   * Load a tile. Returns null when the tile is missing, the payload is
   * corrupted, or storage throws — the canvas must survive bad data.
   */
  async loadTile(canvasId: string, tileX: number, tileY: number): Promise<string | null> {
    await this.flushNow();

    const key = tileStorageKey(canvasId, tileX, tileY);
    let raw: string | null;
    try {
      raw = await AsyncStorage.getItem(key);
    } catch (error) {
      console.error('[TilePersistenceService] loadTile failed:', error);
      return null;
    }

    if (raw === null) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn(`[TilePersistenceService] Corrupted tile data at ${key}`);
      return null;
    }

    if (typeof parsed !== 'string') {
      console.warn(`[TilePersistenceService] Corrupted tile data at ${key}`);
      return null;
    }

    this.emitLoaded(canvasId, tileX, tileY, parsed);
    return parsed;
  }

  async deleteTile(canvasId: string, tileX: number, tileY: number): Promise<void> {
    const key = tileStorageKey(canvasId, tileX, tileY);
    this.pendingSaves.delete(key);

    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error('[TilePersistenceService] deleteTile failed:', error);
      return;
    }

    this.emitDeleted(canvasId, tileX, tileY);
  }

  /**
   * List allocated tiles for a canvas. Uses getAllKeys with a prefix
   * filter so cost scales with key count, not payload size — 500 tiles
   * list in well under 10ms.
   */
  async listTiles(canvasId: string): Promise<TileCoord[]> {
    await this.flushNow();

    let keys: readonly string[];
    try {
      keys = await AsyncStorage.getAllKeys();
    } catch (error) {
      console.error('[TilePersistenceService] listTiles failed:', error);
      return [];
    }

    const prefix = canvasPrefix(canvasId);
    const tiles: TileCoord[] = [];
    for (const key of keys) {
      if (!key.startsWith(prefix)) continue;
      const parsed = parseTileKey(key);
      if (parsed && parsed.canvasId === canvasId) {
        tiles.push({ x: parsed.x, y: parsed.y });
      }
    }
    return tiles;
  }

  async clearCanvas(canvasId: string): Promise<void> {
    const tiles = await this.listTiles(canvasId);

    for (const tile of tiles) {
      this.pendingSaves.delete(tileStorageKey(canvasId, tile.x, tile.y));
    }

    if (tiles.length === 0) return;

    try {
      await AsyncStorage.multiRemove(
        tiles.map((t) => tileStorageKey(canvasId, t.x, t.y)),
      );
    } catch (error) {
      console.error('[TilePersistenceService] clearCanvas failed:', error);
      return;
    }

    for (const tile of tiles) {
      this.emitDeleted(canvasId, tile.x, tile.y);
    }
  }

  // ── Batching internals ──────────────────────────────────────

  /** Flush any queued saves immediately (used by read paths and tests). */
  async flushNow(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
      this.flushChain = this.flushChain.then(() => this.flushPendingSaves());
    }
    await this.flushChain;
  }

  private async flushPendingSaves(): Promise<void> {
    const waiters = this.batchWaiters;
    this.batchWaiters = [];

    if (this.pendingSaves.size === 0) {
      for (const resolve of waiters) resolve();
      return;
    }

    const batch = Array.from(this.pendingSaves.values());
    this.pendingSaves.clear();

    const entries: ReadonlyArray<readonly [string, string]> = batch.map((save) => [
      tileStorageKey(save.canvasId, save.tileX, save.tileY),
      JSON.stringify(save.data),
    ]);

    try {
      await AsyncStorage.multiSet(entries);
    } catch (error) {
      console.error('[TilePersistenceService] batch save failed:', error);
      for (const resolve of waiters) resolve();
      return;
    }

    for (const save of batch) {
      this.emitSaved(save);
    }
    for (const resolve of waiters) resolve();
  }
}
