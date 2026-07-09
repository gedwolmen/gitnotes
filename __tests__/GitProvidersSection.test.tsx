import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { GitProvidersSection } from '../src/components/settings/GitProvidersSection';
import { HostAuthProvider } from '../src/contexts/HostAuthContext';
import { gitLabService } from '../src/services/git/GitLabService';
import {
  giteaHostService,
  forgejoHostService,
} from '../src/services/git/gitHostFactory';
import { GitHubService } from '../src/services/GitHubService';

const stableColors = {
  background: '#fff',
  surface: '#f4f4f4',
  primary: '#2563eb',
  text: '#111',
  textSecondary: '#666',
  border: '#ddd',
  error: '#dc2626',
  accent: '#8b5cf6',
};

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && Object.keys(opts).length > 0
        ? `${key}|${JSON.stringify(opts)}`
        : key,
  }),
}));

jest.mock('../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: stableColors,
    isDark: false,
    tokens: {
      spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
      type: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22 },
    },
  }),
  useTokens: () => ({
    colors: stableColors,
    spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
    type: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22 },
  }),
}));

jest.mock('../src/components/ui', () => {
  const { View } = require('react-native');
  return {
    Group: ({ children }: any) => <View>{children}</View>,
    GroupRow: ({ children, leading, trailing, onPress, testID }: any) => (
      <View testID={testID} onClick={onPress}>
        {leading}
        {children}
        {trailing}
      </View>
    ),
    Modal: ({ visible, children }: any) => (visible ? <View>{children}</View> : null),
  };
});

jest.mock('../src/components/ui/HintIcon', () => ({
  HintIcon: () => null,
}));

jest.mock('../src/services/GitHubService', () => ({
  GitHubService: {
    initialize: jest.fn(),
    setToken: jest.fn(),
    clearToken: jest.fn(),
    isAuthenticated: jest.fn(),
    getUser: jest.fn(),
  },
}));

jest.mock('../src/services/git/GitLabService', () => ({
  gitLabService: {
    initialize: jest.fn(),
    setToken: jest.fn(),
    clearToken: jest.fn(),
    isAuthenticated: jest.fn(),
    getUser: jest.fn(),
    getBaseUrl: jest.fn(),
    setBaseUrl: jest.fn(),
  },
}));

jest.mock('../src/services/git/gitHostFactory', () => {
  const actual = jest.requireActual('../src/services/git/gitHostFactory');
  return {
    ...actual,
    giteaHostService: {
      provider: 'gitea',
      initialize: jest.fn(),
      setToken: jest.fn(),
      clearToken: jest.fn(),
      isAuthenticated: jest.fn(),
      getUser: jest.fn(),
      getBaseUrl: jest.fn(),
      setBaseUrl: jest.fn(),
    },
    forgejoHostService: {
      provider: 'forgejo',
      initialize: jest.fn(),
      setToken: jest.fn(),
      clearToken: jest.fn(),
      isAuthenticated: jest.fn(),
      getUser: jest.fn(),
      getBaseUrl: jest.fn(),
      setBaseUrl: jest.fn(),
    },
  };
});

const mockedGitHub = GitHubService as jest.Mocked<typeof GitHubService>;
const mockedGitLab = gitLabService as jest.Mocked<typeof gitLabService>;
const mockedGitea = giteaHostService as unknown as {
  initialize: jest.Mock;
  setToken: jest.Mock;
  clearToken: jest.Mock;
  isAuthenticated: jest.Mock;
  getUser: jest.Mock;
  getBaseUrl: jest.Mock;
  setBaseUrl: jest.Mock;
};
const mockedForgejo = forgejoHostService as unknown as {
  initialize: jest.Mock;
  setToken: jest.Mock;
  clearToken: jest.Mock;
  isAuthenticated: jest.Mock;
  getUser: jest.Mock;
  getBaseUrl: jest.Mock;
  setBaseUrl: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

  mockedGitHub.initialize.mockResolvedValue(undefined);
  mockedGitHub.isAuthenticated.mockReturnValue(false);
  mockedGitHub.getUser.mockReturnValue(null);
  mockedGitHub.setToken.mockResolvedValue(null);
  mockedGitHub.clearToken.mockResolvedValue(undefined);

  mockedGitLab.initialize.mockResolvedValue(undefined);
  mockedGitLab.isAuthenticated.mockReturnValue(false);
  mockedGitLab.getUser.mockReturnValue(null);
  mockedGitLab.setToken.mockResolvedValue(null);
  mockedGitLab.clearToken.mockResolvedValue(undefined);
  mockedGitLab.getBaseUrl.mockReturnValue('https://gitlab.com/api/v4');

  mockedGitea.initialize.mockResolvedValue(undefined);
  mockedGitea.isAuthenticated.mockReturnValue(false);
  mockedGitea.getUser.mockReturnValue(null);
  mockedGitea.setToken.mockResolvedValue(null);
  mockedGitea.clearToken.mockResolvedValue(undefined);
  mockedGitea.getBaseUrl.mockReturnValue('https://gitea.com/api/v1');

  mockedForgejo.initialize.mockResolvedValue(undefined);
  mockedForgejo.isAuthenticated.mockReturnValue(false);
  mockedForgejo.getUser.mockReturnValue(null);
  mockedForgejo.setToken.mockResolvedValue(null);
  mockedForgejo.clearToken.mockResolvedValue(undefined);
  mockedForgejo.getBaseUrl.mockReturnValue('https://codeberg.org/api/v1');
});

function renderSection() {
  return render(
    <HostAuthProvider>
      <GitProvidersSection colors={stableColors} />
    </HostAuthProvider>,
  );
}

describe('GitProvidersSection', () => {
  it('renders a row for each of the four supported providers', async () => {
    const { getByTestId } = renderSection();
    await waitFor(() => {
      expect(mockedGitHub.initialize).toHaveBeenCalled();
    });
    expect(getByTestId('git-providers.row-github')).toBeTruthy();
    expect(getByTestId('git-providers.row-gitlab')).toBeTruthy();
    expect(getByTestId('git-providers.row-gitea')).toBeTruthy();
    expect(getByTestId('git-providers.row-forgejo')).toBeTruthy();
  });

  it('opens the edit modal for GitLab on press and shows a base URL field', async () => {
    const { getByTestId } = renderSection();
    await waitFor(() => expect(mockedGitHub.initialize).toHaveBeenCalled());

    fireEvent.press(getByTestId('git-providers.row-gitlab'));

    expect(getByTestId('git-providers.token-input')).toBeTruthy();
    expect(getByTestId('git-providers.base-url-input')).toBeTruthy();
  });

  it('opens the edit modal for GitHub without a base URL field', async () => {
    const { getByTestId, queryByTestId } = renderSection();
    await waitFor(() => expect(mockedGitHub.initialize).toHaveBeenCalled());

    fireEvent.press(getByTestId('git-providers.row-github'));

    expect(getByTestId('git-providers.token-input')).toBeTruthy();
    expect(queryByTestId('git-providers.base-url-input')).toBeNull();
  });

  it('submits the token to GitLab service and closes the modal on success', async () => {
    mockedGitLab.setToken.mockResolvedValue({
      id: 1,
      username: 'gl-user',
      name: 'GL',
      email: 'gl@example.com',
      avatar_url: null,
    });

    const { getByTestId, queryByTestId } = renderSection();
    await waitFor(() => expect(mockedGitLab.initialize).toHaveBeenCalled());

    fireEvent.press(getByTestId('git-providers.row-gitlab'));
    fireEvent.changeText(getByTestId('git-providers.token-input'), 'glpat-xxx');
    fireEvent.press(getByTestId('git-providers.submit'));

    await waitFor(() => {
      expect(mockedGitLab.setToken).toHaveBeenCalledWith('glpat-xxx', 'https://gitlab.com/api/v4');
    });

    await waitFor(() => {
      expect(queryByTestId('git-providers.token-input')).toBeNull();
    });
  });

  it('forwards custom baseUrl to GitLab service', async () => {
    mockedGitLab.setToken.mockResolvedValue({
      id: 1,
      username: 'gl-user',
      name: 'GL',
      email: null,
      avatar_url: null,
    });

    const { getByTestId } = renderSection();
    await waitFor(() => expect(mockedGitLab.initialize).toHaveBeenCalled());

    fireEvent.press(getByTestId('git-providers.row-gitlab'));
    fireEvent.changeText(getByTestId('git-providers.token-input'), 'glpat-xxx');
    fireEvent.changeText(
      getByTestId('git-providers.base-url-input'),
      'https://gl.example.com/api/v4',
    );
    fireEvent.press(getByTestId('git-providers.submit'));

    await waitFor(() => {
      expect(mockedGitLab.setToken).toHaveBeenCalledWith(
        'glpat-xxx',
        'https://gl.example.com/api/v4',
      );
    });
  });

  it('shows an alert when the token is rejected', async () => {
    mockedGitLab.setToken.mockResolvedValue(null);

    const { getByTestId } = renderSection();
    await waitFor(() => expect(mockedGitLab.initialize).toHaveBeenCalled());

    fireEvent.press(getByTestId('git-providers.row-gitlab'));
    fireEvent.changeText(getByTestId('git-providers.token-input'), 'bad-token');
    fireEvent.press(getByTestId('git-providers.submit'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'gitProviders.invalidTokenTitle',
        'gitProviders.invalidTokenBody',
      );
    });
  });

  it('routes a Gitea submit to giteaHostService.setToken', async () => {
    mockedGitea.setToken.mockResolvedValue({
      id: 5,
      login: 'g-user',
      full_name: 'G',
      email: null,
      avatar_url: null,
    });

    const { getByTestId } = renderSection();
    await waitFor(() => expect(mockedGitea.initialize).toHaveBeenCalled());

    fireEvent.press(getByTestId('git-providers.row-gitea'));
    fireEvent.changeText(getByTestId('git-providers.token-input'), 'gt-xxx');
    fireEvent.press(getByTestId('git-providers.submit'));

    await waitFor(() => {
      expect(mockedGitea.setToken).toHaveBeenCalledWith('gt-xxx', 'https://gitea.com/api/v1');
    });
  });

  it('disables submit when token is empty', async () => {
    const { getByTestId } = renderSection();
    await waitFor(() => expect(mockedGitHub.initialize).toHaveBeenCalled());

    fireEvent.press(getByTestId('git-providers.row-github'));
    const submit = getByTestId('git-providers.submit');
    expect(submit.props.accessibilityState?.disabled).toBe(true);
    expect(mockedGitHub.setToken).not.toHaveBeenCalled();
  });

  it('disconnects the host via clearToken after alert confirmation', async () => {
    mockedGitHub.isAuthenticated.mockReturnValue(true);
    mockedGitHub.getUser.mockReturnValue({
      id: 1,
      login: 'octocat',
      name: 'Octo',
      email: null,
      avatar_url: null,
    });

    const { getByTestId } = renderSection();
    await waitFor(() => expect(mockedGitHub.initialize).toHaveBeenCalled());

    fireEvent.press(getByTestId('git-providers.disconnect-github'));

    expect(Alert.alert).toHaveBeenCalled();
    const alertArgs = (Alert.alert as jest.Mock).mock.calls[0];
    const destructive = alertArgs[2].find((b: any) => b.style === 'destructive');
    await destructive.onPress();

    expect(mockedGitHub.clearToken).toHaveBeenCalledTimes(1);
  });
});