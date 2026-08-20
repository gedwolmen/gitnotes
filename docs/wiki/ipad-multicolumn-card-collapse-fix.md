# iPad Multi-Column Card Collapse Fix

On iPad's multi-column layouts, list cards collapsed to their intrinsic content
width instead of filling their column: **Todos** rendered as ~90px-wide strips
(#940) and **Notes grid** cards rendered at ~263px in a ~330px column (#941),
leaving hundreds of pixels of empty space at the right of the grid.

## Root cause

All list cards (todos, notes, thought dumps) are wrapped in
`SwipeableListItem` (`src/components/list/SwipeableListItem.tsx`), whose root is
an `Animated.View`. That view had **no explicit width**.

In a single-column `FlatList` this is invisible — items stretch to the list
width by default. But in a **multi-column `FlatList`** (`numColumns > 1`,
enabled by `useResponsive` on wide/tablet layouts), each item is laid out
inside a `columnWrapperStyle` row where the wrapper shrinks to its content's
**intrinsic width**. With no width/flex constraint on the root `Animated.View`,
the cards collapsed to the content width of their children instead of filling
the column allocated by the `FlatList`.

## Fix

One line: prepend `{ width: '100%' }` as the **first** entry of the root
`Animated.View` style array (`SwipeableListItem.tsx`, line 80):

```tsx
style={[
  { width: '100%' },
  selected && { /* selection shadow */ },
  animatedStyle,
]}
```

Notes on the choice:
- `width: '100%'`, not `flex: 1` — `flex: 1` has subtle layout implications
  inside a multi-column `FlatList` row (`columnWrapperStyle`); percentage width
  fills exactly the column the `FlatList` allocates.
- `animatedStyle` (swipe `translateX`) and the selection shadow stay after the
  width entry, so the swipe gesture and selection visuals are untouched.

Because the fix lives in the shared wrapper, it repairs every consuming
screen at once.

## Affected screens

- `src/screens/TodoListScreen.tsx` — Todo cards (#940): ~90px → full column
- `src/screens/NotesListScreen.tsx` — Notes grid cards (#941): ~263px → full
  column
- `src/screens/ThoughtDumpScreen.tsx` — thought-dump cards (same wrapper)

Single-column phone layouts are unaffected: `width: '100%'` matches the
already-stretched item width.

## Column math (iPad Pro 13" portrait)

1032pt screen − 2×16 list padding = 1000pt container; 3 columns with
`columnWrapperStyle` gap 8 → `(1000 − 16) / 3 = 328px` nominal per card.

## Regression test

`__tests__/components/list/SwipeableListItem.test.tsx` — 5 tests:

1. **Multi-column fill**: root style resolves `width: '100%'`, and the item
   fills its nominal column (`(containerWidth − (numColumns−1)·gap) /
   numColumns`, asserted ≥ 320 for the iPad 3-column case).
2. **Single-column full width**: item fills the full list width.
3. **Press interactions**: selection toggle fires via
   `swipeable-list-item.button.toggle-{itemId}`.
4. **Long press**: the wrapper does not steal the wrapped card's long-press
   (long press is handled by TodoCard/NoteCard, not the wrapper).
5. **Selection shadow composition**: `selected` adds the shadow style without
   dropping the width entry.

Jest cannot run a real Yoga layout, so the tests encode the layout contract
through the root style (`StyleSheet.flatten(el.props.style)`, repo precedent)
plus a documented `measuredItemWidth` helper. Pre-fix: 3 width assertions fail
(stub 200px / undefined width); post-fix: all 5 pass.

## Verification

```bash
yarn jest __tests__/components/list/SwipeableListItem.test.tsx --no-coverage --forceExit  # 5/5 pass
yarn ts:check      # clean
yarn eslint src/components/list/SwipeableListItem.tsx __tests__/components/list/SwipeableListItem.test.tsx  # clean
```

Manual QA (iPad simulator, multi-column breakpoint): Todos, Notes grid, and
thought-dump cards fill their columns edge-to-edge; swipe-to-select and
selection shadow still work; phone single-column layout unchanged.

## Related issues

- Closes #940 — iPad multi-column Todos cards collapse to 90px
- Closes #941 — iPad multi-column Notes grid cards collapse to 263px
