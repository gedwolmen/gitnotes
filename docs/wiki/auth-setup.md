# GitHub Token Setup

How to create a Personal Access Token (PAT) that works with GitNotēs, and how to read the sync errors that point back at the token.

## Fine-grained vs classic

| | Fine-grained (recommended) | Classic |
|---|---|---|
| Token prefix | `github_pat_…` | `ghp_…` |
| Repo access | Explicitly selected repos, or all repos | Every repo your account can see (`repo` scope) |
| Permissions model | Per-permission toggles | Coarse scopes |
| Expiry | Mandatory expiry choice | Optional |

Use **fine-grained** when you only want to sync a few repos. Use **classic** if you keep creating new repos and don't want to re-issue tokens.

## Required access per feature

| Feature | Fine-grained permission | Classic scope |
|---|---|---|
| Notes / todos / canvases sync | Contents: **Read and write** (+ Metadata: Read-only, auto-selected) | `repo` |
| AI tools over Issues / PRs | Pull requests: Read and write; Issues: Read and write | `repo` |
| Clone mode first pull | same as sync | `repo` |

Nothing else is required. A token with Contents: Read-only will read fine and then silently fail every push.

## Granting access to multiple repos

- **All repositories** — easiest; future repos are covered automatically.
- **Only select repositories** — tick each repo. Adding a new repo later means editing the token.

## Revoking and rotating

Tokens are managed at <https://github.com/settings/tokens> (fine-grained tab lists `github_pat_…` tokens). Delete a token there to revoke it instantly; GitNotēs will start failing with a credentials error on the next sync. Rotate by generating a replacement and pasting it into **Settings → GitHub → token**, which overwrites the stored value.

## Troubleshooting

| Error shown in app | GitHub-side cause | Fix |
|---|---|---|
| "GitHub rejected the token…" | Copied a partial/expired/revoked token | Re-copy the full token; check it hasn't expired |
| "Your token can't access this repo…" | Repo not selected under Repository access, or Contents is Read-only | Edit the token: add the repo, set Contents: Read and write |
| Push rejected, branch diverged | Normal git divergence, not a token problem | Use Stage screen → Pull, resolve, push |
| 403 "Resource not accessible" | Fine-grained token created with no permissions picked | Add Contents: Read and write under Repository permissions |

## Storage & security

The token is stored in the device keychain (via SecureStore), never in the notes repository or plaintext storage, and is sent only to `github.com` endpoints over TLS. GitNotēs never uploads the token anywhere else. Treat it like a password: minimum expiry that works for you, revoke immediately if a device is lost.
