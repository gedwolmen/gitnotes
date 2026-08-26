/**
 * SyncSchedulingScreen — advanced sync scheduling configuration.
 *
 * Controls background sync interval, max repos per cycle, max files
 * per cycle, and push-on-online behavior. Respects OS scheduling limits:
 *   - iOS: BGProcessingTask requires network, OS decides exact timing
 *   - Android: minimum 15-minute interval for BackgroundTask
 *
 * GPL-3.0 derivative of GitSync.
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { useTheme } from '../../../contexts/ThemeContext';
import { useSyncStore } from '../sync/syncState';
import { useGit2SettingsStore } from './git2SettingsStore';
import { HapticService } from '../../../utils/haptics';

const INTERVAL_OPTIONS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '4 hours', value: 240 },
  { label: '12 hours', value: 720 },
];

const MAX_REPO_OPTIONS = [
  { label: '1 repo', value: 1 },
  { label: '3 repos', value: 3 },
  { label: '5 repos', value: 5 },
  { label: '10 repos', value: 10 },
];

const MAX_FILE_OPTIONS = [
  { label: '10 files', value: 10 },
  { label: '25 files', value: 25 },
  { label: '50 files', value: 50 },
  { label: '100 files', value: 100 },
];

export function SyncSchedulingScreen() {
  const { colors } = useTheme();
  const syncSettings = useSyncStore((s) => s.settings);
  const updateSettings = useSyncStore((s) => s.updateSettings);
  const registerBackgroundTask = useSyncStore((s) => s.registerBackgroundTask);
  const syncOverwrites = useGit2SettingsStore((s) => s.syncOverwrites);
  const setSyncOverwrites = useGit2SettingsStore((s) => s.setSyncOverwrites);

  const handleIntervalChange = useCallback(async (minutes: number) => {
    await updateSettings({ scheduledIntervalMinutes: minutes });
    if (syncSettings.mode === 'scheduled') {
      await registerBackgroundTask();
    }
    HapticService.success();
  }, [updateSettings, registerBackgroundTask, syncSettings.mode]);

  const handleMaxReposChange = useCallback(async (value: number) => {
    await setSyncOverwrites({ maxReposPerCycle: value });
    HapticService.success();
  }, [setSyncOverwrites]);

  const handleMaxFilesChange = useCallback(async (value: number) => {
    await setSyncOverwrites({ maxFilesPerCycle: value });
    HapticService.success();
  }, [setSyncOverwrites]);

  const handlePushOnOnlineToggle = useCallback(async (value: boolean) => {
    await setSyncOverwrites({ pushOnOnline: value });
    HapticService.success();
  }, [setSyncOverwrites]);

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Background interval */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Background Interval
      </Text>
      <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
        How often the OS will trigger a background sync. The actual interval may
        be longer based on battery optimization and system load.
      </Text>

      <View style={styles.chipRow}>
        {INTERVAL_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[
              styles.chip,
              {
                backgroundColor: syncSettings.scheduledIntervalMinutes === opt.value
                  ? colors.primary
                  : colors.card,
                borderColor: syncSettings.scheduledIntervalMinutes === opt.value
                  ? colors.primary
                  : colors.border,
              },
            ]}
            onPress={() => handleIntervalChange(opt.value)}
          >
            <Text
              style={[
                styles.chipText,
                {
                  color: syncSettings.scheduledIntervalMinutes === opt.value
                    ? '#fff'
                    : colors.text,
                },
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Max repos per cycle */}
      <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 28 }]}>
        Max Repos Per Cycle
      </Text>
      <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
        Limit how many repositories are synced in a single background cycle.
      </Text>

      <View style={styles.chipRow}>
        {MAX_REPO_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[
              styles.chip,
              {
                backgroundColor: syncOverwrites.maxReposPerCycle === opt.value
                  ? colors.primary
                  : colors.card,
                borderColor: syncOverwrites.maxReposPerCycle === opt.value
                  ? colors.primary
                  : colors.border,
              },
            ]}
            onPress={() => handleMaxReposChange(opt.value)}
          >
            <Text
              style={[
                styles.chipText,
                {
                  color: syncOverwrites.maxReposPerCycle === opt.value
                    ? '#fff'
                    : colors.text,
                },
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Max files per cycle */}
      <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 28 }]}>
        Max Files Per Cycle
      </Text>
      <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
        Limit how many files are committed per sync cycle to avoid long operations.
      </Text>

      <View style={styles.chipRow}>
        {MAX_FILE_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[
              styles.chip,
              {
                backgroundColor: syncOverwrites.maxFilesPerCycle === opt.value
                  ? colors.primary
                  : colors.card,
                borderColor: syncOverwrites.maxFilesPerCycle === opt.value
                  ? colors.primary
                  : colors.border,
              },
            ]}
            onPress={() => handleMaxFilesChange(opt.value)}
          >
            <Text
              style={[
                styles.chipText,
                {
                  color: syncOverwrites.maxFilesPerCycle === opt.value
                    ? '#fff'
                    : colors.text,
                },
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Push on online */}
      <View style={[styles.toggleRow, { borderBottomColor: colors.border }]}>
        <View style={styles.toggleInfo}>
          <Text style={[styles.toggleLabel, { color: colors.text }]}>
            Push when online
          </Text>
          <Text style={[styles.toggleDescription, { color: colors.textSecondary }]}>
            Automatically push local commits when network becomes available
          </Text>
        </View>
        <Switch
          value={syncOverwrites.pushOnOnline}
          onValueChange={handlePushOnOnlineToggle}
          trackColor={{ false: '#e0e0e0', true: colors.primary + '80' }}
          thumbColor={syncOverwrites.pushOnOnline ? colors.primary : '#fff'}
        />
      </View>

      {/* OS scheduling note */}
      <View style={styles.infoBox}>
        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
          <Text style={{ fontWeight: '600' }}>iOS:</Text> Background sync uses
          BGProcessingTask. The OS decides exact timing based on power state,
          network, and usage patterns. Enable "Background App Refresh" in iOS
          Settings for best results.
          {'\n\n'}
          <Text style={{ fontWeight: '600' }}>Android:</Text> Minimum interval
          is 15 minutes. The OS may defer tasks based on Doze mode, App Standby,
          and battery optimization settings.
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#666',
    paddingHorizontal: 20,
    paddingBottom: 12,
    lineHeight: 18,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginTop: 28,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  toggleDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  infoBox: {
    marginHorizontal: 20,
    marginTop: 24,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
  },
  infoText: {
    fontSize: 12,
    lineHeight: 18,
  },
  spacer: {
    height: 60,
  },
});
