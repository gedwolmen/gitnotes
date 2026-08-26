/**
 * PerRepoBehaviorScreen — per-repository sync behavior preferences.
 *
 * Controls auto-commit, auto-push, preferred remote, preferred branch,
 * and background sync exclusion for each repository.
 *
 * GPL-3.0 derivative of GitSync.
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useTheme } from '../../../contexts/ThemeContext';
import { useGit2SettingsStore, type PerRepoBehavior } from './git2SettingsStore';
import { useRepoStore } from '../repositories/repoStore';
import { HapticService } from '../../../utils/haptics';

export function PerRepoBehaviorScreen() {
  const { colors } = useTheme();
  const perRepoBehavior = useGit2SettingsStore((s) => s.perRepoBehavior);
  const setPerRepoBehavior = useGit2SettingsStore((s) => s.setPerRepoBehavior);
  const repositories = useRepoStore((s) => s.repositories);

  const getBehavior = useCallback(
    (repoId: string): PerRepoBehavior =>
      perRepoBehavior[repoId] ?? {
        repoId,
        autoCommitOnSave: true,
        autoPush: true,
        preferredRemote: 'origin',
        preferredBranch: 'main',
        excludeFromBackgroundSync: false,
      },
    [perRepoBehavior],
  );

  const handleToggle = useCallback(
    async (repoId: string, key: keyof PerRepoBehavior, value: boolean) => {
      await setPerRepoBehavior(repoId, { [key]: value });
      HapticService.success();
    },
    [setPerRepoBehavior],
  );

  const handleReset = useCallback(
    (repoId: string) => {
      Alert.alert(
        'Reset Behavior',
        'Reset this repository to default sync behavior?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reset',
            style: 'destructive',
            onPress: async () => {
              await setPerRepoBehavior(repoId, {
                autoCommitOnSave: true,
                autoPush: true,
                preferredRemote: 'origin',
                preferredBranch: 'main',
                excludeFromBackgroundSync: false,
              });
              HapticService.success();
            },
          },
        ],
      );
    },
    [setPerRepoBehavior],
  );

  if (repositories.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          Add a repository to configure per-repo sync behavior.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
        Configure sync behavior for each repository independently. Changes take
        effect on the next sync cycle.
      </Text>

      {repositories.map((repo) => {
        const behavior = getBehavior(repo.id);
        const isCustom =
          behavior.autoCommitOnSave !== true ||
          behavior.autoPush !== true ||
          behavior.preferredRemote !== 'origin' ||
          behavior.preferredBranch !== 'main' ||
          behavior.excludeFromBackgroundSync !== false;

        return (
          <View key={repo.id} style={[styles.repoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.repoHeader}>
              <View style={styles.repoHeaderInfo}>
                <Text style={[styles.repoName, { color: colors.text }]}>{repo.name}</Text>
                <Text style={[styles.repoUrl, { color: colors.textSecondary }]} numberOfLines={1}>
                  {repo.remoteUrl}
                </Text>
              </View>
              {isCustom && (
                <TouchableOpacity onPress={() => handleReset(repo.id)}>
                  <Text style={[styles.resetLink, { color: colors.primary }]}>Reset</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Auto-commit on save */}
            <View style={[styles.toggleRow, { borderBottomColor: colors.border }]}>
              <View style={styles.toggleInfo}>
                <Text style={[styles.toggleLabel, { color: colors.text }]}>
                  Auto-commit on save
                </Text>
                <Text style={[styles.toggleDesc, { color: colors.textSecondary }]}>
                  Commit changes immediately when saved
                </Text>
              </View>
              <Switch
                value={behavior.autoCommitOnSave}
                onValueChange={(v) => handleToggle(repo.id, 'autoCommitOnSave', v)}
                trackColor={{ false: '#e0e0e0', true: colors.primary + '80' }}
                thumbColor={behavior.autoCommitOnSave ? colors.primary : '#fff'}
              />
            </View>

            {/* Auto-push */}
            <View style={[styles.toggleRow, { borderBottomColor: colors.border }]}>
              <View style={styles.toggleInfo}>
                <Text style={[styles.toggleLabel, { color: colors.text }]}>
                  Auto-push after commit
                </Text>
                <Text style={[styles.toggleDesc, { color: colors.textSecondary }]}>
                  Push to remote immediately after committing
                </Text>
              </View>
              <Switch
                value={behavior.autoPush}
                onValueChange={(v) => handleToggle(repo.id, 'autoPush', v)}
                trackColor={{ false: '#e0e0e0', true: colors.primary + '80' }}
                thumbColor={behavior.autoPush ? colors.primary : '#fff'}
              />
            </View>

            {/* Exclude from background sync */}
            <View style={[styles.toggleRow, { borderBottomColor: colors.border }]}>
              <View style={styles.toggleInfo}>
                <Text style={[styles.toggleLabel, { color: colors.text }]}>
                  Exclude from background sync
                </Text>
                <Text style={[styles.toggleDesc, { color: colors.textSecondary }]}>
                  This repo will not be synced in background cycles
                </Text>
              </View>
              <Switch
                value={behavior.excludeFromBackgroundSync}
                onValueChange={(v) => handleToggle(repo.id, 'excludeFromBackgroundSync', v)}
                trackColor={{ false: '#e0e0e0', true: colors.primary + '80' }}
                thumbColor={behavior.excludeFromBackgroundSync ? colors.primary : '#fff'}
              />
            </View>

            {/* Remote and branch info */}
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                Remote: {behavior.preferredRemote}
              </Text>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                Branch: {behavior.preferredBranch}
              </Text>
            </View>
          </View>
        );
      })}

      <View style={styles.spacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  headerSubtitle: {
    fontSize: 13,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    lineHeight: 18,
  },
  repoCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  repoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  repoHeaderInfo: {
    flex: 1,
  },
  repoName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  repoUrl: {
    fontSize: 12,
  },
  resetLink: {
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toggleInfo: {
    flex: 1,
    marginRight: 12,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 1,
  },
  toggleDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  infoLabel: {
    fontSize: 12,
  },
  spacer: {
    height: 40,
  },
});
