import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import {
  EMPTY_RENDER_STYLE_SETTINGS,
  FormatRenderStyle,
  RenderFormat,
  RenderStyleSettings,
} from '../types/RenderStyle';
import { RenderStyleService, RenderStyleRepoBinding } from '../services/RenderStyleService';

const BINDING_KEY = '@gitnotes:render_style_binding';
const CACHE_KEY = '@gitnotes:render_style_cache';

interface RenderStyleState {
  binding: RenderStyleRepoBinding | null;
  settings: RenderStyleSettings;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  hasHydrated: boolean;
}

interface RenderStyleActions {
  hydrate: () => Promise<void>;
  setBinding: (binding: RenderStyleRepoBinding | null) => Promise<void>;
  refreshFromRepo: () => Promise<void>;
  /**
   * Update a single format's overrides in memory. Use this for live
   * preview while the user is editing. Call save() to push to GitHub.
   */
  updateFormat: (format: RenderFormat, overrides: FormatRenderStyle) => void;
  /** Wipe a format back to theme defaults (no overrides). */
  resetFormat: (format: RenderFormat) => void;
  save: () => Promise<boolean>;
}

async function readBinding(): Promise<RenderStyleRepoBinding | null> {
  const raw = await AsyncStorage.getItem(BINDING_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RenderStyleRepoBinding;
    if (parsed?.owner && parsed?.name) {
      return { branch: parsed.branch || 'main', owner: parsed.owner, name: parsed.name };
    }
  } catch (error) { void error;
    // fall through
  }
  return null;
}

async function readCache(): Promise<RenderStyleSettings> {
  const raw = await AsyncStorage.getItem(CACHE_KEY);
  if (!raw) return { ...EMPTY_RENDER_STYLE_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as Partial<RenderStyleSettings>;
    if (parsed && typeof parsed === 'object' && parsed.formats) {
      return { version: 1, formats: parsed.formats };
    }
  } catch (error) { void error;
    // fall through
  }
  return { ...EMPTY_RENDER_STYLE_SETTINGS };
}

async function writeCache(settings: RenderStyleSettings): Promise<void> {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(settings));
}

export const useRenderStyleStore = create<RenderStyleState & RenderStyleActions>()((set, get) => ({
  binding: null,
  settings: { ...EMPTY_RENDER_STYLE_SETTINGS },
  isLoading: false,
  isSaving: false,
  error: null,
  hasHydrated: false,

  hydrate: async () => {
    if (get().hasHydrated) return;
    set({ isLoading: true, error: null });
    const [binding, cached] = await Promise.all([readBinding(), readCache()]);
    set({ binding, settings: cached, hasHydrated: true, isLoading: false });
    if (binding) {
      void get().refreshFromRepo();
    }
  },

  setBinding: async (binding) => {
    if (binding === null) {
      await AsyncStorage.removeItem(BINDING_KEY);
      set({ binding: null, settings: { ...EMPTY_RENDER_STYLE_SETTINGS }, error: null });
      await writeCache({ ...EMPTY_RENDER_STYLE_SETTINGS });
      return;
    }
    await AsyncStorage.setItem(BINDING_KEY, JSON.stringify(binding));
    set({ binding, error: null });
    await get().refreshFromRepo();
  },

  refreshFromRepo: async () => {
    const { binding } = get();
    if (!binding) return;
    set({ isLoading: true, error: null });
    try {
      const remote = await RenderStyleService.load(binding);
      set({ settings: remote, isLoading: false });
      await writeCache(remote);
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : 'Failed to load styles' });
    }
  },

  updateFormat: (format, overrides) => {
    set((state) => ({
      settings: {
        version: 1,
        formats: { ...state.settings.formats, [format]: overrides },
      },
    }));
  },

  resetFormat: (format) => {
    set((state) => {
      const { [format]: _removed, ...rest } = state.settings.formats;
      return { settings: { version: 1, formats: rest } };
    });
  },

  save: async () => {
    const { binding, settings } = get();
    if (!binding) {
      set({ error: 'No render style repo bound. Pick a repo first.' });
      return false;
    }
    set({ isSaving: true, error: null });
    try {
      const ok = await RenderStyleService.save(binding, settings);
      if (ok) await writeCache(settings);
      set({ isSaving: false, error: ok ? null : 'Failed to save to GitHub' });
      return ok;
    } catch (err) {
      set({
        isSaving: false,
        error: err instanceof Error ? err.message : 'Failed to save styles',
      });
      return false;
    }
  },
}));

const EMPTY_OVERRIDES: FormatRenderStyle = Object.freeze({}) as FormatRenderStyle;

/**
 * React-friendly selector that returns the currently-active overrides
 * for a given format. Returns a stable empty object when no overrides
 * exist — must be a singleton, otherwise Zustand re-renders every tick
 * (selector identity changes ⇒ infinite loop in subscribers).
 */
export function useRenderStyle(format: RenderFormat): FormatRenderStyle {
  return useRenderStyleStore((state) => state.settings.formats[format] ?? EMPTY_OVERRIDES);
}
