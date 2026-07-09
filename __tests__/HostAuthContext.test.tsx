import React from 'react';
import { Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';

import {
  HostAuthProvider,
  useHostAuth,
  useHostAuthFor,
  useHostProvidersOrder,
} from '../src/contexts/HostAuthContext';
import { GitHubService } from '../src/services/GitHubService';
import { gitLabService } from '../src/services/git/GitLabService';
import {
  giteaHostService,
  forgejoHostService,
} from '../src/services/git/gitHostFactory';

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

function Probe() {
  const { hosts, status } = useHostAuth();
  const ordered = useHostProvidersOrder();
  const gitlab = useHostAuthFor('gitlab');
  return (
    <>
      <Text testID="status">{status}</Text>
      <Text testID="order">{ordered.join(',')}</Text>
      <Text testID="github-auth">{String(hosts.github.isAuthenticated)}</Text>
      <Text testID="gitlab-login">{gitlab.user?.login ?? 'none'}</Text>
      <Text testID="gitea-auth">{String(hosts.gitea.isAuthenticated)}</Text>
      <Text testID="forgejo-auth">{String(hosts.forgejo.isAuthenticated)}</Text>
    </>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
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

describe('HostAuthContext', () => {
  it('initializes all four hosts on mount and reaches ready status', async () => {
    const { getByTestId } = render(
      <HostAuthProvider>
        <Probe />
      </HostAuthProvider>,
    );

    expect(mockedGitHub.initialize).toHaveBeenCalledTimes(1);
    expect(mockedGitLab.initialize).toHaveBeenCalledTimes(1);
    expect(mockedGitea.initialize).toHaveBeenCalledTimes(1);
    expect(mockedForgejo.initialize).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(getByTestId('status').props.children).toBe('ready');
    });
  });

  it('exposes provider order: github, gitlab, gitea, forgejo', async () => {
    const { getByTestId } = render(
      <HostAuthProvider>
        <Probe />
      </HostAuthProvider>,
    );
    await waitFor(() => {
      expect(getByTestId('status').props.children).toBe('ready');
    });
    expect(getByTestId('order').props.children).toBe('github,gitlab,gitea,forgejo');
  });

  it('reflects authenticated state for each host via snapshots', async () => {
    mockedGitHub.isAuthenticated.mockReturnValue(true);
    mockedGitHub.getUser.mockReturnValue({
      id: 1,
      login: 'octocat',
      name: 'The Octocat',
      email: 'octo@github.com',
      avatar_url: null,
    });

    const { getByTestId } = render(
      <HostAuthProvider>
        <Probe />
      </HostAuthProvider>,
    );
    await waitFor(() => {
      expect(getByTestId('status').props.children).toBe('ready');
    });
    expect(getByTestId('github-auth').props.children).toBe('true');
  });

  it('setToken dispatches to the correct host service and refreshes state', async () => {
    const ghUser = {
      id: 7,
      login: 'octocat',
      name: 'Octo',
      email: 'octo@github.com',
      avatar_url: null,
    };
    mockedGitHub.setToken.mockResolvedValue(ghUser);
    mockedGitHub.isAuthenticated.mockReturnValue(true);
    mockedGitHub.getUser.mockReturnValue(ghUser);

    let captured: ReturnType<typeof useHostAuth> | null = null;
    function Capture() {
      captured = useHostAuth();
      return <Text testID="cap">ok</Text>;
    }

    render(
      <HostAuthProvider>
        <Capture />
      </HostAuthProvider>,
    );
    await waitFor(() => {
      expect(mockedGitHub.initialize).toHaveBeenCalled();
    });

    await act(async () => {
      await captured!.setToken('github', 'ghp_xxx');
    });

    expect(mockedGitHub.setToken).toHaveBeenCalledWith('ghp_xxx');
    expect(captured!.hosts.github.isAuthenticated).toBe(true);
  });

  it('setToken forwards baseUrl to GitLab', async () => {
    mockedGitLab.setToken.mockResolvedValue({
      id: 2,
      username: 'gl-user',
      name: 'GL',
      email: 'gl@example.com',
      avatar_url: null,
    });

    let captured: ReturnType<typeof useHostAuth> | null = null;
    function Capture() {
      captured = useHostAuth();
      return <Text testID="cap">ok</Text>;
    }

    render(
      <HostAuthProvider>
        <Capture />
      </HostAuthProvider>,
    );
    await waitFor(() => expect(mockedGitLab.initialize).toHaveBeenCalled());

    await act(async () => {
      await captured!.setToken('gitlab', 'glpat-xxx', 'https://gl.example.com/api/v4');
    });

    expect(mockedGitLab.setToken).toHaveBeenCalledWith(
      'glpat-xxx',
      'https://gl.example.com/api/v4',
    );
  });

  it('setToken maps GiteaLikeUser into GitHostUser shape', async () => {
    const giteaUser = {
      id: 3,
      login: 'gitea-user',
      full_name: 'Gitea User',
      email: 'g@example.com',
      avatar_url: 'https://example.com/a.png',
    };
    mockedGitea.setToken.mockResolvedValue(giteaUser);

    let captured: ReturnType<typeof useHostAuth> | null = null;
    function Capture() {
      captured = useHostAuth();
      return <Text testID="cap">ok</Text>;
    }

    render(
      <HostAuthProvider>
        <Capture />
      </HostAuthProvider>,
    );
    await waitFor(() => expect(mockedGitea.initialize).toHaveBeenCalled());

    let result: Awaited<ReturnType<NonNullable<typeof captured>['setToken']>> = null;
    await act(async () => {
      result = await captured!.setToken('gitea', 'gt-xxx');
    });

    expect(mockedGitea.setToken).toHaveBeenCalledWith('gt-xxx', undefined);
    expect(result).toEqual({
      id: 3,
      login: 'gitea-user',
      name: 'Gitea User',
      email: 'g@example.com',
      avatarUrl: 'https://example.com/a.png',
    });
  });

  it('clearToken routes to the correct service for each provider', async () => {
    let captured: ReturnType<typeof useHostAuth> | null = null;
    function Capture() {
      captured = useHostAuth();
      return null;
    }

    render(
      <HostAuthProvider>
        <Capture />
      </HostAuthProvider>,
    );
    await waitFor(() => expect(mockedGitHub.initialize).toHaveBeenCalled());

    await act(async () => {
      await captured!.clearToken('github');
      await captured!.clearToken('gitlab');
      await captured!.clearToken('gitea');
      await captured!.clearToken('forgejo');
    });

    expect(mockedGitHub.clearToken).toHaveBeenCalledTimes(1);
    expect(mockedGitLab.clearToken).toHaveBeenCalledTimes(1);
    expect(mockedGitea.clearToken).toHaveBeenCalledTimes(1);
    expect(mockedForgejo.clearToken).toHaveBeenCalledTimes(1);
  });

  it('useHostAuth throws when used outside HostAuthProvider', () => {
    function Naked() {
      useHostAuth();
      return null;
    }
    // Suppress React error logging for the expected throw.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Naked />)).toThrow(
      /useHostAuth must be used within a HostAuthProvider/,
    );
    spy.mockRestore();
  });

  it('ignores GitHub and uses GitLab / Gitea baseUrl for setBaseUrl', async () => {
    let captured: ReturnType<typeof useHostAuth> | null = null;
    function Capture() {
      captured = useHostAuth();
      return null;
    }

    render(
      <HostAuthProvider>
        <Capture />
      </HostAuthProvider>,
    );
    await waitFor(() => expect(mockedGitLab.initialize).toHaveBeenCalled());

    await act(async () => {
      await captured!.setBaseUrl('github', 'https://x.example');
      await captured!.setBaseUrl('gitlab', 'https://gl.example/api/v4');
      await captured!.setBaseUrl('gitea', 'https://gt.example/api/v1');
    });

    // setBaseUrl is a no-op for github
    expect(mockedGitHub.initialize).toHaveBeenCalledTimes(1);
    expect(mockedGitLab.setBaseUrl).toHaveBeenCalledWith('https://gl.example/api/v4');
    expect(mockedGitea.setBaseUrl).toHaveBeenCalledWith('https://gt.example/api/v1');
  });
});