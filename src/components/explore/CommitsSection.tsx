import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/text';
import { Button, ButtonText } from '@/components/ui/Button';
import { FlatList } from '@/components/ui/flat-list';
import * as GitEngine from '@/services/git/engine/GitEngine';
import type { CommitInfo } from '@/services/git/engine/GitEngine';
import type { RootStackParamList } from '@/navigation/types';
import { relativeTime, type SectionProps } from './exploreShared';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function CommitsSection({ repo, active }: SectionProps) {
  const navigation = useNavigation<NavigationProp>();
  const [commits, setCommits] = useState<CommitInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCommits(await GitEngine.log(repo.localPath, 100));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [repo.localPath]);

  useFocusEffect(
    useCallback(() => {
      if (active) void load();
    }, [active, load]),
  );

  const renderItem = useCallback(
    ({ item }: { item: CommitInfo }) => (
      <Pressable
        onPress={() => navigation.navigate('ExploreCommit', { repoId: repo.id, commitId: item.id })}
        accessibilityRole="button"
        testID={`explore.commit.${item.shortId}`}
        className="mx-4 mb-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5"
      >
        <View className="flex-row items-center gap-2">
          <View className="rounded bg-gray-800 px-1.5 py-0.5">
            <Text className="text-[10px] font-mono text-white">{item.shortId}</Text>
          </View>
          {(item.parentCount ?? 0) > 1 && (
            <View className="rounded bg-violet-100 px-1.5 py-0.5">
              <Text className="text-[10px] font-semibold text-violet-700">merge</Text>
            </View>
          )}
          <Text className="text-[11px] text-gray-500">{relativeTime((item.authorTime ?? 0) * 1000)}</Text>
        </View>
        <Text className="mt-1 text-sm font-semibold text-black" numberOfLines={2}>
          {item.summary || '(no message)'}
        </Text>
        <Text className="mt-0.5 text-[11px] text-gray-500" numberOfLines={1}>
          {item.authorName} &lt;{item.authorEmail}&gt;
        </Text>
      </Pressable>
    ),
    [navigation, repo.id],
  );

  if (error) {
    return (
      <View className="items-center px-8 py-10">
        <Ionicons name="warning-outline" size={36} color="#dc2626" />
        <Text className="mt-2 text-center text-sm text-red-600">{error}</Text>
        <Button variant="outline" size="sm" className="mt-3" onPress={() => void load()}>
          <ButtonText>Retry</ButtonText>
        </Button>
      </View>
    );
  }

  return (
    <FlatList
      data={commits ?? []}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={{ paddingTop: 10, paddingBottom: 96 }}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor="#7b8cde" />
      }
      ListHeaderComponent={
        <View className="flex-row items-center justify-between px-4 pb-2">
          <Text className="text-xs text-gray-500" testID="explore.commits.count">
            {commits ? `${commits.length} commit(s)` : 'Reading history…'}
          </Text>
          {loading && <ActivityIndicator size="small" color="#7b8cde" />}
        </View>
      }
      ListEmptyComponent={
        !loading ? (
          <View className="items-center px-8 py-10" testID="explore.commits.empty">
            <Ionicons name="time-outline" size={40} color="#9ca3af" />
            <Text className="mt-2 text-center text-sm text-gray-500">No commits yet.</Text>
          </View>
        ) : undefined
      }
      testID="explore.commits.list"
    />
  );
}
