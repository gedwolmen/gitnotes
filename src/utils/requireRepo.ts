import { Alert } from 'react-native';

/**
 * Guard for "create" entry points (new note, new todo, new journal,
 * pick template, …). Without at least one configured repository there's
 * nowhere for the created item to land, so we surface an Alert that
 * points users to Settings instead of letting them produce orphaned
 * data.
 *
 * Returns `true` when the caller should proceed; otherwise the Alert
 * is already showing and the caller should bail.
 */
export function requireRepo(
  hasRepo: boolean,
  options: { kind: 'note' | 'todo' | 'journal' | 'template'; onOpenSettings?: () => void },
): boolean {
  if (hasRepo) return true;

  const noun =
    options.kind === 'note' ? 'note'
    : options.kind === 'todo' ? 'todo'
    : options.kind === 'journal' ? 'journal entry'
    : 'template';

  Alert.alert(
    'Add a repository first',
    `You need to connect at least one GitHub repository before creating a ${noun}.`,
    options.onOpenSettings
      ? [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: options.onOpenSettings },
        ]
      : [{ text: 'OK' }],
  );

  return false;
}
