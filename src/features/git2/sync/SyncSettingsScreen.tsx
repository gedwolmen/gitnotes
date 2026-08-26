/**
 * SyncSettingsScreen — configure sync lifecycle triggers and background task.
 *
 * Modes:
 *   manual  — user triggers sync via button (no background activity)
 *   quick   — sync on AppState active + NetInfo online transition
 *   scheduled — sync on OS schedule via expo-background-task
 *
 * GPL-3.0 derivative of GitSync.
 */

import { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { useSyncStore, SyncMode } from './syncState';

const INTERVAL_OPTIONS = [
  { label: '15 minutes', value: 15 },
  { label: '30 minutes', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '4 hours', value: 240 },
];

const MODE_OPTIONS: { label: string; value: SyncMode; description: string }[] = [
  {
    label: 'Manual',
    value: 'manual',
    description: 'Sync only when you press the button. No background activity.',
  },
  {
    label: 'Quick',
    value: 'quick',
    description: 'Syncs when you open the app and when network comes online.',
  },
  {
    label: 'Scheduled',
    value: 'scheduled',
    description: 'Syncs automatically in the background on a schedule.',
  },
];

export function SyncSettingsScreen() {
  const settings = useSyncStore((s) => s.settings);
  const updateSettings = useSyncStore((s) => s.updateSettings);
  const registerBackgroundTask = useSyncStore((s) => s.registerBackgroundTask);

  const handleModeChange = useCallback(
    async (mode: SyncMode) => {
      if (settings.mode === 'scheduled' && mode !== 'scheduled') {
        await updateSettings({ mode });
        // Unregister background task
      } else if (mode === 'scheduled') {
        await updateSettings({ mode });
        await registerBackgroundTask();
      } else {
        await updateSettings({ mode });
      }
    },
    [settings.mode, updateSettings, registerBackgroundTask],
  );

  const handleIntervalChange = useCallback(
    async (minutes: number) => {
      await updateSettings({ scheduledIntervalMinutes: minutes });
      // Re-register background task with new interval
      await registerBackgroundTask();
    },
    [updateSettings, registerBackgroundTask],
  );

  const handleQuickSyncToggle = useCallback(
    async (key: 'quickSyncOnNetworkChange' | 'quickSyncOnAppFocus', value: boolean) => {
      await updateSettings({ [key]: value });
    },
    [updateSettings],
  );

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionTitle}>Sync Mode</Text>
      <Text style={styles.sectionSubtitle}>
        Choose how and when GitNotēs syncs with your repositories.
      </Text>

      {MODE_OPTIONS.map((option) => (
        <TouchableOpacity
          key={option.value}
          style={[
            styles.modeCard,
            settings.mode === option.value && styles.modeCardActive,
          ]}
          onPress={() => handleModeChange(option.value)}
        >
          <View style={styles.modeCardHeader}>
            <Text
              style={[
                styles.modeLabel,
                settings.mode === option.value && styles.modeLabelActive,
              ]}
            >
              {option.label}
            </Text>
            {settings.mode === option.value && (
              <View style={styles.checkmark}>
                <Text style={styles.checkmarkText}>✓</Text>
              </View>
            )}
          </View>
          <Text style={styles.modeDescription}>{option.description}</Text>
        </TouchableOpacity>
      ))}

      {/* Scheduled options */}
      {settings.mode === 'scheduled' && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
            Background Sync Interval
          </Text>
          <Text style={styles.sectionSubtitle}>
            How often the OS will run a background sync (requires OS permission).
          </Text>

          {INTERVAL_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.intervalRow,
                settings.scheduledIntervalMinutes === opt.value &&
                  styles.intervalRowActive,
              ]}
              onPress={() => handleIntervalChange(opt.value)}
            >
              <Text
                style={[
                  styles.intervalLabel,
                  settings.scheduledIntervalMinutes === opt.value &&
                    styles.intervalLabelActive,
                ]}
              >
                {opt.label}
              </Text>
              {settings.scheduledIntervalMinutes === opt.value && (
                <Text style={styles.checkmarkText}>✓</Text>
              )}
            </TouchableOpacity>
          ))}

          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              Background sync requires OS permission. On iOS, enable "Background
              App Refresh" for GitNotēs in Settings → General → Background App
              Refresh. On Android, the OS controls how often background tasks
              run based on battery and usage patterns.
            </Text>
          </View>
        </>
      )}

      {/* Quick sync toggles */}
      {settings.mode === 'quick' && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
            Quick Sync Triggers
          </Text>

          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>On network change</Text>
              <Text style={styles.toggleDescription}>
                Sync when Wi-Fi or cellular becomes available
              </Text>
            </View>
            <Switch
              value={settings.quickSyncOnNetworkChange}
              onValueChange={(v) =>
                handleQuickSyncToggle('quickSyncOnNetworkChange', v)
              }
              trackColor={{ false: '#e0e0e0', true: '#a5c3ff' }}
              thumbColor={settings.quickSyncOnNetworkChange ? '#5b7ef4' : '#fff'}
            />
          </View>

          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>On app focus</Text>
              <Text style={styles.toggleDescription}>
                Sync when you open or return to the app
              </Text>
            </View>
            <Switch
              value={settings.quickSyncOnAppFocus}
              onValueChange={(v) =>
                handleQuickSyncToggle('quickSyncOnAppFocus', v)
              }
              trackColor={{ false: '#e0e0e0', true: '#a5c3ff' }}
              thumbColor={settings.quickSyncOnAppFocus ? '#5b7ef4' : '#fff'}
            />
          </View>
        </>
      )}

      <View style={styles.spacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
    lineHeight: 18,
  },
  modeCard: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    backgroundColor: '#fafafa',
  },
  modeCardActive: {
    borderColor: '#5b7ef4',
    backgroundColor: '#f0f4ff',
  },
  modeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  modeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  modeLabelActive: {
    color: '#5b7ef4',
  },
  checkmark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#5b7ef4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmarkText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  modeDescription: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  intervalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  intervalRowActive: {
    borderBottomColor: '#5b7ef4',
  },
  intervalLabel: {
    fontSize: 15,
    color: '#333',
  },
  intervalLabelActive: {
    color: '#5b7ef4',
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  toggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  toggleDescription: {
    fontSize: 12,
    color: '#888',
  },
  infoBox: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
  infoText: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
  spacer: {
    height: 40,
  },
});
