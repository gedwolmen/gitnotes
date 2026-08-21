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

## 5. Clone-mode fetch hangs on QUIC (HTTP/3) — "cloning but stuck"

Follow-up finding during the same QA session: in clone mode, the add-repo
import (and any git smart-HTTP fetch) **hung forever** — the row spinner never
resolved and no packfile downloaded.

Root cause (confirmed via native iOS logs + host network probes): the app's
`fetch()` to `https://github.com/<owner>/<repo>.git/info/refs` opened a
**QUIC (HTTP/3) connection that never completed**. The network path from this
environment black-holes UDP/443 to github.com's specific edge IP
(`20.205.243.166`), while TCP/443 (HTTP/2 / HTTP/1.1) to the same URL
completes in <1s. `api.github.com` (a different edge IP) works over QUIC, so
only the git smart-HTTP host is affected.

Key evidence:

```
# host: UDP/443 (QUIC) to github.com edge is DEAD, TCP/443 works
UDP 20.205.243.166:443 -> TIMEOUT (path DEAD/BLOCKED)
TCP 20.205.243.166:443 -> connected in 0.06s (path ALIVE)

# native iOS log: the git request rides a quic-connection that stalls
[C17 ... quic-connection, url: https://github.com/vidwadeseram/notes.git/info/refs] start
[C17 ... quic-connection, url: https://github.com/vidwadeseram/notes.git/info/refs] cancel  # 30s later
```

Attempted but ineffective: `NSMutableURLRequest.assumesHTTP3Capable = false`
is compiled into the binary but iOS 26.5's CFNetwork ignores it — the request
still opens a QUIC connection.

Fix (`plugins/withGitQuicWorkaround.js` — a config plugin, since `ios/` is
generated by `expo prebuild` and must not be edited directly):

- Injects a custom `URLProtocol` (`GitHttp11URLProtocol`) into AppDelegate.
- Intercepts requests whose host is `github.com` and path contains `.git/`.
- Re-issues them over an **ephemeral HTTP/1.1 URLSession** (`Connection: close`,
  no shared pool → no pooled QUIC route), which completes instantly.
- Wired via Expo's `ExpoFetchCustomExtension.setCustomURLSessionConfigurationProvider`.
- Registered in `app.json` plugins so EAS/prebuild regenerations keep it.

Verified: fresh clone of `test-notes` completes — packfile, refs/heads/main,
working tree (`notes/*.md`, `todos/*.json`) all present.

### Why "was working before"

The QUIC path to the specific github.com edge IP degraded on this network.
Nothing in the app changed; the app just can no longer rely on the default
URLSession HTTP/3 negotiation. The protocol-pinning plugin makes the git
transport independent of QUIC health.
