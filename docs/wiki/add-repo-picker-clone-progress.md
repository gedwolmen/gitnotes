# Add Repository Picker — Clone Progress & First-Connect Fixes (#953)

Three bugs in the Add-Repository flow, all surfaced on a fresh simulator session
during the #932 QA campaign and confirmed against Metro logs + accessibility
tree:

## 1. Repo click "just keeps loading" — clone progress modal never appeared

When clicking a GitHub repo row in the Add-Repository picker, the row showed an
endless spinner with **no progress and no cancel button** while the import ran
(the default sync mode is now `clone`, so add-time import does a full clone).

Root cause: `importRepoAfterAdd` set `cloneProgress`, which rendered
`CloneProgressModal` — a **second native `Modal` on top of the already-open repo
picker modal**. iOS Fabric rejects stacked native modals:

```
[UIKitCore] Attempt to present <RCTFabricModalHostViewController> ... which is already presenting
```

The presentation was silently dropped, so the user saw only the row spinner for
the entire clone (which can take 1–10 minutes) with no way to cancel.

Fix (`src/components/settings/CloneProgressModal.tsx`,
`src/components/settings/SettingsModals.tsx`, `src/screens/SettingsScreen.tsx`):

- Extracted the progress UI into a reusable `CloneProgressContent` component.
- `SettingsModals` renders `CloneProgressContent` **inline inside the picker
  bottom sheet** when `cloneProgress` is set (with Cancel / Retry wired to the
  existing `handleCancelClone` / `handleRetryClone`).
- The standalone `CloneProgressModal` (still used by the sync-engine clone
  toggle, where no other modal is open) renders only when the repo picker is
  closed (`!showRepoPickerModal`), so it never attempts the stacked presentation.
- Guarded the inline render with `cloneProgress != null` (covers `undefined`
  during hot reload, which previously crashed the new component).

Result: clicking a repo now shows live progress + a Cancel button inside the
picker, exactly matching the #938 contract (picker stays busy until import
settles).

## 2. Manual "Add" button spinner too close to the label

The manual-add `Button` used `iconAlign="edge"`, which pins the trailing
spinner to the button's right edge with no gap from the "Add" label on a narrow
button.

Fix (`src/components/settings/SettingsModals.tsx`): switched to
`iconAlign="inline"` (the component default) so the spinner flows after the
label with the standard 8px gap.

## 3. First-time host connect: repo list empty until app restart

Adding a token/account for the **first time** via the primary "Connect host"
flow showed no repositories in the Add-Repository picker until the app was
restarted.

Root cause: `AccountsContext.connectHost` (used by `ConnectHostModal`, the
first-run path) persisted the host and refreshed `authState` but **never
hydrated the legacy `GitHubService` singleton**. `openRepoPicker` gates the
fetch on `GitHubService.isAuthenticated()`, which stayed `false` until the app
restarted (bootstrap `GitHubService.initialize()`). The earlier fix
(documented in `settings-add-repo-fixes.md`) covered the `addAccount` path only.

Fix (`src/contexts/AccountsContext.tsx`): after a successful `connectHost` for
a GitHub host, best-effort `GitHubService.setToken(token, user)` — mirroring the
existing `addAccount` / `setToken` / `switchToHost` hydration pattern.

## QA findings fixed (#932)

- **Delete-note false failure**: in API-mode write-through, the queue
  side-channel (`onDeleteMutationSucceeded`) removes the note during
  `stageDelete`'s drain, so the follow-up `StorageService.deleteNote(id)` returns
  `false` for the already-removed row and the UI showed "Failed to delete note"
  even though the delete fully succeeded locally and on GitHub.
  Fix (`src/stores/noteStore.ts`): treat the already-removed state as success
  (`deleteNote` returns true, op is succeeded).

## Tests

- `SettingsModals.test.tsx`: inline clone progress renders inside the picker,
  error state with Cancel/Retry, callbacks wired.
- `AccountsContext.test.tsx`: `connectHost` hydrates the GitHubService
  singleton for github connects; no hydration on failure.
- `SettingsScreen.add-repo-import.test.tsx`: mock surface updated to the
  inline-progress contract (progress renders inside the picker, not a second
  modal).
- `noteStore.test.ts`: delete reports success when the write-through side
  channel already removed the row.
