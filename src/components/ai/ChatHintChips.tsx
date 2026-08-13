import { TouchableOpacity, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTokens } from '../../contexts/ThemeContext';

type Hint = {
  icon: 'search-outline' | 'globe-outline' | 'add-circle-outline' | 'git-branch-outline';
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
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing[2],
        marginTop: spacing[4],
        justifyContent: 'center',
      }}
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
    </View>
  );
}
