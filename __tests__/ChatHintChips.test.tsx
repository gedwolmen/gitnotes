import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ChatHintChips } from '../src/components/ai/ChatHintChips';

jest.mock('react-i18next', () => {
  const translations: Record<string, string> = {
    'chat.hints.summarizeIssues': 'Summarize my open issues',
    'chat.hints.showRepos': 'Show my repos',
    'chat.hints.createIssue': 'Create an issue',
    'chat.hints.listPRs': 'List open PRs',
    'chat.hints.askAboutNotes': 'Ask about my notes',
    'chat.hints.createQuiz': 'Create a quiz',
    'chat.hints.gradeAnswers': 'Grade my answers',
    'chat.hints.searchEverything': 'Search everything',
    'chat.hints.summarizeTopic': 'Summarize a topic',
  };
  return {
    useTranslation: () => ({
      t: (key: string, options?: { defaultValue?: string }) =>
        translations[key] ?? options?.defaultValue ?? key,
      i18n: { changeLanguage: jest.fn() },
    }),
    initReactI18next: { type: '3rdParty', init: jest.fn() },
  };
});

jest.mock('../src/contexts/ThemeContext', () => ({
  useTokens: () => ({
    colors: {
      surface: '#f4f4f4',
      border: '#dddddd',
      accent: '#8b5cf6',
      text: '#111111',
    },
    spacing: { 1: 4, 2: 8, 3: 12, 4: 16 },
    radii: { pill: 999 },
    type: { sm: 14 },
  }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

const HINT_CASES = [
  {
    testID: 'chat.hint.summarize-issues',
    label: 'Summarize my open issues',
    prompt: 'Summarize my open GitHub issues across all repos',
  },
  {
    testID: 'chat.hint.show-repos',
    label: 'Show my repos',
    prompt: 'List all my GitHub repositories',
  },
  {
    testID: 'chat.hint.create-issue',
    label: 'Create an issue',
    prompt: 'Help me create a new GitHub issue',
  },
  {
    testID: 'chat.hint.list-prs',
    label: 'List open PRs',
    prompt: 'List my open pull requests across all repos',
  },
  {
    testID: 'chat.hint.ask-about-notes',
    label: 'Ask about my notes',
    prompt: 'What notes have I written about [topic]?',
  },
  {
    testID: 'chat.hint.create-quiz',
    label: 'Create a quiz',
    prompt: 'Make me a questioner note on: my recent reading notes',
  },
  {
    testID: 'chat.hint.grade-answers',
    label: 'Grade my answers',
    prompt: 'Grade my most recent questioner note',
  },
  {
    testID: 'chat.hint.search-everything',
    label: 'Search everything',
    prompt: 'Find notes and todos mentioning [X] across my repo',
  },
  {
    testID: 'chat.hint.summarize-topic',
    label: 'Summarize a topic',
    prompt: 'Summarize all my notes on [topic] into one note',
  },
] as const;

describe('ChatHintChips', () => {
  test('renders 9 hint chips total with their translated labels', () => {
    const { getByText, getAllByTestId } = render(<ChatHintChips onPressHint={jest.fn()} />);

    expect(getAllByTestId(/^chat\.hint\./)).toHaveLength(9);
    for (const hint of HINT_CASES) {
      expect(getByText(hint.label)).toBeTruthy();
    }
  });

  test('lays chips out in a horizontal ScrollView', () => {
    const { getByTestId } = render(<ChatHintChips onPressHint={jest.fn()} />);

    expect(getByTestId('chat-hints-scroller')).toHaveProp('horizontal', true);
  });

  test.each(HINT_CASES.map(({ label, prompt }) => ({ label, prompt })))(
    'tapping "$label" fires onPressHint once with the prompt "$prompt"',
    ({ label, prompt }) => {
      const onPressHint = jest.fn();
      const { getByText } = render(<ChatHintChips onPressHint={onPressHint} />);

      fireEvent.press(getByText(label));

      expect(onPressHint).toHaveBeenCalledTimes(1);
      expect(onPressHint).toHaveBeenCalledWith(prompt);
    },
  );
});
