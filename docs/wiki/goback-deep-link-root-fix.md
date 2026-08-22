# GO_BACK Unhandled — Deep-Linked Root Screens

`The action 'GO_BACK' was not handled by any navigator.` fired (dev-only) when
the user tapped a header back button on a screen that was the **root of the
root stack** — most visibly the Chat thread list opened via the
`gitnotes://chat` deep link (reproduced on simulator: cold-open the deep link,
tap the header Back arrow → error banner).

## Root cause

Every deep-linkable screen passed an unconditional `onBack={() =>
navigation.goBack()}` to `ScreenHeader`. `ScreenHeader` renders the back arrow
whenever `onBack` is provided, so the arrow appeared even when the stack had
no previous screen. React Navigation then rejected the `GO_BACK` action with
the dev-only error. Affected screens (all in the `gitnotes://` linking config):

- `ChatThreadList` (`gitnotes://chat`) — the reported case
- `ChatScreen` (`gitnotes://chat/:threadId`)
- `ThoughtDump` (`gitnotes://thought-dump`)
- `Stage` (`gitnotes://stage`)
- `Conflicts` (aliases `SyncStatusScreen`, `gitnotes://conflicts`)
- `NoteEditor` preview mode (`gitnotes://note/:noteId`)
- `CanvasEditor` (`gitnotes://canvas/:canvasId`)

## Fix

New hook `src/hooks/useSafeBack.ts`: returns a header-back handler that pops
via `navigation.goBack()` when `canGoBack()`, otherwise falls back to
`navigation.navigate('MainTabs')` (the same fallback `useProScreenGuard` uses
for cold-deep-link cancel). The hook only calls `canGoBack()` at press time,
so render-time mocks that omit it keep working.

All seven deep-linkable screens now use `useSafeBack()` for their header back
button. Non-deep-linkable screens (viewers, ConflictResolver, render-style,
template manager, AddReminder) are always pushed and keep their plain
`goBack()`; AddReminderScreen already guarded with `canGoBack`.

## Tests

- `__tests__/hooks/useSafeBack.test.tsx`: pops via `goBack` when a previous
  screen exists; navigates to `MainTabs` when the screen is the stack root.
