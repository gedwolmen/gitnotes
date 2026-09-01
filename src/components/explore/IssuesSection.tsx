import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/text';
import { Button, ButtonText } from '@/components/ui/Button';
import { FlatList } from '@/components/ui/flat-list';
import { HostService, type GitHostIssue, type IssueState } from '@/services/git/HostService';
import type { RootStackParamList } from '@/navigation/types';
import { type SectionProps } from './exploreShared';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type StateFilter = IssueState;

const STATE_FILTERS: StateFilter[] = ['open', 'closed'];

/**
 * Issues section of the Explore workspace (todo 26).
 * Loads issues from the provider REST API using the account's stored credential.
 */
export function IssuesSection({ repo, active }: SectionProps) {
  const navigation = useNavigation<NavigationProp>();
  const [stateFilter, setStateFilter] = useState<StateFilter>('open');
  const [issues, setIssues] = useState<GitHostIssue[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPermissionError, setIsPermissionError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsPermissionError(false);
    try {
      const result = await HostService.listIssues(repo, repo.accountId, stateFilter);
      if ('kind' in result && 'message' in result) {
        setError(String(result.message));
        setIsPermissionError(result.kind === 'permission');
      } else {
        setIssues(result.data as unknown as GitHostIssue[]);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setIsPermissionError(false);
    } finally {
      setLoading(false);
    }
  }, [repo, stateFilter]);

  useFocusEffect(
    useCallback(() => {
      if (active) void load();
    }, [active, load]),
  );

  const renderItem = useCallback(
    ({ item }: { item: GitHostIssue }) => {
      const isOpen = item.state === 'open';
      return (
        <Pressable
          accessibilityRole="button"
          testID={`explore.issue.${item.number}`}
          className="mx-4 mb-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5"
          onPress={() => HostService.openUrl(item.webUrl)}
        >
          <View className="flex-row items-start gap-2">
            <Ionicons
              name="alert-circle-outline"
              size={16}
              color={isOpen ? '#22c55e' : '#9ca3af'}
            />
            <View className="flex-1 gap-0.5">
              <Text className="text-sm font-semibold text-black" numberOfLines={2}>
                #{item.number} {item.title}
              </Text>
              <View className="mt-0.5 flex-row items-center gap-2">
                {item.author && (
                  <Text className="text-[11px] text-gray-500" numberOfLines={1}>
                    {item.author}
                  </Text>
                )}
                {item.labels.length > 0 && (
                  <View className="flex-row flex-wrap gap-1">
                    {item.labels.slice(0, 3).map((label) => (
                      <View
                        key={label}
                        className="rounded bg-blue-100 px-1.5 py-0.5"
                      >
                        <Text className="text-[10px] font-semibold text-blue-700" numberOfLines={1}>
                          {label}
                        </Text>
                      </View>
                    ))}
                    {item.labels.length > 3 && (
                      <View className="rounded bg-gray-100 px-1.5 py-0.5">
                        <Text className="text-[10px] text-gray-500">+{item.labels.length - 3}</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </View>
            <Pressable
              testID={`explore.issue.open-browser.${item.number}`}
              hitSlop={8}
              onPress={() => HostService.openUrl(item.webUrl)}
              accessibilityRole="button"
              accessibilityLabel="Open issue in browser"
            >
              <Ionicons name="open-outline" size={16} color="#9ca3af" />
            </Pressable>
          </View>
        </Pressable>
      );
    },
    [],
  );

  if (error) {
    return (
      <View className="items-center px-8 py-10">
        <Ionicons
          name={isPermissionError ? 'lock-closed-outline' : 'cloud-offline-outline'}
          size={36}
          color="#dc2626"
        />
        <Text className="mt-2 text-center text-sm text-red-600">{error}</Text>
        <View className="mt-3 flex-row gap-2">
          <Button variant="outline" size="sm" onPress={() => void load()}>
            <ButtonText>Retry</ButtonText>
          </Button>
          {isPermissionError ? (
            <Button
              variant="ghost"
              size="sm"
              onPress={() => navigation.navigate('Repos' as any)}
              testID="explore.issue.open-settings"
            >
              <ButtonText>Open settings</ButtonText>
            </Button>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <FlatList<GitHostIssue>
      data={issues ?? []}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={{ paddingTop: 10, paddingBottom: 96 }}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor="#7b8cde" />
      }
      ListHeaderComponent={
        <View>
          {/* State filter pills */}
          <View className="mb-2 flex-row items-center justify-center gap-2 px-4">
            {STATE_FILTERS.map((s) => {
              const active = stateFilter === s;
              return (
                <Pressable
                  key={s}
                  testID={`explore.issue.filter.${s}`}
                  onPress={() => setStateFilter(s)}
                  className="rounded-full px-4 py-1.5"
                  style={{
                    backgroundColor: active ? '#7b8cde' : 'rgba(123,140,222,0.15)',
                  }}
                  accessibilityRole="button"
                >
                  <Text
                    className="text-[13px] font-semibold"
                    style={{ color: active ? '#fff' : '#7b8cde' }}
                  >
                    {s === 'open' ? 'Open' : 'Closed'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View className="mb-1 flex-row items-center justify-between px-4 pb-2">
            <Text className="text-xs text-gray-500" testID="explore.issues.count">
              {loading && issues === null
                ? 'Loading issues…'
                : issues !== null
                  ? `${issues.length} issue(s)`
                  : ''}
            </Text>
            {loading && issues !== null && <ActivityIndicator size="small" color="#7b8cde" />}
          </View>
        </View>
      }
      ListEmptyComponent={
        !loading && issues !== null ? (
          <View className="items-center px-8 py-10" testID="explore.issues.empty">
            <Ionicons name="alert-circle-outline" size={40} color="#9ca3af" />
            <Text className="mt-2 text-center text-sm text-gray-500">No issues</Text>
          </View>
        ) : undefined
      }
      testID="explore.issues.list"
    />
  );
}
