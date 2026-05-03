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

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeMode>('system');
  const [style, setStyleState] = useState<ThemeStyle>('neumorphic');
  const [glossy, setGlossyState] = useState<boolean>(false);
  const systemColorScheme = useColorScheme();

  const loadPersisted = useCallback(async () => {
    try {
      const savedTheme = getBootValue('@gitnotes:theme') ?? await AsyncStorage.getItem(THEME_STORAGE_KEY);
      const savedStyle = getBootValue('@gitnotes:style') ?? await AsyncStorage.getItem(STYLE_STORAGE_KEY);
      const savedGlossy = getBootValue('@gitnotes:glossy') ?? await AsyncStorage.getItem(GLOSSY_STORAGE_KEY);
      
      if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
        setThemeState(savedTheme as ThemeMode);
      }
      if (savedStyle === 'neumorphic' || savedStyle === 'flat') {
        setStyleState(savedStyle);
      }
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
