export function canPersistNoteTags(format?: string): boolean {
  return format === 'markdown' || format === 'neorg' || format === 'org';
}
