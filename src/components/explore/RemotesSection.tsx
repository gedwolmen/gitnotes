import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/text';
import { Button, ButtonText } from '@/components/ui/Button';
import { FlatList } from '@/components/ui/flat-list';
import { Input, InputField } from '@/components/ui/Input';
import * as GitEngine from '@/services/git/engine/GitEngine';
import type { RemoteInfo } from '@/services/git/engine/GitEngine';
import type { SectionProps } from './exploreShared';

export function RemotesSection({ repo, active, onChanged }: SectionProps) {
  const [remotes, setRemotes] = useState<RemoteInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRemotes(await GitEngine.listRemotes(repo.path));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [repo.path]);

  useEffect(() => {
    if (active) void load();
  }, [active, load, version]);

  const add = useCallback(async () => {
    if (!name.trim() || !url.trim()) return;
    setBusy(true);
    try {
      await GitEngine.addRemote(repo.path, name.trim(), url.trim());
      setName('');
      setUrl('');
      onChanged();
      setVersion((value) => value + 1);
    } catch (caught) {
      Alert.alert('Could not add remote', caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }, [name, url, repo.path, onChanged]);

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
              await GitEngine.removeRemote(repo.path, remoteName);
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
    [repo.path, onChanged],
  );

  const saveUrl = useCallback(
    async (remoteName: string) => {
      const target = editUrl.trim();
      if (!target) return;
      setBusy(true);
      try {
        await GitEngine.setRemoteUrl(repo.path, remoteName, target);
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
    [editUrl, repo.path, onChanged],
  );

  const renderItem = useCallback(
    ({ item }: { item: RemoteInfo }) => {
      if (editing === item.name) {
        return (
          <View className="mx-4 mb-2 rounded-lg border border-indigo-300 bg-white px-3 py-2.5" testID={`explore.remote.edit.${item.name}`}>
            <Text className="text-[11px] text-gray-500">Set URL for "{item.name}"</Text>
            <Text className="mt-1 text-[10px] font-mono text-gray-400" numberOfLines={2}>
              current: {item.url ?? '(no URL)'}
            </Text>
            <View className="mt-1.5 flex-row items-center gap-2">
              <View className="flex-1">
                <Input className="border-gray-300">
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
        <View className="mx-4 mb-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
          <View className="flex-row items-center gap-2">
            <Ionicons name="cloud-outline" size={14} color="#4f46e5" />
            <Text className="text-sm font-semibold text-black">{item.name}</Text>
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
          <Text className="mt-1 text-[11px] font-mono text-gray-500" numberOfLines={2} testID={`explore.remote.url.${item.name}`}>
            {item.url ?? '(no URL)'}
          </Text>
          {(item.fetchSpecs?.length ?? 0) > 0 && (
            <Text className="mt-1 text-[10px] font-mono text-gray-400" numberOfLines={1}>
              fetch {item.fetchSpecs?.join(' ') ?? ''}
            </Text>
          )}
          {(item.pushSpecs?.length ?? 0) > 0 && (
            <Text className="mt-0.5 text-[10px] font-mono text-gray-400" numberOfLines={1}>
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
      data={remotes ?? []}
      keyExtractor={(item) => item.name}
      renderItem={renderItem}
      contentContainerStyle={{ paddingTop: 10, paddingBottom: 96 }}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor="#7b8cde" />
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
              {busy ? <ActivityIndicator size="small" color="#ffffff" /> : null}
              <ButtonText>Add remote</ButtonText>
            </Button>
            <Text className="text-xs text-gray-500" testID="explore.remotes.count">
              {remotes ? `${remotes.length} remote(s)` : 'Reading remotes…'}
            </Text>
          </View>
        </View>
      }
      ListEmptyComponent={
        !loading ? (
          <Text className="mt-8 text-center text-gray-500">No remotes configured.</Text>
        ) : undefined
      }
      testID="explore.remotes.list"
    />
  );
}
