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
  glossy: boolean;
  setTheme: (theme: ThemeMode) => void;
  setStyle: (style: ThemeStyle) => void;
  setGlossy: (glossy: boolean) => void;
  colors: Palette;
  tokens: Tokens;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = '@gitnotes:theme';
const STYLE_STORAGE_KEY = '@gitnotes:style';
const GLOSSY_STORAGE_KEY = '@gitnotes:glossy';

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
  return 'neumorphic';
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
  const [glossy, setGlossyState] = useState<boolean>(false);
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
      const savedGlossy = await AsyncStorage.getItem(GLOSSY_STORAGE_KEY);
      if (savedGlossy !== null) {
        setGlossyState(savedGlossy === 'true');
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
      if (newStyle === 'neumorphic') {
        setGlossyState(false);
        await AsyncStorage.setItem(GLOSSY_STORAGE_KEY, 'false');
      }
    } catch (error) {
      console.error('Error saving style:', error);
    }
  }, []);

  const setGlossy = useCallback(async (newGlossy: boolean) => {
    try {
      setGlossyState(newGlossy);
      await AsyncStorage.setItem(GLOSSY_STORAGE_KEY, newGlossy ? 'true' : 'false');
      if (newGlossy) {
        setStyleState('flat');
        await AsyncStorage.setItem(STYLE_STORAGE_KEY, 'flat');
      }
    } catch (error) {
      console.error('Error saving glossy:', error);
    }
  }, []);

  const colors = useMemo(() => resolveColors(style, isDark), [style, isDark]);

  const tokens: Tokens = useMemo(
    () => ({ colors, radii: RADII, spacing: SPACING, type: TYPE }),
    [colors],
  );

  const value: ThemeContextType = useMemo(
    () => ({ theme, isDark, style, glossy, setTheme, setStyle, setGlossy, colors, tokens }),
    [theme, isDark, style, glossy, setTheme, setStyle, setGlossy, colors, tokens],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export function useTokens(): Tokens {
  return useTheme().tokens;
}

export { ThemeContext };
