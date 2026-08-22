# Explore Repo Hub

> Hub page for a selected repo in the Explore tab: Browse Files + Pull Requests + Issues + shared branch selector. Multi-provider (GitHub / GitLab / Gitea / Forgejo) data layer.

## Background

Before this change, the Explore → repo detail screen rendered only a card + a single "Browse Files" button. The page was low-utility; users had no path to see a repo's PRs or issues without leaving the app.

This feature promotes the `repoDetail` view into a proper hub with four actions, and provides a provider-agnostic data layer so the same UI works across every supported host.

## Multi-provider data layer

`GitHostService` (src/services/git/GitHost.ts) was extended with two read methods:

```ts
listPullRequests(owner, repo, state?: GitHostItemState): Promise<GitHostPullRequest[]>
listIssues(owner, repo, state?: GitHostItemState): Promise<GitHostIssue[]>
```

Implemented in all four services:

| Provider | Implementation notes |
|----------|----------------------|
| GitHub | Delegates to existing `GitHubService.getPullRequests` / `getIssues` (406–436). Normalizes `html_url → webUrl`, `user.login → author`, `labels[].name → labels`. |
| GitLab | `GET /projects/<encodedId>/merge_requests?state=opened\|closed&per_page=50`. Maps `iid → number`, `web_url → webUrl`, and crucially normalizes GitLab's `merged` state to `closed` to keep the host-agnostic `GitHostItemState = 'open' \| 'closed'` enum. Uses existing `PRIVATE-TOKEN` header. |
| Gitea / Forgejo | `GET /repos/<o>/<r>/pulls?state=open\|closed&limit=50` and same for `/issues`. Uses `Authorization: token X`. Critically filters out items carrying a non-null `pull_request` field from the issues response (Gitea's `/issues` endpoint returns PRs too). |

The new types `GitHostIssue` and `GitHostPullRequest` carry normalized fields (`number`, `title`, `state`, `webUrl`, `labels: string[]`, `author?`) so the Explore UI can render them without caring about the underlying host.

Two new TanStack Query hooks in `src/hooks/useGitHostQueries.ts` (`useGitHostPullRequests`, `useGitHostIssues`) go through `getGitHostService(provider)`, following the conventions of the existing `useGitHubQueries.ts` (`['githost', provider, ...]` query keys, 60s stale time, enabled only when owner/repo are non-empty).

## Hub UI

`ExploreScreen.tsx` treats `repoDetail` as a hub rendered with the same bento-grid language as the Home screen (`HomeScreen.tsx`), so the Explore tab feels like the rest of the app instead of a settings page:

- **Row 1** — two filled-primary tiles side-by-side: **Browse Files** (left) + **Pull Requests** (right). Each tile is 130 pt tall with a 20 pt corner radius, a white circular icon badge top-left, a large faded background icon, and a bold white title + small white subtitle. Press feedback matches the Home tiles (opacity 0.92 + scale 0.985).
- **Row 2** — one full-width accent-colored tile: **Issues**. Uses the same dimensions and badge treatment but on the accent surface (the same surface Home's "Thought Dump" tile uses), with a translucent-white square badge so the accent reads through.

Tapping any tile navigates into the corresponding view (`fileTree`, `prList`, `issueList`). Browse Files is the primary CTA; PRs and Issues are first-class peers (per #937).

The branch picker pill was promoted to the hub header (it already existed in the `fileTree` header on `ExploreScreen.tsx`). Both the hub and the file tree share a single `selectedBranch` state plus the existing `openBranchPicker` callback, so a branch picked on the hub is reflected in the file tree without duplicate state.

The ExploreScreen is now provider-agnostic: `grep -r "GitHubService" src/screens/ExploreScreen.tsx` returns zero results. Pull/issue data is obtained exclusively via `getGitHostService(selectedRepo.provider)`.

## Error states

`prList` and `issueList` use the shared `<EmptyState>` component (icon + title + subtitle, centered with the standard `py-16 px-6` rhythm) plus a `<Button primary>` **Retry** action that calls `query.refetch()`. The icon, title, and copy swap by error subtype:

- **HTTP 403** → `lock-closed-outline` icon, `permissionTitle` ("Permission denied"), `permissionError` subtitle, **and** a secondary **Open Settings** ghost button that navigates to `MainTabs → SettingsTab` (where the user can re-authorize the token).
- **Other errors** → `cloud-offline-outline` icon, `loadErrorTitle` ("Couldn't load"), `loadError` subtitle, **Retry** only.

This replaces the previous ad-hoc `View` + `Ionicons` + `Text` block that rendered a generic `alert-circle-outline` glyph and a single sentence in `textSecondary` color — which had no action, no icon hierarchy, and no title/subtitle split, and read like a `console.error` left on screen.

## i18n

Eight new `explore.*` keys added to all six locales (en/es/fr/de/ja/ko): `pullRequests`, `issues`, `noPullRequests`, `noIssues`, `filterOpen`, `filterClosed`, `openInBrowser`, `loadError`. All six locales verified by the existing `__tests__/i18n-key-parity.test.ts` gate.

## Test coverage

- `__tests__/services/git/gitHost-issues-pulls.test.ts` — 13 tests across all 4 providers covering normalization, state mappings (`merged` → `closed` for GitLab, `opened` → `open`, PR-item filtering for Gitea/Forgejo `/issues`), auth headers (`PRIVATE-TOKEN` vs `Authorization: token X`), and empty-on-error paths.
- `__tests__/hooks/useGitHostQueries.test.ts` — 5 tests: normalization happy path, the empty owner/repo "disabled" gate, and default-state behavior.

## Bug fixes

- **Double top safe-area inset in the three hub views** — `fileTree`, `prList`, and `issueList` used `<SafeAreaView edges={['top', 'bottom']}>` while also padding their content by `headerHeight` (which already includes `insets.top`). That added a full extra status-bar-height (~59 pt) of blank space between the header and the first row. Fixed by switching all three to `edges={['bottom']}`, matching `repoList`/`repoDetail`.

## Must NOT do (out of scope)

- Creating / merging PRs, commenting on issues (data layer for `createPullRequest` already exists on `GitHubService` but the UI for it is a separate feature).
- Native PR/issue detail screens. Tap → `Linking.openURL` is the minimum bar from #937.
- Pagination beyond page 1 (50 items) — matches the existing GitHub convention in `GitHubService.getIssues/getPullRequests`.

## Files

- `src/services/git/GitHost.ts` — new types + interface methods
- `src/services/git/GitHubHostService.ts` — delegates to existing `GitHubService`
- `src/services/git/GitLabService.ts` — GitLab MR + issues endpoints
- `src/services/git/GiteaLikeHostService.ts` — Gitea + Forgejo (shared class)
- `src/hooks/useGitHostQueries.ts` — TanStack Query hooks
- `src/screens/ExploreScreen.tsx` — hub UI + prList/issueList views
- `src/i18n/{en,es,fr,de,ja,ko}.json` — 14 new keys each (8 from the feature + 6 from the polish: `permissionTitle`, `loadErrorTitle`, `browseFilesSub`, `pullRequestsSub`, `issuesSub`, `openSettings`)
- `__tests__/services/git/gitHost-issues-pulls.test.ts` — host tests
- `__tests__/hooks/useGitHostQueries.test.ts` — hook tests
