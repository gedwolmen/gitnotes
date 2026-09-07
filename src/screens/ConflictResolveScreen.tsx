import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
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
import { useGitButtonActionStore } from '@/stores/gitButtonActionStore';
import { useTokens } from '@/contexts/ThemeContext';
import type { RootStackParamList } from '@/navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ConflictResolve'>;

export default function ConflictResolveScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<Route>();
  const { colors } = useTokens();
  const { repoId, path } = route.params;
  const setPending = useGitButtonActionStore((s) => s.setPending);

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
  const [resolving, setResolving] = useState(false);
  const [content, setContent] = useState('');

  useEffect(() => {
    if (!localPath) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await GitEngine.getConflictBlobs(localPath, path);
        if (!cancelled) {
          setBlobs(result);
          setContent(result.ours);
        }
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

  const handleResolve = async () => {
    if (!fileUri || !localPath) return;
    setResolving(true);
    try {
      await FileSystem.writeAsStringAsync(fileUri, content);
      await GitEngine.markConflictResolved(localPath, path);
      setPending({ repoId, section: 'commits' });
      navigation.navigate('MainTabs', { screen: 'ExploreTab' });
    } catch (caught) {
      setResolving(false);
      Alert.alert(
        'Failed to resolve',
        caught instanceof Error ? caught.message : String(caught),
      );
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
      ) : (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            <Text className="text-xs font-semibold mb-2" style={{ color: colors.textSecondary }}>
              Edit the file content below, or pick a version:
            </Text>
            <View
              className="rounded-lg mb-4 p-3"
              style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}
            >
              <TextInput
                testID="conflict-resolve.editor"
                className="text-sm font-mono min-h-[200]"
                style={{ color: colors.text, backgroundColor: colors.surfaceSecondary, borderRadius: 8, padding: 12 }}
                multiline
                value={content}
                onChangeText={setContent}
                placeholder="Edit the resolved content here…"
                placeholderTextColor={colors.textSecondary}
                textAlignVertical="top"
              />
            </View>

            <Text className="text-xs font-semibold mb-2" style={{ color: colors.textSecondary }}>
              Or pick a version to fill the editor:
            </Text>
            <View className="flex-row gap-2 mb-4">
              <Button
                className="flex-1"
                size="sm"
                variant="outline"
                onPress={() => setContent(blobs?.ours ?? '')}
                testID="conflict-resolve.use.ours"
              >
                <ButtonText style={{ color: colors.accent }}>Use Ours</ButtonText>
              </Button>
              <Button
                className="flex-1"
                size="sm"
                variant="outline"
                onPress={() => setContent(blobs?.theirs ?? '')}
                testID="conflict-resolve.use.theirs"
              >
                <ButtonText style={{ color: colors.warning }}>Use Theirs</ButtonText>
              </Button>
              <Button
                className="flex-1"
                size="sm"
                variant="outline"
                onPress={() => setContent(blobs?.base ?? '')}
                testID="conflict-resolve.use.base"
              >
                <ButtonText>Use Base</ButtonText>
              </Button>
            </View>

            <Button
              className="mt-2"
              disabled={resolving}
              onPress={handleResolve}
              testID="conflict-resolve.save"
            >
              {resolving ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <ButtonText>Mark resolved &amp; go to push</ButtonText>
              )}
            </Button>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
