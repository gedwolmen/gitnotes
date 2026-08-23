# Theme & Styling

> NativeWind v5, theme tokens, dark mode.

## Overview

GitNotēs uses **NativeWind v5** (Tailwind CSS for React Native) with custom theme tokens. Supports **light/dark/system** modes.

## UI styles

Two visual styles, persisted under `@gitnotes:style` (`ThemeContext.readBootStyle`):

- **`flat`** (classic look) — default for fresh installs. Fancy UI (neumorphic) is a pro-gated feature, so free users get the flat style unless they upgrade.
- **`neumorphic`** ("Fancy UI") — soft-UI shadows. Pro-only: the toggle in Settings is locked for free users and routes to the paywall (`settings.row.updated-ui`).

## Architecture

```
NativeWind (Tailwind)
  ↓
theme/tokens.ts (design tokens)
  ↓
ThemeContext.tsx (React context)
  ↓
Components (className prop)
```

## Setup

### Dependencies

```json
{
  "nativewind": "^5.0.0-preview.4",
  "tailwindcss": "^4.3.3",
  "react-native-css": "^3.0.7",
  "@tailwindcss/postcss": "^4.3.3"
}
```

Tailwind v4 uses **CSS-based config** — there is no `tailwind.config.js`. Tokens are declared inside an `@theme { … }` block in `global.css`, and the PostCSS pipeline is wired by `postcss.config.js` (`@tailwindcss/postcss`). NativeWind v5's preset/theme is imported once at the top of `global.css`.

### PostCSS config

```javascript
// postcss.config.js

module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

### Global CSS

```css
/* global.css */

@import 'tailwindcss/theme.css' layer(theme);
@import 'tailwindcss/preflight.css' layer(base);
@import 'tailwindcss/utilities.css';
@import 'nativewind/theme';

@theme {
  --color-bg: #f2f2f2;
  --color-surface: #ffffff;
  --color-highlight: #ffffff;
  --color-shadow: #bfbfbf;
  --color-text: #1c1c1e;
  --color-text-secondary: #6e6e73;
  --color-accent: #7b8cde;
  --color-accent-muted: #a8b3e5;
  --color-error: #e07a7a;

  --color-background: #f2f2f2;
  --color-surface-secondary: #f5f5f5;
  --color-primary: #7b8cde;
  --color-border: #d8d8d8;
  --color-card: #ffffff;
  --color-elevated: #ffffff;
  --color-secondary: #f5f5f5;
  --color-foreground: #1c1c1e;
  --color-muted: #f5f5f5;
  --color-muted-foreground: #6e6e73;
  --color-destructive: #e07a7a;

  --spacing: 4px;
  --spacing-1: 4px;
  --spacing-2: 8px;
  --spacing-3: 12px;
  --spacing-4: 16px;
  --spacing-5: 20px;
  --spacing-6: 24px;
  --spacing-8: 32px;

  --radius-sm: 12px;
  --radius-md: 18px;
  --radius-lg: 24px;
  --radius-pill: 999px;
}

.dark {
  --color-bg: #1c1c1e;
  --color-surface: #2c2c2e;
  --color-highlight: #3a3a3c;
  --color-shadow: #000000;
  --color-text: #f2f2f2;
  --color-text-secondary: #98989d;
  --color-background: #1c1c1e;
  --color-surface-secondary: #2c2c2e;
  --color-card: #2c2c2e;
  --color-elevated: #3a3a3c;
  --color-secondary: #2c2c2e;
  --color-foreground: #f2f2f2;
  --color-muted: #2c2c2e;
  --color-muted-foreground: #98989d;
  --color-border: #3a3a3c;
}
```

See the real `global.css` for the full token list (spacing, radius, typography).

## Theme Context

```typescript
// src/contexts/ThemeContext.tsx

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: 'system',
  setMode: () => {},
  isDark: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>('system');

  const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');

  useEffect(() => {
    // Persist to AsyncStorage
    StorageService.set('themeMode', mode);
  }, [mode]);

  useEffect(() => {
    // Load from AsyncStorage
    StorageService.get<string>('themeMode').then(saved => {
      if (saved) setMode(saved as ThemeMode);
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, setMode, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
```

## Usage

### In Components

```typescript
import { View, Text } from 'react-native';

function NoteCard({ title }: { title: string }) {
  return (
    <View className="bg-card p-4 rounded-lg border border-border">
      <Text className="text-text text-lg font-semibold">{title}</Text>
    </View>
  );
}
```

### Conditional Classes

```typescript
import { cn } from '../../lib/utils';

function Button({ variant = 'primary', children }: ButtonProps) {
  return (
    <Pressable
      className={cn(
        'px-4 py-2 rounded-lg',
        variant === 'primary' && 'bg-primary text-white',
        variant === 'secondary' && 'bg-card text-text border border-border',
      )}
    >
      <Text>{children}</Text>
    </Pressable>
  );
}
```

### Dark Mode Variants

```typescript
function SettingsRow({ label }: { label: string }) {
  return (
    <View className="bg-white dark:bg-gray-900 p-4">
      <Text className="text-black dark:text-white">{label}</Text>
    </View>
  );
}
```

## Design Tokens

Tokens live in `global.css` under `@theme { … }` (Tailwind v4 CSS config). NativeWind reads them as Tailwind classes: `bg-primary`, `text-foreground`, `border-border`, `rounded-lg`, etc.

### Spacing scale

The app uses a 4px-based spacing scale declared in `global.css`:

```css
@theme {
  --spacing: 4px;
  --spacing-1: 4px;
  --spacing-2: 8px;
  --spacing-3: 12px;
  --spacing-4: 16px;
  --spacing-5: 20px;
  --spacing-6: 24px;
  --spacing-8: 32px;
}
```

### Radius scale

```css
@theme {
  --radius-sm: 12px;
  --radius-md: 18px;
  --radius-lg: 24px;
  --radius-pill: 999px;
}
```

### Color tokens

All semantic colors (`primary`, `background`, `card`, `surface`, `border`, `text`, `foreground`, `muted`, `muted-foreground`, `accent`, `destructive`, …) are declared as `--color-*` in `@theme` and overridden under `.dark` for dark mode. See `global.css` for the canonical list — light + dark values live there.

## Component Examples

### Card

```typescript
function Card({ children }: { children: React.ReactNode }) {
  return (
    <View className="bg-card rounded-xl border border-border p-4 shadow-sm">
      {children}
    </View>
  );
}
```

### Button

```typescript
function Button({ variant, children, onPress }: ButtonProps) {
  return (
    <Pressable
      className={cn(
        'px-6 py-3 rounded-lg active:opacity-80',
        variant === 'primary' && 'bg-primary text-white',
        variant === 'secondary' && 'bg-card text-text border border-border',
        variant === 'ghost' && 'bg-transparent text-text',
      )}
      onPress={onPress}
    >
      <Text className="font-semibold">{children}</Text>
    </Pressable>
  );
}
```

### Input

```typescript
function Input({ placeholder, value, onChangeText }: InputProps) {
  return (
    <TextInput
      className="bg-card border border-border rounded-lg px-4 py-3 text-text"
      placeholder={placeholder}
      placeholderTextColor="text-muted"
      value={value}
      onChangeText={onChangeText}
    />
  );
}
```

## Theme Switching

### Settings Screen

```typescript
function ThemeSelector() {
  const { mode, setMode } = useTheme();

  return (
    <View className="flex-row gap-4">
      {(['light', 'dark', 'system'] as const).map(m => (
        <Button
          key={m}
          variant={mode === m ? 'primary' : 'secondary'}
          onPress={() => setMode(m)}
        >
          {m.charAt(0).toUpperCase() + m.slice(1)}
        </Button>
      ))}
    </View>
  );
}
```

## Testing

```typescript
// __tests__/theme-styling.test.tsx

import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../src/contexts/ThemeContext';

describe('Theme', () => {
  it('renders in light mode', () => {
    const { getByText } = render(
      <ThemeProvider>
        <Text className="text-black">Light</Text>
      </ThemeProvider>
    );
    expect(getByText('Light')).toBeTruthy();
  });

  it('switches to dark mode', async () => {
    const { getByText } = render(
      <ThemeProvider initialMode="dark">
        <Text className="text-white">Dark</Text>
      </ThemeProvider>
    );
    expect(getByText('Dark')).toBeTruthy();
  });
});
```

## Troubleshooting

### Styles not applying

```bash
# Clear Metro cache
yarn start --clear

# Reinstall NativeWind
rm -rf node_modules/nativewind
yarn install
```

### Dark mode not working

```typescript
// Ensure ThemeProvider wraps root
<App>
  <ThemeProvider>
    <YourApp />
  </ThemeProvider>
</App>
```

### Tailwind classes not recognized

Tailwind v4 uses **CSS-based config** — there is no `tailwind.config.js`. Tokens live in `global.css` under `@theme { … }`. If a class isn't applying:

```bash
# Confirm the @tailwindcss/postcss plugin is wired
cat postcss.config.js    # should list '@tailwindcss/postcss'

# Confirm global.css imports nativewind/theme
head -5 global.css       # should include @import 'nativewind/theme';

# Reset Metro + transform cache
yarn start --clear
```

### Button label centering with trailing icons

The shared `Button` component centers its label optically even when a
`trailingIcon` is present. Two layout modes are controlled by the
`iconAlign` prop:

- **`iconAlign="edge"`** (for wide/`fullWidth` buttons): the icon is
  absolutely pinned to the right edge (`absolute right-5`) and the label is
  wrapped in a row with equal-width spacers on both sides, so the text stays
  at the button's true center instead of shifting left to make room for the
  icon. Used by the onboarding "Next"/"Connect" buttons and the settings
  save-token button.
- **`iconAlign="inline"`** (default): the trailing icon renders in the flex
  row next to the label with a gap. Required for narrow buttons (e.g. the
  editor header "Save" button) where the absolutely-pinned icon would overlap
  the label text — this was the save-spinner-overlaps-text bug.

`fullWidth` buttons stretch the entire `Pressable → Surface → content` chain
(`alignSelf: 'stretch'`) so `justify-center` centers against the actual
button width. See `src/components/ui/Button.tsx` and
`__tests__/ui/Button.test.tsx`.

### Bottom-sheet modals must lift above the keyboard

`src/components/ui/Modal.tsx` (`bottomSheet` variant) wraps the sheet slot in a
`KeyboardAvoidingView` (`behavior="padding"` on iOS) so the whole sheet rises
above the soft keyboard. This is the single place that handles keyboard
avoidance for bottom sheets — the sheet is anchored to the screen bottom, so a
`KeyboardAvoidingView` placed *inside* a sheet can only compress its own
scroll area and can never lift the sheet itself; the token/URL inputs in
`ConnectHostModal` and the Settings token modal were hidden by the keyboard
before the slot was made keyboard-aware. Do NOT re-add per-modal
`KeyboardAvoidingView`s around sheet content — the sheet slot already handles
it, and nesting them causes a transient double-pad. Callers should keep
`keyboardShouldPersistTaps="handled"` on their `ScrollView`s.

### Single-line Input descender clipping

The shared `Input`'s `TextInput` keeps a small vertical padding
(`paddingVertical: 2`) instead of `0`. With zero padding, iOS renders the
single-line text/placeholder box at exactly the font line height and clips
glyph descenders — the "g" in the tag editor's "Add tags..." placeholder was
getting cut off at the bottom. The tag input row also carries 16px of
horizontal padding so it aligns with the other NoteEditor form rows (title,
folder, format). See `src/components/ui/Input.tsx` and
`src/components/TagInput.tsx`.

### Hairline border gotcha

`borderWidth: StyleSheet.hairlineWidth` sets the width on **all four sides**.
If only `borderTopColor` is set, the other three sides fall back to React
Native's default black border — e.g. the Explore repo-detail branch row
rendered with a black box outline around the branch name. Prefer the
`border-t` NativeWind class (top border only) plus an explicit
`borderTopColor`, and only use `borderWidth` when `borderColor` is also set.
See `src/screens/ExploreScreen.tsx`.
