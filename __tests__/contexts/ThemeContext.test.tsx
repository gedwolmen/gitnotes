jest.mock('react-native', () => ({
  useColorScheme: () => ({ colorScheme: 'light' }),
  AccessibilityInfo: { isReduceMotionEnabled: () => Promise.resolve(false), addEventListener: () => ({ remove: jest.fn() }) },
  StyleSheet: { create: (s: object) => s, flatten: (s: object) => s },
  Platform: { OS: 'ios', select: (o: object) => o },
  PixelRatio: { get: () => 2 },
  Dimensions: { get: () => ({ width: 375, height: 812 }) },
  Image: () => null,
  Text: () => null,
  TouchableOpacity: () => null,
  Pressable: () => null,
  ScrollView: () => null,
  FlatList: () => null,
  SectionList: () => null,
  TextInput: () => null,
  Switch: () => null,
  ActivityIndicator: () => null,
  RefreshControl: () => null,
  Modal: () => null,
  KeyboardAvoidingView: () => null,
  View: () => null,
  useWindowDimensions: () => ({ width: 375, height: 812, scale: 2, fontScale: 1 }),
  Alert: { alert: jest.fn() },
}));

import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { bootstrapStorage, clearBootCache } from '../../src/services/StorageBootstrap';
import { ThemeProvider, useTheme } from '../../src/contexts/ThemeContext';
import {
  FLAT_LIGHT,
  NEUMORPHIC_LIGHT,
  resolveColors,
  deriveAccentMuted,
  type Palette,
  type ThemeStyle,
} from '../../src/theme/tokens';

// ---------------------------------------------------------------------------
// Boot cache helpers
// ---------------------------------------------------------------------------
async function prepStorage(overrides: Record<string, string | null> = {}) {
  await bootstrapStorage();
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null) {
      await AsyncStorage.removeItem(k);
    } else {
      await AsyncStorage.setItem(k, v);
    }
  }
  clearBootCache();
  await bootstrapStorage();
}

// ---------------------------------------------------------------------------
// deriveAccentMuted unit tests
// ---------------------------------------------------------------------------
describe('deriveAccentMuted', () => {
  const ACCENT = '#FF5500';

  it('derives a muted accent for light theme that differs from input', () => {
    const muted = deriveAccentMuted(ACCENT, false);
    expect(muted).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(muted).not.toBe(ACCENT);
  });

  it('derives a muted accent for dark theme that differs from input', () => {
    const muted = deriveAccentMuted(ACCENT, true);
    expect(muted).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(muted).not.toBe(ACCENT);
  });

  it('light theme muted is lighter than input', () => {
    const toLightness = (hex: string): number => {
      const h = hex.replace('#', '');
      const r = parseInt(h.slice(0, 2), 16) / 255;
      const g = parseInt(h.slice(2, 4), 16) / 255;
      const b = parseInt(h.slice(4, 6), 16) / 255;
      return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
    };
    const inputL = toLightness(ACCENT);
    const mutedL = toLightness(deriveAccentMuted(ACCENT, false));
    expect(mutedL).toBeGreaterThan(inputL);
  });

  it('dark theme muted is darker than input', () => {
    const toLightness = (hex: string): number => {
      const h = hex.replace('#', '');
      const r = parseInt(h.slice(0, 2), 16) / 255;
      const g = parseInt(h.slice(2, 4), 16) / 255;
      const b = parseInt(h.slice(4, 6), 16) / 255;
      return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
    };
    const inputL = toLightness(ACCENT);
    const mutedL = toLightness(deriveAccentMuted(ACCENT, true));
    expect(mutedL).toBeLessThan(inputL);
  });

  it('returns input unchanged when hex is not 6 chars', () => {
    expect(deriveAccentMuted('#FF55', false)).toBe('#FF55');
    expect(deriveAccentMuted('#GGGGGG', false)).toBe('#GGGGGG');
  });

  it('is deterministic: same inputs always produce same output', () => {
    const result1 = deriveAccentMuted('#AABBCC', false);
    const result2 = deriveAccentMuted('#AABBCC', false);
    expect(result1).toBe(result2);
  });

  it('produces different muted values for light vs dark with same accent', () => {
    const mutedLight = deriveAccentMuted('#1E90FF', false);
    const mutedDark = deriveAccentMuted('#1E90FF', true);
    expect(mutedLight).not.toBe(mutedDark);
  });
});

// ---------------------------------------------------------------------------
// resolveColors baseline — prove existing palettes unchanged
// ---------------------------------------------------------------------------
describe('resolveColors baseline (no custom accent)', () => {
  const cases: Array<{ style: ThemeStyle; isDark: boolean; expected: Palette }> = [
    { style: 'flat', isDark: false, expected: FLAT_LIGHT },
    { style: 'neumorphic', isDark: false, expected: NEUMORPHIC_LIGHT },
  ];

  for (const { style, isDark, expected } of cases) {
    it(`returns built-in ${style}-${isDark ? 'dark' : 'light'} palette unchanged`, () => {
      const colors = resolveColors(style, isDark);
      expect(colors).toEqual(expected);
    });
  }
});

// ---------------------------------------------------------------------------
// ThemeContext integration tests — system color scheme is 'light' per jest.setup.ts
// ---------------------------------------------------------------------------
describe('ThemeContext accent color', () => {
  beforeEach(async () => {
    await prepStorage({});
  });

  afterEach(() => {
    clearBootCache();
  });

  it('returns built-in flat-light palette when no accent is set', async () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(result.current.colors).toEqual(FLAT_LIGHT);
    expect(result.current.accentColor).toBeNull();
  });

  it('custom valid hex overrides accent and primary', async () => {
    const CUSTOM = '#FF5500';
    await prepStorage({ '@gitnotes:accent': CUSTOM });

    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(result.current.accentColor?.toLowerCase()).toBe(CUSTOM.toLowerCase());
    expect(result.current.colors.accent.toLowerCase()).toBe(CUSTOM.toLowerCase());
    expect(result.current.colors.primary.toLowerCase()).toBe(CUSTOM.toLowerCase());
  });

  it('custom accent derives accentMuted for light theme', async () => {
    const CUSTOM = '#FF5500';
    await prepStorage({ '@gitnotes:accent': CUSTOM });

    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    const expectedMuted = deriveAccentMuted(CUSTOM.toLowerCase(), false);
    expect(result.current.colors.accentMuted.toLowerCase()).toBe(expectedMuted.toLowerCase());
  });

  it('setAccentColor(null) restores built-in palette', async () => {
    const CUSTOM = '#DEAD00';
    await prepStorage({ '@gitnotes:accent': CUSTOM });

    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(result.current.colors.accent.toLowerCase()).toBe(CUSTOM.toLowerCase());

    await act(async () => {
      result.current.setAccentColor(null);
    });

    expect(result.current.accentColor).toBeNull();
    expect(result.current.colors.accent).toBe(FLAT_LIGHT.accent);
    expect(result.current.colors.primary).toBe(FLAT_LIGHT.primary);
  });

  it('setAccentColor("#ABCDEF") persists the normalized hex', async () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    await act(async () => {
      result.current.setAccentColor('#ABCDEF');
    });

    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const stored = await AsyncStorage.getItem('@gitnotes:accent');
    expect(stored).toBe('#abcdef');
    expect(result.current.accentColor).toBe('#abcdef');
  });

  it('setAccentColor invalid non-null input is a no-op', async () => {
    await prepStorage({ '@gitnotes:accent': null });

    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    const priorAccent = result.current.accentColor;
    const priorPrimary = result.current.colors.primary;

    await act(async () => {
      result.current.setAccentColor('#GGGGGG');
    });

    expect(result.current.accentColor).toBe(priorAccent);
    expect(result.current.colors.primary).toBe(priorPrimary);

    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const stored = await AsyncStorage.getItem('@gitnotes:accent');
    expect(stored).toBeNull();
  });

  it('malformed hex storage is ignored without throwing', async () => {
    await prepStorage({ '@gitnotes:accent': '#GGGGGG' });

    let errorThrown = false;
    try {
      renderHook(() => useTheme(), {
        wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
      });
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    } catch {
      errorThrown = true;
    }
    expect(errorThrown).toBe(false);
  });

  it('short hex storage falls back to default accent', async () => {
    await prepStorage({ '@gitnotes:accent': '#FFF' });

    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(result.current.accentColor).toBeNull();
    expect(result.current.colors.accent).toBe(FLAT_LIGHT.accent);
  });

  it('custom accent persists and overrides accent/primary for flat style', async () => {
    const CUSTOM = '#AABBCC';
    await prepStorage({ '@gitnotes:accent': CUSTOM, '@gitnotes:style': 'flat' });

    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(result.current.colors.accent.toLowerCase()).toBe(CUSTOM.toLowerCase());
    expect(result.current.colors.primary.toLowerCase()).toBe(CUSTOM.toLowerCase());
    expect(result.current.style).toBe('flat');
  });

  it('custom accent persists and overrides accent/primary for neumorphic style', async () => {
    const CUSTOM = '#DE47C1';
    await prepStorage({ '@gitnotes:accent': CUSTOM, '@gitnotes:style': 'neumorphic' });

    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(result.current.colors.accent.toLowerCase()).toBe(CUSTOM.toLowerCase());
    expect(result.current.colors.primary.toLowerCase()).toBe(CUSTOM.toLowerCase());
    expect(result.current.style).toBe('neumorphic');
  });

  it('deriveAccentMuted produces darker muted for dark theme vs light theme', () => {
    const CUSTOM = '#1E90FF';
    const mutedLight = deriveAccentMuted(CUSTOM, false);
    const mutedDark = deriveAccentMuted(CUSTOM, true);
    expect(mutedDark).not.toBe(mutedLight);
    const toLightness = (hex: string): number => {
      const h = hex.replace('#', '');
      const r = parseInt(h.slice(0, 2), 16) / 255;
      const g = parseInt(h.slice(2, 4), 16) / 255;
      const b = parseInt(h.slice(4, 6), 16) / 255;
      return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
    };
    expect(toLightness(mutedDark)).toBeLessThan(toLightness(mutedLight));
  });
});
