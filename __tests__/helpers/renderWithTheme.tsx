import React from 'react';
import { render } from '@testing-library/react-native';

import { ThemeContext } from '../../src/contexts/ThemeContext';
import { NEUMORPHIC_LIGHT, RADII, SPACING, TYPE } from '../../src/theme/tokens';

const defaultThemeValue = {
  theme: 'light' as const,
  isDark: false,
  style: 'neumorphic' as const,
  setTheme: jest.fn(),
  setStyle: jest.fn(),
  colors: NEUMORPHIC_LIGHT,
  tokens: {
    colors: NEUMORPHIC_LIGHT,
    radii: RADII,
    spacing: SPACING,
    type: TYPE,
  },
};

export function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeContext.Provider value={defaultThemeValue}>{ui}</ThemeContext.Provider>);
}
