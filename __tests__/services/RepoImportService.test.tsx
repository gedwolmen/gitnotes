/**
 * Tests for #938 — deterministic, awaited repo content import at add-time.
 *
 * Proof tests for the `importRepoAtAdd` service (plan todo 11): api-mode
 * import awaits the pull and returns counts, clone-mode import clones-then-
 * pulls (skipping the pull only when the clone succeeds or the repo is
 * already cloned), EMPTY repos succeed quietly without pulling, failures are
 * classified retryable/non-retryable, and concurrent imports for the same
 * repoPath share one run. Also covers the `GitFsService.cloneExclusive`
 * per-repo clone dedup (the #938 contention guard).
 */

// ── Render-harness mocks for the SettingsScreen baseline section ─────────────
// (mirrors the mock set in __tests__/screens/SettingsScreen.test.tsx)

const mockAddRepository = jest.fn<
  (path: string, options?: unknown, provider?: unknown, retryOptions?: unknown) => Promise<{ id: string; name: string; path: string }>
>();
const mockRepositories: unknown[] = [];

jest.mock('@react-native-community/netinfo', () => {
  const addEventListener = jest.fn(() => jest.fn());
  const fetch = jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true }));
  return { __esModule: true, default: { addEventListener, fetch }, addEventListener, fetch };
});

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('@react-navigation/native-stack', () => ({}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-constants', () => ({
  expoConfig: { version: '1.0.0' },
  manifest: { version: '1.0.0' },
}));
jest.mock('expo-image', () => ({ Image: () => null }));

const mockStableColors = {
  background: '#fff',
  surface: '#f4f4f4',
  primary: '#2563eb',
  text: '#111',
  textSecondary: '#666',
  border: '#ddd',
  error: '#dc2626',
  accent: '#8b5cf6',
};

jest.mock('../../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: mockStableColors,
    theme: 'light',
    setTheme: jest.fn(),
    style: 'flat',
    setStyle: jest.fn(),
    isDark: false,
  }),
  useTokens: () => ({
    colors: mockStableColors,
    spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
    type: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, '2xl': 28 },
    radii: { sm: 12, md: 18, lg: 24, pill: 999 },
    style: 'flat',
  }),
}));

jest.mock('../../src/contexts/AuthContext', () => {
  const fn = () => ({
    authState: { isAuthenticated: false, token: null },
    accounts: [],
    activeAccountId: null,
    accountSummaries: [],
    setToken: jest.fn(async () => true),
    clearToken: jest.fn(async () => undefined),
    addAccount: jest.fn(async () => null),
    removeAccount: jest.fn(async () => undefined),
    switchAccount: jest.fn(async () => undefined),
    switchToHost: jest.fn(async () => true),
    disconnectHost: jest.fn(async () => undefined),
    connectHost: jest.fn(async () => ({ ok: true })),
  });
  return { useAuth: fn, useAccounts: fn, AccountsProvider: ({ children }: any) => children };
});

jest.mock('../../src/contexts/AccountsContext', () => {
  const fn = () => ({
    authState: { isAuthenticated: false, token: null },
    accounts: [],
    activeAccountId: null,
    accountSummaries: [],
    setToken: jest.fn(async () => true),
    clearToken: jest.fn(async () => undefined),
    addAccount: jest.fn(async () => null),
    removeAccount: jest.fn(async () => undefined),
    switchAccount: jest.fn(async () => undefined),
    switchToHost: jest.fn(async () => true),
    disconnectHost: jest.fn(async () => undefined),
    connectHost: jest.fn(async () => ({ ok: true })),
  });
  return { useAuth: fn, useAccounts: fn, AccountsProvider: ({ children }: any) => children };
});

jest.mock('../../src/contexts/RepoContext', () => ({
  useRepos: () => ({
    repositories: mockRepositories,
    addRepository: mockAddRepository,
    removeRepository: jest.fn(),
  }),
}));

const mockRefreshNotes = jest.fn(async () => undefined);
const mockRefreshCanvases = jest.fn(async () => undefined);
const mockRefreshTodos = jest.fn(async () => undefined);

jest.mock('../../src/contexts/NoteContext', () => ({
  useNotes: () => ({
    notes: [],
    clearAllNotes: jest.fn(async () => true),
    refreshNotes: mockRefreshNotes,
    createNote: jest.fn(async () => null),
    updateNote: jest.fn(async () => null),
    getNoteById: jest.fn(() => undefined),
  }),
}));

jest.mock('../../src/contexts/TodoContext', () => ({
  useTodos: () => ({ todos: [], refreshTodos: mockRefreshTodos }),
}));

jest.mock('../../src/contexts/CanvasContext', () => ({
  useCanvases: () => ({ canvases: [], refreshCanvases: mockRefreshCanvases }),
}));

jest.mock('../../src/hooks/useResponsive', () => ({
  useResponsive: () => ({ isTablet: false, maxContentWidth: 0 }),
}));

jest.mock('../../src/utils/haptics', () => ({
  HapticService: {
    light: jest.fn(),
    medium: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    selection: jest.fn(),
    error: jest.fn(),
  },
}));

// ── Service mocks shared by BOTH sections ────────────────────────────────────

jest.mock('../../src/services/GitHubService', () => ({
  GitHubService: {
    setToken: jest.fn(),
    isAuthenticated: jest.fn(() => false),
    getRepositories: jest.fn(async () => []),
    getRepoContents: jest.fn(async () => []),
  },
}));

jest.mock('../../src/services/RepoPullService', () => ({
  pullFromSingleRepo: jest.fn(),
  pullAllFromRepos: jest.fn(async () => ({ repos: 0, notes: 0, canvases: 0, todos: 0, templates: 0 })),
}));

jest.mock('../../src/services/SyncEngineService', () => ({
  SyncEngineService: {
    getMode: jest.fn(async () => 'api' as const),
    setMode: jest.fn(async () => undefined),
    listOverrides: jest.fn(async () => ({})),
    DEFAULT_MODE: 'clone',
  },
}));

jest.mock('../../src/services/AuthService', () => ({
  AuthService: { getToken: jest.fn(async () => 'tok') },
}));

jest.mock('../../src/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: jest.fn(async () => []),
  },
}));

jest.mock('../../src/services/RepoFileSyncService', () => ({
  RepoFileSyncService: { syncRepoFiles: jest.fn(async () => ({ created: 0, skipped: 0, total: 0, errors: [] })) },
}));

jest.mock('../../src/services/TemplateRepoPreferenceService', () => ({
  TemplateRepoPreferenceService: {
    get: jest.fn(async () => null),
    set: jest.fn(async () => undefined),
    clear: jest.fn(async () => undefined),
  },
}));

jest.mock('../../src/services/TemplateGitHubSyncService', () => ({
  syncTemplateToGitHub: jest.fn(async () => ({ success: true })),
}));

jest.mock('../../src/services/git/CloneMigrationService', () => ({
  CloneMigrationService: { migrateRepo: jest.fn(async () => ({ notes: 0, todos: 0, canvases: 0, templates: 0, failures: [] })) },
}));

jest.mock('../../src/services/OnboardingService', () => ({
  OnboardingService: { resetOnboarding: jest.fn(async () => undefined) },
}));

jest.mock('../../src/stores/templateStore', () => ({
  useTemplateStore: () => ({ customTemplates: [] }),
}));

const mockAIStore = {
  isEnabled: false,
  selectedModelId: null,
  actionMode: 'auto' as const,
  chatRepoOwner: null,
  chatRepoName: null,
  providers: [] as any[],
  toggleAI: jest.fn(),
  setActionMode: jest.fn(),
  updateProvider: jest.fn(),
  getState: () => mockAIStore,
};
jest.mock('../../src/stores/aiStore', () => ({
  useAIStore: (selector: any) => (selector ? selector(mockAIStore) : mockAIStore),
}));

jest.mock('../../src/stores/repoStore', () => ({
  useRepoStore: { getState: () => ({ removeRepositoriesForHosts: jest.fn(async () => 0) }) },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../src/contexts/BiometricLockContext', () => ({
  useBiometricLock: () => ({
    isLockEnabled: false,
    isBiometricAvailable: true,
    biometricKind: 'fingerprint',
    biometricLabel: 'Touch ID',
    lockTimeout: 300_000,
    setIsLockEnabled: jest.fn(async () => true),
    setLockTimeout: jest.fn(async () => undefined),
    isLocked: false,
    authenticate: jest.fn(async () => true),
  }),
  TIMEOUT_OPTIONS: [
    { label: '1 minute', value: 60_000 },
    { label: '5 minutes', value: 300_000 },
    { label: '15 minutes', value: 900_000 },
    { label: '30 minutes', value: 1_800_000 },
  ],
}));

jest.mock('../../src/components/ui', () => {
  const React = require('react');
  const { View, Text, Pressable } = require('react-native');
  return {
    ScreenHeader: ({ title }: { title: string }) => <Text testID="screen-header">{title}</Text>,
    useScreenHeaderHeight: () => 60,
    SCREEN_HEADER_BASE_HEIGHT: 60,
    SCREEN_HEADER_SUBTITLE_HEIGHT: 88,
    useTabBarHeight: () => 84,
    TAB_BAR_BASE_HEIGHT: 84,
    Group: ({ title, children }: any) => (
      <View testID={`group-${title}`}>
        <Text testID="group-title">{title}</Text>
        {children}
      </View>
    ),
    GroupRow: ({ children, trailing, onPress }: any) => (
      <Pressable testID="group-row" onPress={onPress}>
        {children}
        {trailing}
      </Pressable>
    ),
    Toggle: ({ value, onValueChange, testID }: any) => (
      <Pressable testID={testID || 'toggle'} onPress={() => onValueChange(!value)}>
        <Text>{value ? 'On' : 'Off'}</Text>
      </Pressable>
    ),
    Button: ({ label, onPress }: any) => (
      <Pressable testID={`button-${label}`} onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    ),
    IconButton: ({ onPress, accessibilityLabel }: any) => (
      <Pressable testID={`icon-btn-${accessibilityLabel}`} onPress={onPress}>
        <Text>{accessibilityLabel}</Text>
      </Pressable>
    ),
    Chip: ({ label, children }: any) => (
      <View testID={`chip-${label ?? ''}`}>
        {label !== undefined ? <Text>{label}</Text> : null}
        {children}
      </View>
    ),
    Modal: ({ visible, children }: any) => (visible ? <View testID="modal">{children}</View> : null),
  };
});

jest.mock('../../src/components/ai/ModelSelector', () => ({ ModelSelector: () => null }));
jest.mock('../../src/components/ai/ProviderConfigModal', () => ({ ProviderConfigModal: () => null }));
jest.mock('../../src/components/ai/ChatRepoPickerModal', () => ({ ChatRepoPickerModal: () => null }));

// Records the latest props SettingsScreen hands to SettingsModals so the
// baseline test can observe `isAddingRepo` / `showRepoPickerModal` without
// reaching into component internals.
const mockModalCapture = { isAddingRepo: false, sawAddingRepo: false, showRepoPickerModal: false };

jest.mock('../../src/components/settings/SettingsModals', () => {
  const { Pressable, Text, TextInput, View } = require('react-native');
  return {
    SettingsModals: (props: any) => {
      mockModalCapture.isAddingRepo = !!props.isAddingRepo;
      if (props.isAddingRepo) mockModalCapture.sawAddingRepo = true;
      mockModalCapture.showRepoPickerModal = !!props.showRepoPickerModal;
      return (
        <View>
          <TextInput testID="test-manual-repo-input" onChangeText={props.onSetManualRepoInput} />
          <Pressable testID="test-add-manual-repo" onPress={props.onAddManualRepo}>
            <Text>Add manual repository</Text>
          </Pressable>
        </View>
      );
    },
  };
});

jest.mock('../../src/components/settings/settingsStyles', () => {
  const { StyleSheet } = require('react-native');
  return {
    settingsStyles: StyleSheet.create({
      container: { flex: 1 },
      scrollContent: { flex: 1 },
      section: { marginTop: 20, paddingHorizontal: 16, borderRadius: 12, marginHorizontal: 16 },
      sectionTitle: { fontSize: 12, fontWeight: '600' },
      settingItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
      settingLabel: { fontSize: 16 },
      settingValue: { fontSize: 15 },
      settingLeft: { flexDirection: 'row', alignItems: 'center' },
      authUserRow: { flexDirection: 'row', alignItems: 'center' },
      avatar: { width: 40, height: 40, borderRadius: 20 },
      addRepoButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
      addRepoButtonText: { fontSize: 15 },
      disabledButton: { opacity: 0.4 },
      emptyRepos: { paddingVertical: 24, alignItems: 'center' },
      emptyReposText: { fontSize: 15 },
      credits: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
      bottomPad: { height: 40 },
      repoItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
      repoInfo: { flex: 1 },
      repoName: { fontSize: 15, fontWeight: '500' },
      repoPath: { fontSize: 13 },
      syncButton: { paddingHorizontal: 8 },
      syncSpinner: { paddingHorizontal: 8 },
      removeButton: { paddingHorizontal: 8 },
    }),
  };
});

jest.mock('../../src/components/SearchBar', () => {
  const { TextInput } = require('react-native');
  return ({ value, onChangeText }: any) => (
    <TextInput testID="search-bar" value={value} onChangeText={onChangeText} />
  );
});

// ── Substrate mocks so the REAL GitFsService can run in-process ──────────────
// (GitFsService is intentionally NOT module-mocked here: the dedup tests below
// exercise the real `cloneExclusive` implementation and stub only the layer
// beneath it — isomorphic-git / the FS.)

jest.mock('isomorphic-git', () => {
  const mocks = {
    clone: jest.fn(async (..._args: any[]) => undefined),
    fetch: jest.fn(async (..._args: any[]) => ({ defaultBranch: 'main' })),
    fastForward: jest.fn(async (..._args: any[]) => undefined),
    walk: jest.fn(async (..._args: any[]): Promise<any[]> => []),
    resolveRef: jest.fn(async (..._args: any[]) => 'oid-deadbeef'),
    readBlob: jest.fn(async (..._args: any[]) => ({ oid: 'oid', blob: new TextEncoder().encode('x') })),
    readCommit: jest.fn(async (..._args: any[]) => ({
      oid: 'oid-deadbeef',
      commit: { message: 'x', parent: [], tree: 'abc' },
    })),
    TREE: jest.fn((opts: { ref: string }) => ({ __tree: opts.ref })),
  };
  (globalThis as any).__repoImportTestGit = mocks;
  return {
    __esModule: true,
    default: {
      clone: mocks.clone,
      fetch: mocks.fetch,
      fastForward: mocks.fastForward,
      walk: mocks.walk,
      resolveRef: mocks.resolveRef,
      readBlob: mocks.readBlob,
      readCommit: mocks.readCommit,
    },
    TREE: mocks.TREE,
  };
});

const mockFsStore = new Map<string, { type: 'file' | 'dir'; content?: string }>();
jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  documentDirectory: 'file:///doc/',
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  async getInfoAsync(uri: string) {
    const e = mockFsStore.get(uri);
    return e ? { exists: true, uri, isDirectory: e.type === 'dir' } : { exists: false, uri };
  },
  async deleteAsync(uri: string) { mockFsStore.delete(uri); },
  async makeDirectoryAsync(uri: string) { mockFsStore.set(uri.replace(/\/$/, ''), { type: 'dir' }); },
  async readAsStringAsync(uri: string) {
    const e = mockFsStore.get(uri);
    if (!e || e.type !== 'file') throw new Error('File not found');
    return e.content ?? '';
  },
  async writeAsStringAsync(_uri: string, _content: string) { /* noop */ },
  async readDirectoryAsync() { return []; },
}));

jest.mock('../../src/services/git/gitHttp', () => ({ gitHttp: { request: jest.fn() } }));

import { SyncEngineService } from '../../src/services/SyncEngineService';
import { AuthService } from '../../src/services/AuthService';
import { StorageService } from '../../src/services/StorageService';
import { pullFromSingleRepo } from '../../src/services/RepoPullService';
import { GitFsService } from '../../src/services/git/GitFsService';

interface PullCounts {
  repos: number;
  notes: number;
  canvases: number;
  todos: number;
  templates: number;
}

type ImportRepoResult =
  | { ok: true; counts: PullCounts }
  | { ok: false; error: string; retryable: boolean };

type ImportFn = (
  repoPath?: string,
  repoName?: string,
  onProgress?: (phase: string, loaded: number, total: number | null) => void,
) => Promise<ImportRepoResult>;

/**
 * Lazy loader for the service under test, resolved via `require` so tests
 * fail loudly if `importRepoAtAdd` is missing.
 */
function loadImportRepoAtAdd(): ImportFn {
  const mod = require('../../src/services/RepoImportService') as { importRepoAtAdd?: unknown };
  if (typeof mod.importRepoAtAdd !== 'function') {
    throw new Error('importRepoAtAdd is not implemented yet (#938)');
  }
  return mod.importRepoAtAdd as ImportFn;
}

function makeDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const ZERO_IMPORT_COUNTS: PullCounts = { repos: 1, notes: 0, canvases: 0, todos: 0, templates: 0 };
const SAMPLE_COUNTS: PullCounts = { repos: 1, notes: 5, canvases: 2, todos: 3, templates: 4 };

describe('importRepoAtAdd (#938) — awaited import service', () => {
  let isClonedSpy: jest.SpyInstance;
  let cloneExclusiveSpy: jest.SpyInstance;
  let getCommitOidSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    mockRepositories.length = 0;
    mockFsStore.clear();
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');
    (AuthService.getToken as jest.Mock).mockResolvedValue('tok');
    (StorageService.getSavedRepositories as jest.Mock).mockResolvedValue([
      { path: 'owner/repo', branch: 'main' },
    ]);
    (pullFromSingleRepo as jest.Mock).mockResolvedValue(SAMPLE_COUNTS);
    isClonedSpy = jest.spyOn(GitFsService, 'isCloned').mockResolvedValue(false);
    cloneExclusiveSpy = jest.spyOn(GitFsService, 'cloneExclusive').mockResolvedValue(undefined);
    getCommitOidSpy = jest.spyOn(GitFsService, 'getCommitOid').mockResolvedValue('abc123');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('api-mode import awaits pull and returns counts', async () => {
    const importRepoAtAdd = loadImportRepoAtAdd();
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');

    const result = await importRepoAtAdd('owner/repo', 'repoName');

    expect(result).toEqual({ ok: true, counts: SAMPLE_COUNTS });
    expect(pullFromSingleRepo).toHaveBeenCalledTimes(1);
    expect(pullFromSingleRepo).toHaveBeenCalledWith('owner/repo', undefined);
    expect(cloneExclusiveSpy).not.toHaveBeenCalled();
    expect(getCommitOidSpy).not.toHaveBeenCalled();
  });

  it('forwards onProgress to pullFromSingleRepo in api mode', async () => {
    const importRepoAtAdd = loadImportRepoAtAdd();
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');
    const cb = jest.fn();

    await importRepoAtAdd('owner/repo', 'repoName', cb);

    expect(pullFromSingleRepo).toHaveBeenCalledWith('owner/repo', cb);
  });

  it('forwards onProgress to pullFromSingleRepo in clone mode', async () => {
    const importRepoAtAdd = loadImportRepoAtAdd();
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
    const cb = jest.fn();

    await importRepoAtAdd('owner/repo', 'repoName', cb);

    expect(pullFromSingleRepo).toHaveBeenCalledWith('owner/repo', cb);
  });

  it('clone-mode import clones-then-pulls, skips pullFromSingleRepo only when clone succeeds', async () => {
    const importRepoAtAdd = loadImportRepoAtAdd();
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
    (StorageService.getSavedRepositories as jest.Mock).mockResolvedValue([
      { path: 'owner/repo', branch: 'develop' },
    ]);

    const result = await importRepoAtAdd('owner/repo', 'repoName');

    expect(result).toEqual({ ok: true, counts: SAMPLE_COUNTS });
    // Same branch resolver as pullFromSingleRepo: the saved repo's branch is
    // used, never a hardcoded 'main' (Metis F9).
    expect(cloneExclusiveSpy).toHaveBeenCalledTimes(1);
    expect(cloneExclusiveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ repoPath: 'owner/repo', branch: 'develop', token: 'tok' }),
    );
    expect(getCommitOidSpy).toHaveBeenCalledWith({ repoPath: 'owner/repo', ref: 'refs/heads/develop' });
    expect(pullFromSingleRepo).toHaveBeenCalledTimes(1);
    const cloneOrder = cloneExclusiveSpy.mock.invocationCallOrder[0];
    const pullOrder = (pullFromSingleRepo as jest.Mock).mock.invocationCallOrder[0];
    expect(cloneOrder).toBeLessThan(pullOrder);

    // Failure half: when the clone rejects, the pull must NOT run.
    jest.clearAllMocks();
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
    (StorageService.getSavedRepositories as jest.Mock).mockResolvedValue([
      { path: 'owner/repo', branch: 'develop' },
    ]);
    (AuthService.getToken as jest.Mock).mockResolvedValue('tok');
    cloneExclusiveSpy = jest.spyOn(GitFsService, 'cloneExclusive').mockRejectedValue(new Error('ECONNREFUSED'));
    getCommitOidSpy = jest.spyOn(GitFsService, 'getCommitOid').mockResolvedValue('abc123');

    const failed = await importRepoAtAdd('owner/repo', 'repoName');

    expect(failed.ok).toBe(false);
    if (!failed.ok) {
      expect(failed.retryable).toBe(true);
      expect(failed.error).toContain('ECONNREFUSED');
    }
    expect(pullFromSingleRepo).not.toHaveBeenCalled();
    expect(getCommitOidSpy).not.toHaveBeenCalled();
  });

  it('EMPTY repo in clone mode — getCommitOid returns null for refs/heads/<branch> — yields {ok:true} zero counts + does NOT call pullFromSingleRepo', async () => {
    const importRepoAtAdd = loadImportRepoAtAdd();
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
    getCommitOidSpy.mockResolvedValue(null);

    const result = await importRepoAtAdd('owner/repo', 'repoName');

    expect(result).toEqual({ ok: true, counts: ZERO_IMPORT_COUNTS });
    expect(cloneExclusiveSpy).toHaveBeenCalledTimes(1);
    expect(getCommitOidSpy).toHaveBeenCalledWith({ repoPath: 'owner/repo', ref: 'refs/heads/main' });
    expect(pullFromSingleRepo).not.toHaveBeenCalled();
  });

  it('already-cloned repo (idempotent re-add) skips the clone and pulls directly', async () => {
    const importRepoAtAdd = loadImportRepoAtAdd();
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
    isClonedSpy.mockResolvedValue(true);

    const result = await importRepoAtAdd('owner/repo', 'repoName');

    expect(result).toEqual({ ok: true, counts: SAMPLE_COUNTS });
    expect(cloneExclusiveSpy).not.toHaveBeenCalled();
    expect(pullFromSingleRepo).toHaveBeenCalledTimes(1);
  });

  it('network failure during clone returns retryable:true and the retry path calls cloneExclusive again', async () => {
    const importRepoAtAdd = loadImportRepoAtAdd();
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
    cloneExclusiveSpy.mockRejectedValueOnce(new Error('Failed to fetch'));

    const first = await importRepoAtAdd('owner/repo', 'repoName');
    expect(first).toEqual({
      ok: false,
      error: expect.stringContaining('Failed to fetch'),
      retryable: true,
    });
    expect(pullFromSingleRepo).not.toHaveBeenCalled();

    cloneExclusiveSpy.mockResolvedValueOnce(undefined);
    const retry = await importRepoAtAdd('owner/repo', 'repoName');
    expect(retry).toEqual({ ok: true, counts: SAMPLE_COUNTS });
    expect(cloneExclusiveSpy).toHaveBeenCalledTimes(2);
    expect(pullFromSingleRepo).toHaveBeenCalledTimes(1);
  });

  it('classifies durable failures as non-retryable (deleted repo, revoked credentials)', async () => {
    const importRepoAtAdd = loadImportRepoAtAdd();
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');

    cloneExclusiveSpy.mockRejectedValueOnce(new Error('HTTP 404: Not Found'));
    const notFound = await importRepoAtAdd('owner/repo', 'repoName');
    expect(notFound.ok).toBe(false);
    if (!notFound.ok) expect(notFound.retryable).toBe(false);

    cloneExclusiveSpy.mockRejectedValueOnce(new Error('Bad credentials'));
    const badAuth = await importRepoAtAdd('owner/repo', 'repoName');
    expect(badAuth.ok).toBe(false);
    if (!badAuth.ok) expect(badAuth.retryable).toBe(false);

    cloneExclusiveSpy.mockRejectedValueOnce(new Error('HTTP 503: Service Unavailable'));
    const serverGone = await importRepoAtAdd('owner/repo', 'repoName');
    expect(serverGone.ok).toBe(false);
    if (!serverGone.ok) expect(serverGone.retryable).toBe(true);
  });

  it('handles malformed input gracefully: undefined repoPath errors without touching any service', async () => {
    const importRepoAtAdd = loadImportRepoAtAdd();

    const result = await importRepoAtAdd(undefined, undefined);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryable).toBe(false);
    expect(SyncEngineService.getMode).not.toHaveBeenCalled();
    expect(cloneExclusiveSpy).not.toHaveBeenCalled();
    expect(pullFromSingleRepo).not.toHaveBeenCalled();
  });

  it('falls back to the default branch resolver when the saved repo has no branch', async () => {
    const importRepoAtAdd = loadImportRepoAtAdd();
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
    (StorageService.getSavedRepositories as jest.Mock).mockResolvedValue([{ path: 'owner/repo' }]);
    jest.spyOn(GitFsService, 'getCurrentBranch').mockResolvedValue(null);
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: false } as unknown as Response);

    const result = await importRepoAtAdd('owner/repo', 'repoName');

    expect(result.ok).toBe(true);
    expect(cloneExclusiveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ repoPath: 'owner/repo', branch: 'main' }),
    );
    fetchSpy.mockRestore();
  });

  it('three concurrent importRepoAtAdd calls for the same repoPath share one import: cloneExclusive and pull run exactly once', async () => {
    const importRepoAtAdd = loadImportRepoAtAdd();
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');

    const [a, b, c] = await Promise.all([
      importRepoAtAdd('owner/repo', 'repoName'),
      importRepoAtAdd('owner/repo', 'repoName'),
      importRepoAtAdd('owner/repo', 'repoName'),
    ]);

    expect(a).toEqual({ ok: true, counts: SAMPLE_COUNTS });
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(cloneExclusiveSpy).toHaveBeenCalledTimes(1);
    expect(pullFromSingleRepo).toHaveBeenCalledTimes(1);
  });

  it('large-repo preflight (clone mode + repoSizeKb > threshold) returns {ok:false, largeRepo:true} WITHOUT calling cloneExclusive', async () => {
    const importRepoAtAdd = loadImportRepoAtAdd();
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
    const { LARGE_REPO_THRESHOLD_KB } = require('../../src/services/RepoImportService');

    const result = await importRepoAtAdd('owner/repo', 'repoName', undefined, LARGE_REPO_THRESHOLD_KB + 1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.largeRepo).toBe(true);
      expect(result.retryable).toBe(false);
      expect(result.error).toMatch(/large/i);
    }
    expect(cloneExclusiveSpy).not.toHaveBeenCalled();
    expect(pullFromSingleRepo).not.toHaveBeenCalled();
  });

  it('large-repo preflight is skipped when repoSizeKb is undefined (manual-add path without size data)', async () => {
    const importRepoAtAdd = loadImportRepoAtAdd();
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');

    const result = await importRepoAtAdd('owner/repo', 'repoName', undefined, undefined);

    expect(result).toEqual({ ok: true, counts: SAMPLE_COUNTS });
    expect(cloneExclusiveSpy).toHaveBeenCalledTimes(1);
  });

  it('large-repo preflight is skipped when repoSizeKb is below the threshold', async () => {
    const importRepoAtAdd = loadImportRepoAtAdd();
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');

    const result = await importRepoAtAdd('owner/repo', 'repoName', undefined, 1024);

    expect(result).toEqual({ ok: true, counts: SAMPLE_COUNTS });
    expect(cloneExclusiveSpy).toHaveBeenCalledTimes(1);
  });

  it('large-repo preflight does not trigger in API mode (API mode never clones)', async () => {
    const importRepoAtAdd = loadImportRepoAtAdd();
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');
    const { LARGE_REPO_THRESHOLD_KB } = require('../../src/services/RepoImportService');

    const result = await importRepoAtAdd('owner/repo', 'repoName', undefined, LARGE_REPO_THRESHOLD_KB * 10);

    expect(result).toEqual({ ok: true, counts: SAMPLE_COUNTS });
    expect(cloneExclusiveSpy).not.toHaveBeenCalled();
    expect(pullFromSingleRepo).toHaveBeenCalledTimes(1);
  });

  it('CloneOutOfMemoryError from cloneExclusive surfaces as largeRepo: true', async () => {
    const importRepoAtAdd = loadImportRepoAtAdd();
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
    const { CloneOutOfMemoryError } = require('../../src/services/git/GitFsService');
    cloneExclusiveSpy.mockRejectedValueOnce(new CloneOutOfMemoryError('oom during packfile indexing'));

    const result = await importRepoAtAdd('owner/repo', 'repoName');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.largeRepo).toBe(true);
      expect(result.retryable).toBe(false);
      expect(result.error).toMatch(/out of memory|api mode/i);
    }
    expect(pullFromSingleRepo).not.toHaveBeenCalled();
  });
});

describe('GitFsService.cloneExclusive — per-repo clone dedup (#938 contention guard)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    mockFsStore.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('concurrent clone for same repoPath produces exactly ONE underlying clone (dedup)', async () => {
    jest.spyOn(GitFsService, 'isCloned').mockResolvedValue(false);
    const deferred = makeDeferred<void>();
    const cloneSpy = jest
      .spyOn(GitFsService, 'clone')
      .mockImplementation(() => deferred.promise);

    const p1 = GitFsService.cloneExclusive({ repoPath: 'owner/repo', branch: 'main' });
    const p2 = GitFsService.cloneExclusive({ repoPath: 'owner/repo', branch: 'main' });
    const p3 = GitFsService.cloneExclusive({ repoPath: 'owner/repo', branch: 'main' });

    await Promise.resolve();
    await Promise.resolve();
    expect(cloneSpy).toHaveBeenCalledTimes(1);

    deferred.resolve();
    await expect(Promise.all([p1, p2, p3])).resolves.toEqual([undefined, undefined, undefined]);
    expect(cloneSpy).toHaveBeenCalledTimes(1);
  });

  it('a failed clone does NOT poison the dedup map: a retry runs a fresh clone', async () => {
    jest.spyOn(GitFsService, 'isCloned').mockResolvedValue(false);
    const cloneSpy = jest
      .spyOn(GitFsService, 'clone')
      .mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(
      GitFsService.cloneExclusive({ repoPath: 'owner/repo', branch: 'main' }),
    ).rejects.toThrow('ECONNREFUSED');

    cloneSpy.mockResolvedValueOnce(undefined);
    await expect(
      GitFsService.cloneExclusive({ repoPath: 'owner/repo', branch: 'main' }),
    ).resolves.toBeUndefined();
    expect(cloneSpy).toHaveBeenCalledTimes(2);
  });

  it('after a settled clone, callers short-circuit via isCloned (idempotent, no re-clone)', async () => {
    const isClonedSpy = jest.spyOn(GitFsService, 'isCloned').mockResolvedValue(true);
    const cloneSpy = jest.spyOn(GitFsService, 'clone').mockResolvedValue(undefined);

    await GitFsService.cloneExclusive({ repoPath: 'owner/repo', branch: 'main' });
    await GitFsService.cloneExclusive({ repoPath: 'owner/repo', branch: 'main' });

    expect(cloneSpy).not.toHaveBeenCalled();
    expect(isClonedSpy).toHaveBeenCalledTimes(2);
  });

  it('dedups by repoPath AND branch key, and different repos never share a clone promise', async () => {
    jest.spyOn(GitFsService, 'isCloned').mockResolvedValue(false);
    const deferredA = makeDeferred<void>();
    const deferredB = makeDeferred<void>();
    const cloneSpy = jest.spyOn(GitFsService, 'clone').mockImplementation((opts: { repoPath: string; branch: string }) => {
      if (opts.repoPath === 'owner/repo' && opts.branch === 'release') return deferredA.promise;
      return deferredB.promise;
    });

    const sameKey = GitFsService.cloneExclusive({ repoPath: 'owner/repo', branch: 'release' });
    const otherBranch = GitFsService.cloneExclusive({ repoPath: 'owner/repo', branch: 'main' });
    const otherRepo = GitFsService.cloneExclusive({ repoPath: 'owner/other', branch: 'release' });

    await Promise.resolve();
    await Promise.resolve();
    expect(cloneSpy).toHaveBeenCalledTimes(3);

    deferredA.resolve();
    deferredB.resolve();
    await Promise.all([sameKey, otherBranch, otherRepo]);
  });
});
