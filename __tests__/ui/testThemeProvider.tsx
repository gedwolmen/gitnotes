import React, { ReactNode } from 'react';
import { ThemeContext } from '../../src/contexts/ThemeContext';
import {
  NEUMORPHIC_LIGHT,
  NEUMORPHIC_DARK,
  FLAT_LIGHT,
  FLAT_DARK,
  RADII,
  SPACING,
  TYPE,
  type Palette,
  type ThemeStyle,
} from '../../src/theme/tokens';

type Mode = 'light' | 'dark';

interface TestThemeProviderProps {
  children: ReactNode;
  style?: ThemeStyle;
  mode?: Mode;
}

const palette = (style: ThemeStyle, mode: Mode): Palette => {
  if (style === 'flat') return mode === 'dark' ? FLAT_DARK : FLAT_LIGHT;
  return mode === 'dark' ? NEUMORPHIC_DARK : NEUMORPHIC_LIGHT;
};

export function TestThemeProvider({
  children,
  style = 'neumorphic',
  mode = 'light',
}: TestThemeProviderProps) {
  const colors = palette(style, mode);
  const value = {
    theme: mode,
    isDark: mode === 'dark',
    style,
    setTheme: () => undefined,
    setStyle: () => undefined,
    colors,
    tokens: { colors, radii: RADII, spacing: SPACING, type: TYPE },
  };
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
