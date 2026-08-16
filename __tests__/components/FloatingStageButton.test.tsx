import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

import { FloatingStageButton } from '../../src/components/git/FloatingStageButton';

async function renderStageButton(routeName = 'Home') {
  const result = render(<FloatingStageButton currentRouteName={routeName} />);
  await act(async () => {
    for (let round = 0; round < 5; round += 1) {
      await Promise.resolve();
    }
  });
  return result;
}

const mockNavigate = jest.fn();
const mockLoadStaged = jest.fn(async () => undefined);
const mockRegisterQueueSubscription = jest.fn();
const mockRequestPush = jest.fn();
const mockSetPushing = jest.fn();
const mockShiftQueue = jest.fn();
const mockPushAll = jest.fn();

interface MockStageState {
  staged: unknown[];
  isPushing: Record<string, boolean>;
  globalPushing: boolean;
  pushQueue: string[];
  pendingCount: number;
  loadStaged: () => Promise<void>;
  keyFor: (repoPath: string, branch: string) => string;
  requestPush: (repoPath?: string, branch?: string) => string | null;
  setPushing: (key: string, bool: boolean) => void;
  pushAll: () => void;
  dequeueNext: () => string | null;
  shiftQueue: () => void;
  registerQueueSubscription: () => void;
}

const mockStageState: MockStageState = {
  staged: [],
  isPushing: {},
  globalPushing: false,
  pushQueue: [],
  pendingCount: 2,
  loadStaged: mockLoadStaged,
  keyFor: (repoPath, branch) => `${repoPath}::${branch}`,
  requestPush: mockRequestPush,
  setPushing: mockSetPushing,
  pushAll: mockPushAll,
  dequeueNext: () => null,
  shiftQueue: mockShiftQueue,
  registerQueueSubscription: mockRegisterQueueSubscription,
};

let mockAIEnabled = true;
let mockWindowDimensions = { width: 320, height: 480, scale: 2, fontScale: 1 };

jest.mock('../../src/services/git/StagingService', () => ({
  StagingService: { listStaged: jest.fn(async () => []) },
}));

jest.mock('../../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: { subscribe: jest.fn(() => () => undefined) },
}));

jest.mock('../../src/services/StorageService', () => ({
  StorageService: { getSavedRepositories: jest.fn(async () => []) },
}));

jest.mock('../../src/stores/stageStore', () => {
  const actual = jest.requireActual('../../src/stores/stageStore');
  const mockUseStageStore = (selector: (state: MockStageState) => unknown) =>
    selector(mockStageState);
  return {
    ...actual,
    useStageStore: Object.assign(mockUseStageStore, {
      getState: () => mockStageState,
      setState: () => undefined,
      subscribe: () => () => undefined,
    }),
  };
});

jest.mock('../../src/stores/aiStore', () => ({
  useAIStore: () => ({ isEnabled: mockAIEnabled }),
}));

jest.mock('../../src/components/ui/TabBar', () => ({
  useTabBarHeight: () => 0,
}));

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindowDimensions,
}));

jest.mock('../../src/contexts/ThemeContext', () => {
  const colors = {
    primary: '#7B8CDE',
    surface: '#FFFFFF',
    highlight: '#FFFFFF',
    shadow: '#BFBFBF',
    background: '#FFFFFF',
    text: '#111111',
    textSecondary: '#666666',
    border: '#DDDDDD',
    card: '#FFFFFF',
    accent: '#7B8CDE',
    elevated: '#F4F4F4',
    error: '#DC2626',
  };
  return {
    useTheme: () => ({ colors, style: 'neumorphic' }),
    useTokens: () => ({ colors, radii: { sm: 12, md: 18, lg: 24, pill: 999 } }),
  };
});

jest.mock('@shopify/react-native-skia', () => {
  const MockView = require('react-native').View;
  return {
    Canvas: MockView,
    Group: ({ children }: { children: React.ReactNode }) => children,
    Circle: MockView,
    Paint: ({ children }: { children: React.ReactNode }) => children,
    Blur: MockView,
    ColorMatrix: MockView,
    DashPathEffect: ({ children }: { children?: React.ReactNode }) => children ?? null,
  };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

import { FloatingAIButton } from '../../src/components/ai/FloatingAIButton';

describe('FloatingStageButton', () => {
  beforeEach(async () => {
    mockStageState.pendingCount = 2;
    mockStageState.globalPushing = false;
    mockStageState.isPushing = {};
    mockAIEnabled = true;
    mockWindowDimensions = { width: 320, height: 480, scale: 2, fontScale: 1 };
    mockNavigate.mockClear();
    mockPushAll.mockClear();
    mockRequestPush.mockClear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  });

  it('stays hidden when nothing is staged', async () => {
    mockStageState.pendingCount = 0;

    const { queryByTestId } = await renderStageButton();

    expect(queryByTestId('floating-stage.button.navigate-stage')).toBeNull();
  });

  it('navigates to the Stage route on tap', async () => {
    const { getByTestId } = await renderStageButton();

    fireEvent.press(getByTestId('floating-stage.button.navigate-stage'));

    expect(mockNavigate).toHaveBeenCalledWith('Stage');
  });

  it('pushes all staged changes on long press', async () => {
    jest.useFakeTimers();
    const { getByTestId } = await renderStageButton();

    fireEvent(getByTestId('floating-stage.button.navigate-stage'), 'longPress');

    expect(mockPushAll).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('does not push again while a global push is in progress', async () => {
    mockStageState.globalPushing = true;

    const { getByTestId } = await renderStageButton();

    fireEvent(getByTestId('floating-stage.button.navigate-stage'), 'longPress');

    expect(mockPushAll).not.toHaveBeenCalled();
  });

  it.each(['ChatScreen', 'ChatThreadList'])(
    'stays hidden on the %s route',
    async (routeName) => {
      const { queryByTestId } = await renderStageButton(routeName);

      expect(queryByTestId('floating-stage.button.navigate-stage')).toBeNull();
    },
  );

  it('shows a progress indicator and hides the icon while pushing', async () => {
    mockStageState.globalPushing = true;

    const { getByTestId } = await renderStageButton();

    expect(getByTestId('floating-stage.button.progress')).toBeTruthy();
  });

  it('coexists with the AI floating button in the same tree', async () => {
    const { getByTestId } = render(
      <>
        <FloatingAIButton currentRouteName="Home" />
        <FloatingStageButton currentRouteName="Home" />
      </>,
    );
    await act(async () => {
      for (let round = 0; round < 5; round += 1) {
        await Promise.resolve();
      }
    });

    expect(getByTestId('floating-ai.button.navigate-chat')).toBeTruthy();
    expect(getByTestId('floating-stage.button.navigate-stage')).toBeTruthy();
  });
});
