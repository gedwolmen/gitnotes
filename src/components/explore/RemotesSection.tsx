import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/text';
import { Button, ButtonText } from '@/components/ui/Button';
import { FlatList } from '@/components/ui/flat-list';
import { Input, InputField } from '@/components/ui/Input';
import * as GitEngine from '@/services/git/engine/GitEngine';
import type { RemoteInfo } from '@/services/git/engine/GitEngine';
import { GitFsService } from '@/services/git/GitFsService';
import type { SectionProps } from './exploreShared';
import { useTokens } from '@/contexts/ThemeContext';

export function RemotesSection({ repo, active, onChanged, chromeTopInset = 0 }: SectionProps) {
  const { colors } = useTokens();
  const [remotes, setRemotes] = useState<RemoteInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [version, setVersion] = useState(0);
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
      setRemotes(await GitEngine.listRemotes(repo.localPath));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [repo.localPath, repo.path]);

  useEffect(() => {
    if (active) void load();
  }, [active, load, version]);

  const add = useCallback(async () => {
    if (!name.trim() || !url.trim()) return;
    setBusy(true);
    try {
      await GitEngine.addRemote(repo.localPath, name.trim(), url.trim());
      setName('');
      setUrl('');
      onChanged();
      setVersion((value) => value + 1);
    } catch (caught) {
      Alert.alert('Could not add remote', caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }, [name, url, repo.localPath, onChanged]);

  const remove = useCallback(
    (remoteName: string) => {
      Alert.alert('Remove remote', `Remove remote "${remoteName}"? The remote repository itself is untouched.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await GitEngine.removeRemote(repo.localPath, remoteName);
              onChanged();
              setVersion((value) => value + 1);
            } catch (caught) {
              Alert.alert('Could not remove', caught instanceof Error ? caught.message : String(caught));
            } finally {
              setBusy(false);
            }
          },
        },
      ]);
    },
    [repo.localPath, onChanged],
  );

  const saveUrl = useCallback(
    async (remoteName: string) => {
      const target = editUrl.trim();
      if (!target) return;
      setBusy(true);
      try {
        await GitEngine.setRemoteUrl(repo.localPath, remoteName, target);
        setEditing(null);
        setEditUrl('');
        onChanged();
        setVersion((value) => value + 1);
      } catch (caught) {
        Alert.alert('Could not set URL', caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(false);
      }
    },
    [editUrl, repo.localPath, onChanged],
  );

  const renderItem = useCallback(
    ({ item }: { item: RemoteInfo }) => {
      if (editing === item.name) {
        return (
          <View className="mx-4 mb-2 rounded-sm px-3 py-2.5" style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }} testID={`explore.remote.edit.${item.name}`}>
            <Text className="text-[11px]" style={{ color: colors.textSecondary }}>Set URL for "{item.name}"</Text>
            <Text className="mt-1 text-[10px] font-mono" style={{ color: colors.textSecondary }} numberOfLines={2}>
              current: {item.url ?? '(no URL)'}
            </Text>
            <View className="mt-1.5 flex-row items-center gap-2">
              <View className="flex-1">
                <Input>
                  <InputField
                    value={editUrl}
                    onChangeText={setEditUrl}
                    placeholder="new URL"
                    autoCapitalize="none"
                    autoCorrect={false}
                    testID={`explore.remote.edit.input.${item.name}`}
                  />
                </Input>
              </View>
              <Button size="sm" disabled={busy || !editUrl.trim()} onPress={() => void saveUrl(item.name)}>
                <ButtonText>Save</ButtonText>
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onPress={() => setEditing(null)}>
                <ButtonText>Cancel</ButtonText>
              </Button>
            </View>
          </View>
        );
      }
      return (
        <View className="mx-4 mb-2 rounded-sm px-3 py-2.5" style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}>
          <View className="flex-row items-center gap-2">
            <Ionicons name="cloud-outline" size={14} color={colors.accent} />
            <Text className="text-sm font-semibold" style={{ color: colors.text }}>{item.name}</Text>
            <View className="flex-1" />
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onPress={() => {
                setEditing(item.name);
                setEditUrl('');
              }}
              testID={`explore.remote.seturl.${item.name}`}
            >
              <ButtonText>Set URL</ButtonText>
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onPress={() => remove(item.name)}>
              <ButtonText>Remove</ButtonText>
            </Button>
          </View>
          <Text className="mt-1 text-[11px] font-mono" style={{ color: colors.textSecondary }} numberOfLines={2} testID={`explore.remote.url.${item.name}`}>
            {item.url ?? '(no URL)'}
          </Text>
          {(item.fetchSpecs?.length ?? 0) > 0 && (
            <Text className="mt-1 text-[10px] font-mono" style={{ color: colors.textSecondary }} numberOfLines={1}>
              fetch {item.fetchSpecs?.join(' ') ?? ''}
            </Text>
          )}
          {(item.pushSpecs?.length ?? 0) > 0 && (
            <Text className="mt-0.5 text-[10px] font-mono" style={{ color: colors.textSecondary }} numberOfLines={1}>
              push {item.pushSpecs?.join(' ') ?? ''}
            </Text>
          )}
        </View>
      );
    },
    [busy, editing, editUrl, remove, saveUrl],
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
      data={remotes ?? []}
      keyExtractor={(item) => item.name}
      renderItem={renderItem}
       contentContainerStyle={{ paddingTop: chromeTopInset, paddingBottom: 96, flexGrow: 1 }}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} />
      }
      ListHeaderComponent={
        <View className="px-4 pb-3">
          <Input className="mb-2 border-gray-300">
            <InputField
              value={name}
              onChangeText={setName}
              placeholder="remote name (e.g. origin)"
              autoCapitalize="none"
              autoCorrect={false}
              testID="explore.remote.input.name"
            />
          </Input>
          <Input className="mb-2 border-gray-300">
            <InputField
              value={url}
              onChangeText={setUrl}
              placeholder="https://github.com/owner/repo.git"
              autoCapitalize="none"
              autoCorrect={false}
              testID="explore.remote.input.url"
            />
          </Input>
          <View className="flex-row items-center justify-between">
            <Button size="sm" disabled={busy || !name.trim() || !url.trim()} onPress={() => void add()}>
              {busy ? <ActivityIndicator size="small" color={colors.text} /> : null}
              <ButtonText>Add remote</ButtonText>
            </Button>
            <Text className="text-xs" style={{ color: colors.textSecondary }} testID="explore.remotes.count">
              {remotes ? `${remotes.length} remote(s)` : 'Reading remotes…'}
            </Text>
          </View>
        </View>
      }
      ListEmptyComponent={
        !loading ? (
          <View className="flex-1 items-center justify-center" style={{ minHeight: 240 }}>
            <Ionicons name="cloud-offline-outline" size={40} color={colors.textSecondary} />
            <Text className="mt-2 text-center text-sm" style={{ color: colors.textSecondary }}>No remotes configured.</Text>
          </View>
        ) : undefined
      }
      testID="explore.remotes.list"
    />
  );
}
