/**
 * Git2 settings module — configuration screens, platform adapters, and stores.
 *
 * GPL-3.0 derivative of GitSync.
 */

// Settings store
export {
  useGit2SettingsStore,
  type AuthorIdentity,
  type CommitTemplate,
  type SslPolicy,
  type GitignoreRule,
  type PerRepoBehavior,
  type Git2Settings,
  type Git2SettingsState,
} from './git2SettingsStore';

// Screens
export { Git2SettingsScreen } from './Git2SettingsScreen';
export { AuthorIdentityScreen } from './AuthorIdentityScreen';
export { CommitTemplatesScreen } from './CommitTemplatesScreen';
export { SyncSchedulingScreen } from './SyncSchedulingScreen';
export { SslPolicyScreen } from './SslPolicyScreen';
export { GitignoreScreen } from './GitignoreScreen';
export { PerRepoBehaviorScreen } from './PerRepoBehaviorScreen';

// Android entry adapters
export {
  registerAndroidAdapters,
  unregisterAndroidAdapters,
  handleQuickTileTrigger,
  handleWidgetSyncTrigger,
  type AndroidTrigger,
  type AndroidTriggerResult,
} from './AndroidEntryAdapters';

// iOS shortcut adapters
export {
  registerIOSShortcuts,
  unregisterIOSShortcuts,
  syncAllReposShortcut,
  syncRepoShortcut,
  checkSyncStatusShortcut,
  toggleSyncModeShortcut,
  SHORTCUT_PHRASES,
  type IOSShortcutAction,
  type IOSShortcutResult,
} from './IOSShortcutAdapters';
