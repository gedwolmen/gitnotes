/**
 * Tests for ConnectHostModal token rejection guidance.
 *
 * Verifies that handleTest and handleSave show reason-specific i18n
 * guidance from settings.token* keys when token validation fails.
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Modal } from '@/components/ui';
import { ConnectHostModal } from '@/components/ConnectHostModal';

// ─── Mock react-native ───────────────────────────────────────────────────────
jest.mock('react-native', () => {
  const fn = jest.fn();
  const React = require('react');
  return {
    __esModule: true,
    View: 'View',
    Text: 'Text',
    TextInput: ({ testID, placeholder, ...rest }: { testID?: string; placeholder?: string; [key: string]: unknown }) =>
      React.createElement('TextInput', { testID, placeholder, ...rest }),
    ScrollView: 'ScrollView',
    Pressable: 'Pressable',
    ActivityIndicator: 'ActivityIndicator',
    SafeAreaView: 'SafeAreaView',
    Alert: { alert: jest.fn() },
    Platform: { OS: 'ios', select: (obj: Record<string, unknown>) => obj.ios ?? obj.default },
    StyleSheet: { create: (style: unknown) => style, flatten: fn },
    AppState: { addEventListener: fn, removeEventListener: fn, currentState: 'active' },
    Keyboard: { dismiss: fn, addListener: fn, removeListener: fn },
    KeyboardAvoidingView: 'KeyboardAvoidingView',
    TouchableOpacity: 'TouchableOpacity',
    Image: 'Image',
    FlatList: 'FlatList',
    SectionList: 'SectionList',
    RefreshControl: 'RefreshControl',
    Modal: 'Modal',
    StatusBar: 'StatusBar',
    Switch: 'Switch',
    Dimensions: { get: () => ({ width: 375, height: 812 }), addEventListener: fn, removeEventListener: fn },
    PixelRatio: { get: () => 2, getFontScale: () => 1 },
    NativeModules: {},
    DevMenu: {},
    DevSettings: {},
  };
});

// ─── Mock react-i18next ───────────────────────────────────────────────────────
const T_MOCK = (key: string) => key;
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: T_MOCK,
    i18n: { language: 'en' },
  }),
}));

// ─── Mock ThemeContext ────────────────────────────────────────────────────────
jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      background: '#ffffff',
      surface: '#f5f5f5',
      primary: '#007AFF',
      text: '#000000',
      textSecondary: '#666666',
      border: '#cccccc',
      error: '#FF3B30',
    },
  }),
  useTokens: () => ({
    spacing: { xs: 4, sm: 8, md: 16, lg: 24 },
    colors: {
      background: '#ffffff',
      surface: '#f5f5f5',
      primary: '#007AFF',
      text: '#000000',
      textSecondary: '#666666',
      border: '#cccccc',
      error: '#FF3B30',
    },
  }),
}));

// ─── Mock Modal ───────────────────────────────────────────────────────────────
jest.mock('@/components/ui', () => ({
  Modal: jest.fn(({ children }) => children ?? null),
}));

// ─── Mock AccountsContext ────────────────────────────────────────────────────
const mockTestToken = jest.fn();
const mockConnectHost = jest.fn();

jest.mock('@/contexts/AccountsContext', () => ({
  useAccounts: () => ({
    testToken: mockTestToken,
    connectHost: mockConnectHost,
    accountSummaries: [],
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────
const alert = Alert.alert as jest.MockedFunction<typeof Alert.alert>;

const defaultProps = {
  visible: true,
  onClose: jest.fn(),
  colors: {
    background: '#ffffff',
    surface: '#f5f5f5',
    primary: '#007AFF',
    text: '#000000',
    textSecondary: '#666666',
    border: '#cccccc',
    error: '#FF3B30',
  },
};

const renderModal = (props = {}) => {
  return render(<ConnectHostModal {...defaultProps} {...props} />);
};

const enterToken = (getByPlaceholderText: (text: string) => ReturnType<typeof render>['getByPlaceholderText'], token: string) => {
  const tokenInput = getByPlaceholderText('connectHost.tokenPlaceholder');
  fireEvent.changeText(tokenInput, token);
};

// ─── Tests ─────────────────────────────────────────────────────────────────────
describe('ConnectHostModal token error guidance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleTest', () => {
    it('shows tokenMissingRepoScope guidance for missing_repo_scope reason', async () => {
      mockTestToken.mockResolvedValueOnce({ ok: false, reason: 'missing_repo_scope' });

      const { getByPlaceholderText, getByText } = renderModal();
      enterToken(getByPlaceholderText, 'ghp_test_token');
      await act(async () => {
        fireEvent.press(getByText('connectHost.test'));
      });

      await waitFor(() => {
        expect(alert).toHaveBeenCalledWith(
          'connectHost.error.invalidToken',
          'settings.tokenMissingRepoScope',
        );
      });
    });

    it('shows tokenMissingContentsPermission guidance for missing_contents_permission reason', async () => {
      mockTestToken.mockResolvedValueOnce({ ok: false, reason: 'missing_contents_permission' });

      const { getByPlaceholderText, getByText } = renderModal();
      enterToken(getByPlaceholderText, 'ghp_test_token');
      await act(async () => {
        fireEvent.press(getByText('connectHost.test'));
      });

      await waitFor(() => {
        expect(alert).toHaveBeenCalledWith(
          'connectHost.error.invalidToken',
          'settings.tokenMissingContentsPermission',
        );
      });
    });

    it('shows tokenSamlError guidance for saml reason', async () => {
      mockTestToken.mockResolvedValueOnce({ ok: false, reason: 'saml' });

      const { getByPlaceholderText, getByText } = renderModal();
      enterToken(getByPlaceholderText, 'ghp_test_token');
      await act(async () => {
        fireEvent.press(getByText('connectHost.test'));
      });

      await waitFor(() => {
        expect(alert).toHaveBeenCalledWith(
          'connectHost.error.invalidToken',
          'settings.tokenSamlError',
        );
      });
    });

    it('shows tokenNoRepoAccess guidance for no_repository_access reason', async () => {
      mockTestToken.mockResolvedValueOnce({ ok: false, reason: 'no_repository_access' });

      const { getByPlaceholderText, getByText } = renderModal();
      enterToken(getByPlaceholderText, 'ghp_test_token');
      await act(async () => {
        fireEvent.press(getByText('connectHost.test'));
      });

      await waitFor(() => {
        expect(alert).toHaveBeenCalledWith(
          'connectHost.error.invalidToken',
          'settings.tokenNoRepoAccess',
        );
      });
    });

    it('shows tokenTestInvalid guidance for invalid reason', async () => {
      mockTestToken.mockResolvedValueOnce({ ok: false, reason: 'invalid' });

      const { getByPlaceholderText, getByText } = renderModal();
      enterToken(getByPlaceholderText, 'ghp_test_token');
      await act(async () => {
        fireEvent.press(getByText('connectHost.test'));
      });

      await waitFor(() => {
        expect(alert).toHaveBeenCalledWith(
          'connectHost.error.invalidToken',
          'settings.tokenTestInvalid',
        );
      });
    });

    it('shows tokenTestNetwork guidance for network reason', async () => {
      mockTestToken.mockResolvedValueOnce({ ok: false, reason: 'network' });

      const { getByPlaceholderText, getByText } = renderModal();
      enterToken(getByPlaceholderText, 'ghp_test_token');
      await act(async () => {
        fireEvent.press(getByText('connectHost.test'));
      });

      await waitFor(() => {
        expect(alert).toHaveBeenCalledWith(
          'connectHost.error.invalidToken',
          'settings.tokenTestNetwork',
        );
      });
    });

    it('shows generic fallback for non-GitHub providers', async () => {
      mockTestToken.mockResolvedValueOnce({ ok: false, reason: 'invalid' });

      const { getByPlaceholderText, getByText, getByTestId } = renderModal();

      // Select GitLab provider
      const gitlabButton = getByTestId('connect-host-provider-gitlab');
      fireEvent.press(gitlabButton);

      enterToken(getByPlaceholderText, 'glpat_test_token');
      await act(async () => {
        fireEvent.press(getByText('connectHost.test'));
      });

      await waitFor(() => {
        expect(alert).toHaveBeenCalledWith(
          'connectHost.error.invalidToken',
          'connectHost.error.invalidTokenBody',
        );
      });
    });

    it('shows success alert when token is valid', async () => {
      mockTestToken.mockResolvedValueOnce({ ok: true });

      const { getByPlaceholderText, getByText } = renderModal();
      enterToken(getByPlaceholderText, 'ghp_valid_token');
      await act(async () => {
        fireEvent.press(getByText('connectHost.test'));
      });

      await waitFor(() => {
        expect(alert).toHaveBeenCalledWith(
          'connectHost.success.testTitle',
          'connectHost.success.testBody',
        );
      });
    });
  });

  describe('handleSave', () => {
    it('shows tokenMissingRepoScope guidance for missing_repo_scope reason', async () => {
      mockConnectHost.mockResolvedValueOnce({ ok: false, reason: 'missing_repo_scope' });

      const { getByPlaceholderText, getByText } = renderModal();
      enterToken(getByPlaceholderText, 'ghp_test_token');
      await act(async () => {
        fireEvent.press(getByText('connectHost.save'));
      });

      await waitFor(() => {
        expect(alert).toHaveBeenCalledWith(
          'connectHost.error.invalidToken',
          'settings.tokenMissingRepoScope',
        );
      });
    });

    it('shows tokenSamlError guidance for saml reason', async () => {
      mockConnectHost.mockResolvedValueOnce({ ok: false, reason: 'saml' });

      const { getByPlaceholderText, getByText } = renderModal();
      enterToken(getByPlaceholderText, 'ghp_test_token');
      await act(async () => {
        fireEvent.press(getByText('connectHost.save'));
      });

      await waitFor(() => {
        expect(alert).toHaveBeenCalledWith(
          'connectHost.error.invalidToken',
          'settings.tokenSamlError',
        );
      });
    });

    it('shows tokenNoRepoAccess guidance for no_repository_access reason', async () => {
      mockConnectHost.mockResolvedValueOnce({ ok: false, reason: 'no_repository_access' });

      const { getByPlaceholderText, getByText } = renderModal();
      enterToken(getByPlaceholderText, 'ghp_test_token');
      await act(async () => {
        fireEvent.press(getByText('connectHost.save'));
      });

      await waitFor(() => {
        expect(alert).toHaveBeenCalledWith(
          'connectHost.error.invalidToken',
          'settings.tokenNoRepoAccess',
        );
      });
    });

    it('shows generic fallback for non-GitHub providers on save', async () => {
      mockConnectHost.mockResolvedValueOnce({ ok: false, reason: 'invalid' });

      const { getByPlaceholderText, getByText, getByTestId } = renderModal();

      // Select Gitea provider
      const giteaButton = getByTestId('connect-host-provider-gitea');
      fireEvent.press(giteaButton);

      enterToken(getByPlaceholderText, 'gitea_token');
      await act(async () => {
        fireEvent.press(getByText('connectHost.save'));
      });

      await waitFor(() => {
        expect(alert).toHaveBeenCalledWith(
          'connectHost.error.invalidToken',
          'connectHost.error.invalidTokenBody',
        );
      });
    });
  });
});

describe('ConnectHostModal OAuth/App alternatives', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders OAuth and GitHub App buttons when provider is github and callbacks provided', () => {
    const onConnectOAuth = jest.fn();
    const onConnectGitHubApp = jest.fn();
    const { getByTestId } = renderModal({
      onConnectOAuth,
      onConnectGitHubApp,
      oauthLoading: {},
      oauthError: {},
      appLoading: {},
      appError: {},
    });

    expect(getByTestId('connect-host-oauth')).toBeTruthy();
    expect(getByTestId('connect-host-github-app')).toBeTruthy();
  });

  it('hides OAuth and GitHub App buttons when provider is gitlab', () => {
    const onConnectOAuth = jest.fn();
    const onConnectGitHubApp = jest.fn();
    const { getByTestId, queryByTestId } = renderModal({
      onConnectOAuth,
      onConnectGitHubApp,
    });

    const gitlabButton = getByTestId('connect-host-provider-gitlab');
    fireEvent.press(gitlabButton);

    expect(queryByTestId('connect-host-oauth')).toBeNull();
    expect(queryByTestId('connect-host-github-app')).toBeNull();
  });

  it('hides OAuth and GitHub App buttons when provider is gitea', () => {
    const onConnectOAuth = jest.fn();
    const onConnectGitHubApp = jest.fn();
    const { getByTestId, queryByTestId } = renderModal({
      onConnectOAuth,
      onConnectGitHubApp,
    });

    const giteaButton = getByTestId('connect-host-provider-gitea');
    fireEvent.press(giteaButton);

    expect(queryByTestId('connect-host-oauth')).toBeNull();
    expect(queryByTestId('connect-host-github-app')).toBeNull();
  });

  it('hides OAuth and GitHub App buttons when provider is forgejo', () => {
    const onConnectOAuth = jest.fn();
    const onConnectGitHubApp = jest.fn();
    const { getByTestId, queryByTestId } = renderModal({
      onConnectOAuth,
      onConnectGitHubApp,
    });

    const forgejoButton = getByTestId('connect-host-provider-forgejo');
    fireEvent.press(forgejoButton);

    expect(queryByTestId('connect-host-oauth')).toBeNull();
    expect(queryByTestId('connect-host-github-app')).toBeNull();
  });

  it('calls onClose then onConnectOAuth(null) when OAuth button is pressed', () => {
    const onClose = jest.fn();
    const onConnectOAuth = jest.fn();
    const { getByTestId } = renderModal({
      onClose,
      onConnectOAuth,
    });

    fireEvent.press(getByTestId('connect-host-oauth'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConnectOAuth).toHaveBeenCalledWith(null);
  });

  it('calls onClose then onConnectGitHubApp(null) when GitHub App button is pressed', () => {
    const onClose = jest.fn();
    const onConnectGitHubApp = jest.fn();
    const { getByTestId } = renderModal({
      onClose,
      onConnectGitHubApp,
    });

    fireEvent.press(getByTestId('connect-host-github-app'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConnectGitHubApp).toHaveBeenCalledWith(null);
  });

  it('shows loading indicator on OAuth button when oauthLoading.__fresh__ is true', () => {
    const { getByTestId } = renderModal({
      onConnectOAuth: jest.fn(),
      oauthLoading: { __fresh__: true },
    });

    expect(getByTestId('connect-host-oauth')).toBeTruthy();
  });

  it('shows loading indicator on GitHub App button when appLoading.__fresh__ is true', () => {
    const { getByTestId } = renderModal({
      onConnectGitHubApp: jest.fn(),
      appLoading: { __fresh__: true },
    });

    expect(getByTestId('connect-host-github-app')).toBeTruthy();
  });

  it('does not render OAuth button when onConnectOAuth is not provided', () => {
    const { queryByTestId } = renderModal({
      onConnectGitHubApp: jest.fn(),
    });

    expect(queryByTestId('connect-host-oauth')).toBeNull();
  });

  it('does not render GitHub App button when onConnectGitHubApp is not provided', () => {
    const { queryByTestId } = renderModal({
      onConnectOAuth: jest.fn(),
    });

    expect(queryByTestId('connect-host-github-app')).toBeNull();
  });

  it('hides OAuth and GitHub App buttons when provider is github but no callbacks provided', () => {
    const { queryByTestId } = renderModal({});

    expect(queryByTestId('connect-host-oauth')).toBeNull();
    expect(queryByTestId('connect-host-github-app')).toBeNull();
  });
});
