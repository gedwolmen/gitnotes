import * as Haptics from 'expo-haptics';

export const HapticService = {
  light: async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
  },
  medium: async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
  },
  heavy: async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
  },
  success: async () => {
    try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
  },
  warning: async () => {
    try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
  },
  error: async () => {
    try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
  },
  selection: async () => {
    try { await Haptics.selectionAsync(); } catch {}
  },
};

export default HapticService;