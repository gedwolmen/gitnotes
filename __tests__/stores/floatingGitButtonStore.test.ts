jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => (key in store ? store[key] : null)),
      setItem: jest.fn(async (key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: jest.fn(async (key: string) => {
        delete store[key];
      }),
      clear: jest.fn(async () => {
        store = {};
      }),
      __reset: () => {
        store = {};
      },
      __dump: () => ({ ...store }),
      __seed: (key: string, value: string) => {
        store[key] = value;
      },
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFloatingGitButtonStore } from '../../src/stores/floatingGitButtonStore';

const VISIBLE_KEY = '@gitnotes:floating_git_button_visible';

const mockStorage = AsyncStorage as unknown as {
  __reset: () => void;
  __dump: () => Record<string, string>;
  __seed: (key: string, value: string) => void;
};

function resetStore(): void {
  useFloatingGitButtonStore.setState({ visible: true, hydrated: false });
}

beforeEach(() => {
  mockStorage.__reset();
  resetStore();
});

describe('floatingGitButtonStore', () => {
  it('defaults to visible when no preference is stored', async () => {
    await useFloatingGitButtonStore.getState().hydrate();
    const state = useFloatingGitButtonStore.getState();
    expect(state.visible).toBe(true);
    expect(state.hydrated).toBe(true);
  });

  it('hides the button when the stored preference is "false"', async () => {
    mockStorage.__seed(VISIBLE_KEY, 'false');
    await useFloatingGitButtonStore.getState().hydrate();
    expect(useFloatingGitButtonStore.getState().visible).toBe(false);
  });

  it('keeps the button visible when the stored preference is "true"', async () => {
    mockStorage.__seed(VISIBLE_KEY, 'true');
    await useFloatingGitButtonStore.getState().hydrate();
    expect(useFloatingGitButtonStore.getState().visible).toBe(true);
  });

  it('falls back to visible for unrecognized stored values', async () => {
    mockStorage.__seed(VISIBLE_KEY, 'banana');
    await useFloatingGitButtonStore.getState().hydrate();
    expect(useFloatingGitButtonStore.getState().visible).toBe(true);
  });

  it('hydrates only once', async () => {
    await useFloatingGitButtonStore.getState().hydrate();
    mockStorage.__seed(VISIBLE_KEY, 'false');
    await useFloatingGitButtonStore.getState().hydrate();
    expect(useFloatingGitButtonStore.getState().visible).toBe(true);
  });

  it('setVisible updates state and persists to AsyncStorage', async () => {
    await useFloatingGitButtonStore.getState().setVisible(false);
    expect(useFloatingGitButtonStore.getState().visible).toBe(false);
    expect(mockStorage.__dump()[VISIBLE_KEY]).toBe('false');

    await useFloatingGitButtonStore.getState().setVisible(true);
    expect(useFloatingGitButtonStore.getState().visible).toBe(true);
    expect(mockStorage.__dump()[VISIBLE_KEY]).toBe('true');
  });

  it('toggle flips the current value and persists it', async () => {
    await useFloatingGitButtonStore.getState().toggle();
    expect(useFloatingGitButtonStore.getState().visible).toBe(false);
    expect(mockStorage.__dump()[VISIBLE_KEY]).toBe('false');

    await useFloatingGitButtonStore.getState().toggle();
    expect(useFloatingGitButtonStore.getState().visible).toBe(true);
    expect(mockStorage.__dump()[VISIBLE_KEY]).toBe('true');
  });
});
