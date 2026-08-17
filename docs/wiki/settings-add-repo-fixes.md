# Settings — Add Repository Fixes

Two UI bugs in the Add-Repository / GitHub-connection flow, both surfaced on a
fresh simulator session and confirmed via screenshot + accessibility-tree analysis.

## Invisible "Add" button (white-on-white)

The "Add" manual-repo button (and every other `variant="primary"` button that
overrode its text to white, e.g. Save-token, Onboarding) rendered as a **blank
white rectangle** — the label was white text on a white surface.

Root cause: the shared-kit refactor (`refactor(ui): rebuild shared kit on RN
Reusables`, `d5d83a3`) rewrote `Button` to render **all** non-ghost variants on
a raised `Surface` (a white card in light mode) with the theme text color.
`variant="primary"` was only used for font-weight, so the primary background
was never applied. Callers that set `textStyle={{color:'#fff'}}` therefore got
white-on-white.

Fix (`src/components/ui/Button.tsx`):
- `variant="primary"` now fills `colors.primary` as the surface background.
- primary text is white (`#fff`); secondary keeps the theme text color.

Primary buttons now look and read as filled primary actions in light + dark.

## "No repositories found" after adding a token

Adding a GitHub token via the **Add GitHub Account** flow then opening Add
Repository showed `No repositories found` — no loading, no error — even though
the account was registered.

Root cause: `AccountsContext.addAccount` (the "add" modal path) called
`AuthService.connectHost` + `refreshAccounts` but never synced the legacy
`GitHubService` singleton token. `SettingsScreen.openRepoPicker` gates the repo
fetch on `GitHubService.isAuthenticated()`, which stayed `false`, so the fetch
was skipped on every open — the list only populated after an app restart
(bootstrap hydration). Note the "change token" path already synced via
`setToken`; `addAccount` did not.

Fix (`src/contexts/AccountsContext.tsx`): after a successful connect,
`addAccount` now calls `GitHubService.setToken(token, user)` (best-effort,
matching the existing `setToken`/`switchToHost` pattern) so the repo list and
write preflight work immediately after adding an account.

## Tests

- `__tests__/ui/Button.test.tsx`: primary variant renders the primary
  background with white text; secondary keeps theme text on the surface;
  snapshots regenerated.
- `__tests__/AccountsContext.test.tsx`: `addAccount` syncs the
  GitHubService token, and does not when connectHost fails.
- `__tests__/theme-parity.test.tsx` snapshot regenerated for the corrected
  primary button.