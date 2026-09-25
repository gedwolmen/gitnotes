import { useState, useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Returns `true` when the system or OS-level "Reduce Motion" accessibility
 * preference is enabled.  Components should skip decorative animations
 * (scale, parallax, slide) and replace them with instant state changes or
 * opacity-only transitions when this value is `true`.
 *
 * The returned value is stable for the lifetime of the component — the
 * effect runs once on mount and updates if the OS setting changes at runtime.
 */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled: boolean) => {
        if (!cancelled) {
          setReducedMotion(enabled);
        }
      })
      .catch(() => {
        // Graceful fallback: if the API fails (unsupported platform, etc.)
        // we assume motion is allowed rather than disabling it.
        if (!cancelled) {
          setReducedMotion(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return reducedMotion;
}
