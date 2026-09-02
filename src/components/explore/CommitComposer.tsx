import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/text';
import { Heading } from '@/components/ui/heading';
import { Button, ButtonText } from '@/components/ui/Button';
import { Input, InputField } from '@/components/ui/Input';
import { Textarea, TextareaInput } from '@/components/ui/textarea';
import * as GitEngine from '@/services/git/engine/GitEngine';
import { useActiveAccount } from '@/hooks/useAccounts';
import type { RepoLike } from './exploreShared';

const MESSAGE_PLACEHOLDER = 'feat: what changed? (conventional commit)';

interface CommitComposerProps {
  repo: RepoLike;
  /** Every path with any working-tree change (staged + unstaged), for "Stage all". */
  changedPaths: string[];
  stagedCount: number;
  /** Reload section data + refresh the shell header after a commit lands. */
  onCommitted: () => void;
}

export function CommitComposer({ repo, changedPaths, stagedCount, onCommitted }: CommitComposerProps) {
  const { activeAccount } = useActiveAccount();
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
          await GitEngine.stage(repo.path, changedPaths);
        }
        const commit = await GitEngine.commit(repo.path, message.trim(), {
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
    [validate, changedPaths, repo.path, message, authorName, authorEmail, onCommitted],
  );

  const nothingToStageAll = changedPaths.length === 0;
  const nothingStaged = stagedCount === 0;

  return (
    <View className="border-t border-gray-200 bg-gray-50 px-4 pb-4 pt-3" testID="explore.commit-composer">
      <View className="flex-row items-center gap-2">
        <Ionicons name="git-commit-outline" size={16} color="#4f46e5" />
        <Heading className="text-base">Commit</Heading>
        {stagedCount > 0 && (
          <View className="rounded bg-indigo-100 px-1.5 py-0.5" testID="explore.commit-composer.staged-count">
            <Text className="text-[10px] font-semibold text-indigo-700">{stagedCount} staged</Text>
          </View>
        )}
      </View>

      <Textarea className="mt-2 bg-white" testID="explore.commit-composer.message">
        <TextareaInput
          value={message}
          onChangeText={setMessage}
          placeholder={MESSAGE_PLACEHOLDER}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Commit message"
          testID="explore.commit-composer.message.input"
        />
      </Textarea>

      <View className="mt-2 flex-row gap-2">
        <Input className="flex-1 bg-white">
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
        </Input>
        <Input className="flex-1 bg-white">
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
        </Input>
      </View>

      {error && (
        <Text className="mt-2 text-xs text-red-600" testID="explore.commit-composer.error">
          {error}
        </Text>
      )}
      {success && (
        <Text className="mt-2 text-xs text-emerald-700" testID="explore.commit-composer.success">
          {success}
        </Text>
      )}

      <View className="mt-3 flex-row gap-2">
        <Button
          className="flex-1"
          size="sm"
          disabled={busy !== null || (nothingToStageAll && nothingStaged)}
          onPress={() => void runCommit('stageAll')}
          testID="explore.commit-composer.stage-all-commit"
        >
          {busy === 'stageAll' ? <ActivityIndicator size="small" color="#ffffff" /> : null}
          <ButtonText>Stage all + Commit</ButtonText>
        </Button>
        <Button
          className="flex-1"
          variant="outline"
          size="sm"
          disabled={busy !== null || nothingStaged}
          onPress={() => void runCommit('commit')}
          testID="explore.commit-composer.commit"
        >
          {busy === 'commit' ? <ActivityIndicator size="small" color="#4f46e5" /> : null}
          <ButtonText>Commit staged</ButtonText>
        </Button>
      </View>
    </View>
  );
}
