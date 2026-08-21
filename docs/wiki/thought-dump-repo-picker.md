# Thought Dump — Repo Picker

> The Thought Dump screen now lets the user choose which repository (and branch) a thought dump is saved to, instead of always writing to the first saved repo behind a generic error alert.

## Background

Previously a thought dump was saved unconditionally to the first saved repository. If that write failed — the user had no GitHub account, no repos, or a repo that had since been removed — the screen showed a single generic error alert (`thoughtDump.error`, "Something went wrong. Please try again.") with no guidance on what was actually wrong or how to fix it. The user had no control over the destination and no way to recover.

This feature adds a repo+branch picker to the Thought Dump screen and splits the save-time failure modes into distinct, actionable errors.

## The picker row

Above the composer, the Thought Dump screen renders a "Save to `<repo>` · `<branch>`" picker row (`thoughtDump.repo`). Tapping it opens a repo+branch picker modal (titled `thoughtDump.repoPickerTitle`), which lists the user's saved repositories and their branches and explains the behavior (`thoughtDump.repoPickerDescription`: thought dumps are saved as Markdown in the `thoughts/` folder of the selected repository).

## Preference persistence

The selected repo is persisted through `ThoughtDumpRepoPreferenceService`, stored under the `@gitnotes:thought_dump_repo` AsyncStorage key. Resolution order on load:

1. The stored preference (if the repo still exists).
2. The last-used repository.
3. The first saved repository.

The fallback chain means an existing user keeps working without re-picking, while a repo that has been deleted since the last pick degrades gracefully to the next candidate.

## Distinct save-time errors

Instead of one generic alert, save failures now surface one of four targeted messages:

| Key | Condition |
|-----|-----------|
| `errorNotAuthenticated` | No GitHub account / not signed in |
| `errorNoRepo` | No repository selected |
| `errorInvalidRepo` | The selected repository is no longer available |
| `errorWriteFailed` | The write itself failed (network, permissions, etc.) |

## Empty-state disambiguation

The empty state now distinguishes three separate conditions instead of a single "no thought dumps" message:

- **Connect account** (`noAuthTitle` / `noAuthBody`) — the user has no GitHub account connected.
- **No repository set up** (`noRepoConfiguredTitle` / `noRepoConfiguredBody`) — an account is connected but no repository is saved.
- **No thought dumps yet** (`thoughtDump.empty`) — everything is configured but the folder is empty.

Each of the first two states offers a "Go to Settings" action (`goToSettings`) so the user can resolve the missing setup in place.

## i18n

Thirteen new `thoughtDump.*` keys added to all six locales (en/es/fr/de/ja/ko): `repo`, `chooseRepo`, `repoPickerTitle`, `repoPickerDescription`, `noRepoConfiguredTitle`, `noRepoConfiguredBody`, `noAuthTitle`, `noAuthBody`, `errorNotAuthenticated`, `errorNoRepo`, `errorWriteFailed`, `errorInvalidRepo`, `goToSettings`. All six locales verified by the existing `__tests__/i18n-key-parity.test.ts` gate.

## Files

- `src/screens/ThoughtDumpScreen.tsx` — picker row, repo+branch picker modal, empty-state branching, distinct error alerts
- `src/services/ThoughtDumpService.ts` — writes to the selected repo/branch, typed save failures
- `src/services/ThoughtDumpRepoPreferenceService.ts` — `@gitnotes:thought_dump_repo` persistence with last-used/first-repo fallback
- `src/i18n/{en,es,fr,de,ja,ko}.json` — 13 new keys each
