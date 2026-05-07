jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => jest.fn()), fetch: jest.fn(async () => ({ isConnected: true })) },
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true }),
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => React.createElement(Text, null, name) };
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: any) => <View>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    glossy: false,
    colors: {
      background: '#fff',
      surface: '#f4f4f4',
      surfaceSecondary: '#eee',
      elevated: '#fff',
      glassElevated: '#fff',
      primary: '#2563eb',
      accent: '#2563eb',
      text: '#111',
      textSecondary: '#666',
      border: '#ddd',
      error: '#dc2626',
    },
  }),
  useTokens: () => ({
    colors: { accent: '#2563eb', text: '#111', textSecondary: '#666' },
    spacing: [0, 4, 8, 12, 16, 20, 24],
    type: { sm: 12, '2xl': 22 },
  }),
}));

jest.mock('../src/components/ui', () => {
  const { Text, View, TouchableOpacity } = require('react-native');
  return {
    useScreenHeaderHeight: () => 60,
    SCREEN_HEADER_BASE_HEIGHT: 60,
    ScreenHeader: ({ title, subtitle, actions }: any) => (
      <View>
        <Text>{title}</Text>
        {subtitle ? <Text>{subtitle}</Text> : null}
        {actions ?? null}
      </View>
    ),
    IconButton: ({ children, onPress, accessibilityLabel }: any) => (
      <TouchableOpacity onPress={onPress} accessibilityLabel={accessibilityLabel}>
        {children}
      </TouchableOpacity>
    ),
    Modal: ({ visible, children }: any) => (visible ? <View>{children}</View> : null),
  };
});

// Persist between calls so seeded state survives the screen's loadTemplates()
// hydration on mount.
let mockCustomTemplates: any[] = [];
let mockPinnedIds: string[] = [];

jest.mock('../src/services/StorageService', () => ({
  StorageService: {
    loadCustomTemplates: jest.fn(async () => mockCustomTemplates),
    loadTemplatePins: jest.fn(async () => mockPinnedIds),
    saveCustomTemplates: jest.fn(async (next: any[]) => {
      mockCustomTemplates = next;
    }),
    saveTemplatePins: jest.fn(async (next: string[]) => {
      mockPinnedIds = next;
    }),
  },
}));

import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import TemplateManagerScreen from '../src/screens/TemplateManagerScreen';
import { useTemplateStore } from '../src/stores/templateStore';
import { NOTE_TEMPLATES } from '../src/services/TemplateService';

const resetStore = () => {
  mockCustomTemplates = [];
  mockPinnedIds = [];
  useTemplateStore.setState({ customTemplates: [], pinnedIds: [], isLoading: false });
};

describe('TemplateManagerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
  });

  it('renders all built-in templates when no custom ones exist', async () => {
    const { getByText, queryByText } = render(<TemplateManagerScreen />);

    await waitFor(() => {
      expect(getByText(NOTE_TEMPLATES[0].name)).toBeTruthy();
    });

    // No "custom" rows; subtitle shows 0 custom
    expect(queryByText(/0 custom/)).toBeTruthy();
  });

  it('renders a custom template row with edit + delete actions', async () => {
    await act(async () => {
      await useTemplateStore.getState().createTemplate({
        name: 'My Template',
        icon: 'document-outline',
        description: 'desc',
        content: 'body',
        tags: [],
      });
    });

    const { getByText, getAllByLabelText } = render(<TemplateManagerScreen />);

    await waitFor(() => expect(getByText('My Template')).toBeTruthy());

    // Both edit and delete actions exist for custom rows.
    expect(getAllByLabelText('Edit template').length).toBeGreaterThan(0);
    expect(getAllByLabelText('Delete template').length).toBeGreaterThan(0);
  });

  it('creates a template via the form and updates the list', async () => {
    const { getByTestId, getByText, queryByText } = render(<TemplateManagerScreen />);

    await waitFor(() => expect(getByText('Templates')).toBeTruthy());

    fireEvent.press(getByTestId('template-manager.button.create'));
    fireEvent.changeText(getByTestId('template-editor.input.name'), 'Brand New');
    fireEvent.changeText(getByTestId('template-editor.input.content'), '## Hi');

    await act(async () => {
      fireEvent.press(getByTestId('template-editor.button.save'));
    });

    await waitFor(() => expect(queryByText('Brand New')).toBeTruthy());
    expect(useTemplateStore.getState().customTemplates).toHaveLength(1);
    expect(useTemplateStore.getState().customTemplates[0].name).toBe('Brand New');
    expect(useTemplateStore.getState().customTemplates[0].id.startsWith('custom-')).toBe(true);
  });

  it('persists icon, description, title, and tags from the create modal', async () => {
    const { getByTestId, getByText } = render(<TemplateManagerScreen />);

    await waitFor(() => expect(getByText('Templates')).toBeTruthy());

    fireEvent.press(getByTestId('template-manager.button.create'));
    fireEvent.changeText(getByTestId('template-editor.input.name'), 'Retro');
    fireEvent.press(getByTestId('template-editor.button.select-icon-bulb-outline'));
    fireEvent.changeText(getByTestId('template-editor.input.description'), 'Weekly retrospective');
    fireEvent.changeText(getByTestId('template-editor.input.title'), 'Retro - ');
    fireEvent.changeText(getByTestId('template-tag-input'), 'team, weekly,');
    fireEvent.changeText(getByTestId('template-editor.input.content'), '## Wins');

    await act(async () => {
      fireEvent.press(getByTestId('template-editor.button.save'));
    });

    await waitFor(() => {
      const created = useTemplateStore.getState().customTemplates[0];
      expect(created).toBeTruthy();
      expect(created.name).toBe('Retro');
      expect(created.icon).toBe('bulb-outline');
      expect(created.description).toBe('Weekly retrospective');
      expect(created.title).toBe('Retro - ');
      expect(created.tags).toEqual(['team', 'weekly']);
      expect(created.content).toBe('## Wins');
    });
  });

  it('preloads icon, description, title, and tags when editing', async () => {
    await act(async () => {
      await useTemplateStore.getState().createTemplate({
        name: 'Editable',
        icon: 'rocket-outline',
        description: 'Original description',
        title: 'Launch - ',
        content: 'body',
        tags: ['ship', 'launch'],
      });
    });

    const created = useTemplateStore.getState().customTemplates[0];
    const { getByTestId, getByText } = render(<TemplateManagerScreen />);

    await waitFor(() => expect(getByText('Editable')).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByTestId(`template-list-item.icon-button.edit-${created.id}`));
    });

    expect(getByTestId('template-editor.input.name').props.value).toBe('Editable');
    expect(getByTestId('template-editor.input.description').props.value).toBe('Original description');
    expect(getByTestId('template-editor.input.title').props.value).toBe('Launch - ');
    expect(getByTestId(`template-tag-chip-ship`)).toBeTruthy();
    expect(getByTestId(`template-tag-chip-launch`)).toBeTruthy();
    expect(getByTestId('template-editor.button.select-icon-rocket-outline').props.accessibilityState).toMatchObject({ selected: true });

    fireEvent.changeText(getByTestId('template-editor.input.description'), 'Updated description');
    fireEvent.press(getByTestId('template-tag-chip-ship'));

    await act(async () => {
      fireEvent.press(getByTestId('template-editor.button.save'));
    });

    await waitFor(() => {
      const updated = useTemplateStore.getState().customTemplates[0];
      expect(updated.description).toBe('Updated description');
      expect(updated.tags).toEqual(['launch']);
      expect(updated.icon).toBe('rocket-outline');
    });
  });

  it('toggles pin via the pin button and persists state', async () => {
    const { getByTestId, findByTestId } = render(<TemplateManagerScreen />);

    const builtInId = NOTE_TEMPLATES[0].id;

    // Wait for the initial loadTemplates() effect to settle so the row exists.
    await findByTestId(`template-list-item.icon-button.pin-${builtInId}`);

    await act(async () => {
      fireEvent.press(getByTestId(`template-list-item.icon-button.pin-${builtInId}`));
    });

    await waitFor(() =>
      expect(useTemplateStore.getState().pinnedIds).toContain(builtInId),
    );

    await act(async () => {
      fireEvent.press(getByTestId(`template-list-item.icon-button.pin-${builtInId}`));
    });

    await waitFor(() =>
      expect(useTemplateStore.getState().pinnedIds).not.toContain(builtInId),
    );
  });

  it('deletes a custom template after confirmation', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      const destructive = (buttons ?? []).find((b: any) => b.style === 'destructive');
      destructive?.onPress?.();
    });

    const created = await act(async () =>
      useTemplateStore.getState().createTemplate({
        name: 'To Delete',
        icon: 'document-outline',
        description: 'desc',
        content: '',
        tags: [],
      }),
    );

    const { getByTestId, queryByText } = render(<TemplateManagerScreen />);

    await waitFor(() => expect(queryByText('To Delete')).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByTestId(`template-list-item.icon-button.delete-${(created as any).id}`));
    });

    await waitFor(() => expect(queryByText('To Delete')).toBeNull());
    expect(useTemplateStore.getState().customTemplates).toHaveLength(0);

    alertSpy.mockRestore();
  });
});
