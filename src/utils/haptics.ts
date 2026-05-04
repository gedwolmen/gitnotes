import * as Haptics from 'expo-haptics';

export const HapticService = {
  light: async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (error) { void error;}
  },
  medium: async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (error) { void error;}
  },
  heavy: async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch (error) { void error;}
  },
  success: async () => {
    try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (error) { void error;}
  },
  warning: async () => {
    try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch (error) { void error;}
  },
  error: async () => {
    try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch (error) { void error;}
  },
  selection: async () => {
    try { await Haptics.selectionAsync(); } catch (error) { void error;}
  },
};

export default HapticService;