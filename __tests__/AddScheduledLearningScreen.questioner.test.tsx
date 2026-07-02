import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

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

jest.mock('@react-native/datetimepicker', () => () => null);

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('../src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: stableColors, isDark: false, tokens: { spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 }, type: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22 } } }),
  useTokens: () => ({ colors: stableColors, spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 }, type: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22 }, radii: { sm: 12, md: 18, lg: 24, pill: 999 }, style: 'flat' }),
  useScreenHeaderHeight: () => 56,
}));

const mockScheduleNotification = jest.fn(async () => 'notif-id');

jest.mock('../src/stores/scheduledLearningStore', () => {
  const createItem = jest.fn(async (input: any) => ({
    id: 'sl-new',
    ...input,
    isEnabled: true,
    lastGeneratedAt: null,
    dayLastGeneratedAt: {},
    questionerPrompts: input.questionerPrompts ?? [],
    questionerFolders: input.questionerFolders ?? [],
    questionerNoteFolder: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));
  const deleteItem = jest.fn(async () => true);
  const store = { createItem, deleteItem };
  (global as any).__mockScheduledLearningStore = store;
  const useStore: any = (selector: any) => selector(store);
  useStore.getState = () => store;
  return {
    useScheduledLearningStore: useStore,
  };
});

jest.mock('../src/stores/aiStore', () => ({
  useAIStore: (selector: any) =>
    selector({
      providers: [
        {
          isEnabled: true,
          models: [{ id: 'm1', name: 'Test Model' }],
        },
      ],
      selectedModelId: 'm1',
    }),
}));

jest.mock('../src/contexts/RepoContext', () => ({
  useRepos: () => ({
    repositories: [
      { id: 'r1', name: 'owner/repo-a', path: 'owner/repo-a' },
      { id: 'r2', name: 'owner/repo-b', path: 'owner/repo-b' },
    ],
    addRepository: jest.fn(),
    removeRepository: jest.fn(),
  }),
}));

jest.mock('../src/services/ScheduledLearningService', () => {
  const mockSchedule = jest.fn(async () => 'notif-id');
  const mockGenerate = jest.fn(async () => ({
    id: 'note-from-generate',
    title: 'mock note',
    content: 'content',
    tags: [],
    format: 'markdown',
    createdAt: 0,
    updatedAt: 0,
  }));
  (global as any).__mockScheduleNotification = mockSchedule;
  (global as any).__mockGenerateNow = mockGenerate;
  return {
    ScheduledLearningService: {
      scheduleNotification: mockSchedule,
      generateNow: mockGenerate,
    },
  };
});

jest.mock('../src/components/RepoFolderPickerModal', () => {
  const { View, Pressable, Text } = require('react-native');
  const ReactLib = require('react');
  return function MockRepoFolderPickerModal(props: any) {
    if (!props.visible) return null;
    return ReactLib.createElement(View, { testID: 'mock-repo-folder-picker' }, [
      ReactLib.createElement(Pressable, {
        key: 'pick-repo',
        testID: 'mock-pick-repo-a',
        onPress: () => props.onSelect('owner/repo-a', 'main', 'notes/math'),
      }, ReactLib.createElement(Text, null, 'Pick repo-a')),
      ReactLib.createElement(Pressable, {
        key: 'pick-second',
        testID: 'mock-pick-repo-b-folder',
        onPress: () => props.onSelect('owner/repo-b', 'main', 'notes/physics'),
      }, ReactLib.createElement(Text, null, 'Pick repo-b physics')),
      ReactLib.createElement(Pressable, {
        key: 'close',
        testID: 'mock-close',
        onPress: () => props.onClose(),
      }, ReactLib.createElement(Text, null, 'Close')),
    ]);
  };
});

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, canGoBack: () => true }),
}));

import { AddScheduledLearningScreen } from '../src/components/settings/AddScheduledLearningScreen';

beforeEach(() => {
  const __mc = (global as any).__mockScheduledLearningStore?.createItem as jest.Mock | undefined; if (__mc) __mc.mockClear();
  mockScheduleNotification.mockClear();
  mockGoBack.mockClear();
  const gen = (global as any).__mockGenerateNow as jest.Mock | undefined;
  if (gen) gen.mockClear();
  const del = (global as any).__mockScheduledLearningStore?.deleteItem as jest.Mock | undefined;
  if (del) del.mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

describe('AddScheduledLearningScreen questioner flows', () => {
  function setLearningTypeQuestioner(getAllByText: any) {
    fireEvent.press(getAllByText('Questioner Notes')[0]);
  }

  it('switches to questioner type and renders source options', () => {
    const { getAllByText } = render(<AddScheduledLearningScreen />);
    setLearningTypeQuestioner(getAllByText);
    expect(getAllByText('From Tags').length).toBeGreaterThan(0);
    expect(getAllByText('From Prompt').length).toBeGreaterThan(0);
    expect(getAllByText('From Note Folder').length).toBeGreaterThan(0);
  });

  it('supports multi-tag selection via the topic tag chips', () => {
    const { getByPlaceholderText, getByTestId, getAllByText } = render(
      <AddScheduledLearningScreen />,
    );
    const input = getByPlaceholderText('Add a topic tag...');
    fireEvent.changeText(input, 'react');
    fireEvent.press(getByTestId('add-tag-button'));
    fireEvent.changeText(input, 'typescript');
    fireEvent.press(getByTestId('add-tag-button'));
    fireEvent.changeText(input, 'jest');
    fireEvent.press(getByTestId('add-tag-button'));
    expect(getAllByText('react').length).toBeGreaterThan(0);
    expect(getAllByText('typescript').length).toBeGreaterThan(0);
    expect(getAllByText('jest').length).toBeGreaterThan(0);
  });

  it('supports multi-prompt input in questioner prompt source', () => {
    const { getByPlaceholderText, getByTestId, getByText } = render(
      <AddScheduledLearningScreen />,
    );
    fireEvent.press(getByText('Questioner Notes'));
    fireEvent.press(getByText('From Prompt'));
    const promptInput = getByPlaceholderText(
      'scheduledLearning.questioner.promptPlaceholder',
    );
    fireEvent.changeText(promptInput, '  Algebra basics  ');
    fireEvent.press(getByTestId('questioner-add-prompt'));
    fireEvent.changeText(promptInput, 'Geometry shapes');
    fireEvent.press(getByTestId('questioner-add-prompt'));
    expect(getByText('Algebra basics')).toBeTruthy();
    expect(getByText('Geometry shapes')).toBeTruthy();
  });

  it('removes a prompt when its chip is pressed', () => {
    const { getByPlaceholderText, getByTestId, getByText, queryByText } = render(
      <AddScheduledLearningScreen />,
    );
    fireEvent.press(getByText('Questioner Notes'));
    fireEvent.press(getByText('From Prompt'));
    const promptInput = getByPlaceholderText(
      'scheduledLearning.questioner.promptPlaceholder',
    );
    fireEvent.changeText(promptInput, 'Algebra basics');
    fireEvent.press(getByTestId('questioner-add-prompt'));
    expect(queryByText('Algebra basics')).toBeTruthy();
    fireEvent.press(getByTestId('questioner-prompt-0'));
    expect(queryByText('Algebra basics')).toBeNull();
  });

  it('opens the questioner folder picker and adds folders per repo', async () => {
    const { getByTestId, getByText, queryByText } = render(
      <AddScheduledLearningScreen />,
    );
    fireEvent.press(getByText('Questioner Notes'));
    fireEvent.press(getByText('From Note Folder'));
    fireEvent.press(getByTestId('questioner-pick-folder'));
    await act(async () => {
      fireEvent.press(getByTestId('mock-pick-repo-a'));
    });
    expect(queryByText('notes/math')).toBeTruthy();
    fireEvent.press(getByTestId('questioner-pick-folder'));
    await act(async () => {
      fireEvent.press(getByTestId('mock-pick-repo-b-folder'));
    });
    expect(queryByText('notes/physics')).toBeTruthy();
  });

  it('removes a folder when its chip is pressed', async () => {
    const { getByTestId, getByText, queryByText } = render(
      <AddScheduledLearningScreen />,
    );
    fireEvent.press(getByText('Questioner Notes'));
    fireEvent.press(getByText('From Note Folder'));
    fireEvent.press(getByTestId('questioner-pick-folder'));
    await act(async () => {
      fireEvent.press(getByTestId('mock-pick-repo-a'));
    });
    expect(queryByText('notes/math')).toBeTruthy();
    fireEvent.press(getByTestId('questioner-folder-0'));
    expect(queryByText('notes/math')).toBeNull();
  });

  it('blocks save when folder source has no folders selected', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { getByPlaceholderText, getByTestId, getByText } = render(
      <AddScheduledLearningScreen />,
    );
    fireEvent.changeText(getByPlaceholderText('Add a topic tag...'), 'topic');
    fireEvent.press(getByTestId('add-tag-button'));
    fireEvent.press(getByText('Questioner Notes'));
    fireEvent.press(getByText('From Note Folder'));
    await waitFor(() => {
      fireEvent.press(getByText('Add Schedule'));
    });
    expect(alertSpy).toHaveBeenCalledWith(
      'scheduledLearning.questioner.folderRequiredTitle',
      expect.any(String),
    );
    expect(((global as any).__mockScheduledLearningStore?.createItem as jest.Mock).mock.calls.length).toBe(0);
  });

  it('blocks save when prompt source has no prompts added', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { getByPlaceholderText, getByTestId, getByText } = render(
      <AddScheduledLearningScreen />,
    );
    fireEvent.changeText(getByPlaceholderText('Add a topic tag...'), 'topic');
    fireEvent.press(getByTestId('add-tag-button'));
    fireEvent.press(getByText('Questioner Notes'));
    fireEvent.press(getByText('From Prompt'));
    await waitFor(() => {
      fireEvent.press(getByText('Add Schedule'));
    });
    expect(alertSpy).toHaveBeenCalledWith(
      'scheduledLearning.questioner.promptRequiredTitle',
      expect.any(String),
    );
    expect(((global as any).__mockScheduledLearningStore?.createItem as jest.Mock).mock.calls.length).toBe(0);
  });

  it('persists multi prompts and multi folders to createItem on save', async () => {
    const { getByPlaceholderText, getByTestId, getByText } = render(
      <AddScheduledLearningScreen />,
    );
    fireEvent.changeText(getByPlaceholderText('Add a topic tag...'), 'topic');
    fireEvent.press(getByTestId('add-tag-button'));
    fireEvent.press(getByText('Questioner Notes'));
    fireEvent.press(getByText('From Prompt'));
    const promptInput = getByPlaceholderText(
      'scheduledLearning.questioner.promptPlaceholder',
    );
    fireEvent.changeText(promptInput, 'Algebra basics');
    fireEvent.press(getByTestId('questioner-add-prompt'));
    fireEvent.changeText(promptInput, 'Geometry shapes');
    fireEvent.press(getByTestId('questioner-add-prompt'));
    await waitFor(() => {
      fireEvent.press(getByText('Add Schedule'));
    });
    await waitFor(() => expect(((global as any).__mockScheduledLearningStore?.createItem as jest.Mock)).toHaveBeenCalled());
    const call = ((global as any).__mockScheduledLearningStore?.createItem as jest.Mock).mock.calls[0][0];
    expect(call.type).toBe('questioner');
    expect(call.questionerSource).toBe('prompt');
    expect(call.questionerPrompts).toEqual(['Algebra basics', 'Geometry shapes']);
  });

  it('persists multi folder selections to createItem on save', async () => {
    const { getByPlaceholderText, getByTestId, getByText } = render(
      <AddScheduledLearningScreen />,
    );
    fireEvent.changeText(getByPlaceholderText('Add a topic tag...'), 'topic');
    fireEvent.press(getByTestId('add-tag-button'));
    fireEvent.press(getByText('Questioner Notes'));
    fireEvent.press(getByText('From Note Folder'));
    fireEvent.press(getByTestId('questioner-pick-folder'));
    await act(async () => {
      fireEvent.press(getByTestId('mock-pick-repo-a'));
    });
    fireEvent.press(getByTestId('questioner-pick-folder'));
    await act(async () => {
      fireEvent.press(getByTestId('mock-pick-repo-b-folder'));
    });
    await waitFor(() => {
      fireEvent.press(getByText('Add Schedule'));
    });
    await waitFor(() => expect(((global as any).__mockScheduledLearningStore?.createItem as jest.Mock)).toHaveBeenCalled());
    const call = ((global as any).__mockScheduledLearningStore?.createItem as jest.Mock).mock.calls[0][0];
    expect(call.questionerSource).toBe('folder');
    expect(call.questionerFolders).toEqual([
      { repoPath: 'owner/repo-a', folderPath: 'notes/math' },
      { repoPath: 'owner/repo-b', folderPath: 'notes/physics' },
    ]);
  });

  it('generates the note immediately on save and schedules a reminder notification', async () => {
    // Reset mock call history from any previous test
    const mockSchedule = (global as any).__mockScheduleNotification as jest.Mock;
    const mockGenerate = (global as any).__mockGenerateNow as jest.Mock;
    mockSchedule.mockClear();
    mockGenerate.mockClear();

    const { getByPlaceholderText, getByTestId, getByText } = render(
      <AddScheduledLearningScreen />,
    );
    fireEvent.changeText(getByPlaceholderText('Add a topic tag...'), 'topic');
    fireEvent.press(getByTestId('add-tag-button'));
    fireEvent.press(getByText('Questioner Notes'));
    fireEvent.press(getByText('From Prompt'));
    const promptInput = getByPlaceholderText(
      'scheduledLearning.questioner.promptPlaceholder',
    );
    fireEvent.changeText(promptInput, 'Algebra basics');
    fireEvent.press(getByTestId('questioner-add-prompt'));

    await waitFor(() => {
      fireEvent.press(getByText('Add Schedule'));
    });

    await waitFor(() => expect(mockGenerate).toHaveBeenCalled());
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'questioner',
        questionerPrompts: ['Algebra basics'],
      }),
    );

    await waitFor(() => expect(mockSchedule).toHaveBeenCalled());
    const scheduleCall = mockSchedule.mock.calls[0];
    expect(scheduleCall[0]).toEqual(
      expect.objectContaining({
        type: 'questioner',
        questionerPrompts: ['Algebra basics'],
      }),
    );
    expect(scheduleCall[1]).toBe('note-from-generate');
  });

  it('surfaces an alert and lets the user delete the schedule if generation fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    alertSpy.mockClear();
    const mockGenerate = (global as any).__mockGenerateNow as jest.Mock;
    mockGenerate.mockClear();
    mockGenerate.mockResolvedValueOnce(null);
    const mockDelete = (global as any).__mockScheduledLearningStore.deleteItem as jest.Mock;
    mockDelete.mockClear();

    const { getByPlaceholderText, getByTestId, getByText } = render(
      <AddScheduledLearningScreen />,
    );
    fireEvent.changeText(getByPlaceholderText('Add a topic tag...'), 'topic');
    fireEvent.press(getByTestId('add-tag-button'));
    fireEvent.press(getByText('Questioner Notes'));
    fireEvent.press(getByText('From Prompt'));
    fireEvent.changeText(
      getByPlaceholderText('scheduledLearning.questioner.promptPlaceholder'),
      'Algebra basics',
    );
    fireEvent.press(getByTestId('questioner-add-prompt'));

    await waitFor(() => {
      fireEvent.press(getByText('Add Schedule'));
    });

    await waitFor(() => expect(alertSpy).toHaveBeenCalled(), { timeout: 3000 });
    const args = alertSpy.mock.calls[0];
    expect(args[0]).toBe('scheduledLearning.questioner.generateFailedTitle');
    expect(args[1]).toBe('scheduledLearning.questioner.generateFailedBody');
    const buttons = args[2] as Array<{ text: string; onPress?: () => void; style?: string }>;
    expect(buttons.length).toBe(2);
    expect(buttons[0].text).toBe('common.cancel');
    expect(buttons[1].text).toBe('common.delete');
    buttons[1].onPress?.();
    await waitFor(() => expect(mockDelete).toHaveBeenCalled());
  });
});