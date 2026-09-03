import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/text';
import { Button, ButtonText } from '@/components/ui/Button';
import { FlatList } from '@/components/ui/flat-list';
import { HostService, type PullRequest, type PullRequestState } from '@/services/git/HostService';
import type { RootStackParamList } from '@/navigation/types';
import { type SectionProps } from './exploreShared';
import { useTokens } from '@/contexts/ThemeContext';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type StateFilter = PullRequestState;

const STATE_FILTERS: StateFilter[] = ['open', 'closed'];

/**
 * Pull Requests section of the Explore workspace (todo 26).
 * Loads PRs from the provider REST API using the account's stored credential.
 */
export function PullRequestsSection({ repo, active, chromeTopInset = 0 }: SectionProps) {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTokens();
  const [stateFilter, setStateFilter] = useState<StateFilter>('open');
  const [prs, setPrs] = useState<PullRequest[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPermissionError, setIsPermissionError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsPermissionError(false);
    try {
      const result = await HostService.listPullRequests(repo, repo.accountId, stateFilter);
      if ('kind' in result && 'message' in result) {
        setError(String(result.message));
        setIsPermissionError(result.kind === 'permission');
      } else {
        setPrs(result.data as unknown as PullRequest[]);
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
    ({ item }: { item: PullRequest }) => {
      const isOpen = item.state === 'open';
      return (
        <Pressable
          accessibilityRole="button"
          testID={`explore.pr.${item.number}`}
          className="mx-4 mb-2 rounded-sm px-3 py-2.5"
          style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}
          onPress={() => HostService.openUrl(item.webUrl)}
        >
          <View className="flex-row items-start gap-2">
            <Ionicons
              name="git-pull-request-outline"
              size={16}
              color={isOpen ? colors.accent : colors.textSecondary}
            />
            <View className="flex-1 gap-0.5">
              <Text className="text-sm font-semibold" style={{ color: colors.text }} numberOfLines={2}>
                #{item.number} {item.title}
              </Text>
              <View className="mt-0.5 flex-row items-center gap-2">
                {item.author && (
                  <Text className="text-[11px]" style={{ color: colors.textSecondary }} numberOfLines={1}>
                    {item.author}
                  </Text>
                )}
                {item.draft && (
                  <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: colors.surfaceSecondary }}>
                    <Text className="text-[10px] font-semibold" style={{ color: colors.textSecondary }}>DRAFT</Text>
                  </View>
                )}
              </View>
            </View>
<Pressable
              testID={`explore.pr.open-browser.${item.number}`}
              hitSlop={8}
              onPress={() => HostService.openUrl(item.webUrl)}
              accessibilityRole="button"
              accessibilityLabel="Open pull request in browser"
            >
              <Ionicons name="open-outline" size={16} color={colors.textSecondary} />
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
          color={colors.error}
        />
        <Text className="mt-2 text-center text-sm" style={{ color: colors.text }}>{error}</Text>
        <View className="mt-3 flex-row gap-2">
          <Button variant="outline" size="sm" onPress={() => void load()}>
            <ButtonText>Retry</ButtonText>
          </Button>
          {isPermissionError ? (
            <Button
              variant="ghost"
              size="sm"
              onPress={() => navigation.navigate('Repos' as any)}
              testID="explore.pr.open-settings"
            >
              <ButtonText>Open settings</ButtonText>
            </Button>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <FlatList<PullRequest>
      className="flex-1"
      data={prs ?? []}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
       contentContainerStyle={{ paddingTop: chromeTopInset, paddingBottom: 96, flexGrow: 1 }}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} />
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
                  testID={`explore.pr.filter.${s}`}
                  onPress={() => setStateFilter(s)}
                  className="rounded-full px-4 py-1.5"
                  style={{
                    backgroundColor: active
                      ? colors.accent
                      : `${colors.accent}26`,
                  }}
                  accessibilityRole="button"
                >
                  <Text
                    className="text-[13px] font-semibold"
                    style={{
                      color: active ? '#fff' : colors.accent,
                    }}
                  >
                    {s === 'open' ? 'Open' : 'Closed'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View className="mb-1 flex-row items-center justify-between px-4 pb-2">
            <Text className="text-xs" style={{ color: colors.textSecondary }} testID="explore.prs.count">
              {loading && prs === null
                ? 'Loading pull requests…'
                : prs !== null
                  ? `${prs.length} pull request(s)`
                  : ''}
            </Text>
            {loading && prs !== null && <ActivityIndicator size="small" color={colors.accent} />}
          </View>
        </View>
      }
      ListEmptyComponent={
        !loading && prs !== null ? (
          <View className="flex-1 items-center justify-center" style={{ minHeight: 240 }} testID="explore.prs.empty">
            <Ionicons name="git-pull-request-outline" size={40} color={colors.textSecondary} />
            <Text className="mt-2 text-center text-sm" style={{ color: colors.textSecondary }}>No pull requests</Text>
          </View>
        ) : undefined
      }
      testID="explore.prs.list"
    />
  );
}
