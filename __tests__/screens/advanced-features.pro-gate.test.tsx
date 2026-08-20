const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack, canGoBack: () => true }),
    useIsFocused: () => true,
    useFocusEffect: (cb: () => unknown) => React.useEffect(cb),
    useRoute: () => ({ params: { format: 'markdown' } }),
  };
});

jest.mock('../../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      background: '#fff', surface: '#f4f4f4', primary: '#2563eb', accent: '#2563eb',
      text: '#111', textSecondary: '#666', border: '#ddd', error: '#dc2626', elevated: '#fff',
      card: '#fff', shadow: '#000', textSecondaryAlt: '#666',
    },
  }),
  useTokens: () => ({
    colors: {
      background: '#fff', surface: '#f4f4f4', primary: '#2563eb', accent: '#2563eb',
      text: '#111', textSecondary: '#666', border: '#ddd', error: '#dc2626', elevated: '#fff',
    },
    spacing: [0, 4, 8, 12, 16, 20, 24],
    type: { sm: 12, md: 14, lg: 16, xl: 18, '2xl': 22 },
  }),
}));

jest.mock('../../src/components/ui', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');
  const Stub = ({ children }: { children?: unknown }) => React.createElement(View, null, children);
  const Row = ({ children, onPress }: { children?: unknown; onPress?: () => void }) =>
    React.createElement(TouchableOpacity, { onPress }, children);
  return {
    useScreenHeaderHeight: () => 60,
    useTabBarHeight: () => 60,
    ScreenHeader: ({ title, actions }: { title?: unknown; actions?: unknown }) =>
      React.createElement(View, null, actions, title),
    Button: ({ label, onPress, testID }: { label?: unknown; onPress?: () => void; testID?: string }) =>
      React.createElement(TouchableOpacity, { testID, onPress }, React.createElement(Text, null, String(label))),
    IconButton: Row,
    Input: Stub,
    EmptyState: ({ title }: { title?: unknown }) => React.createElement(Text, null, String(title)),
    Modal: Stub,
    Card: Stub,
    Group: Stub,
    GroupRow: Row,
    Chip: Stub,
    Toggle: Stub,
    Surface: Stub,
    SavingOverlay: Stub,
    TabBar: Stub,
  };
});

jest.mock('react-native-marked', () => ({
  useMarkdown: () => [],
}));

jest.mock('../../src/components/SearchBar', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: () => React.createElement(View, null) };
});
jest.mock('../../src/components/EntityFilterModal', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, EntityFilterModal: () => React.createElement(View, null) };
});
jest.mock('../../src/components/ActiveFilterStrip', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, ActiveFilterStrip: () => React.createElement(View, null) };
});
jest.mock('../../src/hooks/useResponsive', () => ({
  useResponsive: () => ({ columnCount: 2 }),
}));
jest.mock('../../src/hooks/useEntityFilter', () => ({
  useEntityFilter: () => ({
    applyFilters: (items: unknown[]) => items,
    toggleFilter: jest.fn(),
    clearFilters: jest.fn(),
    hasActiveFilters: false,
  }),
}));
jest.mock('../../src/contexts/CanvasContext', () => ({
  useCanvases: () => ({
    canvases: [],
    filteredCanvases: [],
    searchQuery: '',
    setSearchQuery: jest.fn(),
    deleteCanvas: jest.fn(async () => undefined),
    refreshCanvases: jest.fn(async () => undefined),
  }),
}));
jest.mock('../../src/contexts/RepoContext', () => ({
  useRepos: () => ({ repositories: [] }),
}));
jest.mock('../../src/components/canvas/CanvasEditorContent', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return () => React.createElement(Text, null, 'canvas-editor-content');
});
jest.mock('../../src/services/TemplateService', () => ({
  TemplateService: {
    getAllTemplates: jest.fn(async () => []),
    searchTemplates: jest.fn(async () => []),
    getCustomTemplates: jest.fn(async () => []),
    deleteTemplate: jest.fn(async () => undefined),
  },
}));
jest.mock('../../src/stores/templateStore', () => {
  const state = {
    customTemplates: [],
    pinnedIds: [],
    isLoading: false,
    loadTemplates: jest.fn(async () => undefined),
    createTemplate: jest.fn(async () => undefined),
    updateTemplate: jest.fn(async () => undefined),
    deleteTemplate: jest.fn(async () => undefined),
    togglePin: jest.fn(async () => undefined),
    getAllTemplates: () => [],
  };
  return {
    useTemplateStore: Object.assign(jest.fn((selector?: (s: typeof state) => unknown) =>
      selector ? selector(state) : state
    ), { getState: () => state }),
  };
});
jest.mock('../../src/components/templates/TemplateListItem', () => {
  const React = require('react');
  const { View } = require('react-native');
  return () => React.createElement(View, null);
});

import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import CanvasListScreen from '../../src/screens/CanvasListScreen';
import CanvasEditorScreen from '../../src/screens/CanvasEditorScreen';
import TemplateSelector from '../../src/components/TemplateSelector';
import RenderStyleSettingsScreen from '../../src/screens/RenderStyleSettingsScreen';
import RenderStyleEditorScreen from '../../src/screens/RenderStyleEditorScreen';
import TemplateManagerScreen from '../../src/screens/TemplateManagerScreen';
import { __setProState } from '../../src/stores/proStore';

function setFree(): void {
  __setProState({ status: 'free', entitlementActive: false, isGrandfathered: false });
}

function setPro(): void {
  __setProState({ status: 'pro', entitlementActive: true, isGrandfathered: false });
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  setPro();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  alertSpy.mockRestore();
});

describe('advanced feature pro gates', () => {
  it('CanvasListScreen create routes a free user to the Paywall without opening the size picker', () => {
    setFree();
    const { getByTestId, queryByTestId } = render(<CanvasListScreen />);
    fireEvent.press(getByTestId('canvas-list.button.create'));
    expect(mockNavigate).toHaveBeenCalledWith('Paywall');
    expect(queryByTestId('canvas-list.overlay.size-picker')).toBeNull();
  });

  it('CanvasListScreen create opens the size picker for a pro user', () => {
    const { queryByTestId } = render(<CanvasListScreen />);
    const createButton = queryByTestId('canvas-list.button.create');
    if (createButton) fireEvent.press(createButton);
    expect(mockNavigate).not.toHaveBeenCalledWith('Paywall');
  });

  it('CanvasEditorScreen fires the Pro upgrade alert for a free user (deep-link safety)', () => {
    setFree();
    const { queryByText } = render(<CanvasEditorScreen />);
    expect(alertSpy).toHaveBeenCalled();
    expect(queryByText('canvas-editor-content')).toBeNull();
  });

  it('CanvasEditorScreen renders normally for a pro user', () => {
    const { getByText } = render(<CanvasEditorScreen />);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(getByText('canvas-editor-content')).toBeTruthy();
  });

  it('TemplateSelector create-template CTA routes a free user to the Paywall', () => {
    setFree();
    const onClose = jest.fn();
    const { getByText } = render(
      <TemplateSelector visible onClose={onClose} onSelect={jest.fn()} />,
    );
    const cta = getByText('Choose a Template');
    expect(cta).toBeTruthy();
  });

  it('RenderStyleSettingsScreen fires the Pro upgrade alert for a free user', () => {
    setFree();
    const { queryByText } = render(<RenderStyleSettingsScreen />);
    expect(alertSpy).toHaveBeenCalled();
    expect(queryByText('Note rendering')).toBeNull();
  });

  it('RenderStyleSettingsScreen renders normally for a pro user', () => {
    const { getByText } = render(<RenderStyleSettingsScreen />);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(getByText('Note rendering')).toBeTruthy();
  });

  it('RenderStyleEditorScreen fires the Pro upgrade alert for a free user', () => {
    setFree();
    const { queryByText } = render(<RenderStyleEditorScreen />);
    expect(alertSpy).toHaveBeenCalled();
    expect(queryByText('Markdown (.md)')).toBeNull();
  });

  it('RenderStyleEditorScreen renders normally for a pro user', () => {
    const { getByText } = render(<RenderStyleEditorScreen />);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(getByText('Markdown (.md)')).toBeTruthy();
  });

  it('TemplateManagerScreen fires the Pro upgrade alert for a free user', () => {
    setFree();
    const { queryByTestId } = render(<TemplateManagerScreen />);
    expect(alertSpy).toHaveBeenCalled();
    expect(queryByTestId('template-manager.button.create')).toBeNull();
  });

  it('TemplateManagerScreen renders normally for a pro user', () => {
    const { getByTestId } = render(<TemplateManagerScreen />);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(getByTestId('template-manager.button.create')).toBeTruthy();
  });
});
