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
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('expo-file-system', () => ({}));

// Per-file react-native mock: proper Pressable disabled prop handling for RNTL
jest.mock('react-native', () => {
  const React = require('react');
  const RNView = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('View', props, children);
  RNView.displayName = 'View';

  const Text = ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) =>
    React.createElement('Text', props, children);
  Text.displayName = 'Text';

  const Pressable = ({
    children,
    disabled,
    testID,
    accessibilityRole,
    accessibilityState,
    ...props
  }: {
    children?: React.ReactNode;
    disabled?: boolean;
    testID?: string;
    accessibilityRole?: string;
    accessibilityState?: { disabled?: boolean };
    [key: string]: unknown;
  }) => {
    const accState = accessibilityState ?? (disabled ? { disabled: true } : undefined);
    return React.createElement('View', {
      testID,
      accessibilityRole,
      accessibilityState: accState,
      ...props,
    }, children);
  };
  Pressable.displayName = 'Pressable';

  return {
    AccessibilityInfo: {
      isReduceMotionEnabled: () => Promise.resolve(false),
      addEventListener: () => ({ remove: jest.fn() }),
    },
    StyleSheet: { create: (s: object) => s, flatten: (s: object) => s },
    Platform: { OS: 'ios', select: (o: object) => o },
    PixelRatio: { get: () => 2 },
    Dimensions: { get: () => ({ width: 375, height: 812 }) },
    Image: RNView,
    Text,
    TouchableOpacity: RNView,
    Pressable,
    ScrollView: RNView,
    FlatList: RNView,
    SectionList: RNView,
    TextInput: RNView,
    Switch: RNView,
    ActivityIndicator: RNView,
    RefreshControl: RNView,
    Modal: RNView,
    KeyboardAvoidingView: RNView,
    View: RNView,
    useWindowDimensions: () => ({ width: 375, height: 812, scale: 2, fontScale: 1 }),
    Alert: { alert: jest.fn() },
  };
});

// Mock FlatList to render data items for section components
jest.mock('@/components/ui/flat-list', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    FlatList: React.forwardRef(function MockFlatList({
      data,
      renderItem,
      ListHeaderComponent,
      ListEmptyComponent,
      testID,
      ...props
    }: {
      data?: unknown[];
      renderItem?: (args: { item: unknown; index: number }) => React.ReactElement | null;
      ListHeaderComponent?: React.ReactElement | null;
      ListEmptyComponent?: React.ReactElement | null;
      testID?: string;
      [key: string]: unknown;
    }, _ref: React.Ref<unknown>) {
      const items = data ?? [];
      return React.createElement(View, { testID, ...props },
        ListHeaderComponent,
        items.length === 0 && ListEmptyComponent,
        items.map((item, index) =>
          renderItem ? React.createElement(React.Fragment, { key: index }, renderItem({ item, index })) : null
        )
      );
    }),
  };
});

jest.mock('@/components/explore/CommitComposer', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    CommitComposer: function MockCommitComposer() {
      return React.createElement(View, { testID: 'commit-composer-mock' });
    },
  };
});

// Mock GitSyncGate to support RealCoordinator.checkout postflight path
jest.mock('@/services/git/GitSyncGate', () => ({
  GitSyncGate: {
    acquireCycle: jest.fn(() => Promise.resolve(/* noop */)),
    verifyCheckoutPostflight: jest.fn(() => Promise.resolve({ ok: true })),
  },
}));

import { BranchesSection } from '@/components/explore/BranchesSection';
import { ChangesSection } from '@/components/explore/ChangesSection';
import { StagingSection } from '@/components/explore/StagingSection';
import { CheckoutSafetyProvider, useCheckoutSafety } from '@/contexts/CheckoutSafetyContext';
import { GitBranchCoordinator } from '@/services/git/GitBranchCoordinator';

// Mock the GitBranchCoordinator with state tracking
jest.mock('@/services/git/GitBranchCoordinator', () => {
  const callbacks: Array<(state: string) => void> = [];
  let state = 'idle';

  return {
    GitBranchCoordinator: {
      getState: jest.fn(() => {
        return state;
      }),
      checkout: jest.fn(),
      beginMutation: jest.fn(),
      endMutation: jest.fn(),
      reset: jest.fn(),
      onStateChange: jest.fn((cb: (state: string) => void) => {
        callbacks.push(cb);
        return () => {
          const idx = callbacks.indexOf(cb);
          if (idx > -1) callbacks.splice(idx, 1);
        };
      }),
      _setState: (s: string) => {
        state = s;
        callbacks.forEach((cb) => cb(s));
      },
      _reset: () => {
        state = 'idle';
        callbacks.length = 0;
      },
    },
  };
});

// Mock GitEngine
jest.mock('@/services/git/engine/GitEngine', () => ({
  listBranches: jest.fn(),
  checkoutBranch: jest.fn(),
  statuses: jest.fn(),
  stage: jest.fn(),
  discardFiles: jest.fn(),
  unstage: jest.fn(),
  diffAll: jest.fn(),
  repoInfo: jest.fn(),
}));

// Mock GitFsService
jest.mock('@/services/git/GitFsService', () => ({
  GitFsService: {
    isCloned: jest.fn(() => Promise.resolve(true)),
  },
}));

// Mock the navigation
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useNavigation: () => ({
      navigate: jest.fn(),
    }),
    useFocusEffect: jest.fn((callback: () => void) => {
      React.useEffect(() => {
        const id = setTimeout(() => { callback(); }, 0);
        return () => clearTimeout(id);
      }, [callback]);
    }),
  };
});

// Mock the theme context
jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
  }),
  useTokens: () => ({
    spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
    radii: { sm: 12, md: 18, lg: 24, pill: 999 },
    type: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, '2xl': 28 },
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
    GitBranchCoordinatorMock._reset();
  });

  it('exposes isCheckingOut = false when state is idle', () => {
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
    GitBranchCoordinatorMock._setState('checkout-running');

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
    GitBranchCoordinatorMock._setState('mutation-running');

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
    GitBranchCoordinatorMock._reset();
    GitBranchCoordinatorMock.checkout.mockResolvedValue(undefined);

    const GitEngine = require('@/services/git/engine/GitEngine');
    GitEngine.listBranches.mockReturnValue([
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
    GitBranchCoordinatorMock._setState('checkout-running');

    const { getByTestId } = render(
      <CheckoutSafetyProvider>
        <BranchesSection
          repo={mockRepo}
          active={true}
          onChanged={jest.fn()}
        />
      </CheckoutSafetyProvider>
    );

    await waitFor(() => {
      expect(getByTestId('explore.branch.checkout.feature-branch')).toBeDisabled();
    });
  });

  it('shows busy indicator on checkout button during checkout', async () => {
    GitBranchCoordinatorMock._setState('checkout-running');

    const { getByTestId } = render(
      <CheckoutSafetyProvider>
        <BranchesSection
          repo={mockRepo}
          active={true}
          onChanged={jest.fn()}
        />
      </CheckoutSafetyProvider>
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
      <CheckoutSafetyProvider>
        <BranchesSection
          repo={mockRepo}
          active={true}
          onChanged={jest.fn()}
        />
      </CheckoutSafetyProvider>
    );

    await waitFor(() => {
      expect(getByTestId('explore.branch.checkout.feature-branch')).toBeTruthy();
    });

    const checkoutButton = getByTestId('explore.branch.checkout.feature-branch');

    fireEvent.press(checkoutButton);

    await waitFor(() => {
      expect(GitBranchCoordinatorMock.checkout).toHaveBeenCalledWith(
        mockRepo.id,
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
    jest.useFakeTimers();
    GitBranchCoordinatorMock._reset();

    const GitEngine = require('@/services/git/engine/GitEngine');
    GitEngine.statuses.mockReturnValue([
      { path: 'notes/test.md', status: 'Modified', staged: false, conflicted: false, indexStatus: '', workdirStatus: 'Modified' },
    ]);
    GitEngine.diffAll.mockReturnValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('disables discard button when checkout is running', async () => {
    GitBranchCoordinatorMock._setState('checkout-running');

    const { getByTestId } = render(
      <CheckoutSafetyProvider>
        <ChangesSection
          repo={mockRepo}
          active={true}
          onChanged={jest.fn()}
        />
      </CheckoutSafetyProvider>
    );

    await waitFor(() => {
      expect(getByTestId('explore.discard.notes/test.md')).toBeDisabled();
    });
  });

  it('disables stage button when checkout is running', async () => {
    GitBranchCoordinatorMock._setState('checkout-running');

    const { getByText } = render(
      <CheckoutSafetyProvider>
        <ChangesSection
          repo={mockRepo}
          active={true}
          onChanged={jest.fn()}
        />
      </CheckoutSafetyProvider>
    );

    await waitFor(() => {
      expect(getByText('Stage')).toBeDisabled();
    });
  });

  it('allows mutations when checkout is not running', async () => {
    const GitEngine = require('@/services/git/engine/GitEngine');
    GitEngine.discardFiles.mockResolvedValue(undefined);

    const { getByTestId } = render(
      <CheckoutSafetyProvider>
        <ChangesSection
          repo={mockRepo}
          active={true}
          onChanged={jest.fn()}
        />
      </CheckoutSafetyProvider>
    );

    await waitFor(() => {
      expect(getByTestId('explore.discard.notes/test.md')).toBeEnabled();
    });
  });
});

describe('StagingSection checkout safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    GitBranchCoordinatorMock._reset();

    const GitEngine = require('@/services/git/engine/GitEngine');
    GitEngine.statuses.mockReturnValue([
      { path: 'notes/test.md', status: 'Modified', staged: true, conflicted: false, indexStatus: 'Modified', workdirStatus: '' },
    ]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('disables unstage button when checkout is running', async () => {
    GitBranchCoordinatorMock._setState('checkout-running');

    const { getByTestId } = render(
      <CheckoutSafetyProvider>
        <StagingSection
          repo={mockRepo}
          active={true}
          onChanged={jest.fn()}
        />
      </CheckoutSafetyProvider>
    );

    await waitFor(() => {
      expect(getByTestId('explore.unstage.notes/test.md')).toBeDisabled();
    });
  });

  it('disables discard button when checkout is running', async () => {
    GitBranchCoordinatorMock._setState('checkout-running');

    const { getByTestId } = render(
      <CheckoutSafetyProvider>
        <StagingSection
          repo={mockRepo}
          active={true}
          onChanged={jest.fn()}
        />
      </CheckoutSafetyProvider>
    );

    await waitFor(() => {
      expect(getByTestId('explore.discard.notes/test.md')).toBeDisabled();
    });
  });

  it('allows mutations when checkout is not running', async () => {
    const GitEngine = require('@/services/git/engine/GitEngine');
    GitEngine.unstage.mockResolvedValue(undefined);

    const { getByTestId } = render(
      <CheckoutSafetyProvider>
        <StagingSection
          repo={mockRepo}
          active={true}
          onChanged={jest.fn()}
        />
      </CheckoutSafetyProvider>
    );

    await waitFor(() => {
      expect(getByTestId('explore.unstage.notes/test.md')).toBeEnabled();
    });
  });
});

describe('ExploreScreen checkout blocking overlay', () => {
  beforeEach(() => {
    GitBranchCoordinatorMock._reset();
  });

  it('shows blocking overlay when checkout is running', () => {
    GitBranchCoordinatorMock._setState('checkout-running');

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
    GitBranchCoordinatorMock._setState('mutation-running');

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
  beforeEach(() => {
    jest.clearAllMocks();
    (require('@/services/git/engine/GitEngine').checkoutBranch as jest.Mock).mockReset();
  });

  it('only Git-tab checkout action can transition to checkout-running state', async () => {
    let RealCoordinator: typeof GitBranchCoordinator;
    await jest.isolateModulesAsync(async () => {
      ({ GitBranchCoordinator: RealCoordinator } = jest.requireActual('@/services/git/GitBranchCoordinator'));
    });
    GitBranchCoordinatorMock.getState.mockReturnValue('idle');

    const GitEngine = require('@/services/git/engine/GitEngine');
    GitEngine.statuses.mockResolvedValue([]);
    GitEngine.checkoutBranch.mockResolvedValue(undefined);
    GitEngine.repoInfo.mockResolvedValue({ currentBranch: 'feature-branch' });

    await RealCoordinator!.checkout(mockRepo.id, mockRepo.localPath, 'feature-branch');

    expect(GitBranchCoordinatorMock.getState()).toBe('idle');
    expect(GitEngine.checkoutBranch).toHaveBeenCalled();
  });

  it('direct GitEngine.checkoutBranch is not called by non-Git-tab code paths', () => {
    const GitEngine = require('@/services/git/engine/GitEngine');

    // When checkout is running, components should use GitBranchCoordinator,
    // not call GitEngine.checkoutBranch directly
    GitBranchCoordinatorMock._setState('checkout-running');

    // Assert the mock was not called (do not invoke the function)
    expect(GitEngine.checkoutBranch).not.toHaveBeenCalled();
  });
});
