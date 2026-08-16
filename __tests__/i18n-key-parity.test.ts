/**
 * i18n key-parity regression guard.
 *
 * Asserts every leaf key in `en.json` exists in es/fr/de/ja/ko — EXCEPT for a
 * documented snapshot of pre-existing missing keys (the 205-key gap found by
 * the i18n audit: settings 80, notes 27, chat 26, canvases 18, common 17,
 * home 14, errors 8, todos 7, explore 6, accounts 1, ai 1).
 *
 * Guarantees:
 *  - any key NEWLY added to en.json must be present in all 5 locales
 *    (otherwise it shows up as a missing key outside the snapshot and fails);
 *  - the known gap cannot grow silently;
 *  - todo 4 fills the 205 keys and should then shrink/remove ALLOWED_MISSING.
 *
 * This supersedes `scripts/i18n-parity.js` as the executable parity gate.
 */
import en from '../src/i18n/en.json';
import es from '../src/i18n/es.json';
import fr from '../src/i18n/fr.json';
import de from '../src/i18n/de.json';
import ja from '../src/i18n/ja.json';
import ko from '../src/i18n/ko.json';

type Bundle = Record<string, unknown>;

/** Pre-existing en-only keys (identical across all 5 locales). */
const ALLOWED_MISSING: readonly string[] = [
  'accounts.settings.accountsGroup',
  'ai.availability.llamaNotInstalled',
  'canvases.createCanvas',
  'canvases.createCustom',
  'canvases.customSize',
  'canvases.deleteConfirmBody',
  'canvases.deleteConfirmTitle',
  'canvases.emptySubtitle',
  'canvases.emptyTitle',
  'canvases.heightPlaceholder',
  'canvases.namePlaceholder',
  'canvases.newCanvasA11y',
  'canvases.presets.a4',
  'canvases.presets.landscape',
  'canvases.presets.phone',
  'canvases.presets.square',
  'canvases.presets.tablet',
  'canvases.searchPlaceholder',
  'canvases.untitled',
  'canvases.widthPlaceholder',
  'chat.aiNotConfiguredBody',
  'chat.aiNotConfiguredTitle',
  'chat.cancelResponse',
  'chat.chat',
  'chat.chats',
  'chat.configRequiredBody',
  'chat.configRequiredTitle',
  'chat.couldNotDelete',
  'chat.couldNotDeleteMany',
  'chat.couldNotRename',
  'chat.defaultNewChatTitle',
  'chat.deleteBulkConfirm',
  'chat.deleteFailed',
  'chat.deleting',
  'chat.deletingMany',
  'chat.emptyStateBody',
  'chat.emptySubtitle',
  'chat.emptyTitle',
  'chat.newChat',
  'chat.renameBody',
  'chat.renameFailed',
  'chat.renameTitle',
  'chat.renaming',
  'chat.startConversation',
  'chat.stopGeneration',
  'chat.title',
  'common.beta',
  'common.cannotBeUndone',
  'common.continue',
  'common.dismiss',
  'common.filters',
  'common.later',
  'common.move',
  'common.new',
  'common.next',
  'common.refresh',
  'common.reset',
  'common.retry',
  'common.searchPlaceholder',
  'common.share',
  'common.sync',
  'common.untitled',
  'common.viewMode',
  'errors.exportFailedBody',
  'errors.exportFailedTitle',
  'errors.failedDeleteNoteBody',
  'errors.failedDeleteNoteTitle',
  'errors.failedUpdateColorBody',
  'errors.failedUpdateColorTitle',
  'errors.failedUpdatePinBody',
  'errors.failedUpdatePinTitle',
  'explore.browseFiles',
  'explore.emptySubtitleNoMatches',
  'explore.emptySubtitleNoRepos',
  'explore.emptyTitleNoMatches',
  'explore.emptyTitleNoRepos',
  'explore.loadingRepos',
  'home.appTitle',
  'home.bento.blankNote',
  'home.bento.canvasesSub',
  'home.bento.fromTemplate',
  'home.bento.fromTemplateSub',
  'home.bento.newJournal',
  'home.bento.thoughtDumpSub',
  'home.bento.todaysJournal',
  'home.format.markdown',
  'home.format.neorg',
  'home.format.org',
  'home.format.pickerTitle',
  'home.format.remember',
  'home.subtitle',
  'notes.addNoteA11y',
  'notes.backToNotes',
  'notes.createFolderError',
  'notes.createWithWikiLinks',
  'notes.createWithWikiLinksGraph',
  'notes.deleteBulkConfirm',
  'notes.graphView',
  'notes.headingNotFoundBody',
  'notes.headingNotFoundTitle',
  'notes.linkOpenFailedBody',
  'notes.linkOpenFailedTitle',
  'notes.linkTargetNotFound',
  'notes.moveFileError',
  'notes.moveFileErrorShort',
  'notes.moveNoteError',
  'notes.noNotesToDisplay',
  'notes.notFoundOffline',
  'notes.notFoundTitle',
  'notes.notFoundWithId',
  'notes.note',
  'notes.notes_',
  'notes.openNote',
  'notes.readFromGithubError',
  'notes.sameLocation',
  'notes.searchGraph',
  'notes.shaError',
  'notes.viewModeA11y',
  'settings.accountActive',
  'settings.addAccount',
  'settings.addGitHubAccount',
  'settings.addRepoFailedBody',
  'settings.addRepoFailedTitle',
  'settings.addRepoFirstForTemplates',
  'settings.apiModeDescription',
  'settings.autoSyncFailedBody',
  'settings.autoSyncFailedTitle',
  'settings.backgroundSync',
  'settings.branch',
  'settings.branchDefault',
  'settings.clear',
  'settings.clearAllFailed',
  'settings.clearAllSuccess',
  'settings.clone',
  'settings.cloneEnabledBody',
  'settings.cloneEnabledTitle',
  'settings.cloneModeDescription',
  'settings.copyToken',
  'settings.credits',
  'settings.download',
  'settings.everyMinute',
  'settings.githubRequiredBody',
  'settings.githubRequiredSyncBody',
  'settings.githubRequiredSyncTitle',
  'settings.githubRequiredTitle',
  'settings.hideToken',
  'settings.lfsDoneBody',
  'settings.lfsDoneTitle',
  'settings.lfsFailedTitle',
  'settings.lfsGithubRequiredBody',
  'settings.lfsGithubRequiredTitle',
  'settings.lockTimeout',
  'settings.lockTimeout5Min',
  'settings.migrationFailedTitle',
  'settings.migrationIssuesBody',
  'settings.migrationIssuesTitle',
  'settings.noFilesBody',
  'settings.noFilesTitle',
  'settings.noMatchingRepositories',
  'settings.noRepositoriesFound',
  'settings.nothingToSyncBody',
  'settings.nothingToSyncTitle',
  'settings.openGithubTokenSettings',
  'settings.pasteToken',
  'settings.pushEdits',
  'settings.pushedEditsBody',
  'settings.pushedEditsTitle',
  'settings.removeAccountBody',
  'settings.removeAccountTitle',
  'settings.removeRepoBody',
  'settings.removeRepoTitle',
  'settings.removeTokenBody',
  'settings.removeTokenTitle',
  'settings.resetOnboardingBody',
  'settings.resetOnboardingSuccess',
  'settings.resetOnboardingTitle',
  'settings.saveToken',
  'settings.showToken',
  'settings.switch',
  'settings.switchToApiBody',
  'settings.switchToApiTitle',
  'settings.syncCompleteImportedBody',
  'settings.syncCompleteImportedTitle',
  'settings.syncCompleteSkippedBody',
  'settings.syncFailedTitle',
  'settings.syncFrequently',
  'settings.syncFrequentlySub',
  'settings.syncInterval',
  'settings.syncIssuesBody',
  'settings.syncIssuesTitle',
  'settings.templatesSyncDoneBody',
  'settings.templatesSyncDonePartial',
  'settings.templatesSyncDoneTitle',
  'settings.tokenDescription',
  'settings.tokenInvalid',
  'settings.tokenRequired',
  'settings.useApi',
  'settings.yourGithubRepositories',
  'todos.activeOnly',
  'todos.addTodoA11y',
  'todos.deleteBulkConfirm',
  'todos.errorTextRequired',
  'todos.todo',
  'todos.todos_',
  'todos.toggleCompletedA11y',
];

const ALLOWED_MISSING_SET = new Set(ALLOWED_MISSING);

const LOCALES: Array<{ name: string; bundle: Bundle }> = [
  { name: 'es', bundle: es },
  { name: 'fr', bundle: fr },
  { name: 'de', bundle: de },
  { name: 'ja', bundle: ja },
  { name: 'ko', bundle: ko },
];

function flattenKeys(bundle: Bundle, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(bundle)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...flattenKeys(value as Bundle, full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

describe('i18n key parity', () => {
  const enKeys = new Set(flattenKeys(en as Bundle));

  it.each(LOCALES)('$name has every en.json leaf key (except the documented pre-existing gap)', ({ _name, bundle }) => {
    const localeKeys = new Set(flattenKeys(bundle));
    const missing = [...enKeys].filter((key) => !localeKeys.has(key)).sort();
    const unexpected = missing.filter((key) => !ALLOWED_MISSING_SET.has(key));

    expect(unexpected).toEqual([]);

    // Sanity check the snapshot is not stale: every allowed-missing key must
    // genuinely be missing. As todo 4 backfills translations, remove the
    // filled keys from ALLOWED_MISSING rather than leaving them here.
    const snapshotKeysStillPresent = [...ALLOWED_MISSING_SET].filter((key) => localeKeys.has(key));
    expect(snapshotKeysStillPresent).toEqual([]);
  });
});
