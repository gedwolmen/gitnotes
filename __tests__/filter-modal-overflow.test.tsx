import { TouchableOpacity } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import NotesListScreen from '../src/screens/NotesListScreen';
import { Note } from '../src/models/Note';

const mockNotes: Note[] = Array.from({ length: 20 }, (_, index) => ({
  id: `note-${index + 1}`,
  title: `Note ${index + 1}`,
  content: `Content ${index + 1}`,
  createdAt: 1,
  updatedAt: 1,
  tags: [`tag-${index + 1}`],
  repo: 'repo-one',
  branch: `branch-${(index % 3) + 1}`,
  folderPath: `folder-${index + 1}`,
  format: 'markdown',
}));

const mockColorProxy = new Proxy(
  {
    background: '#fff',
    surface: '#f4f4f4',
    surfaceSecondary: '#e5e7eb',
    surfaceTertiary: '#d1d5db',
    primary: '#2563eb',
    text: '#111827',
    textSecondary: '#6b7280',
    border: '#d1d5db',
    error: '#dc2626',
    success: '#16a34a',
  },
  {
    get(target, key: string) {
      return key in target ? (target as Record<string, string>)[key] : '#111827';
    },
  },
);

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('../src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: mockColorProxy }),
}));

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ authState: { token: null } }),
}));

jest.mock('../src/contexts/RepoContext', () => ({
  useRepos: () => ({
    repositories: [
      { id: 'repo-one', name: 'Repo One', path: 'repo-one', branch: 'main' },
    ],
  }),
}));

jest.mock('../src/contexts/ViewModeContext', () => ({
  useViewMode: () => ({ viewMode: 'list', setViewMode: jest.fn() }),
}));

jest.mock('../src/contexts/NoteContext', () => ({
  useNotes: () => ({
    notes: mockNotes,
    filteredNotes: mockNotes,
    isLoading: false,
    searchQuery: '',
    setSearchQuery: jest.fn(),
    deleteNote: jest.fn(),
    refreshNotes: jest.fn(async () => undefined),
    togglePin: jest.fn(async () => true),
    error: null,
    createNote: jest.fn(async () => null),
  }),
}));

jest.mock('../src/stores/noteStore', () => ({
  useNoteStore: {
    getState: () => ({ error: null }),
  },
}));

jest.mock('../src/services/GitHubService', () => ({
  GitHubService: { setToken: jest.fn() },
}));

jest.mock('../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    pendingCount: jest.fn(async () => 0),
    subscribe: jest.fn(() => jest.fn()),
    drain: jest.fn(async () => ({ succeeded: 0 })),
  },
}));

jest.mock('../src/services/RepoPullService', () => ({
  pullAllFromRepos: jest.fn(async () => undefined),
}));

jest.mock('../src/services/ShareService', () => ({
  ShareService: { shareText: jest.fn() },
}));

jest.mock('../src/hooks/useResponsive', () => ({
  useResponsive: () => ({ isTablet: false, maxContentWidth: 0 }),
}));

jest.mock('../src/utils/haptics', () => ({
  HapticService: {
    light: jest.fn(),
    medium: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    selection: jest.fn(),
  },
}));

jest.mock('../src/components/ContextMenu', () => () => null);

jest.mock('../src/components/SearchBar', () => {
  const { TextInput } = require('react-native');
  return ({ value, onChangeText }: { value: string; onChangeText: (value: string) => void }) => (
    <TextInput value={value} onChangeText={onChangeText} />
  );
});

jest.mock('../src/components/ui', () => ({
  ScreenHeader: ({ title }: { title: string }) => {
    const { Text } = require('react-native');
    return <Text>{title}</Text>;
  },
}));

jest.mock('../src/components/NoteCard', () => ({
  __esModule: true,
  default: ({ note }: { note: Note }) => {
    const { Text } = require('react-native');
    return <Text>{note.title}</Text>;
  },
}));

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    FlashList: React.forwardRef(({ data, renderItem, ListEmptyComponent }: any, _ref: any) => {
      if (!data?.length) {
        return <View>{ListEmptyComponent ?? null}</View>;
      }

      return <View>{data.map((item: Note, index: number) => renderItem({ item, index }))}</View>;
    }),
  };
});

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = require('react');
  const { View } = require('react-native');
  return React.forwardRef(({ children }: any, ref: any) => {
    React.useEffect(() => {
      if (ref) {
        ref.current = { close: jest.fn(), openLeft: jest.fn(), openRight: jest.fn(), reset: jest.fn() };
      }
      return () => {
        if (ref) ref.current = null;
      };
    }, [ref]);

    return <View>{children}</View>;
  });
});

const openFilterModal = (screen: ReturnType<typeof render>) => {
  const buttons = (screen as any).UNSAFE_getAllByType(TouchableOpacity);
  fireEvent.press(buttons[1]);
};

describe('filter modal chip overflow regression', () => {
  it('renders all folder chips when the list wraps', async () => {
    const screen = render(<NotesListScreen />);

    openFilterModal(screen);

    await waitFor(() => expect(screen.getByText('Filter Notes')).toBeTruthy());
    fireEvent.press(screen.getAllByText('Repo One')[0]);

    expect(screen.getAllByText(/^folder-/)).toHaveLength(20);
    expect(screen.getAllByText(/^branch-/)).toHaveLength(3);
    expect(screen.getAllByText(/^tag-/)).toHaveLength(20);
  });
});
