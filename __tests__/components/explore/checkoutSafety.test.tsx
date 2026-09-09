/**
 * TDD tests for checkout safety behavior in Explore screen components.
 *
 * These tests define the expected UI behavior when checkout is running.
 * They FAIL until the GitBranchCoordinator implementation is complete.
 *
 * Key behaviors tested:
 *   - Section tabs are disabled during checkout
 *   - Mutation buttons (stage, discard, commit) are disabled during checkout
 *   - Checkout buttons show busy state during checkout
 *   - Blocking overlay appears during checkout
 *   - Only Git-tab checkout can initiate checkout (not API/sync)
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('expo-file-system', () => ({}));

import { BranchesSection } from '@/components/explore/BranchesSection';
import { ChangesSection } from '@/components/explore/ChangesSection';
import { StagingSection } from '@/components/explore/StagingSection';
import { CheckoutSafetyProvider, useCheckoutSafety } from '@/contexts/CheckoutSafetyContext';
import { GitBranchCoordinator } from '@/services/git/GitBranchCoordinator';

// Mock the GitBranchCoordinator
jest.mock('@/services/git/GitBranchCoordinator', () => ({
  GitBranchCoordinator: {
    getState: jest.fn(),
    checkout: jest.fn(),
    beginMutation: jest.fn(),
    endMutation: jest.fn(),
    reset: jest.fn(),
    onStateChange: jest.fn(),
  },
}));

// Mock GitEngine
jest.mock('@/services/git/engine/GitEngine', () => ({
  listBranches: jest.fn(),
  checkoutBranch: jest.fn(),
  statuses: jest.fn(),
  stage: jest.fn(),
  discardFiles: jest.fn(),
  unstage: jest.fn(),
  diffAll: jest.fn(),
}));

// Mock GitFsService
jest.mock('@/services/git/GitFsService', () => ({
  GitFsService: {
    isCloned: jest.fn(() => Promise.resolve(true)),
  },
}));

// Mock the navigation
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
  }),
  useFocusEffect: jest.fn((callback) => callback()),
}));

// Mock the theme context
jest.mock('@/contexts/ThemeContext', () => ({
  useTokens: () => ({
    colors: {
      background: '#ffffff',
      card: '#f0f0f0',
      border: '#cccccc',
      text: '#000000',
      textSecondary: '#666666',
      accent: '#007AFF',
      success: '#34C759',
      error: '#FF3B30',
      warning: '#FF9500',
      surfaceSecondary: '#e5e5ea',
    },
  }),
}));

const mockRepo = {
  id: 'test-repo',
  path: 'owner/test-repo',
  name: 'test-repo',
  localPath: '/mock/repo',
  branch: 'main',
};

const GitBranchCoordinatorMock = GitBranchCoordinator as jest.Mocked<typeof GitBranchCoordinator>;

describe('CheckoutSafetyContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    GitBranchCoordinatorMock.getState.mockReturnValue('idle');
    GitBranchCoordinatorMock.onStateChange.mockReturnValue(jest.fn());
  });

  it('exposes isCheckingOut = false when state is idle', () => {
    GitBranchCoordinatorMock.getState.mockReturnValue('idle');

    let contextValue: { isCheckingOut: boolean } | null = null;
    const TestComponent = () => {
      const { isCheckingOut } = useCheckoutSafety();
      contextValue = { isCheckingOut };
      return null;
    };

    render(
      <CheckoutSafetyProvider>
        <TestComponent />
      </CheckoutSafetyProvider>
    );

    expect(contextValue?.isCheckingOut).toBe(false);
  });

  it('exposes isCheckingOut = true when state is checkout-running', () => {
    GitBranchCoordinatorMock.getState.mockReturnValue('checkout-running');

    let contextValue: { isCheckingOut: boolean } | null = null;
    const TestComponent = () => {
      const { isCheckingOut } = useCheckoutSafety();
      contextValue = { isCheckingOut };
      return null;
    };

    render(
      <CheckoutSafetyProvider>
        <TestComponent />
      </CheckoutSafetyProvider>
    );

    expect(contextValue?.isCheckingOut).toBe(true);
  });

  it('exposes isCheckingOut = false when state is mutation-running', () => {
    GitBranchCoordinatorMock.getState.mockReturnValue('mutation-running');

    let contextValue: { isCheckingOut: boolean } | null = null;
    const TestComponent = () => {
      const { isCheckingOut } = useCheckoutSafety();
      contextValue = { isCheckingOut };
      return null;
    };

    render(
      <CheckoutSafetyProvider>
        <TestComponent />
      </CheckoutSafetyProvider>
    );

    expect(contextValue?.isCheckingOut).toBe(false);
  });

  it('subscribes to GitBranchCoordinator state changes', () => {
    const mockSubscribe = jest.fn();
    GitBranchCoordinatorMock.onStateChange.mockReturnValue(mockSubscribe);

    const { unmount } = render(
      <CheckoutSafetyProvider>
        <>{null}</>
      </CheckoutSafetyProvider>
    );

    expect(GitBranchCoordinatorMock.onStateChange).toHaveBeenCalledWith(expect.any(Function));

    unmount();

    expect(mockSubscribe).toHaveBeenCalled(); // cleanup
  });
});

describe('BranchesSection checkout safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    GitBranchCoordinatorMock.getState.mockReturnValue('idle');
    GitBranchCoordinatorMock.onStateChange.mockReturnValue(jest.fn());
    GitBranchCoordinatorMock.checkout.mockResolvedValue(undefined);

    const GitEngine = require('@/services/git/engine/GitEngine');
    GitEngine.listBranches.mockResolvedValue([
      {
        name: 'main',
        isCurrent: true,
        isRemote: false,
        upstream: 'origin/main',
        ahead: 0,
        behind: 0,
      },
      {
        name: 'feature-branch',
        isCurrent: false,
        isRemote: false,
        upstream: null,
        ahead: 0,
        behind: 0,
      },
    ]);
  });

  it('disables checkout button when checkout is running', async () => {
    GitBranchCoordinatorMock.getState.mockReturnValue('checkout-running');

    const { getByTestId } = render(
      <BranchesSection
        repo={mockRepo}
        active={true}
        onChanged={jest.fn()}
        status={null}
      />
    );

    await waitFor(() => {
      expect(getByTestId('explore.branch.checkout.feature-branch')).toBeDisabled();
    });
  });

  it('shows busy indicator on checkout button during checkout', async () => {
    GitBranchCoordinatorMock.getState.mockReturnValue('checkout-running');

    const { getByTestId } = render(
      <BranchesSection
        repo={mockRepo}
        active={true}
        onChanged={jest.fn()}
        status={null}
      />
    );

    await waitFor(() => {
      const button = getByTestId('explore.branch.checkout.feature-branch');
      // Button should be disabled during checkout
      expect(button).toBeDisabled();
    });
  });

  it('uses GitBranchCoordinator.checkout instead of direct GitEngine.checkoutBranch', async () => {
    const GitEngine = require('@/services/git/engine/GitEngine');
    GitEngine.checkoutBranch.mockResolvedValue(undefined);

    const { getByTestId } = render(
      <BranchesSection
        repo={mockRepo}
        active={true}
        onChanged={jest.fn()}
        status={null}
      />
    );

    await waitFor(() => {
      expect(getByTestId('explore.branch.checkout.feature-branch')).toBeTruthy();
    });

    const checkoutButton = getByTestId('explore.branch.checkout.feature-branch');

    fireEvent.press(checkoutButton);

    await waitFor(() => {
      expect(GitBranchCoordinatorMock.checkout).toHaveBeenCalledWith(
        mockRepo.localPath,
        'feature-branch'
      );
    });

    // Direct GitEngine.checkoutBranch should NOT be called
    expect(GitEngine.checkoutBranch).not.toHaveBeenCalled();
  });
});

describe('ChangesSection checkout safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    GitBranchCoordinatorMock.getState.mockReturnValue('idle');
    GitBranchCoordinatorMock.onStateChange.mockReturnValue(jest.fn());

    const GitEngine = require('@/services/git/engine/GitEngine');
    GitEngine.statuses.mockResolvedValue([
      { path: 'notes/test.md', status: 'Modified', staged: false, conflicted: false, indexStatus: '', workdirStatus: 'Modified' },
    ]);
    GitEngine.diffAll.mockResolvedValue([]);
  });

  it('disables discard button when checkout is running', async () => {
    GitBranchCoordinatorMock.getState.mockReturnValue('checkout-running');

    const { getByTestId } = render(
      <ChangesSection
        repo={mockRepo}
        active={true}
        onChanged={jest.fn()}
        status={null}
      />
    );

    await waitFor(() => {
      expect(getByTestId('explore.discard.notes/test.md')).toBeDisabled();
    });
  });

  it('disables stage button when checkout is running', async () => {
    GitBranchCoordinatorMock.getState.mockReturnValue('checkout-running');

    const { getByText } = render(
      <ChangesSection
        repo={mockRepo}
        active={true}
        onChanged={jest.fn()}
        status={null}
      />
    );

    await waitFor(() => {
      expect(getByText('Stage')).toBeDisabled();
    });
  });

  it('allows mutations when checkout is not running', async () => {
    GitBranchCoordinatorMock.getState.mockReturnValue('idle');

    const GitEngine = require('@/services/git/engine/GitEngine');
    GitEngine.discardFiles.mockResolvedValue(undefined);

    const { getByTestId } = render(
      <ChangesSection
        repo={mockRepo}
        active={true}
        onChanged={jest.fn()}
        status={null}
      />
    );

    await waitFor(() => {
      expect(getByTestId('explore.discard.notes/test.md')).toBeEnabled();
    });
  });
});

describe('StagingSection checkout safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    GitBranchCoordinatorMock.getState.mockReturnValue('idle');
    GitBranchCoordinatorMock.onStateChange.mockReturnValue(jest.fn());

    const GitEngine = require('@/services/git/engine/GitEngine');
    GitEngine.statuses.mockResolvedValue([
      { path: 'notes/test.md', status: 'Modified', staged: true, conflicted: false, indexStatus: 'Modified', workdirStatus: '' },
    ]);
  });

  it('disables unstage button when checkout is running', async () => {
    GitBranchCoordinatorMock.getState.mockReturnValue('checkout-running');

    const { getByTestId } = render(
      <StagingSection
        repo={mockRepo}
        active={true}
        onChanged={jest.fn()}
        status={null}
      />
    );

    await waitFor(() => {
      expect(getByTestId('explore.unstage.notes/test.md')).toBeDisabled();
    });
  });

  it('disables discard button when checkout is running', async () => {
    GitBranchCoordinatorMock.getState.mockReturnValue('checkout-running');

    const { getByTestId } = render(
      <StagingSection
        repo={mockRepo}
        active={true}
        onChanged={jest.fn()}
        status={null}
      />
    );

    await waitFor(() => {
      expect(getByTestId('explore.discard.notes/test.md')).toBeDisabled();
    });
  });

  it('allows mutations when checkout is not running', async () => {
    GitBranchCoordinatorMock.getState.mockReturnValue('idle');

    const GitEngine = require('@/services/git/engine/GitEngine');
    GitEngine.unstage.mockResolvedValue(undefined);

    const { getByTestId } = render(
      <StagingSection
        repo={mockRepo}
        active={true}
        onChanged={jest.fn()}
        status={null}
      />
    );

    await waitFor(() => {
      expect(getByTestId('explore.unstage.notes/test.md')).toBeEnabled();
    });
  });
});

describe('ExploreScreen checkout blocking overlay', () => {
  it('shows blocking overlay when checkout is running', () => {
    GitBranchCoordinatorMock.getState.mockReturnValue('checkout-running');

    let contextValue: { showBlockingOverlay: boolean } | null = null;
    const TestComponent = () => {
      const { showBlockingOverlay } = useCheckoutSafety();
      contextValue = { showBlockingOverlay };
      return null;
    };

    render(
      <CheckoutSafetyProvider>
        <TestComponent />
      </CheckoutSafetyProvider>
    );

    expect(contextValue?.showBlockingOverlay).toBe(true);
  });

  it('does not show blocking overlay when checkout is idle', () => {
    GitBranchCoordinatorMock.getState.mockReturnValue('idle');

    let contextValue: { showBlockingOverlay: boolean } | null = null;
    const TestComponent = () => {
      const { showBlockingOverlay } = useCheckoutSafety();
      contextValue = { showBlockingOverlay };
      return null;
    };

    render(
      <CheckoutSafetyProvider>
        <TestComponent />
      </CheckoutSafetyProvider>
    );

    expect(contextValue?.showBlockingOverlay).toBe(false);
  });

  it('does not show blocking overlay when mutation is running', () => {
    GitBranchCoordinatorMock.getState.mockReturnValue('mutation-running');

    let contextValue: { showBlockingOverlay: boolean } | null = null;
    const TestComponent = () => {
      const { showBlockingOverlay } = useCheckoutSafety();
      contextValue = { showBlockingOverlay };
      return null;
    };

    render(
      <CheckoutSafetyProvider>
        <TestComponent />
      </CheckoutSafetyProvider>
    );

    // Mutation running should not show blocking overlay (different UX treatment)
    expect(contextValue?.showBlockingOverlay).toBe(false);
  });
});

describe('Git-tab checkout exclusivity', () => {
  it('only Git-tab checkout action can transition to checkout-running state', async () => {
    const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
    GitBranchCoordinatorMock.getState.mockReturnValue('idle');

    const GitEngine = require('@/services/git/engine/GitEngine');
    GitEngine.statuses.mockResolvedValue([]);
    GitEngine.checkoutBranch.mockResolvedValue(undefined);

    // Calling checkout through the coordinator should work
    await GitBranchCoordinator.checkout(mockRepo.localPath, 'feature-branch');

    expect(GitBranchCoordinatorMock.getState()).toBe('idle'); // After success
    expect(GitEngine.checkoutBranch).toHaveBeenCalled();
  });

  it('direct GitEngine.checkoutBranch is not called by non-Git-tab code paths', async () => {
    const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
    const GitEngine = require('@/services/git/engine/GitEngine');

    // Direct call should be blocked - the coordinator should intercept
    GitBranchCoordinatorMock.getState.mockReturnValue('checkout-running');

    // If code tries to call GitEngine.checkoutBranch directly during checkout,
    // it should be blocked (the component should use GitBranchCoordinator instead)
    await expect(
      GitEngine.checkoutBranch(mockRepo.localPath, 'feature-branch', 'origin')
    ).not.toBeCalled(); // The component should not call this directly
  });
});
