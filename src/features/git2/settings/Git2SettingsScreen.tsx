/**
 * Git2SettingsScreen — hub for all git2-rs configuration.
 *
 * Provides navigation to:
 *   - Author Identity (name/email for commits)
 *   - Commit Templates (conventional commit prefixes)
 *   - Sync Scheduling (background task intervals, triggers)
 *   - SSL Policy (certificate verification per-repo)
 *   - .gitignore / .git/info/exclude (per-repo ignore rules)
 *   - Per-Repo Behavior (auto-commit, auto-push, remote preferences)
 *
 * GPL-3.0 derivative of GitSync.
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../../contexts/ThemeContext';
import { useGit2SettingsStore } from './git2SettingsStore';

type Nav = NativeStackNavigationProp<any>;

interface SettingRow {
  label: string;
  description: string;
  route?: string;
  onPress?: () => void;
  badge?: string;
}

export function Git2SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const hydrate = useGit2SettingsStore((s) => s.hydrate);
  const author = useGit2SettingsStore((s) => s.author);
  const commitTemplates = useGit2SettingsStore((s) => s.commitTemplates);
  const sslPolicy = useGit2SettingsStore((s) => s.sslPolicy);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const defaultTemplate = commitTemplates.find((t) => t.isDefault);

  const settings: SettingRow[] = [
    {
      label: 'Author Identity',
      description: `${author.name} <${author.email}>`,
      route: 'Git2AuthorIdentity',
    },
    {
      label: 'Commit Templates',
      description: `${commitTemplates.length} template(s), default: "${defaultTemplate?.prefix ?? 'none'}"`,
      route: 'Git2CommitTemplates',
    },
    {
      label: 'Sync Scheduling',
      description: 'Background sync intervals and triggers',
      route: 'Git2SyncScheduling',
    },
    {
      label: 'SSL Policy',
      description: sslPolicy.verifySsl ? 'Verification enabled' : 'Verification disabled',
      route: 'Git2SslPolicy',
    },
    {
      label: '.gitignore Rules',
      description: 'Per-repo ignore patterns',
      route: 'Git2Gitignore',
    },
    {
      label: 'Per-Repo Behavior',
      description: 'Auto-commit, auto-push, remote preferences',
      route: 'Git2PerRepoBehavior',
    },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.headerTitle, { color: colors.text }]}>
        Git2 Sync Settings
      </Text>
      <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
        Configure native git2-rs sync behavior, commit identity, and per-repo preferences.
      </Text>

      {settings.map((item, index) => (
        <TouchableOpacity
          key={item.label}
          style={[
            styles.row,
            {
              backgroundColor: colors.card,
              borderBottomColor: colors.border,
            },
          ]}
          onPress={() => {
            if (item.route) {
              navigation.navigate(item.route);
            } else if (item.onPress) {
              item.onPress();
            }
          }}
        >
          <View style={styles.rowContent}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>{item.label}</Text>
            <Text style={[styles.rowDescription, { color: colors.textSecondary }]}>
              {item.description}
            </Text>
          </View>
          <Text style={[styles.chevron, { color: colors.textSecondary }]}>›</Text>
        </TouchableOpacity>
      ))}

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>
          Settings are stored locally and synced with your repository.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    paddingHorizontal: 20,
    paddingBottom: 20,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  rowDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  chevron: {
    fontSize: 22,
    marginLeft: 12,
    fontWeight: '300',
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  footerText: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
