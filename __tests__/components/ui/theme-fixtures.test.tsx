import React from 'react';
import { Text, View } from 'react-native';
import { render } from '@testing-library/react-native';
import { Surface } from '../../../src/components/ui/Surface';
import { Card } from '../../../src/components/ui/Card';
import { Button } from '../../../src/components/ui/Button';
import { IconButton } from '../../../src/components/ui/IconButton';
import { Chip } from '../../../src/components/ui/Chip';
import { Toggle } from '../../../src/components/ui/Toggle';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { Input } from '../../../src/components/ui/Input';
import BaseNoteCard from '../../../src/components/NoteCard';
import {
  FLAT_LIGHT,
  FLAT_DARK,
  NEUMORPHIC_LIGHT,
  NEUMORPHIC_DARK,
  RADII,
  SPACING,
  TYPE,
  type Palette,
  type ThemeStyle,
} from '../../../src/theme/tokens';
import type { Note } from '../../../src/models/Note';

// ---------------------------------------------------------------------------
// Deterministic note fixture — no wall-clock, no network
// ---------------------------------------------------------------------------
const FIXED_NOTE: Note = {
  id: 'fixture-note-001',
  title: 'Deterministic Test Note',
  content: 'This is fixture content for visual regression baseline testing.',
  createdAt: 1700000000000, // 2023-11-14 22:13:20 UTC
  updatedAt: 1700003600000, // 2023-11-14 23:13:20 UTC
  tags: ['fixture', 'visual', 'baseline'],
  color: 'blue',
  isPinned: true,
  format: 'markdown',
  repo: 'test/repo',
  folderPath: '/test-folder',
};

// ---------------------------------------------------------------------------
// Palette fixtures — one per theme combination
// ---------------------------------------------------------------------------
interface ThemeFixture {
  label: string;
  palette: Palette;
  style: ThemeStyle;
  isDark: boolean;
}

const FIXTURES: ThemeFixture[] = [
  { label: 'flat-light', palette: FLAT_LIGHT, style: 'flat', isDark: false },
  { label: 'flat-dark', palette: FLAT_DARK, style: 'flat', isDark: true },
  { label: 'neumorphic-light', palette: NEUMORPHIC_LIGHT, style: 'neumorphic', isDark: false },
  { label: 'neumorphic-dark', palette: NEUMORPHIC_DARK, style: 'neumorphic', isDark: true },
];

// ---------------------------------------------------------------------------
// Required palette tokens for UI rendering
// ---------------------------------------------------------------------------
const REQUIRED_PALETTE_KEYS = [
  'bg',
  'surface',
  'highlight',
  'shadow',
  'text',
  'textSecondary',
  'accent',
  'accentMuted',
  'error',
  'success',
  'warning',
  'background',
  'surfaceSecondary',
  'primary',
  'border',
  'card',
  'elevated',
] as const;

// ---------------------------------------------------------------------------
// Mock ThemeContext so tests can override the active palette directly
// ---------------------------------------------------------------------------

jest.mock('../../../src/contexts/ThemeContext', () => {
  const React = require('react');
  const { createContext, useContext } = React;

  // Module-level state so each test can call __overrideTheme / __resetTheme
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let _mockOverride: any = null;

  const DefaultContext = createContext<Record<string, unknown>>(null as unknown as Record<string, unknown>);

  return {
    ThemeProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(DefaultContext.Provider, { value: _mockOverride }, children),

    useTheme: () => {
      const ctx = useContext(DefaultContext);
      // Fall back to flat-light safe defaults so tests that don't call
      // __overrideTheme still get a valid palette.
      return (
        ctx ?? {
          theme: 'light',
          isDark: false,
          style: 'flat',
          setTheme: jest.fn(),
          setStyle: jest.fn(),
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
          tokens: {
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
          },
        }
      );
    },

    useTokens: () => {
      const { useTheme: _useTheme } = jest.requireActual('../../../src/contexts/ThemeContext');
      return _useTheme().tokens;
    },

    // Test-only API — call this to switch the context value for the current fixture
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __overrideTheme: (palette: any, style: any, isDark: boolean) => {
      _mockOverride = {
        theme: isDark ? 'dark' : 'light',
        isDark,
        style,
        setTheme: jest.fn(),
        setStyle: jest.fn(),
        colors: palette,
        tokens: { colors: palette, radii: { sm: 12, md: 18, lg: 24, pill: 999 }, spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 }, type: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, '2xl': 28 } },
      };
    },

    __resetTheme: () => {
      _mockOverride = null;
    },
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Theme palette completeness', () => {
  for (const fixture of FIXTURES) {
    describe(fixture.label, () => {
      for (const key of REQUIRED_PALETTE_KEYS) {
        it(`provides palette token "${key}"`, () => {
          expect(fixture.palette).toHaveProperty(key);
          expect(typeof fixture.palette[key]).toBe('string');
          expect(fixture.palette[key].length).toBeGreaterThan(0);
        });
      }

      it('resolves to the correct palette via resolveColors', () => {
        const { resolveColors } = jest.requireActual('../../../src/theme/tokens');
        const resolved = resolveColors(fixture.style, fixture.isDark);
        expect(resolved).toEqual(fixture.palette);
      });
    });
  }
});

describe('Surface rendering across all themes', () => {
  for (const fixture of FIXTURES) {
    describe(fixture.label, () => {
      beforeEach(() => {
        const { __overrideTheme } = jest.requireMock('../../../src/contexts/ThemeContext');
        __overrideTheme(fixture.palette, fixture.style, fixture.isDark);
      });

      afterEach(() => {
        const { __resetTheme } = jest.requireMock('../../../src/contexts/ThemeContext');
        __resetTheme();
      });

      it('renders Surface without crashing', () => {
        const { __overrideTheme } = jest.requireMock('../../../src/contexts/ThemeContext');
        __overrideTheme(fixture.palette, fixture.style, fixture.isDark);
        const { root } = render(
          <Surface testID={`surface-${fixture.label}`}>
            <Text>Surface content</Text>
          </Surface>
        );
        expect(root).toBeTruthy();
      });

      it('renders Surface with each elevation tier', () => {
        const { __overrideTheme } = jest.requireMock('../../../src/contexts/ThemeContext');
        __overrideTheme(fixture.palette, fixture.style, fixture.isDark);
        for (const tier of ['subtle', 'raised', 'floating', 'flat'] as const) {
          const { root } = render(
            <Surface elevation={tier} testID={`surface-${tier}`}>
              <Text>{tier}</Text>
            </Surface>
          );
          expect(root).toBeTruthy();
        }
      });

      it('renders Surface with each radius token', () => {
        const { __overrideTheme } = jest.requireMock('../../../src/contexts/ThemeContext');
        __overrideTheme(fixture.palette, fixture.style, fixture.isDark);
        for (const radius of ['sm', 'md', 'lg', 'pill'] as const) {
          const { root } = render(
            <Surface radius={radius} testID={`surface-radius-${radius}`}>
              <Text>{radius}</Text>
            </Surface>
          );
          expect(root).toBeTruthy();
        }
      });
    });
  }
});

describe('Card rendering across all themes', () => {
  for (const fixture of FIXTURES) {
    describe(fixture.label, () => {
      beforeEach(() => {
        const { __overrideTheme } = jest.requireMock('../../../src/contexts/ThemeContext');
        __overrideTheme(fixture.palette, fixture.style, fixture.isDark);
      });

      afterEach(() => {
        const { __resetTheme } = jest.requireMock('../../../src/contexts/ThemeContext');
        __resetTheme();
      });

      it('renders Card without crashing', () => {
        const { root } = render(
          <Card testID={`card-${fixture.label}`}>
            <Text>Card content</Text>
          </Card>
        );
        expect(root).toBeTruthy();
      });

      it('renders interactive Card with onPress', () => {
        const handlePress = jest.fn();
        const { getByTestId } = render(
          <Card testID={`card-press-${fixture.label}`} onPress={handlePress}>
            <Text>Press me</Text>
          </Card>
        );
        expect(getByTestId(`card-press-${fixture.label}`)).toBeTruthy();
      });

      it('renders disabled Card', () => {
        const { root } = render(
          <Card disabled testID={`card-disabled-${fixture.label}`}>
            <Text>Disabled</Text>
          </Card>
        );
        expect(root).toBeTruthy();
      });
    });
  }
});

describe('Button rendering across all themes', () => {
  for (const fixture of FIXTURES) {
    describe(fixture.label, () => {
      beforeEach(() => {
        const { __overrideTheme } = jest.requireMock('../../../src/contexts/ThemeContext');
        __overrideTheme(fixture.palette, fixture.style, fixture.isDark);
      });

      afterEach(() => {
        const { __resetTheme } = jest.requireMock('../../../src/contexts/ThemeContext');
        __resetTheme();
      });

      for (const variant of ['primary', 'secondary', 'ghost', 'outline', 'danger'] as const) {
        it(`renders Button variant="${variant}" without crashing`, () => {
          const { root } = render(
            <Button
              label={`${variant} button`}
              variant={variant}
              testID={`button-${variant}-${fixture.label}`}
            />
          );
          expect(root).toBeTruthy();
        });
      }

      it('renders disabled Button', () => {
        const { root } = render(
          <Button label="Disabled" disabled testID={`button-disabled-${fixture.label}`} />
        );
        expect(root).toBeTruthy();
      });

      for (const size of ['xs', 'sm', 'md'] as const) {
        it(`renders Button size="${size}" without crashing`, () => {
          const { root } = render(
            <Button label="Size test" size={size} testID={`button-size-${size}-${fixture.label}`} />
          );
          expect(root).toBeTruthy();
        });
      }
    });
  }
});

describe('IconButton rendering across all themes', () => {
  for (const fixture of FIXTURES) {
    describe(fixture.label, () => {
      beforeEach(() => {
        const { __overrideTheme } = jest.requireMock('../../../src/contexts/ThemeContext');
        __overrideTheme(fixture.palette, fixture.style, fixture.isDark);
      });

      afterEach(() => {
        const { __resetTheme } = jest.requireMock('../../../src/contexts/ThemeContext');
        __resetTheme();
      });

      it('renders IconButton without crashing', () => {
        const { root } = render(
          <IconButton testID={`iconbtn-${fixture.label}`}>
            <View />
          </IconButton>
        );
        expect(root).toBeTruthy();
      });

      for (const variant of ['default', 'primary', 'ghost'] as const) {
        it(`renders IconButton variant="${variant}"`, () => {
          const { root } = render(
            <IconButton variant={variant} testID={`iconbtn-${variant}-${fixture.label}`}>
              <View />
            </IconButton>
          );
          expect(root).toBeTruthy();
        });
      }
    });
  }
});

describe('Chip rendering across all themes', () => {
  for (const fixture of FIXTURES) {
    describe(fixture.label, () => {
      beforeEach(() => {
        const { __overrideTheme } = jest.requireMock('../../../src/contexts/ThemeContext');
        __overrideTheme(fixture.palette, fixture.style, fixture.isDark);
      });

      afterEach(() => {
        const { __resetTheme } = jest.requireMock('../../../src/contexts/ThemeContext');
        __resetTheme();
      });

      it('renders Chip without crashing', () => {
        const { root } = render(
          <Chip label="Test Chip" testID={`chip-${fixture.label}`} />
        );
        expect(root).toBeTruthy();
      });

      it('renders active Chip', () => {
        const { root } = render(
          <Chip label="Active Chip" active testID={`chip-active-${fixture.label}`} />
        );
        expect(root).toBeTruthy();
      });
    });
  }
});

describe('Toggle rendering across all themes', () => {
  for (const fixture of FIXTURES) {
    describe(fixture.label, () => {
      beforeEach(() => {
        const { __overrideTheme } = jest.requireMock('../../../src/contexts/ThemeContext');
        __overrideTheme(fixture.palette, fixture.style, fixture.isDark);
      });

      afterEach(() => {
        const { __resetTheme } = jest.requireMock('../../../src/contexts/ThemeContext');
        __resetTheme();
      });

      it('renders Toggle (off) without crashing', () => {
        const { root } = render(
          <Toggle value={false} onValueChange={jest.fn()} testID={`toggle-off-${fixture.label}`} />
        );
        expect(root).toBeTruthy();
      });

      it('renders Toggle (on) without crashing', () => {
        const { root } = render(
          <Toggle value={true} onValueChange={jest.fn()} testID={`toggle-on-${fixture.label}`} />
        );
        expect(root).toBeTruthy();
      });

      it('renders disabled Toggle', () => {
        const { root } = render(
          <Toggle
            value={false}
            onValueChange={jest.fn()}
            disabled
            testID={`toggle-disabled-${fixture.label}`}
          />
        );
        expect(root).toBeTruthy();
      });
    });
  }
});

describe('EmptyState rendering across all themes', () => {
  for (const fixture of FIXTURES) {
    describe(fixture.label, () => {
      beforeEach(() => {
        const { __overrideTheme } = jest.requireMock('../../../src/contexts/ThemeContext');
        __overrideTheme(fixture.palette, fixture.style, fixture.isDark);
      });

      afterEach(() => {
        const { __resetTheme } = jest.requireMock('../../../src/contexts/ThemeContext');
        __resetTheme();
      });

      it('renders EmptyState without crashing', () => {
        const { root } = render(
          <EmptyState
            icon="document-text"
            title="No notes yet"
            subtitle="Create your first note to get started"
            testID={`empty-${fixture.label}`}
          />
        );
        expect(root).toBeTruthy();
      });

      it('renders EmptyState without subtitle', () => {
        const { root } = render(
          <EmptyState icon="document-text" title="Nothing here" testID={`empty-nosub-${fixture.label}`} />
        );
        expect(root).toBeTruthy();
      });
    });
  }
});

describe('Input rendering across all themes', () => {
  for (const fixture of FIXTURES) {
    describe(fixture.label, () => {
      beforeEach(() => {
        const { __overrideTheme } = jest.requireMock('../../../src/contexts/ThemeContext');
        __overrideTheme(fixture.palette, fixture.style, fixture.isDark);
      });

      afterEach(() => {
        const { __resetTheme } = jest.requireMock('../../../src/contexts/ThemeContext');
        __resetTheme();
      });

      it('renders Input without crashing', () => {
        const { root } = render(
          <Input placeholder="Enter text" testID={`input-${fixture.label}`} />
        );
        expect(root).toBeTruthy();
      });

      it('renders multiline Input without crashing', () => {
        const { root } = render(
          <Input multiline placeholder="Multiline" testID={`input-multi-${fixture.label}`} />
        );
        expect(root).toBeTruthy();
      });
    });
  }
});

jest.mock('../../../src/hooks/useResponsive', () => ({
  useResponsive: () => ({
    isTablet: false,
    isLandscape: false,
    screenWidth: 375,
    screenHeight: 812,
    columns: 1,
    maxContentWidth: 375,
    sideBySide: false,
    deviceType: 'phone',
    columnCount: 1,
  }),
}));

describe('NoteCard rendering across all themes', () => {
  for (const fixture of FIXTURES) {
    describe(fixture.label, () => {
      beforeEach(() => {
        const { __overrideTheme } = jest.requireMock('../../../src/contexts/ThemeContext');
        __overrideTheme(fixture.palette, fixture.style, fixture.isDark);
      });

      afterEach(() => {
        const { __resetTheme } = jest.requireMock('../../../src/contexts/ThemeContext');
        __resetTheme();
      });

      it('renders BaseNoteCard without crashing', () => {
        const handlePress = jest.fn();
        const { root } = render(
          <BaseNoteCard
            note={FIXED_NOTE}
            onPress={handlePress}
            testID={`notecard-${fixture.label}`}
          />
        );
        expect(root).toBeTruthy();
      });

      it('renders compact variant', () => {
        const handlePress = jest.fn();
        const { root } = render(
          <BaseNoteCard
            note={FIXED_NOTE}
            onPress={handlePress}
            compact
            testID={`notecard-compact-${fixture.label}`}
          />
        );
        expect(root).toBeTruthy();
      });

      it('renders card variant', () => {
        const handlePress = jest.fn();
        const { root } = render(
          <BaseNoteCard
            note={FIXED_NOTE}
            onPress={handlePress}
            variant="card"
            testID={`notecard-card-${fixture.label}`}
          />
        );
        expect(root).toBeTruthy();
      });

      it('renders offline/cached states', () => {
        const handlePress = jest.fn();
        const { root: offline } = render(
          <BaseNoteCard
            note={FIXED_NOTE}
            onPress={handlePress}
            isOffline
            isCached={false}
            testID={`notecard-offline-${fixture.label}`}
          />
        );
        expect(offline).toBeTruthy();

        const { root: cached } = render(
          <BaseNoteCard
            note={FIXED_NOTE}
            onPress={handlePress}
            isOffline
            isCached
            testID={`notecard-cached-${fixture.label}`}
          />
        );
        expect(cached).toBeTruthy();
      });
    });
  }
});

describe('Token invariants', () => {
  it('RADII contains sm, md, lg, pill', () => {
    expect(RADII).toHaveProperty('sm', 12);
    expect(RADII).toHaveProperty('md', 18);
    expect(RADII).toHaveProperty('lg', 24);
    expect(RADII).toHaveProperty('pill', 999);
  });

  it('SPACING contains keys 1-8', () => {
    const spacingKeys = Object.keys(SPACING).map(Number);
    for (const k of [1, 2, 3, 4, 5, 6, 8] as const) {
      expect(spacingKeys).toContain(k);
      expect(typeof SPACING[k as keyof typeof SPACING]).toBe('number');
    }
  });

  it('TYPE contains xs, sm, md, lg, xl, 2xl', () => {
    for (const k of ['xs', 'sm', 'md', 'lg', 'xl', '2xl'] as const) {
      expect(TYPE).toHaveProperty(k);
      expect(typeof TYPE[k]).toBe('number');
    }
  });

  it('all four palettes have the same set of keys', () => {
    const keys = new Set(Object.keys(FLAT_LIGHT));
    for (const palette of [FLAT_DARK, NEUMORPHIC_LIGHT, NEUMORPHIC_DARK]) {
      expect(new Set(Object.keys(palette))).toEqual(keys);
    }
  });
});
