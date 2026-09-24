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

describe('ConnectHostModal OAuth flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Mock OAuth dependencies ─────────────────────────────────────────────────
  const mockProbeGitHubOAuthSupport = jest.fn();
  const mockPerformGitHubOAuth = jest.fn();
  const mockAccountStorageGetString = jest.fn();

  jest.mock('@/services/GitHubOAuth', () => ({
    probeGitHubOAuthSupport: (...args: unknown[]) => mockProbeGitHubOAuthSupport(...args),
    performGitHubOAuth: (...args: unknown[]) => mockPerformGitHubOAuth(...args),
    GITHUB_OAUTH_CLIENT_ID_KEY: 'gitnotes_github_oauth_client_id',
  }));

  jest.mock('@/services/AccountStorage', () => ({
    AccountStorage: {
      getString: (...args: unknown[]) => mockAccountStorageGetString(...args),
    },
  }));

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  const renderModalWithOAuth = (props = {}) => {
    return render(<ConnectHostModal {...defaultProps} {...props} />);
  };

  describe('OAuth availability probe', () => {
    it('calls probeGitHubOAuthSupport when modal becomes visible with GitHub', async () => {
      mockProbeGitHubOAuthSupport.mockResolvedValueOnce({ supported: true, authorizationEndpoint: 'https://github.com/login/oauth/authorize', tokenEndpoint: 'https://github.com/login/oauth/access_token' });

      const { queryByTestId } = renderModalWithOAuth();

      await act(async () => {
        // Wait for the OAuth probe effect to run
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(mockProbeGitHubOAuthSupport).toHaveBeenCalledWith('github', 'https://api.github.com');
    });

    it('shows OAuth unavailable message when probe returns supported:false', async () => {
      mockProbeGitHubOAuthSupport.mockResolvedValueOnce({ supported: false, reason: 'not_oauth' });

      const { queryByText } = renderModalWithOAuth();

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      // OAuth unavailable notice should be shown.
      expect(queryByText('connectHost.oauth.unavailable')).not.toBeNull();
    });

    it('does NOT show OAuth unavailable message when probe returns supported:true', async () => {
      mockProbeGitHubOAuthSupport.mockResolvedValueOnce({ supported: true, authorizationEndpoint: 'https://github.com/login/oauth/authorize', tokenEndpoint: 'https://github.com/login/oauth/access_token' });

      const { queryByText } = renderModalWithOAuth();

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(queryByText('connectHost.oauth.unavailable')).toBeNull();
    });
  });

  describe('OAuth sign-in button', () => {
    it('shows "Sign in with GitHub" when OAuth is available for GitHub provider', async () => {
      mockProbeGitHubOAuthSupport.mockResolvedValueOnce({ supported: true, authorizationEndpoint: 'https://github.com/login/oauth/authorize', tokenEndpoint: 'https://github.com/login/oauth/access_token' });

      const { queryByTestId } = renderModalWithOAuth();

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(queryByTestId('connect-host-oauth-button')).not.toBeNull();
    });

    it('does not show OAuth button for GitLab provider', async () => {
      mockProbeGitHubOAuthSupport.mockResolvedValueOnce({ supported: true, authorizationEndpoint: 'https://gitlab.com/oauth/authorize', tokenEndpoint: 'https://gitlab.com/oauth/token' });

      const { queryByTestId } = renderModalWithOAuth();

      // Select GitLab
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      // The OAuth button should not be visible for GitLab (only GitHub supports browser OAuth here).
      expect(queryByTestId('connect-host-oauth-button')).toBeNull();
    });
  });

  describe('handleOAuthSignIn', () => {
    it('shows config required alert when client ID is not set', async () => {
      mockProbeGitHubOAuthSupport.mockResolvedValueOnce({ supported: true, authorizationEndpoint: 'https://github.com/login/oauth/authorize', tokenEndpoint: 'https://github.com/login/oauth/access_token' });
      mockAccountStorageGetString.mockResolvedValueOnce(null);

      const { queryByTestId } = renderModalWithOAuth();

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      await act(async () => {
        fireEvent.press(queryByTestId('connect-host-oauth-button')!);
      });

      await waitFor(() => {
        expect(alert).toHaveBeenCalledWith(
          'connectHost.oauth.configRequiredTitle',
          'connectHost.oauth.configRequiredBody',
        );
      });
    });

    it('calls performGitHubOAuth with client ID when client ID is set', async () => {
      mockProbeGitHubOAuthSupport.mockResolvedValueOnce({ supported: true, authorizationEndpoint: 'https://github.com/login/oauth/authorize', tokenEndpoint: 'https://github.com/login/oauth/access_token' });
      mockAccountStorageGetString.mockResolvedValueOnce('test_client_id_123');
      mockPerformGitHubOAuth.mockResolvedValueOnce({ ok: false, reason: 'user_cancelled' });

      const { queryByTestId } = renderModalWithOAuth();

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      await act(async () => {
        fireEvent.press(queryByTestId('connect-host-oauth-button')!);
      });

      await waitFor(() => {
        expect(mockPerformGitHubOAuth).toHaveBeenCalledWith('test_client_id_123', 'https://api.github.com');
      });
    });

    it('shows denied alert when OAuth flow is rejected by provider', async () => {
      mockProbeGitHubOAuthSupport.mockResolvedValueOnce({ supported: true, authorizationEndpoint: 'https://github.com/login/oauth/authorize', tokenEndpoint: 'https://github.com/login/oauth/access_token' });
      mockAccountStorageGetString.mockResolvedValueOnce('test_client_id_123');
      mockPerformGitHubOAuth.mockResolvedValueOnce({
        ok: false,
        reason: 'provider_denied',
        errorDescription: 'The user cancelled the authorization request.',
      });

      const { queryByTestId } = renderModalWithOAuth();

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      await act(async () => {
        fireEvent.press(queryByTestId('connect-host-oauth-button')!);
      });

      await waitFor(() => {
        expect(alert).toHaveBeenCalledWith(
          'connectHost.oauth.deniedTitle',
          'The user cancelled the authorization request.',
        );
      });
    });

    it('silently handles user cancelled OAuth (no alert)', async () => {
      mockProbeGitHubOAuthSupport.mockResolvedValueOnce({ supported: true, authorizationEndpoint: 'https://github.com/login/oauth/authorize', tokenEndpoint: 'https://github.com/login/oauth/access_token' });
      mockAccountStorageGetString.mockResolvedValueOnce('test_client_id_123');
      mockPerformGitHubOAuth.mockResolvedValueOnce({ ok: false, reason: 'user_cancelled' });

      const { queryByTestId } = renderModalWithOAuth();

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      await act(async () => {
        fireEvent.press(queryByTestId('connect-host-oauth-button')!);
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      // user_cancelled should not show an alert.
      expect(alert).not.toHaveBeenCalled();
    });

    it('calls connectHost with the returned token on OAuth success', async () => {
      mockProbeGitHubOAuthSupport.mockResolvedValueOnce({ supported: true, authorizationEndpoint: 'https://github.com/login/oauth/authorize', tokenEndpoint: 'https://github.com/login/oauth/access_token' });
      mockAccountStorageGetString.mockResolvedValueOnce('test_client_id_123');
      mockPerformGitHubOAuth.mockResolvedValueOnce({ ok: true, token: 'oauth_access_token_xyz' });
      mockConnectHost.mockResolvedValueOnce({ ok: true });

      const onClose = jest.fn();
      const { queryByTestId } = renderModalWithOAuth({ onClose });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      await act(async () => {
        fireEvent.press(queryByTestId('connect-host-oauth-button')!);
      });

      await waitFor(() => {
        expect(mockConnectHost).toHaveBeenCalledWith({
          provider: 'github',
          token: 'oauth_access_token_xyz',
          instanceBaseUrl: undefined,
          accountId: undefined,
        });
      });

      // Modal should close on success.
      expect(onClose).toHaveBeenCalled();
    });
  });
});
