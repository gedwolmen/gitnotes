/**
 * SslPolicyScreen — configure SSL/TLS certificate verification.
 *
 * Global policy applies to all repos; per-repo overrides can disable
 * verification for self-hosted or internal Git servers.
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
import { useGit2SettingsStore } from './git2SettingsStore';
import { useRepoStore } from '../repositories/repoStore';
import { HapticService } from '../../../utils/haptics';

export function SslPolicyScreen() {
  const { colors } = useTheme();
  const sslPolicy = useGit2SettingsStore((s) => s.sslPolicy);
  const setSslPolicy = useGit2SettingsStore((s) => s.setSslPolicy);
  const setRepoSslOverride = useGit2SettingsStore((s) => s.setRepoSslOverride);
  const repositories = useRepoStore((s) => s.repositories);

  const handleGlobalToggle = useCallback(async (value: boolean) => {
    if (!value) {
      Alert.alert(
        'Disable SSL Verification',
        'This will disable certificate verification for all repositories. This is insecure and should only be used for self-hosted servers with self-signed certificates.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disable',
            style: 'destructive',
            onPress: async () => {
              await setSslPolicy({ verifySsl: false });
              HapticService.success();
            },
          },
        ],
      );
    } else {
      await setSslPolicy({ verifySsl: true });
      HapticService.success();
    }
  }, [setSslPolicy]);

  const handleRepoToggle = useCallback(async (repoId: string, currentOverride: boolean) => {
    await setRepoSslOverride(repoId, !currentOverride);
    HapticService.success();
  }, [setRepoSslOverride]);

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Global policy */}
      <View style={[styles.globalRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.globalInfo}>
          <Text style={[styles.globalLabel, { color: colors.text }]}>
            Global SSL Verification
          </Text>
          <Text style={[styles.globalDescription, { color: colors.textSecondary }]}>
            Verify SSL certificates for all repositories by default
          </Text>
        </View>
        <Switch
          value={sslPolicy.verifySsl}
          onValueChange={handleGlobalToggle}
          trackColor={{ false: '#e0e0e0', true: colors.primary + '80' }}
          thumbColor={sslPolicy.verifySsl ? colors.primary : '#fff'}
        />
      </View>

      {/* Per-repo overrides */}
      {repositories.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Per-Repo Overrides
          </Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
            Override the global SSL policy for specific repositories. Useful for
            self-hosted servers with self-signed certificates.
          </Text>

          {repositories.map((repo) => {
            const hasOverride = repo.id in sslPolicy.perRepoOverrides;
            const overrideValue = sslPolicy.perRepoOverrides[repo.id] ?? sslPolicy.verifySsl;
            return (
              <View
                key={repo.id}
                style={[styles.repoRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
              >
                <View style={styles.repoInfo}>
                  <Text style={[styles.repoName, { color: colors.text }]}>{repo.name}</Text>
                  <Text style={[styles.repoUrl, { color: colors.textSecondary }]} numberOfLines={1}>
                    {repo.remoteUrl}
                  </Text>
                  {hasOverride && (
                    <View style={[styles.overrideBadge, { backgroundColor: '#fff3cd' }]}>
                      <Text style={styles.overrideBadgeText}>Override</Text>
                    </View>
                  )}
                </View>
                <Switch
                  value={overrideValue}
                  onValueChange={() => handleRepoToggle(repo.id, overrideValue)}
                  trackColor={{ false: '#e0e0e0', true: colors.primary + '80' }}
                  thumbColor={overrideValue ? colors.primary : '#fff'}
                />
              </View>
            );
          })}
        </>
      )}

      {/* Warning */}
      <View style={[styles.warningBox, { borderColor: '#ffc107' }]}>
        <Text style={[styles.warningText, { color: '#856404' }]}>
          Disabling SSL verification exposes your credentials to
          man-in-the-middle attacks. Only use this for trusted internal servers.
        </Text>
      </View>

      <View style={styles.spacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  globalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  globalInfo: {
    flex: 1,
    marginRight: 16,
  },
  globalLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  globalDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    paddingHorizontal: 20,
    paddingBottom: 12,
    lineHeight: 18,
  },
  repoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  repoInfo: {
    flex: 1,
    marginRight: 16,
  },
  repoName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  repoUrl: {
    fontSize: 12,
  },
  overrideBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  overrideBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#856404',
  },
  warningBox: {
    marginHorizontal: 20,
    marginTop: 24,
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  warningText: {
    fontSize: 12,
    lineHeight: 18,
  },
  spacer: {
    height: 60,
  },
});
