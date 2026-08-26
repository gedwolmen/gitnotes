let _activeHost: string | null = null;

export function getActiveGitHost(): string | null {
  return _activeHost;
}

export function setActiveGitHost(host: string | null): void {
  _activeHost = host;
}

export function clearActiveGitHostCache(): void {
  _activeHost = null;
}
