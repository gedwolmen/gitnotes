import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/text';
import { Button, ButtonText } from '@/components/ui/Button';
import * as GitEngine from '@/services/git/engine/GitEngine';
import type { ConflictEntry } from '@/services/git/engine/GitEngine';
import { GitFsService } from '@/services/git/GitFsService';
import type { RootStackParamList } from '@/navigation/types';
import type { SectionProps } from './exploreShared';
import { useTokens } from '@/contexts/ThemeContext';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const POLL_MS = 4000;

/**
 * Conflicts section of the Explore shell (todo 23): polls the engine index
 * for `index.conflicts()` entries left by push-with-integrate (todo 20) and
 * routes resolution into the existing ExploreConflictScreen (todo 21).
 */
export function ConflictsSection({ repo, active, chromeTopInset = 0 }: SectionProps) {
  const navigation = useNavigation<NavigationProp>();
  const focused = useIsFocused();
  const { colors } = useTokens();
  const [entries, setEntries] = useState<ConflictEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notCloned, setNotCloned] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const cloned = await GitFsService.isCloned({ repoPath: repo.path });
      if (!cloned) {
        setNotCloned(true);
        setLoading(false);
        return;
      }
      setEntries(await GitEngine.conflicts(repo.localPath));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [repo.localPath]);

  useEffect(() => {
    if (!active || !focused) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return undefined;
    }
    setLoading(true);
    void load();
    timerRef.current = setInterval(() => void load(), POLL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [active, focused, load]);

  if (error) {
    return (
      <View className="items-center px-8 py-10">
        <Ionicons name="warning-outline" size={36} color={colors.error} />
        <Text className="mt-2 text-center text-sm" style={{ color: colors.error }}>{error}</Text>
      </View>
    );
  }

  if (notCloned) {
    return (
      <View className="items-center px-8 py-10">
        <Ionicons name="folder-outline" size={36} color={colors.textSecondary} />
        <Text className="mt-2 text-center text-sm font-semibold" style={{ color: colors.text }}>Clone required</Text>
        <Text className="mt-1 text-center text-xs" style={{ color: colors.textSecondary }}>
          This repository has not been cloned to this device yet.
        </Text>
      </View>
    );
  }

  const hasConflicts = (entries?.length ?? 0) > 0;

  return (
    <View className="px-4" style={{ paddingTop: chromeTopInset }}>
      {loading && entries === null ? (
        <View className="items-center py-10">
          <ActivityIndicator size="small" color={colors.accent} />
          <Text className="mt-2 text-sm" style={{ color: colors.textSecondary }}>Checking for conflicts…</Text>
        </View>
      ) : hasConflicts ? (
        <View className="rounded-lg p-4" style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }} testID="explore.conflicts.card">
          <View className="flex-row items-center gap-2">
            <Ionicons name="warning-outline" size={20} color={colors.error} />
            <Text className="text-sm font-bold" style={{ color: colors.text }}>
              {entries?.length} conflicted file(s)
            </Text>
          </View>
          <Text className="mt-2 text-xs" style={{ color: colors.textSecondary }}>
            A push-with-integrate (or pull) left merge conflicts in the index. Resolve each
            file in the unified editor, then commit the merge.
          </Text>
          <Button
            className="mt-3"
            onPress={() => navigation.navigate('ExploreConflict', { repoId: repo.id })}
            testID="explore.conflicts.open"
          >
            <ButtonText>Open conflict resolution</ButtonText>
          </Button>
        </View>
      ) : (
        <View className="items-center py-10" testID="explore.conflicts.empty">
          <Ionicons name="checkmark-circle-outline" size={44} color={colors.accent} />
          <Text className="mt-2 text-sm font-semibold" style={{ color: colors.text }}>No conflicts</Text>
          <Text className="mt-1 text-center text-xs" style={{ color: colors.textSecondary }}>
            When a push is rejected and integrating produces conflicts, they appear here
            for resolution.
          </Text>
        </View>
      )}
    </View>
  );
}
