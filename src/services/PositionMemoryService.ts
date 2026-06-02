import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = '@gitnotes:position:';

interface SavedPosition {
  scrollY: number;
  ts: number;
}

class PositionMemoryServiceClass {
  noteKey(noteId: string): string {
    return `note:${noteId}`;
  }

  pdfKey(owner: string, repo: string, branch: string | undefined, path: string): string {
    return `pdf:${owner}/${repo}@${branch || 'main'}:${path}`;
  }

  async save(key: string, scrollY: number): Promise<void> {
    if (scrollY < 0 || !Number.isFinite(scrollY)) return;
    try {
      const payload: SavedPosition = { scrollY, ts: Date.now() };
      await AsyncStorage.setItem(`${PREFIX}${key}`, JSON.stringify(payload));
    } catch {
      // ignore save failures - scroll position is non-critical
    }
  }

  async load(key: string): Promise<number | null> {
    try {
      const raw = await AsyncStorage.getItem(`${PREFIX}${key}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<SavedPosition>;
      return typeof parsed?.scrollY === 'number' ? parsed.scrollY : null;
    } catch (error) {
      console.warn('[PositionMemoryService] Failed to load scroll position:', error);
      return null;
    }
  }

  async clear(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(`${PREFIX}${key}`);
    } catch {
      // ignore - clearing is best-effort
    }
  }
}

export const PositionMemoryService = new PositionMemoryServiceClass();
