# DevMenu Floating "Tools" Button Overlaps Header Actions (#977)

> In iOS development builds, tapping the **Edit** (pencil) button on a note or the **Add note** (+) button opened the React Native DevMenu instead of running the action. Reported as blocking API-mode write-through testing.

## Root cause

Two compounding issues produced the symptom:

1. **expo-dev-menu's floating "Tools" action button (FAB) overlapped the header buttons.** The FAB (`DevMenuFABView`, a draggable gear-shaped pill) **defaults to the top-right corner** of the screen:
   `x = bounds.width - fabSize.width - margin/2`, `y = safeArea.top`.
   Its frame (≈ x 325–397, y 59–131 on iPhone 17) **completely covers** the Notes header's Add-note button (x 350–386, y 74–110) and partially the Sync button. A tap on the FAB calls `onOpenMenu()` → DevMenu opens with the exact "Runtime version: 1.5.0 / TOOLS menu" contents the reporter described. The position is persisted in `UserDefaults` (`DevMenuFAB.positionX/Y`) and draggable, so it stays wherever it lands.
2. **`useProGate`'s conditional `useNavigation()` violated the Rules of Hooks** (see `v1.5.0-app-store-rejection.md`). Every screen using it triggered a React hooks-order violation → **LogBox full-screen error panel** that blocked the UI, so taps never reached the buttons and a dev overlay appeared "instead of their actions".

## Change

- **`src/utils/devMenuFab.ts`** (new) — `hideDevMenuFloatingActionButton()`: a dev-only (`__DEV__` + iOS) startup call that disables the FAB via the `DevMenuPreferences` native module:
  `requireNativeModule('DevMenuPreferences').setPreferencesAsync({ showFloatingActionButton: false })`.
  This fixes already-installed dev builds without a native rebuild (the preference is re-applied at every launch). The DevMenu's "Tools button" toggle still lets developers re-enable it.
- **`App.tsx`** — calls `hideDevMenuFloatingActionButton()` at module scope in `__DEV__`.
- **`app.json`** — `ios.infoPlist.EXDevMenuShowFloatingActionButton: false` so fresh dev builds default to the FAB hidden (read by `DevMenuPreferences.setup()`).
- **`useProGate.ts`** — split into `useProGate()` / `useProStatus()` so no consumer hits the conditional-hook LogBox violation (see `v1.5.0-app-store-rejection.md`).

## Verification (iPhone 17 simulator, dev build)

- Add-note (+) → opens the NoteEditor ("New Note") — previously opened DevMenu.
- Open note → Edit (pencil) → enters edit mode ("Edit Note") — previously opened DevMenu.
- No `gearshape.fill` FAB at top-right; no LogBox hooks-order warnings on any screen.

## Notes

- The FAB is a developer tool; this fix only reverts the *default* (and re-applies the hidden state at each dev launch). Developers who want the FAB can re-enable it from the DevMenu.
- The 3-finger long-press, shake, and Cmd+D DevMenu triggers are untouched.

## Tests

```bash
yarn jest __tests__/utils/devMenuFab.test.ts --no-coverage --forceExit
yarn jest __tests__/hooks/useProGate.test.tsx __tests__/FloatingAIButton.test.tsx --no-coverage --forceExit
yarn ts:check
```
