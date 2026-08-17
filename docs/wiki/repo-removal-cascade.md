# Token Removal Repo Cascade

> When a token (host connection) is removed in Settings, the repositories that
> were synced with it are removed from the device too.

## Why

Removing a token used to leave orphaned repositories in the local store. The
repos stayed on the device but could no longer sync (the token that owned them
was gone), producing confusing "failed to sync" states. Now removing a token
cleans up its repos as part of the same confirmed action.

## Behavior

Three removal flows in `SettingsScreen` now cascade:

| Flow | What gets removed |
|------|-------------------|
| Disconnect host (`handleDisconnectHost`) | Repos stamped with that host id |
| Remove account (`handleRemoveAccount`) | Repos stamped with any host of the account |
| Remove token — legacy (`handleRemoveToken`) | Repos stamped with the active host |

Before removal, the confirmation Alert appends a warning line when affected
repos exist:

> This will also remove {{count}} synced repo(s) from this device.

On confirm the repos are removed via the existing full cleanup path
(`repoStore.removeRepository`), so template preferences, last-used repo, sync
engine state, cloned files, chat repo binding, and the note/canvas/todo lists
are all cleaned up exactly as if the user removed each repo manually.

## How a repo is linked to a token

`GitRepository` gained an optional `hostId` field (one host connection == one
token). It is stamped at add time from the active host:

- `GitService.addRepository(path, name, provider, hostId?)` stores it.
- `repoStore.addRepository` resolves the active host once via
  `getActiveGitHost()` (which now returns `hostId`) and passes it through.
- `ActiveGitHost` interface extended with `hostId`.

Legacy repos saved before this change have no `hostId`. They are still removed
when the removed host's provider is used by **no other account** on the device
(`providerAccountCount[provider] <= 1`). On multi-account installs where another
account still uses the same provider, unstamped legacy repos are left in place —
removing one GitHub token must not wipe another GitHub account's repos.

## Code layout

| File | Responsibility |
|------|----------------|
| `src/services/git/repoRemovalCascade.ts` | Pure helpers: `reposAffectedByRemovedHosts`, `buildProviderAccountCount`, `RemovedHostRef` |
| `src/stores/repoStore.ts` | `removeRepositoriesForHosts` action (loops `removeRepository`) |
| `src/screens/SettingsScreen.tsx` | Alert copy + cascade call in the three removal handlers |
| `src/services/GitService.ts` / `src/services/git/activeHost.ts` | `hostId` stamping |

## Tests

- `__tests__/services/git/repoRemovalCascade.test.ts` — pure-helper unit tests
  (stamped match, legacy single-account match, legacy multi-account no-match,
  default provider, no mutation).
- `__tests__/stores/repoStore.test.ts` — `removeRepositoriesForHosts` action
  (delegates to `removeRepository`, returns count).
- `__tests__/screens/SettingsScreen.test.tsx` — disconnect-host flow shows the
  cascade warning and calls `removeRepositoriesForHosts`.
- `__tests__/i18n-key-parity.test.ts` — `settings.cascadeRemoveWarning` present
  in all 6 locales.
