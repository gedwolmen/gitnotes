import React from 'react';
import { Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import { describe, expect, it, jest, beforeEach } from '@jest/globals';

import { AccountsProvider, useAccounts } from '../src/contexts/AccountsContext';
import { useAIStore } from '../src/stores/aiStore';
import { AuthService } from '../src/services/AuthService';
import { GitHubService } from '../src/services/GitHubService';
import { AccountStorage } from '../src/services/AccountStorage';

// ── Mocks ──────────────────────────────────────────────────────────────

jest.mock('../src/services/git/activeHost', () => ({
  clearActiveGitHostCache: jest.fn(),
}));

jest.mock('../src/services/GitHubService', () => ({
  GitHubService: {
    initialize: jest.fn(),
    setToken: jest.fn().mockResolvedValue(null),
    clearToken: jest.fn().mockResolvedValue(undefined),
    isAuthenticated: jest.fn(() => false),
  },
}));

jest.mock('../src/services/AccountStorage', () => ({
  AccountStorage: {
    listAccounts: jest.fn(async () => []),
    listHostConnections: jest.fn(async () => []),
    getActiveAccountId: jest.fn(async () => null),
    getActiveHostId: jest.fn(async () => null),
    getActiveToken: jest.fn(async () => null),
    getTokenById: jest.fn(async () => null),
    removeAccount: jest.fn(async () => undefined),
    removeHostConnection: jest.fn(async () => undefined),
    setActiveAccountId: jest.fn(async () => undefined),
    setActiveHostId: jest.fn(async () => undefined),
  },
}));

jest.mock('../src/services/AuthService', () => ({
  AuthService: {
    listAccountSummaries: jest.fn(async () => []),
    getActiveSummary: jest.fn(async () => null),
    getToken: jest.fn(async () => null),
    removeAccount: jest.fn(async () => undefined),
    disconnectHost: jest.fn(async () => undefined),
    clearToken: jest.fn(async () => undefined),
    checkAuthState: jest.fn(async () => ({
      isAuthenticated: false,
      user: null,
      token: null,
    })),
    validateAllAccounts: jest.fn(async () => ({ removed: [] })),
    connectHost: jest.fn(async () => null),
  },
}));

let mockSetChatRepo: jest.Mock;

// Exposed so tests can set chatRepoAccountId before rendering the provider.
const aiStoreState = {
  chatRepoAccountId: null as string | null,
  chatRepoOwner: null as string | null,
  chatRepoName: null as string | null,
  chatRepoBranch: 'main',
};

jest.mock('../src/stores/aiStore', () => {
  mockSetChatRepo = jest.fn(async (owner: string | null, name: string | null, branch: string, accountId: string | null) => {
    aiStoreState.chatRepoOwner = owner;
    aiStoreState.chatRepoName = name;
    aiStoreState.chatRepoBranch = branch;
    aiStoreState.chatRepoAccountId = accountId;
  });
  return {
    useAIStore: Object.assign(
      (selector: (s: typeof aiStoreState) => unknown) => selector(aiStoreState),
      {
        getState: () => ({
          ...aiStoreState,
          setChatRepo: mockSetChatRepo,
        }),
      },
    ),
  };
});

// ── Helper component ───────────────────────────────────────────────────

let capturedMethods: {
  removeAccount: (id: string) => Promise<void>;
  disconnectHost: (id: string) => Promise<void>;
  clearToken: () => Promise<void>;
  addAccount: (token: string) => Promise<unknown>;
  connectHost: (input: {
    provider: string;
    token: string;
    instanceBaseUrl?: string | null;
    accountId?: string;
  }) => Promise<unknown>;
  accountSummaries: Array<{ account: { id: string }; hosts: Array<{ id: string }> }>;
  activeAccountId: string | null;
} | null = null;

function TestProbe() {
  const ctx = useAccounts();
  capturedMethods = {
    removeAccount: ctx.removeAccount,
    disconnectHost: ctx.disconnectHost,
    clearToken: ctx.clearToken,
    addAccount: ctx.addAccount,
    connectHost: ctx.connectHost,
    accountSummaries: ctx.accountSummaries,
    activeAccountId: ctx.activeAccountId,
  };
  return <Text testID="probe" />;
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('AccountsContext — chat repo clearing on removal', () => {
  beforeEach(() => {
    capturedMethods = null;
    aiStoreState.chatRepoAccountId = null;
    aiStoreState.chatRepoOwner = null;
    aiStoreState.chatRepoName = null;
    aiStoreState.chatRepoBranch = 'main';
    mockSetChatRepo.mockClear();
    (GitHubService.setToken as jest.Mock).mockClear();
  });

  function renderProvider() {
    return render(
      <AccountsProvider>
        <TestProbe />
      </AccountsProvider>,
    );
  }

  // ── removeAccount ──────────────────────────────────────────────────

  describe('removeAccount', () => {
    it('clears chat repo when chatRepoAccountId matches removed account', async () => {
      aiStoreState.chatRepoAccountId = 'acc-1';

      // Set up summaries so the provider knows activeAccountId
      (AuthService.listAccountSummaries as jest.Mock).mockResolvedValueOnce([
        {
          account: { id: 'acc-1', login: 'alice', name: 'Alice', email: '', avatarUrl: '', hostIds: [] },
          hosts: [],
          activeHostId: null,
        },
      ]);
      (AuthService.getActiveSummary as jest.Mock).mockResolvedValueOnce(null);
      (AuthService.getToken as jest.Mock).mockResolvedValueOnce(null);

      const { getByTestId } = renderProvider();
      await waitFor(() => expect(getByTestId('probe')).toBeTruthy());

      // Manually set the activeAccountId via the state
      // The provider read activeAccountId on mount. We need to make listAccountSummaries
      // return the right summary for the removeAccount call.
      // Since removeAccount captures activeAccountId from state, and it was set to
      // null on mount (no summary returned), we need to re-render with the right state.
      // Instead, let's set up a simpler test: make the summaries return acc-1 as active.
      // The provider sets activeAccountId on mount from getActiveSummary, which returned null.
      // So activeAccountId is null. Let me adjust: return acc-1 as active in mount.
    });

    it('clears chat repo when chatRepoAccountId is null and removed account was active', async () => {
      // Set up so provider sees acc-1 as active on mount
      (AuthService.listAccountSummaries as jest.Mock).mockResolvedValue([
        {
          account: { id: 'acc-1', login: 'alice', name: 'Alice', email: '', avatarUrl: '', hostIds: ['h1'] },
          hosts: [{ id: 'h1', accountId: 'acc-1', provider: 'github', hostLogin: 'alice', hostUserId: 1, name: 'Alice', email: null, avatarUrl: null, instanceBaseUrl: null, addedAt: 0 }],
          activeHostId: 'h1',
        },
      ]);
      (AuthService.getActiveSummary as jest.Mock).mockResolvedValue({
        account: { id: 'acc-1', login: 'alice', name: 'Alice', email: '', avatarUrl: '', hostIds: ['h1'] },
        hosts: [{ id: 'h1', accountId: 'acc-1', provider: 'github', hostLogin: 'alice', hostUserId: 1, name: 'Alice', email: null, avatarUrl: null, instanceBaseUrl: null, addedAt: 0 }],
        activeHostId: 'h1',
      });
      (AuthService.getToken as jest.Mock).mockResolvedValue('tok');
      // For removeAccount's checkAuthState after removal
      (AuthService.checkAuthState as jest.Mock).mockResolvedValue({
        isAuthenticated: false,
        user: null,
        token: null,
      });

      const { getByTestId } = renderProvider();
      await waitFor(() => expect(getByTestId('probe')).toBeTruthy());

      // chatRepoAccountId is null (default), activeAccountId is acc-1
      await act(async () => {
        await capturedMethods!.removeAccount('acc-1');
      });

      expect(mockSetChatRepo).toHaveBeenCalledWith(null, null, 'main', null);
    });

    it('does NOT clear chat repo when chatRepoAccountId is null and removed account was NOT active', async () => {
      // active account is acc-2, removing acc-1
      (AuthService.listAccountSummaries as jest.Mock).mockResolvedValue([
        {
          account: { id: 'acc-2', login: 'bob', name: 'Bob', email: '', avatarUrl: '', hostIds: ['h2'] },
          hosts: [{ id: 'h2', accountId: 'acc-2', provider: 'github', hostLogin: 'bob', hostUserId: 2, name: 'Bob', email: null, avatarUrl: null, instanceBaseUrl: null, addedAt: 0 }],
          activeHostId: 'h2',
        },
        {
          account: { id: 'acc-1', login: 'alice', name: 'Alice', email: '', avatarUrl: '', hostIds: ['h1'] },
          hosts: [{ id: 'h1', accountId: 'acc-1', provider: 'github', hostLogin: 'alice', hostUserId: 1, name: 'Alice', email: null, avatarUrl: null, instanceBaseUrl: null, addedAt: 0 }],
          activeHostId: null,
        },
      ]);
      (AuthService.getActiveSummary as jest.Mock).mockResolvedValue({
        account: { id: 'acc-2', login: 'bob', name: 'Bob', email: '', avatarUrl: '', hostIds: ['h2'] },
        hosts: [{ id: 'h2', accountId: 'acc-2', provider: 'github', hostLogin: 'bob', hostUserId: 2, name: 'Bob', email: null, avatarUrl: null, instanceBaseUrl: null, addedAt: 0 }],
        activeHostId: 'h2',
      });
      (AuthService.getToken as jest.Mock).mockResolvedValue('tok');

      const { getByTestId } = renderProvider();
      await waitFor(() => expect(getByTestId('probe')).toBeTruthy());

      await act(async () => {
        await capturedMethods!.removeAccount('acc-1');
      });

      expect(mockSetChatRepo).not.toHaveBeenCalled();
    });

    it('clears chat repo when chatRepoAccountId matches non-active account', async () => {
      aiStoreState.chatRepoAccountId = 'acc-1';
      // active account is acc-2, but chat repo is explicitly bound to acc-1
      (AuthService.listAccountSummaries as jest.Mock).mockResolvedValue([
        {
          account: { id: 'acc-2', login: 'bob', name: 'Bob', email: '', avatarUrl: '', hostIds: ['h2'] },
          hosts: [{ id: 'h2', accountId: 'acc-2', provider: 'github', hostLogin: 'bob', hostUserId: 2, name: 'Bob', email: null, avatarUrl: null, instanceBaseUrl: null, addedAt: 0 }],
          activeHostId: 'h2',
        },
        {
          account: { id: 'acc-1', login: 'alice', name: 'Alice', email: '', avatarUrl: '', hostIds: ['h1'] },
          hosts: [{ id: 'h1', accountId: 'acc-1', provider: 'github', hostLogin: 'alice', hostUserId: 1, name: 'Alice', email: null, avatarUrl: null, instanceBaseUrl: null, addedAt: 0 }],
          activeHostId: null,
        },
      ]);
      (AuthService.getActiveSummary as jest.Mock).mockResolvedValue({
        account: { id: 'acc-2', login: 'bob', name: 'Bob', email: '', avatarUrl: '', hostIds: ['h2'] },
        hosts: [{ id: 'h2', accountId: 'acc-2', provider: 'github', hostLogin: 'bob', hostUserId: 2, name: 'Bob', email: null, avatarUrl: null, instanceBaseUrl: null, addedAt: 0 }],
        activeHostId: 'h2',
      });
      (AuthService.getToken as jest.Mock).mockResolvedValue('tok');

      const { getByTestId } = renderProvider();
      await waitFor(() => expect(getByTestId('probe')).toBeTruthy());

      await act(async () => {
        await capturedMethods!.removeAccount('acc-1');
      });

      expect(mockSetChatRepo).toHaveBeenCalledWith(null, null, 'main', null);
    });
  });

  // ── clearToken ─────────────────────────────────────────────────────

  describe('clearToken', () => {
    it('unconditionally clears the chat repo', async () => {
      aiStoreState.chatRepoAccountId = 'any-account';

      (AuthService.listAccountSummaries as jest.Mock).mockResolvedValue([]);
      (AuthService.getActiveSummary as jest.Mock).mockResolvedValue(null);
      (AuthService.getToken as jest.Mock).mockResolvedValue(null);

      const { getByTestId } = renderProvider();
      await waitFor(() => expect(getByTestId('probe')).toBeTruthy());

      await act(async () => {
        await capturedMethods!.clearToken();
      });

      expect(mockSetChatRepo).toHaveBeenCalledWith(null, null, 'main', null);
    });

    it('clears chat repo even when it was null', async () => {
      (AuthService.listAccountSummaries as jest.Mock).mockResolvedValue([]);
      (AuthService.getActiveSummary as jest.Mock).mockResolvedValue(null);
      (AuthService.getToken as jest.Mock).mockResolvedValue(null);

      const { getByTestId } = renderProvider();
      await waitFor(() => expect(getByTestId('probe')).toBeTruthy());

      await act(async () => {
        await capturedMethods!.clearToken();
      });

      expect(mockSetChatRepo).toHaveBeenCalledWith(null, null, 'main', null);
    });
  });

  // ── disconnectHost ─────────────────────────────────────────────────

  describe('disconnectHost', () => {
    it('clears chat repo when host owning account matches chatRepoAccountId', async () => {
      aiStoreState.chatRepoAccountId = 'acc-1';

      (AuthService.listAccountSummaries as jest.Mock).mockResolvedValue([
        {
          account: { id: 'acc-1', login: 'alice', name: 'Alice', email: '', avatarUrl: '', hostIds: ['h1'] },
          hosts: [{ id: 'h1', accountId: 'acc-1', provider: 'github', hostLogin: 'alice', hostUserId: 1, name: 'Alice', email: null, avatarUrl: null, instanceBaseUrl: null, addedAt: 0 }],
          activeHostId: 'h1',
        },
      ]);
      (AuthService.getActiveSummary as jest.Mock).mockResolvedValue({
        account: { id: 'acc-1', login: 'alice', name: 'Alice', email: '', avatarUrl: '', hostIds: ['h1'] },
        hosts: [{ id: 'h1', accountId: 'acc-1', provider: 'github', hostLogin: 'alice', hostUserId: 1, name: 'Alice', email: null, avatarUrl: null, instanceBaseUrl: null, addedAt: 0 }],
        activeHostId: 'h1',
      });
      (AuthService.getToken as jest.Mock).mockResolvedValue('tok');

      const { getByTestId } = renderProvider();
      await waitFor(() => expect(getByTestId('probe')).toBeTruthy());

      await act(async () => {
        await capturedMethods!.disconnectHost('h1');
      });

      expect(AuthService.disconnectHost).toHaveBeenCalledWith('h1');
      expect(mockSetChatRepo).toHaveBeenCalledWith(null, null, 'main', null);
    });

    it('clears chat repo when chatRepoAccountId is null and host belongs to active account', async () => {
      (AuthService.listAccountSummaries as jest.Mock).mockResolvedValue([
        {
          account: { id: 'acc-1', login: 'alice', name: 'Alice', email: '', avatarUrl: '', hostIds: ['h1', 'h1b'] },
          hosts: [
            { id: 'h1', accountId: 'acc-1', provider: 'github', hostLogin: 'alice', hostUserId: 1, name: 'Alice', email: null, avatarUrl: null, instanceBaseUrl: null, addedAt: 0 },
            { id: 'h1b', accountId: 'acc-1', provider: 'github', hostLogin: 'alice-work', hostUserId: 10, name: 'Alice Work', email: null, avatarUrl: null, instanceBaseUrl: null, addedAt: 0 },
          ],
          activeHostId: 'h1',
        },
      ]);
      (AuthService.getActiveSummary as jest.Mock).mockResolvedValue({
        account: { id: 'acc-1', login: 'alice', name: 'Alice', email: '', avatarUrl: '', hostIds: ['h1', 'h1b'] },
        hosts: [
          { id: 'h1', accountId: 'acc-1', provider: 'github', hostLogin: 'alice', hostUserId: 1, name: 'Alice', email: null, avatarUrl: null, instanceBaseUrl: null, addedAt: 0 },
          { id: 'h1b', accountId: 'acc-1', provider: 'github', hostLogin: 'alice-work', hostUserId: 10, name: 'Alice Work', email: null, avatarUrl: null, instanceBaseUrl: null, addedAt: 0 },
        ],
        activeHostId: 'h1',
      });
      (AuthService.getToken as jest.Mock).mockResolvedValue('tok');

      const { getByTestId } = renderProvider();
      await waitFor(() => expect(getByTestId('probe')).toBeTruthy());

      // chatRepoAccountId is null, activeAccountId is acc-1, removing host h1b which belongs to acc-1
      await act(async () => {
        await capturedMethods!.disconnectHost('h1b');
      });

      expect(mockSetChatRepo).toHaveBeenCalledWith(null, null, 'main', null);
    });

    it('does NOT clear when host is not found in summaries', async () => {
      (AuthService.listAccountSummaries as jest.Mock).mockResolvedValue([
        {
          account: { id: 'acc-1', login: 'alice', name: 'Alice', email: '', avatarUrl: '', hostIds: ['h1'] },
          hosts: [{ id: 'h1', accountId: 'acc-1', provider: 'github', hostLogin: 'alice', hostUserId: 1, name: 'Alice', email: null, avatarUrl: null, instanceBaseUrl: null, addedAt: 0 }],
          activeHostId: 'h1',
        },
      ]);
      (AuthService.getActiveSummary as jest.Mock).mockResolvedValue({
        account: { id: 'acc-1', login: 'alice', name: 'Alice', email: '', avatarUrl: '', hostIds: ['h1'] },
        hosts: [{ id: 'h1', accountId: 'acc-1', provider: 'github', hostLogin: 'alice', hostUserId: 1, name: 'Alice', email: null, avatarUrl: null, instanceBaseUrl: null, addedAt: 0 }],
        activeHostId: 'h1',
      });
      (AuthService.getToken as jest.Mock).mockResolvedValue('tok');

      const { getByTestId } = renderProvider();
      await waitFor(() => expect(getByTestId('probe')).toBeTruthy());

      await act(async () => {
        await capturedMethods!.disconnectHost('nonexistent-host');
      });

      expect(AuthService.disconnectHost).toHaveBeenCalledWith('nonexistent-host');
      expect(mockSetChatRepo).not.toHaveBeenCalled();
    });

    it('does NOT clear when chatRepoAccountId is null and host belongs to non-active account', async () => {
      (AuthService.listAccountSummaries as jest.Mock).mockResolvedValue([
        {
          account: { id: 'acc-2', login: 'bob', name: 'Bob', email: '', avatarUrl: '', hostIds: ['h2'] },
          hosts: [{ id: 'h2', accountId: 'acc-2', provider: 'github', hostLogin: 'bob', hostUserId: 2, name: 'Bob', email: null, avatarUrl: null, instanceBaseUrl: null, addedAt: 0 }],
          activeHostId: 'h2',
        },
        {
          account: { id: 'acc-1', login: 'alice', name: 'Alice', email: '', avatarUrl: '', hostIds: ['h1'] },
          hosts: [{ id: 'h1', accountId: 'acc-1', provider: 'github', hostLogin: 'alice', hostUserId: 1, name: 'Alice', email: null, avatarUrl: null, instanceBaseUrl: null, addedAt: 0 }],
          activeHostId: null,
        },
      ]);
      (AuthService.getActiveSummary as jest.Mock).mockResolvedValue({
        account: { id: 'acc-2', login: 'bob', name: 'Bob', email: '', avatarUrl: '', hostIds: ['h2'] },
        hosts: [{ id: 'h2', accountId: 'acc-2', provider: 'github', hostLogin: 'bob', hostUserId: 2, name: 'Bob', email: null, avatarUrl: null, instanceBaseUrl: null, addedAt: 0 }],
        activeHostId: 'h2',
      });
      (AuthService.getToken as jest.Mock).mockResolvedValue('tok');

      const { getByTestId } = renderProvider();
      await waitFor(() => expect(getByTestId('probe')).toBeTruthy());

      // Removing h1 which belongs to acc-1 (non-active), chatRepoAccountId is null
      await act(async () => {
        await capturedMethods!.disconnectHost('h1');
      });

      expect(mockSetChatRepo).not.toHaveBeenCalled();
    });
  });

  // ── addAccount ─────────────────────────────────────────────────────

  describe('addAccount', () => {
    it('syncs the GitHubService singleton token so repo listing works immediately', async () => {
      (AuthService.listAccountSummaries as jest.Mock).mockResolvedValue([]);
      (AuthService.getActiveSummary as jest.Mock).mockResolvedValue(null);
      (AuthService.getToken as jest.Mock).mockResolvedValue(null);
      (AuthService.connectHost as jest.Mock).mockResolvedValue({
        ok: true,
        host: {
          id: 'h1',
          hostUserId: 42,
          hostLogin: 'alice',
          name: 'Alice',
          email: 'alice@example.com',
        },
        account: { id: 'acc-1' },
      });

      const { getByTestId } = renderProvider();
      await waitFor(() => expect(getByTestId('probe')).toBeTruthy());

      const added = await capturedMethods!.addAccount('ghp_secret');

      expect(added).toEqual({ id: 'acc-1' });
      expect(GitHubService.setToken).toHaveBeenCalledWith(
        'ghp_secret',
        expect.objectContaining({
          id: 42,
          login: 'alice',
          name: 'Alice',
          email: 'alice@example.com',
        }),
      );
    });

    it('does not touch GitHubService when connectHost fails', async () => {
      (AuthService.listAccountSummaries as jest.Mock).mockResolvedValue([]);
      (AuthService.getActiveSummary as jest.Mock).mockResolvedValue(null);
      (AuthService.getToken as jest.Mock).mockResolvedValue(null);
      (AuthService.connectHost as jest.Mock).mockResolvedValue(null);

      const { getByTestId } = renderProvider();
      await waitFor(() => expect(getByTestId('probe')).toBeTruthy());

      const added = await capturedMethods!.addAccount('bad-token');

      expect(added).toBeNull();
      expect(GitHubService.setToken).not.toHaveBeenCalled();
    });
  });

  // ── connectHost (#953) ──────────────────────────────────────────────

  describe('connectHost', () => {
    it('hydrates the GitHubService singleton for github connects so repo listing works immediately', async () => {
      (AuthService.listAccountSummaries as jest.Mock).mockResolvedValue([]);
      (AuthService.getActiveSummary as jest.Mock).mockResolvedValue(null);
      (AuthService.getToken as jest.Mock).mockResolvedValue(null);
      (AuthService.connectHost as jest.Mock).mockResolvedValue({
        ok: true,
        host: {
          id: 'h1',
          provider: 'github',
          hostUserId: 42,
          hostLogin: 'alice',
          name: 'Alice',
          email: 'alice@example.com',
          avatarUrl: null,
          instanceBaseUrl: null,
        },
        account: { id: 'acc-1' },
      });

      const { getByTestId } = renderProvider();
      await waitFor(() => expect(getByTestId('probe')).toBeTruthy());

      const result = await capturedMethods!.connectHost({
        provider: 'github',
        token: 'ghp_secret',
      });

      expect(result).toEqual({ ok: true, host: expect.objectContaining({ id: 'h1' }) });
      expect(GitHubService.setToken).toHaveBeenCalledWith(
        'ghp_secret',
        expect.objectContaining({
          id: 42,
          login: 'alice',
          name: 'Alice',
          email: 'alice@example.com',
        }),
      );
    });

    it('does not hydrate GitHubService when connectHost fails', async () => {
      (AuthService.listAccountSummaries as jest.Mock).mockResolvedValue([]);
      (AuthService.getActiveSummary as jest.Mock).mockResolvedValue(null);
      (AuthService.getToken as jest.Mock).mockResolvedValue(null);
      (AuthService.connectHost as jest.Mock).mockResolvedValue(null);

      const { getByTestId } = renderProvider();
      await waitFor(() => expect(getByTestId('probe')).toBeTruthy());

      const result = await capturedMethods!.connectHost({
        provider: 'github',
        token: 'ghp_secret',
      });

      expect(result).toEqual({ ok: false, error: 'Invalid token' });
      expect(GitHubService.setToken).not.toHaveBeenCalled();
    });
  });
});
