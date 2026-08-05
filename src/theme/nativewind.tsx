import { type ReactNode, useMemo } from 'react';
import { VariableContextProvider } from 'nativewind';

import { useTokens, type Tokens } from '../contexts/ThemeContext';

type CssVariableName = `--${string}`;

export const NATIVEWIND_TOKEN_VARIABLES = {
  colors: {
    bg: '--color-bg',
    surface: '--color-surface',
    highlight: '--color-highlight',
    shadow: '--color-shadow',
    text: '--color-text',
    textSecondary: '--color-text-secondary',
    accent: '--color-accent',
    accentMuted: '--color-accent-muted',
    error: '--color-error',
    background: '--color-background',
    surfaceSecondary: '--color-surface-secondary',
    primary: '--color-primary',
    border: '--color-border',
    card: '--color-card',
    elevated: '--color-elevated',
  } satisfies Record<keyof Tokens['colors'], CssVariableName>,
  radii: {
    sm: '--radius-sm',
    md: '--radius-md',
    lg: '--radius-lg',
    pill: '--radius-pill',
  } satisfies Record<keyof Tokens['radii'], CssVariableName>,
  spacing: {
    1: '--spacing-1',
    2: '--spacing-2',
    3: '--spacing-3',
    4: '--spacing-4',
    5: '--spacing-5',
    6: '--spacing-6',
    8: '--spacing-8',
  } satisfies Record<keyof Tokens['spacing'], CssVariableName>,
  type: {
    xs: '--text-xs',
    sm: '--text-sm',
    md: '--text-md',
    lg: '--text-lg',
    xl: '--text-xl',
    '2xl': '--text-2xl',
  } satisfies Record<keyof Tokens['type'], CssVariableName>,
} as const;

function pixels(value: number): `${number}px` {
  return `${value}px`;
}

export function createNativeWindThemeVariables(tokens: Tokens) {
  return {
    '--color-bg': tokens.colors.bg,
    '--color-surface': tokens.colors.surface,
    '--color-highlight': tokens.colors.highlight,
    '--color-shadow': tokens.colors.shadow,
    '--color-text': tokens.colors.text,
    '--color-text-secondary': tokens.colors.textSecondary,
    '--color-accent': tokens.colors.accent,
    '--color-accent-muted': tokens.colors.accentMuted,
    '--color-error': tokens.colors.error,
    '--color-background': tokens.colors.background,
    '--color-surface-secondary': tokens.colors.surfaceSecondary,
    '--color-primary': tokens.colors.primary,
    '--color-border': tokens.colors.border,
    '--color-card': tokens.colors.card,
    '--color-elevated': tokens.colors.elevated,
    '--color-secondary': tokens.colors.surfaceSecondary,
    '--color-foreground': tokens.colors.text,
    '--color-muted': tokens.colors.surfaceSecondary,
    '--color-muted-foreground': tokens.colors.textSecondary,
    '--color-destructive': tokens.colors.error,
    '--spacing': pixels(tokens.spacing[1]),
    '--spacing-1': pixels(tokens.spacing[1]),
    '--spacing-2': pixels(tokens.spacing[2]),
    '--spacing-3': pixels(tokens.spacing[3]),
    '--spacing-4': pixels(tokens.spacing[4]),
    '--spacing-5': pixels(tokens.spacing[5]),
    '--spacing-6': pixels(tokens.spacing[6]),
    '--spacing-8': pixels(tokens.spacing[8]),
    '--radius-sm': pixels(tokens.radii.sm),
    '--radius-md': pixels(tokens.radii.md),
    '--radius-lg': pixels(tokens.radii.lg),
    '--radius-pill': pixels(tokens.radii.pill),
    '--text-xs': pixels(tokens.type.xs),
    '--text-sm': pixels(tokens.type.sm),
    '--text-md': pixels(tokens.type.md),
    '--text-base': pixels(tokens.type.md),
    '--text-lg': pixels(tokens.type.lg),
    '--text-xl': pixels(tokens.type.xl),
    '--text-2xl': pixels(tokens.type['2xl']),
  } as const;
}

export function useNativeWindThemeVariables() {
  const tokens = useTokens();
  return useMemo(() => createNativeWindThemeVariables(tokens), [tokens]);
}

interface NativeWindThemeProviderProps {
  readonly children: ReactNode;
}

export function NativeWindThemeProvider({ children }: NativeWindThemeProviderProps) {
  const variables = useNativeWindThemeVariables();
  return <VariableContextProvider value={variables}>{children}</VariableContextProvider>;
}
