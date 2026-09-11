const CORRUPTION_ERROR_PATTERN = /Could not find object|not foundobject|object not found|NotFoundError|Packfile trailer mismatch/i;

export function isGitCorruptionError(message: string): boolean {
  return CORRUPTION_ERROR_PATTERN.test(message);
}
