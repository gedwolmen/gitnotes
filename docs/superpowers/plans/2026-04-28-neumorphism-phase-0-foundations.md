# Neumorphism Phase 0 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the cross-platform neumorphic foundation (design tokens, theme-context style flag, the `<Surface>` primitive, and a dev-only gallery screen) so subsequent phases can migrate screens with confidence. App ships unchanged for end users until they enable the new style.

**Architecture:** Pure-RN two-`View` sandwich shadow strategy (no new deps). All visual decisions flow from `src/theme/tokens.ts` through `useTokens()`. A `style: 'neumorphic' | 'flat'` flag on `ThemeContext` (persisted in AsyncStorage) gates the entire conversion at runtime. `<Surface>` is the single source of truth for elevation and inset rendering across iOS / Android / Web; everything in Phases 1+ is built on top of it.

**Tech Stack:** React Native 0.81, Expo 54, TypeScript 5.6, AsyncStorage, `@react-navigation/native-stack`, Jest (logic-only tests — repo has no React-Native rendering test infra; component validation happens via the gallery screen).

**Spec:** `docs/superpowers/specs/2026-04-28-neumorphism-ui-design.md`

---

## File Plan

| File | Action | Responsibility |
|------|--------|----------------|
| `src/theme/tokens.ts` | Create | Palette + radii + spacing + type sizes; pure `resolveColors` helper |
| `src/theme/elevation.ts` | Create | Pure `buildElevation` helper — produces per-platform shadow style objects |
| `src/contexts/ThemeContext.tsx` | Modify | Add `style` flag, `setStyle`, `tokens`; new `useTokens()` hook |
| `src/components/neumorphic/Surface.tsx` | Create | Base sandwich-shadow primitive (iOS + Android + Web paths) |
| `src/components/neumorphic/index.ts` | Create | Barrel export for Phase 1+ primitives |
| `src/screens/__dev__/NeumorphicGallery.tsx` | Create | Dev-only visual smoke screen |
| `src/navigation/types.ts` | Modify | Add `NeumorphicGallery` route to `RootStackParamList` |
| `src/navigation/AppNavigator.tsx` | Modify | Register the gallery route behind `__DEV__` |
| `__tests__/theme/tokens.test.ts` | Create | Test `resolveColors` |
| `__tests__/theme/elevation.test.ts` | Create | Test `buildElevation` |

Tests target only pure helpers — the project's existing Jest setup (`testMatch: '**/__tests__/**/*.ts'`) does not include `.tsx` and there is no `@testing-library/react-native` dependency. Components are validated by `ts:check` plus the gallery screen on each platform. Adding component-test infrastructure is out of scope for Phase 0.

---

### Task 1: Design tokens + `resolveColors` helper

**Files:**
- Create: `src/theme/tokens.ts`
- Test: `__tests__/theme/tokens.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/theme/tokens.test.ts` with:

```ts
import {
  resolveColors,
  RADII,
  SPACING,
  TYPE,
  NEUMORPHIC_LIGHT,
  NEUMORPHIC_DARK,
  FLAT_LIGHT,
  FLAT_DARK,
} from '../../src/theme/tokens';

describe('resolveColors', () => {
  it('returns neumorphic light palette by default', () => {
    expect(resolveColors('neumorphic', false)).toBe(NEUMORPHIC_LIGHT);
  });

  it('returns neumorphic dark palette when isDark', () => {
    expect(resolveColors('neumorphic', true)).toBe(NEUMORPHIC_DARK);
  });

  it('returns flat light palette when style=flat and not dark', () => {
    expect(resolveColors('flat', false)).toBe(FLAT_LIGHT);
  });

  it('returns flat dark palette when style=flat and dark', () => {
    expect(resolveColors('flat', true)).toBe(FLAT_DARK);
  });
});

describe('design constants', () => {
  it('exposes pillowy radii', () => {
    expect(RADII).toEqual({ sm: 12, md: 18, lg: 24, pill: 999 });
  });

  it('exposes 4-pt spacing scale', () => {
    expect(SPACING).toEqual({ 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 });
  });

  it('exposes type sizes', () => {
    expect(TYPE).toEqual({ xs: 12, sm: 14, md: 16, lg: 18, xl: 22, '2xl': 28 });
  });

  it('keeps neumorphic surface equal to background (mono-tone rule)', () => {
    expect(NEUMORPHIC_LIGHT.surface).toBe(NEUMORPHIC_LIGHT.bg);
    expect(NEUMORPHIC_DARK.surface).toBe(NEUMORPHIC_DARK.bg);
  });

  it('preserves the existing flat palette colors used today', () => {
    expect(FLAT_LIGHT.bg).toBe('#f2f2f7');
    expect(FLAT_LIGHT.text).toBe('#1c1c1e');
    expect(FLAT_DARK.bg).toBe('#000000');
    expect(FLAT_DARK.text).toBe('#f2f2f7');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/theme/tokens.test.ts`
Expected: FAIL — `Cannot find module '../../src/theme/tokens'`.

- [ ] **Step 3: Implement `src/theme/tokens.ts`**

Create the file with this exact content:

```ts
export type ThemeStyle = 'neumorphic' | 'flat';

export interface Palette {
  bg: string;
  surface: string;
  highlight: string;
  shadow: string;
  text: string;
  textSecondary: string;
  accent: string;
  accentMuted: string;
  error: string;
  // Backwards-compat keys kept so existing screens keep compiling unchanged
  // during the migration. They map to the same values as the new tokens.
  background: string;
  surfaceSecondary: string;
  primary: string;
  border: string;
  card: string;
}

export const NEUMORPHIC_LIGHT: Palette = {
  bg: '#E0E5EC',
  surface: '#E0E5EC',
  highlight: '#FFFFFF',
  shadow: '#A3B1C6',
  text: '#2D3142',
  textSecondary: '#6B7280',
  accent: '#7B8CDE',
  accentMuted: '#A8B3E5',
  error: '#E07A7A',
  background: '#E0E5EC',
  surfaceSecondary: '#E0E5EC',
  primary: '#7B8CDE',
  border: '#A3B1C6',
  card: '#E0E5EC',
};

export const NEUMORPHIC_DARK: Palette = {
  bg: '#2A2D3A',
  surface: '#2A2D3A',
  highlight: '#353945',
  shadow: '#1F2129',
  text: '#E4E6EB',
  textSecondary: '#9097A6',
  accent: '#8B9BE8',
  accentMuted: '#5A6BB5',
  error: '#E07A7A',
  background: '#2A2D3A',
  surfaceSecondary: '#2A2D3A',
  primary: '#8B9BE8',
  border: '#1F2129',
  card: '#2A2D3A',
};

// Flat palettes preserve the exact colors the app shipped with before this
// migration so existing screens look identical when the user toggles
// "Flat" in Settings.
export const FLAT_LIGHT: Palette = {
  bg: '#f2f2f7',
  surface: '#ffffff',
  highlight: '#ffffff',
  shadow: '#000000',
  text: '#1c1c1e',
  textSecondary: '#6e6e73',
  accent: '#007AFF',
  accentMuted: '#5AC8FA',
  error: '#ff3b30',
  background: '#f2f2f7',
  surfaceSecondary: '#f2f2f7',
  primary: '#007AFF',
  border: '#c6c6c8',
  card: '#ffffff',
};

export const FLAT_DARK: Palette = {
  bg: '#000000',
  surface: '#1c1c1e',
  highlight: '#1c1c1e',
  shadow: '#000000',
  text: '#f2f2f7',
  textSecondary: '#8e8e93',
  accent: '#0a84ff',
  accentMuted: '#64d2ff',
  error: '#ff453a',
  background: '#000000',
  surfaceSecondary: '#2c2c2e',
  primary: '#0a84ff',
  border: '#38383a',
  card: '#2c2c2e',
};

export const RADII = { sm: 12, md: 18, lg: 24, pill: 999 } as const;
export type Radius = keyof typeof RADII;

export const SPACING = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 } as const;
export type SpacingKey = keyof typeof SPACING;

export const TYPE = { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, '2xl': 28 } as const;
export type TypeSize = keyof typeof TYPE;

export function resolveColors(style: ThemeStyle, isDark: boolean): Palette {
  if (style === 'flat') return isDark ? FLAT_DARK : FLAT_LIGHT;
  return isDark ? NEUMORPHIC_DARK : NEUMORPHIC_LIGHT;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/theme/tokens.test.ts`
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Run type check**

Run: `npm run ts:check`
Expected: clean exit (0).

- [ ] **Step 6: Commit**

```bash
git add src/theme/tokens.ts __tests__/theme/tokens.test.ts
git commit -m "feat(theme): add design tokens and resolveColors helper"
```

---

### Task 2: Elevation builder

**Files:**
- Create: `src/theme/elevation.ts`
- Test: `__tests__/theme/elevation.test.ts`

The elevation builder produces a *pair* of style objects — one for the outer view (dark drop shadow) and one for the inner view (light drop shadow) — for each platform. Inset reuses the same offsets but inverts which color goes where. Tests assert offsets / blur radii / colors match the spec for the three tiers.

- [ ] **Step 1: Write the failing test**

Create `__tests__/theme/elevation.test.ts`:

```ts
import { buildElevation } from '../../src/theme/elevation';
import { NEUMORPHIC_LIGHT } from '../../src/theme/tokens';

describe('buildElevation', () => {
  it('returns flat zero-shadow when style=flat', () => {
    const e = buildElevation({
      tier: 'raised',
      inset: false,
      style: 'flat',
      colors: NEUMORPHIC_LIGHT,
      platform: 'ios',
    });
    expect(e.outer).toEqual({});
    expect(e.inner).toEqual({});
  });

  it('builds raised tier on iOS with two opposing shadows', () => {
    const e = buildElevation({
      tier: 'raised',
      inset: false,
      style: 'neumorphic',
      colors: NEUMORPHIC_LIGHT,
      platform: 'ios',
    });
    expect(e.outer).toEqual({
      shadowColor: NEUMORPHIC_LIGHT.shadow,
      shadowOffset: { width: 4, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 8,
    });
    expect(e.inner).toEqual({
      shadowColor: NEUMORPHIC_LIGHT.highlight,
      shadowOffset: { width: -4, height: -4 },
      shadowOpacity: 1,
      shadowRadius: 8,
    });
  });

  it('builds subtle and floating tiers with the spec offsets/blurs', () => {
    const subtle = buildElevation({
      tier: 'subtle', inset: false, style: 'neumorphic',
      colors: NEUMORPHIC_LIGHT, platform: 'ios',
    });
    expect(subtle.outer.shadowOffset).toEqual({ width: 2, height: 2 });
    expect(subtle.outer.shadowRadius).toBe(4);

    const floating = buildElevation({
      tier: 'floating', inset: false, style: 'neumorphic',
      colors: NEUMORPHIC_LIGHT, platform: 'ios',
    });
    expect(floating.outer.shadowOffset).toEqual({ width: 8, height: 8 });
    expect(floating.outer.shadowRadius).toBe(16);
  });

  it('inverts shadow direction when inset=true', () => {
    const e = buildElevation({
      tier: 'raised', inset: true, style: 'neumorphic',
      colors: NEUMORPHIC_LIGHT, platform: 'ios',
    });
    // Inset = highlight comes from bottom-right, shadow from top-left
    expect(e.outer.shadowColor).toBe(NEUMORPHIC_LIGHT.highlight);
    expect(e.outer.shadowOffset).toEqual({ width: 4, height: 4 });
    expect(e.inner.shadowColor).toBe(NEUMORPHIC_LIGHT.shadow);
    expect(e.inner.shadowOffset).toEqual({ width: -4, height: -4 });
  });

  it('uses CSS box-shadow strings on web', () => {
    const e = buildElevation({
      tier: 'raised', inset: false, style: 'neumorphic',
      colors: NEUMORPHIC_LIGHT, platform: 'web',
    });
    expect(e.outer.boxShadow).toBe(
      `4px 4px 8px ${NEUMORPHIC_LIGHT.shadow}, -4px -4px 8px ${NEUMORPHIC_LIGHT.highlight}`,
    );
    expect(e.inner).toEqual({});
  });

  it('uses CSS inset box-shadow on web when inset=true', () => {
    const e = buildElevation({
      tier: 'raised', inset: true, style: 'neumorphic',
      colors: NEUMORPHIC_LIGHT, platform: 'web',
    });
    expect(e.outer.boxShadow).toBe(
      `inset 4px 4px 8px ${NEUMORPHIC_LIGHT.shadow}, inset -4px -4px 8px ${NEUMORPHIC_LIGHT.highlight}`,
    );
  });

  it('returns empty inner on android (sandwich uses overlay views, not native elevation)', () => {
    const e = buildElevation({
      tier: 'raised', inset: false, style: 'neumorphic',
      colors: NEUMORPHIC_LIGHT, platform: 'android',
    });
    // Android can't tint native elevation; Surface renders absolute overlay
    // views for the highlight/shadow pair instead. buildElevation only
    // surfaces the offsets so Surface knows where to place them.
    expect(e.outer).toEqual({});
    expect(e.inner).toEqual({});
    expect(e.androidOverlays).toEqual({
      offset: 4,
      blur: 8,
      highlight: NEUMORPHIC_LIGHT.highlight,
      shadow: NEUMORPHIC_LIGHT.shadow,
      inset: false,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/theme/elevation.test.ts`
Expected: FAIL — `Cannot find module '../../src/theme/elevation'`.

- [ ] **Step 3: Implement `src/theme/elevation.ts`**

Create the file with this exact content:

```ts
import { Palette, ThemeStyle } from './tokens';

export type ElevationTier = 'subtle' | 'raised' | 'floating';
export type Platform = 'ios' | 'android' | 'web';

interface TierSpec {
  offset: number;
  blur: number;
}

const TIERS: Record<ElevationTier, TierSpec> = {
  subtle: { offset: 2, blur: 4 },
  raised: { offset: 4, blur: 8 },
  floating: { offset: 8, blur: 16 },
};

export interface AndroidOverlays {
  offset: number;
  blur: number;
  highlight: string;
  shadow: string;
  inset: boolean;
}

export interface ElevationStyles {
  outer: Record<string, unknown>;
  inner: Record<string, unknown>;
  androidOverlays?: AndroidOverlays;
}

export interface BuildElevationArgs {
  tier: ElevationTier;
  inset: boolean;
  style: ThemeStyle;
  colors: Palette;
  platform: Platform;
}

export function buildElevation(args: BuildElevationArgs): ElevationStyles {
  const { tier, inset, style, colors, platform } = args;

  if (style === 'flat') {
    return { outer: {}, inner: {} };
  }

  const { offset, blur } = TIERS[tier];
  const darkColor = colors.shadow;
  const lightColor = colors.highlight;

  if (platform === 'ios') {
    // RN has no native inset shadow; approximate by swapping which side
    // gets the highlight vs shadow drop. Visual is acceptable at sm/md radii.
    const topLeftColor = inset ? darkColor : lightColor;
    const bottomRightColor = inset ? lightColor : darkColor;
    return {
      outer: {
        shadowColor: bottomRightColor,
        shadowOffset: { width: offset, height: offset },
        shadowOpacity: 1,
        shadowRadius: blur,
      },
      inner: {
        shadowColor: topLeftColor,
        shadowOffset: { width: -offset, height: -offset },
        shadowOpacity: 1,
        shadowRadius: blur,
      },
    };
  }

  if (platform === 'web') {
    // CSS `inset` keyword natively flips the shadow direction — no color swap.
    const insetPrefix = inset ? 'inset ' : '';
    const boxShadow =
      `${insetPrefix}${offset}px ${offset}px ${blur}px ${darkColor}, ` +
      `${insetPrefix}-${offset}px -${offset}px ${blur}px ${lightColor}`;
    return {
      outer: { boxShadow },
      inner: {},
    };
  }

  // Android: native elevation can't tint shadow color. Surface renders
  // absolute-positioned overlay views to fake the dual-color drop.
  return {
    outer: {},
    inner: {},
    androidOverlays: {
      offset,
      blur,
      highlight: lightColor,
      shadow: darkColor,
      inset,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/theme/elevation.test.ts`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Run full test suite + type check**

Run: `npm test && npm run ts:check`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/theme/elevation.ts __tests__/theme/elevation.test.ts
git commit -m "feat(theme): add cross-platform elevation builder"
```

---

### Task 3: Extend `ThemeContext` with style flag and tokens

**Files:**
- Modify: `src/contexts/ThemeContext.tsx`

This task adds the `style` field, `setStyle`, and a `tokens` shape to the context. Existing keys (`theme`, `isDark`, `setTheme`, `colors`) are preserved unchanged so every existing screen keeps compiling without edits.

There is no logic-only helper to TDD here — the new code is React state plumbing — so the validation gate is `ts:check` plus the gallery in Task 5. Behavior tests for the resolver functions already cover the substantive logic from Tasks 1 and 2.

- [ ] **Step 1: Replace the file with the extended version**

Open `src/contexts/ThemeContext.tsx` and replace its full contents with:

```tsx
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
      const [savedTheme, savedStyle] = await Promise.all([
        AsyncStorage.getItem(THEME_STORAGE_KEY),
        AsyncStorage.getItem(STYLE_STORAGE_KEY),
      ]);
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
```

- [ ] **Step 2: Run type check across the whole codebase**

Run: `npm run ts:check`
Expected: clean exit (0). Every existing usage of `useTheme().colors.background / surface / text / primary / border / card / shadow / error / textSecondary / surfaceSecondary` keeps resolving — those keys are still on `Palette`.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: all green (no test changes needed).

- [ ] **Step 4: Commit**

```bash
git add src/contexts/ThemeContext.tsx
git commit -m "feat(theme): add style flag, tokens, and useTokens hook"
```

---

### Task 4: `<Surface>` primitive

**Files:**
- Create: `src/components/neumorphic/Surface.tsx`
- Create: `src/components/neumorphic/index.ts`

`<Surface>` is the only place in the codebase that talks to `buildElevation`. Every Phase 1 primitive composes it.

- [ ] **Step 1: Create the barrel export**

Create `src/components/neumorphic/index.ts` with:

```ts
export { Surface } from './Surface';
export type { SurfaceProps } from './Surface';
```

- [ ] **Step 2: Implement the component**

Create `src/components/neumorphic/Surface.tsx` with this exact content:

```tsx
import React, { ReactNode, useMemo } from 'react';
import { Platform, StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { useTheme, useTokens } from '../../contexts/ThemeContext';
import {
  buildElevation,
  ElevationTier,
  Platform as TokenPlatform,
} from '../../theme/elevation';
import { Radius } from '../../theme/tokens';

export interface SurfaceProps {
  elevation?: ElevationTier | 'flat';
  inset?: boolean;
  radius?: Radius;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  testID?: string;
}

function detectPlatform(): TokenPlatform {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

export function Surface(props: SurfaceProps) {
  const { elevation = 'raised', inset = false, radius = 'md', style, children, testID } = props;
  const { style: themeStyle } = useTheme();
  const { colors, radii } = useTokens();
  const platform = detectPlatform();

  const elevationStyles = useMemo(() => {
    if (elevation === 'flat') {
      return { outer: {}, inner: {} };
    }
    return buildElevation({
      tier: elevation,
      inset,
      style: themeStyle,
      colors,
      platform,
    });
  }, [elevation, inset, themeStyle, colors, platform]);

  const borderRadius = radii[radius];
  const baseStyle: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius,
  };

  // Android dual-color shadow can't use native elevation. Render four
  // absolutely-positioned overlay views to fake the highlight/shadow pair.
  const androidOverlays = elevationStyles.androidOverlays;
  const showOverlays = platform === 'android' && androidOverlays !== undefined;

  return (
    <View
      testID={testID}
      style={[baseStyle, elevationStyles.outer as ViewStyle, style]}
    >
      <View style={[StyleSheet.absoluteFill, { borderRadius }, elevationStyles.inner as ViewStyle]} pointerEvents="none" />
      {showOverlays && (
        <AndroidShadowOverlays
          offset={androidOverlays!.offset}
          blur={androidOverlays!.blur}
          highlight={androidOverlays!.highlight}
          shadow={androidOverlays!.shadow}
          inset={androidOverlays!.inset}
          radius={borderRadius}
        />
      )}
      <View style={{ borderRadius, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}

interface AndroidOverlayProps {
  offset: number;
  blur: number;
  highlight: string;
  shadow: string;
  inset: boolean;
  radius: number;
}

function AndroidShadowOverlays(props: AndroidOverlayProps) {
  const { offset, blur, highlight, shadow, inset, radius } = props;
  // Outset: highlight overlay shifted up-left, shadow overlay shifted down-right
  // Inset:  swap, and clip overlays inside the surface
  const topLeftColor = inset ? shadow : highlight;
  const bottomRightColor = inset ? highlight : shadow;
  const drift = offset;
  const spread = blur;

  return (
    <>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -drift,
          left: -drift,
          right: drift,
          bottom: drift,
          backgroundColor: topLeftColor,
          opacity: 0.55,
          borderRadius: radius + spread / 2,
          zIndex: -1,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: drift,
          left: drift,
          right: -drift,
          bottom: -drift,
          backgroundColor: bottomRightColor,
          opacity: 0.55,
          borderRadius: radius + spread / 2,
          zIndex: -1,
        }}
      />
    </>
  );
}
```

- [ ] **Step 3: Run type check**

Run: `npm run ts:check`
Expected: clean exit (0).

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/components/neumorphic/Surface.tsx src/components/neumorphic/index.ts
git commit -m "feat(ui): add Surface neumorphic primitive (cross-platform)"
```

---

### Task 5: Dev gallery screen

**Files:**
- Create: `src/screens/__dev__/NeumorphicGallery.tsx`
- Modify: `src/navigation/types.ts`
- Modify: `src/navigation/AppNavigator.tsx`

The gallery is the visual smoke test for `<Surface>` on iOS / Android / Web. It renders every elevation tier × every radius × outset and inset, plus a style toggle. Reachable only in dev builds via the route `NeumorphicGallery`. Deep link: `gitnotes://__dev__/neumorphic`.

- [ ] **Step 1: Create the gallery**

Create `src/screens/__dev__/NeumorphicGallery.tsx` with this exact content:

```tsx
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Surface } from '../../components/neumorphic';
import { useTheme, useTokens } from '../../contexts/ThemeContext';
import { ElevationTier } from '../../theme/elevation';
import { Radius } from '../../theme/tokens';

const TIERS: ElevationTier[] = ['subtle', 'raised', 'floating'];
const RADII_KEYS: Radius[] = ['sm', 'md', 'lg', 'pill'];

export default function NeumorphicGallery() {
  const { style, setStyle, isDark, setTheme, theme } = useTheme();
  const { colors, spacing, type } = useTokens();

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={{ padding: spacing[4], gap: spacing[5] }}>
        <Text style={{ color: colors.text, fontSize: type['2xl'], fontWeight: '700' }}>
          Neumorphic Gallery
        </Text>

        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          <TouchableOpacity
            onPress={() => setStyle(style === 'flat' ? 'neumorphic' : 'flat')}
          >
            <Surface elevation="raised" radius="pill" style={{ paddingVertical: spacing[2], paddingHorizontal: spacing[4] }}>
              <Text style={{ color: colors.text }}>Style: {style}</Text>
            </Surface>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            <Surface elevation="raised" radius="pill" style={{ paddingVertical: spacing[2], paddingHorizontal: spacing[4] }}>
              <Text style={{ color: colors.text }}>Mode: {isDark ? 'dark' : 'light'}</Text>
            </Surface>
          </TouchableOpacity>
        </View>

        <Section title="Outset elevation tiers">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[4] }}>
            {TIERS.map((t) => (
              <Surface key={t} elevation={t} radius="md" style={styles.swatch}>
                <Text style={{ color: colors.text }}>{t}</Text>
              </Surface>
            ))}
          </View>
        </Section>

        <Section title="Inset (pressed)">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[4] }}>
            {TIERS.map((t) => (
              <Surface key={t} elevation={t} inset radius="md" style={styles.swatch}>
                <Text style={{ color: colors.text }}>{t}</Text>
              </Surface>
            ))}
          </View>
        </Section>

        <Section title="Radii">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[4] }}>
            {RADII_KEYS.map((r) => (
              <Surface key={r} elevation="raised" radius={r} style={styles.swatch}>
                <Text style={{ color: colors.text }}>{r}</Text>
              </Surface>
            ))}
          </View>
        </Section>

        <Section title="Accent swatch">
          <Surface elevation="raised" radius="lg" style={{ padding: spacing[4] }}>
            <View style={{ flexDirection: 'row', gap: spacing[3], alignItems: 'center' }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accent }} />
              <Text style={{ color: colors.text }}>accent {colors.accent}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing[3], alignItems: 'center', marginTop: spacing[2] }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accentMuted }} />
              <Text style={{ color: colors.text }}>accentMuted {colors.accentMuted}</Text>
            </View>
          </Surface>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  const { colors, spacing, type } = useTokens();
  return (
    <View style={{ gap: spacing[3] }}>
      <Text style={{ color: colors.textSecondary, fontSize: type.sm, textTransform: 'uppercase', letterSpacing: 1 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  swatch: { width: 96, height: 64, alignItems: 'center', justifyContent: 'center' },
});
```

- [ ] **Step 2: Add the route to `RootStackParamList`**

Open `src/navigation/types.ts`. Replace the file with:

```ts
export type RootStackParamList = {
  MainTabs: undefined;
  NoteEditor: { noteId?: string; format?: 'markdown' | 'neorg' | 'org'; initialTitle?: string; initialContent?: string; repo?: string; branch?: string; folderPath?: string };
  NoteViewer: { noteId: string };
  PdfViewer: { owner: string; repo: string; branch?: string; path: string; title?: string };
  FileViewer: { owner: string; repo: string; branch?: string; path: string; title?: string; size?: number };
  ImageViewer: { owner: string; repo: string; branch?: string; path: string; title?: string; size?: number };
  VideoViewer: { owner: string; repo: string; branch?: string; path: string; title?: string; size?: number };
  CanvasEditor: { canvasId?: string; canvasWidth?: number; canvasHeight?: number; canvasTitle?: string };
  CanvasList: undefined;
  NeumorphicGallery: undefined;
};

export type BottomTabParamList = {
  HomeTab: undefined;
  NotesTab: undefined;
  ExploreTab: undefined;
  TodosTab: undefined;
  SettingsTab: undefined;
};

export type Note = {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  tags?: string[];
  repo?: string;
  branch?: string;
  commit?: string;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
```

- [ ] **Step 3: Register the gallery route in `AppNavigator`**

Open `src/navigation/AppNavigator.tsx`. After the `import VideoViewerScreen from '../screens/VideoViewerScreen';` line, add:

```tsx
import NeumorphicGallery from '../screens/__dev__/NeumorphicGallery';
```

In the `linking.config.screens` object, add the deep link entry alongside the existing routes:

```tsx
NeumorphicGallery: '__dev__/neumorphic',
```

So the resulting `screens` block reads:

```tsx
screens: {
  MainTabs: {
    screens: {
      HomeTab: 'home',
      NotesTab: 'notes',
      ExploreTab: 'explore',
      SettingsTab: 'settings',
    },
  },
  NoteEditor: 'note/:noteId',
  CanvasEditor: 'canvas/:canvasId',
  CanvasList: 'canvases',
  NeumorphicGallery: '__dev__/neumorphic',
},
```

Finally, inside the `<Stack.Navigator>` JSX, after the `<Stack.Screen name="VideoViewer" ... />` block, add this gated screen:

```tsx
{__DEV__ && (
  <Stack.Screen
    name="NeumorphicGallery"
    component={NeumorphicGallery}
    options={{ headerShown: true, title: 'Neumorphic Gallery' }}
  />
)}
```

- [ ] **Step 4: Run type check**

Run: `npm run ts:check`
Expected: clean exit (0).

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/screens/__dev__/NeumorphicGallery.tsx src/navigation/types.ts src/navigation/AppNavigator.tsx
git commit -m "feat(ui): add dev-only NeumorphicGallery for visual smoke testing"
```

---

### Task 6: Cross-platform visual validation gate

This is the human-in-the-loop QA step that validates the sandwich-shadow strategy works on every target before Phase 1 builds primitives on top of it. No code changes unless something is broken; in that case, fix and re-commit.

- [ ] **Step 1: iOS simulator check**

Run:

```bash
npm run ios
```

Once the app boots, open Safari → Develop menu → choose the simulator → trigger the deep link by running this in a separate terminal:

```bash
xcrun simctl openurl booted gitnotes://__dev__/neumorphic
```

Visually verify in the simulator:
- All three outset tiers (`subtle` / `raised` / `floating`) show a clear soft shadow pair (white top-left, slate bottom-right)
- All three inset tiers visibly look "pressed in"
- Each radius (12 / 18 / 24 / 999) renders without clipping the shadow
- Style toggle flips palette + shadows instantly with no flicker
- Mode toggle (light ↔ dark) flips both palettes; dark neumorphic uses slate `#2A2D3A`, not pure black

If anything looks wrong, debug `Surface.tsx` or `elevation.ts`, re-run the test suite, and commit the fix with `fix(ui): <description>`.

- [ ] **Step 2: Android emulator check**

Run:

```bash
npm run android
```

Trigger the deep link:

```bash
adb shell am start -W -a android.intent.action.VIEW -d "gitnotes://__dev__/neumorphic"
```

Verify the same checklist as iOS. Pay particular attention to:
- Highlight + shadow overlay views actually render (Android can't tint native elevation; the `AndroidShadowOverlays` overlays are doing the work)
- Inset surfaces still read as "carved in" — overlays should not visibly extend past the rounded corners

If overlays look wrong, tune the `opacity`, `borderRadius` adjustment, or absolute offsets inside `AndroidShadowOverlays` and commit the fix.

- [ ] **Step 3: Web build check**

Run:

```bash
npm run web
```

Open the URL printed by Expo (e.g. `http://localhost:8081`). Append `/__dev__/neumorphic` to the path or use the deep-link pattern your route configuration accepts.

Verify:
- CSS `box-shadow` renders both shadows (light top-left, dark bottom-right)
- Inset shadows use `inset` keyword — surface visibly depressed
- Browser DevTools shows no console errors related to unknown style props (`shadowColor` / `shadowOffset` are silently dropped on web — that's fine, the `boxShadow` style takes over)

- [ ] **Step 4: Final commit if any tweaks landed**

If Steps 1–3 required visual tuning, commit each fix as it lands. If nothing needed changing, no commit is required for this step — Phase 0 is complete after the previous five tasks.

- [ ] **Step 5: Push branch + update PR**

```bash
git push origin feat/neumorphism-ui
```

The existing PR (`#214`) automatically picks up the new commits. Add a short comment to the PR summarizing platform validation results:

```bash
gh pr comment 214 --body "Phase 0 foundations landed and visually validated on iOS sim, Android emulator, and web. Ready for Phase 1 (primitives)."
```

---

## Definition of Done

- [ ] All six tasks above are committed on `feat/neumorphism-ui`
- [ ] `npm run ts:check` clean
- [ ] `npm test` all green
- [ ] Gallery screen renders correctly on iOS sim, Android emulator, web build
- [ ] Style toggle on the gallery flips between neumorphic and flat with no errors
- [ ] PR `#214` updated with a comment confirming platform validation
- [ ] No end-user-visible changes outside the dev-only gallery (existing screens still render flat)
