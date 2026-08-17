// Canonical owner/repo parser. Accepts:
//   facebook/react
//   github.com/facebook/react
//   https://github.com/facebook/react
//   facebook/react.git
//   vidwadeseram/test-notes.git/            (trailing slash)
//   git@github.com:vidwadeseram/test-notes.git  (scp syntax)
//   ssh://git@github.com/vidwadeseram/test-notes.git
export function parseRepoPath(repoPath: string): { owner: string; repo: string } | null {
  let cleaned = repoPath.trim();
  if (!cleaned) return null;

  // Drop trailing slashes so `.git/` still matches the `.git` strip below.
  cleaned = cleaned.replace(/\/+$/, '');

  // scp syntax: git@github.com:owner/repo.git -> owner/repo.git
  cleaned = cleaned.replace(/^[^@\s]+@[^:\s]+:/, '');

  // ssh URL: ssh://git@github.com/owner/repo.git -> owner/repo.git
  cleaned = cleaned.replace(/^ssh:\/\//i, '');
  cleaned = cleaned.replace(/^[^@\s]+@[^\/\s]+\/?/, '');

  // Drop the trailing `.git`.
  cleaned = cleaned.replace(/\.git$/, '');

  // Drop leading GitHub web prefixes.
  cleaned = cleaned.replace(/^https?:\/\/github\.com\//i, '');
  cleaned = cleaned.replace(/^github\.com\//i, '');

  const parts = cleaned.split('/');
  if (parts.length < 2) return null;

  const owner = parts[0];
  const repo = parts[1];
  if (!isOwnerSegment(owner) || !isRepoSegment(repo)) return null;

  return { owner, repo };
}

function isOwnerSegment(value: string): boolean {
  return value.length > 0
    && !value.includes('@')
    && !value.includes(':')
    && !/^\.+$/.test(value);
}

function isRepoSegment(value: string): boolean {
  return value.length > 0 && !/^\.+$/.test(value);
}
