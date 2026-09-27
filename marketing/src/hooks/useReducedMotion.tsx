/**
 * Marketing Composition Package - Reduced Motion Hook
 *
 * Detects and responds to the reduced motion preference.
 * Uses Motion's useReducedMotion for animation control.
 */

import { useReducedMotion as useMotionReducedMotion, MotionConfig } from 'motion/react';
import { useState, useEffect, type ReactNode } from 'react';

// ------------------------------------------------------------------------------------------------
// Reduced Motion State
// ------------------------------------------------------------------------------------------------

export interface ReducedMotionState {
  /** Whether motion should be reduced */
  shouldReduceMotion: boolean;
  /** Source of the preference (user, system, or manual) */
  source: 'user' | 'system' | 'manual' | 'unknown';
}

// ------------------------------------------------------------------------------------------------
// Hook
// ------------------------------------------------------------------------------------------------

/**
 * Hook to detect reduced motion preference.
 * Combines Motion's detection with manual override capability.
 */
export function useReducedMotion(): ReducedMotionState {
  const systemReducedMotion = useMotionReducedMotion();

  const [manualOverride, setManualOverride] = useState<boolean | null>(null);

  // Check for manual override in localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('gitnotes-reduce-motion');
      if (stored !== null) {
        setManualOverride(stored === 'true');
      }
    } catch {
      // localStorage not available
    }
  }, []);

  if (manualOverride !== null) {
    return {
      shouldReduceMotion: manualOverride,
      source: 'manual',
    };
  }

  return {
    shouldReduceMotion: systemReducedMotion ?? false,
    source: 'user', // Motion's useReducedMotion respects user preference
  };
}

// ------------------------------------------------------------------------------------------------
// Provider Wrapper
// ------------------------------------------------------------------------------------------------

interface ReducedMotionProviderProps {
  children: ReactNode;
  /** Override the reduced motion setting */
  reducedMotion?: boolean;
}

/**
 * Provider component for reduced motion configuration.
 * Wraps children in MotionConfig with appropriate settings.
 */
export function ReducedMotionProvider({ children, reducedMotion }: ReducedMotionProviderProps): JSX.Element {
  return (
    <MotionConfig reducedMotion={reducedMotion !== undefined ? (reducedMotion ? 'user' : 'never') : 'user'}>
      {children}
    </MotionConfig>
  );
}

// ------------------------------------------------------------------------------------------------
// Safe Animation Variants
// ------------------------------------------------------------------------------------------------

/**
 * Get animation variants that respect reduced motion.
 * When reduced motion is on, animations use opacity only.
 */
export function getMotionVariants<T extends Record<string, unknown>>(
  reducedMotion: boolean,
  fullVariants: T,
  minimalVariants: Partial<Record<keyof T, { opacity: number }>>
): T {
  if (reducedMotion) {
    return Object.entries(minimalVariants).reduce(
      (acc, [key, value]) => {
        acc[key as keyof T] = value as T[keyof T];
        return acc;
      },
      {} as T
    );
  }
  return fullVariants;
}

/**
 * Standard reduced-motion-safe animation duration.
 */
export const REDUCED_MOTION_DURATION = 0.3; // seconds

/**
 * Standard reduced-motion-safe spring config.
 */
export const REDUCED_MOTION_SPRING = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
};
