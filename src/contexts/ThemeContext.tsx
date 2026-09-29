import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBootValue } from '../services/StorageBootstrap';
import {
  Palette,
  ThemeStyle,
  resolveColors,
  RADII,
  SPACING,
  TYPE,
} from '../theme/tokens';

type ThemeMode = 'light' | 'dark' | 'system';

export interface Tokens {
  colors: Palette;
  radii: typeof RADII;
  spacing: typeof SPACING;
  type: typeof TYPE;
}

interface ThemeContextType {
  theme: ThemeMode;
  isDark: boolean;
  style: ThemeStyle;
  setTheme: (theme: ThemeMode) => void;
  setStyle: (style: ThemeStyle) => void;
  colors: Palette;
  tokens: Tokens;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = '@gitnotes:theme';
const STYLE_STORAGE_KEY = '@gitnotes:style';

interface ThemeProviderProps {
  children: ReactNode;
}

function readBootTheme(): ThemeMode {
  const v = getBootValue('@gitnotes:theme');
  if (v === 'light' || v === 'dark' || v === 'system') return v;
  return 'system';
}

function readBootStyle(): ThemeStyle {
  const v = getBootValue('@gitnotes:style');
  if (v === 'neumorphic' || v === 'flat') return v;
  // Fancy UI (neumorphic) is pro-gated — default fresh installs to flat.
  return 'flat';
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  // Lazy-init from the storage bootstrap cache so the very first paint
  // uses the persisted theme. Without this, the initial render uses the
  // 'system' default and `useColorScheme()` may return null on cold
  // start, leaving the first frame in light mode. Surfaces with cached
  // subtree state (custom TabBar, NavigationContainer chrome) end up
  // briefly mismatched with the rest of the app.
  //
  // Falls back to AsyncStorage in loadPersisted for the rare case where
  // the bootstrap cache is missing the key (e.g. tests mounting
  // ThemeProvider without calling bootstrapStorage first).
  const [theme, setThemeState] = useState<ThemeMode>(readBootTheme);
  const [style, setStyleState] = useState<ThemeStyle>(readBootStyle);
  const systemColorScheme = useColorScheme();

  const loadPersisted = useCallback(async () => {
    try {
      if (getBootValue('@gitnotes:theme') === undefined) {
        const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
          setThemeState(savedTheme);
        }
      }
      if (getBootValue('@gitnotes:style') === undefined) {
        const savedStyle = await AsyncStorage.getItem(STYLE_STORAGE_KEY);
        if (savedStyle === 'neumorphic' || savedStyle === 'flat') {
          setStyleState(savedStyle);
        }
      }
    } catch (error) {
      console.error('Error loading theme preferences:', error);
    }
  }, []);

  useEffect(() => {
    loadPersisted();
  }, [loadPersisted]);

  const isDark = useMemo(() => {
    if (theme === 'system') {
      return systemColorScheme === 'dark';
    }
    return theme === 'dark';
  }, [theme, systemColorScheme]);

  const setTheme = useCallback(async (newTheme: ThemeMode) => {
    try {
      setThemeState(newTheme);
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  }, []);

  const setStyle = useCallback(async (newStyle: ThemeStyle) => {
    try {
      setStyleState(newStyle);
      await AsyncStorage.setItem(STYLE_STORAGE_KEY, newStyle);
    } catch (error) {
      console.error('Error saving style:', error);
    }
  }, []);

  const colors = useMemo(() => resolveColors(style, isDark), [style, isDark]);

  const tokens: Tokens = useMemo(
    () => ({ colors, radii: RADII, spacing: SPACING, type: TYPE }),
    [colors],
  );

  const value: ThemeContextType = useMemo(
    () => ({ theme, isDark, style, setTheme, setStyle, colors, tokens }),
    [theme, isDark, style, setTheme, setStyle, colors, tokens],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const SAFE_DEFAULT_TOKENS: Tokens = {
  colors: {
    bg: '#f2f2f7',
    surface: '#ffffff',
    highlight: '#ffffff',
    shadow: '#000000',
    text: '#1c1c1e',
    textSecondary: '#6e6e73',
    accent: '#007AFF',
    accentMuted: '#5AC8FA',
    error: '#ff3b30',
    success: '#34C759',
    warning: '#FF9500',
    background: '#f2f2f7',
    surfaceSecondary: '#f2f2f7',
    primary: '#007AFF',
    border: '#c6c6c8',
    card: '#ffffff',
    elevated: '#ffffff',
  },
  radii: { sm: 12, md: 18, lg: 24, pill: 999 },
  spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
  type: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, '2xl': 28 },
};

export const SAFE_DEFAULT_THEME: ThemeContextType = {
  theme: 'system',
  isDark: false,
  style: 'flat',
  setTheme: () => {},
  setStyle: () => {},
  colors: SAFE_DEFAULT_TOKENS.colors,
  tokens: SAFE_DEFAULT_TOKENS,
};

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) return SAFE_DEFAULT_THEME;
  return context;
}

export function useTokens(): Tokens {
  const context = useContext(ThemeContext);
  if (context === undefined) return SAFE_DEFAULT_TOKENS;
  return context.tokens;
}

export { ThemeContext };
