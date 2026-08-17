# Token Scope Error Messaging

Users hitting GitHub API 403s (rate limits, SAML, or — most relevant here — a
fine-grained PAT that lacks the repository) now see the exact scopes their
token needs, both in the sync error message and in the token-add UI.

## Problem

- `src/services/http.ts` collapsed every GitHub API error to
  `GitHub API error: <status>`, throwing away the response body. A 403 from
  "Resource not accessible by integration" (token missing the repo) is
  indistinguishable from a rate-limit 403 at the message layer.
- `formatSyncError` had a single combined matcher `['rate limit', '403']` that
  labeled **every** 403 as "GitHub rate limit hit — try again in a few
  minutes". For the common case (a fine-grained PAT whose repository selection
  omits the target repo, or a classic token without `repo`) that message is
  misleading — the fix is a token-scope change, not waiting a few minutes.
- The token-add surfaces (`settings.tokenDescription` in `SettingsModals`,
  `connectHost.help.github` in `ConnectHostModal`) said "fine-grained token
  with write access" without naming the classic-token alternative or the
  repository-selection requirement.

## Changes

### 1. `http.ts` keeps GitHub's sanitized reason

`extractGitHubReason` pulls the human-readable reason from the error response
body (GitHub returns `{ message, documentation_url }` JSON, or a raw string)
and appends it: `GitHub API error: 403 (Resource not accessible by
integration)`. Bearer tokens are scrubbed defensively and the reason is
truncated at ~100 chars. Status-less errors still degrade to `Network error`.

### 2. `formatSyncError` separates rate limits from scope 403s

The 403 matcher is split into two ordered matchers:

- **Rate-limit first** (`rate limit`, `rate-limit`, `ratelimit`, `too many
  requests`, `429`) → "GitHub rate limit hit — try again in a few minutes."
  This must precede the generic 403 matcher because GitHub signals rate limits
  with a 403 status plus a rate-limit body.
- **403 / permission** (`403`, `not accessible`, `resource not accessible`,
  `permission denied`, `must have push access`, `integration`) → tells the user
  the exact scopes: *"Your token can't access this repo — use a fine-grained
  token with Contents: Read and write (and the repo selected) or a classic
  token with the repo scope."*

Now that `http.ts` surfaces the body, a rate-limit 403 ("API rate limit
exceeded...") still matches the rate-limit matcher, while a permission 403
("Resource not accessible by integration") correctly gets the scopes message.

### 3. Token-add UI spells out the scopes

`settings.tokenDescription` (Settings → Add GitHub Account token modal) and
`connectHost.help.github` (Connect host modal) now state: a fine-grained token
needs Contents: Read and write on each repository — with the repository
selected in the token — or a classic token with the `repo` scope. Updated in
all six locales (en, es, fr, de, ja, ko), keeping the key-parity test green.

## Tests

- `__tests__/services/git/formatSyncError.test.ts`: a plain 403 and a GitHub
  permission-reason 403 map to the scopes message (never "rate limit"); a
  rate-limit 403 or explicit 429 keeps the rate-limit message; existing
  matchers (push rejected, 401, 409, 422, 5xx, network) and the fallbacks are
  pinned.
- `__tests__/empty-error-guard.test.ts`: the http interceptor appends the
  GitHub reason, scrubs bearer tokens from it, keeps a plain status error when
  no reason exists, and still degrades status-less empty messages to
  `Network error`.
- `__tests__/i18n-key-parity.test.ts` + `syncFailure.test.ts`: unchanged and
  passing.