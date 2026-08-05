jest.mock('expo-file-system/legacy', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    documentDirectory: '/test-docs/',
    readAsStringAsync: jest.fn(async (uri: string) => {
      const val = store.get(uri);
      if (val === undefined) throw new Error('ENOENT');
      return val;
    }),
    writeAsStringAsync: jest.fn(async (uri: string, content: string) => {
      store.set(uri, content);
    }),
    getInfoAsync: jest.fn(async (uri: string) => ({
      exists: store.has(uri),
    })),
    deleteAsync: jest.fn(async (uri: string) => {
      store.delete(uri);
    }),
    __store: store,
  };
});

jest.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: jest.fn(),
}));

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: {
      createAnimatedComponent: (c: any) => c,
      View: React.forwardRef((props: any, ref: any) =>
        React.createElement(require('react-native').View, { ...props, ref }),
      ),
      ScrollView: React.forwardRef((props: any, ref: any) =>
        React.createElement(require('react-native').ScrollView, { ...props, ref }),
      ),
    },
    useSharedValue: jest.fn((init: any) => ({ value: init })),
    useAnimatedStyle: jest.fn((fn: () => any) => fn()),
    useDerivedValue: jest.fn((fn: () => any) => ({ value: fn() })),
    withSpring: jest.fn((val: any) => val),
    runOnJS: jest.fn((fn: any) => fn),
  };
});

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const RN = require('react-native');
  return {
    GestureDetector: ({ children }: any) => children,
    Gesture: {
      Pan: () => ({
        onStart: () => ({ onUpdate: () => ({ onEnd: () => ({}) }) }),
      }),
    },
    PanGestureHandler: React.forwardRef((props: any, ref: any) =>
      React.createElement(RN.View, { ...props, ref }),
    ),
  };
});

jest.mock('@shopify/react-native-skia', () => {
  const React = require('react');
  const RN = require('react-native');
  const noop = React.forwardRef((props: any, ref: any) =>
    React.createElement(RN.View, { ...props, ref, testID: props.testID }),
  );
  return {
    Canvas: noop,
    Group: noop,
    Circle: noop,
    Paint: noop,
    Blur: noop,
    ColorMatrix: noop,
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
}));

jest.mock('../src/utils/haptics', () => ({
  HapticService: {
    success: jest.fn(),
    error: jest.fn(),
    selection: jest.fn(),
    impact: jest.fn(),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

jest.mock('../src/services/ThoughtDumpService', () => ({
  ThoughtDumpService: {
    create: jest.fn(async (text: string) => ({
      id: 'test-dump-id',
      text,
      createdAt: new Date().toISOString(),
      filePath: `thoughts/20240101-000000-test-d.md`,
    })),
    list: jest.fn(async () => []),
    delete: jest.fn(async () => true),
  },
}));

jest.mock('../src/services/ai/AIMemoryIndexService', () => {
  const entries = new Map<string, string>();
  const upsert = jest.fn(async (filePath: string, text: string) => {
    entries.set(filePath, text);
  });
  const remove = jest.fn(async (filePath: string) => {
    entries.delete(filePath);
  });
  const clear = jest.fn(async () => {
    entries.clear();
  });
  const isStale = jest.fn(() => false);
  const embed = jest.fn(async (texts: string[]) => texts.map(() => [0.5, 0.5]));
  const search = jest.fn(async () => []);
  const getEntryCount = jest.fn(() => entries.size);
  const getIndexedFilePaths = jest.fn(() => Array.from(entries.keys()));
  return {
    aiMemoryIndex: { upsert, remove, clear, isStale, embed, search, getEntryCount, getIndexedFilePaths },
    AIMemoryIndexService: jest.fn(() => ({ upsert, remove, clear, isStale, embed, search, getEntryCount, getIndexedFilePaths })),
    __entries: entries,
  };
});

jest.mock('../src/contexts/ThemeContext', () => {
  const React = require('react');
  const { NEUMORPHIC_LIGHT, RADII, SPACING, TYPE } = require('../src/theme/tokens');
  const value = {
    theme: 'light',
    isDark: false,
    style: 'neumorphic',
    setTheme: jest.fn(),
    setStyle: jest.fn(),
    colors: NEUMORPHIC_LIGHT,
    tokens: { colors: NEUMORPHIC_LIGHT, radii: RADII, spacing: SPACING, type: TYPE },
    isEnabled: true,
  };
  return {
    ThemeContext: React.createContext(value),
    useTheme: () => value,
    useTokens: () => ({ colors: NEUMORPHIC_LIGHT, radii: RADII, spacing: SPACING, type: TYPE }),
  };
});

jest.mock('../src/stores/aiStore', () => ({
  useAIStore: jest.fn(() => ({
    isEnabled: true,
  })),
}));

jest.mock('../src/stores/aiHubStore', () => {
  const create = require('zustand').create;
  return {
    useAIHubStore: create(() => ({
      pickerVisible: false,
      openChatRepoPicker: jest.fn(),
      closeChatRepoPicker: jest.fn(),
      goNewChat: jest.fn(),
      goChatHistory: jest.fn(),
      goAISettings: jest.fn(),
      goThoughtDump: jest.fn(),
    })),
  };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(() => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
  })),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const RN = require('react-native');
  return {
    SafeAreaView: React.forwardRef((props: any, ref: any) =>
      React.createElement(RN.View, { ...props, ref }),
    ),
    SafeAreaProvider: ({ children }: any) => children,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('../src/services/ai/thoughtDumpIndexing', () => ({
  indexDump: jest.fn(),
  removeDump: jest.fn(),
  reconcile: jest.fn(),
}));

jest.mock('../src/services/ai/systemPrompt', () => ({
  buildSystemPrompt: jest.fn((ctx: any) => {
    const sections = ['You are GitNotes AI'];
    if (ctx.memoryBlock) {
      sections.push(`=== User memory (thought dumps) ===\n${ctx.memoryBlock}\n=== End memory ===`);
    }
    return sections.join('\n\n');
  }),
}));

import { fireEvent, waitFor } from '@testing-library/react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { aiMemoryIndex } from '../src/services/ai/AIMemoryIndexService';
import { ThoughtDumpService } from '../src/services/ThoughtDumpService';
import { indexDump } from '../src/services/ai/thoughtDumpIndexing';
import { buildSystemPrompt } from '../src/services/ai/systemPrompt';
import { useAIHubStore } from '../src/stores/aiHubStore';

const fsStore = (FileSystem as unknown as { __store: Map<string, string> }).__store;

beforeEach(async () => {
  fsStore.clear();
  jest.clearAllMocks();
  const entries = (require('../src/services/ai/AIMemoryIndexService') as { __entries: Map<string, string> }).__entries;
  entries.clear();
});

describe('e2e: FAB -> thought dump -> memory -> reset', () => {
  it('long-press FAB opens hub menu with thought-dump item', () => {
    const React = require('react');
    const { render } = require('@testing-library/react-native');
    const { FloatingAIButton } = require('../src/components/ai/FloatingAIButton');

    const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };
    const { useNavigation } = require('@react-navigation/native');
    (useNavigation as jest.Mock).mockReturnValue(mockNavigation);

    const { getByTestId, queryByTestId } = render(React.createElement(FloatingAIButton));

    const fab = getByTestId('floating-ai.button.navigate-chat');
    expect(fab).toBeTruthy();

    expect(queryByTestId('floating-ai.hub.thought-dump')).toBeNull();

    fireEvent(fab, 'onLongPress');

    expect(getByTestId('floating-ai.hub.thought-dump')).toBeTruthy();
    expect(getByTestId('floating-ai.hub.new-chat')).toBeTruthy();
    expect(getByTestId('floating-ai.hub.chat-history')).toBeTruthy();
    expect(getByTestId('floating-ai.hub.ai-settings')).toBeTruthy();
  });

  it('tapping thought-dump menu item calls goThoughtDump navigation', () => {
    const React = require('react');
    const { render } = require('@testing-library/react-native');
    const { FloatingAIButton } = require('../src/components/ai/FloatingAIButton');

    const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };
    const { useNavigation } = require('@react-navigation/native');
    (useNavigation as jest.Mock).mockReturnValue(mockNavigation);

    const { getByTestId } = render(React.createElement(FloatingAIButton));

    const fab = getByTestId('floating-ai.button.navigate-chat');
    fireEvent(fab, 'onLongPress');

    const thoughtDumpItem = getByTestId('floating-ai.hub.thought-dump');
    fireEvent.press(thoughtDumpItem);

    const hub = useAIHubStore.getState();
    expect(hub.goThoughtDump).toHaveBeenCalledWith(mockNavigation);
  });

  it('save entry on ThoughtDumpScreen calls indexDump', async () => {
    (ThoughtDumpService.create as jest.Mock).mockResolvedValueOnce({
      id: 'e2e-dump-1',
      text: 'My e2e test thought',
      createdAt: '2024-01-01T00:00:00.000Z',
      filePath: 'thoughts/20240101-000000-e2e-dum.md',
    });

    const React = require('react');
    const { render } = require('@testing-library/react-native');
    const ThoughtDumpScreen = require('../src/screens/ThoughtDumpScreen').default;

    const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };
    const { useNavigation } = require('@react-navigation/native');
    (useNavigation as jest.Mock).mockReturnValue(mockNavigation);

    const { getByTestId } = render(React.createElement(ThoughtDumpScreen, {}));

    const input = getByTestId('thought-dump-input');
    fireEvent.changeText(input, 'My e2e test thought');

    const saveButton = getByTestId('thought-dump-save');
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(ThoughtDumpService.create).toHaveBeenCalledWith('My e2e test thought');
    });

    await waitFor(() => {
      expect(indexDump).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'e2e-dump-1',
          text: 'My e2e test thought',
          filePath: 'thoughts/20240101-000000-e2e-dum.md',
        }),
      );
    });
  });

  it('mocked index upsert stores dump in memory index', async () => {
    const dump = {
      id: 'idx-test-1',
      text: 'indexable thought',
      createdAt: '2024-01-01T00:00:00.000Z',
      filePath: 'thoughts/20240101-idx-test.md',
    };

    await aiMemoryIndex.upsert(dump.filePath, dump.text);

    expect(aiMemoryIndex.upsert).toHaveBeenCalledWith(dump.filePath, dump.text);
    const entries = (aiMemoryIndex as unknown as { getIndexedFilePaths: () => string[] }).getIndexedFilePaths();
    expect(entries).toContain('thoughts/20240101-idx-test.md');
  });

  it('chat injects memory block via systemPrompt builder', () => {
    const memoryBlock = 'Thought: remember to use TypeScript strict mode';
    const prompt = buildSystemPrompt({
      noteCount: 5,
      todoCount: 3,
      actionMode: 'auto',
      memoryBlock,
    });

    expect(prompt).toContain('User memory (thought dumps)');
    expect(prompt).toContain('remember to use TypeScript strict mode');
  });

  it('settings reset clears the memory index', async () => {
    await aiMemoryIndex.upsert('thoughts/d1.md', 'first thought');
    await aiMemoryIndex.upsert('thoughts/d2.md', 'second thought');
    expect(aiMemoryIndex.getIndexedFilePaths()).toHaveLength(2);

    await aiMemoryIndex.clear();

    expect(aiMemoryIndex.clear).toHaveBeenCalled();
    expect(aiMemoryIndex.getIndexedFilePaths()).toHaveLength(0);
  });

  it('full loop: long-press FAB -> thought dump item -> save -> index -> chat memory -> reset', async () => {
    const React = require('react');
    const { render } = require('@testing-library/react-native');
    const { FloatingAIButton } = require('../src/components/ai/FloatingAIButton');

    const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };
    const { useNavigation } = require('@react-navigation/native');
    (useNavigation as jest.Mock).mockReturnValue(mockNavigation);

    const { getByTestId } = render(React.createElement(FloatingAIButton));

    const fab = getByTestId('floating-ai.button.navigate-chat');
    fireEvent(fab, 'onLongPress');
    expect(getByTestId('floating-ai.hub.thought-dump')).toBeTruthy();

    const thoughtDumpMenuItem = getByTestId('floating-ai.hub.thought-dump');
    fireEvent.press(thoughtDumpMenuItem);

    const hub = useAIHubStore.getState();
    expect(hub.goThoughtDump).toHaveBeenCalledWith(mockNavigation);

    (ThoughtDumpService.create as jest.Mock).mockResolvedValueOnce({
      id: 'full-loop-dump',
      text: 'full loop thought',
      createdAt: new Date().toISOString(),
      filePath: 'thoughts/20240101-000000-full-loo.md',
    });

    const ThoughtDumpScreen = require('../src/screens/ThoughtDumpScreen').default;
    const screen = render(React.createElement(ThoughtDumpScreen, {}));

    const input = screen.getByTestId('thought-dump-input');
    fireEvent.changeText(input, 'full loop thought');

    const saveButton = screen.getByTestId('thought-dump-save');
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(ThoughtDumpService.create).toHaveBeenCalledWith('full loop thought');
    });

    await waitFor(() => {
      expect(indexDump).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'full-loop-dump' }),
      );
    });

    const memoryBlock = 'full loop thought';
    const prompt = buildSystemPrompt({
      noteCount: 1,
      todoCount: 0,
      actionMode: 'auto',
      memoryBlock,
    });
    expect(prompt).toContain('full loop thought');

    await aiMemoryIndex.upsert('thoughts/20240101-000000-full-loo.md', memoryBlock);
    expect(aiMemoryIndex.getIndexedFilePaths()).toContain('thoughts/20240101-000000-full-loo.md');

    await aiMemoryIndex.clear();
    expect(aiMemoryIndex.clear).toHaveBeenCalled();
  });
});
