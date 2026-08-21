# Security & Dependabot Alerts

> How GitHub security findings are tracked and resolved in this repo.

## GitHub security surface

As of this writing the repo's "Security and quality" overview shows:

| Surface | Status |
|---------|--------|
| Dependabot alerts | 3 open (see below) |
| Code scanning | Not configured (no analysis) |
| Secret scanning | No open alerts |

## Dependabot alerts

Dependabot flags transitive npm dependencies resolved via `yarn.lock`. The
current open alerts, their root causes, and how each is handled:

### `uuid` — alert #4 (medium, fixable)

- **Advisory**: CVE-2026-41907 — missing buffer bounds check in `v3`/`v5`/`v6`
  when a caller-supplied `buf` is too small.
- **Dependency chain**: `expo-sharing → @expo/config-plugins → xcode → uuid@^7.0.3`.
- **Fix**: yarn `resolutions` pins `uuid@^11.1.1` (first patched release).
  Pinned to the 11.x line on purpose: v13+ is ESM-only and would break
  `xcode`'s CommonJS `require('uuid')`. v11 ships a `dist/cjs` build, so the
  CJS consumer keeps working (verified at install time).
- Note: `uuid` is not imported by app code (`src/`) — the resolution only
  lifts the transitive copy.

### `image-size` — alerts #42 & #43 (high, NOT fixable yet)

- **Advisories**: CVE-2025-71329 (JXL/HEIF parsers) and CVE-2025-71330 (ICNS
  parser) — denial of service via infinite loops on crafted images.
- **Dependency chain**: `expo → @expo/metro → metro → image-size@^1.0.2`.
- **Why it stays open**: the vulnerable range is `<= 2.0.2` and npm's latest
  published release **is** 2.0.2 — no patched version exists. The upstream fix
  (image-size/image-size PR #439) is merged-able but unreleased.
- **Practical exposure**: `image-size` is used by metro during bundling only;
  it is not shipped in the app bundle, so the DoS requires a malicious image
  being processed at build time. Re-check Dependabot periodically; close the
  alerts by bumping the resolution as soon as a patched release lands.

## How to re-check

```bash
gh api "repos/gedwolmen/gitnotes/dependabot/alerts?state=open&per_page=100"
gh api "repos/gedwolmen/gitnotes/code-scanning/alerts?state=open"
gh api "repos/gedwolmen/gitnotes/secret-scanning/alerts?state=open"
```

Or view the [Security overview](https://github.com/gedwolmen/gitnotes/security) on GitHub.
