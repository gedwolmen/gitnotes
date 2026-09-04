/**
 * Shared sanitizer for raw sync errors surfaced to the user. Both the
 * git push path (LocalGitWriter) and the GitHub Contents-API
 * path (Note/Todo/Canvas/Template sync services) leak wall-of-text errors
 * with refs, ANSI codes, force-flag hints, etc. We map the common cases
 * to one-line user-facing strings and strip jargon from anything that
 * doesn't match a known matcher so the snackbar never shows raw stderr.
 *
 * Keep the raw text in `console.warn` at the call site — this helper is
 * for the visible UI surface only.
 */

export type SyncOp = 'upsert' | 'delete';

interface Matcher {
  /** Case-insensitive substrings; any one matching wins. */
  needles: string[];
  message: string;
}

const MATCHERS: Matcher[] = [
  {
    needles: ['push rejected', 'not a simple fast-forward', 'non-fast-forward', 'one or more branches were not updated', 'fetch first'],
    message: 'Someone else changed this on GitHub. Pull and try again.',
  },
  {
    needles: ['shallow', 'unshallow', 'shallow update not allowed'],
    message: 'Local clone history is incomplete. Pull to refresh it, then Push again.',
  },
  {
    needles: ['cannot lock ref'],
    message: 'Branch is locked on GitHub. Check branch protection rules.',
  },
  {
    needles: ['Permission denied (publickey)', 'publickey', 'ssh auth', 'authentication failed', 'could not read from remote repository', 'SSH_AUTH'],
    message: 'SSH key not recognized by GitHub. Please check that your SSH key is added to your account.',
  },
  {
    needles: ['bad credentials', '401', 'not authorized'],
    message:
      "GitHub rejected the token. Check you copied the full token (starts with ghp_ or github_pat_) — and that it wasn't expired or revoked.",
  },
  {
    // Must precede the generic 403 matcher: GitHub signals API rate limits
    // with a 403 status plus a rate-limit body (now surfaced by http.ts).
    needles: ['rate limit', 'rate-limit', 'ratelimit', 'too many requests', '429'],
    message: 'GitHub rate limit hit — try again in a few minutes.',
  },
  {
    // A non-rate-limit 403 means the token lacks access. Name the scopes so
    // the user knows exactly what to grant.
    needles: ['403', 'not accessible', 'resource not accessible', 'must have push access', 'integration'],
    message: "Your token can't access this repo — use a fine-grained token with Contents: Read and write (and the repo selected) or a classic token with the repo scope.",
  },
  {
    needles: ['409'],
    message: 'This file changed on GitHub. Pull and try again.',
  },
  {
    needles: ['422'],
    message: 'GitHub rejected the change. Try again.',
  },
  {
    needles: ['500', '502', '503', '504'],
    message: 'GitHub is having trouble — will retry.',
  },
  {
    needles: ['network', 'fetch', 'econn', 'timeout', 'offline'],
    message: "No connection. Will retry when you're back online.",
  },
  {
    needles: ['packfile trailer mismatch', 'packfile may be corrupted'],
    message: 'Sync stalled. Pull to recover.',
  },
    {
    needles: ['internal error caused this command to fail'],
    message: 'Sync failed. Pull to retry.',
  },
  {
    needles: ['could not generate', 'PushRejectedError', 'branch has diverged'],
    message: 'Push rejected — your branch has diverged from remote. Pull remote changes first.',
  },
  {
    needles: ['modified on github since', 'was modified on github since'],
    message: 'SHA conflict — remote was updated. Pull to merge, then push again.',
  },
  {
    needles: ['could not find', 'not found', 'no remote ref found', 'cannot discard without an origin'],
    message: 'Push rejected — branch may not exist on remote or remote ref is missing. Push a commit first.',
  },
];

function fallbackFor(op?: SyncOp): string {
  if (op === 'delete') return "Couldn't delete from GitHub";
  return 'Sync to GitHub failed';
}

/**
 * Strips noisy bits from raw error text before we run substring matching.
 * Order matters: ANSI first, then structural (Error: prefix, ref names,
 * "force: true" hint), then trim.
 */
function stripJargon(raw: string): string {
  let out = raw;
  // ANSI escape codes (e.g., \x1b[31m).
  // eslint-disable-next-line no-control-regex
  out = out.replace(/\x1b\[[0-9;]*m/g, '');
  // Repeated "Error: " prefixes.
  out = out.replace(/^(Error:\s*)+/i, '');
  // Hint that surfaces in PushRejectedError text.
  out = out.replace(/Use\s+["']?force:\s*true["']?\s*to\s+override\.?/gi, '');
  // refs/heads/<branch> — rarely meaningful to users.
  out = out.replace(/refs\/heads\/\S+/g, '');
  // Stack-trace–looking parens with file paths, e.g. "(src/foo/bar.ts:12:34)".
  out = out.replace(/\(\/?[^\s()]+\.[a-z]+:\d+:?\d*\)/gi, '');
  return out.replace(/\s{2,}/g, ' ').trim();
}

export function formatSyncError(raw: string | undefined, op?: SyncOp): string {
  if (!raw) return fallbackFor(op);
  const cleaned = stripJargon(raw);
  const haystack = cleaned.toLowerCase();
  for (const matcher of MATCHERS) {
    if (matcher.needles.some((n) => haystack.includes(n))) {
      return matcher.message;
    }
  }
  return fallbackFor(op);
}
