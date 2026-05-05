import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import NoteEditorScreen from '../../src/screens/NoteEditorScreen';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

let mockNotesSeed: any[] = [];

const mockCreateNote = jest.fn(async () => ({ id: 'new-note-1' }));
const mockUpdateNote = jest.fn(async () => null);
const mockGetNoteById = jest.fn(() => undefined);

jest.mock('@react-native-community/netinfo', () => {
  const addEventListener = jest.fn(() => jest.fn());
  const fetch = jest.fn(() =>
    Promise.resolve({ isConnected: true, isInternetReachable: true }),
  );
  return {
    __esModule: true,
    default: { addEventListener, fetch },
    addEventListener,
    fetch,
  };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => ({ params: {} }),
}));

jest.mock('@react-navigation/native-stack', () => ({}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('../../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#fff',
      surface: '#f4f4f4',
      primary: '#2563eb',
      text: '#111',
      textSecondary: '#666',
      border: '#ddd',
      error: '#dc2626',
    },
    isDark: false,
  }),
}));

jest.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({ authState: { token: null }, activeAccountId: null }),
}));

jest.mock('../../src/contexts/RepoContext', () => ({
  useRepos: () => ({ repositories: [] }),
}));

jest.mock('../../src/contexts/NoteContext', () => ({
  useNotes: () => ({
    notes: mockNotesSeed,
    getNoteById: mockGetNoteById,
    createNote: mockCreateNote,
    updateNote: mockUpdateNote,
  }),
}));

jest.mock('../../src/contexts/CanvasContext', () => ({
  useCanvases: () => ({ canvases: [] }),
}));

jest.mock('../../src/contexts/FolderContext', () => ({
  useFolders: () => ({ folders: [] }),
}));

jest.mock('../../src/hooks/useResponsive', () => ({
  useResponsive: () => ({ isTablet: false, maxContentWidth: 0, sideBySide: false }),
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

jest.mock('../../src/services/GitHubService', () => ({
  GitHubService: { setToken: jest.fn() },
}));

jest.mock('../../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    pendingCount: jest.fn(async () => 0),
    subscribe: jest.fn(() => jest.fn()),
    drain: jest.fn(async () => ({ succeeded: 0 })),
    enqueueNoteUpsert: jest.fn(async () => undefined),
  },
}));

jest.mock('../../src/services/NoteGitHubSyncService', () => ({
  syncNoteToGitHub: jest.fn(async () => ({ success: true })),
}));

jest.mock('../../src/services/GitService', () => ({
  GitService: {
    getBranches: jest.fn(async () => []),
    getRepositoryFolders: jest.fn(async () => []),
  },
}));

jest.mock('../../src/stores/githubActivityStore', () => ({
  githubActivity: { begin: jest.fn(), end: jest.fn() },
}));

jest.mock('../../src/stores/renderStyleStore', () => ({
  useRenderStyle: () => null,
}));

jest.mock('../../src/utils/preview', () => ({
  getMarkdownStyles: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
}));

jest.mock('../../src/components/editor/EditorHeader', () => ({
  EditorHeader: ({ noteId, onSave, onCancel }: any) => {
    const { View, Text, Pressable } = require('react-native');
    return (
      <View testID="editor-header">
        <Text>{noteId ? 'Edit Note' : 'New Note'}</Text>
        <Pressable testID="save-btn" onPress={onSave}>
          <Text>Save</Text>
        </Pressable>
        <Pressable testID="cancel-btn" onPress={onCancel}>
          <Text>Cancel</Text>
        </Pressable>
      </View>
    );
  },
}));

jest.mock('../../src/components/editor/EditorToolbar', () => ({
  EditorToolbar: () => {
    const { View } = require('react-native');
    return <View testID="editor-toolbar" />;
  },
}));

jest.mock('../../src/components/editor/NoteEditorForm', () => ({
  NoteEditorForm: ({ title, onTitleChange, content, onContentChange }: any) => {
    const { View, TextInput } = require('react-native');
    return (
      <View testID="note-editor-form">
        <TextInput testID="title-input" value={title} onChangeText={onTitleChange} />
        <TextInput testID="content-input" value={content} onChangeText={onContentChange} />
      </View>
    );
  },
}));

jest.mock('../../src/components/editor/NotePreviewPane', () => ({
  NotePreviewPane: () => null,
}));

jest.mock('../../src/components/editor/NoteViewer', () => ({
  NoteViewer: ({ onBack, onEdit }: any) => {
    const { View, Pressable } = require('react-native');
    return (
      <View testID="note-viewer">
        <Pressable testID="viewer-back-btn" onPress={onBack} />
        <Pressable testID="viewer-edit-btn" onPress={onEdit} />
      </View>
    );
  },
}));

jest.mock('../../src/components/editor/CanvasPickerModal', () => ({
  CanvasPickerModal: () => null,
}));

jest.mock('../../src/components/editor/useNoteEditorDocument', () => ({
  useNoteEditorDocument: () => ({
    title: '',
    content: '',
    repo: undefined,
    branch: undefined,
    commit: undefined,
    folderPath: undefined,
    noteFormat: 'markdown',
    tags: [],
    attachments: [],
    isSaving: false,
    isEditing: true,
    canUndo: false,
    canRedo: false,
    repoFolders: [],
    selectedFolderId: null,
    canvasJsonRefs: [],
    canvasEditJsonUri: undefined,
    editorPlaceholder: '# Heading\n',
    setIsEditing: jest.fn(),
    setCanvasEditJsonUri: jest.fn(),
    handleTitleChange: jest.fn(),
    handleContentChange: jest.fn(),
    handleRepoChange: jest.fn(),
    handleBranchChange: jest.fn(),
    handleCommitChange: jest.fn(),
    handleFolderSelect: jest.fn(),
    handleTagsChange: jest.fn(),
    handleNoteFormatChange: jest.fn(),
    handleSave: jest.fn(async () => {}),
    handleCancelEdit: jest.fn(),
    handleUndo: jest.fn(),
    handleRedo: jest.fn(),
    handleVoiceDone: jest.fn(),
    handleCanvasSave: jest.fn(),
    handleEditCanvasJson: jest.fn(),
    handleLinkCanvas: jest.fn(),
    handlePickImage: jest.fn(),
  }),
}));

jest.mock('../../src/components/editor/useNoteEditorPreview', () => ({
  useNoteEditorPreview: () => ({
    previewContent: '',
    pdfViewerUri: '',
    parsedStructuredContent: null,
    notePreviewRenderer: null,
    speakableContent: '',
    isSpeaking: false,
    showToc: false,
    tocEntries: [],
    pdfLoadError: null,
    previewScrollRef: { current: null },
    setShowToc: jest.fn(),
    setPdfLoadError: jest.fn(),
    handleToggleSpeak: jest.fn(),
    handleTocPress: jest.fn(),
    handlePreviewScroll: jest.fn(),
    handlePreviewContentSizeChange: jest.fn(),
    markdownStyles: {},
  }),
}));

jest.mock('../../src/components/VoiceInputModal', () => () => null);
jest.mock('../../src/components/CanvasModal', () => () => null);
jest.mock('../../src/components/FolderSelectionDialog', () => () => null);
jest.mock('../../src/components/GitHubActivityIndicator', () => () => null);

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
}));

jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
}));

describe('NoteEditorScreen', () => {
  beforeEach(() => {
    mockNotesSeed = [];
    mockNavigate.mockClear();
    mockGoBack.mockClear();
    mockCreateNote.mockClear();
    mockUpdateNote.mockClear();
    mockGetNoteById.mockClear();
  });

  it('renders without crashing in new note mode', () => {
    const { getByTestId } = render(<NoteEditorScreen />);
    expect(getByTestId('editor-header')).toBeTruthy();
  });

  it('shows editor form with title input', () => {
    const { getByTestId } = render(<NoteEditorScreen />);
    expect(getByTestId('title-input')).toBeTruthy();
  });

  it('shows editor form with content input', () => {
    const { getByTestId } = render(<NoteEditorScreen />);
    expect(getByTestId('content-input')).toBeTruthy();
  });

  it('shows editor toolbar', () => {
    const { getByTestId } = render(<NoteEditorScreen />);
    expect(getByTestId('editor-toolbar')).toBeTruthy();
  });

  it('shows header with New Note label for new notes', () => {
    const { getByText } = render(<NoteEditorScreen />);
    expect(getByText('New Note')).toBeTruthy();
  });

  it('renders cancel button', () => {
    const { getByTestId } = render(<NoteEditorScreen />);
    expect(getByTestId('cancel-btn')).toBeTruthy();
  });

  it('renders save button', () => {
    const { getByTestId } = render(<NoteEditorScreen />);
    expect(getByTestId('save-btn')).toBeTruthy();
  });
});
