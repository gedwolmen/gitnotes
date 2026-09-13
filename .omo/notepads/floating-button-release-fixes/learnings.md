# Learnings — floating-button-release-fixes Task 1

## 1. jest.mock factory variable naming
Jest hoists `jest.mock()` factories and only resolves references that start with
`mock` (case-insensitive) in the factory body. Module-level constants used in the
factory must be prefixed accordingly. Our `mockAnimState` and `MockReanimated`
satisfy this.

## 2. SharedValue setter interception
Real Reanimated worklets receive SV as `this`. The affordances code uses
`sv.value = withTiming(to, opts)`. In a JS mock, this evaluates `withTiming` first
(returns config), then assigns to `sv.value`. Detecting the animation config at
the setter requires the `__anim` marker pattern:
- `withTiming(to, opts)` returns `{ __anim: { startTime, from, to, duration, easing } }`
- The `value` setter on the SV detects `__anim` and stores the entry in `pending`
- `tick(ms)` iterates all SVs and computes the interpolated value

## 3. handlePressOut starts drain animation
`handlePressOut` immediately calls `holdProgress.value = withTiming(0, { duration: 150 })`.
The 150ms drain animation starts right away. Tests that assert `holdProgress.value`
AFTER `handlePressOut` will see 0 (drain complete at tick(0) in mock) or near-0.
SOLUTION: assert holdProgress BEFORE calling handlePressOut, then assert the
callback was fired.

## 4. __resetTime vs __cancelAll
`__resetTime` clears the `all` Set (removes SVs) and resets clock to 0.
`__cancelAll` keeps SVs in `all` but clears pending + resets value to 0.
Use `__resetTime` in beforeEach. Use `__cancelAll` when testing cancelAnimation.

## 5. Skia is not mocked in this project
`GitButtonRing` uses @shopify/react-native-skia which is not mocked. Components
using Skia cannot be rendered in tests without a Skia mock. For integration tests,
mock the Skia-using component explicitly: `jest.mock('@/components/git/GitButtonRing', ...)`.

## 6. FloatingGitButton requires deep component mocking
The component tree includes: useFloatingButtonCollision, useFloatingButtonPosition,
useFloatingGitButtonAffordances, useFloatingGitButtonPanGesture, GitButtonHalo,
GitButtonRing, AccessibilityInfo, useTheme/useTokens, @expo/vector-icons.
Each missing mock causes a different error. Integration test is impractical without
a test-specific wrapper or extensive per-component mock.

## 7. interpolate is a pure math function
Reanimated's `interpolate(value, inputRange, outputRange, extrapolate)` is a plain
math function. Added to the mock to support GitButtonHalo which uses it for
opacity/scale animations on the pulse shared value.

## 8. Test file eslint-disable comments are harmless
eslint-disable comments for `@typescript-eslint/no-var-requires` appear unused in
test files because the linter detects the comment itself but finds no actual
violation. This is expected behavior — the comments guard against future violations.
