# Floating Button Collision — Infinite-Recursion Crash Fix

## Symptom

The floating AI button's press-and-hold affordance (hold-progress ring + press
scale) disappeared. When both the AI button and the stage push button were on
screen and their rects overlapped, the app threw `Maximum call stack size
exceeded` in `src/components/floatingButtonLayout.ts`, crashing the whole
floating-button tree.

## Root Cause

Commit `f2af17a5` ("prevent floating buttons overlapping with collision
avoidance") added `useFloatingButtonCollision('stage', ...)`. The stage
button's subscriber runs on every rect publish; when it detects an overlap it
resolves a new position, springs the shared value, and calls
`publishButtonRect('stage', ...)` again:

```ts
return subscribeButtonRects(() => {
  const other = getButtonRect(otherId);
  if (other === null || dragActive.value) return;
  const current = { x: translateX.value, y: translateY.value };
  ...
  translateX.value = withSpring(resolved.x, COLLISION_SPRING);
  publishButtonRect(id, { x: resolved.x, y: resolved.y, size });
});
```

`publishButtonRect` iterates all listeners synchronously, including the very
subscriber that just published. Because `translateX.value = withSpring(...)`
does not update `.value` synchronously, the re-entrant listener reads the stale
position, still sees an overlap, resolves again, and publishes again — an
infinite `publish → notify → publish → notify` cycle that overflows the JS
stack.

The crash explains the user-visible regression: the AI button's hold animation
depends on these shared values and gestures, so the fatal error killed the
entire floating-button layer whenever both FABs coexisted with overlapping
rects.

## Fix

`src/components/floatingButtonLayout.ts`:

1. **Re-entrancy guard on `publishButtonRect`.** A `notifying` flag prevents a
   publish triggered from inside a subscriber from re-notifying all listeners.
   The rect registry is still updated first, so subsequent top-level publishes
   see fresh positions.
2. **Collision listener reads the published rect, not the stale shared value.**
   The stage subscriber now takes `getButtonRect(id)` (the last published
   position) as its current position, falling back to `translateX/translateY`
   only when nothing has been published yet. Once a resolution has been
   published, the next notification sees the resolved (non-overlapping)
   position and returns early. It also skips publishing when the resolved
   position equals the current one.

Both changes together make collision resolution converge instead of recursing.

## Tests

`__tests__/floatingButtonLayout.test.ts` gains a regression test that publishes
from inside a subscriber and asserts the notification loop terminates (the
pre-fix code would blow the stack). The full suite (`yarn jest`,
`yarn ts:check`, `yarn eslint . --ext .ts,.tsx`) passes.
