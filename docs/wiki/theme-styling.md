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
  "nativewind": "^5.0.3",
  "tailwindcss": "^3.4.1",
  "react-native-css-interop": "^0.1.3"
}
```

### Tailwind Config

```javascript
// tailwind.config.js

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Light theme
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        background: 'rgb(var(--color-background) / <alpha-value>)',
        card: 'rgb(var(--color-card) / <alpha-value>)',
        text: 'rgb(var(--color-text) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
```

### Global CSS

```css
/* global.css */

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --color-primary: 59 130 246;      /* blue-500 */
    --color-background: 255 255 255;  /* white */
    --color-card: 249 250 251;        /* gray-50 */
    --color-text: 17 24 39;           /* gray-900 */
    --color-border: 229 231 235;      /* gray-200 */
  }

  .dark {
    --color-primary: 96 165 250;      /* blue-400 */
    --color-background: 17 24 39;     /* gray-900 */
    --color-card: 31 41 55;           /* gray-800 */
    --color-text: 243 244 246;        /* gray-100 */
    --color-border: 55 65 81;         /* gray-700 */
  }
}
```

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

### Colors

```typescript
// src/theme/tokens.ts

export const colors = {
  light: {
    primary: '#3B82F6',
    background: '#FFFFFF',
    card: '#F9FAFB',
    text: '#111827',
    border: '#E5E7EB',
    muted: '#6B7280',
    accent: '#8B5CF6',
  },
  dark: {
    primary: '#60A5FA',
    background: '#111827',
    card: '#1F2937',
    text: '#F3F4F6',
    border: '#374151',
    muted: '#9CA3AF',
    accent: '#A78BFA',
  },
};
```

### Spacing

```typescript
export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
};
```

### Typography

```typescript
export const typography = {
  fontFamily: {
    sans: 'Inter',
    mono: 'JetBrains Mono',
  },
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
};
```

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

```bash
# Check tailwind.config.js content paths
# Should include: './src/**/*.{js,jsx,ts,tsx}'
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
