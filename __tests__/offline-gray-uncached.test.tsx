var mockNavigate = jest.fn();

jest.mock('@react-native-community/netinfo', () => {
  const addEventListener = jest.fn(() => jest.fn());
  const fetch = jest.fn(() => Promise.resolve({ isConnected: false, isInternetReachable: false }));
  return { __esModule: true, default: { addEventListener, fetch }, addEventListener, fetch };
});

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');
  const FlashList = React.forwardRef(({ data = [], renderItem }: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ scrollToIndex: jest.fn() }));
    return <View>{data.map((item: any, index: number) => renderItem({ item, index }))}</View>;
  });
  return { FlashList };
});

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = require('react');
  const { View } = require('react-native');
  return React.forwardRef(({ children }: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ close: jest.fn() }));
    return <View>{children}</View>;
  });
});

jest.mock('@expo/vector-icons', () => {
  const { createElement } = require('react');
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: any) => createElement(Text, null, name) };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('../src/contexts/NoteContext', () => ({
  useNotes: jest.fn(),
}));

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ authState: { token: null } }),
}));

jest.mock('../src/contexts/RepoContext', () => ({
  useRepos: () => ({ repositories: [] }),
}));

jest.mock('../src/contexts/ViewModeContext', () => ({
  useViewMode: () => ({ viewMode: 'list', setViewMode: jest.fn() }),
}));

jest.mock('../src/components/ContextMenu', () => () => null);
jest.mock('../src/components/ColorPicker', () => ({ __esModule: true, default: () => null }));
jest.mock('../src/components/SearchBar', () => () => null);
jest.mock('../src/components/GitHubActivityIndicator', () => ({ GitHubActivityIndicator: () => null }));
jest.mock('../src/components/ui/OfflineBanner', () => ({ OfflineBanner: () => null }));
jest.mock('../src/components/ui', () => ({ ScreenHeader: () => null }));
jest.mock('../src/hooks/useResponsive', () => ({ useResponsive: () => ({ isTablet: false, maxContentWidth: 720 }) }));
jest.mock('../src/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isConnected: false, isInternetReachable: false }) }));
jest.mock('../src/services/GitHubService', () => ({ GitHubService: { setToken: jest.fn() } }));
jest.mock('../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    pendingCount: jest.fn(() => Promise.resolve(0)),
    subscribe: jest.fn(() => jest.fn()),
    drain: jest.fn(() => Promise.resolve({ succeeded: 0 })),
  },
}));
jest.mock('../src/services/RepoPullService', () => ({ pullAllFromRepos: jest.fn() }));
jest.mock('../src/services/ShareService', () => ({ ShareService: { isAvailable: jest.fn(() => false) } }));
jest.mock('../src/utils/haptics', () => ({
  HapticService: { light: jest.fn(), medium: jest.fn(), selection: jest.fn(), success: jest.fn(), warning: jest.fn() },
}));
jest.mock('../src/stores/githubActivityStore', () => ({
  githubActivity: { begin: jest.fn(), end: jest.fn() },
}));

import { Alert, StyleSheet } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import NoteCard from '../src/components/NoteCard';
import NotesListScreen from '../src/screens/NotesListScreen';
import { useNotes } from '../src/contexts/NoteContext';
import { Note } from '../src/models/Note';
import { NEUMORPHIC_LIGHT } from '../src/theme/tokens';
import { TestThemeProvider } from './ui/testThemeProvider';

const mockedUseNotes = useNotes as jest.MockedFunction<typeof useNotes>;

const buildNote = (overrides: Partial<Note> = {}): Note => ({
  id: 'note-1',
  title: 'Offline note',
  content: '',
  createdAt: 1,
  updatedAt: 1,
  tags: [],
  ...overrides,
});

describe('offline gray uncached behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('grays out uncached notes offline and keeps online notes normal', () => {
    const offlineRender = render(
      <TestThemeProvider mode="light">
        <NoteCard note={buildNote()} onPress={jest.fn()} isOffline isCached={false} />
      </TestThemeProvider>,
    );

    expect(StyleSheet.flatten(offlineRender.getByTestId('note-card-note-1').props.style).opacity).toBe(0.5);
    expect(StyleSheet.flatten(offlineRender.getByTestId('note-card-title-note-1').props.style).color).toBe(NEUMORPHIC_LIGHT.textSecondary);

    offlineRender.unmount();

    const onlineRender = render(
      <TestThemeProvider mode="light">
        <NoteCard note={buildNote()} onPress={jest.fn()} isOffline={false} isCached={false} />
      </TestThemeProvider>,
    );

    expect(StyleSheet.flatten(onlineRender.getByTestId('note-card-note-1').props.style).opacity).toBe(1);
    expect(StyleSheet.flatten(onlineRender.getByTestId('note-card-title-note-1').props.style).color).toBe(NEUMORPHIC_LIGHT.text);
  });

  it('blocks navigation for offline uncached notes', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined as never);
    mockNavigate.mockClear();

    mockedUseNotes.mockReturnValue({
      notes: [buildNote()],
      filteredNotes: [buildNote()],
      isLoading: false,
      searchQuery: '',
      setSearchQuery: jest.fn(),
      deleteNote: jest.fn(),
      refreshNotes: jest.fn(),
      togglePin: jest.fn(),
      error: null,
      createNote: jest.fn(),
    } as any);

    const { getByTestId, unmount } = render(
      <TestThemeProvider mode="light">
        <NotesListScreen />
      </TestThemeProvider>,
    );

    expect(StyleSheet.flatten(getByTestId('note-card-note-1').props.style).opacity).toBe(0.5);

    fireEvent.press(getByTestId('note-card-note-1'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Not available offline'));
    expect(mockNavigate).not.toHaveBeenCalled();

    alertSpy.mockRestore();
    unmount();
  });
});
