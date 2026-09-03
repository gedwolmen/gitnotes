import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const VISIBLE_KEY = '@gitnotes:floating_git_button_visible';

interface FloatingGitButtonState {
  /** Whether the app-wide floating git button is shown. */
  visible: boolean;
  /** True once the persisted preference has been read from AsyncStorage. */
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setVisible: (next: boolean) => Promise<void>;
  toggle: () => Promise<void>;
}

/**
 * Visibility preference for the app-wide floating git button. Toggled from
 * Settings → Sync; consumed by AppNavigator to conditionally render
 * `AppFloatingGitButton`. Defaults to visible (first launch keeps the
 * existing behavior); only the literal string `'false'` opts out.
 */
export const useFloatingGitButtonStore = create<FloatingGitButtonState>()((set, get) => ({
  visible: true,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    let visible = true;
    try {
      const raw = await AsyncStorage.getItem(VISIBLE_KEY);
      visible = raw !== 'false';
    } catch (error) {
      console.warn('[FloatingGitButtonStore] hydrate failed:', error);
    }
    set({ visible, hydrated: true });
  },

  setVisible: async (next) => {
    set({ visible: next });
    try {
      await AsyncStorage.setItem(VISIBLE_KEY, String(next));
    } catch (error) {
      console.warn('[FloatingGitButtonStore] persist failed:', error);
    }
  },

  toggle: async () => {
    await get().setVisible(!get().visible);
  },
}));
