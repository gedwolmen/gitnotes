import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Modal } from '@/components/ui/Modal';
import { Text } from '@/components/ui/text';
import * as GitEngine from '@/services/git/engine/GitEngine';
import type { CommitInfo } from '@/services/git/engine/GitEngine';
import type { ManagedRepo } from '@/services/repos/RepoService';

interface UnpushedCommitsModalProps {
  repo: ManagedRepo | null;
  /** Engine ahead-of-remote count (how many HEAD commits are unpushed). */
  ahead: number;
  open: boolean;
  onClose: () => void;
}

function relativeTime(timestampSec: number): string {
  const diff = Date.now() - timestampSec * 1000;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Preview of the commits that a hold-to-push would send upstream. Shown when
 * the floating git button is tapped while its blue halo is present. Uses a
 * FlatList (not ScrollView, which blank-renders on this RN 0.85 build).
 */
export default function UnpushedCommitsModal({
  repo,
  ahead,
  open,
  onClose,
}: UnpushedCommitsModalProps) {
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !repo) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const limit = Math.min(Math.max(ahead, 1), 25);
    GitEngine.log(repo.localPath, limit)
      .then((list) => {
        if (!cancelled) setCommits(list.slice(0, limit));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setCommits([]);
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, repo, ahead]);

  return (
    <Modal visible={open} onRequestClose={onClose}>
      <View className="flex-1">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Ionicons name="cloud-upload-outline" size={18} color="#3b82f6" />
            <Text className="text-base font-bold text-foreground">
              Unpushed commits{ahead > 0 ? ` (${ahead})` : ''}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close">
            <Ionicons name="close" size={18} color="#6e6e73" />
          </Pressable>
        </View>

        {repo && (
          <Text className="mt-1 text-xs text-muted-foreground" numberOfLines={1}>
            {repo.name} · hold the git button to push
          </Text>
        )}

        {loading && <Text className="mt-4 text-sm text-muted-foreground">Loading commits…</Text>}
        {error && <Text className="mt-4 text-sm text-destructive">{error}</Text>}

        {!loading && !error && (
          <FlatList
            data={commits}
            keyExtractor={(item) => item.id}
            scrollEnabled={commits.length > 4}
            style={{ maxHeight: 320 }}
            className="mt-3"
            renderItem={({ item }) => (
              <View className="mb-2 rounded-lg border border-border bg-secondary px-3 py-2">
                <Text className="text-sm font-semibold text-foreground" numberOfLines={2}>
                  {item.summary || item.message}
                </Text>
                <View className="mt-1 flex-row items-center gap-2">
                  <View className="rounded bg-blue-100 px-1.5 py-0.5">
                    <Text className="font-mono text-[11px] font-semibold text-blue-700">
                      {item.shortId}
                    </Text>
                  </View>
                  <Text className="text-[11px] text-muted-foreground" numberOfLines={1}>
                    {item.authorName} · {relativeTime(item.authorTime)}
                  </Text>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <Pressable disabled accessibilityRole="text">
                <Text className="mt-4 text-sm text-muted-foreground">
                  No unpushed commits — the branch is up to date.
                </Text>
              </Pressable>
            }
          />
        )}
      </View>
    </Modal>
  );
}
