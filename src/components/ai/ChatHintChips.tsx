import { ScrollView, TouchableOpacity, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTokens } from '../../contexts/ThemeContext';

type Hint = {
  icon:
    | 'search-outline'
    | 'globe-outline'
    | 'add-circle-outline'
    | 'git-branch-outline'
    | 'document-text-outline'
    | 'help-circle-outline'
    | 'checkmark-circle-outline'
    | 'search-circle-outline'
    | 'list-outline';
  labelKey: string;
  labelDefault: string;
  prompt: string;
  testID: string;
};

const HINTS: Hint[] = [
  {
    icon: 'search-outline',
    labelKey: 'chat.hints.summarizeIssues',
    labelDefault: 'Summarize my open issues',
    prompt: 'Summarize my open GitHub issues across all repos',
    testID: 'chat.hint.summarize-issues',
  },
  {
    icon: 'globe-outline',
    labelKey: 'chat.hints.showRepos',
    labelDefault: 'Show my repos',
    prompt: 'List all my GitHub repositories',
    testID: 'chat.hint.show-repos',
  },
  {
    icon: 'add-circle-outline',
    labelKey: 'chat.hints.createIssue',
    labelDefault: 'Create an issue',
    prompt: 'Help me create a new GitHub issue',
    testID: 'chat.hint.create-issue',
  },
  {
    icon: 'git-branch-outline',
    labelKey: 'chat.hints.listPRs',
    labelDefault: 'List open PRs',
    prompt: 'List my open pull requests across all repos',
    testID: 'chat.hint.list-prs',
  },
  {
    icon: 'document-text-outline',
    labelKey: 'chat.hints.askAboutNotes',
    labelDefault: 'Ask about my notes',
    prompt: 'What notes have I written about [topic]?',
    testID: 'chat.hint.ask-about-notes',
  },
  {
    icon: 'help-circle-outline',
    labelKey: 'chat.hints.createQuiz',
    labelDefault: 'Create a quiz',
    prompt: 'Make me a questioner note on: my recent reading notes',
    testID: 'chat.hint.create-quiz',
  },
  {
    icon: 'checkmark-circle-outline',
    labelKey: 'chat.hints.gradeAnswers',
    labelDefault: 'Grade my answers',
    prompt: 'Grade my most recent questioner note',
    testID: 'chat.hint.grade-answers',
  },
  {
    icon: 'search-circle-outline',
    labelKey: 'chat.hints.searchEverything',
    labelDefault: 'Search everything',
    prompt: 'Find notes and todos mentioning [X] across my repo',
    testID: 'chat.hint.search-everything',
  },
  {
    icon: 'list-outline',
    labelKey: 'chat.hints.summarizeTopic',
    labelDefault: 'Summarize a topic',
    prompt: 'Summarize all my notes on [topic] into one note',
    testID: 'chat.hint.summarize-topic',
  },
];

export interface ChatHintChipsProps {
  onPressHint: (text: string) => void;
}

export function ChatHintChips({ onPressHint }: ChatHintChipsProps) {
  const { t } = useTranslation();
  const { colors, spacing, radii, type } = useTokens();

  return (
    <View
      style={{
        marginTop: spacing[4],
        alignSelf: 'stretch',
      }}
    >
      <ScrollView
        testID="chat-hints-scroller"
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: spacing[2], paddingHorizontal: spacing[2] }}
      >
        {HINTS.map((hint) => (
          <TouchableOpacity
            key={hint.testID}
            testID={hint.testID}
            accessibilityLabel={hint.labelDefault}
            accessibilityRole="button"
            onPress={() => onPressHint(hint.prompt)}
            activeOpacity={0.7}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing[1],
              paddingHorizontal: spacing[3],
              paddingVertical: spacing[2],
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radii.pill,
            }}
          >
            <Ionicons name={hint.icon} size={14} color={colors.accent} />
            <Text style={{ color: colors.text, fontSize: type.sm, fontWeight: '500' }}>
              {t(hint.labelKey, { defaultValue: hint.labelDefault })}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
