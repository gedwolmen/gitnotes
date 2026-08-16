import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, renderHook, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Shared service mocks. The `*SyncService` modules become the push-time
// executors (drain) under the flag, so every test asserts they are NOT
// called at stage time.
// ---------------------------------------------------------------------------

jest.mock('../src/services/featureFlags', () => ({
  FEATURE_USE_MULTI_HOST_WRITE: false,
}));

jest.mock('../src/services/git/StagingService', () => ({
  StagingService: { stageUpsert: jest.fn(), stageDelete: jest.fn() },
}));

jest.mock('../src/services/TodoGitHubSyncService', () => ({
  syncTodoToGitHub: jest.fn(),
  deleteTodoFromGitHub: jest.fn(),
}));

jest.mock('../src/services/CanvasGitHubSyncService', () => ({
  syncCanvasToGitHub: jest.fn(),
  deleteCanvasFromGitHub: jest.fn(),
}));

jest.mock('../src/services/TemplateGitHubSyncService', () => ({
  syncTemplateToGitHub: jest.fn(),
  deleteTemplateFromGitHub: jest.fn(),
}));

jest.mock('../src/services/NoteGitHubSyncService', () => ({
  syncNoteToGitHub: jest.fn(),
}));

jest.mock('../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    enqueueNoteUpsert: jest.fn(async () => undefined),
    enqueueNoteDelete: jest.fn(async () => undefined),
    drain: jest.fn(async () => ({ succeeded: 0, failed: 0, remaining: 0 })),
  },
}));

jest.mock('../src/services/GitHubService', () => ({
  GitHubService: {
    isAuthenticated: jest.fn(() => true),
    updateFile: jest.fn(async () => ({ ok: true })),
    deleteFile: jest.fn(async () => ({ ok: true })),
    getFileSha: jest.fn(async () => ({ kind: 'found', sha: 'sha1' })),
  },
}));

jest.mock('../src/services/StorageService', () => ({
  StorageService: {
    deleteTodo: jest.fn(async () => true),
    deleteCanvas: jest.fn(async () => true),
    getAllTodos: jest.fn(async () => []),
    getAllCanvases: jest.fn(async () => []),
    createTodo: jest.fn(async () => null),
    updateTodo: jest.fn(async () => null),
    saveAllTodos: jest.fn(async () => undefined),
    createCanvas: jest.fn(async () => null),
    updateCanvas: jest.fn(async () => null),
    loadCustomTemplates: jest.fn(async () => []),
    loadTemplatePins: jest.fn(async () => []),
    saveCustomTemplates: jest.fn(async () => undefined),
  },
}));

jest.mock('../src/services/NotificationService', () => ({
  NotificationService: {
    cancelAllForTodo: jest.fn(async () => undefined),
    scheduleReminder: jest.fn(async () => null),
  },
}));

jest.mock('../src/services/TemplateRepoPreferenceService', () => ({
  TemplateRepoPreferenceService: { get: jest.fn() },
}));

jest.mock('../src/stores/gitOperationStore', () => ({
  gitOperationRegistry: {
    begin: jest.fn(() => 'op-1'),
    succeed: jest.fn(),
    fail: jest.fn(),
  },
  useGitOperationStore: (
    selector?: (state: { ops: Record<string, unknown> }) => unknown,
  ) => (selector ? selector({ ops: {} }) : { ops: {} }),
}));

jest.mock('../src/services/git/branchResolver', () => ({
  resolveBranch: jest.fn(async (_repo: string, hint?: string) => hint ?? 'main'),
}));

jest.mock('../src/services/SyncEngineService', () => ({
  SyncEngineService: { getMode: jest.fn(async () => 'api') },
}));

jest.mock('../src/utils/haptics', () => ({
  HapticService: {
    light: jest.fn(),
    medium: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    selection: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../src/services/ShareService', () => ({
  ShareService: { shareInFormat: jest.fn() },
}));

jest.mock('../src/stores/githubActivityStore', () => ({
  githubActivity: { begin: jest.fn(), end: jest.fn() },
  useGitHubActivityStore: () => ({ inflight: 0 }),
}));

jest.mock('../src/services/LastSelectionPreferenceService', () => ({
  LastSelectionPreferenceService: {
    get: jest.fn(async () => ({ repo: undefined, branch: undefined })),
    set: jest.fn(async () => undefined),
  },
}));

// ---- TodoListScreen render mocks ----
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(() => jest.fn()),
    fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
  },
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
  useIsFocused: () => true,
}));

jest.mock('@react-navigation/native-stack', () => ({}));

jest.mock('../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#fff',
      surface: '#f4f4f4',
      primary: '#2563eb',
      text: '#111',
      textSecondary: '#666',
      border: '#ddd',
      error: '#dc2626',
      accent: '#8b5cf6',
    },
    isDark: false,
  }),
}));

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ authState: { token: null }, activeAccountId: null }),
}));

jest.mock('../src/contexts/RepoContext', () => ({
  useRepos: () => ({
    repositories: [{ id: 'r1', path: 'owner/repo', name: 'repo' }],
    addRepository: jest.fn(),
  }),
}));

jest.mock('../src/hooks/useResponsive', () => ({
  useResponsive: () => ({ isTablet: false, maxContentWidth: 0, columnCount: 1 }),
}));

jest.mock('../src/hooks/useEntityFilter', () => ({
  useEntityFilter: () => ({
    activeCount: 0,
    applyFilters: (items: unknown[]) => items,
    state: {
      selectedRepo: null,
      selectedBranch: null,
      selectedFolder: null,
      selectedTags: [],
      selectedAccountId: null,
    },
    setSelectedRepo: jest.fn(),
    setSelectedBranch: jest.fn(),
    setSelectedFolder: jest.fn(),
    setSelectedAccountId: jest.fn(),
    toggleTag: jest.fn(),
    clearAll: jest.fn(),
    allBranches: [],
    allTags: [],
    allAccountIds: [],
  }),
}));

jest.mock('../src/hooks/useEntityList', () => ({
  useEntityList: ({ data }: { data: unknown[] }) => ({
    filteredData: data,
    searchQuery: '',
    setSearchQuery: jest.fn(),
  }),
}));

jest.mock('../src/services/git/BatchGitOperations', () => ({
  batchDeleteFiles: jest.fn(async () => ({ success: true, deleted: [], failed: [] })),
}));

jest.mock('../src/services/git/resolveBranch', () => ({
  resolveBranch: jest.fn(async (_repo: string, hint?: string) => hint ?? 'main'),
}));

jest.mock('../src/services/RepoPullService', () => ({
  pullAllFromRepos: jest.fn(async () => undefined),
}));

jest.mock('../src/services/git/manualSync', () => ({
  syncNow: jest.fn(async () => ({ ok: true })),
  isSyncNowRunning: jest.fn(() => false),
}));

jest.mock('../src/components/ui', () => {
  const ReactMod = require('react');
  const { Text, View, Pressable } = require('react-native');
  return {
    ScreenHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) =>
      ReactMod.createElement(
        View,
        null,
        ReactMod.createElement(Text, { testID: 'screen-header' }, title),
        actions,
      ),
    useScreenHeaderHeight: () => 60,
    SCREEN_HEADER_BASE_HEIGHT: 60,
    SCREEN_HEADER_SUBTITLE_HEIGHT: 88,
    useTabBarHeight: () => 84,
    TAB_BAR_BASE_HEIGHT: 84,
    IconButton: ({ onPress, accessibilityLabel }: { onPress?: () => void; accessibilityLabel?: string }) =>
      ReactMod.createElement(
        Pressable,
        { testID: `icon-btn-${accessibilityLabel}`, onPress },
        ReactMod.createElement(Text, null, accessibilityLabel),
      ),
  };
});

jest.mock('../src/components/ui/OfflineBanner', () => ({
  OfflineBanner: () => null,
}));

jest.mock('../src/components/ui/ConflictBanner', () => ({
  ConflictBanner: () => null,
}));

jest.mock('../src/components/EntityFilterModal', () => ({
  EntityFilterModal: () => null,
}));

jest.mock('../src/components/SearchBar', () => {
  const ReactMod = require('react');
  const { TextInput } = require('react-native');
  return ({
    value,
    onChangeText,
  }: {
    value: string;
    onChangeText: (v: string) => void;
  }) => ReactMod.createElement(TextInput, { testID: 'search-bar', value, onChangeText });
});

jest.mock('../src/components/todos/TodoCard', () => {
  const ReactMod = require('react');
  const { Text, Pressable } = require('react-native');
  return {
    TodoCard: ({ todo, onPress }: { todo: { id: string; text: string }; onPress: (t: unknown) => void }) =>
      ReactMod.createElement(
        Pressable,
        { testID: `todo-card-${todo.id}`, onPress: () => onPress(todo) },
        ReactMod.createElement(Text, null, todo.text),
      ),
  };
});

jest.mock('../src/components/todos/TodosListHeader', () => {
  const ReactMod = require('react');
  const { TextInput } = require('react-native');
  return {
    TodosListHeader: ({ searchQuery, onSearchChange }: { searchQuery: string; onSearchChange: (q: string) => void }) =>
      ReactMod.createElement(TextInput, { testID: 'todos-list-header-search', value: searchQuery, onChangeText: onSearchChange }),
  };
});

jest.mock('../src/components/todos/TodoEditorModal', () => {
  const ReactMod = require('react');
  const { TextInput, Pressable, Text, View } = require('react-native');
  return {
    TodoEditorModal: ({
      onChangeText,
      onRepoChange,
      onBranchChange,
      onSubmit,
      onClose,
    }: {
      onChangeText: (v: string) => void;
      onRepoChange?: (r: string) => void;
      onBranchChange?: (b: string) => void;
      onSubmit?: () => void;
      onClose?: () => void;
    }) =>
      ReactMod.createElement(
        View,
        null,
        ReactMod.createElement(TextInput, { testID: 'modal-todo-text', onChangeText }),
        ReactMod.createElement(Pressable, { testID: 'modal-todo-repo', onPress: () => onRepoChange?.('owner/repo') }),
        ReactMod.createElement(Pressable, { testID: 'modal-todo-branch', onPress: () => onBranchChange?.('main') }),
        ReactMod.createElement(
          Pressable,
          { testID: 'modal-todo-submit', onPress: onSubmit },
          ReactMod.createElement(Text, null, 'Save'),
        ),
        ReactMod.createElement(Pressable, { testID: 'modal-todo-close', onPress: onClose }),
      ),
  };
});

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const ReactMod = require('react');
  const { View } = require('react-native');
  return ReactMod.forwardRef(({ children }: { children?: React.ReactNode }, _ref: unknown) =>
    ReactMod.createElement(View, null, children),
  );
});

// ---- import under test AFTER mocks are registered ----
import TodoListScreen from '../src/screens/TodoListScreen';
import { useTodoStore } from '../src/stores/todoStore';
import { useCanvasStore } from '../src/stores/canvasStore';
import { useTemplateStore } from '../src/stores/templateStore';
import { useTodos } from '../src/contexts/TodoContext';
import { ThoughtDumpService } from '../src/services/ThoughtDumpService';
import { useNotesListNoteActions } from '../src/components/notes/useNotesListNoteActions';
import { StagingService } from '../src/services/git/StagingService';
import { syncTodoToGitHub, deleteTodoFromGitHub } from '../src/services/TodoGitHubSyncService';
import { deleteCanvasFromGitHub } from '../src/services/CanvasGitHubSyncService';
import { syncTemplateToGitHub, deleteTemplateFromGitHub } from '../src/services/TemplateGitHubSyncService';
import { syncNoteToGitHub } from '../src/services/NoteGitHubSyncService';
import { GitHubService } from '../src/services/GitHubService';
import { StorageService } from '../src/services/StorageService';
import { TemplateRepoPreferenceService } from '../src/services/TemplateRepoPreferenceService';
import type { Todo } from '../src/models/Todo';
import type { Canvas } from '../src/models/Canvas';
import type { NoteTemplate } from '../src/services/TemplateService';
import type { Note } from '../src/models/Note';

const stageUpsertMock = StagingService.stageUpsert as jest.Mock;
const stageDeleteMock = StagingService.stageDelete as jest.Mock;

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 't1',
    text: 'Buy milk',
    completed: false,
    createdAt: 1,
    updatedAt: 1,
    tags: [],
    priority: 'medium',
    ...overrides,
  };
}

const repoTodo = makeTodo({ repo: 'owner/repo', branch: 'main', filePath: 'todos/buy-milk.json' });

function makeCanvas(overrides: Partial<Canvas> = {}): Canvas {
  return {
    id: 'c1',
    title: 'My Canvas',
    scene: { version: 1, width: 100, height: 100, background: '#FFFFFF', elements: [] },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

const repoCanvas = makeCanvas({ repo: 'owner/repo', branch: 'main', filePath: 'canvases/my-canvas.json' });

function makeTemplate(overrides: Partial<NoteTemplate> = {}): NoteTemplate {
  return {
    id: 'tpl-1',
    name: 'My Template',
    content: 'body',
    isCustom: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

const repoTemplate = makeTemplate({ filePath: 'templates/my-template.md' });

describe('staging rewire — todoStore.deleteTodo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stageDeleteMock.mockResolvedValue({ success: true });
    useTodoStore.setState({ todos: [repoTodo], error: null });
  });

  it('stages the delete and never calls deleteTodoFromGitHub', async () => {
    const ok = await useTodoStore.getState().deleteTodo('t1');

    expect(ok).toBe(true);
    expect(stageDeleteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: 'owner/repo',
        branch: 'main',
        filePath: 'todos/buy-milk.json',
        title: 'Buy milk',
      }),
    );
    expect(deleteTodoFromGitHub).not.toHaveBeenCalled();
    expect(StorageService.deleteTodo).toHaveBeenCalledWith('t1');
  });
});

describe('staging rewire — canvasStore.deleteCanvas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stageDeleteMock.mockResolvedValue({ success: true });
    useCanvasStore.setState({ canvases: [repoCanvas], error: null });
  });

  it('stages the delete and never calls deleteCanvasFromGitHub', async () => {
    const ok = await useCanvasStore.getState().deleteCanvas('c1');

    expect(ok).toBe(true);
    expect(stageDeleteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: 'owner/repo',
        branch: 'main',
        filePath: 'canvases/my-canvas.json',
        title: 'My Canvas',
      }),
    );
    expect(deleteCanvasFromGitHub).not.toHaveBeenCalled();
    expect(StorageService.deleteCanvas).toHaveBeenCalledWith('c1');
  });
});

describe('staging rewire — templateStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (TemplateRepoPreferenceService.get as jest.Mock).mockResolvedValue({
      repoPath: 'owner/repo',
      branch: 'main',
    });
    useTemplateStore.setState({ customTemplates: [], pinnedIds: [], isLoading: false });
  });

  it('createTemplate stages the upsert and never calls syncTemplateToGitHub', async () => {
    stageUpsertMock.mockResolvedValue({ success: true });

    const created = await useTemplateStore.getState().createTemplate({
      name: 'My Template',
      content: 'body',
    });

    expect(created.isCustom).toBe(true);
    expect(stageUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: 'owner/repo',
        branch: 'main',
        filePath: 'templates/my-template.md',
        title: 'My Template',
      }),
    );
    expect(syncTemplateToGitHub).not.toHaveBeenCalled();
  });

  it('updateTemplate stages the upsert and never calls syncTemplateToGitHub', async () => {
    stageUpsertMock.mockResolvedValue({ success: true });
    useTemplateStore.setState({ customTemplates: [repoTemplate], pinnedIds: [] });

    await useTemplateStore.getState().updateTemplate('tpl-1', { name: 'Renamed' });

    expect(stageUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: 'owner/repo',
        filePath: 'templates/my-template.md',
        title: 'Renamed',
      }),
    );
    expect(syncTemplateToGitHub).not.toHaveBeenCalled();
  });

  it('deleteTemplate stages the delete and never calls deleteTemplateFromGitHub', async () => {
    stageDeleteMock.mockResolvedValue({ success: true });
    useTemplateStore.setState({ customTemplates: [repoTemplate], pinnedIds: [] });

    await useTemplateStore.getState().deleteTemplate('tpl-1');

    expect(stageDeleteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: 'owner/repo',
        branch: 'main',
        filePath: 'templates/my-template.md',
        title: 'My Template',
      }),
    );
    expect(deleteTemplateFromGitHub).not.toHaveBeenCalled();
  });
});

describe('staging rewire — TodoContext.toggleTodo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stageUpsertMock.mockResolvedValue({ success: true });
    (StorageService.updateTodo as jest.Mock).mockImplementation(
      async (_input: { id: string; completed?: boolean; notificationId?: string }) => ({
        ...repoTodo,
        completed: true,
      }),
    );
    useTodoStore.setState({ todos: [repoTodo], error: null });
  });

  it('stages the upsert and never calls syncTodoToGitHub', async () => {
    const { result } = renderHook(() => useTodos());

    let ok = false;
    await act(async () => {
      ok = await result.current.toggleTodo('t1');
    });

    expect(ok).toBe(true);
    expect(stageUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: 'owner/repo',
        branch: 'main',
        filePath: 'todos/buy-milk.json',
        title: 'Buy milk',
      }),
    );
    const arg = stageUpsertMock.mock.calls[0][0] as { content: string };
    expect(JSON.parse(arg.content)).toMatchObject({ text: 'Buy milk', completed: true });
    expect(syncTodoToGitHub).not.toHaveBeenCalled();
  });
});

describe('staging rewire — ThoughtDumpService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stageUpsertMock.mockResolvedValue({ success: true });
    stageDeleteMock.mockResolvedValue({ success: true });
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(true);
  });

  it('create stages the upsert, no GitHubService/LocalGitWriter write', async () => {
    const dump = await ThoughtDumpService.create('hello dump', {
      repoPath: 'owner/repo',
      branch: 'main',
    });

    expect(dump).not.toBeNull();
    expect(stageUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: 'owner/repo',
        branch: 'main',
        filePath: dump!.filePath,
        title: 'Thought dump',
      }),
    );
    expect(GitHubService.updateFile).not.toHaveBeenCalled();
  });

  it('delete stages the delete, no GitHubService delete', async () => {
    const ok = await ThoughtDumpService.delete('id1', {
      repoPath: 'owner/repo',
      branch: 'main',
      filePath: 'thoughts/dump.md',
    });

    expect(ok).toBe(true);
    expect(stageDeleteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: 'owner/repo',
        branch: 'main',
        filePath: 'thoughts/dump.md',
        title: 'Thought dump',
      }),
    );
    expect(GitHubService.getFileSha).not.toHaveBeenCalled();
    expect(GitHubService.deleteFile).not.toHaveBeenCalled();
  });
});

describe('staging rewire — useNotesListNoteActions.handleColorSelect', () => {
  const makeColorNote = (): Note => ({
    id: 'n1',
    title: 'Color note',
    content: 'body',
    createdAt: 1,
    updatedAt: 1,
    tags: [],
    repo: 'owner/repo',
    branch: 'main',
    filePath: 'notes/color-note.md',
    format: 'markdown',
  });

  const renderActions = (updateNote: jest.Mock) =>
    renderHook(() =>
      useNotesListNoteActions({
        navigation: {} as never,
        isConnected: true,
        closeOpenSwipeable: jest.fn(),
        createNote: jest.fn(),
        updateNote,
        deleteNote: jest.fn(),
        togglePin: jest.fn(),
        setLongPressedNote: jest.fn(),
        setColorPickerNote: jest.fn(),
        setIsDeleting: jest.fn(),
      }),
    );

  beforeEach(() => {
    jest.clearAllMocks();
    stageUpsertMock.mockResolvedValue({ success: true });
  });

  it('stages the upsert and never calls syncNoteToGitHub', async () => {
    const updateNote = jest.fn(async () => makeColorNote());
    const { result } = renderActions(updateNote);

    await act(async () => {
      await result.current.handleColorSelect(makeColorNote(), 'red');
    });

    expect(stageUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: 'owner/repo',
        branch: 'main',
        filePath: 'notes/color-note.md',
        title: 'Color note',
        color: 'red',
      }),
    );
    expect(syncNoteToGitHub).not.toHaveBeenCalled();
  });
});

describe('staging rewire — TodoListScreen handleAddTodo / handleUpdateTodo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    stageUpsertMock.mockResolvedValue({ success: true });
    useTodoStore.setState({ todos: [], error: null });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('add-todo stages the upsert and never calls syncTodoToGitHub', async () => {
    (StorageService.createTodo as jest.Mock).mockResolvedValue({
      ...repoTodo,
      id: 'new-todo-1',
      accountId: undefined,
    });

    const { getByTestId } = render(React.createElement(TodoListScreen));
    await fireEvent.press(getByTestId('icon-btn-Add todo'));
    await fireEvent.changeText(getByTestId('modal-todo-text'), 'Buy milk');
    await fireEvent.press(getByTestId('modal-todo-repo'));
    await fireEvent.press(getByTestId('modal-todo-branch'));
    await fireEvent.press(getByTestId('modal-todo-submit'));

    expect(stageUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: 'owner/repo',
        branch: 'main',
        filePath: 'todos/buy-milk.json',
        title: 'Buy milk',
      }),
    );
    const arg = stageUpsertMock.mock.calls[0][0] as { content: string };
    expect(JSON.parse(arg.content)).toMatchObject({ text: 'Buy milk', completed: false });
    expect(syncTodoToGitHub).not.toHaveBeenCalled();
  });

  it('update-todo stages the upsert and never calls syncTodoToGitHub', async () => {
    (StorageService.updateTodo as jest.Mock).mockImplementation(
      async (_input: { id: string }) => ({ ...repoTodo, text: 'Buy oat milk' }),
    );
    useTodoStore.setState({ todos: [repoTodo], error: null });

    const { getByTestId } = render(React.createElement(TodoListScreen));
    await fireEvent.press(getByTestId('todo-card-t1'));
    await fireEvent.changeText(getByTestId('modal-todo-text'), 'Buy oat milk');
    await fireEvent.press(getByTestId('modal-todo-repo'));
    await fireEvent.press(getByTestId('modal-todo-branch'));
    await fireEvent.press(getByTestId('modal-todo-submit'));

    expect(stageUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: 'owner/repo',
        branch: 'main',
        filePath: 'todos/buy-milk.json',
        title: 'Buy oat milk',
      }),
    );
    expect(syncTodoToGitHub).not.toHaveBeenCalled();
  });
});

describe('staging rewire — heavy screens (source-level)', () => {
  const canvasSrc = fs.readFileSync(
    path.join(__dirname, '../src/components/canvas/CanvasEditorContent.tsx'),
    'utf-8',
  );
  const homeSrc = fs.readFileSync(path.join(__dirname, '../src/screens/HomeScreen.tsx'), 'utf-8');
  const settingsSrc = fs.readFileSync(path.join(__dirname, '../src/screens/SettingsScreen.tsx'), 'utf-8');

  it('CanvasEditorContent.saveCanvas calls stageUpsert and no longer references the flag or syncCanvasToGitHub', () => {
    expect(canvasSrc).toMatch(/import\s*\{\s*StagingService\s*\}\s*from\s*['"].*StagingService['"]/);
    expect(canvasSrc).toContain('StagingService.stageUpsert');
    expect(canvasSrc).toContain('JSON.stringify(scene, null, 2)');
    expect(canvasSrc).not.toContain('FEATURE_STAGE_PUSH');
    expect(canvasSrc).not.toContain('syncCanvasToGitHub');
  });

  it('HomeScreen.handleColorSelect calls stageUpsert and no longer references the flag or syncNoteToGitHub', () => {
    expect(homeSrc).toMatch(/import\s*\{\s*StagingService\s*\}\s*from\s*['"].*StagingService['"]/);
    expect(homeSrc).toContain('StagingService.stageUpsert');
    expect(homeSrc).not.toContain('FEATURE_STAGE_PUSH');
    expect(homeSrc).not.toContain('syncNoteToGitHub');
  });

  it('SettingsScreen.handleSyncExistingTemplates calls stageUpsert and no longer references the flag or syncTemplateToGitHub', () => {
    expect(settingsSrc).toMatch(/import\s*\{\s*StagingService\s*\}\s*from\s*['"].*StagingService['"]/);
    expect(settingsSrc).toContain('StagingService.stageUpsert');
    expect(settingsSrc).not.toContain('FEATURE_STAGE_PUSH');
    expect(settingsSrc).not.toContain('syncTemplateToGitHub');
  });
});
