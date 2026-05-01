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

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeMode>('system');
  const [style, setStyleState] = useState<ThemeStyle>('neumorphic');
  const systemColorScheme = useColorScheme();

  const loadPersisted = useCallback(async () => {
    try {
      const savedTheme = getBootValue('@gitnotes:theme') ?? await AsyncStorage.getItem(THEME_STORAGE_KEY);
      const savedStyle = getBootValue('@gitnotes:style') ?? await AsyncStorage.getItem(STYLE_STORAGE_KEY);
      if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
        setThemeState(savedTheme as ThemeMode);
      }
      if (savedStyle === 'neumorphic' || savedStyle === 'flat') {
        setStyleState(savedStyle);
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
