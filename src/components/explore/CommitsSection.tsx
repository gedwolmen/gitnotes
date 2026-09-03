import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/text';
import { Button, ButtonText } from '@/components/ui/Button';
import { FlatList } from '@/components/ui/flat-list';
import * as GitEngine from '@/services/git/engine/GitEngine';
import type { CommitInfo } from '@/services/git/engine/GitEngine';
import { GitFsService } from '@/services/git/GitFsService';
import { Toast, ToastDescription, ToastTitle, useToast } from '@/components/ui/toast';
import type { RootStackParamList } from '@/navigation/types';
import { relativeTime, type SectionProps } from './exploreShared';
import { useTokens } from '@/contexts/ThemeContext';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function CommitsSection({ repo, active, chromeTopInset = 0 }: SectionProps) {
  const navigation = useNavigation<NavigationProp>();
  const toast = useToast();
  const { colors } = useTokens();
  const [commits, setCommits] = useState<CommitInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notCloned, setNotCloned] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotCloned(false);
    try {
      const cloned = await GitFsService.isCloned({ repoPath: repo.path });
      if (!cloned) {
        setNotCloned(true);
        setLoading(false);
        return;
      }
      setCommits(await GitEngine.log(repo.localPath, 100));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [repo.localPath, repo.path]);

  const handlePush = useCallback(async () => {
    if (loading || pushing) return;
    setPushing(true);
    try {
      const result = await GitEngine.pushWithIntegrate(repo.localPath, 'origin', repo.branch ?? 'main');
      if (result.kind === 'Conflicts') {
        const paths = result.conflicts.map((c: { path: string }) => c.path).join(', ');
        Alert.alert(
          'Merge Conflicts',
          `The push diverged with conflicts in: ${paths || 'unknown files'}. Resolve them in the Conflicts section.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Resolve',
              onPress: () => navigation.navigate('ExploreConflict', { repoId: repo.id }),
            },
          ],
        );
      } else if (result.pushed) {
        toast.show({
          placement: 'top',
          duration: 4200,
          render: ({ id }: { id: string }) => (
            <Toast action="success" nativeID={`commits-push-toast-${id}`}>
              <ToastTitle>Pushed</ToastTitle>
              <ToastDescription>{result.message}</ToastDescription>
            </Toast>
          ),
        });
        await load();
      } else {
        toast.show({
          placement: 'top',
          duration: 4200,
          render: ({ id }: { id: string }) => (
            <Toast action="error" nativeID={`commits-push-toast-${id}`}>
              <ToastTitle>Push failed</ToastTitle>
              <ToastDescription>{result.message}</ToastDescription>
            </Toast>
          ),
        });
      }
    } catch (caught) {
      toast.show({
        placement: 'top',
        duration: 4200,
        render: ({ id }: { id: string }) => (
          <Toast action="error" nativeID={`commits-push-toast-${id}`}>
            <ToastTitle>Push failed</ToastTitle>
            <ToastDescription>{caught instanceof Error ? caught.message : String(caught)}</ToastDescription>
          </Toast>
        ),
      });
    } finally {
      setPushing(false);
    }
  }, [loading, pushing, repo.localPath, repo.branch, repo.id, navigation, toast]);

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
        className="mx-4 mb-2 rounded-lg px-3 py-2.5"
        style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}
      >
        <View className="flex-row items-center gap-2">
          <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: colors.elevated }}>
            <Text className="text-[10px] font-mono" style={{ color: colors.text }}>{item.shortId}</Text>
          </View>
          {(item.parentCount ?? 0) > 1 && (
            <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: `${colors.accent}26` }}>
              <Text className="text-[10px] font-semibold" style={{ color: colors.accent }}>merge</Text>
            </View>
          )}
          <Text className="text-[11px]" style={{ color: colors.textSecondary }}>{relativeTime((item.authorTime ?? 0) * 1000)}</Text>
        </View>
        <Text className="mt-1 text-sm font-semibold" style={{ color: colors.text }} numberOfLines={2}>
          {item.summary || '(no message)'}
        </Text>
        <Text className="mt-0.5 text-[11px]" style={{ color: colors.textSecondary }} numberOfLines={1}>
          {item.authorName} &lt;{item.authorEmail}&gt;
        </Text>
      </Pressable>
    ),
    [navigation, repo.id],
  );

  if (error) {
    return (
      <View className="items-center px-8 py-10">
        <Ionicons name="warning-outline" size={36} color={colors.error} />
        <Text className="mt-2 text-center text-sm" style={{ color: colors.error }}>{error}</Text>
        <Button variant="outline" size="sm" className="mt-3" onPress={() => void load()}>
          <ButtonText>Retry</ButtonText>
        </Button>
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

  return (
    <FlatList className="flex-1"
      data={commits ?? []}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={{ paddingTop: chromeTopInset, paddingBottom: 96, flexGrow: 1 }}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} />
      }
      ListHeaderComponent={
        <View className="flex-row items-center justify-between px-4 pb-2">
          <Text className="text-xs" style={{ color: colors.textSecondary }} testID="explore.commits.count">
            {commits ? `${commits.length} commit(s)` : 'Reading history…'}
          </Text>
          <View className="flex-row items-center gap-2">
            {loading || pushing ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Pressable
                onPress={() => void handlePush()}
                disabled={pushing}
                accessibilityRole="button"
                accessibilityLabel="Push all commits"
                className="rounded px-2 py-1"
                style={{ backgroundColor: colors.primary }}
              >
                <Text className="text-xs font-semibold" style={{ color: '#fff' }}>Push</Text>
              </Pressable>
            )}
          </View>
        </View>
      }
        ListEmptyComponent={
          !loading ? (
            <View className="flex-1 items-center justify-center" style={{ minHeight: 240 }} testID="explore.commits.empty">
              <Ionicons name="time-outline" size={40} color={colors.textSecondary} />
              <Text className="mt-2 text-center text-sm" style={{ color: colors.textSecondary }}>No commits yet.</Text>
            </View>
          ) : undefined
        }
      testID="explore.commits.list"
    />
  );
}
