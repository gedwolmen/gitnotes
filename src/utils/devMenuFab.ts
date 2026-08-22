import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

/**
 * Hides the expo-dev-menu floating "Tools" button in development builds.
 * The FAB defaults to the top-right corner of the screen — directly over the
 * header action buttons (Edit / Add note) — so taps open the DevMenu instead
 * of running the action (#977). The toggle stays available in the DevMenu.
 */
export function hideDevMenuFloatingActionButton(): void {
  if (!__DEV__ || Platform.OS !== 'ios') return;
  try {
    requireNativeModule('DevMenuPreferences')
      .setPreferencesAsync({ showFloatingActionButton: false })
      .catch(() => undefined);
  } catch {
    // DevMenuPreferences is only registered by expo-dev-menu.
  }
}
