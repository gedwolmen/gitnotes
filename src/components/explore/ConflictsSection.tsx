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

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const POLL_MS = 4000;

/**
 * Conflicts section of the Explore shell (todo 23): polls the engine index
 * for `index.conflicts()` entries left by push-with-integrate (todo 20) and
 * routes resolution into the existing ExploreConflictScreen (todo 21).
 */
export function ConflictsSection({ repo, active }: SectionProps) {
  const navigation = useNavigation<NavigationProp>();
  const focused = useIsFocused();
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
        <Ionicons name="warning-outline" size={36} color="#dc2626" />
        <Text className="mt-2 text-center text-sm text-red-600">{error}</Text>
      </View>
    );
  }

  if (notCloned) {
    return (
      <View className="items-center px-8 py-10">
        <Ionicons name="folder-outline" size={36} color="#9ca3af" />
        <Text className="mt-2 text-center text-sm font-semibold text-gray-700">Clone required</Text>
        <Text className="mt-1 text-center text-xs text-gray-500">
          This repository has not been cloned to this device yet.
        </Text>
      </View>
    );
  }

  const hasConflicts = (entries?.length ?? 0) > 0;

  return (
    <View className="px-4 pt-4">
      {loading && entries === null ? (
        <View className="items-center py-10">
          <ActivityIndicator size="small" color="#7b8cde" />
          <Text className="mt-2 text-sm text-gray-500">Checking for conflicts…</Text>
        </View>
      ) : hasConflicts ? (
        <View className="rounded-lg border border-red-200 bg-red-50 p-4" testID="explore.conflicts.card">
          <View className="flex-row items-center gap-2">
            <Ionicons name="warning-outline" size={20} color="#dc2626" />
            <Text className="text-sm font-bold text-red-700">
              {entries?.length} conflicted file(s)
            </Text>
          </View>
          <Text className="mt-2 text-xs text-red-600">
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
          <Ionicons name="checkmark-circle-outline" size={44} color="#22c55e" />
          <Text className="mt-2 text-sm font-semibold text-black">No conflicts</Text>
          <Text className="mt-1 text-center text-xs text-gray-500">
            When a push is rejected and integrating produces conflicts, they appear here
            for resolution.
          </Text>
        </View>
      )}
    </View>
  );
}
