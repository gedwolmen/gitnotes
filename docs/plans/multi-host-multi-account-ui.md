# Multi-host × Multi-account UI

## Why

The factory at `src/services/git/gitHostFactory.ts` already routes `github | gitlab | gitea | forgejo`, and `GitService`, `RepoPullService`, `NoteGitHubSyncService`, `RepoFolderPickerModal` all take a `provider` argument. The data path works.

What's missing is the user-facing surface to actually pick a host and connect a token. Today:

- `StoredAccount` (`src/services/AccountStorage.ts:13`) has no `provider` field — every saved account is implicitly GitHub.
- The "Add Account" modal hard-codes GitHub verify (`SettingsScreen.tsx:486` → `AuthService.addAccount` → `GitHubService.verify`).
- `GitLabAuthContext` exists at `src/contexts/GitLabAuthContext.tsx` but is **not mounted** in `App.tsx`.
- No host picker, no self-hosted URL input, no per-host token validation.
- The repo picker modal hardcodes `defaultProvider === 'github'` and the `AddRepoModal.tsx` flow only allows GitHub URLs.

The user explicitly asked for **multi-account AND multi-repo** across **GitHub, GitLab, Gitea, Forgejo**. That's plan B.

## Goals

1. A single account can hold **one token per host** (so a user with one GitHub account and one self-hosted Gitea can list both in the account switcher, with the host badge on each).
2. The Add Account flow lets a user pick **host + (optionally) instance base URL + token** and validates against the matching host's API.
3. Account switching is host-aware: switching activates the right `GitHubService` / `GitLabService` / `GiteaLikeHostService` token, or picks a sibling account on the same host when the current host has no token.
4. The "Add repo" flow lets the user pick a host and browse that host's repos. Repo picker shows accounts grouped by host.
5. Self-hosted GitLab/Gitea/Forgejo: stored per token (instance baseURL persisted alongside the token, never in `StoredAccount`).
6. Existing GitHub-only installs keep working unchanged. Old single-account rows migrate on first load.

## Non-goals

- OAuth/device flow for any host — tokens only.
- Repo-level per-host permissions (one token per host per account is the granularity).
- Changing the `GitHost*Service` API surface — already correct.
- Replacing `GitHubPicker` / `GitContextPicker` style — they keep working, they just learn to label non-GitHub accounts.

## Design

### Data model

Extend `StoredAccount` (the storage shape is the schema — no AsyncStorage v2 migration needed since the field is additive and the loader fills defaults):

```ts
// src/services/AccountStorage.ts
export interface StoredAccount {
  id: string;             // existing — stable across migrations
  login: string;
  name: string;
  email: string;
  avatarUrl: string;
  addedAt: number;
  // NEW — list of host connections on this account.
  // Empty for legacy GitHub-only accounts, populated as user connects more hosts.
  hostIds: string[];      // ←── NEW
}

export interface HostConnection {
  // Composite key = accountId:hostId
  id: string;
  accountId: string;
  provider: GitHostProvider; // 'github' | 'gitlab' | 'gitea' | 'forgejo'
  instanceBaseUrl?: string;  // null/undefined for SaaS github.com / gitlab.com / gitea.com / codeberg.org
  hostLogin: string;         // user login *on this host* (can differ from account.login for self-host)
  hostUserId: number;        // provider-side numeric id
  name: string;
  email?: string;
  avatarUrl?: string;
  addedAt: number;
}

// Secrets live in SecureStore; UI never sees the raw token past verify.
export interface StoredToken {
  accountId: string;
  hostId: string;            // matches one HostConnection.id (which contains ":provider:instanceKey")
  token: string;
}
```

Why this shape:
- One account, many host connections (matches the user's mental model: "I have one me, I use it on GitHub *and* my work GitLab").
- Tokens keyed by `accountId:hostId` so we can have the same person signed into two GitLab instances without collision.
- `instanceBaseUrl` nullable ⇒ GitHub/GitLab.com default to their public instance without storing "https://github.com" on every row.

### Service surface

```ts
// src/services/AuthService.ts (renamed internally; old class stays for compat)
export interface HostConnectionSummary {
  id: string; accountId: string; provider: GitHostProvider; login: string; name: string;
  avatarUrl?: string; instanceBaseUrl?: string; addedAt: number;
}
export interface AccountSummary {
  account: StoredAccount;
  hosts: HostConnectionSummary[];   // may be empty for legacy GitHub-only account
  activeHostId: string | null;     // which host the current token belongs to
}

class AuthService {
  static listAccountSummaries(): Promise<AccountSummary[]>;
  static getActiveSummary(): Promise<AccountSummary | null>;

  // New connect flow
  static connectHost(input: {
    provider: GitHostProvider;
    token: string;
    instanceBaseUrl?: string;
    // when adding to an existing account
    accountId?: string;
  }): Promise<{ account: StoredAccount; host: HostConnectionSummary }>;

  static disconnectHost(hostId: string): Promise<void>;
  static switchToHost(hostId: string): Promise<{ ok: true; summary: AccountSummary } | { ok: false; reason: 'not-found' | 'no-token' }>;
  static switchAccount(accountId: string): Promise<{ ok: true; summary: AccountSummary } | { ok: false; reason: 'no-hosts' }>;
}
```

The legacy `AuthService.addAccount(token)` and `AuthService.setToken(token)` remain as thin wrappers around `connectHost({ provider: 'github', token })` so every existing call site keeps compiling.

### Context

Replace `AuthContext` with `AccountsContext` (keep `AuthContext` as a thin re-export so the existing `useAuth` hook doesn't break):

```ts
interface AccountsContextValue {
  activeSummary: AccountSummary | null;          // null when nothing connected
  accounts: AccountSummary[];
  isLoading: boolean;
  connectHost(input): Promise<{ ok: boolean; error?: string }>;
  disconnectHost(hostId): Promise<void>;
  switchToHost(hostId): Promise<boolean>;
  switchAccount(accountId): Promise<boolean>;
  removeAccount(accountId): Promise<void>;      // drops all hosts under it
  // Convenience for legacy code
  isAuthenticated: boolean;
  authState: AuthState;                         // synthesised from active host
  addAccount(token): Promise<StoredAccount|null>;   // delegates to connectHost github
  setToken(token): Promise<boolean>;
  clearToken(): Promise<void>;
  refreshAccounts(): Promise<void>;
}
```

`GitLabAuthContext` gets **removed** — its data now flows through `AccountsContext`. (`App.tsx` provider tree slims down.)

### Services that need to call the active host

Three places currently take `provider` as a parameter and default to 'github':
- `GitService` (`src/services/GitService.ts:207,291`) — repo CRUD
- `RepoPullService` (`src/services/RepoPullService.ts:159,184,688`)
- `NoteGitHubSyncService` (`src/services/NoteGitHubSyncService.ts:287,377,...`)

We need a single resolver:

```ts
// src/services/git/activeHost.ts
export async function getActiveGitHost(): Promise<{ provider: GitHostProvider; token: string; baseUrl?: string; host: GitHostFullService }>;
```

This reads the active `AccountSummary`'s `activeHostId`, fetches its token, and constructs a `GitHostFullService` that knows its base URL. For self-hosted hosts, we instantiate a fresh `GiteaLikeHostService(provider, baseUrl)` per active host (the existing singletons in the factory cover SaaS defaults; self-hosted instances need fresh objects to avoid leaking state between users).

Existing callers continue to take `provider` as an explicit argument. The only change is that we **also** persist which provider each repo belongs to (the GitHostRepoRef already carries `provider` — good — but repos stored on disk need to round-trip it).

### Repos on disk

`Note` and `Folder` models already carry `owner`/`repo` fields; the legacy code assumes GitHub. Repo `id` is already `<provider>:<owner>/<repo>` (`GitHost.ts:178`). What needs to change:

- The `AddRepoModal` flow learns to ask **which host** the repo lives on (new picker step), then routes to the right host service.
- `recentItems` and the repo picker already filter by `provider`, so listing repos from multiple hosts becomes a natural "tabs" UI.

### UI surface (Settings → Accounts)

Replace the existing "Add Account" modal with a **Host Connection** modal. Re-use existing screens:

1. **Settings → Accounts** group: list every `AccountSummary` with their connected host chips. Each row shows: avatar, name, host badges (`GitHub`, `GitLab`, `mywork.gitlab` for self-host), active highlight. Tap → opens Account Detail.
2. **Account Detail**: shows connected hosts, lets user add another host, disconnect a host, switch active host, or remove the whole account.
3. **Connect Host** modal (used by both Account Detail and a top-level "Connect" entry point):
   - Step 1: pick provider (GitHub / GitLab / Gitea / Forgejo) with logo + description.
   - Step 2 (GitLab/Gitea/Forgejo only): optional "Self-hosted instance URL" field, prefilled with `https://gitlab.com` etc.
   - Step 3: token field + "Test connection" button. On success, shows resolved user identity and an Add / Save button.
4. **Account Switcher** in the existing picker modal: when user has ≥2 accounts OR ≥1 account with multiple host connections, show them as `account → host` pairs and a single "Switch" action that calls `switchToHost` or `switchAccount`.

### Migration on first load

When `accounts` is loaded:
- A legacy single-account entry (no `hostIds`) is upgraded in-place: we add a synthetic `HostConnection` for `provider: 'github'` with a guessed `hostLogin === account.login`, **but only if** a GitHub token is found via the legacy storage key. If no token exists, the account row stays but is treated as `hosts: []` until the user reconnects.
- Existing repo `provider` is `'github'` by default for any repo id that doesn't have a `:` prefix already (which all current ids do).

## Tasks

1. Schema + storage
   - `src/services/AccountStorage.ts`: add `HostConnection`, `hostIds`, persistence helpers for connections and per-(account,host) tokens. Keep `getActiveToken()` legacy behaviour intact.
   - First-load migration in `AuthService.checkAuthState()` populates a synthetic GitLab-less, Forgejo-less, Gitea-less set.

2. AuthService expansion
   - Add `connectHost`, `disconnectHost`, `switchToHost`, `switchAccount`, `listAccountSummaries`, `getActiveSummary`.
   - Wire the new methods through `validateToken(hostProvider, token, baseUrl?)` which routes to the matching host's verify endpoint. Add `validateHostToken` for non-GitHub.
   - Legacy `setToken` / `addAccount` delegate to `connectHost({ provider: 'github', token })`.

3. Replace `AuthContext` with `AccountsContext` (`src/contexts/AccountsContext.tsx`). Keep `useAuth` re-export.
   - Delete `src/contexts/GitLabAuthContext.tsx` after migration; remove its provider in `App.tsx`.

4. Active host resolver
   - `src/services/git/activeHost.ts` exporting `getActiveGitHost()` and `useActiveGitHost()` hook.
   - Re-point `GitService`, `RepoPullService`, `NoteGitHubSyncService` callers that previously called `getGitHostService('github')` without a provider to consult the active host.

5. AddRepoModal changes
   - `src/components/AddRepoModal.tsx`: add host picker step, route to the right host service, store `provider` on the resulting repo id.

6. Repo folder picker
   - `src/components/RepoFolderPickerModal.tsx`: add host picker step at the top, default to active host, list repos per host.

7. Settings UI
   - `src/components/settings/SettingsContent.tsx`: replace the single "Connect GitHub" row with an Accounts group that lists every account × host chip.
   - `src/components/settings/SettingsModals.tsx`: split `TokenModal` into a `ConnectHostModal` with the 3-step flow above.
   - New screen `AccountsScreen` for the per-account detail and host management. Registered in `AppNavigator`.

8. Account switcher
   - Update the account chip / switcher (currently in `SettingsContent`'s `accounts` row) to render `account × host` rows.

9. Tests
   - Unit: `AccountStorage` migration, `AuthService.connectHost/disconnectHost/switchToHost`, `validateHostToken` per host.
   - Integration: `SettingsContent` renders new "Accounts" group; `ConnectHostModal` happy path for github.com and self-hosted Gitea (mocked axios).
   - Update `__tests__/screens/SettingsScreen.test.tsx` and `__tests__/services/AccountStorage.test.ts`.

10. i18n strings (en, de, es, fr, ja, ko) for: "Accounts", "Connect host", "Host", "Self-hosted URL", "Disconnect", "Switch to", "Remove account", "This account has no connected hosts".

## Risks

- **SecretStore key churn.** Per-host token keys change shape. Old `@gitnotes:account_token:<id>` keys stay readable as a fallback during migration so users don't have to re-auth.
- **Repo lose provider tag on cross-host clone.** A repo added under GitHub then viewed on a Gitea login will silently appear "missing" because the lookup key includes host. Mitigation: in repo lookups, fall back to host=`github` when a non-GitHub provider has no matching local row.
- **Multi-host regression in clone/sync.** 1.2.0 multi-host write parity plans (`docs/plans/...`) already cover GitService/RepoPullService consistency — verify our changes don't regress those tests.
- **Test fixture churn.** Several tests assert `accounts[0].login === 'foo'` etc.; they should still pass because `StoredAccount` is upward-compatible.

## Done when

- `npx tsc --noEmit` clean.
- `npx jest` clean (all existing + new tests).
- ESLint clean.
- Manual smoke: on a fresh install, user connects GitHub → adds self-hosted GitLab → switches → both host's repos appear in the repo picker → notes sync via the right host.
- The "Open Settings → Accounts" screenshot shows multiple accounts × multiple hosts as separate rows.
