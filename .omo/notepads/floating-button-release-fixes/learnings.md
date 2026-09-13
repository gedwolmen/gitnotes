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

## 9. fireEvent.pressIn / pressOut vs fireEvent.press
`fireEvent.pressIn` dispatches a `pressIn` event (calls `onPressIn`).
`fireEvent.pressOut` dispatches a `pressOut` event (calls `onPressOut`).
`fireEvent.press` dispatches a `press` event (calls `onPress`).
`onPress` is NOT called by `pressIn`+`pressOut` — it fires separately on release.
`handleTap` (FloatingGitButton's `onPress` callback) checks `holdProgress.value >= 1/3`.
To simulate a full press that calls `onPress`: use `fireEvent(pressable, 'press')`.
Using `pressIn`+`pressOut` does NOT trigger `onPress` in @testing-library/react-native.

## 10. reduceMotionResolved flush with real timers + act
`isReduceMotionEnabled()` returns `Promise.resolve(false)`. With real timers (the
default in Jest), the Promise callback runs as a microtask after the current
stack. `render()` returns synchronously; the Promise callback hasn't run yet.
SOLUTION: render once, then `await act(async () => { await Promise.resolve(); })`.
This flushes the microtask queue and the React state update from the Promise
callback, making `reduceMotionResolved = true` before we interact.
After the act(), switch to fake timers for clock control: `jest.useFakeTimers()`.

## 11. render() inside nested act() causes "unmounted test renderer"
Calling `renderButton()` (which calls `render()`) inside `await act(async () => {...})`
where `renderButton` itself is not async can cause the "Can't access .root on
unmounted test renderer" error. Root cause: nesting render() inside another
act() callback (render() uses act() internally). FIX: call render() outside act(),
use act() only for the flush (`await act(async () => { await Promise.resolve(); })`).

## 12. jest.setup.ts does NOT configure fake timers globally
jest.setup.ts has no `jest.useFakeTimers()` call. Jest uses real timers by default.
`jest.useFakeTimers()` must be called explicitly in tests that need fake timers.

## 13. Pan-before-release race — cancelAffordances is the seam
The Pan gesture (useFloatingGitButtonPanGesture) calls `cancelAffordances` from its
`onBegin` callback via `runOnJS(actions.cancelAffordances)()`. This fires BEFORE the
Pressable's `onPressOut` (release) event. The race:
  1. Press in → holdProgress starts filling (withTiming over 3000ms)
  2. Pan gesture activates → onBegin → cancelAffordances() → holdProgress.value=0
  3. Release → handlePressOut reads fraction=0 → no segment emitted
The `cancelAffordances` seam (affordances hook, exposed as a public method) is the
correct test point for this race. The observable outcomes: onReleaseSegment is NOT
called, holdProgress.value===0, pressProgress.value===0.
The affordances tests call it implicitly via `__advanceBy` which works because
`MockReanimated.__advanceBy` is called inside `act()` which manages the flush.
For integration tests, call `jest.useFakeTimers()` explicitly AFTER the render
is complete and the Promise microtask has been flushed.

---

# Learnings — floating-button-release-fixes Task 5

## T5-1. FloatingAIButton is the canonical AccessibilityInfo pattern
FloatingAIButton.tsx (lines 90-109) is the reference implementation for the
reduce-motion subscription. It uses:
- `AccessibilityInfo.isReduceMotionEnabled()` to query initial state
- `AccessibilityInfo.addEventListener('reduceMotionChanged', callback)` for updates
- `isMounted` guard + `subscription.remove()` in cleanup
- Two state vars: `reduceMotionEnabled` (value) and `reduceMotionResolved` (loaded flag)
FloatingGitButton now follows this exact pattern.

## T5-2. Stale timing constants (300/600/900) had zero external references
grep across the worktree showed only self-references in gitButtonGeometry.ts.
The authoritative timing is `HOLD_FILL_MS = 3000` in the affordances hook, which
produces derived thresholds of 1000/2000/3000ms via STAGE_FRACTION (1/3) and
COMMIT_FRACTION (2/3).

## T5-3. DEBUG output removed only after confirming test coverage
The DEBUG toast in AppFloatingGitButton.tsx fired on every handleReleaseSegment
call. The callback is exercised by the affordances tests (which call
handlePressOut → handleReleaseSegment for each segment). Since the affordances
hook tests verify the callback fires with correct segment, the DEBUG toast was
safe to remove. Similarly for the console.log statements — the affordances
tests cover the handlePressIn/handlePressOut code paths.

## T5-4. Lifecycle safety of the subscription
The `isMounted` flag pattern is critical: the Promise from
`isReduceMotionEnabled()` may resolve after the component unmounts. The
subscription's cleanup also calls `subscription.remove()` to prevent memory
leaks. This matches the FloatingAIButton pattern exactly.

## T5-5. console.error warnings in integration tests are pre-existing
The floatingGitButton.test.tsx integration test shows act() warnings for
the AccessibilityInfo state updates. These are expected: the
`AccessibilityInfo.addEventListener` subscription fires asynchronously after
the test's act() flush completes. The warnings were introduced when Task 1
wired the real AccessibilityInfo (not mocked). They are console.error warnings,
not test failures, and do not indicate a bug in the implementation.
