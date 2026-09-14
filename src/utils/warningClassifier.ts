/**
 * Warning Classifier Utility
 *
 * Deterministic classifier for iOS runner warnings that separates:
 * - DOCUMENT: Documented external/framework/SDK warnings (allowlisted)
 * - TARGET: App-owned warnings that should fail the classifier
 *
 * This utility is used in tests to verify that only documented external warnings
 * are present in the runner output, and no app-owned target warnings remain.
 *
 * The classifier does NOT monkey-patch console.warn globally - it is a pure
 * function that can be used in test assertions.
 */

/**
 * Warning ownership categories
 */
export type WarningCategory =
  /** Documented framework/iOS native warnings */
  | 'FRAMEWORK'
  /** Documented third-party SDK warnings */
  | 'SDK'
  /** Documented external toolchain/simulator warnings */
  | 'EXTERNAL'
  /** Documented architectural limitation with follow-up */
  | 'DOCUMENT'
  /** Undocumented app-owned warning - should fail tests */
  | 'TARGET';

/**
 * Result of warning classification
 */
export interface WarningClassification {
  category: WarningCategory;
  reason: string;
  matchedPattern: string;
}

/**
 * Allowlisted warning patterns.
 *
 * Each entry contains:
 * - pattern: RegExp to match against the warning message
 * - category: Ownership category
 * - reason: Human-readable explanation of why this warning is allowlisted
 *
 * WARNING: Unknown/app-owned warnings that don't match any pattern
 * will be classified as TARGET and will fail test assertions.
 */
const ALLOWLISTED_PATTERNS: Array<{
  pattern: RegExp;
  category: WarningCategory;
  reason: string;
}> = [
  // iOS UIRefreshControl framework warnings (offscreen refresh controls)
  {
    pattern: /UIRefreshControl/i,
    category: 'FRAMEWORK',
    reason: 'iOS native UIRefreshControl generates warnings for offscreen instances - React Native framework behavior',
  },
  {
    pattern: /attempting to dismiss redrawal/i,
    category: 'FRAMEWORK',
    reason: 'iOS UIKit internal redraw warning from UIRefreshControl',
  },

  // RevenueCat SDK same-user login warning
  {
    pattern: /Purchases\.logIn.*same.*user|logIn.*already.*logged/i,
    category: 'SDK',
    reason: 'RevenueCat SDK emits warning when logIn is called for already-logged user - SDK behavior, not app error',
  },
  {
    pattern: /logIn.*same.*user|same.*user.*warning/i,
    category: 'SDK',
    reason: 'RevenueCat SDK informational warning for idempotent login',
  },

  // Skia + Reanimated worklet shared-object mutation (architectural limitation)
  {
    pattern: /shared.*object.*mutation|worklet.*mutable|mutable.*worklet|worklet.*mutate.*shared/i,
    category: 'DOCUMENT',
    reason: 'Skia + Reanimated worklet interaction causes shared-object mutation warnings - documented architectural limitation',
  },
  {
    pattern: /Skia\.Path\.Make.*worklet|PathMake.*worklet/i,
    category: 'DOCUMENT',
    reason: 'Mutable Skia.Path created inside worklet context - documented limitation, PathBuilder would not fix',
  },

  // CoreHaptics iOS Simulator limitation
  {
    pattern: /CoreHaptics.*simulator|simulator.*CoreHaptics|CoreHaptics.*not.*available/i,
    category: 'EXTERNAL',
    reason: 'iOS Simulator does not support CoreHaptics hardware features - physical device required',
  },
  {
    pattern: /CHHapticEngine.*not available|CHHapticEngine.*failed/i,
    category: 'EXTERNAL',
    reason: 'CoreHaptics engine unavailable in iOS Simulator',
  },

  // Xcode/Apple toolchain warnings
  {
    pattern: /Xcode.*warning|xcode.*warn/i,
    category: 'EXTERNAL',
    reason: 'Xcode build-time warnings from Apple toolchain',
  },
  {
    pattern: /clang.*warning|llvm.*warning/i,
    category: 'EXTERNAL',
    reason: 'Clang/LLVM compiler warnings from native build',
  },
  {
    pattern: /ld: warning|linker.*warning/i,
    category: 'EXTERNAL',
    reason: 'Linker warnings from Apple ld tool',
  },

  // Expo SDK informational logs (not app errors)
  {
    pattern: /expo.*invalid.*state|INVALID_STATE/i,
    category: 'SDK',
    reason: 'Expo SDK internal state warnings during auth flows - SDK behavior',
  },
  {
    pattern: /expo-linking.*state/i,
    category: 'SDK',
    reason: 'Expo linking module state management - Expo SDK behavior',
  },

  // React Native framework warnings that are not app-owned
  {
    pattern: /RCTBridge required instance|bridgeless mode/i,
    category: 'FRAMEWORK',
    reason: 'React Native internal bridge/bridgeless mode warnings - framework behavior',
  },

  // Metro bundler warnings (not app-owned)
  {
    pattern: /Metro.*warning|bundler.*warn/i,
    category: 'EXTERNAL',
    reason: 'Metro bundler warnings during development',
  },
];

/**
 * Classifies a warning message into DOCUMENT (allowlisted) or TARGET (app-owned).
 *
 * @param warningMessage - The full warning message string to classify
 * @returns WarningClassification with category, reason, and matched pattern
 *
 * @example
 * ```ts
 * const result = classifyWarning('UIRefreshControl was called with offscreen instance');
 * if (result.category === 'TARGET') {
 *   throw new Error(`App-owned warning detected: ${result.reason}`);
 * }
 * ```
 */
export function classifyWarning(warningMessage: string): WarningClassification {
  const trimmedMessage = warningMessage.trim();

  if (!trimmedMessage) {
    return {
      category: 'TARGET',
      reason: 'Empty warning message - cannot classify',
      matchedPattern: '(none)',
    };
  }

  for (const { pattern, category, reason } of ALLOWLISTED_PATTERNS) {
    if (pattern.test(trimmedMessage)) {
      return {
        category,
        reason,
        matchedPattern: pattern.toString(),
      };
    }
  }

  // No match found - this is an unknown/app-owned warning
  return {
    category: 'TARGET',
    reason: `Unknown warning "${trimmedMessage}" - not in the documented allowlist. May be app-owned.`,
    matchedPattern: '(none)',
  };
}

/**
 * Asserts that a warning is allowlisted (DOCUMENT/FRAMEWORK/SDK/EXTERNAL).
 * Throws if the warning is classified as TARGET.
 *
 * @param warningMessage - The warning message to assert
 * @throws Error if the warning is not allowlisted
 *
 * @example
 * ```ts
 * expect(() => assertAllowlistedWarning('UIRefreshControl warning')).not.toThrow();
 * expect(() => assertAllowlistedWarning('Some app-owned warning')).toThrow();
 * ```
 */
export function assertAllowlistedWarning(warningMessage: string): void {
  const classification = classifyWarning(warningMessage);
  if (classification.category === 'TARGET') {
    throw new Error(
      `App-owned target warning detected: "${warningMessage}"\n` +
        `Category: ${classification.category}\n` +
        `Reason: ${classification.reason}\n` +
        `This warning is not in the documented allowlist and should be fixed or explicitly documented.`,
    );
  }
}

/**
 * Filters an array of warning messages, returning only the TARGET (app-owned) warnings.
 *
 * @param warnings - Array of warning message strings
 * @returns Array of TARGET warnings only
 *
 * @example
 * ```ts
 * const allWarnings = ['UIRefreshControl issue', 'Some app error', 'SDK info'];
 * const appOwnedWarnings = filterTargetWarnings(allWarnings);
 * expect(appOwnedWarnings).toEqual(['Some app error']);
 * ```
 */
export function filterTargetWarnings(warnings: string[]): string[] {
  return warnings.filter((w) => classifyWarning(w).category === 'TARGET');
}

/**
 * Checks if a warning is allowlisted (not TARGET).
 *
 * @param warningMessage - The warning message to check
 * @returns true if warning is allowlisted (DOCUMENT/FRAMEWORK/SDK/EXTERNAL), false if TARGET
 *
 * @example
 * ```ts
 * if (isAllowlistedWarning('UIRefreshControl warning')) {
 *   // This is a documented external warning
 * }
 * ```
 */
export function isAllowlistedWarning(warningMessage: string): boolean {
  return classifyWarning(warningMessage).category !== 'TARGET';
}

/**
 * Returns all supported warning categories for documentation purposes.
 */
export function getWarningCategories(): WarningCategory[] {
  return ['DOCUMENT', 'EXTERNAL', 'FRAMEWORK', 'SDK', 'TARGET'];
}
