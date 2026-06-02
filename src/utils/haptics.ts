import * as Haptics from 'expo-haptics';

export const HapticService = {
  light: async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (error) { console.warn('[Haptics] light failed:', error); }
  },
  medium: async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (error) { console.warn('[Haptics] medium failed:', error); }
  },
  heavy: async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch (error) { console.warn('[Haptics] heavy failed:', error); }
  },
  success: async () => {
    try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (error) { console.warn('[Haptics] success failed:', error); }
  },
  warning: async () => {
    try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch (error) { console.warn('[Haptics] warning failed:', error); }
  },
  error: async () => {
    try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch (error) { console.warn('[Haptics] error failed:', error); }
  },
  selection: async () => {
    try { await Haptics.selectionAsync(); } catch (error) { console.warn('[Haptics] selection failed:', error); }
  },
};

export default HapticService;