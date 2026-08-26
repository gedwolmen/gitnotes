import type { GitHostService, GitHostWriteService } from './GitHost';

export function getGitHostService(_provider?: string, _host?: string): (GitHostService & GitHostWriteService) | null {
  return null;
}
