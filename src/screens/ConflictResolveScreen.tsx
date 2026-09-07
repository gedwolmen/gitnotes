import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/text';
import { Heading } from '@/components/ui/heading';
import { Button, ButtonText } from '@/components/ui/Button';
import * as GitEngine from '@/services/git/engine/GitEngine';
import type { ConflictBlobs } from '@/services/git/engine/GitEngine';
import { GitFsService } from '@/services/git/GitFsService';
import { useRepoStore } from '@/stores/repoStore';
import { useTokens } from '@/contexts/ThemeContext';
import type { RootStackParamList } from '@/navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ConflictResolve'>;

const PREVIEW_LINES = 20;

/** Per-file conflict resolution: shows ours / theirs / base blobs and lets
 * the user pick which version to keep as the resolved file. */
export default function ConflictResolveScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<Route>();
  const { colors } = useTokens();
  const { repoId, path } = route.params;

  const storedRepo = useRepoStore((state) =>
    state.repositories.find((candidate) => candidate.id === repoId),
  );

  let localPath: string | null = null;
  let fileUri: string | null = null;
  if (storedRepo) {
    try {
      localPath = GitFsService.workingTreeUri({ repoPath: storedRepo.path });
      if (localPath) fileUri = `${localPath}/${path}`;
    } catch {
      localPath = null;
    }
  }

  const [blobs, setBlobs] = useState<ConflictBlobs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<'ours' | 'theirs' | 'base' | null>(null);

  useEffect(() => {
    if (!localPath) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await GitEngine.getConflictBlobs(localPath, path);
        if (!cancelled) setBlobs(result);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [localPath, path]);

  const handleResolve = async (version: 'ours' | 'theirs' | 'base') => {
    if (!fileUri || !localPath) return;
    const content = blobs?.[version] ?? '';
    setResolving(version);
    try {
      await FileSystem.writeAsStringAsync(fileUri, content);
      await GitEngine.markConflictResolved(localPath, path);
      Alert.alert(
        'Conflict resolved',
        `Using the "${version}" version for "${path}".`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (caught) {
      Alert.alert(
        'Failed to resolve',
        caught instanceof Error ? caught.message : String(caught),
      );
    } finally {
      setResolving(null);
    }
  };

  if (!storedRepo || !localPath || !fileUri) {
    return (
      <SafeAreaView edges={['top']} className="flex-1" style={{ flex: 1, backgroundColor: colors.background }}>
        <View className="flex-row items-center gap-2 px-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Heading className="text-lg" style={{ color: colors.text }}>Resolve conflict</Heading>
        </View>
        <View className="flex-1 items-center justify-center px-8" style={{ flex: 1 }}>
          <Ionicons name="warning-outline" size={40} color={colors.error} />
          <Text className="mt-2 text-center text-sm" style={{ color: colors.textSecondary }}>
            Repository not found.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderVersion = (version: 'ours' | 'theirs' | 'base', label: string, _color: string) => {
    const content = blobs?.[version] ?? '';
    const lines = content.split('\n').slice(0, PREVIEW_LINES);
    const truncated = content.split('\n').length > PREVIEW_LINES;
    const isResolving = resolving === version;

    return (
      <View
        key={version}
        className="rounded-lg p-4 mb-3"
        style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}
        testID={`conflict-resolve.${version}`}
      >
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-sm font-bold" style={{ color: colors.text }}>{label}</Text>
          <Button
            size="sm"
            variant="outline"
            disabled={resolving !== null}
            onPress={() => handleResolve(version)}
            testID={`conflict-resolve.use.${version}`}
          >
            {isResolving ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <ButtonText style={{ color: colors.accent }}>Use this</ButtonText>
            )}
          </Button>
        </View>
        <View
          className="rounded p-2"
          style={{ backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1 }}
        >
          {lines.map((line, i) => (
            <Text
              key={i}
              className="text-xs font-mono"
              style={{ color: colors.textSecondary }}
              numberOfLines={1}
            >
              {line}
            </Text>
          ))}
          {truncated && (
            <Text className="text-[10px] italic mt-1" style={{ color: colors.textSecondary }}>
              … {content.split('\n').length - PREVIEW_LINES} more lines
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1" style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        className="flex-row items-center gap-2 px-4 py-3"
        style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="conflict-resolve.back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Heading className="text-lg" style={{ color: colors.text }}>Resolve conflict</Heading>
          <Text className="text-xs" style={{ color: colors.textSecondary }} numberOfLines={1}>
            {path}
          </Text>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center gap-2" style={{ flex: 1 }}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text className="text-sm" style={{ color: colors.textSecondary }}>Reading conflict content…</Text>
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-8" style={{ flex: 1 }}>
          <Ionicons name="warning-outline" size={40} color={colors.error} />
          <Text className="mt-2 text-center text-sm" style={{ color: colors.error }}>{error}</Text>
        </View>
      ) : blobs ? (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
          <Text className="text-xs font-semibold mb-3" style={{ color: colors.textSecondary }}>
            Choose which version to keep for each conflicted file:
          </Text>
          {renderVersion('ours', 'Ours (current branch)', colors.accent)}
          {renderVersion('theirs', 'Theirs (incoming change)', colors.warning)}
          {renderVersion('base', 'Base (common ancestor)', colors.textSecondary)}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}
