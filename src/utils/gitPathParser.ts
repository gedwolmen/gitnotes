// Canonical owner/repo parser. Accepts:
//   facebook/react
//   github.com/facebook/react
//   https://github.com/facebook/react
//   facebook/react.git
//   https://gitea.example.com/owner/repo  (when baseUrl matches)
//   gitea.example.com/owner/repo          (when baseUrl matches)
//
// `parseRepoPath` is the original GitHub-only shape and is preserved
// for every existing call site. `parseRepoPathAt` is the host-aware
// variant that strips an optional baseUrl prefix before splitting.
// Phase 1 of the self-hosted work uses `parseRepoPathAt` at the
// adapter boundary; the rest of the app keeps calling
// `parseRepoPath` unchanged.
export function parseRepoPath(repoPath: string): { owner: string; repo: string } | null {
  return parseRepoPathAt(repoPath, undefined);
}

export function parseRepoPathAt(
  repoPath: string,
  baseUrl: string | undefined,
): { owner: string; repo: string } | null {
  let cleaned = repoPath.replace(/\.git$/, '').trim();

  // Strip the host-specific baseUrl if the user pasted a full URL.
  if (baseUrl) {
    const escaped = baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\/+$/, '');
    cleaned = cleaned
      .replace(new RegExp(`^https?://${escaped}/?`, 'i'), '')
      .replace(new RegExp(`^${escaped}/?`, 'i'), '');
  }

  // Backward-compat: strip github.com prefixes for the GitHub case.
  cleaned = cleaned
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/^github\.com\//i, '');

  const parts = cleaned.split('/').filter((p) => p.length > 0);
  if (parts.length >= 2) {
    return { owner: parts[0], repo: parts[1] };
  }
  return null;
}
