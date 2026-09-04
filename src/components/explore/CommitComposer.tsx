import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/text';
import { Heading } from '@/components/ui/heading';
import { Button, ButtonText } from '@/components/ui/Button';
import { InputField } from '@/components/ui/Input';
import { TextareaInput } from '@/components/ui/textarea';
import * as GitEngine from '@/services/git/engine/GitEngine';
import { useAccounts } from '@/contexts/AccountsContext';
import type { RepoLike } from './exploreShared';
import { useTokens } from '@/contexts/ThemeContext';

const MESSAGE_PLACEHOLDER = 'feat: what changed? (conventional commit)';

interface CommitComposerProps {
  repo: RepoLike;
  /** Every path with any working-tree change (staged + unstaged), for "Stage all". */
  changedPaths: string[];
  stagedCount: number;
  /** Reload section data + refresh the shell header after a commit lands. */
  onCommitted: () => void;
  embedded?: boolean;
}

export function CommitComposer({ repo, changedPaths, stagedCount, onCommitted, embedded = false }: CommitComposerProps) {
  const { accounts, activeAccountId } = useAccounts();
  const activeAccount = accounts.find((account) => account.id === activeAccountId) ?? null;
  const { colors } = useTokens();
  const [message, setMessage] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [authorEmail, setAuthorEmail] = useState('');
  const [authorTouched, setAuthorTouched] = useState(false);
  const [busy, setBusy] = useState<'stageAll' | 'commit' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!activeAccount || authorTouched) return;
    setAuthorName(activeAccount.name);
    setAuthorEmail(activeAccount.email ?? '');
  }, [activeAccount, authorTouched]);

  const validate = useCallback((): string | null => {
    if (message.trim().length === 0) return 'Enter a commit message first.';
    if (authorName.trim().length === 0 || authorEmail.trim().length === 0) {
      return 'Author name and email are required.';
    }
    return null;
  }, [message, authorName, authorEmail]);

  const runCommit = useCallback(
    async (mode: 'stageAll' | 'commit') => {
      setError(null);
      setSuccess(null);
      const validationError = validate();
      if (validationError) {
        setError(validationError);
        return;
      }
      setBusy(mode);
      try {
        if (mode === 'stageAll' && changedPaths.length > 0) {
          await GitEngine.stage(repo.localPath, changedPaths);
        }
        const commit = await GitEngine.commit(repo.localPath, message.trim(), {
          name: authorName.trim(),
          email: authorEmail.trim(),
        });
        setMessage('');
        setSuccess(`Committed ${commit.shortId} — ${commit.summary}`);
        onCommitted();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(null);
      }
    },
    [validate, changedPaths, repo.localPath, message, authorName, authorEmail, onCommitted],
  );

  const nothingToStageAll = changedPaths.length === 0;
  const nothingStaged = stagedCount === 0;

  return (
    <View
      style={embedded
        ? { backgroundColor: 'transparent', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, minWidth: 0 }
        : { borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, overflow: 'hidden', marginHorizontal: 16, marginVertical: 8, minWidth: 0 }}
      testID="explore.commit-composer"
    >
      <View className="flex-row items-center gap-2">
        <Ionicons name="git-commit-outline" size={14} color={colors.accent} />
        <Heading className="text-sm" style={{ color: colors.text }}>Commit</Heading>
        {stagedCount > 0 && (
          <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: `${colors.accent}26` }} testID="explore.commit-composer.staged-count">
            <Text className="text-[10px] font-semibold" style={{ color: colors.accent }}>{stagedCount} staged</Text>
          </View>
        )}
      </View>

      <View
        className="mt-3 flex-row items-start rounded-md"
        style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 8, minHeight: 92 }}
        testID="explore.commit-composer.message"
      >
        <TextareaInput
          value={message}
          onChangeText={setMessage}
          placeholder={MESSAGE_PLACEHOLDER}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Commit message"
          style={{ minHeight: 74, paddingVertical: 0 }}
          testID="explore.commit-composer.message.input"
        />
      </View>

      <View className="mt-3 gap-2">
        <View className="flex-row items-center rounded-md" style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 12, minHeight: 44 }}>
          <InputField
            value={authorName}
            onChangeText={(value) => {
              setAuthorTouched(true);
              setAuthorName(value);
            }}
            placeholder="Author name"
            accessibilityLabel="Author name"
            testID="explore.commit-composer.author-name"
          />
        </View>
        <View className="flex-row items-center rounded-md" style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 12, minHeight: 44 }}>
          <InputField
            value={authorEmail}
            onChangeText={(value) => {
              setAuthorTouched(true);
              setAuthorEmail(value);
            }}
            placeholder="author@email.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            accessibilityLabel="Author email"
            testID="explore.commit-composer.author-email"
          />
        </View>
      </View>

      {error && (
        <Text className="mt-2 text-xs" style={{ color: colors.error }} testID="explore.commit-composer.error">
          {error}
        </Text>
      )}
      {success && (
        <Text className="mt-2 text-xs" style={{ color: colors.accent }} testID="explore.commit-composer.success">
          {success}
        </Text>
      )}

      <View className="mt-4 gap-2">
        <Button
          fullWidth
          variant="primary"
          disabled={busy !== null || (nothingToStageAll && nothingStaged)}
          onPress={() => void runCommit('stageAll')}
          style={{ minHeight: 44 }}
          testID="explore.commit-composer.stage-all-commit"
        >
          {busy === 'stageAll' ? <ActivityIndicator size="small" color="#fff" /> : null}
          Stage all + Commit
        </Button>
        <Button
          fullWidth
          variant="outline"
          disabled={busy !== null || nothingStaged}
          onPress={() => void runCommit('commit')}
          style={{ minHeight: 44 }}
          testID="explore.commit-composer.commit"
        >
          {busy === 'commit' ? <ActivityIndicator size="small" color={colors.text} /> : null}
          <ButtonText>Commit staged</ButtonText>
        </Button>
      </View>
    </View>
  );
}
