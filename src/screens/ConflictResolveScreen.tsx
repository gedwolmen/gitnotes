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

  const [rawContent, setRawContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!fileUri || fileUri.trim() === '') {
      setError('File not found on device. The repository may not be cloned.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const content = await FileSystem.readAsStringAsync(fileUri);
        if (!cancelled) {
          if (!content || content.trim() === '') {
            setError('File is empty. The conflict may already be resolved.');
          } else {
            setRawContent(content);
          }
        }
      } catch (caught) {
        if (!cancelled) {
          const msg = caught instanceof Error ? caught.message : String(caught);
          setError(msg || 'Failed to read file. The conflict may already be resolved.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileUri]);

  const handleResolve = async () => {
    if (!fileUri || !localPath) return;
    setResolving(true);
    try {
      await FileSystem.writeAsStringAsync(fileUri, rawContent);
      await GitEngine.markConflictResolved(localPath, path);
      setPending({ repoId, section: 'staging' });
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
      <SafeAreaView edges={['top']} className="flex-1" style={{ backgroundColor: colors.background }}>
        <View className="flex-row items-center gap-2 px-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Heading className="text-lg" style={{ color: colors.text }}>Resolve conflict</Heading>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="warning-outline" size={40} color={colors.error} />
          <Text className="mt-2 text-center text-sm" style={{ color: colors.textSecondary }}>
            Repository not found.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1" style={{ backgroundColor: colors.background }}>
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
        <View className="flex-1 items-center justify-center gap-2">
          <ActivityIndicator size="small" color={colors.accent} />
          <Text className="text-sm" style={{ color: colors.textSecondary }}>Reading file…</Text>
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="warning-outline" size={40} color={colors.error} />
          <Text className="mt-2 text-center text-sm" style={{ color: colors.error }}>{error}</Text>
        </View>
      ) : rawContent === '' ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="warning-outline" size={40} color={colors.error} />
          <Text className="mt-2 text-center text-sm" style={{ color: colors.error }}>
            File is empty. The conflict may already be resolved.
          </Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text className="text-xs font-semibold mb-2" style={{ color: colors.textSecondary }}>
              Edit the file below — remove the conflict markers (&lt;&lt;&lt;&lt;&lt;&lt;&lt; / ======= / &gt;&gt;&gt;&gt;&gt;&gt;&gt;) and keep what you want, then tap Mark resolved.
            </Text>
            <View
              className="rounded-lg mb-4 p-3"
              style={{ backgroundColor: colors.card, borderColor: colors.error, borderWidth: 2 }}
            >
              <TextInput
                testID="conflict-resolve.editor"
                className="text-sm font-mono min-h-[300]"
                style={{
                  color: colors.text,
                  backgroundColor: colors.surface,
                  borderRadius: 8,
                  padding: 12,
                }}
                multiline
                value={rawContent}
                onChangeText={setRawContent}
                placeholder="File content with conflict markers…"
                placeholderTextColor={colors.textSecondary}
                textAlignVertical="top"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <Button
              disabled={resolving}
              onPress={handleResolve}
              testID="conflict-resolve.save"
            >
              {resolving ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <ButtonText>Mark resolved &amp; go to staged</ButtonText>
              )}
            </Button>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
