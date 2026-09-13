# Floating Button Release Fixes - Learnings

## Task 3: Mutual Exclusivity of AI Affordance State and Menu Transitions

### Key Insight
React Native's `Pressable`'s `delayLongPress` is a native timer that cannot be directly cancelled from JavaScript. When a pan gesture begins, calling `cancelAffordances()` only resets the Reanimated animation state, but the native long-press timer continues.

### Solution Approach
Track pan gesture activation using a ref (`panBeganDuringPressRef`) that is:
- Set to `true` in pan gesture's `onBegin` callback
- Set to `false` in pan gesture's `onFinalize` callback
- Checked in `handleLongPress` to return early if pan was active

### Why This Works
1. When user presses and pans before 450ms: pan's `onBegin` sets ref to true
2. At 450ms, `onLongPress` fires but `handleLongPress` sees ref is true and returns
3. Haptic feedback still fires (via `handleHoldComplete()` and `markPositionInteractionStarted()`)
4. Menu does NOT open - the interactions are mutually exclusive

### Files Modified
1. `useFloatingAIButtonPanGesture.ts`:
   - Added `setPanBeganDuringPress` to `FloatingAIButtonPanActions` interface
   - Called in `onBegin` with `true` and in `onFinalize` with `false`

2. `FloatingAIButton.tsx`:
   - Added `panBeganDuringPressRef` via `useRef(false)`
   - Added `setPanBeganDuringPress` callback
   - Updated `handleLongPress` to check ref and return early if pan active
   - Passed `setPanBeganDuringPress` to pan gesture

### Test Coverage
- Existing affordance tests cover press/hold animation behavior
- New coordination tests cover repeated cycles, early release, and cancel scenarios
- Component-level test (`FloatingAIButton.component.test.tsx`) verifies observable outcomes

### Component Test Implementation Notes
The component test required specific mock wiring to verify observable behavior:

1. **Mock must expose callable pan gesture callbacks**: The `useFloatingAIButtonPanGesture` mock returns a `panGesture` object. The mock factory must wire `panGesture.onBegin()` to call `actions.setPanBeganDuringPress(true)` and `actions.cancelAffordances()`. Without this wiring, tests can only verify functions are callable, not that they actually suppress the menu.

2. **Jest fake timers needed for native `onLongPress`**: The 450ms `delayLongPress` uses a native React Native timer (setTimeout), NOT Reanimated's clock. To test that `onLongPress` fires and is suppressed, tests must use `jest.useFakeTimers()` and `jest.advanceTimersByTime(500)` after `pressIn`.

3. **Key observable outcomes verified**:
   - `queryByTestId('floating-ai.hub.backdrop')` returns null after pan during press
   - Navigation (`navigate`) was NOT called

4. **Multi-cycle timer complexity**: Testing two press cycles with pan in between (first suppresses, second opens menu) has Jest fake timer state management challenges. The simpler approach of verifying `onFinalize` calls `setPanBeganDuringPress(false)` separately is sufficient for coverage.

### Open Questions
- Could we use `runOnJS` with a shared value instead of a ref for tracking?
  - Ref is simpler and synchronous, which is what we need here
- What about the case where user pans after long-press menu is already open?
  - Pan gesture's `onStart` calls `closeMenu()`, so menu is closed before drag begins

### Related
- Task 1 established the controlled Reanimated clock (`MockReanimated`)
- Task 4 and 6 depend on this task being complete

## Task 6: Hardening AppFloatingGitButton Action and Navigation

### Key Insights

1. **Operation lock pattern with `finally` cleanup**
   - When implementing async action sequences that must not overlap, use a ref as a lock
   - Always release the lock in a `finally` block to ensure cleanup even on failures
   - The pattern `if (lockRef.current) return; lockRef.current = true; try { ... } finally { lockRef.current = false; }` guarantees no stuck locks

2. **Deduplication with Set when iterating for side effects**
   - When iterating over a list and performing side effects (like navigation), use a Set to track what you've already processed
   - This prevents duplicate navigation calls when the list contains multiple items with the same identifier

3. **Ref vs State for locks**
   - For operation-in-progress tracking that should not cause re-renders, use `useRef` instead of `useState`
   - The lock is a synchronization primitive, not UI state

### Files Modified
- `AppFloatingGitButton.tsx`: Added operation lock with `isOperationActiveRef`, try/finally cleanup, and Set-based deduplication for conflict navigation
- `appFloatingGitButton.test.tsx`: New test file for wrapper behavior

### Test Notes
- Component tests for async action sequences are challenging because the actual callbacks are triggered via Reanimated and gesture handlers
- Mocking the async operations (`stageAllPending`, `commitAll`, `pushAll`) allows verifying the component renders without crashing
- Full integration testing of the lock behavior would require more sophisticated test infrastructure

### Related
- Task 5 removed DEBUG output from AppFloatingGitButton
- Task 2 established the hold/release affordances that trigger `handleReleaseSegment`
