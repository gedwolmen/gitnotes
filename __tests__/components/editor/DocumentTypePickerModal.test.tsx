import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { DocumentTypePickerModal } from '../../../src/components/editor/DocumentTypePickerModal';
import type { RootStackParamList } from '../../../src/navigation/types';

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('react-native', () => {
  const React = require('react');
  const RNView = ({ children, testID, accessibilityLabel, accessibilityRole, onPress, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('View', { testID, accessibilityLabel, accessibilityRole, onPress, ...props }, children);
  RNView.displayName = 'View';
  return {
    __esModule: true,
    View: RNView,
    Modal: ({ children, visible, onRequestClose, onShow }: React.PropsWithChildren<Record<string, unknown>>) => {
      if (!visible) return null;
      if (onShow) onShow();
      return children;
    },
    TouchableOpacity: ({ children, testID, accessibilityLabel, accessibilityRole, onPress, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement('TouchableOpacity', { testID, accessibilityLabel, accessibilityRole, onPress, ...props }, children),
    Text: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => React.createElement('Text', props, children),
    TextInput: ({ ...props }: Record<string, unknown>) => React.createElement('TextInput', props),
    StyleSheet: {
      create: (s: Record<string, unknown>) => s,
      flatten: (s: unknown) => (Array.isArray(s) ? Object.assign({}, ...s) : s),
    },
    Platform: { OS: 'ios' },
    KeyboardAvoidingView: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => 'Icon',
}));

jest.mock('@/contexts/ThemeContext', () => {
  const mockColors = {
    background: '#ffffff',
    text: '#000000',
    textSecondary: '#666666',
    accent: '#0066ff',
    primary: '#0066ff',
    surface: '#f5f5f5',
    card: '#ffffff',
    border: '#e0e0e0',
    shadow: '#000000',
  };
  return {
    useTheme: () => ({ colors: mockColors, style: {}, isDark: false }),
    useTokens: () => ({
      colors: mockColors,
      spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
      radii: { sm: 4, md: 8, lg: 16, full: 9999 },
      type: 'light' as const,
    }),
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('DocumentTypePickerModal', () => {
  const mockOnSelectVisualCanvas = jest.fn();
  const mockOnSelectDiagram = jest.fn();
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderModal = (visible = true) => {
    return render(
      <DocumentTypePickerModal
        visible={visible}
        onSelectVisualCanvas={mockOnSelectVisualCanvas}
        onSelectDiagram={mockOnSelectDiagram}
        onClose={mockOnClose}
      />,
    );
  };

  it('renders both document type options when visible', () => {
    renderModal();
    expect(screen.getByTestId('document-type-picker.button.visual-canvas')).toBeTruthy();
    expect(screen.getByTestId('document-type-picker.button.ascii-diagram')).toBeTruthy();
  });

  it('renders cancel button', () => {
    renderModal();
    expect(screen.getByTestId('document-type-picker.button.cancel')).toBeTruthy();
  });

  it('calls onSelectVisualCanvas when visual canvas option is pressed', () => {
    renderModal();
    fireEvent.press(screen.getByTestId('document-type-picker.button.visual-canvas'));
    expect(mockOnSelectVisualCanvas).toHaveBeenCalledTimes(1);
  });

  it('calls onSelectDiagram when diagram option is pressed', () => {
    renderModal();
    fireEvent.press(screen.getByTestId('document-type-picker.button.ascii-diagram'));
    expect(mockOnSelectDiagram).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when cancel is pressed', () => {
    renderModal();
    fireEvent.press(screen.getByTestId('document-type-picker.button.cancel'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('guards against rapid double-tap on visual canvas', () => {
    renderModal();
    fireEvent.press(screen.getByTestId('document-type-picker.button.visual-canvas'));
    fireEvent.press(screen.getByTestId('document-type-picker.button.visual-canvas'));
    expect(mockOnSelectVisualCanvas).toHaveBeenCalledTimes(1);
  });

  it('guards against rapid double-tap on diagram', () => {
    renderModal();
    fireEvent.press(screen.getByTestId('document-type-picker.button.ascii-diagram'));
    fireEvent.press(screen.getByTestId('document-type-picker.button.ascii-diagram'));
    expect(mockOnSelectDiagram).toHaveBeenCalledTimes(1);
  });

  it('does not render when visible is false', () => {
    renderModal(false);
    expect(screen.queryByTestId('document-type-picker.button.visual-canvas')).toBeNull();
  });
});
